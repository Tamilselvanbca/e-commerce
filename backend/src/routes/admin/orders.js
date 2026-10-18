import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
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
import { createShipment } from '../../services/shiprocket.js';

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
      `SELECT gateway, gateway_order_id, gateway_payment_id, amount, status, error, created_at
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
  await adminUpdateStatus(number, body.status, body.note, req.user.id);
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

const dimsSchema = z.object({
  weight: z.coerce.number().positive().max(100).optional(),
  length: z.coerce.number().positive().max(300).optional(),
  breadth: z.coerce.number().positive().max(300).optional(),
  height: z.coerce.number().positive().max(300).optional(),
});

router.post('/orders/:orderNumber/shiprocket', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  const dims = parse(dimsSchema, req.body ?? {});
  const order = await requireOrder({ orderNumber: number, admin: true });
  if (!['confirmed', 'processing'].includes(order.status)) {
    throw badRequest('Only confirmed or processing orders can be sent to Shiprocket');
  }
  if ((order.shippingAddress?.country ?? 'IN') !== 'IN') {
    throw badRequest('Shiprocket ships within India only. For international orders, book the courier yourself and use "Add shipment".');
  }
  const shipment = await createShipment(order, dims);
  await recordShipment(number, { provider: 'shiprocket', ...shipment }, req.user.id);
  res.json(await adminOrder(number));
});

export default router;
