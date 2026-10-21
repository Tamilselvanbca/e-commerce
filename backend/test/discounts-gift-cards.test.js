import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createAddress, login, newAgent, pool, query, queryOne, resetDb, stock } from './helpers.js';

let fx;
let admin;
let agent;
let address;

before(async () => {
  fx = await resetDb();
  admin = newAgent();
  await login(admin, '9999999999', 'Owner');
});
after(() => pool.end());

beforeEach(async () => {
  await query('DELETE FROM orders');
  await query('DELETE FROM discounts');
  await query('DELETE FROM gift_cards');
  await query(`UPDATE product_variants SET stock = 10 WHERE sku IN ('TT-M-BLK', 'TB-NAT')`);
  agent = newAgent();
  await login(agent, `98765${String(crypto.randomInt(10000, 99999))}`);
  address = await createAddress(agent);
  // One Test Tee M: ₹500 + ₹49 shipping.
  await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 1 }).expect(200);
});

const discount = (body) =>
  admin
    .post('/api/admin/discounts')
    .send({ title: 'Offer', type: 'percent', value: 10, ...body })
    .expect(201)
    .then((r) => r.body);
const summary = (query = {}) => agent.get('/api/checkout/summary').query(query).expect(200).then((r) => r.body);
const placeOrder = (body) => agent.post('/api/checkout').send({ addressId: address.id, gateway: 'mock', email: 'b@example.com', ...body });
const payMock = (res) =>
  agent
    .post('/api/payments/mock/complete')
    .send({ orderNumber: res.body.order.orderNumber, mockPaymentId: res.body.payment.mockPaymentId, outcome: 'success' })
    .expect(200);
const issueCard = (amount, extra = {}) =>
  admin
    .post('/api/admin/gift-cards')
    .send({ amount, recipientName: 'Asha', recipientEmail: 'asha@example.com', ...extra })
    .expect(201)
    .then((r) => r.body);

