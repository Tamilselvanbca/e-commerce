// Transactional email via Nodemailer. Works with any SMTP server, including
// SendGrid (host smtp.sendgrid.net, user "apikey", pass = API key) and Amazon SES.
// Without SMTP_HOST, messages are logged instead of sent.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { formatMoney } from '../lib/util.js';

// Rebuilt whenever the SMTP settings change (Admin → Settings → Email).
let transport = null;
let transportFor = null;

function getTransport() {
  const key = JSON.stringify(config.email.smtp);
  if (key !== transportFor) {
    transport?.close?.();
    transport = config.email.smtp
      ? nodemailer.createTransport(config.email.smtp)
      : nodemailer.createTransport({ jsonTransport: true });
    transportFor = key;
  }
  return transport;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!to) return;
  try {
    const info = await getTransport().sendMail({ from: config.email.from, to, subject, html, text });
    if (!config.email.smtp) logger.info({ to, subject }, '[email] SMTP not configured; message logged only');
    else logger.info({ to, subject, messageId: info.messageId }, '[email] sent');
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
  if (!config.email.smtp) {
    throw new AppError(400, 'EMAIL_NOT_CONFIGURED', 'No SMTP server is set, so emails are only written to the server log.');
  }
  try {
    await getTransport().sendMail({
      from: config.email.from,
      to,
      subject: `Test email from ${config.store.name}`,
      html: layout('Your email settings work', '<p style="font-size:14px">Order confirmations and alerts will be sent from this address.</p>'),
      text: 'Your email settings work. Order confirmations and alerts will be sent from this address.',
    });
  } catch (err) {
    logger.warn({ err, to }, '[email] test email failed');
    throw new AppError(502, 'EMAIL_FAILED', `The email server rejected the message: ${err.message}`);
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
        <tr><td style="background:#c2410c;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:bold">${store}</td></tr>
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
    ${line('Shipping', order.shippingFee ? formatMoney(order.shippingFee, order.currency) : 'Free')}
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

export function orderConfirmedEmail(order) {
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
    html: layout(`New paid order ${order.orderNumber}`, `
      ${itemsTable(order)}
      ${addressBlock(order.shippingAddress)}
      <p style="margin:24px 0"><a href="${config.frontendUrl}/admin/orders/${encodeURIComponent(order.orderNumber)}">Open in admin</a></p>`),
    text: `New order ${order.orderNumber}, total ${formatMoney(order.total, order.currency)}`,
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
