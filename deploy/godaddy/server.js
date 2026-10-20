// GoDaddy Node.js Hosting entry point. One Node.js process serves the API
// (Express, under /api and /uploads) and the website (Next.js) on
// process.env.PORT, because the platform runs a single app per upload.
// Generated into the deploy bundle by deploy/godaddy/build.mjs.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

// Always production, also under `npm run dev` (GoDaddy's preview): the bundle has no dev setup.
process.env.NODE_ENV = 'production';
// Platform defaults. Each can be overridden in the Node.js Hosting UI.
// Outbound SMTP is blocked; mail goes through the platform gateway on 127.0.0.1:2525.
process.env.EMAIL_TRANSPORT ??= 'godaddy';
// Traffic arrives through GoDaddy's Cloudflare CDN, which reports the visitor's IP here.
process.env.CLIENT_IP_HEADER ??= 'cf-connecting-ip';
// Files under public/assets/ are kept between deployments.
process.env.UPLOAD_DIR ??= path.join(root, 'public', 'assets', 'uploads');
// The website's server-side data fetching calls the API in this same process.
process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
process.env.SITE_URL ??= process.env.FRONTEND_URL;

// Open the port straight away: the first start (database tables, starter
// catalogue) can take a while over a remote database, and the platform
// expects the app to answer. Until it's ready, every request gets a 503.
const STARTING_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>Starting…</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#3f3f46">
<p>The store is starting up. This page refreshes by itself.</p></body>`;
let handle = (req, res) => {
  res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '10', 'cache-control': 'no-store' });
  res.end(STARTING_PAGE);
};
const server = http.createServer((req, res) => handle(req, res));
server.listen(port, '0.0.0.0', () => console.log(`Listening on port ${port}; starting the store…`));

/**
 * Builds the website (`next build --webpack`) while the starting page is served.
 * GoDaddy's preview runs `npm run dev` (node server.js --build) without a separate build
 * step, and the folder isn't cleaned between deployments, so dev always rebuilds;
 * `npm start` only builds when no build exists.
 */
function buildWebsite() {
  console.log('Building the website; this takes a few minutes…');
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, 'build', '--webpack'], { cwd: root, stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Website build failed (exit code ${code})`))));
  });
}

let stop = () => {};
try {
  if (process.argv.includes('--build') || !existsSync(path.join(root, '.next', 'BUILD_ID'))) {
    await buildWebsite();
  }

  // Imported after the defaults above: the API reads its configuration on import.
  const [{ createApp }, { bootstrap }, { logger }, { default: next }] = await Promise.all([
    import('./server/app.js'),
    import('./server/bootstrap.js'),
    import('./server/lib/logger.js'),
    import('next'),
  ]);

  // Migrations, saved settings, starter catalogue on an empty database, background jobs.
  stop = await bootstrap({ seedIfEmpty: true });

  const web = next({ dev: false, dir: root, hostname: '0.0.0.0', port });
  const handleWeb = web.getRequestHandler();
  await web.prepare();
  const api = createApp();

  const isApiPath = (url) => /^\/(api|uploads)(\/|\?|$)/.test(url);
  handle = (req, res) => (isApiPath(req.url ?? '/') ? api(req, res) : handleWeb(req, res));
  logger.info({ port, env: process.env.NODE_ENV }, 'Store ready');
} catch (err) {
  // Plain console output so it shows in the runtime logs even if logging never started.
  // Configuration errors name the missing variables (never their values).
  console.error(`Startup failed: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
}

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down`);
  stop();
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    const { pool } = await import('./server/db/pool.js');
    await pool.end().catch(() => {});
    process.exit(0);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