describe('discount codes', () => {
  test('a percent code is previewed, applied at checkout and limited per customer', async () => {
    await discount({ code: 'save10', perCustomerLimit: 1 });

    const preview = await summary({ couponCode: 'Save10' });
    assert.equal(preview.discount, 5000);
    assert.equal(preview.total, 54900 - 5000);
    assert.deepEqual(preview.coupon, { code: 'SAVE10', applied: true, message: null });
    assert.equal(preview.appliedDiscount.code, 'SAVE10');

    const missing = await summary({ couponCode: 'NOPE' });
    assert.equal(missing.discount, 0);
    assert.equal(missing.coupon.applied, false);
    assert.match(missing.coupon.message, /doesn't exist/);

    const res = await placeOrder({ couponCode: 'SAVE10' }).expect(201);
    assert.equal(res.body.order.discount, 5000);
    assert.equal(res.body.order.discountCode, 'SAVE10');
    assert.equal(res.body.order.amountDue, 49900);
    assert.equal(res.body.payment.amount, 49900);
    await payMock(res);

    await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 1 }).expect(200);
    const again = await summary({ couponCode: 'SAVE10' });
    assert.equal(again.coupon.applied, false);
    assert.match(again.coupon.message, /already used/);
  });

  test('minimum order, caps, free shipping and region rules', async () => {
    await discount({ code: 'BIG', type: 'fixed', value: 10000, minSubtotal: 100000 });
    await discount({ code: 'CAP', value: 50, maxDiscount: 2000 });
    await discount({ code: 'SHIPFREE', type: 'free_shipping' });
    await discount({ code: 'ABROAD', region: 'international' });

    assert.match((await summary({ couponCode: 'BIG' })).coupon.message, /Add ₹500\.00 more/);
    assert.equal((await summary({ couponCode: 'CAP' })).discount, 2000);
    const ship = await summary({ couponCode: 'SHIPFREE' });
    assert.equal(ship.discount, 4900);
    assert.equal(ship.total, 50000);
    assert.match((await summary({ couponCode: 'ABROAD' })).coupon.message, /outside India/);
  });

  test('expired and scheduled codes are refused', async () => {
    await discount({ code: 'OLD', endsAt: new Date(Date.now() - 60_000).toISOString() });
    await discount({ code: 'SOON', startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    assert.match((await summary({ couponCode: 'OLD' })).coupon.message, /expired/);
    assert.match((await summary({ couponCode: 'SOON' })).coupon.message, /not active yet/);
  });

  test('an invalid code at checkout is rejected without creating an order', async () => {
    const res = await placeOrder({ couponCode: 'MISSING' }).expect(409);
    assert.equal(res.body.error.code, 'COUPON_INVALID');
    assert.equal((await query('SELECT id FROM orders')).length, 0);
    assert.equal(await stock(fx.variants.teeM), 10);
  });

  test('usage limits count open orders and free up when an order is cancelled', async () => {
    await discount({ code: 'ONCE', usageLimit: 1 });
    const first = await placeOrder({ couponCode: 'ONCE' }).expect(201);

    const other = newAgent();
    await login(other, '9876512121');
    await other.post('/api/cart/items').send({ variantId: fx.variants.bag, quantity: 1 }).expect(200);
    const blocked = await other.get('/api/checkout/summary').query({ couponCode: 'ONCE' }).expect(200);
    assert.match(blocked.body.coupon.message, /fully redeemed/);

    await agent.post(`/api/orders/${first.body.order.orderNumber}/cancel`).expect(200);
    const freed = await other.get('/api/checkout/summary').query({ couponCode: 'ONCE' }).expect(200);
    assert.equal(freed.body.coupon.applied, true);
  });
});

describe('offers list', () => {
  test('shows running automatic offers and the coupons marked to show, with eligibility for the cart', async () => {
    await discount({ code: 'BIG10', title: '10% off big orders', minSubtotal: 250000, maxDiscount: 30000 });
    await discount({ code: 'FLAT50', title: 'Flat ₹50 off', type: 'fixed', value: 5000 });
    await discount({ code: 'STAFF', title: 'Staff only', showInOffers: false });
    await discount({ code: 'OLD', title: 'Expired', endsAt: new Date(Date.now() - 60_000).toISOString() });
    await discount({ code: null, title: 'Free delivery over ₹400', type: 'free_shipping', value: 0, minSubtotal: 40000 });

    const listed = (await newAgent().get('/api/offers').expect(200)).body.items;
    assert.deepEqual(listed.map((o) => o.code ?? o.title).sort(), ['BIG10', 'FLAT50', 'Free delivery over ₹400']);
    assert.equal(listed.find((o) => o.code === 'BIG10').minSubtotal, 250000);

    // Cart: one ₹500 tee + ₹49 shipping.
    const { offers } = await summary();
    const by = Object.fromEntries(offers.map((o) => [o.code ?? 'auto', o]));
    assert.deepEqual(Object.keys(by).sort(), ['BIG10', 'FLAT50', 'auto']);
    assert.deepEqual([by.FLAT50.eligible, by.FLAT50.saving], [true, 5000]);
    assert.deepEqual([by.auto.eligible, by.auto.saving], [true, 4900]);
    assert.deepEqual([by.BIG10.eligible, by.BIG10.remaining], [false, 200000]);
    assert.equal(offers.at(-1).code, 'BIG10'); // eligible ones first

    // Clicking Apply on a listed coupon is the same as typing it.
    const applied = await summary({ couponCode: 'FLAT50' });
    assert.equal(applied.coupon.applied, true);
    assert.equal(applied.discount, 5000);

    // Four more tees (5 × ₹500 = ₹2,500) unlock the big-order coupon.
    await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 4 }).expect(200);
    const big = (await summary()).offers.find((o) => o.code === 'BIG10');
    assert.deepEqual([big.eligible, big.saving], [true, 25000]);
  });

  test("leaves out coupons the customer can't use any more", async () => {
    await discount({ code: 'ONCE', title: 'Welcome', type: 'fixed', value: 1000, perCustomerLimit: 1 });
    assert.equal((await summary()).offers.length, 1);
    await placeOrder({ couponCode: 'ONCE' }).expect(201);
    assert.equal((await summary()).offers.length, 0);
  });
});

