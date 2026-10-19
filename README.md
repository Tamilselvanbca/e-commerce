# Sweets & Snacks Store

A complete online store for traditional Indian sweets and savouries, selling to customers in India and
abroad: customer storefront, admin panel and REST API. The storefront uses a saffron-orange theme with
animated kolam/rangoli artwork (see [How the kolam animation works](#how-the-kolam-animation-works)).

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS 4) |
| Backend | Node.js 24 + Express 5 |
| Database | MySQL 8.4 (also runs on MySQL 8.0.16+, MariaDB 10.11 and GoDaddy's managed MySQL) |
| Payments | Razorpay (UPI, cards, net banking, wallets) and Stripe (international cards) |
| Images | Amazon S3 (local disk in development) |
| Email | Nodemailer over SMTP (SendGrid, SES or any SMTP server) |
| OTP SMS | MSG91 or Twilio |
| Shipping | Shiprocket (optional; manual courier entry also supported) |
| WhatsApp | Click-to-chat bulk orders; optional WATI notifications |

## Features

**Customers**
- OTP login/sign-up with a mobile number (no passwords), with country codes for international customers
- Browse by category (Sweets, Snacks, Gift Boxes, Healthy Bites), full-text search, filters
  (pack size, flavour, price, in stock), sorting including "Top rated"
- Product pages with image gallery, pack-size / flavour variants, ingredients and shelf life
- Customer reviews: star ratings on cards and product pages, verified-purchase reviews, a store-wide Reviews page
- Cart (works for guests; merged into the account on login)
- Checkout with saved addresses in India or abroad, domestic vs international shipping rates,
  Razorpay (India) or Stripe (international cards), payment verification
- Order history, live order status timeline, shipment tracking, retry payment / cancel unpaid orders
- Festive & bulk orders through WhatsApp: pre-filled WhatsApp message plus an enquiry form
- About us, contact and store policy pages (returns policy written for perishable food)
- Email notifications: order confirmed, shipped, delivered, cancelled

**Admin panel** (`/admin`)
- Dashboard: revenue, orders, average order value, new customers, revenue by day, order status
  breakdown, gateway split, top products, low stock, recent orders
- Products: create/edit with variants (size, colour, SKU, price, compare-at price, stock) and image upload
- Categories (nested), orders (status workflow, courier/AWB entry, Shiprocket shipment, refunds),
  customers (block, grant admin), bulk enquiries (status, notes, reply on WhatsApp), reviews (hide / delete)

**Engineering**
- Stock is reserved atomically at checkout and released automatically if payment isn't completed
  within 30 minutes (configurable)
- Payment confirmation is idempotent: the browser callback and the gateway webhook can both arrive safely
- Signed webhook verification (Razorpay HMAC, Stripe signature), webhook de-duplication
- httpOnly session cookies, origin-checked CSRF protection, rate limiting, input validation (zod),
  parameterised SQL, magic-byte checks on image uploads
- Automated API test suite (59 tests) covering auth, cart, checkout, both gateways, webhooks, reviews,
  discounts, gift cards, settings and admin

## Project structure

```
backend/              Express API
  src/
    routes/           HTTP endpoints (admin/ for the admin API)
    services/         business logic: orders, cart, catalog, payments, otp, email, storage, shiprocket, whatsapp
    middleware/       auth, security (CSRF, rate limits), error handling
    db/               migrations/, migration runner, seed script
  test/               node:test + supertest suite
frontend/             Next.js app
  src/app/(shop)/     storefront routes
  src/app/admin/      admin panel routes
  src/components/     shared UI, providers (auth, cart, toasts), shop/ and admin/ components
  src/lib/            API client, types, formatting helpers
docs/                 API reference, deployment guide, client checklist, admin guide
deploy/Caddyfile      reverse proxy with automatic HTTPS
deploy/godaddy/       bundle builder for GoDaddy Node.js Hosting (managed MySQL)
docker-compose.yml    local MySQL + Mailpit
docker-compose.prod.yml  production stack
```

## Local development

Prerequisites: Node.js 22.12+ (24 recommended) and Docker.

```bash
# 1. Start MySQL (localhost:3307, databases shop and shop_test) and Mailpit (email viewer at http://localhost:8025)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # then set OTP_SECRET to a long random string
npm install
npm run migrate
npm run seed:demo             # sweets & snacks catalog + admin user + demo orders and reviews (or `npm run seed` for catalog only)
npm run dev                   # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

**Logging in locally:** the default `OTP_PROVIDER=console` prints the code in the backend log, and
`OTP_EXPOSE_IN_RESPONSE=true` also shows it on the login screen. The number in `ADMIN_PHONES`
(default `9999999999`) becomes an admin on login; open http://localhost:3000/admin.

**Demo images:** the seed script draws an SVG illustration for every product (on a brass thali, banana
leaf or bowl, plus a gift-pack shot) into `backend/uploads/seed/`. Replace them with real photos from the
admin panel.

**Paying locally:** `ENABLE_MOCK_PAYMENTS=true` adds a "Test payment" option that simulates success
or failure. To try the real gateways, put Razorpay and Stripe *test* keys in `backend/.env`. For webhooks
during local development use the Stripe CLI (`stripe listen --forward-to localhost:4000/api/webhooks/stripe`)
and a tunnel such as ngrok for Razorpay.

### Useful scripts

| Where | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` | API with auto-reload |
| backend | `npm test` | run the test suite (needs the `shop_test` database, see below) |
| backend | `npm run migrate` | apply pending SQL migrations (also runs on server start) |
| backend | `npm run seed` / `seed:demo` | seed catalog / catalog plus demo orders |
| backend | `npm run db:reset` | drop everything, migrate and seed (development only) |
| frontend | `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| frontend | `npm run lint` | ESLint |

The `shop_test` database is created by `docker/mysql-init/` when the MySQL container first starts. For an
older container, create it once:
```bash
docker exec shop-mysql mysql -uroot -pshop-root -e "CREATE DATABASE shop_test; GRANT ALL ON shop_test.* TO 'shop'@'%'"
```

## How requests flow

```
Browser ──► Next.js (:3000) ──rewrite /api/*, /uploads/*──► Express (:4000) ──► MySQL
                                                                  ├──► Razorpay / Stripe
Razorpay / Stripe webhooks ─────────────────────────────────────► │──► S3, SMTP, MSG91/Twilio
                                                                  └──► Shiprocket, WATI
```
In production, Caddy routes `/api/*` and `/uploads/*` straight to Express and everything else to Next.js,
all on one domain, so cookies are first-party and no CORS setup is needed.

### Order and payment lifecycle

1. `POST /api/checkout` validates the cart, **reserves stock**, creates the order (`pending`) and the
   gateway payment (Razorpay order / Stripe Checkout Session).
2. The customer pays. Razorpay calls back in the browser (signature verified server-side); Stripe
   redirects to `/checkout/success`, which verifies the session. Webhooks confirm the same payment
   independently.
3. On the first confirmation the order becomes `confirmed`/`paid`, the cart is cleared and emails go out.
4. Unpaid orders expire after `ORDER_PAYMENT_TIMEOUT_MINUTES` and their stock is released. A payment
   that arrives late re-reserves the stock (or flags the order for review).
5. Admin moves orders through `processing → shipped → delivered` (customer emailed at each step), or
   cancels (stock released; refund in the gateway dashboard, then mark *Refunded*).

## How the kolam animation works

`frontend/src/lib/kolam.ts` generates authentic *sikku* kolams: a grid of dots (square, or the traditional
1-3-5-…-3-1 diamond) with one or more closed lines weaving around every dot. It uses the "mirror curve"
model: the line travels diagonally between dots, crosses itself between neighbouring dots and bounces off
the border and off mirrors placed between some dots. A seeded random generator places the mirrors with
8-fold symmetry, so each seed gives a different but deterministic design (server and browser render the same).

`frontend/src/components/kolam.tsx` renders it as SVG and animates it with CSS only: dots appear from the
centre outward, the line is "drawn" loop by loop like flowing rice flour, rangoli colours fill in, then
the design turns slowly. It's used in the home, About and Reviews heroes, category tiles, the footer and a
faint fixed background layer behind the storefront. Animations are disabled for visitors who prefer reduced
motion. The palette lives in `frontend/src/app/globals.css` (`brand` = saffron orange).

## Logo and icons

The brand logo (bowl of jalebi with the "Noruku Theeni.in" wordmark) comes from the designer's Illustrator
PDF. `frontend/public/logo-240.webp` / `logo-480.webp` (transparent, used by `components/logo.tsx` in the
header, footer and admin) and `logo.png` (email header) are rendered from it. The favicon, `icon.png` and
`apple-icon.png` in `frontend/src/app/` show only the bowl on a cream tile, and `opengraph-image.png` is the
link preview shown when the site is shared on WhatsApp or social media. To change the logo, replace these
files with versions of the same size.

## Documentation

- [docs/API.md](docs/API.md): REST API reference
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production deployment, gateway webhooks, go-live checklist
- [docs/CLIENT-CHECKLIST.md](docs/CLIENT-CHECKLIST.md): accounts and details the client needs to provide
- [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md): day-to-day admin panel guide
