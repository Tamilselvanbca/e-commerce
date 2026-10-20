// Transactional email. Two transports (EMAIL_TRANSPORT):
// - smtp: Nodemailer with any SMTP server, e.g. SendGrid (host smtp.sendgrid.net,
//   user "apikey", pass = API key) or Amazon SES. Without SMTP_HOST, messages are
//   logged instead of sent.
// - godaddy: the GoDaddy Node.js Hosting mail gateway (outbound SMTP is blocked
//   there). The gateway picks the sender address; replies go to the support email.
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { sendEmail as sendViaGoDaddy } from '../lib/godaddy-email.js';
import { logger } from '../lib/logger.js';
import { formatMoney } from '../lib/util.js';

// Rebuilt whenever the SMTP settings change (Admin → Settings → Email).
let transport = null;
let transportFor = null;

async function getTransport() {
  const key = JSON.stringify(config.email.smtp);
  if (key !== transportFor) {
    // Loaded on demand so hosts without SMTP never import it.
    const { default: nodemailer } = await import('nodemailer');
    transport?.close?.();
    transport = config.email.smtp
      ? nodemailer.createTransport(config.email.smtp)
      : nodemailer.createTransport({ jsonTransport: true });
    transportFor = key;
  }
  return transport;
}

/** Sends one message with the configured transport; throws on failure. Returns the message id. */
async function deliver({ to, subject, html, text }) {
  if (config.email.transport === 'godaddy') {
    const { messageId } = await sendViaGoDaddy({
      to,
      subject,
      html,
      text,
      ...(config.store.supportEmail ? { replyTo: config.store.supportEmail } : {}),
    });
    return messageId;
  }
  const info = await (await getTransport()).sendMail({ from: config.email.from, to, subject, html, text });
  return info.messageId;
}

const canSend = () => config.email.transport === 'godaddy' || Boolean(config.email.smtp);

export async function sendEmail({ to, subject, html, text }) {
  if (!to) return;
  try {
    const messageId = await deliver({ to, subject, html, text });
    if (!canSend()) logger.info({ to, subject }, '[email] SMTP not configured; message logged only');
    else logger.info({ to, subject, messageId }, '[email] sent');
  } catch (err) {
    // Email failures must never break the request that triggered them.
    logger.error({ err, to, subject }, '[email] failed to send');
  }
}

/** Fire-and-forget wrapper used from request handlers. */
export function queueEmail(message) {
  setImmediate(() => void sendEmail(message));
}

/**
 * Sends a test message with the current settings. Unlike sendEmail it reports
 * failures, so the admin can see why mail isn't going out.
 */
export async function sendTestEmail(to) {
  if (!canSend()) {
    throw new AppError(400, 'EMAIL_NOT_CONFIGURED', 'No SMTP server is set, so emails are only written to the server log.');
  }
  try {
    await deliver({
      to,
      subject: `Test email from ${config.store.name}`,
      html: layout('Your email settings work', '<p style="font-size:14px">Order confirmations and alerts will be sent from this address.</p>'),
      text: 'Your email settings work. Order confirmations and alerts will be sent from this address.',
    });
  } catch (err) {
    logger.warn({ err, to }, '[email] test email failed');
    // The GoDaddy gateway's messages can list the account's domains; keep them in the log.
    const reason = config.email.transport === 'godaddy' ? 'check the server log for details' : err.message;
    throw new AppError(502, 'EMAIL_FAILED', `The email server rejected the message: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(title, bodyHtml) {
  const store = esc(config.store.name);
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="background:#fffaf3;border-bottom:4px solid #c2410c;padding:12px 24px;color:#c2410c;font-size:20px;font-weight:bold">
          <img src="${config.frontendUrl}/logo.png" width="112" height="80" alt="${store}" style="display:block;border:0;height:80px;width:112px">
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#fafafa;color:#71717a;font-size:12px">
          ${config.store.supportEmail ? `Questions? Write to ${esc(config.store.supportEmail)}.` : ''}
          ${config.store.supportPhone ? ` Call ${esc(config.store.supportPhone)}.` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function itemsTable(order) {
  const rows = order.items
    .map((i) => {
      const variant = [i.size, i.color].filter(Boolean).join(' / ');
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e7">${esc(i.productName)}${variant ? `<br><span style="color:#71717a;font-size:12px">${esc(variant)}</span>` : ''}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;text-align:center">${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;text-align:right">${formatMoney(i.lineTotal, order.currency)}</td>
      </tr>`;
    })
    .join('');
  const line = (label, value, bold = false) =>
    `<tr><td colspan="2" style="padding:4px 0;text-align:right;${bold ? 'font-weight:bold' : ''}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? 'font-weight:bold' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">
    <tr><th align="left" style="padding-bottom:8px">Item</th><th style="padding-bottom:8px">Qty</th><th align="right" style="padding-bottom:8px">Total</th></tr>
    ${rows}
    ${line('Subtotal', formatMoney(order.subtotal, order.currency))}
    ${order.kind === 'gift_card' ? '' : line('Shipping', order.shippingFee ? formatMoney(order.shippingFee, order.currency) : 'Free')}
    ${order.discount ? line(`Discount${order.discountCode ? ` (${esc(order.discountCode)})` : order.discountTitle ? ` (${esc(order.discountTitle)})` : ''}`, `-${formatMoney(order.discount, order.currency)}`) : ''}
    ${line('Total', formatMoney(order.total, order.currency), true)}
    ${order.giftCardAmount ? line('Paid by gift card', `-${formatMoney(order.giftCardAmount, order.currency)}`) : ''}
    ${order.giftCardAmount ? line('Paid online', formatMoney(order.amountDue, order.currency), true) : ''}
  </table>`;
}

