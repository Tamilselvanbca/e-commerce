import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, conflict } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { optionalText, parse, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loadCart, resolveCartId } from '../services/cart.js';
import { publicDiscount } from '../services/discounts.js';
import { formatGiftCardCode } from '../services/gift-cards.js';
import {
  cancelOrderById,
  createOrderFromCart,
  DOMESTIC_COUNTRY,
  markOrderPaid,
  priceOrder,
  requireOrder,
  shippingRule,
} from '../services/orders.js';
import { assertGatewayEnabled, enabledGateways, initPayment } from '../services/payments.js';
import { getAddress } from './addresses.js';

const router = Router();
router.use(requireAuth);

const codeField = z.string().trim().max(40).optional().transform((v) => v || undefined);

/**
 * Prices the cart. `addressId` sets domestic vs international shipping;
 * `couponCode` and `giftCardCode` preview a code before placing the order.
 */
router.get('/summary', async (req, res) => {
  const { addressId, couponCode, giftCardCode } = parse(
    z.object({ addressId: uuid.optional(), couponCode: codeField, giftCardCode: codeField }),
    req.query,
  );
  const country = addressId ? (await getAddress(req.user.id, addressId)).country : DOMESTIC_COUNTRY;
  const cart = await loadCart(await resolveCartId(req, res));
  const price = await priceOrder({ subtotal: cart.subtotal, country, userId: req.user.id, couponCode, giftCardCode });
  const rule = shippingRule(country);
  const card = price.giftCard?.card;
  res.json({
    cart,
    subtotal: price.subtotal,
    shippingFee: price.shippingFee,
    discount: price.discount,
    total: price.total,
    giftCardAmount: price.giftCardAmount,
    amountDue: price.amountDue,
    appliedDiscount: price.applied ? { ...publicDiscount(price.applied.discount), amount: price.applied.amount } : null,
    coupon: price.code ? { code: price.code.code, applied: price.code.applied, message: price.code.message } : null,
    offerHint: price.hint,
    giftCard: price.giftCard
      ? card
        ? { code: formatGiftCardCode(card.code), applied: true, balance: card.balance, amount: price.giftCardAmount, message: null }
        : { code: price.giftCard.code, applied: false, balance: null, amount: 0, message: price.giftCard.error }
      : null,
    freeShippingThreshold: rule.freeThreshold ?? 0,
    international: rule.international,
    gateways: enabledGateways(),
  });
});

const checkoutSchema = z.object({
  addressId: uuid,
  // "gift_card" when the gift card covers the whole amount.
  gateway: z.enum(['razorpay', 'stripe', 'mock', 'gift_card']),
  email: z.union([z.email('Enter a valid email address'), z.literal(''), z.null()]).optional(),
  notes: optionalText(500),
  couponCode: codeField,
  giftCardCode: codeField,
});

router.post('/', async (req, res) => {
  const body = parse(checkoutSchema, req.body);
  if (body.gateway === 'gift_card' && !body.giftCardCode) throw badRequest('Enter the gift card code');
  if (body.gateway !== 'gift_card') assertGatewayEnabled(body.gateway);

  const email = (body.email || req.user.email || '').toLowerCase() || null;
  if (!email) throw badRequest('Please provide an email address for order updates', [{ path: 'email', message: 'Email is required' }]);
  if (!req.user.email) {
    await query('UPDATE users SET email = $2 WHERE id = $1 AND email IS NULL', [req.user.id, email]);
  }

  const address = await getAddress(req.user.id, body.addressId);
  const cartId = await resolveCartId(req, res);
  if (!cartId) throw conflict('CART_EMPTY', 'Your cart is empty');

  const order = await createOrderFromCart({
    user: req.user,
    cartId,
    address,
    email,
    notes: body.notes,
    gateway: body.gateway === 'gift_card' ? null : body.gateway,
    couponCode: body.couponCode,
    giftCardCode: body.giftCardCode,
  });

  // Fully covered by the gift card: no payment gateway needed.
  if (order.amountDue === 0) {
    await markOrderPaid({ orderId: order.id, gateway: 'gift_card', gatewayOrderId: null, amount: 0 });
    return res.status(201).json({ order: await requireOrder({ id: order.id }), payment: { gateway: 'gift_card' } });
  }
  if (body.gateway === 'gift_card') {
    await cancelOrderById(order.id, 'The gift card did not cover the full amount');
    throw conflict('GIFT_CARD_INSUFFICIENT', 'Your gift card no longer covers the full amount. Please choose a payment method.');
  }

  let payment;
  try {
    payment = await initPayment(order, body.gateway, req.user);
  } catch (err) {
    // Gateway unavailable: release the stock straight away so the cart can be retried.
    logger.warn({ err, orderNumber: order.orderNumber }, 'Payment init failed; cancelling order');
    await cancelOrderById(order.id, 'Payment could not be started');
    throw err;
  }
  res.status(201).json({ order: await requireOrder({ id: order.id }), payment });
});

export default router;
