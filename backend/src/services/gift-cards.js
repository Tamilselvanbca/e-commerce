// Gift cards: a code with a balance that pays for part or all of an order.
// The amount used is taken off the card when the order is placed and put back
// if the order is cancelled (customer, store or payment timeout).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { formatMoney } from '../lib/util.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
/** Razorpay and Stripe can't charge less than ₹1, so a card never leaves 1-99 paise to pay. */
const MIN_GATEWAY_AMOUNT = 100;

/** 16 random characters (80 bits), e.g. "K7QM2XPA9RTW4HNE". */
export function generateGiftCardCode() {
  return Array.from(crypto.randomBytes(16), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const normalizeGiftCardCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "K7QM2XPA9RTW4HNE" -> "K7QM-2XPA-9RTW-4HNE" */
export const formatGiftCardCode = (code) => code.match(/.{1,4}/g).join('-');

/** "••••-4HNE": what customers see on their own orders. */
export const maskGiftCardCode = (code) => `••••-${code.slice(-4)}`;

const CARD_COLUMNS = `g.id, g.code, g.initial_balance, g.balance, g.currency, g.recipient_name, g.recipient_email,
  g.sender_name, g.message, g.expires_at, g.is_active, g.created_at, g.updated_at`;

/** Why a card can't be used right now, or null. */
function unusableReason(card) {
  if (!card) return "We couldn't find a gift card with this code";
  if (!card.isActive) return 'This gift card has been disabled';
  if (card.expiresAt && new Date(card.expiresAt) <= new Date()) {
    return `This gift card expired on ${new Date(card.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: config.store.timezone })}`;
  }
  if (card.currency !== config.store.currency) return 'This gift card cannot be used in this store';
  if (card.balance <= 0) return 'This gift card has no balance left';
  return null;
}

/** How much of `total` a card with `balance` pays. */
export function giftCardPortion(balance, total) {
  let amount = Math.min(balance, total);
  const due = total - amount;
  if (due > 0 && due < MIN_GATEWAY_AMOUNT) amount = Math.max(0, total - MIN_GATEWAY_AMOUNT);
  return amount;
}

/**
 * Looks up a card for checkout. Returns `{ card }` or `{ error }`.
 * Pass a transaction client with `lock` to hold the row until commit.
 */
export async function findUsableGiftCard(code, { db = pool, lock = false } = {}) {
  const normalized = normalizeGiftCardCode(code);
  const card = normalized
    ? await queryOne(`SELECT ${CARD_COLUMNS} FROM gift_cards g WHERE g.code = $1 ${lock ? 'FOR UPDATE' : ''}`, [normalized], db)
    : null;
  const error = unusableReason(card);
  return error ? { error, code: normalized } : { card };
}

/** Public balance check (no login needed). */
export async function giftCardBalance(code) {
  const normalized = normalizeGiftCardCode(code);
  if (normalized.length !== 16) throw badRequest('Gift card codes have 16 letters and numbers', [{ path: 'code', message: 'Check the code' }]);
  const card = await queryOne(`SELECT ${CARD_COLUMNS} FROM gift_cards g WHERE g.code = $1`, [normalized]);
  if (!card) throw notFound("We couldn't find a gift card with this code");
  const problem = unusableReason(card);
  return {
    code: maskGiftCardCode(card.code),
    balance: card.isActive ? card.balance : 0,
    currency: card.currency,
    expiresAt: card.expiresAt,
    usable: !problem,
    message: problem,
  };
}

async function addTransaction(db, { cardId, orderId = null, kind, amount, note = null, by = null }) {
  await query(
    `INSERT INTO gift_card_transactions (gift_card_id, order_id, kind, amount, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [cardId, orderId, kind, amount, note, by],
    db,
  );
}

/** Takes `amount` off a card for an order. The card row must be locked. */
export async function redeemGiftCard(db, { cardId, orderId, amount, note = null }) {
  const updated = await queryOne(
    'UPDATE gift_cards SET balance = balance - $2 WHERE id = $1 AND balance >= $2 RETURNING id',
    [cardId, amount],
    db,
  );
  if (!updated) throw conflict('GIFT_CARD_INVALID', 'The gift card balance has changed. Please apply it again.');
  await addTransaction(db, { cardId, orderId, kind: 'redeem', amount: -amount, note });
}

/** Net amount an order currently holds on its gift card (positive = taken from the card). */
async function heldForOrder(db, orderId) {
  const row = await queryOne(
    'SELECT gift_card_id, coalesce(-sum(amount), 0) AS held FROM gift_card_transactions WHERE order_id = $1 GROUP BY gift_card_id',
    [orderId],
    db,
  );
  return row ?? { giftCardId: null, held: 0 };
}

/** Puts an order's gift card amount back on the card (on cancellation). Safe to call twice. */
export async function refundGiftCardForOrder(db, orderId, note) {
  const { giftCardId, held } = await heldForOrder(db, orderId);
  if (!giftCardId || held <= 0) return 0;
  await query('UPDATE gift_cards SET balance = balance + $2 WHERE id = $1', [giftCardId, held], db);
  await addTransaction(db, { cardId: giftCardId, orderId, kind: 'refund', amount: held, note });
  return held;
}

/**
 * Takes the gift card amount again for an order that was reinstated (payment
 * arrived after expiry). Returns false if the card can no longer cover it.
 */
export async function reclaimGiftCardForOrder(db, { orderId, giftCardId, amount }) {
  if (!giftCardId || amount <= 0) return true;
  const { held } = await heldForOrder(db, orderId);
  const missing = amount - held;
  if (missing <= 0) return true;
  const updated = await queryOne(
    'UPDATE gift_cards SET balance = balance - $2 WHERE id = $1 AND balance >= $2 RETURNING id',
    [giftCardId, missing],
    db,
  );
  if (!updated) return false;
  await addTransaction(db, { cardId: giftCardId, orderId, kind: 'redeem', amount: -missing, note: 'Order reinstated after late payment' });
  return true;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
function adminCard(g) {
  return {
    id: g.id,
    code: formatGiftCardCode(g.code),
    initialBalance: g.initialBalance,
    balance: g.balance,
    currency: g.currency,
    recipientName: g.recipientName,
    recipientEmail: g.recipientEmail,
    senderName: g.senderName,
    message: g.message,
    expiresAt: g.expiresAt,
    isActive: g.isActive,
    status: !g.isActive
      ? 'disabled'
      : g.expiresAt && new Date(g.expiresAt) <= new Date()
        ? 'expired'
        : g.balance === 0
          ? 'used'
          : 'active',
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export async function listGiftCards({ q, status, page, pageSize }) {
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (q) {
    const code = normalizeGiftCardCode(q);
    const like = add(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(g.recipient_name ILIKE ${like} OR g.recipient_email ILIKE ${like}${code.length >= 4 ? ` OR g.code LIKE ${add(`%${code}%`)}` : ''})`);
  }
  if (status === 'active') where.push('g.is_active AND g.balance > 0 AND (g.expires_at IS NULL OR g.expires_at > now())');
  if (status === 'used') where.push('g.is_active AND g.balance = 0');
  if (status === 'expired') where.push('g.is_active AND g.expires_at <= now()');
  if (status === 'disabled') where.push('NOT g.is_active');
  const rows = await query(
    `SELECT ${CARD_COLUMNS}, count(*) OVER() AS full_count FROM gift_cards g
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY g.created_at DESC
      LIMIT ${add(pageSize)} OFFSET ${add((page - 1) * pageSize)}`,
    params,
  );
  const total = rows[0]?.fullCount ?? 0;
  const totals = await queryOne(
    `SELECT coalesce(sum(balance) FILTER (WHERE is_active AND (expires_at IS NULL OR expires_at > now())), 0) AS outstanding,
            count(*) AS cards
       FROM gift_cards`,
  );
  return { items: rows.map(adminCard), page, pageSize, total, totalPages: Math.ceil(total / pageSize), summary: totals };
}

export async function getGiftCard(id) {
  const g = await queryOne(`SELECT ${CARD_COLUMNS} FROM gift_cards g WHERE g.id = $1`, [id]);
  if (!g) throw notFound('Gift card not found');
  const transactions = await query(
    `SELECT t.id, t.kind, t.amount, t.note, t.created_at, o.order_number, u.name AS created_by_name
       FROM gift_card_transactions t
       LEFT JOIN orders o ON o.id = t.order_id
       LEFT JOIN users u ON u.id = t.created_by
      WHERE t.gift_card_id = $1
      ORDER BY t.created_at DESC, t.id DESC`,
    [id],
  );
  return { ...adminCard(g), transactions };
}

export async function createGiftCard(input, adminId) {
  const id = await transaction(async (db) => {
    for (let attempt = 0; ; attempt++) {
      await db.query('SAVEPOINT gift_card_insert');
      try {
        const row = await queryOne(
          `INSERT INTO gift_cards (code, initial_balance, balance, currency, recipient_name, recipient_email,
                                   sender_name, message, expires_at, created_by)
           VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [generateGiftCardCode(), input.amount, config.store.currency, input.recipientName, input.recipientEmail,
            input.senderName, input.message, input.expiresAt, adminId],
          db,
        );
        await addTransaction(db, { cardId: row.id, kind: 'issue', amount: input.amount, note: input.note ?? null, by: adminId });
        return row.id;
      } catch (err) {
        if (err.code === '23505' && attempt < 5) {
          await db.query('ROLLBACK TO SAVEPOINT gift_card_insert');
          continue;
        }
        throw err;
      }
    }
  });
  return getGiftCard(id);
}

export async function updateGiftCard(id, input) {
  const sets = [];
  const params = [id];
  for (const [key, column] of [
    ['isActive', 'is_active'],
    ['expiresAt', 'expires_at'],
    ['recipientName', 'recipient_name'],
    ['recipientEmail', 'recipient_email'],
    ['senderName', 'sender_name'],
    ['message', 'message'],
  ]) {
    if (input[key] !== undefined) sets.push(`${column} = $${params.push(input[key])}`);
  }
  if (sets.length) {
    const row = await queryOne(`UPDATE gift_cards SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, params);
    if (!row) throw notFound('Gift card not found');
  }
  return getGiftCard(id);
}

/** Adds to (positive) or takes from (negative) a card's balance, with a note. */
export async function adjustGiftCard(id, amount, note, adminId) {
  await transaction(async (db) => {
    const card = await queryOne('SELECT id, balance FROM gift_cards WHERE id = $1 FOR UPDATE', [id], db);
    if (!card) throw notFound('Gift card not found');
    if (card.balance + amount < 0) {
      throw badRequest(`The balance is only ${formatMoney(card.balance)}`, [{ path: 'amount', message: 'More than the balance' }]);
    }
    await query('UPDATE gift_cards SET balance = balance + $2 WHERE id = $1', [id, amount], db);
    await addTransaction(db, { cardId: id, kind: 'adjust', amount, note, by: adminId });
  });
  return getGiftCard(id);
}

/** The full card (with code) for emailing the recipient. */
export async function giftCardForEmail(id) {
  const g = await queryOne(`SELECT ${CARD_COLUMNS} FROM gift_cards g WHERE g.id = $1`, [id]);
  if (!g) throw notFound('Gift card not found');
  return { ...g, code: formatGiftCardCode(g.code) };
}
