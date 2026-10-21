import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addDays, storeToday } from '../src/services/prebookings.js';
import { login, newAgent, pool, query, resetDb } from './helpers.js';

let fx;
let admin;
let customer;
const tomorrow = () => addDays(storeToday(), 1);

before(async () => {
  fx = await resetDb();
  admin = newAgent();
  await login(admin, '9999999999', 'Owner');
  customer = newAgent();
  await login(customer, '9876544444', 'Buyer');
});
after(() => pool.end());

const book = (agent, body) =>
  agent.post('/api/prebookings').send({ name: 'Lakshmi', phone: '9876555555', deliveryDate: tomorrow(), ...body });

describe('pre-book products', () => {
  test('lists every active product with its pack sizes, out of stock included, without stock levels', async () => {
    const res = await newAgent().get('/api/prebookings/products').expect(200);
    const tee = res.body.items.find((p) => p.slug === 'test-tee');
    assert.ok(tee, 'Test Tee listed');
    assert.deepEqual(tee.variants.map((v) => v.label).sort(), ['L / Black', 'M / Black', 'S / White']); // S has no stock
    assert.ok(res.body.items.some((p) => p.slug === 'test-bag'));
    assert.equal(JSON.stringify(res.body).includes('stock'), false);
  });

  test('leaves out drafts', async () => {
    await query(`UPDATE products SET status = 'draft' WHERE slug = 'test-bag'`);
    const res = await newAgent().get('/api/prebookings/products').expect(200);
    assert.equal(res.body.items.some((p) => p.slug === 'test-bag'), false);
    await query(`UPDATE products SET status = 'active' WHERE slug = 'test-bag'`);
  });
});

describe('pre-booking', () => {
  test('books out-of-stock products and keeps a priced copy of each line', async () => {
    const res = await book(newAgent(), {
      email: 'lakshmi@example.com',
      address: '12 Gandhi Road, Madurai',
      items: [
        { variantId: fx.variants.teeS, quantity: 2 }, // out of stock
        { variantId: fx.variants.bag, quantity: 1 },
        { variantId: fx.variants.teeS, quantity: 1 }, // merged into the first line
      ],
    }).expect(201);
    const b = res.body;
    assert.match(b.reference, /^PB-[A-Z2-9]{6}$/);
    assert.equal(b.deliveryDate, tomorrow());
    assert.equal(b.status, 'new');
    assert.equal(b.phone, '+919876555555');
    assert.equal(b.estimatedTotal, 3 * 45000 + 120000);
    const tee = b.items.find((i) => i.variantId === fx.variants.teeS);
    assert.deepEqual(
      { name: tee.productName, label: tee.variantLabel, qty: tee.quantity, unit: tee.unitPrice, total: tee.lineTotal },
      { name: 'Test Tee', label: 'S / White', qty: 3, unit: 45000, total: 135000 },
    );
    assert.equal(b.items.length, 2);
    assert.match(b.whatsappUrl, /^https:\/\/wa\.me\/919876543210\?text=/);
  });

  test('rejects dates that are not in the future or more than a year ahead', async () => {
    const items = [{ variantId: fx.variants.bag, quantity: 1 }];
    const today = await book(newAgent(), { items, deliveryDate: storeToday() }).expect(400);
    assert.equal(today.body.error.details[0].path, 'deliveryDate');
    await book(newAgent(), { items, deliveryDate: addDays(storeToday(), 400) }).expect(400);
    await book(newAgent(), { items, deliveryDate: '20-11-2026' }).expect(400);
  });

  test('rejects missing or unavailable products and bad contact details', async () => {
    await book(newAgent(), { items: [] }).expect(400);
    await book(newAgent(), { items: [{ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }).expect(400);
    await book(newAgent(), { phone: '123', items: [{ variantId: fx.variants.bag, quantity: 1 }] }).expect(400);
  });
});

describe('admin pre-bookings', () => {
  test('lists bookings and updates status and notes; customers have no access', async () => {
    await customer.get('/api/admin/prebookings').expect(403);
    const list = await admin.get('/api/admin/prebookings').expect(200);
    assert.equal(list.body.total, 1);
    const booking = list.body.items[0];
    assert.match(booking.whatsappUrl, /^https:\/\/wa\.me\/919876555555/);

    const found = await admin.get('/api/admin/prebookings').query({ q: booking.reference }).expect(200);
    assert.equal(found.body.total, 1);

    const updated = await admin
      .patch(`/api/admin/prebookings/${booking.id}`)
      .send({ status: 'confirmed', adminNotes: 'Advance paid by UPI' })
      .expect(200);
    assert.equal(updated.body.status, 'confirmed');
    assert.equal(updated.body.adminNotes, 'Advance paid by UPI');

    const confirmed = await admin.get('/api/admin/prebookings').query({ status: 'confirmed' }).expect(200);
    assert.equal(confirmed.body.total, 1);
    await admin.patch(`/api/admin/prebookings/${booking.id}`).send({ status: 'paid' }).expect(400);
  });
});

describe('pre-booking switch', () => {
  test('on by default; when the admin turns it off the store hides it and refuses bookings', async () => {
    assert.equal((await newAgent().get('/api/config').expect(200)).body.prebookEnabled, true);

    await admin.put('/api/admin/settings').send({ values: { PREBOOK_ENABLED: 'false' } }).expect(200);
    assert.equal((await newAgent().get('/api/config').expect(200)).body.prebookEnabled, false);
    const closed = await newAgent().get('/api/prebookings/products').expect(404);
    assert.equal(closed.body.error.code, 'PREBOOK_CLOSED');
    await book(newAgent(), { items: [{ variantId: fx.variants.bag, quantity: 1 }] }).expect(404);
    await admin.get('/api/admin/prebookings').expect(200); // existing bookings stay manageable

    await admin.put('/api/admin/settings').send({ values: { PREBOOK_ENABLED: 'true' } }).expect(200);
    await newAgent().get('/api/prebookings/products').expect(200);
  });
});

describe('product ingredients', () => {
  async function saveTee(changes) {
    const current = (await admin.get(`/api/admin/products/${fx.teeId}`).expect(200)).body;
    const body = {
      name: current.name,
      slug: current.slug,
      description: current.description,
      categoryId: current.category?.id ?? null,
      status: current.status,
      isFeatured: current.isFeatured,
      ingredients: current.ingredients,
      showIngredients: current.showIngredients,
      variants: current.variants.map(({ id, sku, size, color, colorHex, price, compareAtPrice, stock, isActive }) => ({
        id, sku, size, color, colorHex, price, compareAtPrice, stock, isActive,
      })),
      images: [],
      ...changes,
    };
    return admin.put(`/api/admin/products/${fx.teeId}`).send(body).expect(200);
  }

  test('are shown on the product page unless the admin hides them', async () => {
    await saveTee({ ingredients: 'Gram flour, ghee, sugar', showIngredients: true });
    let pub = await newAgent().get('/api/products/test-tee').expect(200);
    assert.equal(pub.body.ingredients, 'Gram flour, ghee, sugar');

    await saveTee({ showIngredients: false });
    pub = await newAgent().get('/api/products/test-tee').expect(200);
    assert.equal(pub.body.ingredients, null);
    assert.equal(pub.body.showIngredients, false);
    const adminView = await admin.get(`/api/admin/products/${fx.teeId}`).expect(200);
    assert.equal(adminView.body.ingredients, 'Gram flour, ghee, sugar'); // kept, just hidden
  });
});
