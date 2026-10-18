// Minimal SQL migration runner. Applies files in ./migrations in name order,
// each inside its own transaction, and records them in schema_migrations.
//   npm run migrate            apply pending migrations
//   npm run migrate -- --reset drop everything and re-apply (development only);
//                              Admin → Settings are kept unless keepSettings is false
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { config } from '../config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate({ reset = false, silent = false, keepSettings = true } = {}) {
  const log = silent ? () => {} : (msg) => console.log(msg);

  let savedSettings = [];
  if (reset) {
    if (config.isProd) throw new Error('Refusing to reset the database in production');
    // Settings may hold the only copy of API keys, so a reset keeps them.
    if (keepSettings) {
      const exists = await pool.query(`SELECT to_regclass('public.settings') AS t`);
      if (exists.rows[0].t) savedSettings = (await pool.query('SELECT key, value, is_secret FROM settings')).rows;
    }
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    log('Database reset.');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`Applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  for (const row of savedSettings) {
    await pool.query('INSERT INTO settings (key, value, is_secret) VALUES ($1, $2, $3)', [row.key, row.value, row.is_secret]);
  }
  if (savedSettings.length) log(`Kept ${savedSettings.length} saved setting(s).`);
  log('Migrations up to date.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate({ reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
