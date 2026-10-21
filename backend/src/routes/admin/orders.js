import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne } from '../../db/pool.js';
import { optionalText, parse } from '../../lib/validate.js';
import { publicUser } from '../../middleware/auth.js';
import {
  adminUpdateStatus,
  listOrders,
  markRefunded,
  ORDER_STATUSES,
  recordShipment,
  requireOrder,
} from '../../services/orders.js';
import { cancelShiprocketBooking, courierOptions, refreshTracking, shipWithShiprocket } from '../../services/shipments.js';
import { listPickupLocations } from '../../services/shiprocket.js';

const router = Router();
const orderNumber = z.string().trim().max(40);
const emptyToUndefined = (schema) => schema.optional().or(z.literal('').transform(() => undefined));

const listSchema = z.object({
  status: emptyToUndefined(z.enum(ORDER_STATUSES)),
  paymentStatus: emptyToUndefined(z.enum(['pending', 'paid', 'failed', 'refunded'])),
  q: z.string().trim().max(100).optional(),
  from: emptyToUndefined(z.iso.date()),
  to: emptyToUndefined(z.iso.date()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/orders', async (req, res) => {
  const f = parse(listSchema, req.query);
  res.json(await listOrders({ ...f, admin: true }));
});

async function adminOrder(number) {
  const order = await requireOrder({ orderNumber: number, admin: true });
  const [customer, payments] = await Promise.all([
    queryOne('SELECT id, phone, name, email, role, created_at FROM users WHERE id = $1', [order.userId]),
    query(
      `SELECT gateway, gateway_order_id, gateway_payment_id, amount, status, error, method_details, created_at
         FROM payments WHERE order_id = $1 ORDER BY created_at`,
      [order.id],
    ),
  ]);
  const { userId: _omit, ...rest } = order;
  return { ...rest, customer: publicUser(customer), payments };
}

router.get('/orders/:orderNumber', async (req, res) => {
  res.json(await adminOrder(parse(orderNumber, req.params.orderNumber)));
});

router.patch('/orders/:orderNumber/status', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  const body = parse(z.object({ status: z.enum(ORDER_STATUSES), note: optionalText(500) }), req.body);
  const order = await adminUpdateStatus(number, body.status, body.note, req.user.id);
  if (body.status === 'cancelled') await cancelShiprocketBooking(order.id, req.user.id);
  res.json(await adminOrder(number));
});

router.patch('/orders/:orderNumber/payment', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  parse(z.object({ paymentStatus: z.literal('refunded') }), req.body);
  await markRefunded(number, req.user.id);
  res.json(await adminOrder(number));
});

const shipmentSchema = z.object({
  courier: z.string().trim().min(2, 'Enter the courier name').max(80),
  awb: z.string().trim().min(3, 'Enter the tracking number').max(60),
  trackingUrl: optionalText(500).refine((v) => !v || /^https?:\/\//.test(v), 'Tracking URL must start with http(s)://'),
});

router.post('/orders/:orderNumber/shipment', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  const body = parse(shipmentSchema, req.body);
  await recordShipment(number, { provider: 'manual', ...body }, req.user.id);
  res.json(await adminOrder(number));
});

// --- Shiprocket: book (pickup address, parcel, courier) → track ---------------
router.get('/shipping/shiprocket/pickups', async (req, res) => {
  res.json({
    items: await listPickupLocations(),
    configured: config.shipping.shiprocket.pickupLocation,
    defaults: config.shipping.shiprocket.defaults,
  });
});

router.get('/orders/:orderNumber/shiprocket/couriers', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  const q = parse(
    z.object({
      pickup: z.string().trim().max(120).optional(),
      weight: z.coerce.number().positive().max(100).optional(),
    }),
    req.query,
  );
  res.json(await courierOptions(number, q));
});

const bookSchema = z.object({
  pickupLocation: z.string().trim().max(120).optional(),
  courierId: z.coerce.number().int().positive().optional(),
  weight: z.coerce.number().positive().max(100).optional(),
  length: z.coerce.number().positive().max(300).optional(),
  breadth: z.coerce.number().positive().max(300).optional(),
  height: z.coerce.number().positive().max(300).optional(),
});

/** Books the order with Shiprocket, or carries on from the step that failed. */
router.post('/orders/:orderNumber/shiprocket', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  const { pickupLocation, courierId, ...dims } = parse(bookSchema, req.body ?? {});
  await shipWithShiprocket(number, { pickupLocation, courierId, dims }, req.user.id);
  res.json(await adminOrder(number));
});

router.post('/orders/:orderNumber/shiprocket/track', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  await refreshTracking(number);
  res.json(await adminOrder(number));
});

export default router;
