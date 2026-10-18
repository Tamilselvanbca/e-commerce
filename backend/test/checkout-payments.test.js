import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import Stripe from 'stripe';
import { expireStaleOrders } from '../src/services/orders.js';
import { createAddress, login, newAgent, pool, query, queryOne, resetDb, stock } from './helpers.js';

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

let fx;
let agent;
let address;

before(async () => {
  fx = await resetDb();
});
after(() => pool.end());

beforeEach(async () => {
  await query(`UPDATE product_variants SET stock = CASE sku WHEN 'TT-M-BLK' THEN 5 WHEN 'TT-L-BLK' THEN 1 WHEN 'TB-NAT' THEN 10 ELSE 0 END`);
  agent = newAgent();
  await login(agent, `98765${String(crypto.randomInt(10000, 99999))}`);
  address = await createAddress(agent);
});

async function checkout(gateway, items = [[fx.variants.teeM, 2]]) {
  for (const [variantId, quantity] of items) {
    await agent.post('/api/cart/items').send({ variantId, quantity }).expect(200);
  }
  return agent.post('/api/checkout').send({ addressId: address.id, gateway, email: 'buyer@example.com' });
}

describe('checkout', () => {
  test('summary applies the shipping fee below the free-shipping threshold', async () => {
    await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 1 }).expect(200);
    const res = await agent.get('/api/checkout/summary').expect(200);
    assert.equal(res.body.subtotal, 50000);
    assert.equal(res.body.shippingFee, 4900);
    assert.equal(res.body.total, 54900);
    assert.deepEqual(res.body.gateways, ['razorpay', 'stripe', 'mock']);
  });

  test('requires login and a non-empty cart', async () => {
    await newAgent().post('/api/checkout').send({ addressId: address.id, gateway: 'mock' }).expect(401);
    const res = await agent.post('/api/checkout').send({ addressId: address.id, gateway: 'mock', email: 'a@b.co' }).expect(409);
    assert.equal(res.body.error.code, 'CART_EMPTY');
  });

  test('mock payment: reserves stock, confirms order, clears cart, idempotent', async () => {
    const res = await checkout('mock', [[fx.variants.teeM, 2], [fx.variants.teeL, 1]]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { order, payment } = res.body;
    assert.equal(order.status, 'pending');
    assert.equal(order.total, 150000); // free shipping above ₹999
    assert.equal(order.canPay, true);
    assert.equal(payment.gateway, 'mock');
    assert.equal(await stock(fx.variants.teeM), 3);
    assert.equal(await stock(fx.variants.teeL), 0);

    const paid = await agent
      .post('/api/payments/mock/complete')
      .send({ orderNumber: order.orderNumber, mockPaymentId: payment.mockPaymentId, outcome: 'success' })
      .expect(200);
    assert.equal(paid.body.order.status, 'confirmed');
    assert.equal(paid.body.order.paymentStatus, 'paid');
    assert.equal(paid.body.order.canPay, false);

    const cart = await agent.get('/api/cart').expect(200);
    assert.equal(cart.body.itemCount, 0);

    // Completing twice changes nothing.
    await agent
      .post('/api/payments/mock/complete')
      .send({ orderNumber: order.orderNumber, mockPaymentId: payment.mockPaymentId, outcome: 'success' })
      .expect(200);
    assert.equal(await stock(fx.variants.teeM), 3);
    const history = await query('SELECT status FROM order_status_history WHERE order_id = $1', [order.id]);
    assert.deepEqual(history.map((h) => h.status), ['pending', 'confirmed']);

    const list = await agent.get('/api/orders').expect(200);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0].itemCount, 3);

    // Another user cannot read this order.
    const stranger = newAgent();
    await login(stranger, '9876511111');
    await stranger.get(`/api/orders/${order.orderNumber}`).expect(404);
  });

  test('out-of-stock items are rejected with details', async () => {
    await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 3 }).expect(200);
    await query('UPDATE product_variants SET stock = 1 WHERE id = $1', [fx.variants.teeM]);
    const res = await agent.post('/api/checkout').send({ addressId: address.id, gateway: 'mock', email: 'a@b.co' }).expect(409);
    assert.equal(res.body.error.code, 'OUT_OF_STOCK');
    assert.equal(res.body.error.details.items[0].available, 1);
    assert.equal(await stock(fx.variants.teeM), 1);
  });

  test('a new checkout cancels the previous unpaid order and releases its stock', async () => {
    const first = await checkout('mock');
    assert.equal(await stock(fx.variants.teeM), 3);
    const second = await agent.post('/api/checkout').send({ addressId: address.id, gateway: 'mock' }).expect(201);
    assert.equal(await stock(fx.variants.teeM), 3);
    const old = await agent.get(`/api/orders/${first.body.order.orderNumber}`).expect(200);
    assert.equal(old.body.status, 'cancelled');
    assert.equal(second.body.order.status, 'pending');
  });

  test('expired unpaid orders are cancelled and stock released', async () => {
    const res = await checkout('mock');
    await query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [res.body.order.id]);
    const n = await expireStaleOrders();
    assert.equal(n, 1);
    assert.equal(await stock(fx.variants.teeM), 5);
    const order = await agent.get(`/api/orders/${res.body.order.orderNumber}`).expect(200);
    assert.equal(order.body.status, 'cancelled');
    assert.equal(order.body.canPay, false);
    await agent.post(`/api/orders/${res.body.order.orderNumber}/pay`).send({ gateway: 'mock' }).expect(409);
  });

  test('a customer can cancel an unpaid order', async () => {
    const res = await checkout('mock');
    const cancelled = await agent.post(`/api/orders/${res.body.order.orderNumber}/cancel`).expect(200);
    assert.equal(cancelled.body.order.status, 'cancelled');
    assert.equal(await stock(fx.variants.teeM), 5);
  });

  test('a failed payment keeps the order payable and it can be retried', async () => {
    const res = await checkout('mock');
    const failed = await agent
      .post('/api/payments/mock/complete')
      .send({ orderNumber: res.body.order.orderNumber, mockPaymentId: res.body.payment.mockPaymentId, outcome: 'failure' })
      .expect(200);
    assert.equal(failed.body.order.paymentStatus, 'failed');
    assert.equal(failed.body.order.canPay, true);
    const retry = await agent.post(`/api/orders/${res.body.order.orderNumber}/pay`).send({ gateway: 'mock' }).expect(200);
    const paid = await agent
      .post('/api/payments/mock/complete')
      .send({ orderNumber: res.body.order.orderNumber, mockPaymentId: retry.body.payment.mockPaymentId, outcome: 'success' })
      .expect(200);
    assert.equal(paid.body.order.paymentStatus, 'paid');
  });
});

