import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, query, queryOne } from '../db/pool.js';
import {
  assertNotBlocked,
  createSession,
  destroySession,
  publicUser,
  requireAuth,
} from '../middleware/auth.js';
import { otpLimiter } from '../middleware/security.js';
import { requirePhone } from '../lib/util.js';
import { optionalText, parse } from '../lib/validate.js';
import { mergeGuestCart } from '../services/cart.js';
import { requestOtp, verifyOtp } from '../services/otp.js';

const router = Router();

router.post('/otp/request', otpLimiter, async (req, res) => {
  const { phone: raw } = parse(z.object({ phone: z.string().max(20) }), req.body);
  const phone = requirePhone(raw);
  res.json(await requestOtp(phone, req.ip));
});

const verifySchema = z.object({
  phone: z.string().max(20),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  name: optionalText(80),
});

router.post('/otp/verify', otpLimiter, async (req, res) => {
  const body = parse(verifySchema, req.body);
  const phone = requirePhone(body.phone);
  await verifyOtp(phone, body.code);

  const makeAdmin = config.auth.adminPhones.some((p) => requirePhoneSafe(p) === phone);
  // Upsert: create the user on first login; promote listed admin phones.
  // MySQL reports 1 affected row for an insert and 2 for an update.
  const { rowCount } = await pool.query(
    `INSERT INTO users (phone, name, role, last_login_at)
     VALUES ($1, $2, $3, NOW(3))
     ON DUPLICATE KEY UPDATE
       last_login_at = NOW(3),
       name = coalesce(name, VALUES(name)),
       role = CASE WHEN $4 THEN 'admin' ELSE role END`,
    [phone, body.name, makeAdmin ? 'admin' : 'customer', makeAdmin],
  );
  const user = await queryOne('SELECT id, phone, name, email, role, is_blocked, created_at FROM users WHERE phone = $1', [phone]);
  assertNotBlocked(user);

  await createSession(res, user.id, req);
  await mergeGuestCart(req, res, user.id);
  res.json({ user: publicUser(user), isNewUser: rowCount === 1 });
});

function requirePhoneSafe(p) {
  try {
    return requirePhone(p);
  } catch {
    return null;
  }
}

// Returns { user: null } for guests (rather than 401) so the storefront can
// check the session on every page without logging errors.
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80).optional(),
  email: z.union([z.email('Enter a valid email address').max(200), z.literal(''), z.null()]).optional(),
});

router.patch('/me', requireAuth, async (req, res) => {
  const body = parse(profileSchema, req.body);
  await query(
    `UPDATE users SET
       name = CASE WHEN $2 THEN $3 ELSE name END,
       email = CASE WHEN $4 THEN $5 ELSE email END
     WHERE id = $1`,
    [req.user.id, body.name !== undefined, body.name ?? null, body.email !== undefined, body.email ? body.email.toLowerCase() : null],
  );
  const user = await queryOne('SELECT id, phone, name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

export default router;
