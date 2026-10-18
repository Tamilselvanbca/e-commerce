// Shiprocket integration (https://apidocs.shiprocket.in/).
// Flow: authenticate (token valid ~10 days) -> create ad-hoc order -> assign AWB.
// Verify field names against your Shiprocket account before going live: some
// accounts require extra fields (e.g. GSTIN, HSN codes).
import { config } from '../config.js';
import { AppError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
let token = null;
let tokenExpiresAt = 0;

export function shiprocketEnabled() {
  const { email, password } = config.shipping.shiprocket;
  return config.shipping.provider === 'shiprocket' && Boolean(email && password);
}

async function getToken() {
  if (token && Date.now() < tokenExpiresAt) return token;
  const { email, password } = config.shipping.shiprocket;
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    logger.error({ status: res.status, message: data?.message }, 'Shiprocket login failed');
    throw new AppError(502, 'GATEWAY_ERROR', 'Could not authenticate with Shiprocket. Check SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD.');
  }
  token = data.token;
  tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000; // refresh a day early
  return token;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) token = null;
  if (!res.ok) {
    logger.error({ status: res.status, path, data }, 'Shiprocket API error');
    const detail = data?.message ?? (data?.errors ? JSON.stringify(data.errors) : `HTTP ${res.status}`);
    throw new AppError(502, 'GATEWAY_ERROR', `Shiprocket: ${detail}`);
  }
  return data;
}

/**
 * Creates the Shiprocket order and assigns a courier/AWB.
 * @returns {Promise<{courier: string|null, awb: string|null, trackingUrl: string|null, providerOrderId: string, providerShipmentId: string, raw: object}>}
 */
export async function createShipment(order, dims = {}) {
  if (!shiprocketEnabled()) {
    throw badRequest('Shiprocket is not configured. Set SHIPPING_PROVIDER=shiprocket and the Shiprocket credentials.');
  }
  const d = { ...config.shipping.shiprocket.defaults, ...Object.fromEntries(Object.entries(dims).filter(([, v]) => v != null)) };
  const a = order.shippingAddress;
  const [firstName, ...rest] = (a.fullName ?? '').trim().split(/\s+/);

  const created = await request('POST', '/orders/create/adhoc', {
    order_id: order.orderNumber,
    order_date: new Date(order.paidAt ?? order.createdAt).toISOString().slice(0, 16).replace('T', ' '),
    pickup_location: config.shipping.shiprocket.pickupLocation,
    billing_customer_name: firstName || a.fullName,
    billing_last_name: rest.join(' '),
    billing_address: a.line1,
    billing_address_2: [a.line2, a.landmark].filter(Boolean).join(', '),
    billing_city: a.city,
    billing_pincode: a.pincode,
    billing_state: a.state,
    billing_country: a.country === 'IN' ? 'India' : a.country,
    billing_email: order.email ?? '',
    billing_phone: a.phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10),
    shipping_is_billing: true,
    order_items: order.items.map((i) => ({
      name: [i.productName, i.size, i.color].filter(Boolean).join(' - '),
      sku: i.sku,
      units: i.quantity,
      selling_price: i.unitPrice / 100,
    })),
    payment_method: 'Prepaid',
    shipping_charges: order.shippingFee / 100,
    total_discount: order.discount / 100,
    sub_total: order.subtotal / 100,
    length: d.length,
    breadth: d.breadth,
    height: d.height,
    weight: d.weight,
  });

  const shipmentId = created.shipment_id;
  if (!shipmentId) throw new AppError(502, 'GATEWAY_ERROR', 'Shiprocket did not return a shipment id');

  // Let Shiprocket choose the recommended courier.
  let awb = null;
  let courier = null;
  let awbResponse = null;
  try {
    awbResponse = await request('POST', '/courier/assign/awb', { shipment_id: shipmentId });
    const data = awbResponse?.response?.data ?? {};
    awb = data.awb_code || null;
    courier = data.courier_name || null;
  } catch (err) {
    // The order exists in Shiprocket; the AWB can be assigned from the Shiprocket panel.
    logger.warn({ err, shipmentId }, 'Shiprocket AWB assignment failed');
  }

  return {
    providerOrderId: String(created.order_id),
    providerShipmentId: String(shipmentId),
    awb,
    courier,
    trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : null,
    raw: { order: created, awb: awbResponse },
  };
}

/** Live tracking events for an AWB. Returns [] when tracking isn't available yet. */
export async function trackAwb(awb) {
  if (!shiprocketEnabled() || !awb) return [];
  try {
    const data = await request('GET', `/courier/track/awb/${encodeURIComponent(awb)}`);
    const activities = data?.tracking_data?.shipment_track_activities ?? [];
    return activities.map((a) => ({
      date: a.date,
      status: a['sr-status-label'] ?? a.status ?? '',
      location: a.location ?? null,
      activity: a.activity ?? null,
    }));
  } catch (err) {
    logger.warn({ err, awb }, 'Shiprocket tracking failed');
    return [];
  }
}
