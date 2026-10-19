import { Router } from 'express';
import { z } from 'zod';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { markOrderPaid, markPaymentFailed, requireOrder } from '../services/orders.js';
import { assertGatewayEnabled, findPayment, stripe, verifyRazorpaySignature } from '../services/payments.js';

const router = Router();
router.use(requireAuth);

/** Loads our payment record and checks it belongs to the logged-in user (and order number, if given). */
async function ownPayment(req, gateway, gatewayOrderId, orderNumber) {
  const payment = await findPayment(gateway, gatewayOrderId);
  if (!payment || payment.userId !== req.user.id || (orderNumber && payment.orderNumber !== orderNumber)) {
    throw notFound('Payment not found');
  }
  return payment;
}

// --- Razorpay ---------------------------------------------------------------
const razorpayVerifySchema = z.object({
  orderNumber: z.string().max(40),
  razorpayOrderId: z.string().max(100),
  razorpayPaymentId: z.string().max(100),
  razorpaySignature: z.string().max(200),
});

router.post('/razorpay/verify', async (req, res) => {
  assertGatewayEnabled('razorpay');
  const body = parse(razorpayVerifySchema, req.body);
  const payment = await ownPayment(req, 'razorpay', body.razorpayOrderId, body.orderNumber);
  if (!verifyRazorpaySignature(body)) {
    throw new AppError(400, 'PAYMENT_VERIFICATION_FAILED', 'We could not verify this payment. If money was deducted, it will be refunded automatically.');
  }
  const order = await markOrderPaid({
    orderId: payment.orderId,
    gateway: 'razorpay',
    gatewayOrderId: body.razorpayOrderId,
    gatewayPaymentId: body.razorpayPaymentId,
  });
  res.json({ order: await requireOrder({ id: order.id, userId: req.user.id }) });
});

const razorpayFailedSchema = z.object({
  orderNumber: z.string().max(40),
  razorpayOrderId: z.string().max(100),
  razorpayPaymentId: z.string().max(100).optional(),
  error: z
    .object({
      code: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
      reason: z.string().max(200).optional(),
    })
    .partial()
    .optional(),
});

router.post('/razorpay/failed', async (req, res) => {
  const body = parse(razorpayFailedSchema, req.body);
  const payment = await ownPayment(req, 'razorpay', body.razorpayOrderId, body.orderNumber);
  await markPaymentFailed({
    gateway: 'razorpay',
    gatewayOrderId: body.razorpayOrderId,
    gatewayPaymentId: body.razorpayPaymentId,
    error: body.error?.description ?? body.error?.reason ?? 'Payment failed',
  });
  res.json({ order: await requireOrder({ id: payment.orderId, userId: req.user.id }) });
});

// --- Stripe -----------------------------------------------------------------
router.post('/stripe/verify', async (req, res) => {
  assertGatewayEnabled('stripe');
  const { sessionId } = parse(z.object({ sessionId: z.string().startsWith('cs_').max(300) }), req.body);
  const payment = await ownPayment(req, 'stripe', sessionId);

  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.orderId !== payment.orderId) throw badRequest('Session does not match this order');

  if (session.payment_status === 'paid') {
    await markOrderPaid({
      orderId: payment.orderId,
      gateway: 'stripe',
      gatewayOrderId: session.id,
      gatewayPaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      amount: session.amount_total,
    });
  }
  // Otherwise (e.g. async payment methods still processing) the webhook will complete it.
  res.json({ order: await requireOrder({ id: payment.orderId, userId: req.user.id }) });
});

// --- Mock (development only) --------------------------------------------------
router.post('/mock/complete', async (req, res) => {
  assertGatewayEnabled('mock');
  const body = parse(
    z.object({ orderNumber: z.string().max(40), mockPaymentId: z.string().startsWith('mock_'), outcome: z.enum(['success', 'failure']) }),
    req.body,
  );
  const payment = await ownPayment(req, 'mock', body.mockPaymentId, body.orderNumber);
  if (body.outcome === 'success') {
    await markOrderPaid({ orderId: payment.orderId, gateway: 'mock', gatewayOrderId: body.mockPaymentId, gatewayPaymentId: `${body.mockPaymentId}_pay` });
  } else {
    await markPaymentFailed({ gateway: 'mock', gatewayOrderId: body.mockPaymentId, error: 'Simulated payment failure' });
  }
  res.json({ order: await requireOrder({ id: payment.orderId, userId: req.user.id }) });
});

export default router;
