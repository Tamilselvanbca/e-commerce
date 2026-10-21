// Discounts: coupon codes typed at checkout and automatic offers (no code).
// Only one discount applies to an order; when a code and an automatic offer
// both qualify, the bigger saving wins. A discount is "used" by every order
// that carries it and isn't cancelled, so expired checkouts free the usage.
import { randomUUID } from 'node:crypto';
import { pool, query, queryOne } from '../db/pool.js';
import { conflict, notFound } from '../lib/errors.js';
import { formatMoney } from '../lib/util.js';

export const DISCOUNT_COLUMNS = `d.id, d.code, d.title, d.description, d.type, d.value, d.max_discount, d.min_subtotal,
  d.region, d.starts_at, d.ends_at, d.usage_limit, d.per_customer_limit, d.first_order_only, d.show_in_offers, d.is_active,
  d.created_at, d.updated_at`;

export const normalizeCode = (code) => String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** What the customer sees about a discount. */
export function publicDiscount(d) {
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    description: d.description,
    type: d.type,
    value: d.value,
    maxDiscount: d.maxDiscount,
    minSubtotal: d.minSubtotal,
    automatic: d.code === null,
  };
}

/** Amount (paise) the discount takes off. `shippingFee` is the fee before any discount. */
export function discountAmount(d, subtotal, shippingFee) {
  if (d.type === 'percent') {
    const amount = Math.round((subtotal * d.value) / 100);
    return Math.min(d.maxDiscount ? Math.min(amount, d.maxDiscount) : amount, subtotal);
  }
  if (d.type === 'fixed') return Math.min(d.value, subtotal);
  return shippingFee; // free_shipping
}

/** Orders that count towards the usage limits (not cancelled). */
async function usageCounts(discountId, userId, db) {
  return queryOne(
    `SELECT count(*) AS total, count(CASE WHEN user_id = $2 THEN 1 END) AS mine
       FROM orders WHERE discount_id = $1 AND status <> 'cancelled'`,
    [discountId, userId],
    db,
  );
}

/**
 * Returns null when the discount can be used on this cart, otherwise
 * `{ reason, message }` explaining why not.
 */
async function ineligibility(d, { subtotal, shippingFee, international, userId }, db) {
  const now = Date.now();
  const no = (reason, message) => ({ reason, message });
  const what = d.code ? 'This code' : 'This offer';
  if (!d.isActive || (d.endsAt && new Date(d.endsAt).getTime() <= now)) return no('EXPIRED', `${what} has expired`);
  if (d.startsAt && new Date(d.startsAt).getTime() > now) return no('NOT_STARTED', `${what} is not active yet`);
  if (d.region === 'domestic' && international) return no('REGION', `${what} is only valid for deliveries within India`);
  if (d.region === 'international' && !international) return no('REGION', `${what} is only valid for deliveries outside India`);
  if (subtotal < d.minSubtotal) {
    return no('MIN_SUBTOTAL', `Add ${formatMoney(d.minSubtotal - subtotal)} more to your order to use ${what.toLowerCase()}`);
  }
  if (d.type === 'free_shipping' && shippingFee === 0) return no('NO_EFFECT', 'Your order already ships free');
  if (d.usageLimit || d.perCustomerLimit) {
    const used = await usageCounts(d.id, userId, db);
    if (d.usageLimit && used.total >= d.usageLimit) return no('USAGE_LIMIT', `${what} has been fully redeemed`);
    if (d.perCustomerLimit && used.mine >= d.perCustomerLimit) {
      return no('CUSTOMER_LIMIT', d.perCustomerLimit === 1 ? `You have already used ${what.toLowerCase()}` : `You have used ${what.toLowerCase()} the maximum number of times`);
    }
  }
  if (d.firstOrderOnly) {
    const previous = await queryOne(
      `SELECT 1 FROM orders WHERE user_id = $1 AND payment_status IN ('paid', 'refunded') LIMIT 1`,
      [userId],
      db,
    );
    if (previous) return no('FIRST_ORDER', `${what} is only for your first order`);
  }
  return null;
}

/**
 * Chooses the discount for a cart.
 * @param {{ code?: string|null, subtotal: number, shippingFee: number, international: boolean, userId: string }} ctx
 * @returns {Promise<{
 *   applied: { discount: object, amount: number } | null,
 *   code: { code: string, applied: boolean, outranked?: boolean, message: string|null } | null,
 *   hint: { title: string, remaining: number } | null,
 * }>}
 *   `code` reports on the code the customer typed; `hint` names an automatic
 *   offer the cart is close to unlocking.
 */
