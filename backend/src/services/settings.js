// Store settings edited in Admin → Settings. Saved values live in the `settings`
// table and are layered over the environment (see config.js applyOverrides), so
// they take effect immediately and survive restarts. Secrets are encrypted with
// AES-256-GCM and only ever leave the server as "set / not set" plus a short hint.
import crypto from 'node:crypto';
import { applyOverrides, checkEnv, config } from '../config.js';
import { query, transaction } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { SETTING_FIELDS, SETTINGS_GROUPS, fieldSchema } from './settings-catalog.js';

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------
const PREFIX = 'enc:v1:';
let cachedKey = null;

function encryptionKey() {
  const secret = config.settings.encryptionKey;
  if (cachedKey?.secret !== secret) {
    const key = Buffer.from(crypto.hkdfSync('sha256', secret, 'store-settings', 'settings-encryption-v1', 32));
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function decryptSecret(stored) {
  if (!stored.startsWith(PREFIX)) throw new Error('Secret is not encrypted');
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
/** Decrypted saved values, keyed by environment variable name. */
let overrides = {};
/** Fingerprint of the rows last applied; lets the sync loop skip unchanged reads. */
let appliedSignature = '';

const readRows = () => query('SELECT key, value, is_secret, updated_at FROM settings ORDER BY key');
const signatureOf = (rows) => JSON.stringify(rows.map((r) => [r.key, r.value, r.updatedAt]));

function decodeRows(rows) {
  const out = {};
  for (const row of rows) {
    if (!SETTING_FIELDS.has(row.key)) continue; // no longer editable from the admin panel
    try {
      out[row.key] = row.isSecret ? decryptSecret(row.value) : row.value;
    } catch {
      logger.error(
        { key: row.key },
        'Could not decrypt a saved setting (did SETTINGS_ENCRYPTION_KEY or OTP_SECRET change?). Using the .env value; save it again in Admin → Settings.',
      );
    }
  }
  return out;
}

/**
 * Applies saved values, skipping any that no longer validate against the
 * current environment (so a bad row can never stop the API from starting).
 */
function applySafely(saved) {
  const candidate = { ...saved };
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = checkEnv({ ...process.env, ...candidate });
    if (result.ok) break;
    const bad = [...new Set(result.issues.map((i) => i.path))].filter((key) => key in candidate);
    logger.error({ issues: result.issues }, 'Ignoring saved settings that are not valid');
    if (!bad.length) {
      for (const key of Object.keys(candidate)) delete candidate[key];
      break;
    }
    for (const key of bad) delete candidate[key];
  }
  applyOverrides(candidate);
  overrides = candidate;
}

/** Loads saved settings into the live config. Call once at startup, after migrations. */
export async function loadSettings() {
  const rows = await readRows();
  appliedSignature = signatureOf(rows);
  applySafely(decodeRows(rows));
}

/**
 * Re-reads the settings table periodically so every API instance picks up
 * changes saved through another one. Returns a stop function.
 */
export function startSettingsSync(intervalMs = 30_000) {
  const timer = setInterval(async () => {
    try {
      const rows = await readRows();
      const signature = signatureOf(rows);
      if (signature === appliedSignature) return;
      appliedSignature = signature;
      applySafely(decodeRows(rows));
      logger.info('Settings reloaded from the database');
    } catch (err) {
      logger.error({ err }, 'Settings sync failed');
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// Describing
// ---------------------------------------------------------------------------
const asText = (value) => (value === undefined || value === null ? '' : String(value));

function secretHint(value) {
  if (!value) return null;
  return value.length >= 12 ? `••••${value.slice(-4)}` : '••••';
}

function sourceOf(key) {
  if (key in overrides) return 'admin';
  return process.env[key]?.trim() ? 'env' : 'default';
}

function describeField(field, effective, fallback) {
  // Catalog-only details (validation patterns) stay server side.
  const { pattern, patternMessage, validate, ...meta } = field;
  const source = sourceOf(field.key);
  if (field.type === 'secret') {
    const value = effective[field.key];
    return {
      ...meta,
      source,
      value: null,
      secret: { set: Boolean(value), hint: secretHint(value) },
      fallback: { value: null, set: Boolean(fallback[field.key]) },
    };
  }
  return { ...meta, source, value: asText(effective[field.key]), fallback: { value: asText(fallback[field.key]) } };
}

/** Everything the settings page needs: groups of fields with their current values. */
export function describeSettings() {
  const envOnly = checkEnv(process.env, { level: 'base' });
  const fallback = envOnly.ok ? envOnly.env : {};
  const merged = checkEnv({ ...process.env, ...overrides }, { level: 'base' });
  const effective = merged.ok ? merged.env : fallback;

  return {
    groups: SETTINGS_GROUPS.map((group) => ({
      ...group,
      fields: group.fields.map((field) => describeField(field, effective, fallback)),
    })),
    webhooks: {
      razorpay: `${config.frontendUrl}/api/webhooks/razorpay`,
      stripe: `${config.frontendUrl}/api/webhooks/stripe`,
    },
    server: {
      environment: config.env,
      frontendUrl: config.frontendUrl,
      currency: config.store.currency,
      mockPayments: config.mockPayments.enabled,
      otpCodesInResponse: config.otp.exposeInResponse,
      adminPhones: config.auth.adminPhones.length,
      dedicatedEncryptionKey: config.settings.dedicatedKey,
    },
  };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
const validationError = (issues) => new AppError(400, 'VALIDATION_ERROR', issues[0].message, issues);

/**
 * Saves settings. `values` maps env names to a string (the new value; "" clears
 * an optional setting) or null (forget the saved value and use .env again).
 * Leave a secret out of `values` to keep it unchanged.
 */
export async function saveSettings(values, adminId) {
  const changes = {};
  const issues = [];
  for (const [key, raw] of Object.entries(values)) {
    const field = SETTING_FIELDS.get(key);
    if (!field) {
      issues.push({ path: key, message: 'This setting cannot be changed from the admin panel' });
    } else if (raw === null) {
      changes[key] = null;
    } else {
      const result = fieldSchema(field).safeParse(String(raw).trim());
      if (result.success) changes[key] = result.data;
      else issues.push({ path: key, message: result.error.issues[0]?.message ?? 'Invalid value' });
    }
  }
  if (issues.length) throw validationError(issues);
  if (!Object.keys(changes).length) return describeSettings();

  const next = { ...overrides };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }

  // Reject combinations that would break something (e.g. Twilio Verify without
  // its keys), but don't block unrelated saves on problems that already exist in .env.
  const after = checkEnv({ ...process.env, ...next }, { level: 'strict' });
  if (!after.ok) {
    const before = checkEnv({ ...process.env, ...overrides }, { level: 'strict' });
    const existing = before.ok ? [] : before.issues;
    const fresh = after.issues.filter((i) => !existing.some((e) => e.path === i.path && e.message === i.message));
    if (fresh.length) throw validationError(fresh);
    if (!checkEnv({ ...process.env, ...next }).ok) throw validationError(after.issues);
  }

  await transaction(async (db) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        await db.query('DELETE FROM settings WHERE key = $1', [key]);
        continue;
      }
      const secret = SETTING_FIELDS.get(key).type === 'secret';
      await db.query(
        `INSERT INTO settings (key, value, is_secret, updated_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, secret ? encryptSecret(value) : value, secret, adminId],
      );
    }
  });

  applyOverrides(next);
  overrides = next;
  appliedSignature = signatureOf(await readRows());
  // Log which settings changed, never their values.
  logger.info({ adminId, keys: Object.keys(changes) }, 'Store settings updated');
  return describeSettings();
}
