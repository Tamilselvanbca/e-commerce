// Pre-bookings: customers book products (in stock or not) for a future date from
// the Pre-book page; the admin confirms and follows up. No online payment.
import crypto, { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool, query, queryOne } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paginated } from '../lib/validate.js';

export const PREBOOKING_STATUSES = ['new', 'confirmed', 'ready', 'completed', 'cancelled'];
/** Furthest delivery date that can be booked, in days from today. */
export const MAX_DAYS_AHEAD = 365;

const COLUMNS = `id, reference, name, phone, email, DATE_FORMAT(delivery_date, '%Y-%m-%d') AS delivery_date,
  address, notes, items, estimated_total, status, admin_notes, created_at, updated_at`;

/** Today's date (YYYY-MM-DD) in the store's time zone. */
export function storeToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.store.timezone }).format(now);
}

/** `date` (YYYY-MM-DD) plus `days`. */
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const variantLabel = (v) => [v.size, v.color].filter(Boolean).join(' / ') || null;

/**
 * Every active product with its active pack sizes, out-of-stock ones included,
 * for the Pre-book form. Stock levels aren't exposed.
 */
export async function listPrebookProducts() {
  const products = await query(
    `SELECT p.id, p.name, p.slug, c.name AS category_name, c.slug AS category_slug,
            (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) AS image_url
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active'
      ORDER BY c.sort_order IS NULL, c.sort_order, c.name, p.name`,
  );
  if (!products.length) return [];
  const variants = await query(
    `SELECT id, product_id, size, color, price FROM product_variants
      WHERE is_active AND product_id IN ($1) ORDER BY sort_order, price, id`,
    [products.map((p) => p.id)],
  );
  const byProduct = new Map();
  for (const v of variants) {
    if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
    byProduct.get(v.productId).push({ id: v.id, label: variantLabel(v), price: v.price });
  }
  return products
    .filter((p) => byProduct.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      imageUrl: p.imageUrl,
      category: p.categorySlug ? { name: p.categoryName, slug: p.categorySlug } : null,
      variants: byProduct.get(p.id),
    }));
}

const REFERENCE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newReference = () =>
  `PB-${Array.from({ length: 6 }, () => REFERENCE_CHARS[crypto.randomInt(REFERENCE_CHARS.length)]).join('')}`;

/**
 * Saves a pre-booking. `items` are { variantId, quantity }; each line keeps the
 * product name, pack and unit price at booking time.
 */
export async function createPrebooking({ userId = null, name, phone, email, deliveryDate, address, notes, items }) {
  const today = storeToday();
  if (deliveryDate <= today) {
    throw badRequest('Choose a date from tomorrow onwards', [{ path: 'deliveryDate', message: 'Choose a date from tomorrow onwards' }]);
  }
  if (deliveryDate > addDays(today, MAX_DAYS_AHEAD)) {
    throw badRequest('Choose a date within the next year', [{ path: 'deliveryDate', message: 'Choose a date within the next year' }]);
  }

  // One line per pack size.
  const quantities = new Map();
  for (const item of items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  const rows = await query(
    `SELECT v.id, v.size, v.color, v.price, p.id AS product_id, p.name AS product_name
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN ($1) AND v.is_active AND p.status = 'active'`,
    [[...quantities.keys()]],
  );
  if (rows.length !== quantities.size) {
    throw badRequest('Some of the chosen products are no longer available; refresh the page and try again', [
      { path: 'items', message: 'Product no longer available' },
    ]);
  }
  const lines = rows.map((v) => {
    const quantity = quantities.get(v.id);
    return {
      productId: v.productId,
      variantId: v.id,
      productName: v.productName,
      variantLabel: variantLabel(v),
      unitPrice: v.price,
      quantity,
      lineTotal: v.price * quantity,
    };
  });
  const estimatedTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  const id = randomUUID();
  for (let attempt = 0; ; attempt++) {
    try {
      await query(
        `INSERT INTO prebookings (id, reference, user_id, name, phone, email, delivery_date, address, notes, items, estimated_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, newReference(), userId, name, phone, email, deliveryDate, address, notes, JSON.stringify(lines), estimatedTotal],
      );
      break;
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'prebookings_reference_key' && attempt < 5) continue;
      throw err;
    }
  }
  return getPrebooking(id);
}

export function getPrebooking(id) {
  return queryOne(`SELECT ${COLUMNS} FROM prebookings WHERE id = $1`, [id]);
}

/** Admin list: open bookings first, soonest date first; filter by status, search name / phone / reference. */
export async function listPrebookings({ status, q, page, pageSize }) {
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (status) where.push(`status = ${add(status)}`);
  if (q) {
    const like = add(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(name LIKE ${like} OR phone LIKE ${like} OR reference LIKE ${like})`);
  }
  const rows = await query(
    `SELECT ${COLUMNS}, count(*) OVER() AS full_count FROM prebookings
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY status IN ('completed', 'cancelled'), delivery_date, created_at DESC
      LIMIT ${add(pageSize)} OFFSET ${add((page - 1) * pageSize)}`,
    params,
  );
  const items = rows.map(({ fullCount: _omit, ...r }) => r);
  return paginated(items, rows[0]?.fullCount ?? 0, page, pageSize);
}

export async function updatePrebooking(id, { status, adminNotes }) {
  const { rowCount } = await pool.query(
    `UPDATE prebookings SET status = coalesce($2, status),
            admin_notes = CASE WHEN $3 THEN $4 ELSE admin_notes END
      WHERE id = $1`,
    [id, status ?? null, adminNotes !== undefined, adminNotes || null],
  );
  if (!rowCount) throw notFound('Pre-booking not found');
  return getPrebooking(id);
}