export function giftCardEmail(card) {
  if (!card.recipientEmail) return null;
  const amount = formatMoney(card.balance, card.currency);
  const from = card.senderName ? `${esc(card.senderName)} sent you` : 'You have received';
  const expiry = card.expiresAt
    ? `<p style="font-size:13px;color:#71717a">Valid until ${esc(new Date(card.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'long', timeZone: config.store.timezone }))}.</p>`
    : '';
  return {
    to: card.recipientEmail,
    subject: `${card.senderName ? `${card.senderName} sent you` : 'Your'} ${amount} ${config.store.name} gift card`,
    html: layout(`A ${amount} gift card for you`, `
      <p style="font-size:14px">${card.recipientName ? `Hi ${esc(card.recipientName)}, ` : ''}${from} a gift card for ${esc(config.store.name)}.</p>
      ${card.message ? `<p style="font-size:14px;white-space:pre-wrap;border-left:3px solid #ea580c;padding-left:12px;color:#3f3f46">${esc(card.message)}</p>` : ''}
      <div style="margin:20px 0;padding:20px;border-radius:8px;background:#fff7ed;border:1px dashed #ea580c;text-align:center">
        <div style="font-size:13px;color:#9a3412">Gift card code</div>
        <div style="font-size:22px;font-weight:bold;letter-spacing:2px;font-family:monospace;color:#18181b;margin-top:6px">${esc(card.code)}</div>
        <div style="font-size:14px;margin-top:6px">Balance: <strong>${amount}</strong></div>
      </div>
      <p style="font-size:14px">Enter the code at checkout to pay for your order. Any balance left stays on the card for next time.</p>
      ${expiry}
      <p style="margin:24px 0"><a href="${config.frontendUrl}/products"
         style="background:#c2410c;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Start shopping</a></p>`),
    text: `${card.senderName ? `${card.senderName} sent you` : 'You have received'} a ${amount} ${config.store.name} gift card. Code: ${card.code}. Use it at checkout on ${config.frontendUrl}.`,
  };
}

function addressBlock(a) {
  return `<p style="font-size:14px;line-height:1.5;margin:0">${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ''}<br>
    ${a.landmark ? `${esc(a.landmark)}<br>` : ''}${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}<br>Phone: ${esc(a.phone)}</p>`;
}

const orderLink = (order) =>
  `<p style="margin:24px 0"><a href="${config.frontendUrl}/account/orders/${encodeURIComponent(order.orderNumber)}"
     style="background:#c2410c;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your order</a></p>`;

/** "Asha (asha@example.com)" for each gift card in a purchase. */
const giftCardRecipients = (order) =>
  order.items
    .filter((i) => i.giftCard)
    .map((i) => `${i.giftCard.recipientName}${i.giftCard.recipientEmail ? ` (${i.giftCard.recipientEmail})` : ''}`);

