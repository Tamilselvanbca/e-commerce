import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { formatMoney, generateOrderNumber } from '../lib/util.js';
import { lockDiscount, resolveDiscount } from './discounts.js';
import {
  adminNewOrderEmail,
  giftCardEmail,
  orderCancelledEmail,
  orderConfirmedEmail,
  orderDeliveredEmail,
  orderShippedEmail,
  queueEmail,
} from './email.js';
import {
  findUsableGiftCard,
  formatGiftCardCode,
  giftCardForEmail,
  giftCardPortion,
  issuePurchasedGiftCards,
  maskGiftCardCode,
  reclaimGiftCardForOrder,
  redeemGiftCard,
  refundGiftCardForOrder,
} from './gift-cards.js';
import { queueOrderStatusSms } from './sms.js';

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

/** Allowed admin status transitions. */
export const TRANSITIONS = {
  pending: ['cancelled'],
  confirmed: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const DOMESTIC_COUNTRY = 'IN';

/** Shipping rule for a destination country. A threshold of 0 means "never free" abroad. */
export function shippingRule(country = DOMESTIC_COUNTRY) {
  const s = config.store;
  return country === DOMESTIC_COUNTRY
    ? { fee: s.shippingFee, freeThreshold: s.freeShippingThreshold, international: false }
    : { fee: s.internationalShippingFee, freeThreshold: s.internationalFreeShippingThreshold || null, international: true };
}

export function computeTotals(subtotal, country = DOMESTIC_COUNTRY) {
  const rule = shippingRule(country);
  const free = subtotal === 0 || (rule.freeThreshold !== null && subtotal >= rule.freeThreshold);
  const shipping = free ? 0 : rule.fee;
  return { subtotal, shippingFee: shipping, discount: 0, total: subtotal + shipping };
}

/**
 * Prices a cart: shipping, the best discount (a typed code or an automatic
 * offer) and an optional gift card. Read-only; checkout re-checks with locks.
 */
export async function priceOrder({ subtotal, country = DOMESTIC_COUNTRY, userId, couponCode, giftCardCode }, db = pool) {
  const { shippingFee } = computeTotals(subtotal, country);
  const ctx = { code: couponCode, subtotal, shippingFee, international: country !== DOMESTIC_COUNTRY, userId };
  const { applied, code, hint } = subtotal > 0 ? await resolveDiscount(ctx, db) : { applied: null, code: null, hint: null };
  const discount = applied?.amount ?? 0;
  const total = subtotal + shippingFee - discount;

  let giftCard = null;
  if (giftCardCode) {
    const found = await findUsableGiftCard(giftCardCode, { db });
    giftCard = found.card ? { card: found.card, amount: giftCardPortion(found.card.balance, total) } : { error: found.error, code: found.code };
  }
  const giftCardAmount = giftCard?.amount ?? 0;
  return { subtotal, shippingFee, discount, total, giftCardAmount, amountDue: total - giftCardAmount, applied, code, hint, giftCard };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
const ITEM_AGGREGATES = `
  (SELECT coalesce(sum(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count,
  (SELECT image_url FROM order_items WHERE order_id = o.id AND image_url IS NOT NULL LIMIT 1) AS preview_image`;
const SUMMARY_COLUMNS = `
  o.id, o.order_number, o.kind, o.status, o.payment_status, o.payment_gateway, o.total, o.created_at, ${ITEM_AGGREGATES}`;

function toSummary(r, withCustomer = false) {
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    kind: r.kind,
    status: r.status,
    paymentStatus: r.paymentStatus,
    paymentGateway: r.paymentGateway,
    total: r.total,
    itemCount: r.itemCount,
    previewImage: r.previewImage,
    createdAt: r.createdAt,
    ...(withCustomer ? { customer: { id: r.userId, name: r.customerName, phone: r.customerPhone } } : {}),
  };
}

/**
 * Lists orders. For customers pass `userId`; admins may filter by status,
 * paymentStatus, q (order number / phone / name) and a created_at range.
 */
export async function listOrders({ userId, status, paymentStatus, q, from, to, page, pageSize, admin = false }) {
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (userId) where.push(`o.user_id = ${add(userId)}`);
  if (status) where.push(`o.status = ${add(status)}`);
  if (paymentStatus) where.push(`o.payment_status = ${add(paymentStatus)}`);
  if (from) where.push(`o.created_at >= ${add(from)}`);
  if (to) where.push(`o.created_at < DATE_ADD(${add(to)}, INTERVAL 1 DAY)`);
  if (q) {
    const like = add(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(o.order_number LIKE ${like} OR u.phone LIKE ${like} OR u.name LIKE ${like} OR o.email LIKE ${like})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(
    `SELECT ${SUMMARY_COLUMNS}, o.user_id, u.name AS customer_name, u.phone AS customer_phone,
            count(*) OVER() AS full_count
       FROM orders o JOIN users u ON u.id = o.user_id
       ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ${add(pageSize)} OFFSET ${add((page - 1) * pageSize)}`,
    params,
  );
  const total = rows[0]?.fullCount ?? 0;
  return {
    items: rows.map((r) => toSummary(r, admin)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Loads a full order. Pass `userId` to restrict to that customer's orders. */
export async function getOrder({ orderNumber, id, userId, admin = false }, db = pool) {
  const params = [orderNumber ?? id];
  let where = orderNumber ? 'o.order_number = $1' : 'o.id = $1';
  if (userId) {
    params.push(userId);
    where += ' AND o.user_id = $2';
  }
  const o = await queryOne(
    `SELECT o.*, ${ITEM_AGGREGATES}, (SELECT code FROM gift_cards g WHERE g.id = o.gift_card_id) AS gift_card_code
       FROM orders o WHERE ${where}`,
    params,
    db,
  );
  if (!o) return null;

  const [rawItems, history, shipment] = await Promise.all([
    query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.product_slug, oi.sku, oi.size, oi.color, oi.image_url,
              oi.unit_price, oi.quantity, oi.line_total, oi.gift_card_details,
              g.id AS issued_card_id, g.code AS issued_card_code
         FROM order_items oi LEFT JOIN gift_cards g ON g.order_item_id = oi.id
        WHERE oi.order_id = $1 ORDER BY oi.product_name, oi.size`,
      [o.id],
      db,
    ),
    query('SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id', [o.id], db),
    queryOne(
      'SELECT provider, courier, awb, tracking_url, shipped_at, delivered_at, provider_shipment_id FROM shipments WHERE order_id = $1',
      [o.id],
      db,
    ),
  ]);

  // Gift card lines carry the recipient and, once paid, the card that was issued.
  const items = rawItems.map(({ giftCardDetails, issuedCardId, issuedCardCode, ...item }) => ({
    ...item,
    giftCard: giftCardDetails
      ? {
          ...giftCardDetails,
          code: issuedCardCode ? (admin ? formatGiftCardCode(issuedCardCode) : maskGiftCardCode(issuedCardCode)) : null,
          ...(admin ? { id: issuedCardId } : {}),
        }
      : null,
  }));

  const unpaid = o.paymentStatus !== 'paid' && o.paymentStatus !== 'refunded';
  const order = {
    ...toSummary(o),
    currency: o.currency,
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    discount: o.discount,
    discountCode: o.discountCode,
    discountTitle: o.discountTitle,
    giftCardAmount: o.giftCardAmount,
    amountDue: o.amountDue,
    giftCard: o.giftCardCode
      ? { code: admin ? formatGiftCardCode(o.giftCardCode) : maskGiftCardCode(o.giftCardCode), ...(admin ? { id: o.giftCardId } : {}) }
      : null,
    email: o.email,
    phone: o.phone,
    notes: o.notes,
    shippingAddress: o.shippingAddress,
    items,
    statusHistory: history,
    shipment: shipment
      ? {
          provider: shipment.provider,
          courier: shipment.courier,
          awb: shipment.awb,
          trackingUrl: shipment.trackingUrl,
          shippedAt: shipment.shippedAt,
          deliveredAt: shipment.deliveredAt,
          ...(admin ? { providerShipmentId: shipment.providerShipmentId } : {}),
        }
      : null,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    cancelledAt: o.cancelledAt,
    canPay: o.status === 'pending' && unpaid && Boolean(o.expiresAt) && new Date(o.expiresAt) > new Date(),
    canCancel: o.status === 'pending' && unpaid,
    userId: o.userId,
  };
  if (!admin) delete order.userId;
  return order;
}

export async function requireOrder(opts, db) {
  const order = await getOrder(opts, db);
  if (!order) throw notFound('Order not found');
  return order;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
export async function addHistory(orderId, status, note, createdBy = null, db = pool) {
  await query(
    'INSERT INTO order_status_history (order_id, status, note, created_by) VALUES ($1, $2, $3, $4)',
    [orderId, status, note ?? null, createdBy],
    db,
  );
}

/**
 * Inserts a pending order (`columns` are trusted column names → values) with a new
 * id, order number and payment deadline. Returns { id, orderNumber }.
 */
async function insertOrder(db, columns) {
  for (let attempt = 0; ; attempt++) {
    const row = { id: randomUUID(), order_number: generateOrderNumber(), status: 'pending', payment_status: 'pending', currency: config.store.currency, ...columns };
    const names = Object.keys(row);
    // Savepoint so an order-number collision can be retried without aborting the transaction.
    await db.query('SAVEPOINT order_insert');
    try {
      await query(
        `INSERT INTO orders (${names.join(', ')}, expires_at)
         VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}, NOW(3) + INTERVAL $${names.length + 1} MINUTE)`,
        [...Object.values(row), config.store.paymentTimeoutMinutes],
        db,
      );
      return { id: row.id, orderNumber: row.order_number };
    } catch (err) {
      // Retry on the (very unlikely) order number collision.
      if (err.code === '23505' && err.constraint === 'orders_order_number_key' && attempt < 5) {
        await db.query('ROLLBACK TO SAVEPOINT order_insert');
        continue;
      }
      throw err;
    }
  }
}

/** Returns reserved stock of an order to inventory. */
async function releaseStock(orderId, db) {
  await query(
    `UPDATE product_variants v JOIN order_items oi ON oi.variant_id = v.id
        SET v.stock = v.stock + oi.quantity
      WHERE oi.order_id = $1`,
    [orderId],
    db,
  );
}

/**
 * Cancels an order inside an existing transaction and releases its stock.
 * Callers must hold a row lock on the order.
 */
async function cancelLocked(order, { reason, by = null, db }) {
  await releaseStock(order.id, db);
  const returned = await refundGiftCardForOrder(db, order.id, `Order cancelled: ${reason}`);
  await query(
    `UPDATE orders SET status = 'cancelled', cancelled_at = now(),
            payment_status = CASE WHEN payment_status = 'pending' THEN 'failed' ELSE payment_status END
      WHERE id = $1`,
    [order.id],
    db,
  );
  const note = returned ? `${reason}. ${formatMoney(returned)} was returned to the gift card.` : reason;
  await addHistory(order.id, 'cancelled', note, by, db);
}

/**
 * Creates an order from the user's cart, reserving stock atomically.
 * Earlier unpaid orders of the same user are cancelled first so their stock
 * (and gift card balance) is not held twice. The discount and gift card are
 * re-checked with their rows locked; problems throw COUPON_INVALID or
 * GIFT_CARD_INVALID so the customer is never charged a different amount.
 */
export async function createOrderFromCart({ user, cartId, address, email, notes, gateway, couponCode, giftCardCode }) {
  const orderId = await transaction(async (db) => {
    // Release stock held by the user's previous unpaid orders (gift card purchases hold none).
    const stale = await query(
      `SELECT id FROM orders WHERE user_id = $1 AND kind = 'goods' AND status = 'pending' AND payment_status <> 'paid' FOR UPDATE`,
      [user.id],
      db,
    );
    for (const o of stale) await cancelLocked(o, { reason: 'Replaced by a newer checkout', db });

    // Lock the variants in a stable order to avoid deadlocks between concurrent checkouts.
    const lines = await query(
      `SELECT ci.variant_id, ci.quantity, v.sku, v.size, v.color, v.price, v.stock, v.is_active,
              p.id AS product_id, p.name AS product_name, p.slug AS product_slug, p.status AS product_status,
              (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url
         FROM cart_items ci
         JOIN product_variants v ON v.id = ci.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE ci.cart_id = $1
        ORDER BY v.id
        FOR UPDATE`,
      [cartId],
      db,
    );
    if (lines.length === 0) throw conflict('CART_EMPTY', 'Your cart is empty');

    const problems = lines
      .filter((l) => !l.isActive || l.productStatus !== 'active' || l.stock < l.quantity)
      .map((l) => ({
        variantId: l.variantId,
        productName: l.productName,
        requested: l.quantity,
        available: l.isActive && l.productStatus === 'active' ? l.stock : 0,
      }));
    if (problems.length) {
      const first = problems[0];
      throw conflict(
        'OUT_OF_STOCK',
        first.available > 0
          ? `Only ${first.available} left of ${first.productName}. Please update your cart.`
          : `${first.productName} is no longer available. Please update your cart.`,
        { items: problems },
      );
    }

    for (const l of lines) {
      await query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [l.quantity, l.variantId], db);
    }

    const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);
    const { shippingFee } = computeTotals(subtotal, address.country);

    const ctx = { code: couponCode, subtotal, shippingFee, international: address.country !== DOMESTIC_COUNTRY, userId: user.id };
    const { applied, code } = await resolveDiscount(ctx, db);
    if (code && !code.applied && !code.outranked) throw conflict('COUPON_INVALID', code.message, { code: code.code });
    const discount = applied ? await lockDiscount(applied.discount.id, ctx, db) : null;
    const discountAmount = applied?.amount ?? 0;
    const total = subtotal + shippingFee - discountAmount;

    let giftCard = null;
    let giftCardAmount = 0;
    if (giftCardCode) {
      const found = await findUsableGiftCard(giftCardCode, { db, lock: true });
      if (found.error) throw conflict('GIFT_CARD_INVALID', found.error);
      giftCardAmount = giftCardPortion(found.card.balance, total);
      if (giftCardAmount > 0) giftCard = found.card;
    }

    const shippingAddress = {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
    };

    const order = await insertOrder(db, {
      user_id: user.id,
      payment_gateway: gateway,
      subtotal,
      shipping_fee: shippingFee,
      discount: discountAmount,
      total,
      email,
      phone: user.phone,
      shipping_address: JSON.stringify(shippingAddress),
      notes,
      discount_id: discount?.id ?? null,
      discount_code: discount?.code ?? null,
      discount_title: discount?.title ?? null,
      gift_card_id: giftCard?.id ?? null,
      gift_card_amount: giftCardAmount,
    });

    for (const l of lines) {
      await query(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, product_slug, sku, size, color,
                                  image_url, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [order.id, l.productId, l.variantId, l.productName, l.productSlug, l.sku, l.size, l.color,
          l.imageUrl, l.price, l.quantity, l.price * l.quantity],
        db,
      );
    }
    if (giftCard) {
      await redeemGiftCard(db, { cardId: giftCard.id, orderId: order.id, amount: giftCardAmount, note: `Order ${order.orderNumber}` });
    }
    await addHistory(order.id, 'pending', 'Order placed, awaiting payment', user.id, db);
    return order.id;
  });

  return requireOrder({ id: orderId });
}

/**
 * Creates an unpaid gift card purchase (kind 'gift_card': no address, no
 * stock, no discounts). The card is issued when the payment arrives.
 */
export async function createGiftCardOrder({ user, email, gateway, amount, recipientName, recipientEmail, senderName, message }) {
  const orderId = await transaction(async (db) => {
    const order = await insertOrder(db, {
      user_id: user.id,
      kind: 'gift_card',
      payment_gateway: gateway,
      subtotal: amount,
      shipping_fee: 0,
      discount: 0,
      total: amount,
      email,
      phone: user.phone,
      shipping_address: null,
    });
    await query(
      `INSERT INTO order_items (order_id, product_name, sku, unit_price, quantity, line_total, gift_card_details)
       VALUES ($1, $2, 'GIFT-CARD', $3, 1, $3, $4)`,
      [order.id, `${config.store.name} gift card for ${recipientName}`, amount,
        JSON.stringify({ recipientName, recipientEmail, senderName, message })],
      db,
    );
    await addHistory(order.id, 'pending', 'Gift card order placed, awaiting payment', user.id, db);
    return order.id;
  });
  return requireOrder({ id: orderId });
}

/**
 * Records a successful payment. Idempotent: calling it again for an already
 * paid order is a no-op. Returns the up-to-date order. Paid gift card orders
 * get their cards issued and emailed and are marked delivered.
 */
export async function markOrderPaid({ orderId, gateway, gatewayOrderId, gatewayPaymentId, amount, raw }) {
  const result = await transaction(async (db) => {
    const o = await queryOne(
      `SELECT id, order_number, kind, user_id, status, payment_status, amount_due, gift_card_id, gift_card_amount
         FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
      db,
    );
    if (!o) throw notFound('Order not found');

    await query(
      `UPDATE payments SET status = 'paid', gateway_payment_id = coalesce($3, gateway_payment_id), raw = coalesce($4, raw), error = NULL
        WHERE gateway = $1 AND gateway_order_id = $2`,
      [gateway, gatewayOrderId, gatewayPaymentId, raw ? JSON.stringify(raw) : null],
      db,
    );

    if (o.paymentStatus === 'paid' || o.paymentStatus === 'refunded') return { newlyPaid: false };

    if (amount != null && amount !== o.amountDue) {
      // Never happens with signed gateway data unless something is badly wrong; flag for review.
      logger.error({ orderId, amount, expected: o.amountDue }, 'Payment amount mismatch');
      await addHistory(o.id, o.status, `Payment amount mismatch: received ${amount}, expected ${o.amountDue}. Review required.`, null, db);
      return { newlyPaid: false };
    }

    const label = { razorpay: 'Razorpay', stripe: 'Stripe', mock: 'test payment' }[gateway] ?? gateway;
    let note =
      gateway === 'gift_card'
        ? 'Paid in full by gift card'
        : `Payment received via ${label}${gatewayPaymentId ? ` (ref. ${gatewayPaymentId})` : ''}`;
    if (o.status === 'cancelled') {
      // Payment arrived after the order expired: try to re-reserve the stock.
      const items = await query('SELECT variant_id, quantity FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL ORDER BY variant_id', [o.id], db);
      let shortfall = false;
      for (const it of items) {
        const r = await db.query(
          'UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
          [it.quantity, it.variantId],
        );
        if (r.rowCount === 0) shortfall = true;
      }
      note += shortfall
        ? '. Payment arrived after the order had expired and some items are out of stock. Please review (refund or restock).'
        : '. Payment arrived after the order had expired; the order was reinstated.';
      // The cancellation put the gift card amount back on the card; take it again.
      const reclaimed = await reclaimGiftCardForOrder(db, { orderId: o.id, giftCardId: o.giftCardId, amount: o.giftCardAmount });
      if (!reclaimed) note += ` The gift card no longer covers its ${formatMoney(o.giftCardAmount)} share; please collect the difference or refund.`;
    }

    await query(
      `UPDATE orders SET payment_status = 'paid', status = 'confirmed', payment_gateway = $2,
              paid_at = now(), expires_at = NULL, cancelled_at = NULL
        WHERE id = $1`,
      [o.id, gateway],
      db,
    );
    await addHistory(o.id, 'confirmed', note, null, db);

    if (o.kind === 'gift_card') {
      // Digital delivery: issue the card(s) now; they are emailed after commit.
      const cardIds = await issuePurchasedGiftCards(db, o);
      await query(`UPDATE orders SET status = 'delivered' WHERE id = $1`, [o.id], db);
      await addHistory(o.id, 'delivered', 'Gift card issued and emailed to the recipient', null, db);
      return { newlyPaid: true, cardIds };
    }

    // Remove the purchased items from the customer's cart.
    await query(
      `DELETE ci FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1
          AND ci.variant_id IN (SELECT variant_id FROM order_items WHERE order_id = $2)`,
      [o.userId, o.id],
      db,
    );
    return { newlyPaid: true, cardIds: [] };
  });

  const order = await requireOrder({ id: orderId, admin: true });
  if (result.newlyPaid) {
    for (const cardId of result.cardIds) {
      const message = giftCardEmail(await giftCardForEmail(cardId));
      if (message) queueEmail(message);
    }
    queueEmail(orderConfirmedEmail(order));
    if (order.kind === 'goods') queueOrderStatusSms(order, 'confirmed');
    const adminMail = adminNewOrderEmail(order);
    if (adminMail) queueEmail(adminMail);
  }
  return order;
}

/** Records a failed payment attempt. The order stays payable until it expires. */
export async function markPaymentFailed({ gateway, gatewayOrderId, gatewayPaymentId, error, raw }) {
  await query(
    `UPDATE payments SET status = CASE WHEN status = 'paid' THEN status ELSE 'failed' END,
            gateway_payment_id = coalesce($3, gateway_payment_id), error = $4, raw = coalesce($5, raw)
      WHERE gateway = $1 AND gateway_order_id = $2`,
    [gateway, gatewayOrderId, gatewayPaymentId ?? null, error?.slice(0, 500) ?? 'Payment failed', raw ? JSON.stringify(raw) : null],
  );
  const payment = await queryOne('SELECT order_id, status FROM payments WHERE gateway = $1 AND gateway_order_id = $2', [gateway, gatewayOrderId]);
  if (!payment) return null;
  if (payment.status === 'failed') {
    // Only orders still awaiting payment are affected; the customer can retry until expiry.
    const { rowCount } = await pool.query(
      `UPDATE orders SET payment_status = 'failed'
        WHERE id = $1 AND status = 'pending' AND payment_status IN ('pending', 'failed')`,
      [payment.orderId],
    );
    if (rowCount > 0) await addHistory(payment.orderId, 'pending', `Payment attempt failed: ${error ?? 'unknown reason'}`);
  }
  return payment.orderId;
}

/** Cancels an unpaid pending order by id (e.g. when the gateway could not be reached). */
export async function cancelOrderById(orderId, reason) {
  await transaction(async (db) => {
    const o = await queryOne('SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE', [orderId], db);
    if (o && o.status === 'pending' && o.paymentStatus !== 'paid') await cancelLocked(o, { reason, db });
  });
}

/** Customer-initiated cancellation of an unpaid order. */
export async function cancelUnpaidOrder(orderNumber, userId) {
  await transaction(async (db) => {
    const o = await queryOne(
      'SELECT id, status, payment_status FROM orders WHERE order_number = $1 AND user_id = $2 FOR UPDATE',
      [orderNumber, userId],
      db,
    );
    if (!o) throw notFound('Order not found');
    if (o.status !== 'pending' || o.paymentStatus === 'paid') {
      throw conflict('ORDER_NOT_CANCELLABLE', 'This order can no longer be cancelled online. Please contact support.');
    }
    await cancelLocked(o, { reason: 'Cancelled by customer', by: userId, db });
  });
  return requireOrder({ orderNumber, userId });
}

/** Admin status change with transition rules, stock release and customer emails. */
export async function adminUpdateStatus(orderNumber, nextStatus, note, adminId) {
  const orderId = await transaction(async (db) => {
    const o = await queryOne('SELECT id, status, payment_status FROM orders WHERE order_number = $1 FOR UPDATE', [orderNumber], db);
    if (!o) throw notFound('Order not found');
    if (!TRANSITIONS[o.status].includes(nextStatus)) {
      throw badRequest(`Cannot change status from ${o.status} to ${nextStatus}`);
    }
    if (nextStatus === 'cancelled') {
      await cancelLocked(o, { reason: note || 'Cancelled by store', by: adminId, db });
    } else {
      await query('UPDATE orders SET status = $2 WHERE id = $1', [o.id, nextStatus], db);
      await addHistory(o.id, nextStatus, note, adminId, db);
      if (nextStatus === 'shipped') {
        await query(
          `INSERT INTO shipments (order_id, provider, shipped_at) VALUES ($1, 'manual', NOW(3))
           ON DUPLICATE KEY UPDATE shipped_at = coalesce(shipped_at, VALUES(shipped_at))`,
          [o.id],
          db,
        );
      }
      if (nextStatus === 'delivered') {
        await query('UPDATE shipments SET delivered_at = now() WHERE order_id = $1', [o.id], db);
      }
    }
    return o.id;
  });

  const order = await requireOrder({ id: orderId, admin: true });
  notifyStatusChange(order, nextStatus, note);
  return order;
}

export function notifyStatusChange(order, status, note) {
  if (status === 'shipped') queueEmail(orderShippedEmail(order));
  else if (status === 'delivered') queueEmail(orderDeliveredEmail(order));
  else if (status === 'cancelled') queueEmail(orderCancelledEmail(order, note));
  queueOrderStatusSms(order, status);
}

/** Saves courier/AWB details and moves the order to "shipped". */
export async function recordShipment(orderNumber, { provider = 'manual', courier, awb, trackingUrl, providerOrderId, providerShipmentId, raw }, adminId) {
  const orderId = await transaction(async (db) => {
    const o = await queryOne('SELECT id, status FROM orders WHERE order_number = $1 FOR UPDATE', [orderNumber], db);
    if (!o) throw notFound('Order not found');
    if (!['confirmed', 'processing', 'shipped'].includes(o.status)) {
      throw badRequest('Only confirmed or processing orders can be shipped');
    }
    await query(
      `INSERT INTO shipments (order_id, provider, courier, awb, tracking_url, provider_order_id, provider_shipment_id, raw, shipped_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(3))
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider), courier = VALUES(courier), awb = VALUES(awb),
         tracking_url = VALUES(tracking_url),
         provider_order_id = coalesce(VALUES(provider_order_id), provider_order_id),
         provider_shipment_id = coalesce(VALUES(provider_shipment_id), provider_shipment_id),
         raw = coalesce(VALUES(raw), raw),
         shipped_at = coalesce(shipped_at, VALUES(shipped_at))`,
      [o.id, provider, courier, awb, trackingUrl ?? null, providerOrderId ?? null, providerShipmentId ?? null, raw ? JSON.stringify(raw) : null],
      db,
    );
    const wasShipped = o.status === 'shipped';
    if (!wasShipped) await query(`UPDATE orders SET status = 'shipped' WHERE id = $1`, [o.id], db);
    await addHistory(o.id, 'shipped', `Shipped via ${courier ?? provider}${awb ? `, AWB ${awb}` : ''}`, adminId, db);
    return { id: o.id, wasShipped };
  });

  const order = await requireOrder({ id: orderId.id, admin: true });
  if (!orderId.wasShipped) notifyStatusChange(order, 'shipped');
  return order;
}

export async function markRefunded(orderNumber, adminId) {
  const o = await queryOne('SELECT id, status, payment_status FROM orders WHERE order_number = $1', [orderNumber]);
  if (!o) throw notFound('Order not found');
  if (o.paymentStatus !== 'paid' || o.status !== 'cancelled') {
    throw badRequest('Only cancelled orders with a captured payment can be marked as refunded');
  }
  await query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [o.id]);
  await addHistory(o.id, 'cancelled', 'Payment refunded', adminId);
  return requireOrder({ id: o.id, admin: true });
}

/** Cancels unpaid orders whose payment window has passed, releasing stock. */
export async function expireStaleOrders() {
  const stale = await query(
    `SELECT id FROM orders WHERE status = 'pending' AND payment_status <> 'paid' AND expires_at < now() LIMIT 100`,
  );
  let expired = 0;
  for (const { id } of stale) {
    try {
      await transaction(async (db) => {
        const o = await queryOne(
          `SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE SKIP LOCKED`,
          [id],
          db,
        );
        if (!o || o.status !== 'pending' || o.paymentStatus === 'paid') return;
        await cancelLocked(o, { reason: 'Payment not completed in time', db });
        expired++;
      });
    } catch (err) {
      logger.error({ err, orderId: id }, 'Failed to expire order');
    }
  }
  return expired;
}

export function assertPayable(order) {
  if (!order.canPay) {
    throw new AppError(409, 'ORDER_NOT_PAYABLE', order.paymentStatus === 'paid'
      ? 'This order has already been paid'
      : 'This order can no longer be paid. Please place a new order.');
  }
}
