import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/util.js';
import { optionalText, parse, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const COLUMNS = 'id, full_name, phone, line1, line2, landmark, city, state, pincode, country, is_default';

const baseFields = {
  fullName: z.string().trim().min(2, 'Enter the full name').max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => normalizePhone(v) !== null, 'Enter a valid mobile number')
    .transform((v) => normalizePhone(v)),
  line1: z.string().trim().min(3, 'Enter the address').max(200),
  line2: optionalText(200),
  landmark: optionalText(120),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.string().trim().min(2, 'Select the state').max(80),
  pincode: z.string().trim().max(12),
  country: z.string().trim().length(2).toUpperCase().default('IN'),
  isDefault: z.boolean().optional(),
};

const pincodeCheck = (a, ctx) => {
  if ((a.country ?? 'IN') === 'IN' && a.pincode !== undefined && !/^[1-9]\d{5}$/.test(a.pincode)) {
    ctx.addIssue({ code: 'custom', path: ['pincode'], message: 'Enter a valid 6-digit PIN code' });
  }
};

const createSchema = z.object(baseFields).superRefine(pincodeCheck);
const updateSchema = z.object(baseFields).partial().superRefine(pincodeCheck);

export async function getAddress(userId, id, db = pool) {
  const address = await queryOne(`SELECT ${COLUMNS} FROM addresses WHERE id = $1 AND user_id = $2`, [id, userId], db);
  if (!address) throw notFound('Address not found');
  return address;
}

router.get('/', async (req, res) => {
  const items = await query(
    `SELECT ${COLUMNS} FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC`,
    [req.user.id],
  );
  res.json({ items });
});

router.post('/', async (req, res) => {
  const a = parse(createSchema, req.body);
  const address = await transaction(async (db) => {
    const { count } = await queryOne('SELECT count(*) AS count FROM addresses WHERE user_id = $1', [req.user.id], db);
    const makeDefault = a.isDefault || count === 0;
    if (count >= 20) throw badRequest('You can save up to 20 addresses');
    if (makeDefault) await query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default', [req.user.id], db);
    const id = randomUUID();
    await query(
      `INSERT INTO addresses (id, user_id, full_name, phone, line1, line2, landmark, city, state, pincode, country, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, req.user.id, a.fullName, a.phone, a.line1, a.line2, a.landmark, a.city, a.state, a.pincode, a.country, makeDefault],
      db,
    );
    return getAddress(req.user.id, id, db);
  });
  res.status(201).json(address);
});

router.patch('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const a = parse(updateSchema, req.body);
  const address = await transaction(async (db) => {
    const current = await getAddress(req.user.id, id, db);
    if (a.isDefault) await query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default', [req.user.id], db);
    const merged = { ...current, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) };
    await query(
      `UPDATE addresses SET full_name = $3, phone = $4, line1 = $5, line2 = $6, landmark = $7, city = $8,
              state = $9, pincode = $10, country = $11, is_default = $12
        WHERE id = $1 AND user_id = $2`,
      [id, req.user.id, merged.fullName, merged.phone, merged.line1, merged.line2, merged.landmark, merged.city,
        merged.state, merged.pincode, merged.country, a.isDefault ? true : current.isDefault],
      db,
    );
    return getAddress(req.user.id, id, db);
  });
  res.json(address);
});

router.delete('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  await transaction(async (db) => {
    const current = await getAddress(req.user.id, id, db);
    await query('DELETE FROM addresses WHERE id = $1', [id], db);
    if (current.isDefault) {
      // Promote the most recently used remaining address.
      const next = await queryOne('SELECT id FROM addresses WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [req.user.id], db);
      if (next) await query('UPDATE addresses SET is_default = true WHERE id = $1', [next.id], db);
    }
  });
  res.status(204).end();
});

router.post('/:id/default', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const address = await transaction(async (db) => {
    await getAddress(req.user.id, id, db);
    await query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default', [req.user.id], db);
    await query('UPDATE addresses SET is_default = true WHERE id = $1', [id], db);
    return getAddress(req.user.id, id, db);
  });
  res.json(address);
});

export default router;
