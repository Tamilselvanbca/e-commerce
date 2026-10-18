// Payment gateways:
//   razorpay: domestic (UPI, cards, net banking, wallets) via Razorpay Checkout
//   stripe:   international cards via Stripe Checkout (hosted page)
//   mock:     development-only simulated gateway (ENABLE_MOCK_PAYMENTS=true)
import Stripe from 'stripe';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { AppError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { hmacSha256, randomToken, safeEqual } from '../lib/util.js';

export function enabledGateways() {
  return [
    config.razorpay.enabled && 'razorpay',
    config.stripe.enabled && 'stripe',
    config.mockPayments.enabled && 'mock',
  ].filter(Boolean);
}

export function assertGatewayEnabled(gateway) {
  if (!enabledGateways().includes(gateway)) throw badRequest(`Payment method "${gateway}" is not available`);
}

const gatewayError = (message) => new AppError(502, 'GATEWAY_ERROR', message);

async function recordPayment(order, gateway, gatewayOrderId, raw) {
  await query(
    `INSERT INTO payments (order_id, gateway, gateway_order_id, amount, currency, status, raw)
     VALUES ($1, $2, $3, $4, $5, 'created', $6)`,
    [order.id, gateway, gatewayOrderId, order.total, order.currency, raw ? JSON.stringify(raw) : null],
  );
  await query('UPDATE orders SET payment_gateway = $2 WHERE id = $1', [order.id, gateway]);
}

// ---------------------------------------------------------------------------
// Razorpay (REST API, https://razorpay.com/docs/api/orders/)
// ---------------------------------------------------------------------------
async function razorpayRequest(method, path, body) {
  const { keyId, keySecret } = config.razorpay;
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error({ status: res.status, error: data?.error }, 'Razorpay API error');
    throw gatewayError(data?.error?.description ?? 'Could not start the Razorpay payment');
  }
  return data;
}

/** Verifies the checkout handler signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const expected = hmacSha256(config.razorpay.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  return safeEqual(expected, razorpaySignature);
}

/** Verifies the X-Razorpay-Signature header of a webhook (HMAC of the raw body). */
export function verifyRazorpayWebhook(rawBody, signature) {
  if (!config.razorpay.webhookSecret || !signature) return false;
  return safeEqual(hmacSha256(config.razorpay.webhookSecret, rawBody), signature);
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------
let stripeClient = null;
export function stripe() {
  if (!config.stripe.enabled) throw badRequest('Stripe is not configured');
  stripeClient ??= new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  return stripeClient;
}

export function constructStripeEvent(rawBody, signature) {
  if (!config.stripe.webhookSecret) throw badRequest('STRIPE_WEBHOOK_SECRET is not configured');
  // Signature verification only needs the webhook secret, not an API call.
  return Stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

function stripeLineItems(order) {
  const currency = order.currency.toLowerCase();
  const items = order.items.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency,
      unit_amount: i.unitPrice,
      product_data: {
        name: i.productName,
        ...([i.size, i.color].some(Boolean) ? { description: [i.size, i.color].filter(Boolean).join(' / ') } : {}),
        // Stripe only accepts publicly reachable https image URLs.
        ...(i.imageUrl?.startsWith('https://') ? { images: [i.imageUrl] } : {}),
      },
    },
  }));
  if (order.shippingFee > 0) {
    items.push({ quantity: 1, price_data: { currency, unit_amount: order.shippingFee, product_data: { name: 'Shipping' } } });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Payment initialisation (checkout + "pay now")
// ---------------------------------------------------------------------------
/**
 * Creates the gateway-side payment for an order and returns what the
 * frontend needs to complete it (see PaymentInit in docs/API.md).
 */
export async function initPayment(order, gateway, user) {
  assertGatewayEnabled(gateway);

  if (gateway === 'razorpay') {
    const rzOrder = await razorpayRequest('POST', '/orders', {
      amount: order.total,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });
    await recordPayment(order, 'razorpay', rzOrder.id, rzOrder);
    return {
      gateway: 'razorpay',
      keyId: config.razorpay.keyId,
      razorpayOrderId: rzOrder.id,
      amount: order.total,
      currency: order.currency,
      name: config.store.name,
      description: `Order ${order.orderNumber}`,
      prefill: { name: order.shippingAddress?.fullName ?? user.name, email: order.email, contact: user.phone },
    };
  }

  if (gateway === 'stripe') {
    // Stripe requires the session to stay open for at least 30 minutes.
    const minExpiry = Math.ceil(Date.now() / 1000) + 31 * 60;
    const orderExpiry = order.expiresAt ? Math.floor(new Date(order.expiresAt).getTime() / 1000) : 0;
    let session;
    try {
      session = await stripe().checkout.sessions.create({
        mode: 'payment',
        line_items: stripeLineItems(order),
        customer_email: order.email ?? undefined,
        client_reference_id: order.id,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
        payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.orderNumber } },
        success_url: `${config.frontendUrl}/checkout/success?order=${encodeURIComponent(order.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.frontendUrl}/checkout/cancelled?order=${encodeURIComponent(order.orderNumber)}`,
        expires_at: Math.max(minExpiry, orderExpiry),
      });
    } catch (err) {
      logger.error({ err }, 'Stripe checkout session creation failed');
      throw gatewayError(err?.message ?? 'Could not start the Stripe payment');
    }
    await recordPayment(order, 'stripe', session.id, { id: session.id, url: session.url });
    return { gateway: 'stripe', checkoutUrl: session.url, sessionId: session.id };
  }

  // mock
  const mockPaymentId = `mock_${randomToken(9)}`;
  await recordPayment(order, 'mock', mockPaymentId, null);
  return { gateway: 'mock', mockPaymentId, amount: order.total, currency: order.currency };
}

/** Looks up our payment row for a gateway order/session id. */
export async function findPayment(gateway, gatewayOrderId) {
  const rows = await query(
    `SELECT p.order_id, p.status, o.order_number, o.user_id, o.total
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.gateway = $1 AND p.gateway_order_id = $2`,
    [gateway, gatewayOrderId],
  );
  return rows[0] ?? null;
}
