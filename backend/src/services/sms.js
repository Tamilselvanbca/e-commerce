// SMS delivery for OTP codes. The code itself is generated and verified by this
// app (services/otp.js); providers only deliver the message.
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

async function sendViaConsole(phone, code) {
  logger.info({ phone }, `[OTP] Login code for ${phone}: ${code}`);
}

/** MSG91 OTP API v5. The DLT-approved template must contain the ##OTP## variable. */
async function sendViaMsg91(phone, code) {
  const { authKey, templateId } = config.otp.msg91;
  if (!authKey || !templateId) throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required');
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', phone.replace(/^\+/, ''));
  url.searchParams.set('otp', code);
  url.searchParams.set('otp_expiry', String(Math.ceil(config.otp.ttlSeconds / 60)));
  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey: authKey, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.type === 'error') {
    throw new Error(`MSG91 error: ${body.message ?? res.status}`);
  }
}

/** Twilio Programmable Messaging. */
async function sendViaTwilio(phone, code) {
  const { accountSid, authToken, from, messagingServiceSid } = config.otp.twilio;
  if (!accountSid || !authToken || !(from || messagingServiceSid)) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) are required');
  }
  const form = new URLSearchParams({
    To: phone,
    Body: `${code} is your ${config.store.name} login code. It expires in ${Math.ceil(config.otp.ttlSeconds / 60)} minutes. Do not share it with anyone.`,
  });
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  else form.set('From', from);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Twilio error ${res.status}: ${body.message ?? 'unknown'}`);
  }
}

const providers = { console: sendViaConsole, msg91: sendViaMsg91, twilio: sendViaTwilio };

export async function sendOtpSms(phone, code) {
  try {
    await providers[config.otp.provider](phone, code);
  } catch (err) {
    logger.error({ err, provider: config.otp.provider }, 'Failed to send OTP SMS');
    throw new AppError(502, 'SMS_FAILED', 'We could not send the code right now. Please try again shortly.');
  }
}
