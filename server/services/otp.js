import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool, query, queryOne } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { hmacSha256, safeEqual } from '../lib/util.js';
import { checkTwilioVerification, sendOtpSms } from './sms.js';

const hashCode = (phone, code) => hmacSha256(config.otp.secret, `${phone}:${code}`);
// With Twilio Verify the code lives at Twilio; otp_codes rows still enforce cooldown,
// expiry and attempt limits, and store a random hash that never matches.
const usesTwilioVerify = () => config.otp.provider === 'twilio_verify';

/** Creates a new OTP for `phone` and sends it by SMS. Enforces a resend cooldown. */
export async function requestOtp(phone, ip) {
  const latest = await queryOne(
    `SELECT TIMESTAMPDIFF(MICROSECOND, created_at, NOW(6)) / 1000000 AS age
       FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (latest && latest.age < config.otp.resendSeconds) {
    const retryAfter = Math.ceil(config.otp.resendSeconds - latest.age);
    throw new AppError(429, 'OTP_COOLDOWN', `Please wait ${retryAfter}s before requesting a new code`, { retryAfter });
  }

  // Cap OTP sends per phone per hour to limit SMS cost abuse.
  const { count } = await queryOne(
    `SELECT count(*) AS count FROM otp_codes WHERE phone = $1 AND created_at > NOW(3) - INTERVAL 1 HOUR`,
    [phone],
  );
  if (count >= 6) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many codes requested for this number. Try again in an hour.', { retryAfter: 3600 });
  }

  const code = usesTwilioVerify() ? crypto.randomBytes(16).toString('hex') : crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  // Invalidate any earlier unused codes so only the newest one works.
  await query('UPDATE otp_codes SET consumed_at = NOW(3) WHERE phone = $1 AND consumed_at IS NULL', [phone]);
  const { insertId: id } = await pool.query(
    `INSERT INTO otp_codes (phone, code_hash, expires_at, ip)
     VALUES ($1, $2, NOW(3) + INTERVAL $3 SECOND, $4)`,
    [phone, hashCode(phone, code), config.otp.ttlSeconds, ip],
  );
  try {
    await sendOtpSms(phone, code);
  } catch (err) {
    // Don't let a failed delivery trigger the resend cooldown.
    await query('DELETE FROM otp_codes WHERE id = $1', [id]);
    throw err;
  }

  return {
    phone,
    expiresIn: config.otp.ttlSeconds,
    resendIn: config.otp.resendSeconds,
    ...(config.otp.exposeInResponse && !usesTwilioVerify() ? { devCode: code } : {}),
  };
}

/** Housekeeping for the background job: drops expired sessions and old OTP rows. */
export async function purgeExpiredAuthData() {
  await query(`DELETE FROM sessions WHERE expires_at < NOW(3)`);
  await query(`DELETE FROM otp_codes WHERE created_at < NOW(3) - INTERVAL 1 DAY`);
}

/** Verifies the OTP; throws OTP_INVALID / OTP_EXPIRED. Consumes the code on success. */
export async function verifyOtp(phone, code) {
  const otp = await queryOne(
    `SELECT id, code_hash, attempts, expires_at < NOW(3) AS expired
       FROM otp_codes
      WHERE phone = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (!otp || otp.expired || otp.attempts >= config.otp.maxAttempts) {
    throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Please request a new one.');
  }
  const valid = usesTwilioVerify()
    ? await checkTwilioVerification(phone, code)
    : safeEqual(otp.codeHash, hashCode(phone, code));
  if (!valid) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    const { attempts } = await queryOne('SELECT attempts FROM otp_codes WHERE id = $1', [otp.id]);
    const attemptsLeft = Math.max(0, config.otp.maxAttempts - attempts);
    if (attemptsLeft === 0) {
      throw new AppError(400, 'OTP_EXPIRED', 'Too many incorrect attempts. Please request a new code.');
    }
    throw new AppError(400, 'OTP_INVALID', 'Incorrect code. Please try again.', { attemptsLeft });
  }
  // Guard against two concurrent verifications of the same code.
  const { rowCount } = await pool.query('UPDATE otp_codes SET consumed_at = NOW(3) WHERE id = $1 AND consumed_at IS NULL', [otp.id]);
  if (rowCount === 0) throw new AppError(400, 'OTP_EXPIRED', 'This code has already been used.');
}
