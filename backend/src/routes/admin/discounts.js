import { Router } from 'express';
import { z } from 'zod';
import { optionalText, parse, uuid } from '../../lib/validate.js';
import { createDiscount, deleteDiscount, getDiscount, listDiscounts, updateDiscount } from '../../services/discounts.js';

const router = Router();

const paise = z.number({ error: 'Enter an amount' }).int().min(0).max(1_000_000_00);
const limit = z.number().int().min(1, 'At least 1').max(1_000_000).nullable().default(null);
const date = z.iso.datetime({ offset: true, error: 'Enter a valid date and time' }).nullable().default(null);

const discountSchema = z
  .object({
    // null = automatic offer (applies without a code)
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3 to 30 letters, numbers, - or _')
      .nullable(),
    title: z.string().trim().min(2, 'Enter a title customers will see').max(80),
    description: optionalText(300),
    type: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.number().int().min(0).default(0),
    maxDiscount: paise.positive('Enter a cap above ₹0').nullable().default(null),
    minSubtotal: paise.default(0),
    region: z.enum(['all', 'domestic', 'international']).default('all'),
    startsAt: date,
    endsAt: date,
    usageLimit: limit,
    perCustomerLimit: limit,
    firstOrderOnly: z.boolean().default(false),
    // Coupon codes only; automatic offers are always listed.
    showInOffers: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.type === 'percent' && (d.value < 1 || d.value > 100)) issue('value', 'Enter a percentage from 1 to 100');
    if (d.type === 'fixed' && d.value < 100) issue('value', 'Enter an amount of at least ₹1');
    if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) issue('endsAt', 'The end must be after the start');
  })
  .transform((d) => ({
    ...d,
    value: d.type === 'free_shipping' ? 0 : d.value,
    maxDiscount: d.type === 'percent' ? d.maxDiscount : null,
  }));

router.get('/discounts', async (req, res) => {
  const f = parse(
    z.object({
      q: z.string().trim().max(100).optional(),
      kind: z.enum(['code', 'automatic']).optional().or(z.literal('').transform(() => undefined)),
      status: z.enum(['active', 'inactive']).optional().or(z.literal('').transform(() => undefined)),
    }),
    req.query,
  );
  res.json(await listDiscounts(f));
});

router.get('/discounts/:id', async (req, res) => {
  res.json(await getDiscount(parse(uuid, req.params.id)));
});

router.post('/discounts', async (req, res) => {
  res.status(201).json(await createDiscount(parse(discountSchema, req.body)));
});

// Full update from the edit form.
router.put('/discounts/:id', async (req, res) => {
  res.json(await updateDiscount(parse(uuid, req.params.id), parse(discountSchema, req.body)));
});

// Quick on/off switch from the list.
router.patch('/discounts/:id', async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  res.json(await updateDiscount(parse(uuid, req.params.id), { isActive }));
});

router.delete('/discounts/:id', async (req, res) => {
  await deleteDiscount(parse(uuid, req.params.id));
  res.status(204).end();
});

export default router;