/** Delivery details for an order: the address, or who the gift card was emailed to. */
function deliveryBlock(order) {
  if (order.shippingAddress) return addressBlock(order.shippingAddress);
  const to = giftCardRecipients(order).map(esc).join('<br>');
  return `<p style="font-size:14px;line-height:1.5;margin:0">Gift card sent by email to:<br>${to}</p>`;
}

export function orderConfirmedEmail(order) {
  if (order.kind === 'gift_card') {
    const to = giftCardRecipients(order);
    return {
      to: order.email,
      subject: `Your ${config.store.name} gift card is on its way`,
      html: layout('Thank you for your gift card order!', `
        <p style="font-size:14px">We've received your payment for order <strong>${esc(order.orderNumber)}</strong>
        and emailed the gift card to <strong>${to.map(esc).join(', ')}</strong>.</p>
        ${itemsTable(order)}
        <p style="font-size:13px;color:#71717a">If it doesn't arrive, ask them to check their spam folder or reply to this email and we'll resend it.</p>
        ${orderLink(order)}`),
      text: `Thank you! Your gift card (order ${order.orderNumber}, ${formatMoney(order.total, order.currency)}) was emailed to ${to.join(', ')}.`,
    };
  }
  return {
    to: order.email,
    subject: `Order confirmed: ${order.orderNumber}`,
    html: layout(`Thank you for your order!`, `
      <p style="font-size:14px">We've received your payment for order <strong>${esc(order.orderNumber)}</strong> and are getting it ready.</p>
      ${itemsTable(order)}
      <h2 style="font-size:16px;margin:16px 0 8px">Shipping to</h2>
      ${addressBlock(order.shippingAddress)}
      ${orderLink(order)}`),
    text: `Thank you! Order ${order.orderNumber} is confirmed. Total ${formatMoney(order.total, order.currency)}${order.giftCardAmount ? ` (${formatMoney(order.giftCardAmount, order.currency)} paid by gift card)` : ''}. Track it at ${config.frontendUrl}/account/orders/${order.orderNumber}`,
  };
}

export function orderShippedEmail(order) {
  const s = order.shipment;
  return {
    to: order.email,
    subject: `Your order ${order.orderNumber} has shipped`,
    html: layout('Your order is on its way', `
      <p style="font-size:14px">Order <strong>${esc(order.orderNumber)}</strong> has been handed to the courier.</p>
      ${s ? `<p style="font-size:14px">Courier: <strong>${esc(s.courier ?? '-')}</strong><br>Tracking number (AWB): <strong>${esc(s.awb ?? '-')}</strong></p>` : ''}
      ${s?.trackingUrl ? `<p style="font-size:14px"><a href="${esc(s.trackingUrl)}">Track your shipment</a></p>` : ''}
      ${orderLink(order)}`),
    text: `Order ${order.orderNumber} has shipped${s?.awb ? ` (AWB ${s.awb}, ${s.courier})` : ''}.`,
  };
}

export function orderDeliveredEmail(order) {
  return {
    to: order.email,
    subject: `Delivered: ${order.orderNumber}`,
    html: layout('Your order has been delivered', `
      <p style="font-size:14px">Order <strong>${esc(order.orderNumber)}</strong> was delivered. We hope you love it!</p>
      ${orderLink(order)}`),
    text: `Order ${order.orderNumber} has been delivered.`,
  };
}

export function orderCancelledEmail(order, reason) {
  const refundNote = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded'
    ? '<p style="font-size:14px">Your payment will be refunded to the original payment method within 5–7 business days.</p>'
    : '';
  return {
    to: order.email,
    subject: `Order ${order.orderNumber} cancelled`,
    html: layout('Your order was cancelled', `
      <p style="font-size:14px">Order <strong>${esc(order.orderNumber)}</strong> has been cancelled.${reason ? ` Reason: ${esc(reason)}` : ''}</p>
      ${refundNote}
      ${orderLink(order)}`),
    text: `Order ${order.orderNumber} has been cancelled.`,
  };
}

export function adminNewOrderEmail(order) {
  if (!config.email.adminNotify) return null;
  return {
    to: config.email.adminNotify,
    subject: `New order ${order.orderNumber}: ${formatMoney(order.total, order.currency)}`,
    html: layout(`New paid ${order.kind === 'gift_card' ? 'gift card order' : 'order'} ${order.orderNumber}`, `
      ${itemsTable(order)}
      ${deliveryBlock(order)}
      <p style="margin:24px 0"><a href="${config.frontendUrl}/admin/orders/${encodeURIComponent(order.orderNumber)}">Open in admin</a></p>`),
    text: `New order ${order.orderNumber}, total ${formatMoney(order.total, order.currency)}`,
  };
}

