import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { publicFormLimiter } from '../middleware/security.js';
import { giftCardBalance } from '../services/gift-cards.js';

const router = Router();

// Balance check for anyone holding a code (no login needed). Codes are 80-bit random.
router.post('/balance', publicFormLimiter, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(1, 'Enter the gift card code').max(40) }), req.body);
  res.json(await giftCardBalance(code));
});

export default router;
