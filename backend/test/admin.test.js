import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createAddress, login, newAgent, pool, resetDb, stock } from './helpers.js';

let fx;
let admin;
let customer;

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

before(async () => {
  fx = await resetDb();
  admin = newAgent();
  await login(admin, '9999999999', 'Owner');
  customer = newAgent();
  await login(customer, '9876522222', 'Buyer');
});
after(() => pool.end());

async function paidOrder() {
  const address = await createAddress(customer);
  await customer.post('/api/cart/items').send({ variantId: fx.variants.bag, quantity: 1 }).expect(200);
  const res = await customer.post('/api/checkout').send({ addressId: address.id, gateway: 'mock', email: 'buyer@example.com' }).expect(201);
  await customer
    .post('/api/payments/mock/complete')
    .send({ orderNumber: res.body.order.orderNumber, mockPaymentId: res.body.payment.mockPaymentId, outcome: 'success' })
    .expect(200);
  return res.body.order.orderNumber;
}

describe('admin access', () => {
  test('customers and guests are refused', async () => {
    await newAgent().get('/api/admin/dashboard').expect(401);
    await customer.get('/api/admin/dashboard').expect(403);
  });
});

describe('admin orders', () => {
  test('status transitions, shipment, cancel and refund', async () => {
    const number = await paidOrder();
    const dashboard = await admin.get('/api/admin/dashboard?days=7').expect(200);
    assert.equal(dashboard.body.totals.paidOrders, 1);
    assert.equal(dashboard.body.totals.revenue, 120000 + 0); // above free-shipping threshold
    assert.equal(dashboard.body.revenueByDay.length, 7);
    assert.equal(dashboard.body.gatewaySplit[0].gateway, 'mock');

    const list = await admin.get('/api/admin/orders?status=confirmed').expect(200);
    assert.equal(list.body.items[0].orderNumber, number);
    assert.equal(list.body.items[0].customer.name, 'Buyer');

    const detail = await admin.get(`/api/admin/orders/${number}`).expect(200);
    assert.equal(detail.body.customer.phone, '+919876522222');
    assert.equal(detail.body.payments.length, 1);

    const invalid = await admin.patch(`/api/admin/orders/${number}/status`).send({ status: 'delivered' }).expect(400);
    assert.match(invalid.body.error.message, /Cannot change status/);

    await admin.patch(`/api/admin/orders/${number}/status`).send({ status: 'processing', note: 'Packing' }).expect(200);
    const shipped = await admin
      .post(`/api/admin/orders/${number}/shipment`)
      .send({ courier: 'Delhivery', awb: 'DL123456', trackingUrl: 'https://track.example/DL123456' })
      .expect(200);
    assert.equal(shipped.body.status, 'shipped');
    assert.equal(shipped.body.shipment.awb, 'DL123456');

    const tracking = await customer.get(`/api/orders/${number}/tracking`).expect(200);
    assert.equal(tracking.body.shipment.courier, 'Delhivery');

    const delivered = await admin.patch(`/api/admin/orders/${number}/status`).send({ status: 'delivered' }).expect(200);
    assert.ok(delivered.body.shipment.deliveredAt);

    // Shiprocket isn't configured in tests.
    const number2 = await paidOrder();
    const sr = await admin.post(`/api/admin/orders/${number2}/shiprocket`).send({}).expect(400);
    assert.match(sr.body.error.message, /Shiprocket is not configured/);

    const before = await stock(fx.variants.bag);
    await admin.patch(`/api/admin/orders/${number2}/payment`).send({ paymentStatus: 'refunded' }).expect(400);
    const cancelled = await admin.patch(`/api/admin/orders/${number2}/status`).send({ status: 'cancelled', note: 'Customer request' }).expect(200);
    assert.equal(cancelled.body.status, 'cancelled');
    assert.equal(await stock(fx.variants.bag), before + 1);
    const refunded = await admin.patch(`/api/admin/orders/${number2}/payment`).send({ paymentStatus: 'refunded' }).expect(200);
    assert.equal(refunded.body.paymentStatus, 'refunded');
  });
});

