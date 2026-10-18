import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  // Express "trust proxy" setting: a hop count ("1") or a preset/subnet list.
  // The default trusts the Next.js proxy and Docker networks so req.ip is the real client IP.
  TRUST_PROXY: z
    .string()
    .default('loopback, linklocal, uniquelocal')
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v === 'false' ? false : v)),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: csv,
  LOG_LEVEL: z.string().default('info'),

  // Store
  STORE_NAME: z.string().default('My Store'),
  STORE_SUPPORT_EMAIL: optionalString,
  STORE_SUPPORT_PHONE: optionalString,
  FSSAI_LICENSE_NO: optionalString, // 14-digit FSSAI licence/registration number, shown in the footer
  CURRENCY: z.string().default('INR'),
  SHIPPING_FEE: z.coerce.number().int().min(0).default(4900),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().int().min(0).default(99900),
  // Deliveries outside India (amounts in paise). Threshold 0 = never free.
  INTERNATIONAL_SHIPPING_FEE: z.coerce.number().int().min(0).default(199900),
  INTERNATIONAL_FREE_SHIPPING_THRESHOLD: z.coerce.number().int().min(0).default(1499900),
  ORDER_PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().min(5).default(30),
  STORE_TIMEZONE: z.string().default('Asia/Kolkata'), // used for daily analytics buckets
  LOW_STOCK_THRESHOLD: z.coerce.number().int().min(0).default(5),

  // Auth
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  COOKIE_SECURE: optionalString,
  COOKIE_DOMAIN: optionalString,
  OTP_SECRET: z.string().min(16, 'OTP_SECRET must be at least 16 characters'),
  OTP_PROVIDER: z.enum(['console', 'msg91', 'twilio', 'twilio_verify']).default('console'),
  OTP_TTL_SECONDS: z.coerce.number().int().default(300),
  OTP_RESEND_SECONDS: z.coerce.number().int().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  OTP_EXPOSE_IN_RESPONSE: bool, // development only: returns the OTP in the API response
  DEFAULT_COUNTRY_CODE: z.string().default('91'),
  ADMIN_PHONES: csv,
  MSG91_AUTH_KEY: optionalString,
  MSG91_TEMPLATE_ID: optionalString,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM: optionalString,
  TWILIO_MESSAGING_SERVICE_SID: optionalString,
  TWILIO_VERIFY_SERVICE_SID: optionalString, // used by OTP_PROVIDER=twilio_verify
  ORDER_SMS_ENABLED: bool, // SMS the customer on order status changes (via Twilio)

  // Payments
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  ENABLE_MOCK_PAYMENTS: bool,

  // Email
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: z.string().default('My Store <no-reply@example.com>'),
  ADMIN_NOTIFY_EMAIL: optionalString,

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  AWS_REGION: optionalString,
  AWS_S3_BUCKET: optionalString,
  S3_PUBLIC_URL: optionalString,

  // Shipping
  SHIPPING_PROVIDER: z.enum(['manual', 'shiprocket']).default('manual'),
  SHIPROCKET_EMAIL: optionalString,
  SHIPROCKET_PASSWORD: optionalString,
  SHIPROCKET_PICKUP_LOCATION: z.string().default('Primary'),
  SHIPROCKET_DEFAULT_WEIGHT_KG: z.coerce.number().default(0.5),
  SHIPROCKET_DEFAULT_LENGTH_CM: z.coerce.number().default(20),
  SHIPROCKET_DEFAULT_BREADTH_CM: z.coerce.number().default(15),
  SHIPROCKET_DEFAULT_HEIGHT_CM: z.coerce.number().default(5),

  // WhatsApp
  WHATSAPP_NUMBER: optionalString, // business number in international format without '+', e.g. 919876543210
  WATI_API_ENDPOINT: optionalString,
  WATI_API_TOKEN: optionalString,
  WATI_TEMPLATE_NAME: optionalString,
  WATI_NOTIFY_NUMBER: optionalString,
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  if (isProd && env.OTP_EXPOSE_IN_RESPONSE) {
    throw new Error('OTP_EXPOSE_IN_RESPONSE must not be enabled in production');
  }
  if (isProd && env.OTP_PROVIDER === 'console') {
    throw new Error('OTP_PROVIDER=console is not allowed in production; use msg91, twilio or twilio_verify');
  }
  if (env.OTP_PROVIDER === 'twilio_verify' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID)) {
    throw new Error('OTP_PROVIDER=twilio_verify requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID');
  }

  return {
    env: env.NODE_ENV,
    isProd,
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    trustProxy: env.TRUST_PROXY,
    databaseUrl: env.DATABASE_URL,
    frontendUrl: env.FRONTEND_URL.replace(/\/$/, ''),
    corsOrigins: [env.FRONTEND_URL.replace(/\/$/, ''), ...env.CORS_ORIGINS],
    logLevel: env.LOG_LEVEL,

    store: {
      name: env.STORE_NAME,
      supportEmail: env.STORE_SUPPORT_EMAIL,
      supportPhone: env.STORE_SUPPORT_PHONE,
      fssaiLicenseNo: env.FSSAI_LICENSE_NO,
      currency: env.CURRENCY,
      shippingFee: env.SHIPPING_FEE,
      freeShippingThreshold: env.FREE_SHIPPING_THRESHOLD,
      internationalShippingFee: env.INTERNATIONAL_SHIPPING_FEE,
      internationalFreeShippingThreshold: env.INTERNATIONAL_FREE_SHIPPING_THRESHOLD,
      paymentTimeoutMinutes: env.ORDER_PAYMENT_TIMEOUT_MINUTES,
      timezone: env.STORE_TIMEZONE,
      lowStockThreshold: env.LOW_STOCK_THRESHOLD,
    },

    auth: {
      sessionTtlDays: env.SESSION_TTL_DAYS,
      cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
      cookieDomain: env.COOKIE_DOMAIN,
      adminPhones: env.ADMIN_PHONES,
      defaultCountryCode: env.DEFAULT_COUNTRY_CODE,
    },

    otp: {
      secret: env.OTP_SECRET,
      provider: env.OTP_PROVIDER,
      ttlSeconds: env.OTP_TTL_SECONDS,
      resendSeconds: env.OTP_RESEND_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      exposeInResponse: env.OTP_EXPOSE_IN_RESPONSE,
      msg91: { authKey: env.MSG91_AUTH_KEY, templateId: env.MSG91_TEMPLATE_ID },
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        from: env.TWILIO_FROM,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID,
      },
    },

    sms: {
      orderUpdates: env.ORDER_SMS_ENABLED,
    },

    razorpay: {
      enabled: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    },
    stripe: {
      enabled: Boolean(env.STRIPE_SECRET_KEY),
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    mockPayments: { enabled: env.ENABLE_MOCK_PAYMENTS && !isProd },

    email: {
      smtp: env.SMTP_HOST
        ? {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
          }
        : null,
      from: env.EMAIL_FROM,
      adminNotify: env.ADMIN_NOTIFY_EMAIL,
    },

    storage: {
      driver: env.STORAGE_DRIVER,
      uploadDir: env.UPLOAD_DIR,
      s3: { region: env.AWS_REGION, bucket: env.AWS_S3_BUCKET, publicUrl: env.S3_PUBLIC_URL },
    },

    shipping: {
      provider: env.SHIPPING_PROVIDER,
      shiprocket: {
        email: env.SHIPROCKET_EMAIL,
        password: env.SHIPROCKET_PASSWORD,
        pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
        defaults: {
          weight: env.SHIPROCKET_DEFAULT_WEIGHT_KG,
          length: env.SHIPROCKET_DEFAULT_LENGTH_CM,
          breadth: env.SHIPROCKET_DEFAULT_BREADTH_CM,
          height: env.SHIPROCKET_DEFAULT_HEIGHT_CM,
        },
      },
    },

    whatsapp: {
      number: env.WHATSAPP_NUMBER,
      wati: {
        enabled: Boolean(env.WATI_API_ENDPOINT && env.WATI_API_TOKEN && env.WATI_TEMPLATE_NAME && env.WATI_NOTIFY_NUMBER),
        endpoint: env.WATI_API_ENDPOINT?.replace(/\/$/, ''),
        token: env.WATI_API_TOKEN,
        templateName: env.WATI_TEMPLATE_NAME,
        notifyNumber: env.WATI_NOTIFY_NUMBER,
      },
    },
  };
}

export const config = load();
