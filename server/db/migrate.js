// Minimal SQL migration runner. Applies files in ./migrations in name order and
// records them in schema_migrations. MySQL commits DDL immediately, so a file
// that fails part-way must be fixed by hand; keep each migration small.
//   npm run migrate            apply pending migrations
//   npm run migrate -- --reset drop every table and re-apply (development only);
//                              Admin → Settings are kept unless keepSettings is false
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, runScript } from './pool.js';
import { config } from '../config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function tableExists(name) {
  const rows = await query('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = $1', [name]);
  return rows.length > 0;
}

async function dropAllTables() {
  const tables = await query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`);
  if (!tables.length) return;
  await runScript(
    `SET FOREIGN_KEY_CHECKS = 0; ${tables.map((t) => `DROP TABLE \`${t.name}\`;`).join(' ')} SET FOREIGN_KEY_CHECKS = 1;`,
  );
}

export async function migrate({ reset = false, silent = false, keepSettings = true } = {}) {
  const log = silent ? () => {} : (msg) => console.log(msg);

  let savedSettings = [];
  if (reset) {
    if (config.isProd) throw new Error('Refusing to reset the database in production');
    // Settings may hold the only copy of API keys, so a reset keeps them.
    if (keepSettings && (await tableExists('settings'))) {
      savedSettings = await query('SELECT `key`, value, is_secret FROM settings');
    }
    await dropAllTables();
    log('Database reset.');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  const applied = new Set((await query('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    try {
      await runScript(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    log(`Applied ${file}`);
  }

  for (const row of savedSettings) {
    await pool.query('INSERT INTO settings (`key`, value, is_secret) VALUES ($1, $2, $3)', [row.key, row.value, row.isSecret]);
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
