import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createAddress, login, newAgent, pool, resetDb } from './helpers.js';

let fx;
let buyer;
let admin;

before(async () => {
  fx = await resetDb();
  admin = newAgent();
  await login(admin, '9999999999', 'Owner');
  buyer = newAgent();
  await login(buyer, '9876577777', 'Priya Natarajan');
});
after(() => pool.end());

async function buy(agent, variantId) {
  const address = await createAddress(agent);
  await agent.post('/api/cart/items').send({ variantId, quantity: 1 }).expect(200);
  const res = await agent.post('/api/checkout').send({ addressId: address.id, gateway: 'mock', email: 'p@example.com' }).expect(201);
  await agent
    .post('/api/payments/mock/complete')
    .send({ orderNumber: res.body.order.orderNumber, mockPaymentId: res.body.payment.mockPaymentId, outcome: 'success' })
    .expect(200);
}

describe('reviews', () => {
  test('any signed-in customer can review at any time; guests must log in', async () => {
    const guest = await newAgent().get('/api/products/test-bag/reviews/eligibility').expect(200);
    assert.equal(guest.body.reason, 'login');
    await newAgent().post('/api/products/test-bag/reviews').send({ rating: 5, body: 'Lovely and fresh' }).expect(401);

    const shopper = newAgent();
    await login(shopper, '9876588888', 'Arun Kumar');
    const eligibility = await shopper.get('/api/products/test-bag/reviews/eligibility').expect(200);
    assert.equal(eligibility.body.canReview, true);
    assert.equal(eligibility.body.verified, false);
    const review = await shopper.post('/api/products/test-bag/reviews').send({ rating: 4, body: 'Looks lovely, tried it at a friend\'s place.' }).expect(201);
    assert.equal(review.body.verified, false);
    assert.equal(review.body.authorName, 'Arun K.');
  });

  test('a review becomes verified after buying, updates ratings and can be edited', async () => {
    // Reviewed before buying: not verified yet.
    const early = await buyer.post('/api/products/test-tee/reviews').send({ rating: 3, body: 'Heard good things about this.' }).expect(201);
    assert.equal(early.body.verified, false);

    await buy(buyer, fx.variants.teeM);
    const eligible = await buyer.get('/api/products/test-tee/reviews/eligibility').expect(200);
    assert.equal(eligible.body.canReview, true);
    assert.equal(eligible.body.verified, true);
    assert.equal(eligible.body.reason, 'already_reviewed');

    await buyer.post('/api/products/test-tee/reviews').send({ rating: 2, body: 'short' }).expect(400);
    const created = await buyer
      .post('/api/products/test-tee/reviews')
      .send({ rating: 4, title: 'Very good', body: 'Fresh and well packed, will buy again.' })
      .expect(201);
    assert.equal(created.body.authorName, 'Priya N.');
    assert.equal(created.body.verified, true);
    assert.equal(created.body.authorCity, 'Pune');

    // Posting again replaces the review instead of adding a second one.
    await buyer.post('/api/products/test-tee/reviews').send({ rating: 5, body: 'Even better the second time!' }).expect(201);
    const list = await newAgent().get('/api/products/test-tee/reviews').expect(200);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.summary.average, 5);
    assert.equal(list.body.summary.distribution['5'], 1);

    const product = await newAgent().get('/api/products/test-tee').expect(200);
    assert.deepEqual(product.body.rating, { average: 5, count: 1 });
    const catalog = await newAgent().get('/api/products?sort=rating').expect(200);
    assert.equal(catalog.body.items[0].slug, 'test-tee');

    const all = await newAgent().get('/api/reviews').expect(200);
    assert.equal(all.body.items[0].product.slug, 'test-tee');
  });

  test('admins can hide and delete reviews', async () => {
    await admin.get('/api/admin/reviews').expect(200);
    await buyer.get('/api/admin/reviews').expect(403);
    const { body } = await admin.get('/api/admin/reviews').expect(200);
    const id = body.items.find((r) => r.product?.slug === 'test-tee').id;

    await admin.patch(`/api/admin/reviews/${id}`).send({ status: 'hidden' }).expect(200);
    const hidden = await newAgent().get('/api/products/test-tee/reviews').expect(200);
    assert.equal(hidden.body.total, 0);
    assert.equal((await newAgent().get('/api/products/test-tee').expect(200)).body.rating, null);

    await admin.delete(`/api/admin/reviews/${id}`).expect(204);
    await admin.delete(`/api/admin/reviews/${id}`).expect(404);
  });
});
