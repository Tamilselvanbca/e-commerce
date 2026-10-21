import { Router } from 'express';
import { listOffers } from '../services/discounts.js';

const router = Router();

/** Running offers for the product and cart pages (checkout gets them per cart in its summary). */
router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ items: await listOffers() });
});

export default router;
