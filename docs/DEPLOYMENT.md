# Deployment Guide

This guide deploys the whole stack (PostgreSQL, API, Next.js, HTTPS reverse proxy) on a single Linux
server with Docker Compose. A 2 vCPU / 4 GB RAM VM (AWS EC2 or Lightsail in `ap-south-1`, or any VPS)
is enough for a typical store.

## 1. Prepare the server

```bash
# Ubuntu 22.04 / 24.04
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in
git clone <your-repo-url> shop && cd shop
```

Point DNS at the server: an `A` record for `example.com` and one for `www.example.com`. Open ports 80 and 443.

**Domain at GoDaddy:** *Domains → your domain → DNS → Records*. Edit the `A` record named `@` to the server's
IP (replacing "Parked" or a Website Builder address), add or edit a `CNAME` named `www` with value `@`, and
turn off any *Forwarding*. Changes usually apply within an hour. Check with `nslookup example.com`.
GoDaddy's Websites + Marketing and shared cPanel hosting can't run this app; use a VPS (GoDaddy VPS or any
other provider) and keep the domain at GoDaddy.

## 2. Configure

Create `./.env` (read by `docker-compose.prod.yml`):

```bash
DOMAIN=example.com
POSTGRES_PASSWORD=<long random password>
```

Create the API config from the template and fill it in:

```bash
cp backend/.env.example backend/.env.production
```

Required production values in `backend/.env.production`:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `OTP_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SETTINGS_ENCRYPTION_KEY` | another random string like the above; encrypts secrets saved in Admin → Settings. Back it up: if it changes, those secrets must be re-entered |
| `OTP_PROVIDER` + its keys | `twilio_verify` (with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`), `twilio` or `msg91`; `console` is refused in production. Needed in `.env` for the first login (see below) |
| `OTP_EXPOSE_IN_RESPONSE` | `false` |
| `ENABLE_MOCK_PAYMENTS` | `false` (ignored in production anyway) |
| `ADMIN_PHONES` | the owner's mobile number(s) |

`DATABASE_URL` and `FRONTEND_URL` are set by the compose file. Leave `TRUST_PROXY` at its default.

**Everything else is managed in Admin → Settings** after the first login: store details, delivery charges,
order SMS, Razorpay/Stripe keys, SMTP email, image storage, Shiprocket and WhatsApp. Values saved there
override `.env` (secrets are stored AES-256-GCM encrypted), apply immediately and survive restarts and
redeploys. The variables in `backend/.env.example` still work as fallbacks if you prefer files.

To move values that are already in `.env.production` into the admin panel:
```bash
docker compose -f docker-compose.prod.yml exec backend npm run settings:import   # add -- --overwrite to replace saved values
```
then delete those lines from `.env.production` and restart the backend. Keep the OTP settings in `.env`
until the import has run, so you can always log in.

## 3. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend   # should print "API listening"
```

Caddy obtains the TLS certificate automatically on first request. Migrations run on every API start.

> **Keep `/api/*` routed straight to the backend** (as `deploy/Caddyfile` does). The Next.js `/api` rewrite is
> meant for local development: it doesn't forward the client IP, so behind it the API sees every visitor as
> the Next.js server and per-IP rate limits (OTP requests, enquiry form) can't tell visitors apart. If you use
> another proxy (nginx, a load balancer), send `/api/*` and `/uploads/*` to the backend, set `X-Forwarded-For`,
> and set `TRUST_PROXY` to match the number of proxies in front of the API.
Log in at `https://example.com/login` with a number from `ADMIN_PHONES`, then open `/admin` to add
categories and products.

**Updating:** `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

## 4. Payment gateways

Sections 4–9 name the environment variables; each one is also a field in **Admin → Settings** (the
webhook URLs to register are shown there too).

All prices are charged in INR on both gateways.

### Razorpay (domestic: UPI, cards, net banking, wallets)
1. Complete KYC and activate the account (live mode needs approved KYC and bank details).
2. **Settings → API Keys** → generate live keys → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
3. **Settings → Webhooks → Add**: URL `https://example.com/api/webhooks/razorpay`, a secret of your
   choice (→ `RAZORPAY_WEBHOOK_SECRET`), events `payment.captured`, `payment.failed`, `order.paid`.
4. **Settings → Payment capture**: set to *automatic* so authorised payments are captured.

### Stripe (international cards)
1. **Developers → API keys** → `STRIPE_SECRET_KEY` (`sk_live_...`).
2. **Developers → Webhooks → Add endpoint**: `https://example.com/api/webhooks/stripe`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Stripe onboarding for Indian businesses is restricted (invite-only since 2024) and international
   payments have export-documentation requirements. Confirm the client's Stripe account can accept
   payments before launch. To switch Stripe off, leave `STRIPE_SECRET_KEY` empty; Razorpay can also accept
   international cards once that's enabled in its dashboard.

Test end-to-end with test keys first (`rzp_test_...`, `sk_test_...`) and a real order, then switch to live keys.

## 5. Email (Nodemailer)

Any SMTP provider works. SendGrid:

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<SendGrid API key>
EMAIL_FROM=My Store <orders@example.com>
```

Authenticate the sending domain (SPF/DKIM) in SendGrid, or emails will land in spam.

## 6. Images on Amazon S3

1. Create a bucket in `ap-south-1`, e.g. `mystore-media`.
2. Allow public reads of objects, either through CloudFront (recommended; set `S3_PUBLIC_URL=https://cdn.example.com`)
   or with a bucket policy granting `s3:GetObject` on `arn:aws:s3:::mystore-media/*` and "Block public access" relaxed for that policy.
3. Create an IAM user (or instance role) with this policy and put its keys in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{ "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::mystore-media/*" }]
   }
   ```
4. Set `STORAGE_DRIVER=s3`, `AWS_REGION=ap-south-1`, `AWS_S3_BUCKET=mystore-media`.

Uploads go through the API (max 5 MB; JPEG/PNG/WebP/GIF/AVIF, verified by file signature), so no bucket CORS is needed.

## 7. OTP SMS

**MSG91** (`OTP_PROVIDER=msg91`): SMS in India requires DLT registration (entity, sender ID and template).
Create an OTP template containing `##OTP##`, then set `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`.

