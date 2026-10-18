import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Return BIGINT/NUMERIC aggregates (count, sum) as JS numbers. Values in this
// app (paise totals, row counts) stay far below Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
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
