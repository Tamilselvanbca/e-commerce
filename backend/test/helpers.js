import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool, query, queryOne } from '../src/db/pool.js';

export const app = createApp();
export { pool, query, queryOne };

/** A supertest agent that keeps cookies between requests (like a browser). */
export const newAgent = () => supertest.agent(app);

/** Drops and recreates the schema, then inserts a small fixed catalog. */
export async function resetDb() {
  await migrate({ reset: true, silent: true, keepSettings: false });
  const cat = await queryOne(`INSERT INTO categories (name, slug) VALUES ('Tees', 'tees') RETURNING id`);
  const tee = await queryOne(
    `INSERT INTO products (name, slug, description, category_id, is_featured)
     VALUES ('Test Tee', 'test-tee', 'Soft cotton tee', $1, true) RETURNING id`,
    [cat.id],
  );
  const bag = await queryOne(
    `INSERT INTO products (name, slug, description) VALUES ('Test Bag', 'test-bag', 'Canvas bag') RETURNING id`,
  );
  const variants = {};
  for (const [key, productId, sku, size, color, price, stock] of [
    ['teeM', tee.id, 'TT-M-BLK', 'M', 'Black', 50000, 5],
    ['teeL', tee.id, 'TT-L-BLK', 'L', 'Black', 50000, 1],
    ['teeS', tee.id, 'TT-S-WHT', 'S', 'White', 45000, 0],
    ['bag', bag.id, 'TB-NAT', null, 'Natural', 120000, 10],
  ]) {
    const v = await queryOne(
      `INSERT INTO product_variants (product_id, sku, size, color, price, stock) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [productId, sku, size, color, price, stock],
    );
    variants[key] = v.id;
  }
  return { categoryId: cat.id, teeId: tee.id, bagId: bag.id, variants };
}

/** Logs the agent in through the OTP flow and returns the user. */
export async function login(agent, phone = '9876500001', name = 'Test User') {
  // Skip the resend cooldown when a test logs the same number in twice.
  await query('DELETE FROM otp_codes WHERE phone = $1', [`+91${phone.replace(/\D/g, '').slice(-10)}`]);
  const req = await agent.post('/api/auth/otp/request').send({ phone }).expect(200);
  const res = await agent.post('/api/auth/otp/verify').send({ phone, code: req.body.devCode, name }).expect(200);
  return res.body.user;
}

export async function stock(variantId) {
  return (await queryOne('SELECT stock FROM product_variants WHERE id = $1', [variantId])).stock;
}

export async function createAddress(agent) {
  const res = await agent
    .post('/api/addresses')
    .send({ fullName: 'Test User', phone: '9876500001', line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' })
    .expect(201);
  return res.body;
}
