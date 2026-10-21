import { Router } from 'express';
import { z } from 'zod';
import { pageQuery, parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { assertPayable, cancelUnpaidOrder, listOrders, requireOrder } from '../services/orders.js';
import { initPayment } from '../services/payments.js';
import { orderTracking } from '../services/shipments.js';

const router = Router();
router.use(requireAuth);

const orderNumber = z.string().trim().max(40);

router.get('/', async (req, res) => {
  const { page, pageSize } = parse(pageQuery.extend({ pageSize: z.coerce.number().int().min(1).max(50).default(10) }), req.query);
  res.json(await listOrders({ userId: req.user.id, page, pageSize }));
});

router.get('/:orderNumber', async (req, res) => {
  res.json(await requireOrder({ orderNumber: parse(orderNumber, req.params.orderNumber), userId: req.user.id }));
});

router.post('/:orderNumber/pay', async (req, res) => {
  const number = parse(orderNumber, req.params.orderNumber);
  const { gateway } = parse(z.object({ gateway: z.enum(['razorpay', 'stripe', 'mock']) }), req.body);
  const order = await requireOrder({ orderNumber: number, userId: req.user.id });
  assertPayable(order);
  const payment = await initPayment(order, gateway, req.user);
  res.json({ order: await requireOrder({ id: order.id, userId: req.user.id }), payment });
});

router.post('/:orderNumber/cancel', async (req, res) => {
  const order = await cancelUnpaidOrder(parse(orderNumber, req.params.orderNumber), req.user.id);
  res.json({ order });
});

router.get('/:orderNumber/tracking', async (req, res) => {
  const where = { orderNumber: parse(orderNumber, req.params.orderNumber), userId: req.user.id };
  // Reading the courier's scans also moves the order on (picked up → shipped, delivered).
  const { order, events } = await orderTracking(await requireOrder(where), () => requireOrder(where));
  res.json({ shipment: order.shipment, orderStatus: order.status, events });
});

export default router;
