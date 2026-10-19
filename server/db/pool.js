import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/**
 * The PostgreSQL driver. `pg` connects over TCP (port 5432). `neon` is Neon's
 * pg-compatible driver over WebSockets on port 443, for hosts that only allow
 * HTTP(S) out, such as GoDaddy Node.js Hosting. Both expose the same Pool API.
 */
async function loadDriver() {
  if (config.database.driver !== 'neon') return { Pool: pg.Pool, types: pg.types };
  const [{ Pool, types, neonConfig }, { default: WebSocket }] = await Promise.all([
    import('@neondatabase/serverless'),
    import('ws'),
  ]);
  neonConfig.webSocketConstructor = WebSocket;
  if (config.database.wsProxy) {
    // Local testing through Neon's wsproxy in front of a plain PostgreSQL.
    neonConfig.wsProxy = () => config.database.wsProxy;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
  return { Pool, types };
}

const driver = await loadDriver();

// Return BIGINT/NUMERIC aggregates (count, sum) as JS numbers. Values in this
// app (paise totals, row counts) stay far below Number.MAX_SAFE_INTEGER.
driver.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
driver.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new driver.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Locally the wsproxy talks plain TCP to PostgreSQL; Neon itself needs TLS.
  ...(config.database.wsProxy ? { ssl: false } : {}),
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

/** Converts snake_case row keys to camelCase (one level deep). */
export function camelize(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

/** Runs a query and returns camelCased rows. `db` may be the pool or a transaction client. */
export async function query(text, params = [], db = pool) {
  const result = await db.query(text, params);
  return result.rows.map(camelize);
}

export async function queryOne(text, params = [], db = pool) {
  const rows = await query(text, params, db);
  return rows[0] ?? null;
}

/** Runs `fn(client)` inside a transaction, committing on success and rolling back on error. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
