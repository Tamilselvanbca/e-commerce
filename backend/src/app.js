import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter, originCheck } from './middleware/security.js';
import addressRoutes from './routes/addresses.js';
import adminRoutes from './routes/admin/index.js';
import authRoutes from './routes/auth.js';
import bulkRoutes from './routes/bulk.js';
import cartRoutes from './routes/cart.js';
import catalogRoutes from './routes/catalog.js';
import checkoutRoutes from './routes/checkout.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import reviewRoutes from './routes/reviews.js';
import webhookRoutes from './routes/webhooks.js';
import { uploadRoot } from './services/storage.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  if (!config.isTest) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  }

  // Webhooks need the raw body, so they're mounted before the JSON parser.
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Locally stored product images (STORAGE_DRIVER=local).
  if (config.storage.driver === 'local') {
    app.use('/uploads', express.static(uploadRoot, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
  }

  const api = express.Router();
  api.use(apiLimiter);
  api.use(originCheck);
  api.use(loadUser);
  api.use(catalogRoutes);
  api.use(reviewRoutes);
  api.use('/auth', authRoutes);
  api.use('/cart', cartRoutes);
  api.use('/addresses', addressRoutes);
  api.use('/checkout', checkoutRoutes);
  api.use('/payments', paymentRoutes);
  api.use('/orders', orderRoutes);
  api.use('/bulk-enquiries', bulkRoutes);
  api.use('/admin', adminRoutes);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
