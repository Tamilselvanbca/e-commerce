import { query, queryOne } from '../db/pool.js';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', 'FREE SIZE'];

/**
 * Parses pack sizes such as "250 g", "1 kg", "500 ml", "Box of 6" or "12 pcs"
 * into [unit group, amount] so they sort naturally (250 g < 500 g < 1 kg).
 */
function packAmount(label) {
  const s = label.trim().toLowerCase();
  let m = /^(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?|l|ltr|ml)\b/.exec(s);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    if (unit === 'kg' || unit === 'l' || unit === 'ltr') return [unit === 'kg' ? 'mass' : 'volume', n * 1000];
    return [unit === 'ml' ? 'volume' : 'mass', n];
  }
  m = /(?:box|pack|set)\s+of\s+(\d+)|^(\d+)\s*(?:pcs?|pieces?|nos?)\b/.exec(s);
  if (m) return ['count', Number(m[1] ?? m[2])];
  return null;
}

export function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const pa = packAmount(a);
    const pb = packAmount(b);
    if (pa && pb) return pa[0] === pb[0] ? pa[1] - pb[1] : pa[0].localeCompare(pb[0]);
    if (pa || pb) return pa ? -1 : 1;
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = Number.parseFloat(a);
    const nb = Number.parseFloat(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

/** Small helper to build parameterised SQL incrementally. */
class Params {
  values = [];
  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Returns the ids of the category with `slug` and all of its descendants, or null if missing. */
async function categoryTreeIds(slug) {
  const rows = await query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM categories WHERE slug = $1 AND is_active
       UNION ALL
       SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.is_active
     ) SELECT id FROM tree`,
    [slug],
  );
  return rows.length ? rows.map((r) => r.id) : null;
}

// Shared SELECT list for product cards. Expects the products table aliased as `p`.
const SUMMARY_SELECT = `
  p.id, p.name, p.slug, p.is_featured, p.status, p.created_at, p.updated_at,
  c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
  agg.min_price, agg.max_price, agg.total_stock, agg.variant_count,
  cheapest.compare_at_price,
  img.url AS image_url,
  rv.rating_avg, rv.rating_count`;

const SUMMARY_JOINS = (variantFilter = 'v.is_active') => `
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN LATERAL (
    SELECT min(v.price) AS min_price, max(v.price) AS max_price,
           coalesce(sum(v.stock), 0) AS total_stock, count(*) AS variant_count
      FROM product_variants v WHERE v.product_id = p.id AND ${variantFilter}
  ) agg ON true
  LEFT JOIN LATERAL (
    SELECT v.compare_at_price FROM product_variants v
     WHERE v.product_id = p.id AND ${variantFilter}
     ORDER BY v.price, v.sort_order LIMIT 1
  ) cheapest ON true
  LEFT JOIN LATERAL (
    SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1
  ) img ON true
  LEFT JOIN LATERAL (
    SELECT round(avg(r.rating)::numeric, 1) AS rating_avg, count(*) AS rating_count
      FROM reviews r WHERE r.product_id = p.id AND r.status = 'published'
  ) rv ON true`;

export function toSummary(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    minPrice: r.minPrice ?? 0,
    maxPrice: r.maxPrice ?? 0,
    compareAtPrice: r.compareAtPrice ?? null,
    imageUrl: r.imageUrl ?? null,
    category: r.categoryId ? { id: r.categoryId, name: r.categoryName, slug: r.categorySlug } : null,
    inStock: Number(r.totalStock) > 0,
    isFeatured: r.isFeatured,
    rating: r.ratingCount ? { average: r.ratingAvg, count: r.ratingCount } : null,
    createdAt: r.createdAt,
  };
}

/**
 * Storefront product search with filters, sorting, pagination and facets.
 * @param {object} f parsed query (see routes/catalog.js)
 */
export async function listProducts(f) {
  const empty = {
    items: [], page: f.page, pageSize: f.pageSize, total: 0, totalPages: 0,
    facets: { sizes: [], colors: [], priceRange: { min: 0, max: 0 } },
  };

  // Scope = category + search + featured. Facets are computed over the scope so
  // that selecting a size doesn't hide the other size options.
  const p = new Params();
  const scope = [`p.status = 'active'`];
  if (f.category) {
    const ids = await categoryTreeIds(f.category);
    if (!ids) return empty;
    scope.push(`p.category_id = ANY(${p.add(ids)}::uuid[])`);
  }
  let rankExpr = null;
  if (f.q) {
    const qParam = p.add(f.q);
    const likeParam = p.add(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    scope.push(`(p.search @@ websearch_to_tsquery('english', ${qParam}) OR p.name ILIKE ${likeParam})`);
    rankExpr = `ts_rank(p.search, websearch_to_tsquery('english', ${qParam}))`;
  }
  if (f.featured) scope.push('p.is_featured');
  const scopeWhere = scope.join(' AND ');

  // Variant-level filters: the product matches if at least one active variant satisfies all of them.
  const vf = ['v.is_active'];
  if (f.sizes?.length) vf.push(`v.size = ANY(${p.add(f.sizes)}::text[])`);
  if (f.colors?.length) vf.push(`v.color = ANY(${p.add(f.colors)}::text[])`);
  if (f.minPrice != null) vf.push(`v.price >= ${p.add(f.minPrice)}`);
  if (f.maxPrice != null) vf.push(`v.price <= ${p.add(f.maxPrice)}`);
  if (f.inStock) vf.push('v.stock > 0');
  const variantMatch = `EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND ${vf.join(' AND ')})`;

  const sort = f.sort ?? (f.q ? 'relevance' : 'newest');
  const orderBy = {
    newest: 'p.created_at DESC, p.id',
    price_asc: 'agg.min_price ASC, p.id',
    price_desc: 'agg.min_price DESC, p.id',
    popular: 'coalesce(sold.units, 0) DESC, p.created_at DESC, p.id',
    rating: 'coalesce(rv.rating_avg, 0) DESC, rv.rating_count DESC, p.created_at DESC, p.id',
    relevance: rankExpr ? `${rankExpr} DESC, p.created_at DESC, p.id` : 'p.created_at DESC, p.id',
  }[sort];
  const popularJoin = sort === 'popular'
    ? `LEFT JOIN LATERAL (
         SELECT sum(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.payment_status = 'paid'
       ) sold ON true`
    : '';

  const where = `${scopeWhere} AND ${variantMatch} AND agg.variant_count > 0`;
  const limit = p.add(f.pageSize);
  const offset = p.add((f.page - 1) * f.pageSize);

  const [rows, facetRows] = await Promise.all([
    query(
      `SELECT ${SUMMARY_SELECT}, count(*) OVER() AS full_count
         FROM products p ${SUMMARY_JOINS()} ${popularJoin}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}`,
      p.values,
    ),
    query(
      `SELECT v.size, v.color, v.color_hex, min(v.price) AS min_price, max(v.price) AS max_price
         FROM products p JOIN product_variants v ON v.product_id = p.id AND v.is_active
        WHERE ${scopeWhere}
        GROUP BY v.size, v.color, v.color_hex`,
      // Facet query only references scope parameters, which come first in p.values.
      p.values.slice(0, countParams(scopeWhere)),
    ),
  ]);

  const sizes = sortSizes([...new Set(facetRows.map((r) => r.size).filter(Boolean))]);
  const colorMap = new Map();
  for (const r of facetRows) if (r.color && !colorMap.has(r.color)) colorMap.set(r.color, r.colorHex ?? null);
  const colors = [...colorMap].map(([name, hex]) => ({ name, hex })).sort((a, b) => a.name.localeCompare(b.name));
  const priceRange = facetRows.length
    ? { min: Math.min(...facetRows.map((r) => r.minPrice)), max: Math.max(...facetRows.map((r) => r.maxPrice)) }
    : { min: 0, max: 0 };

  const total = rows[0]?.fullCount ?? 0;
  if (total === 0 && f.page > 1) {
    // Out-of-range page: still report the real total.
    const { count } = await queryOne(
      `SELECT count(*) FROM products p ${SUMMARY_JOINS()} WHERE ${where}`,
      p.values.slice(0, -2),
    );
    return { ...empty, total: count, totalPages: Math.ceil(count / f.pageSize), facets: { sizes, colors, priceRange } };
  }
  return {
    items: rows.map(toSummary),
    page: f.page,
    pageSize: f.pageSize,
    total,
    totalPages: Math.ceil(total / f.pageSize),
    facets: { sizes, colors, priceRange },
  };
}

/** Highest $n placeholder used in a SQL fragment. */
function countParams(sql) {
  const nums = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Loads a full product by slug or id.
 * @param {{ slug?: string, id?: string, admin?: boolean }} opts admin=true includes drafts and inactive variants
 */
export async function getProduct({ slug, id, admin = false }) {
  const row = await queryOne(
    `SELECT p.id, p.name, p.slug, p.description, p.status, p.is_featured, p.created_at, p.updated_at,
            c.id AS category_id, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${slug ? 'p.slug = $1' : 'p.id = $1'} ${admin ? '' : `AND p.status = 'active'`}`,
    [slug ?? id],
  );
  if (!row) return null;

  const [variants, images, rating] = await Promise.all([
    query(
      `SELECT id, sku, size, color, color_hex, price, compare_at_price, stock, is_active
         FROM product_variants WHERE product_id = $1 ${admin ? '' : 'AND is_active'}
        ORDER BY sort_order, price, id`,
      [row.id],
    ),
    query('SELECT id, url, storage_key AS key, alt, sort_order FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at', [row.id]),
    queryOne(
      `SELECT round(avg(rating)::numeric, 1) AS average, count(*) AS count FROM reviews WHERE product_id = $1 AND status = 'published'`,
      [row.id],
    ),
  ]);

  const active = variants.filter((v) => v.isActive);
  const priced = active.length ? active : variants;
  const cheapest = priced.reduce((min, v) => (!min || v.price < min.price ? v : min), null);
  const colorMap = new Map();
  for (const v of active) if (v.color && !colorMap.has(v.color)) colorMap.set(v.color, v.colorHex ?? null);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    isFeatured: row.isFeatured,
    category: row.categoryId ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug } : null,
    minPrice: cheapest?.price ?? 0,
    maxPrice: priced.reduce((max, v) => Math.max(max, v.price), 0),
    compareAtPrice: cheapest?.compareAtPrice ?? null,
    imageUrl: images[0]?.url ?? null,
    inStock: active.some((v) => v.stock > 0),
    rating: rating.count ? { average: rating.average, count: rating.count } : null,
    images,
    variants,
    options: {
      sizes: sortSizes([...new Set(active.map((v) => v.size).filter(Boolean))]),
      colors: [...colorMap].map(([name, hex]) => ({ name, hex })),
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function relatedProducts(productId, categoryId, limit = 8) {
  const rows = await query(
    `SELECT ${SUMMARY_SELECT}
       FROM products p ${SUMMARY_JOINS()}
      WHERE p.status = 'active' AND p.id <> $1 AND agg.variant_count > 0
        AND ($2::uuid IS NULL OR p.category_id = $2)
      ORDER BY (p.category_id IS NOT DISTINCT FROM $2) DESC, p.is_featured DESC, p.created_at DESC
      LIMIT $3`,
    [productId, categoryId, limit],
  );
  return rows.map(toSummary);
}

export async function listCategories({ admin = false } = {}) {
  const rows = await query(
    `SELECT c.id, c.name, c.slug, c.description, c.image_url, c.parent_id, c.sort_order, c.is_active,
            (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
       FROM categories c
      ORDER BY c.sort_order, c.name`,
  );
  // Roll product counts up so a parent category includes its sub-categories.
  const byId = new Map(rows.map((c) => [c.id, { ...c, ownCount: c.productCount }]));
  for (const c of rows) {
    const seen = new Set([c.id]);
    for (let p = byId.get(c.parentId); p && !seen.has(p.id); p = byId.get(p.parentId)) {
      seen.add(p.id);
      p.productCount += c.productCount;
    }
  }
  const result = [...byId.values()].map(({ ownCount: _omit, ...c }) => c);
  return admin ? result : result.filter((c) => c.isActive).map(({ isActive: _omit, ...c }) => c);
}

export { SUMMARY_SELECT, SUMMARY_JOINS };
