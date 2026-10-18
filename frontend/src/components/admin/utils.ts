// Admin-only helpers (pure functions, no React).
import { ApiError } from "@/lib/api";

export type FieldErrors = Record<string, string>;

/**
 * Converts a `VALIDATION_ERROR` response (`details: [{ path, message }]`) into
 * a `{ "variants.0.price": "..." }` map. Returns null for any other error.
 */
export function validationErrors(err: unknown): FieldErrors | null {
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_ERROR" || !Array.isArray(err.details)) return null;
  const out: FieldErrors = {};
  for (const item of err.details as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const { path, message } = item as { path?: unknown; message?: unknown };
    const key = Array.isArray(path) ? path.join(".") : typeof path === "string" ? path : "";
    if (typeof message === "string" && !(key in out)) out[key] = message;
  }
  return out;
}

/** Removes `key` (and, with `prefix`, every key under it) from an error map. */
export function withoutError(errors: FieldErrors, key: string, prefix = false): FieldErrors {
  let changed = false;
  const next: FieldErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    if (k === key || (prefix && k.startsWith(`${key}.`))) changed = true;
    else next[k] = v;
  }
  return changed ? next : errors;
}

/** URL-safe slug: "Classic Tee (Black)" -> "classic-tee-black". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** SKU suggestion from slug + size + color: "CLASSIC-TEE-M-BLACK". */
export function suggestSku(slug: string, size: string | null, color: string | null): string {
  return [slug, size, color]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join("-")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Compact rupee label for chart axes: 0 -> "₹0", 15000_00 -> "₹15K", 1.2 lakh -> "₹1.2L". Input in paise. */
export function compactRupees(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
  if (abs >= 1e7) return `₹${fmt(r / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${fmt(r / 1e5)}L`;
  if (abs >= 1e3) return `₹${fmt(r / 1e3)}K`;
  return `₹${fmt(r)}`;
}

/** Compact integer: 1284 -> "1,284", 12900 -> "12.9K". */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 10000) return new Intl.NumberFormat("en-IN").format(n);
  if (Math.abs(n) < 1e5) return `${(Math.round(n / 100) / 10).toString().replace(/\.0$/, "")}K`;
  if (Math.abs(n) < 1e7) return `${(Math.round(n / 1e4) / 10).toString().replace(/\.0$/, "")}L`;
  return `${(Math.round(n / 1e6) / 10).toString().replace(/\.0$/, "")}Cr`;
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

/** Percentage change, or null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

/** Short date for chart axes: "2026-10-01" -> "1 Oct". Dates are treated as calendar days. */
export function shortDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(d);
}

export function longDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** "Nice" axis ticks from 0 to >= max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks.length < 2) ticks.push(step);
  return ticks;
}

const COLOR_HEX: Record<string, string> = {
  black: "#111111",
  white: "#ffffff",
  grey: "#9ca3af",
  gray: "#9ca3af",
  charcoal: "#36454f",
  red: "#dc2626",
  maroon: "#7f1d1d",
  pink: "#f472b6",
  orange: "#f97316",
  yellow: "#facc15",
  mustard: "#d4a017",
  green: "#16a34a",
  olive: "#6b7d2a",
  teal: "#0d9488",
  blue: "#2563eb",
  navy: "#1e3a8a",
  "navy blue": "#1e3a8a",
  "sky blue": "#7dd3fc",
  purple: "#7c3aed",
  lavender: "#c4b5fd",
  brown: "#7c4a21",
  beige: "#e8dcc4",
  cream: "#fdf6e3",
  khaki: "#c3b091",
  gold: "#d4af37",
  silver: "#c0c0c0",
};

/** Best-effort hex for a common color name ("Navy" -> "#1e3a8a"), else null. */
export function colorNameToHex(name: string): string | null {
  return COLOR_HEX[name.trim().toLowerCase()] ?? null;
}

/** Splits "S, M ,L" into ["S", "M", "L"] (deduplicated, order kept). */
export function splitList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(",")) {
    const v = part.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Client-side check before uploading; returns an error message or null. */
export function checkImageFile(file: File): string | null {
  if (!file.type.startsWith("image/") || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name}: use a JPEG, PNG, WebP, GIF or AVIF image`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB`;
  }
  return null;
}