export async function resolveDiscount(ctx, db = pool) {
  let applied = null;
  let code = null;

  const typed = normalizeCode(ctx.code);
  if (typed) {
    const d = await queryOne(`SELECT ${DISCOUNT_COLUMNS} FROM discounts d WHERE d.code = $1`, [typed], db);
    const problem = d ? await ineligibility(d, ctx, db) : { message: "This code doesn't exist" };
    if (problem) {
      code = { code: typed, applied: false, message: problem.message };
    } else {
      applied = { discount: d, amount: discountAmount(d, ctx.subtotal, ctx.shippingFee) };
      code = { code: typed, applied: true, message: null };
    }
  }

  const offers = await query(
    `SELECT ${DISCOUNT_COLUMNS} FROM discounts d
      WHERE d.code IS NULL AND d.is_active
        AND (d.starts_at IS NULL OR d.starts_at <= now()) AND (d.ends_at IS NULL OR d.ends_at > now())
      ORDER BY d.created_at`,
    [],
    db,
  );
  let hint = null;
  for (const d of offers) {
    const problem = await ineligibility(d, ctx, db);
    if (problem) {
      const remaining = d.minSubtotal - ctx.subtotal;
      if (problem.reason === 'MIN_SUBTOTAL' && (!hint || remaining < hint.remaining)) hint = { title: d.title, remaining };
      continue;
    }
    const amount = discountAmount(d, ctx.subtotal, ctx.shippingFee);
    if (!applied || amount > applied.amount) {
      if (code?.applied) {
        code = { ...code, applied: false, outranked: true, message: `${d.title} saves you more, so it was applied instead` };
      }
      applied = { discount: d, amount };
    }
  }
  return { applied, code, hint };
}

/** An offer as listed to customers: the discount plus its conditions. */
function offer(d) {
  return { ...publicDiscount(d), region: d.region, firstOrderOnly: d.firstOrderOnly, endsAt: d.endsAt };
}

/**
 * Offers customers can see while they run: automatic offers, and coupon codes
 * the admin marked "show in offers". Fully redeemed ones are left out. Without
 * `ctx` (product page) it just lists them. With a cart `ctx` each offer says
 * whether it applies (`eligible`, `saving`), how much more the cart needs
 * (`remaining`), or why this customer can't use it (`unavailable`: already
 * used, first order only, other region…). Usable first.
 */
export async function listOffers(ctx = null, db = pool) {
  const rows = await query(
    `SELECT ${DISCOUNT_COLUMNS} FROM discounts d
      WHERE d.is_active AND (d.code IS NULL OR d.show_in_offers)
        AND (d.starts_at IS NULL OR d.starts_at <= now()) AND (d.ends_at IS NULL OR d.ends_at > now())
      ORDER BY d.min_subtotal, d.created_at`,
    [],
    db,
  );
  const offers = [];
  for (const d of rows) {
    if (!ctx) {
      if (d.usageLimit && (await usageCounts(d.id, null, db)).total >= d.usageLimit) continue;
      offers.push(offer(d));
      continue;
    }
    const problem = await ineligibility(d, ctx, db);
    // Below the minimum: also check what would stop it once the cart gets there.
    const blocker = problem?.reason === 'MIN_SUBTOTAL' ? await ineligibility(d, { ...ctx, subtotal: d.minSubtotal }, db) : problem;
    if (blocker?.reason === 'USAGE_LIMIT') continue;
    const unavailable = blocker ? blocker.message : null;
    offers.push({
      ...offer(d),
      eligible: !problem,
      remaining: problem && !unavailable ? d.minSubtotal - ctx.subtotal : 0,
      saving: problem ? 0 : discountAmount(d, ctx.subtotal, ctx.shippingFee),
      unavailable,
    });
  }
  const rank = (o) => (o.eligible ? 0 : o.unavailable ? 2 : 1);
  if (ctx) offers.sort((a, b) => rank(a) - rank(b) || b.saving - a.saving || a.remaining - b.remaining);
  return offers;
}

/**
 * Re-checks a chosen discount with its row locked, inside the checkout
 * transaction, so usage limits hold under concurrent checkouts.
 */
