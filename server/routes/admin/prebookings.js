import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../../lib/validate.js';
import { listPrebookings, PREBOOKING_STATUSES, updatePrebooking } from '../../services/prebookings.js';
import { prebookingAdminLink } from '../../services/whatsapp.js';

const router = Router();
const withLink = (b) => ({ ...b, whatsappUrl: prebookingAdminLink(b) });

router.get('/prebookings', async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(PREBOOKING_STATUSES).optional().or(z.literal('').transform(() => undefined)),
      q: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    req.query,
  );
  const result = await listPrebookings(f);
  res.json({ ...result, items: result.items.map(withLink) });
});

router.patch('/prebookings/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(
    z.object({ status: z.enum(PREBOOKING_STATUSES).optional(), adminNotes: z.string().trim().max(2000).nullish() }),
    req.body,
  );
  res.json(withLink(await updatePrebooking(id, body)));
});

export default router;
