import { twMerge } from "tailwind-merge";
import type { Offer, OrderStatus, PaymentMethodDetails, PaymentStatus } from "./types";

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

/** What an offer gives: "10% off up to ₹300", "₹100 off", "Free delivery". */
export function offerBenefit(o: Pick<Offer, "type" | "value" | "maxDiscount">): string {
  if (o.type === "percent") return `${o.value}% off${o.maxDiscount ? ` up to ${formatPrice(o.maxDiscount)}` : ""}`;
  if (o.type === "fixed") return `${formatPrice(o.value)} off`;
  return "Free delivery";
}

/** When it applies: "On orders of ₹2,500 or more · First order only". */
export function offerTerms(o: Pick<Offer, "minSubtotal" | "firstOrderOnly" | "region">): string {
  return [
    o.minSubtotal > 0 ? `On orders of ${formatPrice(o.minSubtotal)} or more` : "On any order",
    o.firstOrderOnly ? "First order only" : null,
    o.region === "domestic" ? "Deliveries in India" : o.region === "international" ? "Deliveries outside India" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Razorpay bank codes (IFSC prefixes) for net banking and card issuers.
const BANKS: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank",
  IDFB: "IDFC FIRST Bank",
  INDB: "IndusInd Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  BKID: "Bank of India",
  IOBA: "Indian Overseas Bank",
  IDIB: "Indian Bank",
  FDRL: "Federal Bank",
  CIUB: "City Union Bank",
  KVBL: "Karur Vysya Bank",
  TMBL: "Tamilnad Mercantile Bank",
  SIBL: "South Indian Bank",
  AUBL: "AU Small Finance Bank",
  RATN: "RBL Bank",
};
const bankName = (code: string) => BANKS[code.toUpperCase().replace(/_R$|_C$/, "")] ?? code;

const CARD_NETWORKS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  rupay: "RuPay",
  amex: "American Express",
  "american express": "American Express",
  "diners club": "Diners Club",
  diners: "Diners Club",
  maestro: "Maestro",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
};

const WALLETS: Record<string, string> = {
  paytm: "Paytm",
  phonepe: "PhonePe",
  amazonpay: "Amazon Pay",
  mobikwik: "MobiKwik",
  freecharge: "Freecharge",
  airtelmoney: "Airtel Money",
  jiomoney: "JioMoney",
  olamoney: "Ola Money",
};

const METHODS: Record<string, string> = {
  paylater: "Pay later",
  cardless_emi: "Cardless EMI",
  bank_transfer: "Bank transfer",
  test: "Test payment",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * How an order was paid, for people: "Visa credit card •••• 4242 · HDFC Bank",
 * "UPI · ra***@okhdfcbank", "Net banking · ICICI Bank", "Wallet · Paytm".
 */
export function paymentMethodLabel(d: PaymentMethodDetails): string {
  if (d.method === "card" || d.method === "emi") {
    const network = d.network ? (CARD_NETWORKS[d.network.toLowerCase()] ?? d.network) : null;
    const card = [network, d.cardType, "card"].filter(Boolean).join(" ");
    const label = `${d.method === "emi" ? "EMI on " : ""}${capitalize(card)}${d.last4 ? ` •••• ${d.last4}` : ""}`;
    return d.issuer ? `${label} · ${bankName(d.issuer)}` : label;
  }
  if (d.method === "upi") return d.vpa ? `UPI · ${d.vpa}` : "UPI";
  if (d.method === "netbanking") return d.bank ? `Net banking · ${bankName(d.bank)}` : "Net banking";
  if (d.method === "wallet") return d.wallet ? `Wallet · ${WALLETS[d.wallet.toLowerCase()] ?? capitalize(d.wallet)}` : "Wallet";
  return METHODS[d.method] ?? capitalize(d.method.replace(/_/g, " "));
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

/** A courier status such as "IN TRANSIT" or "RTO INITIATED" → "In transit", "RTO initiated". */
export function courierStatusLabel(status: string): string {
  const words = status.trim().toLowerCase().replace(/[_-]+/g, " ").split(/\s+/);
  return words.map((w, i) => (w === "rto" || w === "awb" ? w.toUpperCase() : i === 0 ? capitalize(w) : w)).join(" ");
}

/** A courier's date ("2026-10-25 18:00:00" or "Oct 25, 2026") as "25 Oct 2026"; unknown formats as given. */
export function formatCourierDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(" ", "T") : value);
  return Number.isNaN(d.getTime()) ? value : formatDate(d.toISOString());
}

/** A Google Maps link to a pinned spot. */
export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
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
