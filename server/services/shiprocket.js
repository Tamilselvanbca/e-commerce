// Shiprocket API client (https://apidocs.shiprocket.in/). The delivery flow that
// uses it (book → courier → pickup → label → tracking) is in services/shipments.js.
// Shiprocket logs in an "API user" (Settings → API → Configure), not the main
// account login; the token lasts 10 days.
import { config } from '../config.js';
import { AppError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
let token = null;
let tokenExpiresAt = 0;
let tokenFor = null;

export function shiprocketEnabled() {
  const { email, password } = config.shipping.shiprocket;
  return config.shipping.provider === 'shiprocket' && Boolean(email && password);
}

export function assertShiprocket() {
  if (!shiprocketEnabled()) {
    throw badRequest('Shiprocket is not configured. In Admin → Settings → Shipping, choose Shiprocket and enter the API user email and password.');
  }
}

const gatewayError = (message) => new AppError(502, 'GATEWAY_ERROR', message);

/** Shiprocket's error bodies: { message }, { message, errors: { field: [..] } }, { errors: { .. } }. */
function errorText(data, status) {
  const fields = data?.errors && typeof data.errors === 'object'
    ? Object.entries(data.errors).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[v].flat().join(', ')}`).join('; ')
    : '';
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  return [message, fields].filter(Boolean).join(' ') || `HTTP ${status}`;
}

async function getToken() {
  const { email, password } = config.shipping.shiprocket;
  // A new login is needed when the credentials change in Admin → Settings.
  const owner = `${email}:${password}`;
  if (token && tokenFor === owner && Date.now() < tokenExpiresAt) return token;
  let res;
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.error({ err }, 'Shiprocket unreachable');
    throw gatewayError('Could not reach Shiprocket. Try again in a minute.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    logger.error({ status: res.status, message: data?.message }, 'Shiprocket login failed');
    throw gatewayError(
      `Shiprocket login failed (${errorText(data, res.status)}). Use the API user from Shiprocket → Settings → API → Configure, not your Shiprocket login, and check its email and password in Admin → Settings → Shipping.`,
    );
  }
  token = data.token;
  tokenFor = owner;
  tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000; // refresh a day early
  return token;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, path }, 'Shiprocket unreachable');
    throw gatewayError('Could not reach Shiprocket. Try again in a minute.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) token = null;
  if (!res.ok) {
    logger.error({ status: res.status, path, data }, 'Shiprocket API error');
    const err = gatewayError(`Shiprocket: ${errorText(data, res.status)}`);
    err.data = data;
    throw err;
  }
  return data;
}

const rupees = (paise) => Math.round(paise) / 100;
const digits = (v) => String(v ?? '').replace(/\D/g, '');

/** Pickup addresses saved in Shiprocket (Settings → Pickup addresses). */
export async function listPickupLocations() {
  assertShiprocket();
  const data = await request('GET', '/settings/company/pickup');
  const list = data?.data?.shipping_address ?? [];
  return list.map((p) => ({
    name: p.pickup_location,
    address: [p.address, p.address_2, p.city, p.state].filter(Boolean).join(', '),
    pincode: p.pin_code ? String(p.pin_code) : null,
    phone: p.phone ? String(p.phone) : null,
  }));
}

/**
 * Couriers that deliver from the pickup PIN code to the customer, with their
 * rate (paise) and estimated delivery, cheapest first.
 */
export async function listCouriers({ pickupPincode, deliveryPincode, weight, declaredValue }) {
  assertShiprocket();
  const qs = new URLSearchParams({
    pickup_postcode: digits(pickupPincode),
    delivery_postcode: digits(deliveryPincode),
    weight: String(weight),
    cod: '0',
    declared_value: String(rupees(declaredValue)),
  });
  let data;
  try {
    data = await request('GET', `/courier/serviceability/?${qs}`);
  } catch (err) {
    if (err.data && /serviceable/i.test(String(err.data.message))) return { recommendedId: null, couriers: [] };
    throw err;
  }
  const list = data?.data?.available_courier_companies ?? [];
  const couriers = list
    .map((c) => ({
      id: Number(c.courier_company_id),
      name: c.courier_name,
      rate: Math.round(Number(c.rate ?? c.freight_charge ?? 0) * 100),
      etd: c.etd || null,
      days: c.estimated_delivery_days ? Number(c.estimated_delivery_days) || null : null,
      rating: c.rating != null ? Number(c.rating) || null : null,
      surface: Boolean(c.is_surface),
    }))
    .filter((c) => Number.isFinite(c.id))
    .sort((a, b) => a.rate - b.rate);
  const recommended = Number(data?.data?.shiprocket_recommended_courier_id ?? data?.data?.recommended_courier_company_id);
  return { recommendedId: Number.isFinite(recommended) && recommended > 0 ? recommended : null, couriers };
}

/**
 * Creates the order in Shiprocket (prepaid; ships within India).
 * @returns {Promise<{providerOrderId: string, providerShipmentId: string, awb: string|null, courier: string|null, raw: object}>}
 */
export async function createOrder(order, { pickupLocation, dims }) {
  assertShiprocket();
  const a = order.shippingAddress;
  const [firstName, ...rest] = (a.fullName ?? '').trim().split(/\s+/);
  const email = order.email || config.store.supportEmail || order.customer?.email || '';

  let created;
  try {
    created = await request('POST', '/orders/create/adhoc', {
      order_id: order.orderNumber,
      order_date: new Date(order.paidAt ?? order.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      pickup_location: pickupLocation,
      billing_customer_name: firstName || a.fullName,
      billing_last_name: rest.join(' '),
      billing_address: a.line1,
      billing_address_2: [a.line2, a.landmark].filter(Boolean).join(', '),
      billing_city: a.city,
      billing_pincode: a.pincode,
      billing_state: a.state,
      billing_country: 'India',
      billing_email: email,
      billing_phone: digits(a.phone).slice(-10),
      shipping_is_billing: true,
      order_items: order.items.map((i) => ({
        name: [i.productName, i.size, i.color].filter(Boolean).join(' - '),
        sku: i.sku,
        units: i.quantity,
        selling_price: rupees(i.unitPrice),
      })),
      payment_method: 'Prepaid',
      shipping_charges: rupees(order.shippingFee),
      total_discount: rupees(order.discount),
      sub_total: rupees(order.subtotal),
      length: dims.length,
      breadth: dims.breadth,
      height: dims.height,
      weight: dims.weight,
    });
  } catch (err) {
    // A wrong pickup name comes back with the names Shiprocket knows.
    if (/pickup location/i.test(err.message)) {
      const names = [err.data?.data?.data ?? []].flat().map((p) => p?.pickup_location).filter(Boolean);
      throw gatewayError(
        `Shiprocket doesn't have a pickup address named “${pickupLocation}”.${names.length ? ` Choose one of: ${names.join(', ')}.` : ' Add it in Shiprocket → Settings → Pickup addresses.'}`,
      );
    }
    throw err;
  }

  if (!created?.shipment_id) {
    throw gatewayError(`Shiprocket didn't create the shipment: ${errorText(created, 200)}`);
  }
  return {
    providerOrderId: String(created.order_id),
    providerShipmentId: String(created.shipment_id),
    awb: created.awb_code || null,
    courier: created.courier_name || null,
    raw: created,
  };
}

