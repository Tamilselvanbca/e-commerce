import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import categories from './categories.js';
import dashboard from './dashboard.js';
import enquiries from './enquiries.js';
import orders from './orders.js';
import products from './products.js';
import reviews from './reviews.js';
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

export default router;
