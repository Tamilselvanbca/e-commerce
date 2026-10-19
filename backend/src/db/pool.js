// MySQL access (mysql2). The helpers keep a small, driver-neutral surface:
//   query(sql, params, db) -> camelCased rows      queryOne(...) -> first row or null
//   db.query(sql, params) -> { rows, rowCount }    transaction(fn) -> fn(client) in BEGIN/COMMIT
// SQL is written with numbered placeholders ($1, $2, ...; a number may repeat),
// which are rewritten to mysql2's `?` here. Duplicate-key, foreign-key and check
// errors carry SQLSTATE-style codes (23505, 23503, 23514) and the key name in
// `err.constraint`, so callers can handle them without knowing MySQL error numbers.
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// TINYINT(1) columns are booleans.
function typeCast(field, next) {
  if (field.type === 'TINY' && field.length === 1) {
    const value = field.string();
    return value === null ? null : value === '1';
  }
  return next();
}

const rawPool = mysql.createPool({
  ...config.database,
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true,
  charset: 'utf8mb4',
  // DATETIME columns hold UTC; read and write them as UTC.
  timezone: 'Z',
  // DECIMAL (sum, avg) and BIGINT (count) as JS numbers. Values in this app
  // (paise totals, row counts) stay far below Number.MAX_SAFE_INTEGER.
  decimalNumbers: true,
  supportBigNumbers: true,
  typeCast,
});

// Same session behaviour on every connection: UTC clock, and READ COMMITTED so
// each statement sees the latest committed data (counts after a row lock, etc.).
rawPool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
  conn.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
});

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function toParam(value) {
  if (value === undefined) return null;
  // ISO timestamps from the API become Dates, which mysql2 writes in UTC.
  if (typeof value === 'string' && ISO_DATETIME.test(value)) return new Date(value);
  return value;
}

/** Rewrites $1..$n placeholders (outside quotes) to `?` and orders the values to match. */
export function toMysql(text, params = []) {
  if (!params.length) return [text, []];
  const values = [];
  let sql = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      sql += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      sql += ch;
    } else if (ch === '$' && text[i + 1] >= '0' && text[i + 1] <= '9') {
      let j = i + 1;
      while (text[j] >= '0' && text[j] <= '9') j++;
      values.push(toParam(params[Number(text.slice(i + 1, j)) - 1]));
      sql += '?';
      i = j - 1;
    } else {
      sql += ch;
    }
  }
  return [sql, values];
}

const SQLSTATE = { 1062: '23505', 1451: '23503', 1452: '23503', 3819: '23514', 1213: '40P01', 1205: '55P03' };

function mapError(err) {
  if (err && typeof err.errno === 'number' && SQLSTATE[err.errno]) {
    err.mysqlCode = err.code;
    err.code = SQLSTATE[err.errno];
    // "Duplicate entry 'x' for key 'orders.orders_order_number_key'" -> orders_order_number_key
    const key = /for key '(?:[^']*\.)?([^'.]+)'/.exec(err.sqlMessage ?? '');
    if (key) err.constraint = key[1];
  }
  return err;
}

function shape([result]) {
  if (Array.isArray(result)) return { rows: result, rowCount: result.length };
  return { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
}

function wrap(target) {
  return {
    async query(text, params) {
      const [sql, values] = toMysql(text, params);
      try {
        return shape(await target.query(sql, values));
      } catch (err) {
        throw mapError(err);
      }
    },
  };
}

export const pool = {
  ...wrap(rawPool),
  /** A dedicated connection (for transactions); call release() when done. */
  async connect() {
    const conn = await rawPool.getConnection();
    return { ...wrap(conn), release: () => conn.release() };
  },
  end: () => rawPool.end(),
};

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

/**
 * Runs `fn(client)` inside a transaction, committing on success and rolling back
 * on error. Deadlocks and lock timeouts (possible under concurrent checkouts) are
 * retried, so `fn` must only touch the database.
 */
export async function transaction(fn, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('START TRANSACTION');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if ((err.code === '40P01' || err.code === '55P03') && attempt < retries) {
        logger.warn({ attempt: attempt + 1 }, 'Database deadlock; retrying the transaction');
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Runs a multi-statement SQL script (migrations). */
export async function runScript(sql) {
  const conn = await mysql.createConnection({ ...config.database, multipleStatements: true, timezone: 'Z', charset: 'utf8mb4' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}