**Twilio** (`OTP_PROVIDER=twilio`): set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_FROM`
or `TWILIO_MESSAGING_SERVICE_SID`. Indian destinations still need DLT-registered templates.

**Twilio Verify** (`OTP_PROVIDER=twilio_verify`): Twilio generates, sends and checks the code. Set
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` (`VA…`); the company name in the SMS is
the Verify service's friendly name. Optionally pick a message template (`TWILIO_VERIFY_TEMPLATE_SID`, `HJ…`):
**Admin → Settings → Login OTP & SMS → Choose from my Twilio templates** lists them.

The app generates and verifies codes itself (6 digits, 5 min expiry, 5 attempts, 60 s resend cooldown,
6 codes per number per hour), so switching provider changes only delivery.

**International customers** log in with their own country code. MSG91 needs international SMS enabled on
the account; Twilio delivers worldwide out of the box. Check per-country SMS pricing and add a spending
cap with your provider.

## 8. Shipping (Shiprocket, optional)

1. In Shiprocket: **Settings → API → Configure → Create an API user** (a separate email from your login).
2. Set `SHIPPING_PROVIDER=shiprocket`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, and
   `SHIPROCKET_PICKUP_LOCATION` exactly as the pickup location is named in Shiprocket.
3. Default parcel dimensions (`SHIPROCKET_DEFAULT_*`) are used unless the admin enters them per order.

The admin's **Ship with Shiprocket** button creates the Shiprocket order and assigns an AWB with the
recommended courier. Customers see live tracking events on their order page. Some Shiprocket accounts
require extra fields (GSTIN, HSN codes); test one shipment in Shiprocket's sandbox/test mode first.
With `SHIPPING_PROVIDER=manual`, admins enter courier and AWB by hand.

## 9. WhatsApp

- `WHATSAPP_NUMBER` enables the "Order on WhatsApp" / bulk order buttons (standard `wa.me` links; no API needed).
- Optional **WATI** alert to the business when a bulk enquiry arrives: create and get approval for a
  template with parameters `name`, `phone`, `items`, `message`, then set `WATI_API_ENDPOINT`
  (e.g. `https://live-server-12345.wati.io`), `WATI_API_TOKEN`, `WATI_TEMPLATE_NAME` and `WATI_NOTIFY_NUMBER`.

## 10. Operations

- **Health check:** `GET https://example.com/api/health` → `{"status":"ok"}`.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f backend` (JSON logs; secrets and OTPs are redacted).
- **Backups:** schedule a daily dump and copy it off the server:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U shop shop | gzip > backup-$(date +%F).sql.gz
  ```
  With `STORAGE_DRIVER=local`, also back up the `uploads` volume (S3 is recommended instead).
- **Background jobs** (unpaid order expiry, session clean-up) run inside the API. If you run more than
  one API container, set `RUN_JOBS=false` on all but one.
- **Managed database:** to use Amazon RDS instead of the bundled PostgreSQL, remove the `postgres`
  service and set `DATABASE_URL` in `backend/.env.production`.

## Go-live checklist

- [ ] `NODE_ENV=production`, strong `OTP_SECRET`, `SETTINGS_ENCRYPTION_KEY` and `POSTGRES_PASSWORD` (kept somewhere safe)
- [ ] Admin → Settings reviewed section by section; test email received
- [ ] SMS provider live (DLT approved) and a test login works on a real phone
- [ ] Razorpay live keys + webhook; one real low-value payment made and refunded
- [ ] Stripe live keys + webhook (if used); one real payment made and refunded
- [ ] Order emails received (check spam), sending domain authenticated
- [ ] Images upload to S3 and display
- [ ] Shipping fee / free-shipping threshold set; Shiprocket pickup location verified (if used)
- [ ] `ADMIN_PHONES` set to the owner's number; extra admins granted from **Customers**
- [ ] Daily database backup scheduled
- [ ] Store policies (terms, privacy, refund/returns, shipping, contact) published; Razorpay requires them for activation
