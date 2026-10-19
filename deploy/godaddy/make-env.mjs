#!/usr/bin/env node
// Writes dist/godaddy.env: the environment variables for GoDaddy Node.js Hosting,
// filled from this machine's current settings (backend/.env + Admin → Settings in
// the local database), with new random OTP_SECRET / SETTINGS_ENCRYPTION_KEY.
//   node --env-file=backend/.env deploy/godaddy/make-env.mjs [https://your-domain]
// The file contains secrets: paste or upload it in the hosting UI, then delete it.
import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const target = path.join(repo, 'dist', 'godaddy.env');
const siteUrl = (process.argv[2] ?? 'https://norukutheeni.in').replace(/\/$/, '');

const { config } = await import('../../backend/src/config.js');
const { pool } = await import('../../backend/src/db/pool.js');
const { currentRawValues, loadSettings } = await import('../../backend/src/services/settings.js');

// Not used on GoDaddy: mail goes through the platform gateway; images stay on the app's disk.
const SKIP = new Set(['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'STORAGE_DRIVER', 'AWS_REGION']);

try {
  await loadSettings();
  const values = Object.entries(currentRawValues()).filter(([key]) => !SKIP.has(key));
  const quote = (v) => (/[\s#"'=]/.test(v) ? `"${v.replace(/["\\]/g, '\\$&')}"` : v);
  // Keep the keys from an earlier run: they may already be set in the hosting UI, and
  // secrets saved in Admin -> Settings are encrypted with SETTINGS_ENCRYPTION_KEY.
  const previous = await readFile(target, 'utf8').catch(() => '');
  const kept = (name) => new RegExp(`^${name}=([0-9a-f]{64})$`, 'm').exec(previous)?.[1];
  const random = () => crypto.randomBytes(32).toString('hex');

  const lines = [
    '# Environment variables for GoDaddy Node.js Hosting (Settings -> Environment variables).',
    `# Generated ${new Date().toISOString()} from this computer's store settings.`,
    '# Contains secrets: add them in the hosting UI, keep a safe copy, then delete this file.',
    '',
    '# No database variables: GoDaddy managed MySQL sets DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD.',
    `FRONTEND_URL=${siteUrl}`,
    '# Random keys for the live store. Keep a copy: secrets saved in Admin -> Settings depend on SETTINGS_ENCRYPTION_KEY.',
    `OTP_SECRET=${kept('OTP_SECRET') ?? random()}`,
    `SETTINGS_ENCRYPTION_KEY=${kept('SETTINGS_ENCRYPTION_KEY') ?? random()}`,
    `ADMIN_PHONES=${config.auth.adminPhones.join(',')}`,
    '',
    '# Store settings (editable later in Admin -> Settings).',
    ...values.map(([key, value]) => `${key}=${quote(value)}`),
    '',
  ];
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, lines.join('\n'), { mode: 0o600 });
  const reused = kept('OTP_SECRET') && kept('SETTINGS_ENCRYPTION_KEY') ? 'kept the existing keys' : 'new random keys';
  console.log(`Wrote ${target} (${values.length} store settings, ${reused}). Add the values in GoDaddy, then keep the file somewhere safe.`);
} finally {
  await pool.end();
}
