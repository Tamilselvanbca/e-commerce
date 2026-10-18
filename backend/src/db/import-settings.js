// Copies the Admin → Settings values found in the environment (.env) into the
// database, so they can be deleted from .env and managed in the admin panel.
// Secrets are encrypted the same way the admin panel does it.
//   npm run settings:import                  import keys that aren't saved yet
//   npm run settings:import -- --overwrite   also replace values already saved
import { checkEnv } from '../config.js';
import { encryptSecret } from '../services/settings.js';
import { SETTING_FIELDS } from '../services/settings-catalog.js';
import { pool, transaction } from './pool.js';

const overwrite = process.argv.includes('--overwrite');

try {
  const env = checkEnv(process.env, { level: 'base' });
  if (!env.ok) throw new Error(`Fix .env first: ${env.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);

  const saved = new Set((await pool.query('SELECT key FROM settings')).rows.map((r) => r.key));
  const imported = [];
  const kept = [];
  await transaction(async (db) => {
    for (const [key, field] of SETTING_FIELDS) {
      const value = process.env[key]?.trim();
      if (!value) continue;
      if (saved.has(key) && !overwrite) {
        kept.push(key);
        continue;
      }
      const secret = field.type === 'secret';
      await db.query(
        `INSERT INTO settings (key, value, is_secret) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_by = NULL, updated_at = now()`,
        [key, secret ? encryptSecret(value) : value, secret],
      );
      imported.push(key);
    }
  });

  console.log(`Imported ${imported.length} setting(s)${imported.length ? `: ${imported.join(', ')}` : ''}.`);
  if (kept.length) console.log(`Already saved in the admin panel, left unchanged (use --overwrite to replace): ${kept.join(', ')}`);
  if (imported.length) console.log('These keys can now be removed from .env. Restart the API afterwards.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
