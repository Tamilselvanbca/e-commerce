// Display helpers for discounts and gift cards (pure, no React).
import { formatDate, formatPrice } from "@/lib/format";
import type { AdminDiscount, GiftCardStatus, PublicDiscount } from "@/lib/types";

export function discountValueLabel(d: Pick<PublicDiscount, "type" | "value" | "maxDiscount">): string {
  if (d.type === "percent") return `${d.value}% off${d.maxDiscount ? `, up to ${formatPrice(d.maxDiscount)}` : ""}`;
  if (d.type === "fixed") return `${formatPrice(d.value)} off`;
  return "Free shipping";
}

export function discountConditions(d: AdminDiscount): string[] {
  return [
    d.minSubtotal > 0 && `Orders from ${formatPrice(d.minSubtotal)}`,
    d.region === "domestic" && "India only",
    d.region === "international" && "International only",
    d.firstOrderOnly && "First order only",
    d.perCustomerLimit && `${d.perCustomerLimit}× per customer`,
  ].filter((c): c is string => Boolean(c));
}

export type DiscountState = "active" | "scheduled" | "expired" | "used_up" | "off";

export function discountState(d: AdminDiscount, now = Date.now()): DiscountState {
  if (!d.isActive) return "off";
  if (d.endsAt && new Date(d.endsAt).getTime() <= now) return "expired";
  if (d.startsAt && new Date(d.startsAt).getTime() > now) return "scheduled";
  if (d.usageLimit && d.timesUsed >= d.usageLimit) return "used_up";
  return "active";
}

export const DISCOUNT_STATE: Record<DiscountState, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-800 ring-blue-200" },
  expired: { label: "Expired", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  used_up: { label: "Fully used", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  off: { label: "Off", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

export function validityLabel(d: Pick<AdminDiscount, "startsAt" | "endsAt">): string {
  if (d.startsAt && d.endsAt) return `${formatDate(d.startsAt)} – ${formatDate(d.endsAt)}`;
  if (d.endsAt) return `Until ${formatDate(d.endsAt, true)}`;
  if (d.startsAt) return `From ${formatDate(d.startsAt, true)}`;
  return "No end date";
}

export const GIFT_CARD_STATUS: Record<GiftCardStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  used: { label: "Used up", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  expired: { label: "Expired", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  disabled: { label: "Disabled", className: "bg-red-50 text-red-800 ring-red-200" },
};

/** ISO timestamp → value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO timestamp (null when empty or invalid). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "499" or "499.50" (rupees) → paise; null when empty; NaN when not a number. */
export function rupeesToPaise(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

export const paiseToRupees = (paise: number | null | undefined): string => (paise ? String(paise / 100) : "");

/** Readable random code such as "FEST-7KQ2". */
export function randomCode(prefix = "SWEET"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}