describe('admin catalog', () => {
  test('upload, create, update and archive a product', async () => {
    const upload = await admin.post('/api/admin/uploads').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(201);
    assert.match(upload.body.url, /^\/uploads\/products\/.+\.png$/);
    await admin.post('/api/admin/uploads').attach('file', Buffer.from('<svg/>'), { filename: 'x.png', contentType: 'image/png' }).expect(400);

    const body = {
      name: 'Linen Shirt',
      description: 'Breathable',
      categoryId: fx.categoryId,
      status: 'active',
      isFeatured: false,
      variants: [
        { sku: 'LS-M', size: 'M', color: 'Sage', colorHex: '#9CAF88', price: 149900, compareAtPrice: 199900, stock: 4, isActive: true },
        { sku: 'LS-L', size: 'L', color: 'Sage', colorHex: '#9CAF88', price: 149900, compareAtPrice: null, stock: 0, isActive: true },
      ],
      images: [{ url: upload.body.url, key: upload.body.key, alt: 'Front' }],
    };
    const created = await admin.post('/api/admin/products').send(body).expect(201);
    assert.equal(created.body.slug, 'linen-shirt');
    assert.equal(created.body.variants.length, 2);

    const dup = await admin.post('/api/admin/products').send({ ...body, name: 'Linen Shirt Copy' }).expect(400);
    assert.equal(dup.body.error.details[0].path, 'variants.0.sku');

    const sameName = await admin
      .post('/api/admin/products')
      .send({ ...body, variants: body.variants.map((v) => ({ ...v, sku: `${v.sku}-2` })) })
      .expect(201);
    assert.equal(sameName.body.slug, 'linen-shirt-2');

    const bad = await admin.post('/api/admin/products').send({ ...body, variants: [{ ...body.variants[0], price: 100, compareAtPrice: 50 }] }).expect(400);
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR');

    const [m] = created.body.variants;
    const updated = await admin
      .put(`/api/admin/products/${created.body.id}`)
      .send({
        ...body,
        name: 'Linen Shirt Pro',
        slug: 'linen-shirt',
        variants: [{ ...body.variants[0], id: m.id, stock: 10 }, { sku: 'LS-XL', size: 'XL', color: 'Sage', colorHex: null, price: 159900, compareAtPrice: null, stock: 2, isActive: true }],
        images: [],
      })
      .expect(200);
    assert.equal(updated.body.name, 'Linen Shirt Pro');
    assert.deepEqual(updated.body.variants.map((v) => v.sku), ['LS-M', 'LS-XL']);
    assert.equal(updated.body.variants[0].stock, 10);
    assert.equal(updated.body.images.length, 0);

    const list = await admin.get('/api/admin/products?q=LS-XL').expect(200);
    assert.equal(list.body.items[0].id, created.body.id);
    assert.equal(list.body.items[0].totalStock, 12);

    await admin.delete(`/api/admin/products/${created.body.id}`).expect(204);
    await newAgent().get('/api/products/linen-shirt').expect(404);
  });

  test('categories reject cycles', async () => {
    const parent = await admin.post('/api/admin/categories').send({ name: 'Parent' }).expect(201);
    const child = await admin.post('/api/admin/categories').send({ name: 'Child', parentId: parent.body.id }).expect(201);
    await admin.put(`/api/admin/categories/${parent.body.id}`).send({ name: 'Parent', parentId: child.body.id }).expect(400);
    const list = await admin.get('/api/admin/categories').expect(200);
    assert.ok(list.body.items.some((c) => c.slug === 'child' && c.parentId === parent.body.id));
  });
});

describe('admin users and enquiries', () => {
  test('block a user (signs them out) and protect self', async () => {
    const users = await admin.get('/api/admin/users?q=Buyer').expect(200);
    const buyer = users.body.items[0];
    assert.equal(buyer.orderCount >= 1, true);

    const victim = newAgent();
    const u = await login(victim, '9876533333');
    await admin.patch(`/api/admin/users/${u.id}`).send({ isBlocked: true }).expect(200);
    assert.equal((await victim.get('/api/auth/me').expect(200)).body.user, null);

    const me = (await admin.get('/api/auth/me')).body.user;
    await admin.patch(`/api/admin/users/${me.id}`).send({ role: 'customer' }).expect(400);

    const detail = await admin.get(`/api/admin/users/${buyer.id}`).expect(200);
    assert.ok(detail.body.orders.length >= 1);
  });

  test('bulk enquiry creates a WhatsApp link and appears in admin', async () => {
    const res = await newAgent()
      .post('/api/bulk-enquiries')
      .send({ name: 'Ravi', phone: '9876544444', company: 'Acme', message: 'Event tees', items: [{ productName: 'Test Tee', variantLabel: 'M / Black', quantity: 200 }] })
      .expect(201);
    assert.match(res.body.whatsappUrl, /^https:\/\/wa\.me\/919876543210\?text=/);
    assert.match(decodeURIComponent(res.body.whatsappUrl), /Test Tee \(M \/ Black\) × 200/);

    const list = await admin.get('/api/admin/bulk-enquiries?status=new').expect(200);
    assert.equal(list.body.items[0].name, 'Ravi');
    assert.match(list.body.items[0].whatsappUrl, /^https:\/\/wa\.me\/919876544444/);

    const updated = await admin.patch(`/api/admin/bulk-enquiries/${res.body.id}`).send({ status: 'contacted', adminNotes: 'Called' }).expect(200);
    assert.equal(updated.body.status, 'contacted');
    assert.equal(updated.body.adminNotes, 'Called');

    await newAgent().post('/api/bulk-enquiries').send({ name: 'X', phone: '1' }).expect(400);
  });
});
