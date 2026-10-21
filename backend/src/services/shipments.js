// The delivery flow with Shiprocket.
//   1. Book (admin, on a paid order): the order is created in Shiprocket, a
//      courier and AWB are assigned, the pickup is requested and the label is
//      made. The order moves to "processing" (packed, waiting for the courier).
//      A step that fails (e.g. no wallet balance for the courier) is saved as
//      last_error; booking again carries on from that step.
//   2. Track: the courier's status arrives by webhook, by a sync every 20
//      minutes, when the customer opens the order or with "Refresh tracking".
//      Picked up → "shipped" (email + SMS with the AWB); delivered → "delivered".
import { config } from '../config.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { AppError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { addHistory, DOMESTIC_COUNTRY, notifyStatusChange, requireOrder } from './orders.js';
import {
  assertShiprocket,
  assignAwb,
  cancelOrder,
  courierStage,
  createOrder,
  fetchTracking,
  generateLabel,
  listCouriers,
  listPickupLocations,
  requestPickup,
  shiprocketEnabled,
} from './shiprocket.js';

const trackingUrl = (awb) => (awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null);
const clip = (text, max) => (text == null ? null : String(text).slice(0, max));

const shipmentRow = (orderId) =>
  queryOne(
    `SELECT provider, courier, awb, provider_order_id, provider_shipment_id, pickup_location, label_url,
            pickup_scheduled, tracking_status, shipped_at
       FROM shipments WHERE order_id = $1`,
    [orderId],
  );

async function bookableOrder(orderNumber) {
  assertShiprocket();
  const order = await requireOrder({ orderNumber, admin: true });
  if (!['confirmed', 'processing'].includes(order.status)) {
    throw badRequest('Only confirmed or processing orders can be sent to Shiprocket');
  }
  if ((order.shippingAddress?.country ?? DOMESTIC_COUNTRY) !== DOMESTIC_COUNTRY) {
    throw badRequest('Shiprocket ships within India only. For international orders, book the courier yourself and use "Add shipment".');
  }
  return order;
}

const packageDims = (dims = {}) => ({
  ...config.shipping.shiprocket.defaults,
  ...Object.fromEntries(Object.entries(dims).filter(([, v]) => v != null)),
});

/** Couriers that can take this order from the pickup address, with rates. */
export async function courierOptions(orderNumber, { pickup, weight } = {}) {
  const order = await bookableOrder(orderNumber);
  const pickups = await listPickupLocations();
  const name = pickup || config.shipping.shiprocket.pickupLocation;
  const from = pickups.find((p) => p.name === name) ?? (pickups.length === 1 ? pickups[0] : null);
  if (!from?.pincode) throw badRequest(`Choose a pickup address that is saved in Shiprocket (“${name}” isn't).`);
  const result = await listCouriers({
    pickupPincode: from.pincode,
    deliveryPincode: order.shippingAddress.pincode,
    weight: weight ?? packageDims().weight,
    declaredValue: order.total,
  });
  return { ...result, pickup: from };
}

/**
 * Books the order with Shiprocket, doing whichever steps aren't done yet:
 * create the Shiprocket order, assign the courier/AWB, request the pickup,
 * make the label. The first step throws on failure (nothing is saved); later
 * ones save their error on the shipment so the admin sees it and can retry.
 */
