import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { normalizePhone } from '../lib/util.js';
import { optionalText, parse } from '../lib/validate.js';
import { publicFormLimiter } from '../middleware/security.js';
import { adminBulkEnquiryEmail, queueEmail } from '../services/email.js';
import { bulkEnquiryCustomerLink, notifyBusinessViaWati } from '../services/whatsapp.js';

const router = Router();

const itemSchema = z.object({
  productId: z.uuid().nullish(),
  variantId: z.uuid().nullish(),
  productName: z.string().trim().min(1, 'Enter a product name').max(150),
  variantLabel: optionalText(100),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
});

const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => normalizePhone(v) !== null, 'Enter a valid mobile number')
    .transform((v) => normalizePhone(v)),
  email: z.union([z.email('Enter a valid email address'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  company: optionalText(120),
  message: optionalText(2000),
  items: z.array(itemSchema).max(50).default([]),
});

router.post('/', publicFormLimiter, async (req, res) => {
  const body = parse(enquirySchema, req.body);
  const id = randomUUID();
  await query(
    `INSERT INTO bulk_enquiries (id, user_id, name, phone, email, company, message, items)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, req.user?.id ?? null, body.name, body.phone, body.email, body.company, body.message, JSON.stringify(body.items)],
  );
  const row = await queryOne(
    'SELECT id, name, phone, email, company, message, items, status, created_at FROM bulk_enquiries WHERE id = $1',
    [id],
  );
  const adminMail = adminBulkEnquiryEmail(row);
  if (adminMail) queueEmail(adminMail);
  setImmediate(() => void notifyBusinessViaWati(row));
  res.status(201).json({ id: row.id, whatsappUrl: bulkEnquiryCustomerLink(row) });
});

export default router;
