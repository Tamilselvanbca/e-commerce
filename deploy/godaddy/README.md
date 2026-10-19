# NORUKU THEENI store on GoDaddy Node.js Hosting

This folder is the deployable app for **GoDaddy Node.js Hosting**. It is generated from the main repository
by `deploy/godaddy/build.mjs`; don't edit it by hand. It contains:

| Path | What it is |
| --- | --- |
| `server.js` | Entry point: one process serving the website (Next.js) and the API (`/api`, `/uploads`) on `PORT` |
| `src/`, `public/`, `next.config.ts` | The website |
| `server/` | The API (Express) |
| `package.json`, `package-lock.json`, `.npmrc` | Install from the public npm registry, then `npm run build`, then `npm start` |

## How it fits GoDaddy's rules

- **One app per upload:** website and API run in one Node.js process on `process.env.PORT`.
- **Database:** PostgreSQL on [Neon](https://neon.tech), reached over port **443** with Neon's WebSocket driver
  (GoDaddy only allows HTTP/HTTPS out). Tables are created automatically on the first start, and an empty
  database gets the starter catalogue.
- **Email:** sent through GoDaddy's built-in mail gateway (no SMTP). The gateway chooses the sender address;
  customers' replies go to the store's support email.
- **Uploaded images:** saved under `public/assets/uploads`, which GoDaddy keeps between deployments.
- **Payments, SMS, shipping, WhatsApp:** Razorpay, Stripe, Twilio, Shiprocket and WATI are all called over HTTPS.

## First deployment

1. **Database.** Sign up at neon.tech (free), create a project in the region closest to your GoDaddy app
   region (Europe → *AWS Europe Central (Frankfurt)*, North America → *AWS US East*), and copy the
   **connection string**.
2. **Create the app** in GoDaddy Node.js Hosting from this code (Git sync with the `godaddy` branch, or zip upload).
3. **Environment variables** (Settings → Environment variables): set everything listed in `.env.example`:
   at least `DATABASE_URL`, `FRONTEND_URL`, `OTP_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_PHONES`,
   `OTP_PROVIDER` and the three `TWILIO_*` values. Then redeploy.
4. **Check the preview**, then **publish** and **connect the domain** `norukutheeni.in` (one click for a GoDaddy domain).
5. **Log in** at `/login` with an `ADMIN_PHONES` number and finish in **Admin → Settings**: store details,
   Razorpay keys, order SMS and WhatsApp. Use **Email → Send a test email** to confirm mail works.

## Updating

Rebuild the bundle from the main repository (`node deploy/godaddy/build.mjs --push`), then update the app in
Node.js Hosting (Git sync pulls the `godaddy` branch; or upload the new zip). Data in the database and uploaded
images are kept.

## Troubleshooting

- **App doesn't start, log says "Invalid environment configuration":** a required variable is missing; the log
  names it.
- **Log shows a database connection error:** check `DATABASE_URL` (copy it again from Neon, including
  `?sslmode=require`).
- **Login code never arrives:** check the Twilio values and that the Verify service is active.
