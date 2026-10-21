import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { courierStage } from '../src/services/shiprocket.js';
import { syncShiprocketTracking } from '../src/services/shipments.js';
import { createAddress, login, newAgent, pool, query, queryOne, resetDb } from './helpers.js';

let fx;
let admin;
let customer;

before(async () => {
  fx = await resetDb();
  admin = newAgent();
  await login(admin, '9999999999', 'Owner');
  customer = newAgent();
  await login(customer, '9876533333', 'Priya Raman');
});
after(() => pool.end());

async function paidOrder() {
  const address = await createAddress(customer);
  await customer.post('/api/cart/items').send({ variantId: fx.variants.bag, quantity: 1 }).expect(200);
  const res = await customer.post('/api/checkout').send({ addressId: address.id, gateway: 'mock', email: 'priya@example.com' }).expect(201);
  await customer
    .post('/api/payments/mock/complete')
    .send({ orderNumber: res.body.order.orderNumber, mockPaymentId: res.body.payment.mockPaymentId, outcome: 'success' })
    .expect(200);
  return res.body.order.orderNumber;
}

// A stand-in for the Shiprocket API: records calls; `sr` sets what it answers.
const realFetch = globalThis.fetch;
let calls;
let sr;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  sr = { assignFails: false, tracking: 'PICKED UP' };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.host !== 'apiv2.shiprocket.in') return realFetch(url, init);
    const path = u.pathname.replace('/v1/external', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body, query: Object.fromEntries(u.searchParams) });
    if (path === '/auth/login') return json({ token: 'test-token' });
    if (path === '/settings/company/pickup') {
      return json({ data: { shipping_address: [{ pickup_location: 'Home', address: '4 Temple St', city: 'Madurai', state: 'Tamil Nadu', pin_code: 625001 }] } });
    }
    if (path === '/courier/serviceability/') {
      return json({
        data: {
          available_courier_companies: [
            { courier_company_id: 10, courier_name: 'Delhivery Surface', rate: 85.5, etd: 'Oct 25, 2026', estimated_delivery_days: '3', rating: 4.2 },
            { courier_company_id: 12, courier_name: 'Xpressbees', rate: 60, etd: 'Oct 26, 2026', estimated_delivery_days: '4' },
          ],
          shiprocket_recommended_courier_id: 10,
        },
      });
    }
    if (path === '/orders/create/adhoc') return json({ order_id: 555, shipment_id: 777, status: 'NEW' });
    if (path === '/courier/assign/awb') {
      if (sr.assignFails) return json({ message: 'Insufficient balance in your wallet. Please recharge.', status_code: 350 }, 400);
      return json({ awb_assign_status: 1, response: { data: { awb_code: 'AWB123', courier_name: 'Delhivery Surface' } } });
    }
    if (path === '/courier/generate/pickup') return json({ pickup_status: 1, response: { pickup_scheduled_date: '2026-10-22 10:00:00' } });
    if (path === '/courier/generate/label') return json({ label_created: 1, label_url: 'https://labels.example/777.pdf' });
    if (path.startsWith('/courier/track/awb/')) {
      return json({
        tracking_data: {
          track_status: 1,
          shipment_track: [{ current_status: sr.tracking, edd: '2026-10-25 18:00:00' }],
          shipment_track_activities: [{ date: '2026-10-22 12:00:00', status: 'X', activity: 'Shipment picked up', location: 'Madurai', 'sr-status-label': sr.tracking }],
        },
      });
    }
    if (path === '/orders/cancel') return json({ status: 200 });
    return json({ message: `unexpected ${path}` }, 404);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const count = (path) => calls.filter((c) => c.path === path).length;

