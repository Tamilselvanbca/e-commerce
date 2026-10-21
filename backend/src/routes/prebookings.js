import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { normalizePhone } from '../lib/util.js';
import { optionalText, parse } from '../lib/validate.js';
import { publicFormLimiter } from '../middleware/security.js';
import { adminPrebookingEmail, prebookingReceivedEmail, queueEmail } from '../services/email.js';
import { createPrebooking, listPrebookProducts } from '../services/prebookings.js';
import { prebookingCustomerLink } from '../services/whatsapp.js';

const router = Router();

// Switched off in Admin → Settings: no form, no new bookings (admin pages keep working).
router.use((_req, _res, next) => {
  if (!config.store.prebookEnabled) throw new AppError(404, 'PREBOOK_CLOSED', 'Pre-booking is not available right now');
  next();
});

/** Products for the Pre-book form: everything active, in stock or not. */
router.get('/products', async (_req, res) => {
  res.json({ items: await listPrebookProducts() });
});

const prebookingSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => normalizePhone(v) !== null, 'Enter a valid mobile number')
    .transform((v) => normalizePhone(v)),
  email: z.union([z.email('Enter a valid email address'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  address: optionalText(1000),
  notes: optionalText(2000),
  items: z
    .array(z.object({ variantId: z.uuid(), quantity: z.coerce.number().int().min(1).max(10_000) }))
    .min(1, 'Choose at least one product')
    .max(100),
});

router.post('/', publicFormLimiter, async (req, res) => {
  const body = parse(prebookingSchema, req.body);
  const booking = await createPrebooking({ ...body, userId: req.user?.id ?? null });
  for (const mail of [adminPrebookingEmail(booking), prebookingReceivedEmail(booking)]) {
    if (mail) queueEmail(mail);
  }
  res.status(201).json({ ...booking, whatsappUrl: prebookingCustomerLink(booking) });
});

export default router;
