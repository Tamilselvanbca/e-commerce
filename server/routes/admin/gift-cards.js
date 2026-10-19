import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { optionalText, pageQuery, parse, uuid } from '../../lib/validate.js';
import { giftCardEmail, queueEmail } from '../../services/email.js';
import {
  adjustGiftCard,
  createGiftCard,
  getGiftCard,
  giftCardForEmail,
  listGiftCards,
  updateGiftCard,
} from '../../services/gift-cards.js';

const router = Router();

const email = z
  .union([z.email('Enter a valid email address'), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : v === undefined ? undefined : null));
const futureDate = z.iso
  .datetime({ offset: true, error: 'Enter a valid date' })
  .refine((v) => new Date(v) > new Date(), 'The expiry date must be in the future')
  .nullable();

router.get('/gift-cards', async (req, res) => {
  const f = parse(
    pageQuery.extend({
      q: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'used', 'expired', 'disabled']).optional().or(z.literal('').transform(() => undefined)),
    }),
    req.query,
  );
  res.json(await listGiftCards(f));
});

router.get('/gift-cards/:id', async (req, res) => {
  res.json(await getGiftCard(parse(uuid, req.params.id)));
});

router.post('/gift-cards', async (req, res) => {
  const input = parse(
    z.object({
      amount: z.number({ error: 'Enter an amount' }).int().min(100, 'At least ₹1').max(1_00_000_00, 'At most ₹1,00,000'),
      recipientName: optionalText(100),
      recipientEmail: email,
      senderName: optionalText(100),
      message: optionalText(500),
      expiresAt: futureDate.default(null),
      sendEmail: z.boolean().default(true),
      note: optionalText(200),
    }),
    req.body,
  );
  if (input.sendEmail && !input.recipientEmail) {
    throw badRequest("Add the recipient's email to send the gift card", [{ path: 'recipientEmail', message: 'Required to send the email' }]);
  }
  const card = await createGiftCard(input, req.user.id);
  if (input.sendEmail) queueEmail(giftCardEmail(await giftCardForEmail(card.id)));
  res.status(201).json({ ...card, emailed: input.sendEmail });
});

router.patch('/gift-cards/:id', async (req, res) => {
  const input = parse(
    z.object({
      isActive: z.boolean().optional(),
      expiresAt: futureDate.optional(),
      recipientName: optionalText(100).optional(),
      recipientEmail: email,
      senderName: optionalText(100).optional(),
      message: optionalText(500).optional(),
    }),
    req.body,
  );
  res.json(await updateGiftCard(parse(uuid, req.params.id), input));
});

router.post('/gift-cards/:id/adjust', async (req, res) => {
  const { amount, note } = parse(
    z.object({
      amount: z.number({ error: 'Enter an amount' }).int().refine((v) => v !== 0, 'Enter an amount to add or remove').refine((v) => Math.abs(v) <= 1_00_000_00, 'At most ₹1,00,000'),
      note: z.string().trim().min(3, 'Say why the balance is changing').max(200),
    }),
    req.body,
  );
  res.json(await adjustGiftCard(parse(uuid, req.params.id), amount, note, req.user.id));
});

router.post('/gift-cards/:id/email', async (req, res) => {
  const card = await giftCardForEmail(parse(uuid, req.params.id));
  const message = giftCardEmail(card);
  if (!message) throw badRequest('This gift card has no recipient email. Add one first.');
  queueEmail(message);
  res.json({ sent: true, to: card.recipientEmail });
});

export default router;
