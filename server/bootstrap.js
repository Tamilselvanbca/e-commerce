// Startup shared by every way of running the API (src/server.js, and the
// single-process GoDaddy Node.js Hosting entry that also serves the website).
import { migrate } from './db/migrate.js';
import { queryOne } from './db/pool.js';
import { seedStore } from './db/seed.js';
import { startJobs } from './jobs.js';
import { logger } from './lib/logger.js';
import { loadSettings, startSettingsSync } from './services/settings.js';

/**
 * Applies migrations, loads Admin → Settings, optionally seeds an empty
 * catalogue, and starts background work. Returns a stop function.
 */
export async function bootstrap({ seedIfEmpty = false } = {}) {
  // Tested on MySQL 8.0 / 8.4 and MariaDB 10.11; the version helps when reading host logs.
  const { version } = await queryOne('SELECT VERSION() AS version');
  logger.info(`Connected to database server ${version}`);
  // Apply pending migrations on boot so deployments stay in sync with the code.
  await migrate({ silent: true });
  // Layer the values saved in Admin → Settings over the environment.
  await loadSettings();

  if (seedIfEmpty) {
    const { count } = await queryOne('SELECT count(*) AS count FROM products');
    if (count === 0) {
      logger.info('Empty catalogue: adding the starter products');
      await seedStore();
    }
  }

  const stopJobs = startJobs();
  // Runs on every instance (unlike jobs) so all of them see settings changes.
  const stopSettingsSync = startSettingsSync();
  return () => {
    stopJobs();
    stopSettingsSync();
  };
}
