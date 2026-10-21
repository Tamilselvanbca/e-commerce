import { Router } from 'express';
import { loadCart, resolveCartId } from '../services/cart.js';
import { listOffers } from '../services/discounts.js';
import { computeTotals, DOMESTIC_COUNTRY } from '../services/orders.js';

const router = Router();

/** Running offers for the product page (checkout gets them per cart in its summary). */
router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ items: await listOffers() });
});

/**
 * Offers checked against the visitor's cart (delivery in India, as the cart
 * estimates) and, when logged in, the customer: first-order and per-customer
 * limits included, so "applies automatically" means it will at checkout.
 */
router.get('/cart', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const cart = await loadCart(await resolveCartId(req, res));
  if (!cart.subtotal) return res.json({ items: [] });
  const { shippingFee } = computeTotals(cart.subtotal, DOMESTIC_COUNTRY);
  res.json({
    items: await listOffers({ subtotal: cart.subtotal, shippingFee, international: false, userId: req.user?.id ?? null }),
  });
});

export default router;