/** "Sat, 1 Nov 2026" for a YYYY-MM-DD date. */
export const formatDay = (date) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

function prebookingTable(booking) {
  const rows = booking.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f4f4f5;font-size:14px">${esc(i.productName)}${i.variantLabel ? ` <span style="color:#71717a">(${esc(i.variantLabel)})</span>` : ''} × ${i.quantity}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f4f4f5;font-size:14px;text-align:right">${formatMoney(i.lineTotal)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">${rows}
    <tr><td style="padding-top:8px;font-size:14px;font-weight:bold">Estimated total</td>
    <td style="padding-top:8px;font-size:14px;font-weight:bold;text-align:right">${formatMoney(booking.estimatedTotal)}</td></tr></table>`;
}

/** Sent to the customer (when they gave an email) after they pre-book. */
export function prebookingReceivedEmail(booking) {
  if (!booking.email) return null;
  return {
    to: booking.email,
    subject: `Pre-booking ${booking.reference} received`,
    html: layout('We have your pre-booking', `
      <p style="font-size:14px">Thank you, ${esc(booking.name)}. We've received your pre-booking
      <strong>${esc(booking.reference)}</strong> for <strong>${esc(formatDay(booking.deliveryDate))}</strong>.
      We'll contact you to confirm it and arrange payment.</p>
      ${prebookingTable(booking)}
      <p style="font-size:12px;color:#71717a">Prices are estimates and will be confirmed with your booking.</p>`),
    text: `We've received your pre-booking ${booking.reference} for ${formatDay(booking.deliveryDate)}. Estimated total ${formatMoney(booking.estimatedTotal)}. We'll contact you to confirm it.`,
  };
}

export function adminPrebookingEmail(booking) {
  if (!config.email.adminNotify) return null;
  return {
    to: config.email.adminNotify,
    subject: `New pre-booking ${booking.reference} for ${formatDay(booking.deliveryDate)}`,
    html: layout(`New pre-booking ${booking.reference}`, `
      <p style="font-size:14px"><strong>${esc(booking.name)}</strong><br>
      Phone: ${esc(booking.phone)}${booking.email ? `<br>Email: ${esc(booking.email)}` : ''}<br>
      Date: <strong>${esc(formatDay(booking.deliveryDate))}</strong></p>
      ${prebookingTable(booking)}
      ${booking.address ? `<p style="font-size:14px;white-space:pre-wrap"><strong>Address</strong><br>${esc(booking.address)}</p>` : ''}
      ${booking.notes ? `<p style="font-size:14px;white-space:pre-wrap"><strong>Notes</strong><br>${esc(booking.notes)}</p>` : ''}
      <p style="margin:24px 0"><a href="${config.frontendUrl}/admin/prebookings">Open in admin</a></p>`),
    text: `Pre-booking ${booking.reference} from ${booking.name} (${booking.phone}) for ${formatDay(booking.deliveryDate)}, estimated ${formatMoney(booking.estimatedTotal)}`,
  };
}

export function adminBulkEnquiryEmail(enquiry) {
  if (!config.email.adminNotify) return null;
  const items = enquiry.items
    .map((i) => `<li>${esc(i.productName)}${i.variantLabel ? ` (${esc(i.variantLabel)})` : ''} × ${i.quantity}</li>`)
    .join('');
  return {
    to: config.email.adminNotify,
    subject: `New bulk enquiry from ${enquiry.name}`,
    html: layout('New bulk order enquiry', `
      <p style="font-size:14px"><strong>${esc(enquiry.name)}</strong>${enquiry.company ? ` (${esc(enquiry.company)})` : ''}<br>
      Phone: ${esc(enquiry.phone)}${enquiry.email ? `<br>Email: ${esc(enquiry.email)}` : ''}</p>
      ${items ? `<ul style="font-size:14px">${items}</ul>` : ''}
      ${enquiry.message ? `<p style="font-size:14px;white-space:pre-wrap">${esc(enquiry.message)}</p>` : ''}
      <p style="margin:24px 0"><a href="${config.frontendUrl}/admin/enquiries">Open in admin</a></p>`),
    text: `Bulk enquiry from ${enquiry.name} (${enquiry.phone})`,
  };
}