describe('automatic offers', () => {
  test('apply without a code; the bigger saving wins over a typed code', async () => {
    await discount({ code: null, title: 'Festive offer', value: 5 });
    await discount({ code: 'TEN', value: 10 });
    await discount({ code: 'TINY', type: 'fixed', value: 1000 });

    const auto = await summary();
    assert.equal(auto.discount, 2500);
    assert.equal(auto.appliedDiscount.title, 'Festive offer');
    assert.equal(auto.appliedDiscount.automatic, true);

    const better = await summary({ couponCode: 'TEN' });
    assert.equal(better.discount, 5000);
    assert.equal(better.coupon.applied, true);

    const worse = await summary({ couponCode: 'TINY' });
    assert.equal(worse.discount, 2500);
    assert.equal(worse.coupon.applied, false);
    assert.match(worse.coupon.message, /Festive offer saves you more/);

    // Checkout with the outranked code still succeeds with the automatic offer.
    const res = await placeOrder({ couponCode: 'TINY' }).expect(201);
    assert.equal(res.body.order.discount, 2500);
    assert.equal(res.body.order.discountTitle, 'Festive offer');
    assert.equal(res.body.order.discountCode, null);
  });

  test('suggests how much more unlocks an offer', async () => {
    await discount({ code: null, title: 'Big basket', type: 'fixed', value: 15000, minSubtotal: 150000 });
    const res = await summary();
    assert.equal(res.discount, 0);
    assert.deepEqual(res.offerHint, { title: 'Big basket', remaining: 100000 });
  });
});

