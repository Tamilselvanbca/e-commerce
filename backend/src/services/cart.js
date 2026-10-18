import { config } from '../config.js';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { conflict, notFound } from '../lib/errors.js';

export const CART_COOKIE = 'cart_id';
export const MAX_LINE_QUANTITY = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY = { id: null, items: [], itemCount: 0, subtotal: 0 };

function cartCookieOptions() {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/',
    domain: config.auth.cookieDomain,
    maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
  };
}

/**
 * Finds the cart for this request (user cart when logged in, otherwise the
 * guest cart from the cookie). With `create`, a cart is created if missing.
 * @returns {Promise<string|null>} cart id
 */
export async function resolveCartId(req, res, { create = false } = {}) {
  if (req.user) {
    const existing = await queryOne('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    if (existing) return existing.id;
    if (!create) return null;
    const created = await queryOne(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
      [req.user.id],
    );
    return created.id;
  }

  const cookieId = req.cookies?.[CART_COOKIE];
  if (cookieId && UUID_RE.test(cookieId)) {
    const guest = await queryOne('SELECT id FROM carts WHERE id = $1 AND user_id IS NULL', [cookieId]);
    if (guest) return guest.id;
  }
  if (!create) return null;
  const created = await queryOne('INSERT INTO carts DEFAULT VALUES RETURNING id');
  res.cookie(CART_COOKIE, created.id, cartCookieOptions());
  return created.id;
}

/** Loads the cart with live product data, prices and availability. */
export async function loadCart(cartId, db = pool) {
  if (!cartId) return EMPTY;
  const rows = await query(
    `SELECT ci.id, ci.variant_id, ci.quantity,
            v.sku, v.size, v.color, v.price, v.compare_at_price, v.stock, v.is_active AS variant_active,
            p.id AS product_id, p.name AS product_name, p.slug AS product_slug, p.status AS product_status,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at`,
    [cartId],
    db,
  );
  const items = rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    productId: r.productId,
    productName: r.productName,
    productSlug: r.productSlug,
    imageUrl: r.imageUrl,
    size: r.size,
    color: r.color,
    sku: r.sku,
    price: r.price,
    compareAtPrice: r.compareAtPrice,
    quantity: r.quantity,
    stock: r.stock,
    lineTotal: r.price * r.quantity,
    isAvailable: r.variantActive && r.productStatus === 'active' && r.stock >= r.quantity,
  }));
  return {
    id: cartId,
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
  };
}

async function purchasableVariant(variantId) {
  const v = await queryOne(
    `SELECT v.id, v.stock, p.name, v.size, v.color
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id = $1 AND v.is_active AND p.status = 'active'`,
    [variantId],
  );
  if (!v) throw notFound('This product is no longer available');
  return v;
}

function outOfStock(v, available) {
  const label = [v.size, v.color].filter(Boolean).join(' / ');
  return conflict(
    'OUT_OF_STOCK',
    available > 0
      ? `Only ${available} left of ${v.name}${label ? ` (${label})` : ''}`
      : `${v.name}${label ? ` (${label})` : ''} is out of stock`,
    { variantId: v.id, available },
  );
}

export async function addItem(cartId, variantId, quantity) {
  const v = await purchasableVariant(variantId);
  const existing = await queryOne('SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2', [cartId, variantId]);
  const next = Math.min((existing?.quantity ?? 0) + quantity, MAX_LINE_QUANTITY);
  if (next > v.stock) throw outOfStock(v, v.stock);
  await query(
    `INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [cartId, variantId, next],
  );
  await query('UPDATE carts SET updated_at = now() WHERE id = $1', [cartId]);
}

export async function updateItem(cartId, itemId, quantity) {
  const item = await queryOne('SELECT variant_id FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cartId]);
  if (!item) throw notFound('Cart item not found');
  const v = await purchasableVariant(item.variantId);
  if (quantity > v.stock) throw outOfStock(v, v.stock);
  await query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [quantity, itemId]);
}

export async function removeItem(cartId, itemId) {
  await query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cartId]);
}

export async function clearCart(cartId, db = pool) {
  if (cartId) await query('DELETE FROM cart_items WHERE cart_id = $1', [cartId], db);
}

/**
 * Moves a guest cart's items into the user's cart after login. Quantities are
 * summed (capped by stock and the per-line maximum) and the guest cart is deleted.
 */
export async function mergeGuestCart(req, res, userId) {
  const guestId = req.cookies?.[CART_COOKIE];
  res.clearCookie(CART_COOKIE, { ...cartCookieOptions(), maxAge: undefined });
  if (!guestId || !UUID_RE.test(guestId)) return;

  await transaction(async (db) => {
    const guest = await queryOne('SELECT id FROM carts WHERE id = $1 AND user_id IS NULL FOR UPDATE', [guestId], db);
    if (!guest) return;
    const userCart = await queryOne(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
      [userId],
      db,
    );
    await query(
      `INSERT INTO cart_items (cart_id, variant_id, quantity)
       SELECT $1, gi.variant_id, LEAST(gi.quantity, $3) FROM cart_items gi WHERE gi.cart_id = $2
       ON CONFLICT (cart_id, variant_id) DO UPDATE
         SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, $3)`,
      [userCart.id, guest.id, MAX_LINE_QUANTITY],
      db,
    );
    await query('DELETE FROM carts WHERE id = $1', [guest.id], db);
  });
}
