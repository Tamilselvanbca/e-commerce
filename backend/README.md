# Backend (Express + MySQL)

REST API for the store. See the [project README](../README.md) for setup and [docs/API.md](../docs/API.md)
for the endpoint reference.

```bash
cp .env.example .env     # set OTP_SECRET
npm install
npm run migrate
npm run dev              # http://localhost:4000/api/health
npm test                 # needs the shop_test database
```

| Path | Contents |
| --- | --- |
| `src/app.js`, `src/server.js` | Express app (middleware order, routers) and process entry point |
| `src/config.js` | all environment variables, validated at startup |
| `src/routes/` | HTTP layer: request validation (zod) and response shaping |
| `src/services/` | business logic: `orders` (stock reservation, payment state), `cart`, `catalog`, `payments` (Razorpay/Stripe/mock), `otp` + `sms`, `email`, `storage` (local/S3), `shiprocket`, `whatsapp` |
| `src/middleware/` | session loading and role checks, CSRF origin check, rate limits, error handler |
| `src/db/` | `migrations/*.sql`, migration runner, settings import |
| `src/jobs.js` | expiry of unpaid orders, session clean-up |
| `test/` | `node:test` + supertest suite |

Adding a migration: create `src/db/migrations/002_<name>.sql`. It runs automatically on the next start (or `npm run migrate`).
MySQL commits each DDL statement immediately, so keep migrations small, and write SQL that MySQL 8.0.16+ and
MariaDB 10.11 both accept (`src/db/pool.js` keeps PostgreSQL-style `$1` placeholders and maps error codes).
