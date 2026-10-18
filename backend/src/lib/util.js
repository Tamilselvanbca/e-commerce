import crypto from 'node:crypto';
import { config } from '../config.js';
import { badRequest } from './errors.js';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const hmacSha256 = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Constant-time comparison of two hex/ascii strings. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normalises a phone number to E.164. Accepts "9876543210", "09876543210",
 * "+91 98765-43210" or "919876543210". Returns null when it doesn't look valid.
 */
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const hasPlus = input.trim().startsWith('+');
  let digits = input.replace(/\D/g, '');
  const cc = config.auth.defaultCountryCode;

  if (!hasPlus) {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 10) digits = cc + digits;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  // Indian mobile numbers: 10 digits starting with 6-9.
  if (digits.startsWith('91') && digits.length === 12 && !/^91[6-9]\d{9}$/.test(digits)) return null;
  return `+${digits}`;
}

export function requirePhone(input, field = 'phone') {
  const phone = normalizePhone(input);
  if (!phone) throw badRequest(`Please enter a valid mobile number`, [{ path: field, message: 'Invalid phone number' }]);
  return phone;
}

export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Formats paise as a human readable amount, e.g. 129900 -> "₹1,299.00". */
export function formatMoney(amount, currency = config.store.currency) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
}

/** Generates order numbers like ORD-261017-7KQ2M (date + 5 random base32 chars). */
export function generateOrderNumber(date = new Date()) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(5);
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  const yymmdd = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `ORD-${yymmdd}-${suffix}`;
}

/** Builds a WhatsApp click-to-chat link. `number` is digits with country code. */
export function whatsappLink(number, text) {
  if (!number) return null;
  const digits = String(number).replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