describe('gift cards', () => {
  test('issue, check balance, part-pay an order and get the balance back on cancel', async () => {
    const card = await issueCard(20000);
    assert.match(card.code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    assert.equal(card.balance, 20000);
    assert.equal(card.emailed, true);

    const balance = await newAgent().post('/api/gift-cards/balance').send({ code: card.code.toLowerCase() }).expect(200);
    assert.equal(balance.body.balance, 20000);
    assert.equal(balance.body.usable, true);
    assert.ok(!balance.body.code.includes(card.code.slice(0, 4)));

    const preview = await summary({ giftCardCode: card.code });
    assert.equal(preview.giftCardAmount, 20000);
    assert.equal(preview.amountDue, 54900 - 20000);

    const res = await placeOrder({ giftCardCode: card.code }).expect(201);
    assert.equal(res.body.order.giftCardAmount, 20000);
    assert.equal(res.body.order.amountDue, 34900);
    assert.equal(res.body.order.giftCard.code, `••••-${card.code.slice(-4)}`);
    assert.equal(res.body.payment.amount, 34900);
    assert.equal((await queryOne('SELECT balance FROM gift_cards WHERE id = $1', [card.id])).balance, 0);

    await agent.post(`/api/orders/${res.body.order.orderNumber}/cancel`).expect(200);
    assert.equal((await queryOne('SELECT balance FROM gift_cards WHERE id = $1', [card.id])).balance, 20000);
    const detail = await admin.get(`/api/admin/gift-cards/${card.id}`).expect(200);
    assert.deepEqual(detail.body.transactions.map((t) => [t.kind, t.amount]), [['refund', 20000], ['redeem', -20000], ['issue', 20000]]);
  });

  test('a card covering the whole order pays it without a gateway', async () => {
    const card = await issueCard(100000, { sendEmail: false, recipientEmail: null });
    const res = await placeOrder({ giftCardCode: card.code, gateway: 'gift_card' }).expect(201);
    assert.equal(res.body.payment.gateway, 'gift_card');
    assert.equal(res.body.order.paymentStatus, 'paid');
    assert.equal(res.body.order.status, 'confirmed');
    assert.equal(res.body.order.amountDue, 0);
    assert.equal((await queryOne('SELECT balance FROM gift_cards WHERE id = $1', [card.id])).balance, 100000 - 54900);
    const cart = await agent.get('/api/cart').expect(200);
    assert.equal(cart.body.items.length, 0);
  });

  test('never leaves less than ₹1 for the gateway; gift_card gateway needs full cover', async () => {
    const card = await issueCard(54850, { sendEmail: false });
    const preview = await summary({ giftCardCode: card.code });
    assert.equal(preview.giftCardAmount, 54800);
    assert.equal(preview.amountDue, 100);

    const res = await placeOrder({ giftCardCode: card.code, gateway: 'gift_card' }).expect(409);
    assert.equal(res.body.error.code, 'GIFT_CARD_INSUFFICIENT');
    // The attempt was cancelled and the balance restored.
    assert.equal((await queryOne('SELECT balance FROM gift_cards WHERE id = $1', [card.id])).balance, 54850);
    assert.equal(await stock(fx.variants.teeM), 10);
  });

  test('discount and gift card together', async () => {
    await discount({ code: 'TEN', value: 10 });
    const card = await issueCard(10000, { sendEmail: false });
    const res = await placeOrder({ couponCode: 'TEN', giftCardCode: card.code }).expect(201);
    assert.equal(res.body.order.total, 54900 - 5000);
    assert.equal(res.body.order.amountDue, 54900 - 5000 - 10000);
    await payMock(res);
    const order = await agent.get(`/api/orders/${res.body.order.orderNumber}`).expect(200);
    assert.equal(order.body.paymentStatus, 'paid');
  });

  test('disabled cards are refused; admins can adjust balances', async () => {
    const card = await issueCard(5000, { sendEmail: false });
    await admin.post(`/api/admin/gift-cards/${card.id}/adjust`).send({ amount: -6000, note: 'Too much' }).expect(400);
    const topped = await admin.post(`/api/admin/gift-cards/${card.id}/adjust`).send({ amount: 2500, note: 'Goodwill' }).expect(200);
    assert.equal(topped.body.balance, 7500);

    await admin.patch(`/api/admin/gift-cards/${card.id}`).send({ isActive: false }).expect(200);
    const preview = await summary({ giftCardCode: card.code });
    assert.equal(preview.giftCard.applied, false);
    assert.match(preview.giftCard.message, /disabled/);
    const res = await placeOrder({ giftCardCode: card.code }).expect(409);
    assert.equal(res.body.error.code, 'GIFT_CARD_INVALID');
  });
});

describe('buying gift cards online', () => {
  const buy = (body) =>
    agent
      .post('/api/gift-cards/purchase')
      .send({ amount: 100000, recipientName: 'Meena', recipientEmail: 'Meena@Example.com', message: 'Happy Diwali!', gateway: 'mock', email: 'buyer@example.com', ...body });

  test('validates the request and requires login', async () => {
    await newAgent().post('/api/gift-cards/purchase').send({ amount: 100000 }).expect(401);
    let res = await buy({ amount: 5000 }).expect(400);
    assert.equal(res.body.error.details[0].path, 'amount');
    res = await buy({ amount: 100050 }).expect(400);
    assert.match(res.body.error.message, /whole rupee/);
    res = await buy({ recipientEmail: 'nope' }).expect(400);
    assert.equal(res.body.error.details[0].path, 'recipientEmail');
  });

  test('paying issues the card once, marks the order delivered and the card works at checkout', async () => {
    const res = await buy().expect(201);
    const { order, payment } = res.body;
    assert.equal(order.kind, 'gift_card');
    assert.equal(order.shippingAddress, null);
    assert.equal(order.total, 100000);
    assert.equal(payment.amount, 100000);
    assert.equal(order.items[0].giftCard.recipientEmail, 'meena@example.com');
    assert.equal(order.items[0].giftCard.code, null);
    assert.equal((await query('SELECT id FROM gift_cards')).length, 0);

    // The cart (Test Tee M from beforeEach) is untouched and the stale-order sweep ignores this order.
    const cart = await agent.get('/api/cart').expect(200);
    assert.equal(cart.body.items.length, 1);

    await payMock(res);
    await payMock(res); // a repeated confirmation must not issue a second card
    const cards = await query('SELECT initial_balance, balance, recipient_email, message, expires_at FROM gift_cards');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].initialBalance, 100000);
    assert.equal(cards[0].recipientEmail, 'meena@example.com');
    assert.equal(cards[0].message, 'Happy Diwali!');
    assert.ok(new Date(cards[0].expiresAt) > new Date(Date.now() + 360 * 86_400_000));

    const mine = await agent.get(`/api/orders/${order.orderNumber}`).expect(200);
    assert.equal(mine.body.status, 'delivered');
    assert.equal(mine.body.paymentStatus, 'paid');
    assert.match(mine.body.items[0].giftCard.code, /^••••-[A-Z2-9]{4}$/);

    const adminView = await admin.get(`/api/admin/orders/${order.orderNumber}`).expect(200);
    const fullCode = adminView.body.items[0].giftCard.code;
    assert.match(fullCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    assert.ok(adminView.body.items[0].giftCard.id);

    const preview = await summary({ giftCardCode: fullCode });
    assert.equal(preview.giftCardAmount, 54900);
    assert.equal(preview.amountDue, 0);
  });

  test('an unpaid gift card order expires cleanly', async () => {
    const res = await buy().expect(201);
    await query(`UPDATE orders SET expires_at = NOW(3) - INTERVAL 1 MINUTE WHERE id = $1`, [res.body.order.id]);
    const { expireStaleOrders } = await import('../src/services/orders.js');
    assert.equal(await expireStaleOrders(), 1);
    const order = await agent.get(`/api/orders/${res.body.order.orderNumber}`).expect(200);
    assert.equal(order.body.status, 'cancelled');
    assert.equal((await query('SELECT id FROM gift_cards')).length, 0);
  });
});

