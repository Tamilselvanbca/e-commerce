import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests that
 * carry an Origin header must come from an allowed origin. Combined with
 * SameSite=Lax cookies this blocks cross-site form posts and fetches.
 */
export function originCheck(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.corsOrigins.includes(origin)) {
    throw new AppError(403, 'CSRF_ORIGIN', 'Request origin not allowed');
  }
  next();
}

const PRIVATE_IP = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:)/i;

/**
 * Server-to-server calls from the Next.js server (catalog rendering) arrive
 * directly from the private network without X-Forwarded-For. They carry many
 * visitors' traffic from one IP, so they're exempt from per-IP limits.
 */
function isInternalRequest(req) {
  const addr = (req.socket?.remoteAddress ?? '').replace(/^::ffff:/, '');
  return !req.headers['x-forwarded-for'] && PRIVATE_IP.test(addr);
}

function limiter(options) {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => config.isTest || isInternalRequest(req),
    handler: (_req, _res, next, opts) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests, please try again later', {
        retryAfter: Math.ceil(opts.windowMs / 1000),
      })),
    ...options,
  });
}

export const apiLimiter = limiter({ windowMs: 60_000, limit: 300 });
export const otpLimiter = limiter({ windowMs: 15 * 60_000, limit: 10 });
export const publicFormLimiter = limiter({ windowMs: 60 * 60_000, limit: 20 });
