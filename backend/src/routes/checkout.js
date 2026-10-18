import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, conflict } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { optionalText, parse, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loadCart, resolveCartId } from '../services/cart.js';
import {
  cancelOrderById,
  computeTotals,
  createOrderFromCart,
  DOMESTIC_COUNTRY,
  requireOrder,
  shippingRule,
} from '../services/orders.js';
import { assertGatewayEnabled, enabledGateways, initPayment } from '../services/payments.js';
import { getAddress } from './addresses.js';

const router = Router();
router.use(requireAuth);

// Pass `addressId` to price shipping for that address (domestic vs international).
router.get('/summary', async (req, res) => {
  const { addressId } = parse(z.object({ addressId: uuid.optional() }), req.query);
  const country = addressId ? (await getAddress(req.user.id, addressId)).country : DOMESTIC_COUNTRY;
  const cart = await loadCart(await resolveCartId(req, res));
  const totals = computeTotals(cart.subtotal, country);
  const rule = shippingRule(country);
  res.json({
    cart,
    ...totals,
    freeShippingThreshold: rule.freeThreshold ?? 0,
    international: rule.international,
    gateways: enabledGateways(),
  });
});

const checkoutSchema = z.object({
  addressId: uuid,
  gateway: z.enum(['razorpay', 'stripe', 'mock']),
  email: z.union([z.email('Enter a valid email address'), z.literal(''), z.null()]).optional(),
  notes: optionalText(500),
});

router.post('/', async (req, res) => {
  const body = parse(checkoutSchema, req.body);
  assertGatewayEnabled(body.gateway);

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
    gateway: body.gateway,
  });

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
