import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { paginated, parse, uuid } from '../../lib/validate.js';
import { bulkEnquiryAdminLink } from '../../services/whatsapp.js';

const router = Router();
const STATUSES = ['new', 'contacted', 'converted', 'closed'];
const COLUMNS = 'id, name, phone, email, company, message, items, status, admin_notes, created_at, updated_at';

const withLink = (e) => ({ ...e, whatsappUrl: bulkEnquiryAdminLink(e) });

router.get('/bulk-enquiries', async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(STATUSES).optional().or(z.literal('').transform(() => undefined)),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    req.query,
  );
  const params = [];
  const where = f.status ? `WHERE status = $${params.push(f.status)}` : '';
  const rows = await query(
    `SELECT ${COLUMNS}, count(*) OVER() AS full_count FROM bulk_enquiries ${where}
      ORDER BY created_at DESC LIMIT $${params.push(f.pageSize)} OFFSET $${params.push((f.page - 1) * f.pageSize)}`,
    params,
  );
  const items = rows.map(({ fullCount: _omit, ...e }) => withLink(e));
  res.json(paginated(items, rows[0]?.fullCount ?? 0, f.page, f.pageSize));
});

router.patch('/bulk-enquiries/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(
    z.object({ status: z.enum(STATUSES).optional(), adminNotes: z.string().trim().max(2000).nullish() }),
    req.body,
  );
  await query(
    `UPDATE bulk_enquiries SET status = coalesce($2, status),
            admin_notes = CASE WHEN $3 THEN $4 ELSE admin_notes END
      WHERE id = $1`,
    [id, body.status ?? null, body.adminNotes !== undefined, body.adminNotes || null],
  );
  const row = await queryOne(`SELECT ${COLUMNS} FROM bulk_enquiries WHERE id = $1`, [id]);
  if (!row) throw notFound('Enquiry not found');
  res.json(withLink(row));
});

export default router;
