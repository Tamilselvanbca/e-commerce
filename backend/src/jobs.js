// In-process periodic jobs. For multiple API instances, run only one instance
// with RUN_JOBS=true (default) and set RUN_JOBS=false on the others.
import { logger } from './lib/logger.js';
import { expireStaleOrders } from './services/orders.js';
import { purgeExpiredAuthData } from './services/otp.js';
import { syncShiprocketTracking } from './services/shipments.js';

export function startJobs() {
  if (process.env.RUN_JOBS === 'false') return () => {};

  const expireOrders = async () => {
    try {
      const n = await expireStaleOrders();
      if (n) logger.info(`Expired ${n} unpaid order(s) and released their stock`);
    } catch (err) {
      logger.error({ err }, 'Order expiry job failed');
    }
  };
  const cleanup = async () => {
    try {
      await purgeExpiredAuthData();
    } catch (err) {
      logger.error({ err }, 'Auth cleanup job failed');
    }
  };
  // Courier status for parcels on the way, in case a Shiprocket webhook is missed.
  const tracking = async () => {
    try {
      const n = await syncShiprocketTracking();
      if (n) logger.info(`Courier tracking moved ${n} order(s) on`);
    } catch (err) {
      logger.error({ err }, 'Courier tracking job failed');
    }
  };

  const timers = [
    setInterval(expireOrders, 60_000),
    setInterval(cleanup, 6 * 60 * 60_000),
    setInterval(tracking, 10 * 60_000),
  ];
  void expireOrders();
  void cleanup();
  return () => timers.forEach(clearInterval);
}