describe('shiprocket delivery flow', () => {
  before(async () => {
    await admin
      .put('/api/admin/settings')
      .send({
        values: {
          SHIPPING_PROVIDER: 'shiprocket',
          SHIPROCKET_EMAIL: 'api-user@example.com',
          SHIPROCKET_PASSWORD: 'api-user-pass',
          SHIPROCKET_PICKUP_LOCATION: 'Home',
        },
      })
      .expect(200);
  });

  test('pickup addresses and couriers with rates', async () => {
    const pickups = await admin.get('/api/admin/shipping/shiprocket/pickups').expect(200);
    assert.equal(pickups.body.items[0].name, 'Home');
    assert.equal(pickups.body.items[0].pincode, '625001');
    assert.equal(pickups.body.configured, 'Home');
    assert.equal(pickups.body.defaults.weight, 0.5);

    const number = await paidOrder();
    const couriers = await admin.get(`/api/admin/orders/${number}/shiprocket/couriers?weight=1.2`).expect(200);
    assert.deepEqual(couriers.body.couriers.map((c) => [c.id, c.rate]), [[12, 6000], [10, 8550]]);
    assert.equal(couriers.body.recommendedId, 10);
    const q = calls.find((c) => c.path === '/courier/serviceability/').query;
    assert.equal(q.pickup_postcode, '625001');
    assert.equal(q.delivery_postcode, '411001');
    assert.equal(q.weight, '1.2');
  });

  test('book → courier fails → retry → picked up → delivered', async () => {
    const number = await paidOrder();

    // The wallet is empty: the order is booked, the courier isn't.
    sr.assignFails = true;
    const booked = await admin.post(`/api/admin/orders/${number}/shiprocket`).send({ pickupLocation: 'Home', weight: 0.8 }).expect(200);
    assert.equal(booked.body.status, 'processing');
    assert.equal(booked.body.shipment.providerOrderId, '555');
    assert.equal(booked.body.shipment.awb, null);
    assert.match(booked.body.shipment.lastError, /wallet/i);
    const adhoc = calls.find((c) => c.path === '/orders/create/adhoc').body;
    assert.equal(adhoc.pickup_location, 'Home');
    assert.equal(adhoc.weight, 0.8);
    assert.equal(adhoc.length, 20); // store default
    assert.equal(adhoc.billing_email, 'priya@example.com');
    assert.equal(adhoc.billing_phone, '9876500001');
    // Customers don't see a booking that has no courier yet.
    const mine = await customer.get(`/api/orders/${number}`).expect(200);
    assert.equal(mine.body.shipment, null);

    // Retry carries on: no second Shiprocket order; courier, pickup and label.
    sr.assignFails = false;
    calls = [];
    const retried = await admin.post(`/api/admin/orders/${number}/shiprocket`).send({ courierId: 10 }).expect(200);
    assert.equal(count('/orders/create/adhoc'), 0);
    assert.equal(calls.find((c) => c.path === '/courier/assign/awb').body.courier_id, 10);
    assert.equal(retried.body.status, 'processing'); // waiting for the courier to collect it
    assert.equal(retried.body.shipment.awb, 'AWB123');
    assert.equal(retried.body.shipment.courier, 'Delhivery Surface');
    assert.equal(retried.body.shipment.labelUrl, 'https://labels.example/777.pdf');
    assert.equal(retried.body.shipment.pickupScheduled, '2026-10-22 10:00:00');
    assert.equal(retried.body.shipment.lastError, null);
    assert.match(retried.body.shipment.trackingUrl, /AWB123/);

    // Booking again does nothing more.
    calls = [];
    await admin.post(`/api/admin/orders/${number}/shiprocket`).send({}).expect(200);
    assert.deepEqual(calls.map((c) => c.path).filter((p) => p !== '/auth/login'), []);

    // The customer opens the order: the courier has it → shipped.
    const tracking = await customer.get(`/api/orders/${number}/tracking`).expect(200);
    assert.equal(tracking.body.orderStatus, 'shipped');
    assert.equal(tracking.body.shipment.trackingStatus, 'PICKED UP');
    assert.equal(tracking.body.shipment.expectedDelivery, '2026-10-25 18:00:00');
    assert.equal(tracking.body.events[0].activity, 'Shipment picked up');
    assert.equal(tracking.body.shipment.labelUrl, undefined); // admin only

    // The courier webhook: delivered (confirmed with Shiprocket, not taken from the request).
    sr.tracking = 'DELIVERED';
    await query('UPDATE shipments SET tracking_updated_at = NULL');
    await newAgent().post('/api/webhooks/courier').send({ awb: 'AWB123', current_status: 'DELIVERED' }).expect(200);
    let status;
    for (let i = 0; i < 40 && status !== 'delivered'; i++) {
      await sleep(50);
      status = (await queryOne('SELECT status FROM orders WHERE order_number = $1', [number])).status;
    }
    assert.equal(status, 'delivered');
    const done = await admin.get(`/api/admin/orders/${number}`).expect(200);
    assert.ok(done.body.shipment.shippedAt);
    assert.ok(done.body.shipment.deliveredAt);
    assert.deepEqual(
      done.body.statusHistory.map((h) => h.status),
      ['pending', 'confirmed', 'processing', 'processing', 'shipped', 'delivered'],
    );
  });

  test('webhook for an unknown AWB or a junk body is ignored', async () => {
    await newAgent().post('/api/webhooks/courier').send({ awb: 'NOPE' }).expect(200);
    await newAgent().post('/api/webhooks/courier').set('content-type', 'text/plain').send('not json').expect(200);
    await sleep(50);
    assert.equal(count('/courier/track/awb/NOPE'), 0);
  });

  test('background sync moves shipped orders on', async () => {
    const number = await paidOrder();
    await admin.post(`/api/admin/orders/${number}/shiprocket`).send({}).expect(200);
    sr.tracking = 'IN TRANSIT';
    assert.equal(await syncShiprocketTracking(), 1);
    assert.equal((await queryOne('SELECT status FROM orders WHERE order_number = $1', [number])).status, 'shipped');
    // Checked a moment ago: not again until the next round.
    assert.equal(await syncShiprocketTracking(), 0);

    const refreshed = await admin.post(`/api/admin/orders/${number}/shiprocket/track`).expect(200);
    assert.equal(refreshed.body.shipment.trackingStatus, 'IN TRANSIT');
  });

  test('cancelling a booked order cancels it in Shiprocket', async () => {
    const number = await paidOrder();
    await admin.post(`/api/admin/orders/${number}/shiprocket`).send({}).expect(200);
    const cancelled = await admin.patch(`/api/admin/orders/${number}/status`).send({ status: 'cancelled' }).expect(200);
    assert.equal(cancelled.body.status, 'cancelled');
    assert.deepEqual(calls.find((c) => c.path === '/orders/cancel').body, { ids: [555] });
    assert.ok(cancelled.body.statusHistory.some((h) => /Shiprocket order 555 cancelled/.test(h.note ?? '')));
  });

  test('a wrong pickup address name is explained', async () => {
    const number = await paidOrder();
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/orders/create/adhoc')) {
        return json({ message: 'Wrong Pickup location entered. Please choose one location from data array', data: { data: [{ pickup_location: 'Home' }] } }, 422);
      }
      return real(url, init);
    };
    const res = await admin.post(`/api/admin/orders/${number}/shiprocket`).send({ pickupLocation: 'Primary' }).expect(502);
    assert.match(res.body.error.message, /“Primary”.*Choose one of: Home/);
    assert.equal((await queryOne('SELECT count(*) AS n FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.order_number = $1', [number])).n, 0);
  });
});

