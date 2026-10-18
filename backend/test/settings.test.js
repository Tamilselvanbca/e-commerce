import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { config } from '../src/config.js';
import { loadSettings } from '../src/services/settings.js';
import { login, newAgent, pool, query, queryOne, resetDb } from './helpers.js';

let admin;

before(async () => {
  await resetDb();
  admin = newAgent();
  await login(admin, '9999999999', 'Owner');
});
after(() => pool.end());

const field = (body, key) => body.groups.flatMap((g) => g.fields).find((f) => f.key === key);
const save = (values) => admin.put('/api/admin/settings').send({ values });

describe('admin settings', () => {
  test('only admins can read or change settings', async () => {
    const customer = newAgent();
    await login(customer, '9876511111', 'Customer');
    await customer.get('/api/admin/settings').expect(403);
    await customer.put('/api/admin/settings').send({ values: { STORE_NAME: 'Nope' } }).expect(403);
    await newAgent().get('/api/admin/settings').expect(401);
  });

  test('lists values with their source and never returns secrets', async () => {
    const res = await admin.get('/api/admin/settings').expect(200);
    assert.equal(field(res.body, 'STORE_NAME').value, 'Test Store');
    assert.equal(field(res.body, 'STORE_NAME').source, 'env');
    assert.equal(field(res.body, 'SHIPPING_FEE').value, '4900');
    assert.equal(field(res.body, 'LOW_STOCK_THRESHOLD').source, 'default');

    const secret = field(res.body, 'RAZORPAY_KEY_SECRET');
    assert.equal(secret.value, null);
    assert.equal(secret.secret.set, true);
    assert.ok(!JSON.stringify(res.body).includes('rzp_test_secret'));
    assert.ok(!JSON.stringify(res.body).includes(config.otp.secret));
    assert.equal(res.body.webhooks.razorpay, 'http://localhost:3000/api/webhooks/razorpay');
  });

  test('saved values apply immediately and can be reset to .env', async () => {
    const res = await save({ STORE_NAME: '  Sweet Test  ', SHIPPING_FEE: '9900', WHATSAPP_NUMBER: '' }).expect(200);
    assert.equal(field(res.body, 'STORE_NAME').value, 'Sweet Test');
    assert.equal(field(res.body, 'STORE_NAME').source, 'admin');
    assert.equal(field(res.body, 'STORE_NAME').fallback.value, 'Test Store');

    const cfg = await newAgent().get('/api/config').expect(200);
    assert.equal(cfg.body.storeName, 'Sweet Test');
    assert.equal(cfg.body.shippingFee, 9900);
    assert.equal(cfg.body.whatsappNumber, null);

    const row = await queryOne(`SELECT value, is_secret FROM settings WHERE key = 'STORE_NAME'`);
    assert.deepEqual(row, { value: 'Sweet Test', isSecret: false });

    await save({ STORE_NAME: null, SHIPPING_FEE: null, WHATSAPP_NUMBER: null }).expect(200);
    const reset = await newAgent().get('/api/config').expect(200);
    assert.equal(reset.body.storeName, 'Test Store');
    assert.equal(reset.body.shippingFee, 4900);
    assert.equal(reset.body.whatsappNumber, '919876543210');
    assert.equal((await query('SELECT key FROM settings')).length, 0);
  });

  test('secrets are encrypted at rest and only shown as a hint', async () => {
    const res = await save({ STRIPE_SECRET_KEY: 'sk_test_brandnew12345' }).expect(200);
    const secret = field(res.body, 'STRIPE_SECRET_KEY');
    assert.deepEqual(secret.secret, { set: true, hint: '••••2345' });
    assert.equal(secret.source, 'admin');
    assert.ok(!JSON.stringify(res.body).includes('sk_test_brandnew12345'));
    assert.equal(config.stripe.secretKey, 'sk_test_brandnew12345');

    const row = await queryOne(`SELECT value, is_secret FROM settings WHERE key = 'STRIPE_SECRET_KEY'`);
    assert.equal(row.isSecret, true);
    assert.match(row.value, /^enc:v1:/);
    assert.ok(!row.value.includes('brandnew'));

    // An empty value switches the gateway off even though .env has a key.
    await save({ STRIPE_SECRET_KEY: '' }).expect(200);
    const cfg = await newAgent().get('/api/config').expect(200);
    assert.equal(cfg.body.gateways.stripe.enabled, false);

    await save({ STRIPE_SECRET_KEY: null }).expect(200);
    assert.equal(config.stripe.secretKey, 'sk_test_dummy');
  });

  test('rejects invalid values and broken combinations', async () => {
    let res = await save({ SHIPPING_FEE: 'abc', STORE_SUPPORT_EMAIL: 'not-an-email' }).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.error.details.map((d) => d.path).sort(), ['SHIPPING_FEE', 'STORE_SUPPORT_EMAIL']);

    res = await save({ DATABASE_URL: 'postgres://elsewhere' }).expect(400);
    assert.equal(res.body.error.details[0].path, 'DATABASE_URL');

    res = await save({ OTP_PROVIDER: 'twilio_verify' }).expect(400);
    assert.equal(res.body.error.details[0].path, 'OTP_PROVIDER');
    assert.match(res.body.error.message, /Twilio Verify/);

    res = await save({ STORE_TIMEZONE: 'Mars/Olympus' }).expect(400);
    assert.equal(res.body.error.details[0].path, 'STORE_TIMEZONE');

    // Nothing was saved by the failed requests.
    assert.equal((await query('SELECT key FROM settings')).length, 0);
    assert.equal(config.store.shippingFee, 4900);
  });

  test('a valid combination saves together', async () => {
    await save({
      OTP_PROVIDER: 'twilio_verify',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'token-123456789',
      TWILIO_VERIFY_SERVICE_SID: 'VA123',
    }).expect(200);
    assert.equal(config.otp.provider, 'twilio_verify');
    assert.equal(config.otp.twilio.authToken, 'token-123456789');
    await save({ OTP_PROVIDER: null, TWILIO_ACCOUNT_SID: null, TWILIO_AUTH_TOKEN: null, TWILIO_VERIFY_SERVICE_SID: null }).expect(200);
    assert.equal(config.otp.provider, 'console');
  });

  test('startup skips saved values that are invalid or cannot be decrypted', async () => {
    await query(
      `INSERT INTO settings (key, value, is_secret) VALUES
         ('STORE_NAME', 'Loaded From DB', false),
         ('SHIPPING_FEE', '-5', false),
         ('RAZORPAY_KEY_SECRET', 'enc:v1:garbage', true)`,
    );
    await loadSettings();
    assert.equal(config.store.name, 'Loaded From DB');
    assert.equal(config.store.shippingFee, 4900);
    assert.equal(config.razorpay.keySecret, 'rzp_test_secret');
    await query('DELETE FROM settings');
    await loadSettings();
    assert.equal(config.store.name, 'Test Store');
  });

  test('test email reports when SMTP is not configured', async () => {
    const res = await admin.post('/api/admin/settings/test-email').send({ to: 'owner@example.com' }).expect(400);
    assert.equal(res.body.error.code, 'EMAIL_NOT_CONFIGURED');
  });
});