/** Assigns a courier and AWB. Without `courierId` Shiprocket picks its recommended courier. */
export async function assignAwb(shipmentId, courierId) {
  const data = await request('POST', '/courier/assign/awb', {
    shipment_id: Number(shipmentId),
    ...(courierId ? { courier_id: Number(courierId) } : {}),
  });
  const result = data?.response?.data ?? {};
  if (!result.awb_code) {
    const reason = result.awb_assign_error || data?.message || 'no courier is available for this shipment';
    throw gatewayError(`Shiprocket couldn't assign a courier: ${reason}`);
  }
  return { awb: String(result.awb_code), courier: result.courier_name || null, raw: data };
}

/** Asks the courier to collect the parcel. Returns when (if Shiprocket says). */
export async function requestPickup(shipmentId) {
  try {
    const data = await request('POST', '/courier/generate/pickup', { shipment_id: [Number(shipmentId)] });
    const r = data?.response ?? {};
    return { scheduled: r.pickup_scheduled_date ? String(r.pickup_scheduled_date) : 'Requested' };
  } catch (err) {
    // Asked before (e.g. from the Shiprocket panel): nothing more to do.
    if (/already/i.test(err.message)) return { scheduled: 'Requested' };
    throw err;
  }
}

/** The shipping label (PDF) to print and stick on the parcel. */
export async function generateLabel(shipmentId) {
  const data = await request('POST', '/courier/generate/label', { shipment_id: [Number(shipmentId)] });
  if (!data?.label_url) throw gatewayError(`Shiprocket: label not ready (${errorText(data, 200)})`);
  return data.label_url;
}

/** Cancels a Shiprocket order that hasn't been picked up. */
export async function cancelOrder(providerOrderId) {
  await request('POST', '/orders/cancel', { ids: [Number(providerOrderId)] });
}

/**
 * Where an AWB is: the courier's current status, expected delivery and the
 * scan history. Throws when Shiprocket can't be reached.
 */
export async function fetchTracking(awb) {
  const data = await request('GET', `/courier/track/awb/${encodeURIComponent(awb)}`);
  const t = data?.tracking_data ?? {};
  const track = [t.shipment_track ?? []].flat()[0] ?? {};
  const activities = t.shipment_track_activities ?? [];
  const latest = activities[0] ?? null;
  return {
    status: (track.current_status || latest?.['sr-status-label'] || '').toString().trim() || null,
    expectedDelivery: (t.etd || track.edd || null) ? String(t.etd || track.edd) : null,
    events: activities.map((a) => ({
      date: a.date,
      status: a['sr-status-label'] ?? a.status ?? '',
      location: a.location ?? null,
      activity: a.activity ?? null,
    })),
  };
}

/**
 * Where a parcel is in the journey, from a courier status such as "PICKED UP",
 * "IN TRANSIT", "OUT FOR DELIVERY", "DELIVERED" or "RTO INITIATED".
 * @returns {'awaiting_pickup'|'in_transit'|'delivered'|'returning'|'cancelled'|null}
 */
export function courierStage(status) {
  const s = String(status ?? '').toUpperCase().replace(/[_-]+/g, ' ').trim();
  if (!s) return null;
  if (/\bRTO\b|RETURN/.test(s)) return 'returning';
  if (/CANCEL/.test(s)) return 'cancelled';
  if (/DELIVERED/.test(s) && !/UNDELIVERED|NOT DELIVERED|PARTIAL/.test(s)) return 'delivered';
  if (/PICKED UP|SHIPPED|TRANSIT|OUT FOR DELIVERY|REACHED|DESTINATION|HUB|UNDELIVERED|DELAYED|IN FLIGHT|MISROUTED|DISPATCH|HANDOVER|PARTIAL/.test(s)) {
    return 'in_transit';
  }
  if (/PICKUP|AWB|MANIFEST|READY|NEW|BOOKED|PACK|INVOICED/.test(s)) return 'awaiting_pickup';
  return null;
}