test('addresses keep the map pin, and orders copy it', async () => {
  const base = { fullName: 'Priya Raman', phone: '9876533333', line1: '7 Gandhi St', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' };
  const half = await customer.post('/api/addresses').send({ ...base, latitude: 9.9252 }).expect(400);
  assert.match(half.body.error.message, /latitude/i);

  const pinned = await customer.post('/api/addresses').send({ ...base, latitude: 9.92520123, longitude: 78.11977 }).expect(201);
  assert.equal(pinned.body.latitude, 9.925201);
  assert.equal(pinned.body.longitude, 78.11977);

  // Editing other fields keeps the pin; null clears it.
  const edited = await customer.patch(`/api/addresses/${pinned.body.id}`).send({ landmark: 'Near the temple' }).expect(200);
  assert.equal(edited.body.latitude, 9.925201);

  await customer.post('/api/cart/items').send({ variantId: fx.variants.bag, quantity: 1 }).expect(200);
  const order = await customer.post('/api/checkout').send({ addressId: pinned.body.id, gateway: 'mock', email: 'priya@example.com' }).expect(201);
  assert.equal(order.body.order.shippingAddress.latitude, 9.925201);
  assert.equal(order.body.order.shippingAddress.longitude, 78.11977);

  const cleared = await customer.patch(`/api/addresses/${pinned.body.id}`).send({ latitude: null, longitude: null }).expect(200);
  assert.equal(cleared.body.latitude, null);
});

test('courier statuses map to the order journey', () => {
  assert.equal(courierStage('AWB ASSIGNED'), 'awaiting_pickup');
  assert.equal(courierStage('Out For Pickup'), 'awaiting_pickup');
  assert.equal(courierStage('PICKED UP'), 'in_transit');
  assert.equal(courierStage('IN TRANSIT'), 'in_transit');
  assert.equal(courierStage('OUT FOR DELIVERY'), 'in_transit');
  assert.equal(courierStage('UNDELIVERED'), 'in_transit');
  assert.equal(courierStage('Delivered'), 'delivered');
  assert.equal(courierStage('RTO DELIVERED'), 'returning');
  assert.equal(courierStage('CANCELED'), 'cancelled');
  assert.equal(courierStage(''), null);
});
