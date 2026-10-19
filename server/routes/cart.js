import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { addItem, clearCart, loadCart, MAX_LINE_QUANTITY, removeItem, resolveCartId, updateItem } from '../services/cart.js';

const router = Router();
const quantity = z.coerce.number().int().min(1, 'Quantity must be at least 1').max(MAX_LINE_QUANTITY, `Maximum ${MAX_LINE_QUANTITY} per item`);

router.get('/', async (req, res) => {
  const cartId = await resolveCartId(req, res);
  res.json(await loadCart(cartId));
});

router.post('/items', async (req, res) => {
  const body = parse(z.object({ variantId: uuid, quantity: quantity.default(1) }), req.body);
  const cartId = await resolveCartId(req, res, { create: true });
  await addItem(cartId, body.variantId, body.quantity);
  res.json(await loadCart(cartId));
});

router.patch('/items/:itemId', async (req, res) => {
  const itemId = parse(uuid, req.params.itemId);
  const body = parse(z.object({ quantity }), req.body);
  const cartId = await resolveCartId(req, res, { create: true });
  await updateItem(cartId, itemId, body.quantity);
  res.json(await loadCart(cartId));
});

router.delete('/items/:itemId', async (req, res) => {
  const itemId = parse(uuid, req.params.itemId);
  const cartId = await resolveCartId(req, res);
  if (cartId) await removeItem(cartId, itemId);
  res.json(await loadCart(cartId));
});

router.delete('/', async (req, res) => {
  const cartId = await resolveCartId(req, res);
  await clearCart(cartId);
  res.json(await loadCart(cartId));
});

export default router;
