import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool, query, queryOne, transaction } from '../../db/pool.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/util.js';
import { optionalText, paginated, parse, uuid } from '../../lib/validate.js';
import { getProduct, SUMMARY_JOINS, summarySelect } from '../../services/catalog.js';
import { deleteImage, MAX_UPLOAD_BYTES, saveImage } from '../../services/storage.js';

const router = Router();

// --- Uploads ----------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

router.post('/uploads', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "file" field');
  const folder = req.query.folder === 'categories' ? 'categories' : 'products';
  res.status(201).json(await saveImage(req.file, folder));
});

// --- List -------------------------------------------------------------------
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional().transform((v) => v || undefined), // id or slug
  status: z.enum(['active', 'draft', 'archived']).optional().or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/products', async (req, res) => {
  const f = parse(listQuery, req.query);
  const where = [];
  const params = [];
  const add = (v) => `$${params.push(v)}`;
  if (f.q) {
    const like = add(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(p.name LIKE ${like} OR p.slug LIKE ${like} OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.sku LIKE ${like}))`);
  }
  if (f.category) {
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.category);
    where.push(`p.category_id = (SELECT id FROM categories WHERE ${isId ? 'id = ' : 'slug = '}${add(f.category)})`);
  }
  if (f.status) where.push(`p.status = ${add(f.status)}`);
  else where.push(`p.status <> 'archived'`);

  const rows = await query(
    `SELECT ${summarySelect('true')}, count(*) OVER() AS full_count
       FROM products p ${SUMMARY_JOINS('true')}
      WHERE ${where.join(' AND ')}
      ORDER BY p.updated_at DESC
      LIMIT ${add(f.pageSize)} OFFSET ${add((f.page - 1) * f.pageSize)}`,
    params,
  );
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    isFeatured: r.isFeatured,
    category: r.categoryId ? { id: r.categoryId, name: r.categoryName, slug: r.categorySlug } : null,
    imageUrl: r.imageUrl,
    minPrice: r.minPrice ?? 0,
    maxPrice: r.maxPrice ?? 0,
    totalStock: r.totalStock,
    variantCount: r.variantCount,
    updatedAt: r.updatedAt,
  }));
  res.json(paginated(items, rows[0]?.fullCount ?? 0, f.page, f.pageSize));
});

router.get('/products/:id', async (req, res) => {
  const product = await getProduct({ id: parse(uuid, req.params.id), admin: true });
  if (!product) throw notFound('Product not found');
  res.json(product);
});

// --- Create / update --------------------------------------------------------
const money = z.coerce.number().int('Amount must be in paise (whole number)');

const variantSchema = z
  .object({
    id: z.uuid().optional(),
    sku: z.string().trim().min(1, 'SKU is required').max(64).regex(/^[A-Za-z0-9._-]+$/, 'SKU may only contain letters, numbers, dot, dash and underscore'),
    size: optionalText(30),
    color: optionalText(40),
    colorHex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1A2B3C').nullish().or(z.literal('').transform(() => null)).transform((v) => v ?? null),
    price: money.min(100, 'Price must be at least ₹1'),
    compareAtPrice: money.min(1).nullish().transform((v) => v ?? null),
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative').max(1_000_000),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    message: 'Compare-at price must be higher than the price',
    path: ['compareAtPrice'],
  });

const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(150),
    slug: z.string().trim().max(80).optional().transform((v) => (v ? slugify(v) : undefined)),
    description: z.string().trim().max(10_000).default(''),
    ingredients: optionalText(5000).transform((v) => v || null),
    showIngredients: z.boolean().default(true),
    categoryId: z.uuid().nullish().transform((v) => v ?? null),
    status: z.enum(['active', 'draft', 'archived']).default('active'),
    isFeatured: z.boolean().default(false),
    variants: z.array(variantSchema).min(1, 'Add at least one variant').max(100),
    images: z
      .array(z.object({ id: z.uuid().optional(), url: z.string().trim().min(1).max(1000), key: z.string().max(500).nullish(), alt: optionalText(200) }))
      .max(20)
      .default([]),
  })
  .superRefine((p, ctx) => {
    const skus = new Map();
    const combos = new Map();
    p.variants.forEach((v, i) => {
      const sku = v.sku.toLowerCase();
      if (skus.has(sku)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: 'Duplicate SKU' });
      skus.set(sku, i);
      if (!v.isActive) return;
      const combo = `${v.size ?? ''}|${v.color ?? ''}`;
      if (combos.has(combo)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'size'], message: 'Duplicate size/colour combination' });
      combos.set(combo, i);
    });
  });

async function uniqueSlug(base, excludeId, db) {
  const root = base || 'product';
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const taken = await queryOne('SELECT 1 FROM products WHERE slug = $1 AND NOT (id <=> $2)', [candidate, excludeId], db);
    if (!taken) return candidate;
  }
  throw badRequest('Could not generate a unique slug; please enter one');
}

function translateUniqueError(err, body) {
  if (err?.code !== '23505') return err;
  if (err.constraint === 'product_variants_sku_key') {
    // MySQL: "Duplicate entry 'TT-M-BLK' for key 'product_variants.product_variants_sku_key'"
    const duplicate = /Duplicate entry '([^']*)'/.exec(err.sqlMessage ?? '')?.[1];
    const sku = body.variants.find((v) => v.sku.toLowerCase() === duplicate?.toLowerCase())?.sku ?? duplicate;
    const index = body.variants.findIndex((v) => v.sku === sku);
    return new AppError(400, 'VALIDATION_ERROR', `SKU ${sku ?? ''} is already used by another product`.trim(), [
      { path: index >= 0 ? `variants.${index}.sku` : 'variants', message: 'SKU already in use' },
    ]);
  }
  if (err.constraint === 'product_variants_option_uniq') {
    return new AppError(400, 'VALIDATION_ERROR', 'Two active variants have the same size and colour', [
      { path: 'variants', message: 'Duplicate size/colour combination' },
    ]);
  }
  if (err.constraint === 'products_slug_key') {
    return new AppError(400, 'VALIDATION_ERROR', 'This slug is already used by another product', [{ path: 'slug', message: 'Slug already in use' }]);
  }
  return err;
}

async function saveProduct(body, productId = null) {
  return transaction(async (db) => {
    if (body.categoryId) {
      const cat = await queryOne('SELECT 1 FROM categories WHERE id = $1', [body.categoryId], db);
      if (!cat) throw badRequest('Category not found', [{ path: 'categoryId', message: 'Category not found' }]);
    }
    const slug = body.slug ?? (await uniqueSlug(slugify(body.name), productId, db));

    let id = productId;
    if (id) {
      const { rowCount } = await db.query(
        `UPDATE products SET name = $2, slug = $3, description = $4, category_id = $5, status = $6, is_featured = $7,
                ingredients = $8, show_ingredients = $9
          WHERE id = $1`,
        [id, body.name, slug, body.description, body.categoryId, body.status, body.isFeatured, body.ingredients, body.showIngredients],
      );
      if (!rowCount) throw notFound('Product not found');
    } else {
      id = randomUUID();
      await query(
        `INSERT INTO products (id, name, slug, description, category_id, status, is_featured, ingredients, show_ingredients)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, body.name, slug, body.description, body.categoryId, body.status, body.isFeatured, body.ingredients, body.showIngredients],
        db,
      );
    }

    // Variants: update by id, insert new, delete (or deactivate if ordered before) removed ones.
    const existing = await query('SELECT id FROM product_variants WHERE product_id = $1', [id], db);
    const existingIds = new Set(existing.map((v) => v.id));
    const keepIds = new Set(body.variants.filter((v) => v.id).map((v) => v.id));
    for (const v of body.variants) {
      if (v.id && !existingIds.has(v.id)) throw badRequest('Variant does not belong to this product');
    }
    const removed = [...existingIds].filter((vid) => !keepIds.has(vid));
    if (removed.length) {
      // Variants that appear in past orders are retired (inactive, SKU freed); the rest are deleted.
      // (An array parameter expands to a list, so `IN ($1)` matches any of them.)
      await query(
        `UPDATE product_variants
            SET is_active = false,
                sku = IF(sku LIKE '%-removed-%', sku, CONCAT(sku, '-removed-', LEFT(id, 8)))
          WHERE id IN ($1) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.variant_id = product_variants.id)`,
        [removed],
        db,
      );
      await query(
        `DELETE FROM product_variants
          WHERE id IN ($1) AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.variant_id = product_variants.id)`,
        [removed],
        db,
      );
    }
    for (const [i, v] of body.variants.entries()) {
      const values = [v.sku, v.size, v.color, v.colorHex, v.price, v.compareAtPrice, v.stock, v.isActive, i];
      if (v.id) {
        await query(
          `UPDATE product_variants SET sku = $2, size = $3, color = $4, color_hex = $5, price = $6,
                  compare_at_price = $7, stock = $8, is_active = $9, sort_order = $10
            WHERE id = $1`,
          [v.id, ...values],
          db,
        );
      } else {
        await query(
          `INSERT INTO product_variants (product_id, sku, size, color, color_hex, price, compare_at_price, stock, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [id, ...values],
          db,
        );
      }
    }

    // Images: array order is display order.
    const oldImages = await query('SELECT id, storage_key FROM product_images WHERE product_id = $1', [id], db);
    const keepImageIds = new Set(body.images.filter((img) => img.id).map((img) => img.id));
    const removedImages = oldImages.filter((img) => !keepImageIds.has(img.id));
    if (removedImages.length) {
      await query('DELETE FROM product_images WHERE id IN ($1)', [removedImages.map((img) => img.id)], db);
    }
    for (const [i, img] of body.images.entries()) {
      if (img.id && oldImages.some((o) => o.id === img.id)) {
        await query('UPDATE product_images SET sort_order = $2, alt = $3 WHERE id = $1', [img.id, i, img.alt], db);
      } else {
        await query(
          'INSERT INTO product_images (product_id, url, storage_key, alt, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [id, img.url, img.key ?? null, img.alt, i],
          db,
        );
      }
    }
    return { id, removedImageKeys: removedImages.map((img) => img.storageKey).filter(Boolean) };
  });
}

router.post('/products', async (req, res) => {
  const body = parse(productSchema, req.body);
  let saved;
  try {
    saved = await saveProduct(body);
  } catch (err) {
    throw translateUniqueError(err, body);
  }
  res.status(201).json(await getProduct({ id: saved.id, admin: true }));
});

router.put('/products/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const body = parse(productSchema, req.body);
  let saved;
  try {
    saved = await saveProduct(body, id);
  } catch (err) {
    throw translateUniqueError(err, body);
  }
  // Remove files of deleted images after the transaction committed.
  for (const key of saved.removedImageKeys) void deleteImage(key);
  res.json(await getProduct({ id, admin: true }));
});

router.delete('/products/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { rowCount } = await pool.query(`UPDATE products SET status = 'archived', is_featured = false WHERE id = $1`, [id]);
  if (!rowCount) throw notFound('Product not found');
  res.status(204).end();
});

export default router;
