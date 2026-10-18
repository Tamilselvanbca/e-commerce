import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import categories from './categories.js';
import dashboard from './dashboard.js';
import discounts from './discounts.js';
import enquiries from './enquiries.js';
import giftCards from './gift-cards.js';
import orders from './orders.js';
import products from './products.js';
import reviews from './reviews.js';
import settings from './settings.js';
import users from './users.js';

const router = Router();
router.use(requireAdmin);

router.use('/dashboard', dashboard);
router.use(products); // /products, /uploads
router.use(categories);
router.use(orders);
router.use(users);
router.use(enquiries);
router.use(reviews);
router.use(discounts);
router.use(giftCards);
router.use(settings);

export default router;
