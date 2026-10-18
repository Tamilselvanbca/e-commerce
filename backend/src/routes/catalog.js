import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { getProduct, listCategories, listProducts, relatedProducts } from '../services/catalog.js';
import { enabledGateways } from '../services/payments.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.get('/config', (_req, res) => {
  const gateways = enabledGateways();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    storeName: config.store.name,
    currency: config.store.currency,
    shippingFee: config.store.shippingFee,
    freeShippingThreshold: config.store.freeShippingThreshold,
    internationalShippingFee: config.store.internationalShippingFee,
    internationalFreeShippingThreshold: config.store.internationalFreeShippingThreshold,
    supportEmail: config.store.supportEmail ?? null,
    supportPhone: config.store.supportPhone ?? null,
    fssaiLicenseNo: config.store.fssaiLicenseNo ?? null,
    whatsappNumber: config.whatsapp.number ?? null,
    gateways: {
      razorpay: { enabled: gateways.includes('razorpay'), keyId: gateways.includes('razorpay') ? config.razorpay.keyId : null },
      stripe: { enabled: gateways.includes('stripe') },
      mock: { enabled: gateways.includes('mock') },
    },
  });
});

router.get('/categories', async (_req, res) => {
  res.json({ items: await listCategories() });
});

const list = z.string().optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : []));
const flag = z.enum(['true', 'false', '1', '0']).optional().transform((v) => v === 'true' || v === '1');
const paise = z.coerce.number().int().min(0).optional();

const productQuery = z.object({
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  category: z.string().trim().max(100).optional().transform((v) => v || undefined),
  minPrice: paise,
  maxPrice: paise,
  sizes: list,
  colors: list,
  inStock: flag,
  featured: flag,
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'rating', 'relevance']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

router.get('/products', async (req, res) => {
  const filters = parse(productQuery, req.query);
  res.json(await listProducts(filters));
});

router.get('/products/:slug', async (req, res) => {
  const product = await getProduct({ slug: req.params.slug });
  if (!product) throw notFound('Product not found');
  res.json(product);
});

router.get('/products/:slug/related', async (req, res) => {
  const product = await getProduct({ slug: req.params.slug });
  if (!product) throw notFound('Product not found');
  res.json({ items: await relatedProducts(product.id, product.category?.id ?? null) });
});

export default router;