export async function lockDiscount(discountId, ctx, db) {
  const d = await queryOne(`SELECT ${DISCOUNT_COLUMNS} FROM discounts d WHERE d.id = $1 FOR UPDATE`, [discountId], db);
  const problem = d ? await ineligibility(d, ctx, db) : { message: 'This discount is no longer available' };
  if (problem) throw conflict('COUPON_INVALID', problem.message, { code: d?.code ?? null });
  return d;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const USAGE_SQL = `(SELECT count(*) FROM orders o WHERE o.discount_id = d.id AND o.status <> 'cancelled') AS times_used,
  (SELECT coalesce(sum(o.discount), 0) FROM orders o WHERE o.discount_id = d.id AND o.payment_status = 'paid') AS total_saved`;

function adminDiscount(d) {
  return {
    ...publicDiscount(d),
    region: d.region,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    usageLimit: d.usageLimit,
    perCustomerLimit: d.perCustomerLimit,
    firstOrderOnly: d.firstOrderOnly,
    showInOffers: d.showInOffers,
    isActive: d.isActive,
    timesUsed: d.timesUsed ?? 0,
    totalSaved: d.totalSaved ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function listDiscounts({ q, kind, status }) {
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (q) {
    const like = add(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(d.code LIKE ${like} OR d.title LIKE ${like})`);
  }
  if (kind === 'code') where.push('d.code IS NOT NULL');
  if (kind === 'automatic') where.push('d.code IS NULL');
  if (status === 'active') where.push('d.is_active AND (d.ends_at IS NULL OR d.ends_at > now())');
  if (status === 'inactive') where.push('NOT (d.is_active AND (d.ends_at IS NULL OR d.ends_at > now()))');
  const rows = await query(
    `SELECT ${DISCOUNT_COLUMNS}, ${USAGE_SQL} FROM discounts d
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d.is_active DESC, d.created_at DESC`,
    params,
  );
  return { items: rows.map(adminDiscount) };
}

export async function getDiscount(id) {
  const d = await queryOne(`SELECT ${DISCOUNT_COLUMNS}, ${USAGE_SQL} FROM discounts d WHERE d.id = $1`, [id]);
  if (!d) throw notFound('Discount not found');
  return adminDiscount(d);
}

const COLUMN_FOR = {
  code: 'code',
  title: 'title',
  description: 'description',
  type: 'type',
  value: 'value',
  maxDiscount: 'max_discount',
  minSubtotal: 'min_subtotal',
  region: 'region',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  usageLimit: 'usage_limit',
  perCustomerLimit: 'per_customer_limit',
  firstOrderOnly: 'first_order_only',
  showInOffers: 'show_in_offers',
  isActive: 'is_active',
};

const duplicateCode = (err, code) => {
  if (err.code === '23505' && err.constraint === 'discounts_code_key') {
    return conflict('CODE_TAKEN', `The code ${code} is already used by another discount`, [{ path: 'code', message: 'This code is already taken' }]);
  }
  return err;
};

export async function createDiscount(input) {
  const keys = Object.keys(COLUMN_FOR).filter((k) => input[k] !== undefined);
  const id = randomUUID();
  try {
    await query(
      `INSERT INTO discounts (id, ${keys.map((k) => COLUMN_FOR[k]).join(', ')})
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})`,
      [id, ...keys.map((k) => input[k])],
    );
    return getDiscount(id);
  } catch (err) {
    throw duplicateCode(err, input.code);
  }
}

export async function updateDiscount(id, input) {
  const keys = Object.keys(COLUMN_FOR).filter((k) => input[k] !== undefined);
  if (keys.length) {
    let rowCount;
    try {
      ({ rowCount } = await pool.query(
        `UPDATE discounts SET ${keys.map((k, i) => `${COLUMN_FOR[k]} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...keys.map((k) => input[k])],
      ));
    } catch (err) {
      throw duplicateCode(err, input.code);
    }
    if (!rowCount) throw notFound('Discount not found');
  }
  return getDiscount(id);
}

/** Deletes an unused discount. Used ones are kept for order history; deactivate them instead. */
export async function deleteDiscount(id) {
  const used = await queryOne('SELECT 1 FROM orders WHERE discount_id = $1 LIMIT 1', [id]);
  if (used) throw conflict('DISCOUNT_IN_USE', 'This discount has been used on orders. Switch it off instead of deleting it.');
  const { rowCount } = await pool.query('DELETE FROM discounts WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Discount not found');
}
