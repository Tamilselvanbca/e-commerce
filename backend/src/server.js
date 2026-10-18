import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { startJobs } from './jobs.js';
import { logger } from './lib/logger.js';
import { enabledGateways } from './services/payments.js';

async function main() {
  // Apply pending migrations on boot so deployments stay in sync with the code.
  await migrate({ silent: true });

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.env,
        gateways: enabledGateways(),
        otpProvider: config.otp.provider,
        storage: config.storage.driver,
        shipping: config.shipping.provider,
        email: config.email.smtp ? 'smtp' : 'log-only',
      },
      `API listening on http://localhost:${config.port}`,
    );
  });
  const stopJobs = startJobs();

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
