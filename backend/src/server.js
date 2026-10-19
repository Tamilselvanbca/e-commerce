import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { enabledGateways } from './services/payments.js';

async function main() {
  const stop = await bootstrap();

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
        email: config.email.transport === 'godaddy' ? 'godaddy' : config.email.smtp ? 'smtp' : 'log-only',
      },
      `API listening on http://localhost:${config.port}`,
    );
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    stop();
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
