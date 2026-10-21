// The settings an admin can change in Admin → Settings. Each `key` is the name
// of an environment variable in config.js; a saved value overrides .env.
// Anything not listed here (database, URLs, OTP secret, admin phones, dev flags)
// stays in .env only.
//
// Field types: text, email, tel, url, number, money (paise), select, boolean, secret.
// Secrets are encrypted at rest and never sent back to the browser.
import { z } from 'zod';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Colombo',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Europe/London',
  'America/New_York',
  'America/Toronto',
  'Australia/Sydney',
  'UTC',
].map((value) => ({ value, label: value.replace(/_/g, ' ') }));

export const SETTINGS_GROUPS = [
  {
    id: 'store',
    title: 'Store details',
    description: 'Shown in the header, footer, order emails and SMS.',
    fields: [
      { key: 'STORE_NAME', label: 'Store name', type: 'text', required: true, max: 80 },
      { key: 'STORE_SUPPORT_EMAIL', label: 'Support email', type: 'email', help: 'Shown in the footer and order emails.' },
      { key: 'STORE_SUPPORT_PHONE', label: 'Support phone', type: 'tel', placeholder: '+91 98765 43210' },
      {
        key: 'FSSAI_LICENSE_NO',
        label: 'FSSAI licence number',
        type: 'text',
        max: 20,
        pattern: '^\\d{14}$',
        patternMessage: 'FSSAI numbers have 14 digits',
        help: 'Printed in the footer. Leave empty to hide it.',
      },
      {
        key: 'STORE_TIMEZONE',
        label: 'Time zone',
        type: 'select',
        options: COMMON_TIMEZONES,
        validate: 'timezone',
        help: 'Used for the daily figures on the dashboard.',
      },
      { key: 'LOW_STOCK_THRESHOLD', label: 'Low-stock warning at', type: 'number', min: 0, max: 100000, suffix: 'units or fewer' },
      {
        key: 'PREBOOK_ENABLED',
        label: 'Pre-booking',
        type: 'boolean',
        checkboxLabel: 'Let customers pre-book products for a future date',
        help: 'Turn off to hide the Pre-book page and its menu link. Existing bookings stay in Admin → Pre-bookings.',
      },
      {
        key: 'ORDER_PAYMENT_TIMEOUT_MINUTES',
        label: 'Unpaid order timeout',
        type: 'number',
        min: 5,
        max: 1440,
        suffix: 'minutes',
        help: 'Orders not paid within this time are cancelled and their stock is released.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping & delivery',
    description: 'Delivery charges and the courier integration.',
    fields: [
      { key: 'SHIPPING_FEE', label: 'Delivery fee within India', type: 'money', section: 'Delivery charges' },
      { key: 'FREE_SHIPPING_THRESHOLD', label: 'Free delivery in India above', type: 'money', help: '₹0 makes delivery in India always free.' },
      { key: 'INTERNATIONAL_SHIPPING_FEE', label: 'International delivery fee', type: 'money' },
      {
        key: 'INTERNATIONAL_FREE_SHIPPING_THRESHOLD',
        label: 'Free international delivery above',
        type: 'money',
        help: '₹0 means international delivery is never free.',
      },
      {
        key: 'SHIPPING_PROVIDER',
        label: 'Shipping method',
        type: 'select',
        section: 'Courier',
        options: [
          { value: 'manual', label: 'Manual: enter the courier and tracking number yourself' },
          { value: 'shiprocket', label: 'Shiprocket: book couriers, print labels and track deliveries' },
        ],
        webhook: 'courier',
        help: 'With Shiprocket, paste the webhook URL below in Shiprocket → Settings → API → Webhooks (any token) so orders move to Shipped and Delivered as the courier scans them. Without it they update every 20 minutes.',
      },
      {
        key: 'SHIPROCKET_EMAIL',
        label: 'Shiprocket API user email',
        type: 'email',
        help: 'Shiprocket → Settings → API → Configure → Create an API user. Use a different email from your Shiprocket login.',
      },
      { key: 'SHIPROCKET_PASSWORD', label: 'Shiprocket API user password', type: 'secret' },
      {
        key: 'SHIPROCKET_PICKUP_LOCATION',
        label: 'Default pickup address',
        type: 'text',
        required: true,
        max: 100,
        lookup: 'shiprocketPickups',
        help: 'The pickup address name, exactly as in Shiprocket → Settings → Pickup addresses. Save the API user first, then choose it from the list.',
      },
      { key: 'SHIPROCKET_DEFAULT_WEIGHT_KG', label: 'Default parcel weight', type: 'number', min: 0.01, max: 100, step: 0.01, suffix: 'kg' },
      { key: 'SHIPROCKET_DEFAULT_LENGTH_CM', label: 'Default length', type: 'number', min: 1, max: 300, step: 0.1, suffix: 'cm' },
      { key: 'SHIPROCKET_DEFAULT_BREADTH_CM', label: 'Default breadth', type: 'number', min: 1, max: 300, step: 0.1, suffix: 'cm' },
      { key: 'SHIPROCKET_DEFAULT_HEIGHT_CM', label: 'Default height', type: 'number', min: 1, max: 300, step: 0.1, suffix: 'cm' },
      {
        key: 'GOOGLE_MAPS_API_KEY',
        label: 'Google Maps API key',
        type: 'text',
        section: 'Address map',
        placeholder: 'AIza…',
        max: 100,
        pattern: '^[A-Za-z0-9_-]+$',
        patternMessage: 'Paste the key only (letters, digits, - and _)',
        help: 'Shows a map with a pin when customers add an address, and fills in the area, city, state and PIN code. Needs the Maps JavaScript API and Geocoding API; restrict the key to your website. Leave empty to hide the map.',
      },
    ],
  },
  {
    id: 'login',
    title: 'Login OTP & SMS',
    description: 'How customers receive their login code, and order SMS updates.',
    fields: [
      {
        key: 'OTP_PROVIDER',
        label: 'Send login codes with',
        type: 'select',
        options: [
          { value: 'twilio_verify', label: 'Twilio Verify (Twilio creates and checks the code)' },
          { value: 'twilio', label: 'Twilio SMS' },
          { value: 'msg91', label: 'MSG91 (India, DLT template)' },
          { value: 'console', label: 'Server log only (development)' },
        ],
      },
      {
        key: 'DEFAULT_COUNTRY_CODE',
        label: 'Default country code',
        type: 'text',
        required: true,
        prefix: '+',
        pattern: '^\\d{1,4}$',
        patternMessage: 'Digits only, e.g. 91',
        help: 'Added to 10-digit mobile numbers typed without a country code.',
      },
      { key: 'SESSION_TTL_DAYS', label: 'Keep customers signed in for', type: 'number', min: 1, max: 365, suffix: 'days' },
      {
        key: 'ORDER_SMS_ENABLED',
        label: 'Order SMS updates',
        type: 'boolean',
        checkboxLabel: 'Text customers when their order is confirmed, packed, shipped, delivered or cancelled',
        help: 'Sent through Twilio using the sender below.',
      },
      { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', type: 'text', section: 'Twilio', placeholder: 'AC…', max: 64 },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Auth token', type: 'secret' },
      { key: 'TWILIO_VERIFY_SERVICE_SID', label: 'Verify service SID', type: 'text', placeholder: 'VA…', max: 64 },
      {
        key: 'TWILIO_VERIFY_TEMPLATE_SID',
        label: 'Verify message template',
        type: 'text',
        placeholder: 'HJ…',
        max: 64,
        lookup: 'twilioVerifyTemplates',
        help: "The wording of the login SMS. Leave empty to use the Verify service's default.",
      },
      {
        key: 'TWILIO_FROM',
        label: 'Sender',
        type: 'text',
        max: 32,
        help: 'A Twilio number (+1…) or an approved sender ID. Used for order SMS and the Twilio SMS option.',
      },
      {
        key: 'TWILIO_MESSAGING_SERVICE_SID',
        label: 'Messaging service SID',
        type: 'text',
        placeholder: 'MG…',
        max: 64,
        help: 'Optional. Used instead of the sender when set.',
      },
      { key: 'MSG91_AUTH_KEY', label: 'Auth key', type: 'secret', section: 'MSG91' },
      { key: 'MSG91_TEMPLATE_ID', label: 'OTP template ID', type: 'text', max: 64, help: 'DLT-approved template containing ##OTP##.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    description: 'Gateways appear at checkout as soon as their keys are saved.',
    fields: [
      { key: 'RAZORPAY_KEY_ID', label: 'Key ID', type: 'text', section: 'Razorpay: UPI, cards, net banking (India)', placeholder: 'rzp_live_…', max: 64 },
      { key: 'RAZORPAY_KEY_SECRET', label: 'Key secret', type: 'secret' },
      { key: 'RAZORPAY_WEBHOOK_SECRET', label: 'Webhook secret', type: 'secret', webhook: 'razorpay' },
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', type: 'secret', section: 'Stripe: international cards', placeholder: 'sk_live_…' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', type: 'secret', placeholder: 'whsec_…', webhook: 'stripe' },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    description: 'Order confirmations, shipping updates and new-order alerts.',
    fields: [
      {
        key: 'EMAIL_FROM',
        label: 'Send emails from',
        type: 'text',
        required: true,
        max: 200,
        help: 'e.g. Store Name <orders@yourdomain.com>. Must be a sender verified with your email provider.',
      },
      { key: 'ADMIN_NOTIFY_EMAIL', label: 'Send new-order alerts to', type: 'email' },
      {
        key: 'SMTP_HOST',
        label: 'SMTP server',
        type: 'text',
        section: 'SMTP server',
        placeholder: 'smtp.sendgrid.net',
        max: 200,
        help: 'Leave empty to only log emails without sending them.',
      },
      { key: 'SMTP_PORT', label: 'Port', type: 'number', min: 1, max: 65535 },
      {
        key: 'SMTP_SECURE',
        label: 'Encryption',
        type: 'boolean',
        checkboxLabel: 'Use SSL/TLS from the start (port 465)',
        help: 'Leave off for port 587, which upgrades with STARTTLS.',
      },
      { key: 'SMTP_USER', label: 'Username', type: 'text', max: 200, help: 'For SendGrid this is the word apikey.' },
      { key: 'SMTP_PASS', label: 'Password or API key', type: 'secret' },
    ],
  },
  {
    id: 'storage',
    title: 'Image storage',
    description: 'Where uploaded product and category images are kept. Applies to new uploads.',
    fields: [
      {
        key: 'STORAGE_DRIVER',
        label: 'Store images on',
        type: 'select',
        options: [
          { value: 'local', label: "This server's disk" },
          { value: 's3', label: 'Amazon S3' },
        ],
      },
      { key: 'AWS_REGION', label: 'AWS region', type: 'text', placeholder: 'ap-south-1', max: 32, section: 'Amazon S3' },
      { key: 'AWS_S3_BUCKET', label: 'Bucket', type: 'text', max: 63 },
      { key: 'AWS_ACCESS_KEY_ID', label: 'Access key ID', type: 'text', max: 128, help: "Leave empty to use the server's IAM role." },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret access key', type: 'secret' },
      { key: 'S3_PUBLIC_URL', label: 'Public image URL', type: 'url', help: 'e.g. a CloudFront address. Leave empty to use the bucket URL.' },
    ],
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    description: 'WhatsApp buttons on the store and bulk-order alerts.',
    fields: [
      {
        key: 'WHATSAPP_NUMBER',
        label: 'WhatsApp business number',
        type: 'tel',
        pattern: '^\\d{8,15}$',
        patternMessage: 'Country code and number, digits only, e.g. 919876543210',
        placeholder: '919876543210',
        help: 'Country code and number, digits only. Leave empty to hide the WhatsApp buttons.',
      },
      { key: 'WATI_API_ENDPOINT', label: 'WATI API endpoint', type: 'url', section: 'WATI alerts (optional)' },
      { key: 'WATI_API_TOKEN', label: 'WATI API token', type: 'secret' },
      { key: 'WATI_TEMPLATE_NAME', label: 'Template name', type: 'text', max: 100 },
      {
        key: 'WATI_NOTIFY_NUMBER',
        label: 'Alert number',
        type: 'tel',
        pattern: '^\\d{8,15}$',
        patternMessage: 'Country code and number, digits only',
        help: 'Staff WhatsApp number that is alerted about each bulk enquiry.',
      },
    ],
  },
];

export const SETTING_FIELDS = new Map(SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f])));

const isTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates one submitted value (a string) and returns the string to store.
 * An empty string clears an optional setting.
 */
export function fieldSchema(field) {
  const empty = z.literal('');
  const optional = (s) => (field.required ? s : s.or(empty));
  const pattern = (s) => (field.pattern ? s.regex(new RegExp(field.pattern), field.patternMessage ?? 'Invalid format') : s);

  switch (field.type) {
    case 'email':
      return optional(z.email('Enter a valid email address').max(200));
    case 'url':
      return optional(z.url({ protocol: /^https?$/, error: 'Enter a full https:// address' }).max(500));
    case 'tel':
      return optional(pattern(z.string().max(30).regex(/^[+\d\s()-]+$/, 'Use digits, spaces, + or -')));
    case 'number':
    case 'money': {
      let n = z.coerce.number({ error: 'Enter a number' });
      if (field.type === 'money' || !field.step || field.step >= 1) n = n.int('Enter a whole number');
      n = n.min(field.min ?? 0, `Must be at least ${field.min ?? 0}`);
      n = n.max(field.max ?? 10_000_000_00, `Must be at most ${field.max ?? 10_000_000_00}`);
      return z.string().trim().min(1, 'Enter a value').pipe(n).transform(String);
    }
    case 'boolean':
      return z.enum(['true', 'false'], { error: 'Choose on or off' });
    case 'select':
      if (field.validate === 'timezone') return z.string().refine(isTimezone, 'Unknown time zone');
      return z.enum(field.options.map((o) => o.value), { error: 'Choose one of the options' });
    case 'secret':
      return z.string().max(4000).regex(/^\S*$/, 'Must not contain spaces');
    default:
      return optional(pattern(z.string().min(field.required ? 1 : 0, 'This is required').max(field.max ?? 500)));
  }
}
