// GoDaddy Node.js Hosting entry point. One Node.js process serves the API
// (Express, under /api and /uploads) and the website (Next.js) on
// process.env.PORT, because the platform runs a single app per upload.
// Generated into the deploy bundle by deploy/godaddy/build.mjs.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { duplexPair } from 'node:stream';
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

// GET /__status: which bundle is running and whether page rendering can reach the
// API (no settings or secrets), so a deployment can be checked from outside.
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).buildCommit ?? 'unknown';
const status = { version, startedAt: new Date().toISOString(), ready: false, renderApi: 'not checked', loopback: 'not checked' };
const server = http.createServer((req, res) => {
  res.setHeader('x-app-version', version);
  if (req.url === '/__status') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(status));
  }
  handle(req, res);
});
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

/** One GET request; resolves "ok (HTTP n)" or the error code, never throws. */
function probe(options) {
  return new Promise((resolve) => {
    const req = http.get({ ...options, timeout: 5000 }, (res) => {
      res.resume();
      resolve(`ok (HTTP ${res.statusCode})`);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (err) => resolve(`failed: ${err.code ?? err.message}`));
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

  // Migrations, saved settings, background jobs. No sample catalogue: the live store
  // starts empty (Admin → Products), and removed sample data never comes back.
  stop = await bootstrap();

  const api = createApp();
  // Server-side rendering fetches catalogue data through this agent, which connects
  // to the API in memory (frontend/src/lib/server-api.ts). A request to our own
  // 127.0.0.1:PORT doesn't work on the platform, whose container only allows
  // outbound HTTP(S) and MySQL connections.
  const apiServer = http.createServer(api);
  globalThis.__shopApiAgent = new (class extends http.Agent {
    createConnection() {
      const [client, serverSide] = duplexPair();
      // A loopback client to Express (req.ip) and to the rate limiter's internal-request exemption.
      Object.defineProperty(serverSide, 'remoteAddress', { value: '127.0.0.1' });
      apiServer.emit('connection', serverSide);
      return client;
    }
  })();
  [status.renderApi, status.loopback] = await Promise.all([
    probe({ agent: globalThis.__shopApiAgent, host: 'localhost', path: '/api/health' }),
    probe({ host: '127.0.0.1', port, path: '/api/health' }),
  ]);
  logger.info({ renderApi: status.renderApi, loopback: status.loopback }, 'Connection checks');

  const web = next({ dev: false, dir: root, hostname: '0.0.0.0', port });
  const handleWeb = web.getRequestHandler();
  await web.prepare();

  const isApiPath = (url) => /^\/(api|uploads)(\/|\?|$)/.test(url);
  handle = (req, res) => (isApiPath(req.url ?? '/') ? api(req, res) : handleWeb(req, res));
  status.ready = true;
  logger.info({ port, env: process.env.NODE_ENV, version }, 'Store ready');
} catch (err) {
  // Plain console output so it shows in the runtime logs even if logging never started.
  // Configuration errors name the missing variables (never their values).
  console.error(`Startup failed: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  if (String(err?.message).includes('Invalid environment configuration')) {
    // Shows whether the hosting UI's secrets reached this process at all (names only, never values).
    const names = Object.keys(process.env).sort();
    console.error(`The app received ${names.length} environment variables: ${names.join(', ')}`);
  }
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