describe('razorpay', () => {
  const realFetch = globalThis.fetch;
  let created;
  beforeEach(() => {
    created = [];
    // Stub the Razorpay Orders API.
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.razorpay.com/v1/orders')) {
        const body = JSON.parse(init.body);
        const id = `order_test${created.length + 1}${crypto.randomInt(1e6)}`;
        created.push({ id, ...body });
        return new Response(JSON.stringify({ id, amount: body.amount, currency: body.currency, status: 'created' }), { status: 200 });
      }
      return realFetch(url, init);
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('checkout returns Razorpay checkout options; signature is verified', async () => {
    const res = await checkout('razorpay');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { order, payment } = res.body;
    assert.equal(payment.gateway, 'razorpay');
    assert.equal(payment.keyId, 'rzp_test_key');
    assert.equal(payment.amount, order.total);
    assert.equal(created[0].amount, order.total);
    assert.equal(created[0].receipt, order.orderNumber);

    const base = { orderNumber: order.orderNumber, razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: 'pay_test_1' };
    const bad = await agent.post('/api/payments/razorpay/verify').send({ ...base, razorpaySignature: 'deadbeef' }).expect(400);
    assert.equal(bad.body.error.code, 'PAYMENT_VERIFICATION_FAILED');

    const signature = hmac('rzp_test_secret', `${payment.razorpayOrderId}|pay_test_1`);
    const ok = await agent.post('/api/payments/razorpay/verify').send({ ...base, razorpaySignature: signature }).expect(200);
    assert.equal(ok.body.order.paymentStatus, 'paid');
    assert.equal(ok.body.order.paymentGateway, 'razorpay');
  });

  test('gateway failure cancels the new order and keeps the cart', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { description: 'Authentication failed' } }), { status: 401 });
    const res = await checkout('razorpay');
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'GATEWAY_ERROR');
    assert.equal(await stock(fx.variants.teeM), 5);
    const cart = await agent.get('/api/cart').expect(200);
    assert.equal(cart.body.itemCount, 2);
  });

  test('webhook payment.captured marks the order paid once; bad signatures are rejected', async () => {
    const res = await checkout('razorpay');
    const { order, payment } = res.body;
    const event = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_hook_1', order_id: payment.razorpayOrderId, amount: order.total, status: 'captured' } } },
    });

    await agent.post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'bad').send(event).expect(400);

    const sig = hmac('rzp_webhook_secret', event);
    for (let i = 0; i < 2; i++) {
      await agent
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', sig)
        .set('X-Razorpay-Event-Id', 'evt_1')
        .send(event)
        .expect(200);
    }
    const o = await agent.get(`/api/orders/${order.orderNumber}`).expect(200);
    assert.equal(o.body.paymentStatus, 'paid');
    const events = await queryOne(`SELECT count(*) FROM webhook_events WHERE event_id = 'evt_1'`);
    assert.equal(events.count, 1);
  });

  test('a payment arriving after expiry reinstates the order', async () => {
    const res = await checkout('razorpay');
    const { order, payment } = res.body;
    await query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [order.id]);
    await expireStaleOrders();
    assert.equal(await stock(fx.variants.teeM), 5);

    const signature = hmac('rzp_test_secret', `${payment.razorpayOrderId}|pay_late`);
    const ok = await agent
      .post('/api/payments/razorpay/verify')
      .send({ orderNumber: order.orderNumber, razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: 'pay_late', razorpaySignature: signature })
      .expect(200);
    assert.equal(ok.body.order.status, 'confirmed');
    assert.equal(await stock(fx.variants.teeM), 3);
  });
});

