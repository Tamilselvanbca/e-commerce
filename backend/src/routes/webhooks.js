// Payment gateway webhooks. Mounted before the JSON body parser because
// signature verification needs the exact raw request body.
import express, { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { markOrderPaid, markPaymentFailed } from '../services/orders.js';
import { constructStripeEvent, findPayment, verifyRazorpayWebhook } from '../services/payments.js';

const router = Router();
router.use(express.raw({ type: '*/*', limit: '1mb' }));

/**
 * Runs `handler` at most once per (gateway, eventId). If the handler throws,
 * the record is removed so the gateway's retry is processed.
 */
async function once(gateway, eventId, type, handler) {
  if (!eventId) return handler();
  const inserted = await queryOne(
    `INSERT INTO webhook_events (gateway, event_id, type) VALUES ($1, $2, $3)
     ON CONFLICT (gateway, event_id) DO NOTHING RETURNING id`,
    [gateway, eventId, type],
  );
  if (!inserted) return; // duplicate delivery
  try {
    await handler();
  } catch (err) {
    await query('DELETE FROM webhook_events WHERE id = $1', [inserted.id]);
    throw err;
  }
}

// --- Razorpay ---------------------------------------------------------------
router.post('/razorpay', async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (!verifyRazorpayWebhook(raw, req.get('x-razorpay-signature'))) {
    logger.warn('Rejected Razorpay webhook with invalid signature');
    return res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
  }
  const event = JSON.parse(raw);
  const eventId = req.get('x-razorpay-event-id') ?? null;

  await once('razorpay', eventId, event.event, async () => {
    const pay = event.payload?.payment?.entity;
    const rzOrderId = pay?.order_id ?? event.payload?.order?.entity?.id;
    if (!rzOrderId) return;
    const payment = await findPayment('razorpay', rzOrderId);
    if (!payment) {
      logger.warn({ rzOrderId, type: event.event }, 'Razorpay webhook for unknown order');
      return;
    }
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      await markOrderPaid({
        orderId: payment.orderId,
        gateway: 'razorpay',
        gatewayOrderId: rzOrderId,
        gatewayPaymentId: pay?.id,
        amount: pay?.amount ?? event.payload?.order?.entity?.amount_paid,
      });
    } else if (event.event === 'payment.failed') {
      await markPaymentFailed({
        gateway: 'razorpay',
        gatewayOrderId: rzOrderId,
        gatewayPaymentId: pay?.id,
        error: pay?.error_description ?? 'Payment failed',
      });
    }
  });
  res.json({ received: true });
});

// --- Stripe -----------------------------------------------------------------
router.post('/stripe', async (req, res) => {
  let event;
  try {
    event = constructStripeEvent(req.body, req.get('stripe-signature'));
  } catch (err) {
    logger.warn({ err: err.message }, 'Rejected Stripe webhook');
    return res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
  }

  await once('stripe', event.id, event.type, async () => {
    if (!event.type.startsWith('checkout.session.')) return;
    const session = event.data.object;
    const payment = await findPayment('stripe', session.id);
    if (!payment) {
      logger.warn({ sessionId: session.id, type: event.type }, 'Stripe webhook for unknown session');
      return;
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (session.payment_status === 'paid') {
          await markOrderPaid({
            orderId: payment.orderId,
            gateway: 'stripe',
            gatewayOrderId: session.id,
            gatewayPaymentId: paymentIntentId,
            amount: session.amount_total,
          });
        }
        break;
      case 'checkout.session.async_payment_failed':
        await markPaymentFailed({ gateway: 'stripe', gatewayOrderId: session.id, gatewayPaymentId: paymentIntentId, error: 'Payment failed' });
        break;
      case 'checkout.session.expired':
        await markPaymentFailed({ gateway: 'stripe', gatewayOrderId: session.id, error: 'Checkout session expired' });
        break;
      default:
        break;
    }
  });
  res.json({ received: true });
});

export default router;
