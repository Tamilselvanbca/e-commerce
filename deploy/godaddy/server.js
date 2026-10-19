// GoDaddy Node.js Hosting entry point. One Node.js process serves the API
// (Express, under /api and /uploads) and the website (Next.js) on
// process.env.PORT, because the platform runs a single app per upload.
// Generated into the deploy bundle by deploy/godaddy/build.mjs.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

// Platform defaults. Each can be overridden in the Node.js Hosting UI.
process.env.NODE_ENV ??= 'production';
// Outbound SMTP is blocked; mail goes through the platform gateway on 127.0.0.1:2525.
process.env.EMAIL_TRANSPORT ??= 'godaddy';
// Traffic arrives through GoDaddy's Cloudflare CDN, which reports the visitor's IP here.
process.env.CLIENT_IP_HEADER ??= 'cf-connecting-ip';
// Files under public/assets/ are kept between deployments.
process.env.UPLOAD_DIR ??= path.join(root, 'public', 'assets', 'uploads');
// The website's server-side data fetching calls the API in this same process.
process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
process.env.SITE_URL ??= process.env.FRONTEND_URL;

// Imported after the defaults above: the API reads its configuration on import.
const [{ createApp }, { bootstrap }, { pool }, { logger }, { default: next }] = await Promise.all([
  import('./server/app.js'),
  import('./server/bootstrap.js'),
  import('./server/db/pool.js'),
  import('./server/lib/logger.js'),
  import('next'),
]);

// Migrations, saved settings, starter catalogue on an empty database, background jobs.
const stop = await bootstrap({ seedIfEmpty: true });

const web = next({ dev: false, dir: root, hostname: '0.0.0.0', port });
const handleWeb = web.getRequestHandler();
await web.prepare();
const api = createApp();

const isApiPath = (url) => /^\/(api|uploads)(\/|\?|$)/.test(url);
const server = http.createServer((req, res) => {
  if (isApiPath(req.url ?? '/')) api(req, res);
  else handleWeb(req, res);
});

server.listen(port, '0.0.0.0', () => {
  logger.info({ port, env: process.env.NODE_ENV }, `Store listening on port ${port}`);
});

const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`);
  stop();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
