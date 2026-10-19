// GoDaddy Node.js Hosting email gateway helper: the JavaScript variant of the
// vended `sendEmail()` helper from github.com/godaddy/nodejs-hosting-agent-skill
// (skills/godaddy-nodejs-hosting/email.md), type annotations removed. Keep it
// behaviourally identical to the upstream helper; the timeout and abort-signal
// handling are load-bearing. Used when EMAIL_TRANSPORT=godaddy.

/**
 * Send transactional email through the Node.js Hosting email gateway.
 *
 * Posts a JSON message to the loopback gateway provided by the platform
 * runtime. The gateway authors the outbound RFC-5322 message, applies
 * the platform sender-identity policy, and forwards to the configured
 * SMTP destination. Customer code never touches SMTP directly.
 *
 * The gateway listens on 127.0.0.1:2525 inside the Node.js Hosting
 * container; this module assumes that contract and does not accept an
 * override.
 */

// Loopback only — the email gateway runs on 127.0.0.1 inside the same
// container as customer code. TLS adds nothing for traffic that never
// leaves the kernel and would require cert provisioning for 127.0.0.1
// in every container.
const EMAIL_GATEWAY_URL = 'http://127.0.0.1:2525/api/email/send';
const REQUEST_TIMEOUT_MS = 30_000;

export async function sendEmail(input) {
  const payload = buildPayload(input);

  // AbortSignal.timeout() binds to the response so the same deadline
  // covers connect, headers, AND body reads. A manual
  // `setTimeout(controller.abort, ...)` cleared in `finally` after
  // `fetch()` resolves headers leaves body reads unprotected — the
  // caller hangs indefinitely on a stalled mid-body response.
  let response;
  let body;
  try {
    response = await fetch(EMAIL_GATEWAY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = await parseBody(response);
  } catch (err) {
    throw new Error(`email gateway unreachable: ${describeError(err)}`);
  }

  if (!response.ok || !body.success) {
    const detail = body.error ?? `HTTP ${response.status}`;
    const idSuffix = body.messageId ? ` (messageId=${body.messageId})` : '';
    throw new Error(`email send failed: ${detail}${idSuffix}`);
  }

  if (!body.messageId) {
    throw new Error('email send succeeded but gateway returned no messageId');
  }

  return { messageId: body.messageId };
}

function buildPayload(input) {
  const payload = {
    to: toArray(input.to),
    subject: input.subject,
  };
  const cc = toArray(input.cc);
  if (cc.length > 0) payload.cc = cc;
  const bcc = toArray(input.bcc);
  if (bcc.length > 0) payload.bcc = bcc;
  if (input.text) payload.text = input.text;
  if (input.html) payload.html = input.html;
  if (input.replyTo) payload.replyTo = input.replyTo;
  if (input.from) payload.from = input.from;
  if (input.attachments && input.attachments.length > 0) {
    payload.attachments = input.attachments.map(encodeAttachment);
  }
  return payload;
}

function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function encodeAttachment(att) {
  const out = {
    filename: att.filename,
    content: Buffer.from(att.content).toString('base64'),
  };
  if (att.contentType) out.contentType = att.contentType;
  return out;
}

async function parseBody(response) {
  try {
    return await response.json();
  } catch (err) {
    // Don't swallow aborts — re-raise so the outer catch reports the
    // timeout. JSON parse errors fall through to a sanitized "non-JSON
    // response" payload that lets sendEmail produce a useful error.
    if (isAbortLike(err)) throw err;
    return { success: false, error: `non-JSON response (HTTP ${response.status})` };
  }
}

function isAbortLike(err) {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function describeError(err) {
  if (err instanceof Error) {
    if (isAbortLike(err)) return `timed out after ${REQUEST_TIMEOUT_MS}ms`;
    return err.message;
  }
  return String(err);
}
