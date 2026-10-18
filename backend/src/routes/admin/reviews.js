import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../../lib/validate.js';
import { deleteReview, listReviews, ratingSummary, setReviewStatus } from '../../services/reviews.js';

const router = Router();

router.get('/reviews', async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(['published', 'hidden']).optional().or(z.literal('').transform(() => undefined)),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      q: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    req.query,
  );
  const [list, summary] = await Promise.all([listReviews({ ...f, admin: true }), ratingSummary()]);
  res.json({ ...list, summary });
});

router.patch('/reviews/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(z.object({ status: z.enum(['published', 'hidden']) }), req.body);
  res.json(await setReviewStatus(id, status));
});

router.delete('/reviews/:id', async (req, res) => {
  await deleteReview(parse(uuid, req.params.id));
  res.status(204).end();
});

export default router;
