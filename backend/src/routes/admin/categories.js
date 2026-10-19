import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, query, queryOne } from '../../db/pool.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/util.js';
import { optionalText, parse, uuid } from '../../lib/validate.js';
import { listCategories } from '../../services/catalog.js';

const router = Router();

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  slug: z.string().trim().max(80).optional().transform((v) => (v ? slugify(v) : undefined)),
  description: optionalText(1000),
  imageUrl: optionalText(1000),
  parentId: z.uuid().nullish().transform((v) => v ?? null),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true),
});

const COLUMNS = 'id, name, slug, description, image_url, parent_id, sort_order, is_active';

async function withCount(id) {
  const row = await queryOne(`SELECT ${COLUMNS} FROM categories WHERE id = $1`, [id]);
  if (!row) throw notFound('Category not found');
  const { count } = await queryOne(`SELECT count(*) AS count FROM products WHERE category_id = $1 AND status = 'active'`, [id]);
  return { ...row, productCount: count };
}

/** Rejects a parent that is the category itself or one of its descendants. */
async function assertValidParent(id, parentId) {
  if (!parentId) return;
  if (parentId === id) throw badRequest('A category cannot be its own parent');
  const parent = await queryOne('SELECT id FROM categories WHERE id = $1', [parentId]);
  if (!parent) throw badRequest('Parent category not found');
  if (!id) return;
  const cycle = await queryOne(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id FROM categories WHERE id = $1
       UNION ALL
       SELECT c.id, c.parent_id FROM categories c JOIN ancestors a ON c.id = a.parent_id
     ) SELECT 1 FROM ancestors WHERE id = $2`,
    [parentId, id],
  );
  if (cycle) throw badRequest('A category cannot be moved under its own sub-category');
}

function slugConflict(err) {
  if (err?.code === '23505' && err.constraint === 'categories_slug_key') {
    return new AppError(400, 'VALIDATION_ERROR', 'This slug is already in use', [{ path: 'slug', message: 'Slug already in use' }]);
  }
  return err;
}

router.get('/categories', async (_req, res) => {
  res.json({ items: await listCategories({ admin: true }) });
});

router.post('/categories', async (req, res) => {
  const body = parse(schema, req.body);
  await assertValidParent(null, body.parentId);
  const id = randomUUID();
  try {
    await query(
      `INSERT INTO categories (id, name, slug, description, image_url, parent_id, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, body.name, body.slug ?? slugify(body.name), body.description, body.imageUrl, body.parentId, body.sortOrder, body.isActive],
    );
  } catch (err) {
    throw slugConflict(err);
  }
  res.status(201).json(await withCount(id));
});

router.put('/categories/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(schema, req.body);
  await assertValidParent(id, body.parentId);
  let rowCount;
  try {
    ({ rowCount } = await pool.query(
      `UPDATE categories SET name = $2, slug = $3, description = $4, image_url = $5, parent_id = $6, sort_order = $7, is_active = $8
        WHERE id = $1`,
      [id, body.name, body.slug ?? slugify(body.name), body.description, body.imageUrl, body.parentId, body.sortOrder, body.isActive],
    ));
  } catch (err) {
    throw slugConflict(err);
  }
  if (!rowCount) throw notFound('Category not found');
  res.json(await withCount(id));
});

router.delete('/categories/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Category not found');
  res.status(204).end();
});

export default router;