describe('stripe', () => {
  test('checkout.session.completed webhook marks the order paid', async () => {
    const res = await checkout('mock');
    const { order } = res.body;
    // Simulate a Stripe Checkout Session created for this order.
    await query(
      `INSERT INTO payments (order_id, gateway, gateway_order_id, amount, currency) VALUES ($1, 'stripe', 'cs_test_123', $2, 'INR')`,
      [order.id, order.total],
    );
    const payload = JSON.stringify({
      id: 'evt_stripe_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', object: 'checkout.session', payment_status: 'paid', amount_total: order.total, payment_intent: 'pi_123', metadata: { orderId: order.id } } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });

    await agent.post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', 't=1,v1=bad').send(payload).expect(400);
    await agent.post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload).expect(200);

    const o = await agent.get(`/api/orders/${order.orderNumber}`).expect(200);
    assert.equal(o.body.paymentStatus, 'paid');
    assert.equal(o.body.paymentGateway, 'stripe');
  });

  test('amount mismatch is not marked paid', async () => {
    const res = await checkout('mock');
    const { order } = res.body;
    await query(
      `INSERT INTO payments (order_id, gateway, gateway_order_id, amount, currency) VALUES ($1, 'stripe', 'cs_test_456', $2, 'INR')`,
      [order.id, order.total],
    );
    const payload = JSON.stringify({
      id: 'evt_stripe_2',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_456', payment_status: 'paid', amount_total: 100, metadata: { orderId: order.id } } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    await agent.post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload).expect(200);
    const o = await agent.get(`/api/orders/${order.orderNumber}`).expect(200);
    assert.equal(o.body.paymentStatus, 'pending');
  });
});
