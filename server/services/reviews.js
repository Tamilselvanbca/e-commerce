import { pool, query, queryOne } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';

const COLUMNS = `r.id, r.rating, r.title, r.body, r.author_name, r.author_city, r.author_country,
  r.verified, r.status, r.created_at`;

function toReview(r, withProduct = false) {
  return {
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    authorCity: r.authorCity,
    authorCountry: r.authorCountry,
    verified: r.verified,
    createdAt: r.createdAt,
    ...(withProduct ? { product: { id: r.productId, name: r.productName, slug: r.productSlug, imageUrl: r.productImage } } : {}),
  };
}

/** Rating summary (average, count, 1–5 distribution) for a product or the whole store. */
export async function ratingSummary(productId = null) {
  const rows = await query(
    `SELECT rating, count(*) AS count FROM reviews
      WHERE status = 'published' AND ($1 IS NULL OR product_id = $1)
      GROUP BY rating`,
    [productId],
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    distribution[r.rating] = r.count;
    count += r.count;
    sum += r.rating * r.count;
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution };
}

const ORDER_BY = {
  newest: 'r.created_at DESC',
  highest: 'r.rating DESC, r.created_at DESC',
  lowest: 'r.rating ASC, r.created_at DESC',
};

/** Published reviews, optionally for one product / one rating. */
export async function listReviews({ productId = null, rating = null, sort = 'newest', page, pageSize, admin = false, status = null, q = null }) {
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (!admin) where.push(`r.status = 'published'`);
  if (status) where.push(`r.status = ${add(status)}`);
  if (productId) where.push(`r.product_id = ${add(productId)}`);
  if (rating) where.push(`r.rating = ${add(rating)}`);
  if (q) {
    const like = add(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(r.body LIKE ${like} OR r.title LIKE ${like} OR r.author_name LIKE ${like} OR p.name LIKE ${like})`);
  }
  const rows = await query(
    `SELECT ${COLUMNS}, p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS product_image,
            count(*) OVER() AS full_count
       FROM reviews r JOIN products p ON p.id = r.product_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${ORDER_BY[sort] ?? ORDER_BY.newest}
      LIMIT ${add(pageSize)} OFFSET ${add((page - 1) * pageSize)}`,
    params,
  );
  const total = rows[0]?.fullCount ?? 0;
  return {
    items: rows.map((r) => ({ ...toReview(r, true), ...(admin ? { status: r.status } : {}) })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Display name for reviews: first name + last initial ("Priya N."). */
export function reviewerName(name, verified = true) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return verified ? 'Verified customer' : 'Customer';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Whether `user` may review `productId`: any signed-in customer can, at any
 * time. A paid, non-cancelled order containing the product makes the review a
 * verified purchase. Returns that order (if any) and any existing review.
 */
export async function reviewEligibility(user, productId) {
  if (!user) return { canReview: false, reason: 'login', review: null, verified: false };
  const [order, existing] = await Promise.all([
    queryOne(
      `SELECT o.id, o.shipping_address FROM orders o JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1 AND oi.product_id = $2 AND o.payment_status = 'paid' AND o.status <> 'cancelled'
        ORDER BY o.created_at DESC LIMIT 1`,
      [user.id, productId],
    ),
    queryOne(`SELECT ${COLUMNS} FROM reviews r WHERE r.product_id = $1 AND r.user_id = $2`, [productId, user.id]),
  ]);
  return {
    canReview: true,
    reason: existing ? 'already_reviewed' : null,
    review: existing ? toReview(existing) : null,
    verified: Boolean(order),
    order,
  };
}

/** Creates or replaces the customer's review of a product. */
export async function saveReview(user, productId, { rating, title, body }) {
  const eligibility = await reviewEligibility(user, productId);
  if (!eligibility.canReview) throw badRequest('Log in to write a review');
  const { order, verified } = eligibility;
  const address = order?.shippingAddress ?? {};
  // One review per customer and product: editing replaces it (and picks up a purchase made since).
  await query(
    `INSERT INTO reviews (product_id, user_id, order_id, author_name, author_city, author_country, rating, title, body, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON DUPLICATE KEY UPDATE
       rating = VALUES(rating), title = VALUES(title), body = VALUES(body), author_name = VALUES(author_name),
       order_id = VALUES(order_id), verified = VALUES(verified),
       author_city = coalesce(VALUES(author_city), author_city), author_country = coalesce(VALUES(author_country), author_country)`,
    [
      productId, user.id, order?.id ?? null, reviewerName(user.name, verified),
      address.city ?? null, address.country ?? null, rating, title, body, verified,
    ],
  );
  const row = await queryOne(`SELECT ${COLUMNS} FROM reviews r WHERE r.product_id = $1 AND r.user_id = $2`, [productId, user.id]);
  return toReview(row);
}

export async function setReviewStatus(id, status) {
  const { rowCount } = await pool.query('UPDATE reviews SET status = $2 WHERE id = $1', [id, status]);
  if (!rowCount) throw notFound('Review not found');
  return { id, status };
}

export async function deleteReview(id) {
  const { rowCount } = await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Review not found');
}
