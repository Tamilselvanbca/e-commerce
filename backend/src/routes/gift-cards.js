import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { optionalText, parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { publicFormLimiter } from '../middleware/security.js';
import { GIFT_CARD_PURCHASE, giftCardBalance } from '../services/gift-cards.js';
import { cancelOrderById, createGiftCardOrder, requireOrder } from '../services/orders.js';
import { assertGatewayEnabled, initPayment } from '../services/payments.js';
import { formatMoney } from '../lib/util.js';

const router = Router();

// Balance check for anyone holding a code (no login needed). Codes are 80-bit random.
router.post('/balance', publicFormLimiter, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(1, 'Enter the gift card code').max(40) }), req.body);
  res.json(await giftCardBalance(code));
});

const purchaseSchema = z.object({
  amount: z
    .number({ error: 'Choose an amount' })
    .int()
    .min(GIFT_CARD_PURCHASE.min, `The minimum is ${formatMoney(GIFT_CARD_PURCHASE.min)}`)
    .max(GIFT_CARD_PURCHASE.max, `The maximum is ${formatMoney(GIFT_CARD_PURCHASE.max)}`)
    .refine((v) => v % 100 === 0, 'Use a whole rupee amount'),
  recipientName: z.string().trim().min(1, "Enter the recipient's name").max(100),
  recipientEmail: z.email('Enter a valid email address').transform((v) => v.toLowerCase()),
  senderName: optionalText(100),
  message: optionalText(500),
  gateway: z.enum(['razorpay', 'stripe', 'mock']),
  email: z.union([z.email('Enter a valid email address'), z.literal(''), z.null()]).optional(),
});

// Buy a gift card online. Same payment flow as checkout; the card is issued
// and emailed to the recipient once the payment is confirmed.
router.post('/purchase', requireAuth, async (req, res) => {
  const body = parse(purchaseSchema, req.body);
  assertGatewayEnabled(body.gateway);

  const email = (body.email || req.user.email || '').toLowerCase() || null;
  if (!email) throw badRequest('Please provide your email for the receipt', [{ path: 'email', message: 'Email is required' }]);
  if (!req.user.email) await query('UPDATE users SET email = $2 WHERE id = $1 AND email IS NULL', [req.user.id, email]);

  const order = await createGiftCardOrder({
    user: req.user,
    email,
    gateway: body.gateway,
    amount: body.amount,
    recipientName: body.recipientName,
    recipientEmail: body.recipientEmail,
    senderName: body.senderName ?? req.user.name ?? null,
    message: body.message,
  });

  let payment;
  try {
    payment = await initPayment(order, body.gateway, req.user);
  } catch (err) {
    logger.warn({ err, orderNumber: order.orderNumber }, 'Payment init failed; cancelling gift card order');
    await cancelOrderById(order.id, 'Payment could not be started');
    throw err;
  }
  res.status(201).json({ order: await requireOrder({ id: order.id }), payment });
});

export default router;
