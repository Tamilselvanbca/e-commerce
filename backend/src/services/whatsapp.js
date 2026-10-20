// WhatsApp helpers.
//  - Click-to-chat links (wa.me) work with any WhatsApp Business number, no API needed.
//  - Optional WATI integration sends a template message to the business when a
//    bulk enquiry arrives. The template must be approved in WATI and accept
//    parameters: name, phone, items, message.
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { whatsappLink } from '../lib/util.js';

function itemsText(items) {
  return items
    .map((i) => `• ${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ''} × ${i.quantity}`)
    .join('\n');
}

/** Link the customer opens to continue a bulk enquiry with the business on WhatsApp. */
export function bulkEnquiryCustomerLink(enquiry) {
  const lines = [
    `Hi ${config.store.name}, I'd like to place a bulk order.`,
    enquiry.items.length ? `\n${itemsText(enquiry.items)}` : '',
    enquiry.message ? `\n${enquiry.message}` : '',
    `\nName: ${enquiry.name}${enquiry.company ? ` (${enquiry.company})` : ''}`,
    `Reference: ${enquiry.id.slice(0, 8).toUpperCase()}`,
  ];
  return whatsappLink(config.whatsapp.number, lines.filter(Boolean).join('\n'));
}

/** Link an admin opens to message the customer who sent the enquiry. */
export function bulkEnquiryAdminLink(enquiry) {
  return whatsappLink(
    enquiry.phone.replace(/^\+/, ''),
    `Hi ${enquiry.name}, thanks for your bulk order enquiry with ${config.store.name}.`,
  );
}

/** Link the customer opens to follow up a pre-booking with the business. */
export function prebookingCustomerLink(booking) {
  return whatsappLink(
    config.whatsapp.number,
    `Hi ${config.store.name}, I just pre-booked for ${booking.deliveryDate} (ref ${booking.reference}).\n\n${itemsText(booking.items)}`,
  );
}

/** Link an admin opens to message the customer about their pre-booking. */
export function prebookingAdminLink(booking) {
  return whatsappLink(
    booking.phone.replace(/^\+/, ''),
    `Hi ${booking.name}, thanks for your pre-booking ${booking.reference} with ${config.store.name}.`,
  );
}

export async function notifyBusinessViaWati(enquiry) {
  const { enabled, endpoint, token, templateName, notifyNumber } = config.whatsapp.wati;
  if (!enabled) return;
  try {
    const url = `${endpoint}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(notifyNumber)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token.replace(/^Bearer\s+/i, '')}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: `bulk_enquiry_${enquiry.id.slice(0, 8)}`,
        parameters: [
          { name: 'name', value: enquiry.name },
          { name: 'phone', value: enquiry.phone },
          { name: 'items', value: itemsText(enquiry.items).slice(0, 900) || '-' },
          { name: 'message', value: (enquiry.message ?? '-').slice(0, 900) },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.warn({ status: res.status, body: await res.text().catch(() => '') }, 'WATI notification failed');
  } catch (err) {
    logger.warn({ err }, 'WATI notification failed');
  }
}
