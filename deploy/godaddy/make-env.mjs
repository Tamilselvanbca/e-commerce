#!/usr/bin/env node
// Writes dist/godaddy.env: the environment variables for GoDaddy Node.js Hosting,
// filled from this machine's current settings (backend/.env + Admin → Settings in
// the local database), with new random OTP_SECRET / SETTINGS_ENCRYPTION_KEY.
//   node --env-file=backend/.env deploy/godaddy/make-env.mjs [https://your-domain]
// The file contains secrets: paste or upload it in the hosting UI, then delete it.
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
  const random = () => crypto.randomBytes(32).toString('hex');

  const lines = [
    '# Environment variables for GoDaddy Node.js Hosting (Settings -> Environment variables).',
    `# Generated ${new Date().toISOString()} from this computer's store settings.`,
    '# Contains secrets: add them in the hosting UI, keep a safe copy, then delete this file.',
    '',
    '# Paste the connection string from your Neon project (neon.tech -> Connect).',
    'DATABASE_URL=',
    `FRONTEND_URL=${siteUrl}`,
    '# New random keys for the live store. Keep a copy: secrets saved in Admin -> Settings depend on SETTINGS_ENCRYPTION_KEY.',
    `OTP_SECRET=${random()}`,
    `SETTINGS_ENCRYPTION_KEY=${random()}`,
    `ADMIN_PHONES=${config.auth.adminPhones.join(',')}`,
    '',
    '# Store settings (editable later in Admin -> Settings).',
    ...values.map(([key, value]) => `${key}=${quote(value)}`),
    '',
  ];
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, lines.join('\n'), { mode: 0o600 });
  console.log(`Wrote ${target} (${values.length} store settings). Fill in DATABASE_URL, then add the values in GoDaddy.`);
} finally {
  await pool.end();
}
