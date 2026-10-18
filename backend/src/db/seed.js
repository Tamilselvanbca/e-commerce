// Seeds a demo catalog for a traditional sweets & snacks store (categories,
// products, pack-size / flavour variants, illustrated images) and the admin
// user(s) from ADMIN_PHONES.
//   npm run seed                 catalog + admin (skipped if products exist)
//   npm run seed -- --force      replace the catalog
//   npm run seed -- --demo       also create demo customers, orders and reviews (dashboard data)
//   npm run db:reset             wipe the whole database, then seed the catalog
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { generateOrderNumber, normalizePhone, slugify } from '../lib/util.js';
import { loadSettings } from '../services/settings.js';
import { uploadRoot } from '../services/storage.js';
import { pool, query, queryOne, transaction } from './pool.js';
import { packArt, productArt } from './seed-art.js';

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DEMO = args.has('--demo');
const DEMO_ORDERS = 60;

// Deterministic pseudo-random numbers so every seed produces the same catalog.
let rngState = 42;
const rand = () => ((rngState = (rngState * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const CATEGORIES = [
  { name: 'Sweets', slug: 'sweets', description: 'Mithai made with pure ghee, fresh milk and nuts, the way it has always been made.' },
  { name: 'Laddus', slug: 'laddus', parent: 'sweets' },
  { name: 'Barfi & Katli', slug: 'barfi-katli', parent: 'sweets' },
  { name: 'Traditional Sweets', slug: 'traditional-sweets', parent: 'sweets' },
  { name: 'Snacks', slug: 'snacks', description: 'Crunchy savouries and namkeen for tea time, travel and festivals.' },
  { name: 'Murukku & Chakli', slug: 'murukku', parent: 'snacks' },
  { name: 'Mixture & Namkeen', slug: 'mixture-namkeen', parent: 'snacks' },
  { name: 'Chips', slug: 'chips', parent: 'snacks' },
  { name: 'Gift Boxes', slug: 'gift-boxes', description: 'Assorted boxes and hampers for Diwali, Pongal, weddings and corporate gifting.' },
  { name: 'Healthy Bites', slug: 'healthy-bites', description: 'Millet, jaggery and dry-fruit treats with no refined sugar.' },
];

const g250 = (p, c) => ['250 g', p, c];
const g500 = (p, c) => ['500 g', p, c];
const kg1 = (p, c) => ['1 kg', p, c];
const g200 = (p, c) => ['200 g', p, c];
const g400 = (p, c) => ['400 g', p, c];

const SHELF_STABLE = 'Ships in India and internationally.';
const INDIA_ONLY = 'Milk-based sweet: delivered within India only.';

/**
 * art: illustration spec for seed-art.js. flavours: [name, swatch hex, art overrides].
 * packs: [label, price ₹, compare-at ₹?]. Prices are per pack.
 */
const PRODUCTS = [
  // --- Laddus ---------------------------------------------------------------
  {
    name: 'Motichoor Laddu', cat: 'laddus', featured: true,
    packs: [g250(180, 220), g500(340, 420), kg1(650, 800)],
    art: { kind: 'laddus', color: '#F08A24', texture: 'boondi', toppings: true },
    description: `Tiny boondi pearls fried in pure ghee, soaked in saffron syrup and rolled into soft, melt-in-the-mouth laddus.
Ingredients: gram flour, pure ghee, sugar, saffron, cardamom, melon seeds, cashews.
Shelf life: 10 days. Store in a cool, dry place.
${SHELF_STABLE}`,
  },
  {
    name: 'Besan Laddu', cat: 'laddus', featured: true,
    packs: [g250(160), g500(300), kg1(580)],
    art: { kind: 'laddus', color: '#D9A13D', texture: 'grainy', toppings: true },
    description: `Gram flour slow-roasted in ghee until nutty and golden, sweetened and shaped by hand.
Ingredients: gram flour, pure ghee, sugar, cardamom, cashews.
Shelf life: 20 days. Store in an airtight container.
${SHELF_STABLE}`,
  },
  {
    name: 'Rava Laddu', cat: 'laddus',
    packs: [g250(140), g500(260)],
    art: { kind: 'laddus', color: '#EFD9A2', texture: 'grainy', toppings: true },
    description: `Roasted semolina and grated coconut with ghee-fried cashews and raisins, a festival favourite.
Ingredients: semolina, sugar, ghee, coconut, cashews, raisins, cardamom.
Shelf life: 10 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Coconut Laddu', cat: 'laddus',
    packs: [g250(150), g500(280)],
    flavours: [['Classic', '#F7F1E3', { color: '#F4EEDF' }], ['Jaggery', '#A0622D', { color: '#B07438' }]],
    art: { kind: 'laddus', color: '#F4EEDF', texture: 'coconut' },
    description: `Fresh coconut cooked with sugar or organic jaggery and a hint of cardamom.
Ingredients: coconut, sugar or jaggery, milk solids, cardamom.
Shelf life: 7 days. Refrigerate after opening.
${SHELF_STABLE}`,
  },
  // --- Barfi & Katli ----------------------------------------------------------
  {
    name: 'Kaju Katli', cat: 'barfi-katli', featured: true,
    packs: [g250(300, 340), g500(580, 660), kg1(1120, 1300)],
    flavours: [['Classic', '#F3E7D3', { color: '#F1E6D2' }], ['Kesar', '#F2B53C', { color: '#F5CF7A' }]],
    art: { kind: 'diamonds', color: '#F1E6D2', foil: true },
    description: `Diamond-cut cashew fudge finished with edible silver leaf. Smooth, rich and not too sweet.
Ingredients: cashew nuts, sugar, ghee, edible silver leaf (Kesar: saffron).
Shelf life: 20 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Milk Barfi', cat: 'barfi-katli',
    packs: [g250(200), g500(380)],
    art: { kind: 'squares', color: '#F6E9CF', topping: ['#7FAE45', '#D9480F'] },
    description: `Slow-cooked milk khoa set into squares and topped with pistachio and saffron.
Ingredients: milk, sugar, ghee, pistachio, saffron, cardamom.
Shelf life: 5 days. Refrigerate.
${INDIA_ONLY}`,
  },
  {
    name: 'Kalakand', cat: 'barfi-katli',
    packs: [g250(220), g500(420)],
    art: { kind: 'squares', color: '#F2E3C0', topping: ['#7FAE45'] },
    description: `Soft, grainy milk cake made from fresh paneer and reduced milk.
Ingredients: milk, paneer, sugar, cardamom, pistachio.
Shelf life: 3 days. Refrigerate.
${INDIA_ONLY}`,
  },
  // --- Traditional ------------------------------------------------------------
  {
    name: 'Mysore Pak', cat: 'traditional-sweets', featured: true,
    packs: [g250(220, 260), g500(420, 500), kg1(800, 950)],
    art: { kind: 'porousBars', color: '#E9A93C' },
    description: `The royal sweet of Mysore: gram flour cooked in generous amounts of ghee until it turns porous and melts in your mouth.
Ingredients: gram flour, pure ghee, sugar.
Shelf life: 15 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Jalebi', cat: 'traditional-sweets',
    packs: [g250(120), g500(220)],
    art: { kind: 'jalebis', color: '#F28C1E' },
    description: `Crisp spirals fried in ghee and dipped in warm saffron syrup. Best enjoyed the same day.
Ingredients: refined flour, curd, ghee, sugar, saffron.
Shelf life: 2 days.
${INDIA_ONLY}`,
  },
  {
    name: 'Gulab Jamun', cat: 'traditional-sweets',
    packs: [g500(220), kg1(420)],
    art: { kind: 'jamunBowl', color: '#7A3416' },
    description: `Soft khoa dumplings fried golden brown and soaked in rose and cardamom syrup. Packed in a sealed tin.
Ingredients: milk solids, refined flour, sugar, ghee, rose water, cardamom.
Shelf life: 30 days unopened (tin).
${SHELF_STABLE}`,
  },
  {
    name: 'Adhirasam', cat: 'traditional-sweets',
    packs: [g250(180), g500(340)],
    art: { kind: 'discs', color: '#6E3A1C' },
    description: `A Deepavali classic from Tamil Nadu: rice flour and jaggery discs fried until crisp outside and chewy within.
Ingredients: rice flour, jaggery, sesame, cardamom, oil, ghee.
Shelf life: 15 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Badam Halwa', cat: 'traditional-sweets',
    packs: [g250(320), g500(620)],
    art: { kind: 'halwaBowl', color: '#F0A32B' },
    description: `Almonds ground and slow-cooked with ghee, sugar and saffron into a rich, glossy halwa.
Ingredients: almonds, ghee, sugar, saffron, milk.
Shelf life: 10 days. Refrigerate.
${SHELF_STABLE}`,
  },
  // --- Murukku ----------------------------------------------------------------
  {
    name: 'Kai Murukku', cat: 'murukku', featured: true,
    packs: [g200(120), g400(230)],
    art: { kind: 'coils', color: '#D99A43' },
    description: `Hand-twisted rice flour murukku, made the traditional way by skilled hands. Crunchy, light and addictive.
Ingredients: rice flour, urad dal flour, butter, sesame, cumin, salt, oil.
Shelf life: 30 days. Store in an airtight container.
${SHELF_STABLE}`,
  },
  {
    name: 'Thenkuzhal', cat: 'murukku',
    packs: [g200(110), g400(210)],
    art: { kind: 'coils', color: '#E8C27D', thin: true },
    description: `Delicate, crisp spirals of rice and urad dal flour with cumin.
Ingredients: rice flour, urad dal flour, cumin, butter, salt, oil.
Shelf life: 30 days.
${SHELF_STABLE}`,
  },
  // --- Mixture & namkeen --------------------------------------------------------
  {
    name: 'Madras Mixture', cat: 'mixture-namkeen', featured: true,
    packs: [g250(120), g500(230), kg1(440)],
    flavours: [['Classic', '#E8A33D', {}], ['Spicy', '#C81E1E', { spicy: true }]],
    art: { kind: 'mixtureBowl' },
    description: `Sev, boondi, roasted peanuts, curry leaves and cashews tossed with our house spice blend.
Ingredients: gram flour, rice flour, peanuts, cashews, curry leaves, chilli, salt, oil.
Shelf life: 45 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Ribbon Pakoda', cat: 'mixture-namkeen',
    packs: [g250(120), g500(230)],
    art: { kind: 'ribbons', color: '#D88F3A' },
    description: `Crisp ribbon-shaped strips of gram and rice flour, mildly spiced.
Ingredients: gram flour, rice flour, chilli, butter, salt, oil.
Shelf life: 30 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Kara Boondi', cat: 'mixture-namkeen',
    packs: [g250(100), g500(190)],
    art: { kind: 'smallBalls', color: '#E0702A' },
    description: `Spiced gram flour pearls tossed with curry leaves and peanuts.
Ingredients: gram flour, peanuts, curry leaves, chilli, salt, oil.
Shelf life: 30 days.
${SHELF_STABLE}`,
  },
  // --- Chips ------------------------------------------------------------------
  {
    name: 'Kerala Banana Chips', cat: 'chips',
    packs: [g200(110), g400(210)],
    flavours: [['Salted', '#F2C94C', {}], ['Pepper', '#5A5A5A', { pepper: true }]],
    art: { kind: 'chips', color: '#F2C94C' },
    description: `Thin slices of Nendran banana fried in pure coconut oil, the authentic Kerala way.
Ingredients: raw banana, coconut oil, salt (Pepper: black pepper).
Shelf life: 45 days.
${SHELF_STABLE}`,
  },
  // --- Gift boxes -------------------------------------------------------------
  {
    name: 'Diwali Sweet Box', cat: 'gift-boxes', featured: true,
    packs: [g500(650, 750), kg1(1250, 1450)],
    art: { kind: 'giftBox', color: '#7C222C' },
    description: `An assortment of our best-loved sweets: kaju katli, Mysore pak, motichoor and besan laddus, in a festive gift box.
Contents vary by pack size. Personalised greeting card on request.
Shelf life: 10 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Festive Snack Hamper', cat: 'gift-boxes',
    packs: [['Box of 4', 899, 999], ['Box of 6', 1299, 1450]],
    art: { kind: 'giftBox', color: '#1E5B3A' },
    description: `Our favourite savouries in one hamper: kai murukku, Madras mixture, ribbon pakoda, banana chips and more.
Box of 4 or 6 assorted packs (200–250 g each).
Shelf life: 30 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Wedding Return Gift Box', cat: 'gift-boxes',
    packs: [['Pack of 10', 2200], ['Pack of 25', 5250]],
    art: { kind: 'giftBox', color: '#B03A45' },
    description: `Small boxes with 4 assorted sweets each, perfect as thamboolam or return gifts. Order in packs of 10 or 25.
Custom names and dates on the box available for bulk orders. Contact us on WhatsApp.
Shelf life: 10 days.
${SHELF_STABLE}`,
  },
  // --- Healthy bites ----------------------------------------------------------
  {
    name: 'Dry Fruit Laddu', cat: 'healthy-bites', featured: true,
    packs: [g250(340), g500(650)],
    art: { kind: 'laddus', color: '#8A5A34', texture: 'nutty' },
    description: `Dates, figs, almonds, cashews and pistachios bound together. No added sugar.
Ingredients: dates, figs, almonds, cashews, pistachios, ghee, poppy seeds.
Shelf life: 30 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Ragi Murukku', cat: 'healthy-bites',
    packs: [g200(130), g400(250)],
    art: { kind: 'coils', color: '#7B4A2E' },
    description: `Finger millet murukku: all the crunch, with more fibre and calcium.
Ingredients: ragi flour, rice flour, sesame, cumin, salt, oil.
Shelf life: 30 days.
${SHELF_STABLE}`,
  },
  {
    name: 'Chikki', cat: 'healthy-bites',
    packs: [g200(90), g400(170)],
    flavours: [['Peanut', '#C98B4A', { seeds: 'peanut' }], ['Sesame', '#F7EEDB', { seeds: 'sesame' }]],
    art: { kind: 'bars', color: '#B5651D', seeds: 'peanut' },
    description: `Crunchy brittle of roasted peanuts or sesame set in organic jaggery.
Ingredients: peanuts or sesame, jaggery, ghee.
Shelf life: 60 days.
${SHELF_STABLE}`,
  },
];

// ---------------------------------------------------------------------------
async function writeImage(slug, name, svg) {
  const key = `seed/${slug}-${name}.svg`;
  const file = path.join(uploadRoot, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, svg);
  return { url: `/uploads/${key}`, key };
}

async function seedAdmins() {
  for (const raw of config.auth.adminPhones) {
    const phone = normalizePhone(raw);
    if (!phone) continue;
    await query(
      `INSERT INTO users (phone, name, role) VALUES ($1, 'Store Admin', 'admin')
       ON CONFLICT (phone) DO UPDATE SET role = 'admin'`,
      [phone],
    );
    console.log(`Admin user: ${phone}`);
  }
}

async function seedCatalog() {
  const { count } = await queryOne('SELECT count(*) FROM products');
  if (count > 0 && !FORCE) {
    console.log(`Catalog already has ${count} products; skipping (use --force to replace).`);
    return;
  }

  // Fresh set of illustrations.
  await rm(path.join(uploadRoot, 'seed'), { recursive: true, force: true });

  await transaction(async (db) => {
    if (FORCE) {
      await query('DELETE FROM cart_items', [], db);
      await query('DELETE FROM product_images', [], db);
      await query('DELETE FROM product_variants WHERE id NOT IN (SELECT variant_id FROM order_items WHERE variant_id IS NOT NULL)', [], db);
      await query('DELETE FROM products WHERE id NOT IN (SELECT product_id FROM order_items WHERE product_id IS NOT NULL)', [], db);
      await query('DELETE FROM categories', [], db);
    }

    const catIds = {};
    for (const [i, c] of CATEGORIES.entries()) {
      const row = await queryOne(
        `INSERT INTO categories (name, slug, description, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [c.name, c.slug, c.description ?? null, c.parent ? catIds[c.parent] : null, i],
        db,
      );
      catIds[c.slug] = row.id;
    }

    for (const [pi, p] of PRODUCTS.entries()) {
      const slug = slugify(p.name);
      const product = await queryOne(
        `INSERT INTO products (name, slug, description, category_id, is_featured, created_at)
         VALUES ($1, $2, $3, $4, $5, now() - make_interval(days => $6)) RETURNING id`,
        [p.name, slug, p.description, catIds[p.cat], Boolean(p.featured), PRODUCTS.length - pi],
        db,
      );

      const flavours = p.flavours ?? [[null, null, {}]];
      const initials = slug.split('-').map((w) => w[0]).join('').toUpperCase();
      let sort = 0;
      for (const [flavour, hex] of flavours) {
        for (const [pack, price, compare] of p.packs) {
          const roll = rand();
          const stock = roll < 0.06 ? 0 : roll < 0.15 ? 1 + Math.floor(rand() * 4) : 15 + Math.floor(rand() * 60);
          const sku = [initials, flavour?.slice(0, 3).toUpperCase(), pack.replace(/\s+/g, '').toUpperCase()].filter(Boolean).join('-');
          await query(
            `INSERT INTO product_variants (product_id, sku, size, color, color_hex, price, compare_at_price, stock, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [product.id, sku, pack, flavour, hex, price * 100, compare ? compare * 100 : null, stock, sort++],
            db,
          );
        }
      }

      // Images: one illustration per flavour, then the gift pack.
      const images = [];
      for (const [fi, [flavour, , override]] of flavours.entries()) {
        const svg = productArt(p.name, { ...p.art, ...override }, pi * 10 + fi);
        images.push({ ...(await writeImage(slug, flavour ? slugify(flavour) : 'main', svg)), alt: flavour ? `${p.name} (${flavour})` : p.name });
      }
      const packColor = p.art.kind === 'giftBox' ? p.art.color : ['#7C222C', '#9A3412', '#1E5B3A', '#6B2142'][pi % 4];
      images.push({ ...(await writeImage(slug, 'pack', packArt(p.name, packColor, pi, config.store.name))), alt: `${p.name} gift pack` });
      for (const [i, img] of images.entries()) {
        await query(
          'INSERT INTO product_images (product_id, url, storage_key, alt, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [product.id, img.url, img.key, img.alt, i],
          db,
        );
      }
    }
  });
  console.log(`Seeded ${CATEGORIES.length} categories and ${PRODUCTS.length} products.`);
}

/** Demo customers (India and abroad) and historical orders so the admin dashboard has data. */
async function seedDemoOrders() {
  const customers = [
    ['+919800000001', 'Aarav Sharma', 'aarav@example.com', ['Chennai', 'Tamil Nadu', '600004', 'IN']],
    ['+919800000002', 'Divya Raman', 'divya@example.com', ['Bengaluru', 'Karnataka', '560011', 'IN']],
    ['+919800000003', 'Karthik Iyer', 'karthik@example.com', ['Coimbatore', 'Tamil Nadu', '641002', 'IN']],
    ['+919800000004', 'Meera Pillai', 'meera@example.com', ['Kochi', 'Kerala', '682016', 'IN']],
    ['+14155550123', 'Priya Natarajan', 'priya@example.com', ['San Jose', 'California', '95112', 'US']],
    ['+447700900123', 'Arjun Menon', 'arjun@example.com', ['London', 'Greater London', 'E6 1AA', 'GB']],
    ['+971501234567', 'Lakshmi Krishnan', 'lakshmi@example.com', ['Dubai', 'Dubai', '00000', 'AE']],
  ];
  const users = [];
  for (const [phone, name, email, place] of customers) {
    const u = await queryOne(
      `INSERT INTO users (phone, name, email, created_at) VALUES ($1, $2, $3, now() - make_interval(days => $4))
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id, phone, name, email`,
      [phone, name, email, Math.floor(rand() * 40)],
    );
    users.push({ ...u, place });
  }
  const variants = await query(
    `SELECT v.id, v.sku, v.size, v.color, v.price, p.id AS product_id, p.name, p.slug,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active`,
  );
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'confirmed', 'confirmed', 'cancelled'];

  for (let n = 0; n < DEMO_ORDERS; n++) {
    const user = pick(users);
    const [city, state, pincode, country] = user.place;
    const international = country !== 'IN';
    const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ v: pick(variants), qty: 1 + Math.floor(rand() * 3) }));
    const subtotal = lines.reduce((s, l) => s + l.v.price * l.qty, 0);
    const s = config.store;
    const shipping = international
      ? s.internationalFreeShippingThreshold && subtotal >= s.internationalFreeShippingThreshold ? 0 : s.internationalShippingFee
      : subtotal >= s.freeShippingThreshold ? 0 : s.shippingFee;
    const status = pick(statuses);
    const daysAgo = Math.floor(rand() * 45);
    const gateway = international ? 'stripe' : rand() < 0.9 ? 'razorpay' : 'stripe';
    const address = { fullName: user.name, phone: user.phone, line1: `${10 + n}, Temple Street`, line2: null, landmark: null, city, state, pincode, country };

    await transaction(async (db) => {
      const order = await queryOne(
        `INSERT INTO orders (order_number, user_id, status, payment_status, payment_gateway, subtotal, shipping_fee, total,
                             email, phone, shipping_address, created_at, paid_at, cancelled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 now() - make_interval(days => $12, hours => $13),
                 now() - make_interval(days => $12, hours => $13) + interval '2 minutes',
                 CASE WHEN $3 = 'cancelled' THEN now() - make_interval(days => $12) ELSE NULL END)
         RETURNING id, created_at`,
        [generateOrderNumber(new Date(Date.now() - daysAgo * 864e5)), user.id, status, status === 'cancelled' ? 'refunded' : 'paid',
          gateway, subtotal, shipping, subtotal + shipping, user.email, user.phone, JSON.stringify(address), daysAgo, Math.floor(rand() * 20)],
        db,
      );
      for (const { v, qty } of lines) {
        await query(
          `INSERT INTO order_items (order_id, product_id, variant_id, product_name, product_slug, sku, size, color, image_url, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [order.id, v.productId, v.id, v.name, v.slug, v.sku, v.size, v.color, v.imageUrl, v.price, qty, v.price * qty],
          db,
        );
      }
      await query(
        `INSERT INTO payments (order_id, gateway, gateway_order_id, gateway_payment_id, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5, 'INR', 'paid')`,
        [order.id, gateway, `demo_${order.id.slice(0, 12)}`, `demo_pay_${order.id.slice(0, 8)}`, subtotal + shipping],
        db,
      );
      const flow = ['confirmed', 'processing', 'shipped', 'delivered'];
      const steps = status === 'cancelled' ? ['confirmed', 'cancelled'] : flow.slice(0, flow.indexOf(status) + 1);
      const label = gateway === 'razorpay' ? 'Razorpay' : 'Stripe';
      for (const [i, st] of steps.entries()) {
        await query(
          `INSERT INTO order_status_history (order_id, status, note, created_at) VALUES ($1, $2, $3, $4::timestamptz + make_interval(hours => $5))`,
          [order.id, st, i === 0 ? `Payment received via ${label}` : null, order.createdAt, i * 20],
          db,
        );
      }
      if (['shipped', 'delivered'].includes(status)) {
        await query(
          `INSERT INTO shipments (order_id, provider, courier, awb, shipped_at, delivered_at)
           VALUES ($1, 'manual', $2, $3, $4::timestamptz + interval '1 day', CASE WHEN $5 THEN $4::timestamptz + interval '4 days' END)`,
          [order.id, international ? 'DHL Express' : 'Delhivery', `${international ? 'DHL' : 'DL'}${Math.floor(1e9 + rand() * 9e9)}`, order.createdAt, status === 'delivered'],
          db,
        );
      }
    });
  }
  console.log(`Seeded ${customers.length} demo customers (India, US, UK, UAE) and ${DEMO_ORDERS} demo orders.`);
}

// Demo review copy by product type. Ratings 4–5 use the first texts, 3 the "mixed" ones.
const REVIEW_TEXTS = [
  [/laddu/i, [
    ['Tastes like home', 'Soft, fresh and just the right sweetness. Reminded me of the laddus my grandmother made for every festival.'],
    ['Gone in two days', 'Rich with ghee and perfectly shaped. The whole family finished the box in two days!'],
  ]],
  [/katli|barfi|kalakand/i, [
    ['Perfect for gifting', 'Smooth, thin and not overly sweet. The packing made it perfect to take to a friend\'s house for Diwali.'],
    ['Fresh even abroad', 'Ordered to London and it arrived fresh within five days. Best I have had outside India.'],
  ]],
  [/mysore/i, [
    ['Melts in the mouth', 'Ghee-rich and porous, exactly like the Mysore pak from the old sweet shops back home.'],
    ['Authentic taste', 'Soft, fragrant and not too heavy. Will definitely order the 1 kg pack next time.'],
  ]],
  [/murukku|thenkuzhal|pakoda|boondi/i, [
    ['Crunchy and fresh', 'Very crispy and not oily at all. Tastes homemade, perfect with evening tea.'],
    ['Reached crisp in Dubai', 'Sent for Deepavali to Dubai. It reached crisp and well sealed. Ordering again.'],
  ]],
  [/mixture/i, [
    ['Perfect tea-time snack', 'Lovely mix of sev, peanuts and curry leaves. The spicy version has a nice kick.'],
    ['Addictive', 'Fresh and well balanced, not too salty. The resealable pack is a big plus.'],
  ]],
  [/chips/i, [['Authentic Kerala chips', 'Thin, crispy and you can taste the coconut oil. Just like the ones from Kozhikode.']]],
  [/jalebi|jamun|halwa|adhirasam/i, [
    ['Soft and syrupy', 'Fresh and delicious, packed carefully so nothing leaked. Brought back childhood memories.'],
    ['Festival favourite', 'We ordered this for Pongal and everyone loved it. Not too sweet, very fresh.'],
  ]],
  [/box|hamper|gift/i, [
    ['Beautiful packing', 'Ordered boxes for my sister\'s wedding. Beautiful packing and the guests loved the sweets.'],
    ['Made my parents happy', 'Sent the box to my parents in Chennai from the US. Delivered on time, they were thrilled.'],
  ]],
  [/chikki|dry fruit|ragi/i, [['Healthy and tasty', 'Great guilt-free snack for the kids\' lunch boxes. Fresh and crunchy.']]],
];
const MIXED_TEXTS = [
  ['Good, a little sweet', 'Fresh and well packed. A little sweeter than I like, but the quality is good.'],
  ['Nice, delivery was slow', 'Tasty and fresh, but delivery took a couple of days longer than expected.'],
];

async function seedDemoReviews() {
  const rows = await query(
    `SELECT DISTINCT ON (o.user_id, oi.product_id)
            o.id AS order_id, o.user_id, u.name, oi.product_id, oi.product_name, o.shipping_address, o.created_at
       FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN users u ON u.id = o.user_id
      WHERE o.status IN ('delivered', 'shipped') AND oi.product_id IS NOT NULL
      ORDER BY o.user_id, oi.product_id, o.created_at`,
  );
  let n = 0;
  for (const r of rows) {
    const rating = pick([5, 5, 5, 5, 4, 4, 4, 3]);
    const pool = REVIEW_TEXTS.find(([re]) => re.test(r.productName))?.[1] ?? [['Will order again', 'Fresh, well packed and delivered on time. Will order again.']];
    const [title, body] = rating === 3 ? pick(MIXED_TEXTS) : pick(pool);
    const parts = r.name.split(' ');
    const author = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    await query(
      `INSERT INTO reviews (product_id, user_id, order_id, author_name, author_city, author_country, rating, title, body, verified, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, LEAST($10::timestamptz + interval '6 days', now() - interval '3 hours'))
       ON CONFLICT DO NOTHING`,
      [r.productId, r.userId, r.orderId, author, r.shippingAddress?.city ?? null, r.shippingAddress?.country ?? null, rating, title, body, r.createdAt],
    );
    n++;
  }
  console.log(`Seeded ${n} demo reviews.`);
}

try {
  // Use the store name etc. saved in Admin → Settings (falls back to .env).
  await loadSettings().catch((err) => console.warn(`Using .env settings only: ${err.message}`));
  await seedAdmins();
  await seedCatalog();
  if (DEMO) {
    await seedDemoOrders();
    await seedDemoReviews();
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
