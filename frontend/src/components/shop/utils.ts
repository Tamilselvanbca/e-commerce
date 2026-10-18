// Small storefront helpers (no React). Safe to import from server and client code.
import { ApiError } from "@/lib/api";
import { formatPrice, variantLabel } from "@/lib/format";
import type { CartItem } from "@/lib/types";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** First value of a search param (Next gives string[] for repeated keys). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? undefined : v;
}

/** decodeURIComponent that never throws (route params may or may not arrive encoded). */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Positive integer page number from a search param, defaulting to 1. */
export function pageParam(value: string | string[] | undefined): number {
  const n = Number.parseInt(firstParam(value) ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Only allow same-site relative redirect targets ("/account", "/checkout?x=1").
 * Rejects protocol-relative ("//evil.com") and backslash tricks.
 */
export function safeNextPath(value: string | string[] | undefined, fallback = "/account"): string {
  const v = firstParam(value);
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\r\n]/.test(v)) return fallback;
  if (v === "/login" || v.startsWith("/login?") || v.startsWith("/login/")) return fallback;
  return v;
}

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------
// Validation (mirrors backend rules in docs/API.md)
// ---------------------------------------------------------------------------
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
export const E164_RE = /^\+[1-9]\d{7,14}$/;
export const PINCODE_RE = /^\d{6}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strips spaces/dashes and a leading +91 / 0 so "+91 98765-43210" becomes "9876543210". */
export function normalizeIndianPhone(input: string): string {
  let digits = input.replace(/[\s-]/g, "");
  if (digits.startsWith("+91") && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

export function isValidPhone(input: string): boolean {
  const compact = input.replace(/[\s-]/g, "");
  return INDIAN_MOBILE_RE.test(normalizeIndianPhone(compact)) || E164_RE.test(compact);
}

/** Maps a VALIDATION_ERROR `details` list ({ path, message }[]) to a field -> message record. */
export function fieldErrorsFrom(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_ERROR" || !Array.isArray(err.details)) return out;
  for (const d of err.details as { path?: unknown; message?: unknown }[]) {
    if (!d || typeof d.message !== "string") continue;
    const raw = Array.isArray(d.path) ? d.path[d.path.length - 1] : d.path;
    if (raw === undefined || raw === null) continue;
    const key = String(raw).split(".").pop() ?? "";
    if (key && !out[key]) out[key] = d.message;
  }
  return out;
}

/** Reads a numeric property from an ApiError's `details` object. */
export function detailNumber(err: unknown, key: string): number | null {
  if (!(err instanceof ApiError) || !err.details || typeof err.details !== "object") return null;
  const value = (err.details as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// WhatsApp messages
// ---------------------------------------------------------------------------
export function productWhatsAppMessage(opts: {
  storeName: string;
  productName: string;
  variant?: string | null;
  sku?: string | null;
  quantity: number;
}): string {
  const lines = [
    `Hi ${opts.storeName}, I'd like to place a bulk order.`,
    "",
    `Product: ${opts.productName}`,
    opts.variant ? `Variant: ${opts.variant}` : null,
    opts.sku ? `SKU: ${opts.sku}` : null,
    `Quantity: ${opts.quantity}`,
    "",
    "Please share pricing and delivery details.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function cartWhatsAppMessage(storeName: string, items: CartItem[]): string {
  const rows = items.map((item, i) => {
    const label = variantLabel(item.size, item.color);
    return `${i + 1}. ${item.productName}${label ? ` (${label})` : ""} - SKU ${item.sku} - Qty ${item.quantity}`;
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return [
    `Hi ${storeName}, I'd like to order these items in bulk:`,
    "",
    ...rows,
    "",
    `Current cart value: ${formatPrice(subtotal)}`,
    "Please share bulk pricing and delivery details.",
  ].join("\n");
}
