import { isIP } from 'node:net';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when `origin` is the site the request was sent to (same scheme-less host). */
function isSameHost(origin, req) {
  try {
    const { host } = new URL(origin);
    return host === req.get('host') || host === req.get('x-forwarded-host');
  } catch {
    return false;
  }
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests that
 * carry an Origin header must come from an allowed origin or the site itself
 * (browsers set Origin; a cross-site page can't make it match this host).
 * Combined with SameSite=Lax cookies this blocks cross-site form posts and fetches.
 */
export function originCheck(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.corsOrigins.includes(origin) && !isSameHost(origin, req)) {
    throw new AppError(403, 'CSRF_ORIGIN', 'Request origin not allowed');
  }
  next();
}

/**
 * Behind a CDN that reports the visitor's address in a header (CLIENT_IP_HEADER,
 * e.g. cf-connecting-ip), use it as req.ip so per-IP limits apply per visitor
 * instead of per CDN edge. Only enable it when the app is reachable solely
 * through that CDN, otherwise the header could be forged.
 */
export function clientIpFromHeader(req, _res, next) {
  const header = config.clientIpHeader;
  if (header) {
    const value = req.get(header)?.split(',')[0]?.trim();
    if (value && isIP(value)) Object.defineProperty(req, 'ip', { value, configurable: true });
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
