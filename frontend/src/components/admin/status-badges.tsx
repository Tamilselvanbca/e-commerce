import { Badge } from "@/components/ui";
import {
  GATEWAY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONE,
} from "@/lib/format";
import type { BulkEnquiryStatus, Gateway, OrderStatus, PaymentStatus, PrebookingStatus, ProductStatus } from "@/lib/types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABELS[status] ?? status}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABELS[status] ?? status}</Badge>;
}

const PRODUCT_STATUS_TONE: Record<ProductStatus, string> = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  archived: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge className={PRODUCT_STATUS_TONE[status]}>{PRODUCT_STATUS_LABELS[status] ?? status}</Badge>;
}

export const ENQUIRY_STATUS_LABELS: Record<BulkEnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  closed: "Closed",
};
const ENQUIRY_STATUS_TONE: Record<BulkEnquiryStatus, string> = {
  new: "bg-blue-50 text-blue-800 ring-blue-200",
  contacted: "bg-amber-50 text-amber-800 ring-amber-200",
  converted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function EnquiryStatusBadge({ status }: { status: BulkEnquiryStatus }) {
  return <Badge className={ENQUIRY_STATUS_TONE[status]}>{ENQUIRY_STATUS_LABELS[status] ?? status}</Badge>;
}

export const PREBOOKING_STATUS_LABELS: Record<PrebookingStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PREBOOKING_STATUS_TONE: Record<PrebookingStatus, string> = {
  new: "bg-blue-50 text-blue-800 ring-blue-200",
  confirmed: "bg-amber-50 text-amber-800 ring-amber-200",
  ready: "bg-violet-50 text-violet-800 ring-violet-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function PrebookingStatusBadge({ status }: { status: PrebookingStatus }) {
  return <Badge className={PREBOOKING_STATUS_TONE[status]}>{PREBOOKING_STATUS_LABELS[status] ?? status}</Badge>;
}

export function GatewayLabel({ gateway }: { gateway: Gateway | null | undefined }) {
  if (!gateway) return <span className="text-zinc-400">—</span>;
  return <span className="text-zinc-700">{GATEWAY_LABELS[gateway] ?? gateway}</span>;
}

export function RoleBadge({ role }: { role: "customer" | "admin" }) {
  return role === "admin" ? (
    <Badge className="bg-brand-700 text-white ring-brand-700">Admin</Badge>
  ) : (
    <Badge>Customer</Badge>
  );
}

export function BlockedBadge() {
  return <Badge className="bg-red-50 text-red-700 ring-red-200">Blocked</Badge>;
}

/** Small stock indicator: red when out of stock, amber when low. */
export function StockBadge({ stock, low = 5 }: { stock: number; low?: number }) {
  if (stock <= 0) return <Badge className="shrink-0 whitespace-nowrap bg-red-50 text-red-700 ring-red-200">Out of stock</Badge>;
  if (stock <= low)
    return <Badge className="shrink-0 whitespace-nowrap bg-amber-50 text-amber-800 ring-amber-200">{stock} left</Badge>;
  return <span className="tabular-nums text-zinc-700">{stock}</span>;
}
