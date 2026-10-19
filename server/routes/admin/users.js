import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../db/pool.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { paginated, parse, uuid } from '../../lib/validate.js';
import { listOrders } from '../../services/orders.js';

const router = Router();

const COLUMNS = `u.id, u.phone, u.name, u.email, u.role, u.is_blocked, u.created_at, u.last_login_at,
  (SELECT count(*) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS order_count,
  (SELECT coalesce(sum(total), 0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS total_spent`;

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['customer', 'admin']).optional().or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/users', async (req, res) => {
  const f = parse(listSchema, req.query);
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (f.q) {
    const like = add(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(u.phone ILIKE ${like} OR u.name ILIKE ${like} OR u.email ILIKE ${like})`);
  }
  if (f.role) where.push(`u.role = ${add(f.role)}`);
  const rows = await query(
    `SELECT ${COLUMNS}, count(*) OVER() AS full_count
       FROM users u ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.created_at DESC
      LIMIT ${add(f.pageSize)} OFFSET ${add((f.page - 1) * f.pageSize)}`,
    params,
  );
  const items = rows.map(({ fullCount: _omit, ...u }) => u);
  res.json(paginated(items, rows[0]?.fullCount ?? 0, f.page, f.pageSize));
});

router.get('/users/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const user = await queryOne(`SELECT ${COLUMNS} FROM users u WHERE u.id = $1`, [id]);
  if (!user) throw notFound('User not found');
  const [addresses, orders] = await Promise.all([
    query(
      `SELECT id, full_name, phone, line1, line2, landmark, city, state, pincode, country, is_default
         FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC`,
      [id],
    ),
    listOrders({ userId: id, page: 1, pageSize: 50, admin: true }),
  ]);
  res.json({ user, addresses, orders: orders.items });
});

router.patch('/users/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(z.object({ role: z.enum(['customer', 'admin']).optional(), isBlocked: z.boolean().optional() }), req.body);
  if (id === req.user.id && (body.role === 'customer' || body.isBlocked === true)) {
    throw badRequest('You cannot block or remove admin access from your own account');
  }
  const user = await queryOne(
    `UPDATE users u SET role = coalesce($2, role), is_blocked = coalesce($3, is_blocked)
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, body.role ?? null, body.isBlocked ?? null],
  );
  if (!user) throw notFound('User not found');
  // Blocking signs the user out everywhere.
  if (body.isBlocked) await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  res.json(user);
});

export default router;
