import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { runScript } from '../src/db/pool.js';
import { pool, query, queryOne, resetDb } from './helpers.js';

const MIGRATION = new URL('../src/db/migrations/002_remove_sample_catalogue.sql', import.meta.url);

async function category(slug, parentId = null) {
  const id = randomUUID();
  await query('INSERT INTO categories (id, name, slug, parent_id) VALUES ($1, $2, $3, $4)', [id, slug, slug, parentId]);
  return id;
}

async function product(slug, categoryId, imageKey) {
  const id = randomUUID();
  await query('INSERT INTO products (id, name, slug, description, category_id) VALUES ($1, $2, $3, $4, $5)', [id, slug, slug, 'x', categoryId]);
  await query("INSERT INTO product_variants (product_id, sku, price, stock) VALUES ($1, $2, 10000, 5)", [id, `SKU-${slug}`]);
  if (imageKey) {
    await query('INSERT INTO product_images (product_id, url, storage_key) VALUES ($1, $2, $3)', [id, `/uploads/${imageKey}`, imageKey]);
  }
  return id;
}

before(async () => {
  await resetDb();
});
after(() => pool.end());

test('removes only the untouched sample catalogue', async () => {
  const sweets = await category('sweets');
  const laddus = await category('laddus', sweets);
  const snacks = await category('snacks');
  const murukku = await category('murukku', snacks);
  const giftBoxes = await category('gift-boxes');

  await product('motichoor-laddu', laddus, 'seed/motichoor-laddu-main.svg'); // sample: removed
  await product('kai-murukku', murukku, 'seed/kai-murukku-main.svg'); // sample: removed
  await product('mysore-pak', sweets, 'products/real-photo.jpg'); // sample given a real photo: kept
  await product('grandmas-special', giftBoxes, 'products/grandma.jpg'); // the store's own: kept

  await runScript(await readFile(MIGRATION, 'utf8'));

  const slugs = (await query('SELECT slug FROM products ORDER BY slug')).map((r) => r.slug);
  assert.deepEqual(slugs, ['grandmas-special', 'mysore-pak', 'test-bag', 'test-tee']);
  const variants = await queryOne("SELECT count(*) AS count FROM product_variants WHERE sku IN ('SKU-motichoor-laddu', 'SKU-kai-murukku')");
  assert.equal(variants.count, 0);

  const categories = (await query('SELECT slug FROM categories ORDER BY slug')).map((r) => r.slug);
  // laddus, murukku and snacks were empty; sweets and gift-boxes still hold products.
  assert.deepEqual(categories, ['gift-boxes', 'sweets', 'tees']);
});
