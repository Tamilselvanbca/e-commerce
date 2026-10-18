import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { login, newAgent, pool, query, resetDb } from './helpers.js';

let fx;
before(async () => {
  fx = await resetDb();
});
after(() => pool.end());

describe('catalog', () => {
  test('lists active products with facets', async () => {
    const res = await newAgent().get('/api/products').expect(200);
    assert.equal(res.body.total, 2);
    assert.deepEqual(res.body.facets.sizes, ['S', 'M', 'L']);
    assert.deepEqual(res.body.facets.priceRange, { min: 45000, max: 120000 });
  });

  test('filters by size and category and searches', async () => {
    const bySize = await newAgent().get('/api/products?sizes=L').expect(200);
    assert.deepEqual(bySize.body.items.map((p) => p.slug), ['test-tee']);
    const byCategory = await newAgent().get('/api/products?category=tees').expect(200);
    assert.equal(byCategory.body.total, 1);
    const search = await newAgent().get('/api/products?q=canvas').expect(200);
    assert.deepEqual(search.body.items.map((p) => p.slug), ['test-bag']);
    const unknown = await newAgent().get('/api/products?category=nope').expect(200);
    assert.equal(unknown.body.total, 0);
  });

  test('product detail exposes options and hides drafts', async () => {
    const res = await newAgent().get('/api/products/test-tee').expect(200);
    assert.equal(res.body.variants.length, 3);
    assert.deepEqual(res.body.options.sizes, ['S', 'M', 'L']);
    assert.equal(res.body.minPrice, 45000);
    await query(`UPDATE products SET status = 'draft' WHERE slug = 'test-bag'`);
    await newAgent().get('/api/products/test-bag').expect(404);
    await query(`UPDATE products SET status = 'active' WHERE slug = 'test-bag'`);
  });

  test('rejects invalid query parameters', async () => {
    const res = await newAgent().get('/api/products?sort=bogus').expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});

describe('OTP auth', () => {
  test('wrong code is rejected with attempts left, right code logs in', async () => {
    const agent = newAgent();
    const req = await agent.post('/api/auth/otp/request').send({ phone: '98765 00002' }).expect(200);
    assert.equal(req.body.phone, '+919876500002');
    assert.match(req.body.devCode, /^\d{6}$/);

    const wrong = req.body.devCode === '000000' ? '111111' : '000000';
    const bad = await agent.post('/api/auth/otp/verify').send({ phone: '9876500002', code: wrong }).expect(400);
    assert.equal(bad.body.error.code, 'OTP_INVALID');
    assert.equal(bad.body.error.details.attemptsLeft, 4);

    const ok = await agent.post('/api/auth/otp/verify').send({ phone: '9876500002', code: req.body.devCode, name: 'Asha' }).expect(200);
    assert.equal(ok.body.isNewUser, true);
    assert.equal(ok.body.user.name, 'Asha');
    assert.equal(ok.body.user.role, 'customer');

    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.phone, '+919876500002');

    // A code can only be used once.
    await newAgent().post('/api/auth/otp/verify').send({ phone: '9876500002', code: req.body.devCode }).expect(400);

    await agent.post('/api/auth/logout').expect(204);
    const guest = await agent.get('/api/auth/me').expect(200);
    assert.equal(guest.body.user, null);
    await agent.get('/api/orders').expect(401);
  });

  test('enforces the resend cooldown', async () => {
    const agent = newAgent();
    await agent.post('/api/auth/otp/request').send({ phone: '9876500003' }).expect(200);
    const res = await agent.post('/api/auth/otp/request').send({ phone: '9876500003' }).expect(429);
    assert.equal(res.body.error.code, 'OTP_COOLDOWN');
    assert.ok(res.body.error.details.retryAfter > 0);
  });

  test('rejects invalid phone numbers', async () => {
    await newAgent().post('/api/auth/otp/request').send({ phone: '12345' }).expect(400);
    await newAgent().post('/api/auth/otp/request').send({ phone: '5876500003' }).expect(400); // Indian mobiles start 6-9
  });

  test('phones in ADMIN_PHONES become admins; blocked users cannot log in', async () => {
    const admin = await login(newAgent(), '9999999999', 'Owner');
    assert.equal(admin.role, 'admin');

    await login(newAgent(), '9876500004');
    await query(`UPDATE users SET is_blocked = true WHERE phone = '+919876500004'`);
    await query(`DELETE FROM otp_codes WHERE phone = '+919876500004'`);
    const agent = newAgent();
    const req = await agent.post('/api/auth/otp/request').send({ phone: '9876500004' }).expect(200);
    const res = await agent.post('/api/auth/otp/verify').send({ phone: '9876500004', code: req.body.devCode }).expect(403);
    assert.equal(res.body.error.code, 'ACCOUNT_BLOCKED');
  });

  test('profile update validates email', async () => {
    const agent = newAgent();
    await login(agent, '9876500005');
    await agent.patch('/api/auth/me').send({ email: 'not-an-email' }).expect(400);
    const res = await agent.patch('/api/auth/me').send({ email: 'Asha@Example.com', name: 'Asha K' }).expect(200);
    assert.equal(res.body.user.email, 'asha@example.com');
    assert.equal(res.body.user.name, 'Asha K');
  });
});

describe('cart', () => {
  test('guest cart enforces stock and merges into the user cart on login', async () => {
    const agent = newAgent();
    const empty = await agent.get('/api/cart').expect(200);
    assert.equal(empty.body.itemCount, 0);

    const added = await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 2 }).expect(200);
    assert.equal(added.body.itemCount, 2);
    assert.equal(added.body.subtotal, 100000);

    const tooMany = await agent.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 4 }).expect(409);
    assert.equal(tooMany.body.error.code, 'OUT_OF_STOCK');
    assert.equal(tooMany.body.error.details.available, 5);

    await agent.post('/api/cart/items').send({ variantId: fx.variants.teeS, quantity: 1 }).expect(409);

    const itemId = added.body.items[0].id;
    const updated = await agent.patch(`/api/cart/items/${itemId}`).send({ quantity: 3 }).expect(200);
    assert.equal(updated.body.itemCount, 3);

    // The user already has 1 tee in their own cart from an earlier session.
    const other = newAgent();
    await login(other, '9876500006');
    await other.post('/api/cart/items').send({ variantId: fx.variants.teeM, quantity: 1 }).expect(200);

    await login(agent, '9876500006');
    const merged = await agent.get('/api/cart').expect(200);
    assert.equal(merged.body.items.length, 1);
    assert.equal(merged.body.items[0].quantity, 4);

    const removed = await agent.delete(`/api/cart/items/${merged.body.items[0].id}`).expect(200);
    assert.equal(removed.body.itemCount, 0);
  });

  test('marks items unavailable when stock drops below the cart quantity', async () => {
    const agent = newAgent();
    await agent.post('/api/cart/items').send({ variantId: fx.variants.bag, quantity: 3 }).expect(200);
    await query('UPDATE product_variants SET stock = 2 WHERE id = $1', [fx.variants.bag]);
    const cart = await agent.get('/api/cart').expect(200);
    assert.equal(cart.body.items[0].isAvailable, false);
    await query('UPDATE product_variants SET stock = 10 WHERE id = $1', [fx.variants.bag]);
  });

  test('blocks cross-site requests', async () => {
    const res = await newAgent().post('/api/cart/items').set('Origin', 'https://evil.example').send({}).expect(403);
    assert.equal(res.body.error.code, 'CSRF_ORIGIN');
  });
});
