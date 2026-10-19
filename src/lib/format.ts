import { twMerge } from "tailwind-merge";
import type { OrderStatus, PaymentStatus } from "./types";

/** Formats paise as currency: 129900 -> "₹1,299". Shows decimals only when needed. */
export function formatPrice(paise: number, currency = "INR"): string {
  const amount = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Converts a rupee input value ("1299.50") to paise (129950). Returns NaN for invalid input. */
export function rupeesToPaise(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

export function paiseToRupees(paise: number | null | undefined): string {
  if (paise == null) return "";
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

export function discountPercent(price: number, compareAt: number | null): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

/** Tailwind classes for status badges. */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-blue-50 text-blue-800 ring-blue-200",
  processing: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  shipped: "bg-violet-50 text-violet-800 ring-violet-200",
  delivered: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failed: "bg-red-50 text-red-800 ring-red-200",
  refunded: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export const GATEWAY_LABELS = {
  razorpay: "Razorpay",
  stripe: "Stripe",
  mock: "Test payment",
  gift_card: "Gift card",
} as const;

export function variantLabel(size: string | null, color: string | null): string {
  return [size, color].filter(Boolean).join(" / ");
}

/** WhatsApp click-to-chat URL. `number` must include the country code. */
export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/**
 * Joins class names and resolves Tailwind conflicts so later classes win,
 * e.g. cn("h-10 px-3", "h-12") -> "px-3 h-12". This lets callers override
 * the defaults of shared components through `className`.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