describe('admin discounts', () => {
  test('validates input, rejects duplicate codes and protects used discounts', async () => {
    let res = await admin.post('/api/admin/discounts').send({ code: 'X1Y', title: 'Bad', type: 'percent', value: 150 }).expect(400);
    assert.equal(res.body.error.details[0].path, 'value');
    res = await admin.post('/api/admin/discounts').send({ code: 'A B', title: 'Bad', type: 'fixed', value: 500 }).expect(400);
    assert.equal(res.body.error.details[0].path, 'code');

    const d = await discount({ code: 'DIWALI' });
    res = await admin.post('/api/admin/discounts').send({ code: 'diwali', title: 'Again', type: 'percent', value: 5 }).expect(409);
    assert.equal(res.body.error.code, 'CODE_TAKEN');

    await placeOrder({ couponCode: 'DIWALI' }).expect(201);
    const list = await admin.get('/api/admin/discounts').expect(200);
    assert.equal(list.body.items[0].timesUsed, 1);
    res = await admin.delete(`/api/admin/discounts/${d.id}`).expect(409);
    assert.equal(res.body.error.code, 'DISCOUNT_IN_USE');

    const off = await admin.patch(`/api/admin/discounts/${d.id}`).send({ isActive: false }).expect(200);
    assert.equal(off.body.isActive, false);
    const unused = await discount({ code: 'SPARE' });
    await admin.delete(`/api/admin/discounts/${unused.id}`).expect(204);

    await agent.get('/api/admin/discounts').expect(403);
  });
});
