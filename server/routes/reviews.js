import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { optionalText, parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { getProduct } from '../services/catalog.js';
import { listReviews, ratingSummary, reviewEligibility, saveReview } from '../services/reviews.js';

const router = Router();

const listSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'highest', 'lowest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

async function productOr404(slug) {
  const product = await getProduct({ slug });
  if (!product) throw notFound('Product not found');
  return product;
}

/** All published reviews across the store (the Reviews page). */
router.get('/reviews', async (req, res) => {
  const f = parse(listSchema, req.query);
  const [list, summary] = await Promise.all([listReviews(f), ratingSummary()]);
  res.json({ ...list, summary });
});

router.get('/products/:slug/reviews', async (req, res) => {
  const product = await productOr404(req.params.slug);
  const f = parse(listSchema, req.query);
  const [list, summary] = await Promise.all([listReviews({ ...f, productId: product.id }), ratingSummary(product.id)]);
  res.json({ ...list, summary });
});

/** Whether the current visitor can review this product (and their existing review). */
router.get('/products/:slug/reviews/eligibility', async (req, res) => {
  const product = await productOr404(req.params.slug);
  const { canReview, reason, review } = await reviewEligibility(req.user, product.id);
  res.json({ canReview, reason, review });
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  title: optionalText(120),
  body: z.string().trim().min(10, 'Please write at least 10 characters').max(2000),
});

router.post('/products/:slug/reviews', requireAuth, async (req, res) => {
  const product = await productOr404(req.params.slug);
  const body = parse(reviewSchema, req.body);
  res.status(201).json(await saveReview(req.user, product.id, body));
});

export default router;