export async function shipWithShiprocket(orderNumber, { pickupLocation, courierId, dims } = {}, adminId = null) {
  const order = await bookableOrder(orderNumber);
  let row = await shipmentRow(order.id);
  if (row?.provider !== 'shiprocket') row = null;
  const errors = [];

  // 1. The order in Shiprocket.
  if (!row?.providerShipmentId) {
    const pickup = pickupLocation || config.shipping.shiprocket.pickupLocation;
    const created = await createOrder(order, { pickupLocation: pickup, dims: packageDims(dims) });
    const moved = await transaction(async (db) => {
      const o = await queryOne('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [order.id], db);
      await query(
        `INSERT INTO shipments (order_id, provider, courier, awb, tracking_url, provider_order_id, provider_shipment_id, pickup_location, raw)
         VALUES ($1, 'shiprocket', $2, $3, $4, $5, $6, $7, $8)
         ON DUPLICATE KEY UPDATE
           provider = VALUES(provider), courier = VALUES(courier), awb = VALUES(awb), tracking_url = VALUES(tracking_url),
           provider_order_id = VALUES(provider_order_id), provider_shipment_id = VALUES(provider_shipment_id),
           pickup_location = VALUES(pickup_location), raw = VALUES(raw),
           label_url = NULL, pickup_scheduled = NULL, tracking_status = NULL, last_error = NULL`,
        [order.id, created.courier, created.awb, trackingUrl(created.awb), created.providerOrderId, created.providerShipmentId,
          clip(pickup, 120), JSON.stringify({ order: created.raw })],
        db,
      );
      const fromConfirmed = o.status === 'confirmed';
      if (fromConfirmed) await query(`UPDATE orders SET status = 'processing' WHERE id = $1`, [o.id], db);
      await addHistory(o.id, 'processing', `Booked on Shiprocket (order ${created.providerOrderId}), pickup from ${pickup}`, adminId, db);
      return fromConfirmed;
    });
    if (moved) notifyStatusChange(await requireOrder({ id: order.id, admin: true }), 'processing');
    row = await shipmentRow(order.id);
  }

  // 2. Courier and AWB.
  if (!row.awb) {
    try {
      const { awb, courier } = await assignAwb(row.providerShipmentId, courierId);
      await query('UPDATE shipments SET awb = $2, courier = $3, tracking_url = $4 WHERE order_id = $1', [order.id, clip(awb, 120), clip(courier, 120), trackingUrl(awb)]);
      await addHistory(order.id, 'processing', `${courier ?? 'Courier'} assigned, AWB ${awb}`, adminId);
      row = { ...row, awb, courier };
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      errors.push(/balance|recharge|wallet/i.test(err.message) ? `${err.message} Recharge your Shiprocket wallet, then retry.` : err.message);
    }
  }

  if (row.awb) {
    // 3. Ask the courier to collect it.
    if (!row.pickupScheduled) {
      try {
        const { scheduled } = await requestPickup(row.providerShipmentId);
        await query('UPDATE shipments SET pickup_scheduled = $2 WHERE order_id = $1', [order.id, clip(scheduled, 60)]);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        errors.push(`Pickup not requested: ${err.message}`);
      }
    }
    // 4. The label to print.
    if (!row.labelUrl) {
      try {
        const url = await generateLabel(row.providerShipmentId);
        await query('UPDATE shipments SET label_url = $2 WHERE order_id = $1', [order.id, clip(url, 1000)]);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        errors.push(`Label not ready: ${err.message}`);
      }
    }
  }

  await query('UPDATE shipments SET last_error = $2 WHERE order_id = $1', [order.id, errors.length ? clip(errors.join(' · '), 1000) : null]);
}

/**
 * Applies a courier status to the order: picked up / in transit → shipped,
 * delivered → delivered (emails and SMS go out as for a manual change).
 * Returns the new order status, or null when it didn't change.
 */
export async function applyCourierStatus(orderId, { status, expectedDelivery }) {
  const stage = courierStage(status);
  const changed = await transaction(async (db) => {
    const o = await queryOne('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [orderId], db);
    const s = await queryOne('SELECT courier, awb, tracking_status FROM shipments WHERE order_id = $1', [orderId], db);
    if (!o || !s) return null;
    await query(
      `UPDATE shipments SET tracking_status = coalesce($2, tracking_status),
              expected_delivery = coalesce($3, expected_delivery), tracking_updated_at = NOW(3)
        WHERE order_id = $1`,
      [orderId, clip(status, 80), clip(expectedDelivery, 40)],
      db,
    );
    const via = `${s.courier ?? 'the courier'}${s.awb ? ` (AWB ${s.awb})` : ''}`;
    if (stage === 'in_transit' && ['confirmed', 'processing'].includes(o.status)) {
      await query(`UPDATE orders SET status = 'shipped' WHERE id = $1`, [o.id], db);
      await query('UPDATE shipments SET shipped_at = coalesce(shipped_at, NOW(3)) WHERE order_id = $1', [o.id], db);
      await addHistory(o.id, 'shipped', `Picked up by ${via}`, null, db);
      return 'shipped';
    }
    if (stage === 'delivered' && ['confirmed', 'processing', 'shipped'].includes(o.status)) {
      await query(`UPDATE orders SET status = 'delivered' WHERE id = $1`, [o.id], db);
      await query(
        'UPDATE shipments SET shipped_at = coalesce(shipped_at, NOW(3)), delivered_at = coalesce(delivered_at, NOW(3)) WHERE order_id = $1',
        [o.id],
        db,
      );
      await addHistory(o.id, 'delivered', `Delivered by ${via}`, null, db);
      return 'delivered';
    }
    if ((stage === 'returning' || stage === 'cancelled') && status !== s.trackingStatus) {
      logger.warn({ orderId, status }, 'Courier reports the parcel is returning or cancelled');
    }
    return null;
  });
  if (changed) notifyStatusChange(await requireOrder({ id: orderId, admin: true }), changed);
  return changed;
}

/** Admin "Refresh tracking": reads the courier status now. */
export async function refreshTracking(orderNumber) {
  assertShiprocket();
  const order = await requireOrder({ orderNumber, admin: true });
  const awb = order.shipment?.provider === 'shiprocket' ? order.shipment.awb : null;
  if (!awb) throw badRequest('This order has no Shiprocket AWB to track yet');
  await applyCourierStatus(order.id, await fetchTracking(awb));
}

/**
 * Tracking for the customer's order page: the courier's scans, applied to
 * the order as they're read. Never throws for Shiprocket problems.
 */
export async function orderTracking(order, reload) {
  const s = order.shipment;
  if (s?.provider !== 'shiprocket' || !s.awb || !shiprocketEnabled()) return { order, events: [] };
  try {
    const tracking = await fetchTracking(s.awb);
    await applyCourierStatus(order.id, tracking);
    return { order: await reload(), events: tracking.events };
  } catch (err) {
    logger.warn({ err, awb: s.awb }, 'Shiprocket tracking failed');
    return { order, events: [] };
  }
}

/** Background sync: shipments on the way, oldest check first. Returns how many orders changed status. */
export async function syncShiprocketTracking({ limit = 40 } = {}) {
  if (!shiprocketEnabled()) return 0;
  const rows = await query(
    `SELECT s.order_id, s.awb FROM shipments s JOIN orders o ON o.id = s.order_id
      WHERE s.provider = 'shiprocket' AND s.awb IS NOT NULL AND s.delivered_at IS NULL
        AND o.status IN ('processing', 'shipped')
        AND s.created_at > NOW(3) - INTERVAL 60 DAY
        AND (s.tracking_updated_at IS NULL OR s.tracking_updated_at < NOW(3) - INTERVAL 20 MINUTE)
      ORDER BY s.tracking_updated_at IS NULL DESC, s.tracking_updated_at
      LIMIT ${Number(limit)}`,
  );
  let changed = 0;
  for (const r of rows) {
    try {
      if (await applyCourierStatus(r.orderId, await fetchTracking(r.awb))) changed++;
    } catch (err) {
      // Try this one again next round, after the others.
      await query('UPDATE shipments SET tracking_updated_at = NOW(3) WHERE order_id = $1', [r.orderId]);
      logger.warn({ err, awb: r.awb }, 'Shiprocket tracking sync failed');
      if (/login failed|reach Shiprocket/.test(err.message)) break;
    }
  }
  return changed;
}

/**
 * Courier webhook (Shiprocket → Settings → API → Webhooks). The request isn't
 * trusted: it only says which AWB to re-read from Shiprocket.
 */
export async function handleCourierUpdate(payload) {
  const awb = String(payload?.awb ?? '').trim();
  if (!awb || awb.length > 120 || !shiprocketEnabled()) return;
  const row = await queryOne(
    `SELECT order_id, tracking_updated_at FROM shipments WHERE provider = 'shiprocket' AND awb = $1 AND delivered_at IS NULL`,
    [awb],
  );
  if (!row) return;
  // Bursts of updates for one parcel: one read is enough.
  if (row.trackingUpdatedAt && Date.now() - new Date(row.trackingUpdatedAt).getTime() < 15_000) return;
  await applyCourierStatus(row.orderId, await fetchTracking(awb));
}

/** When a booked (not yet picked up) order is cancelled, cancel it in Shiprocket too. */
export async function cancelShiprocketBooking(orderId, adminId = null) {
  const s = await queryOne(
    `SELECT provider_order_id, shipped_at FROM shipments WHERE order_id = $1 AND provider = 'shiprocket'`,
    [orderId],
  );
  if (!s?.providerOrderId || s.shippedAt || !shiprocketEnabled()) return;
  try {
    await cancelOrder(s.providerOrderId);
    await query(`UPDATE shipments SET tracking_status = 'CANCELED', last_error = NULL WHERE order_id = $1`, [orderId]);
    await addHistory(orderId, 'cancelled', `Shiprocket order ${s.providerOrderId} cancelled`, adminId);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    await query('UPDATE shipments SET last_error = $2 WHERE order_id = $1', [
      orderId,
      clip(`Couldn't cancel the Shiprocket order: ${err.message} Cancel it in the Shiprocket panel.`, 1000),
    ]);
  }
}
