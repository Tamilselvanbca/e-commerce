import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/util.js';

export const SESSION_COOKIE = 'sid';

const USER_COLUMNS = 'u.id, u.phone, u.name, u.email, u.role, u.is_blocked, u.created_at';

export function publicUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/',
    domain: config.auth.cookieDomain,
    maxAge: maxAgeMs,
  };
}

export async function createSession(res, userId, req) {
  const token = randomToken();
  const ttlMs = config.auth.sessionTtlDays * 24 * 60 * 60 * 1000;
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, NOW(3) + INTERVAL $3 SECOND, $4, $5)`,
    [sha256(token), userId, ttlMs / 1000, req.get('user-agent')?.slice(0, 300) ?? null, req.ip],
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(ttlMs));
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

/** Attaches `req.user` when a valid session cookie is present. Never rejects. */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const tokenHash = sha256(token);
  const user = await queryOne(
    `SELECT ${USER_COLUMNS}, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW(3)`,
    [tokenHash],
  );
  if (user && !user.isBlocked) {
    req.user = user;
    // Touch the session at most every 10 minutes to keep writes low.
    if (Date.now() - new Date(user.lastSeenAt).getTime() > 10 * 60 * 1000) {
      query('UPDATE sessions SET last_seen_at = NOW(3) WHERE token_hash = $1', [tokenHash]).catch(() => {});
    }
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw unauthorized();
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'admin') throw forbidden();
  next();
}

export function assertNotBlocked(user) {
  if (user.isBlocked) {
    throw new AppError(403, 'ACCOUNT_BLOCKED', 'Your account has been suspended. Please contact support.');
  }
}
