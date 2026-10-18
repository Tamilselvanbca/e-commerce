// Order display helpers shared by checkout, success and account pages (no hooks).
import { cn, formatPrice, ORDER_STATUS_LABELS, ORDER_STATUS_TONE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONE, variantLabel } from "@/lib/format";
import type { Gateway, OrderItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { Badge, ProductImg } from "@/components/ui";

export const GATEWAY_OPTIONS: Record<Gateway, { title: string; description: string }> = {
  razorpay: {
    title: "UPI, Cards, Net Banking & Wallets (Razorpay)",
    description: "Pay with any UPI app, debit or credit card, net banking or wallet.",
  },
  stripe: {
    title: "International cards (Stripe)",
    description: "Visa, Mastercard, American Express and other cards issued outside India.",
  },
  mock: {
    title: "Test payment (development only)",
    description: "Simulate a successful or failed payment without real money.",
  },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABELS[status] ?? status}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABELS[status] ?? status}</Badge>;
}

export type SummaryLine = {
  key: string;
  name: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  quantity: number;
  lineTotal: number;
  unitPrice?: number;
};

export function orderItemLine(item: OrderItem): SummaryLine {
  return {
    key: item.id,
    name: item.productName,
    size: item.size,
    color: item.color,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
    unitPrice: item.unitPrice,
  };
}

/** Compact list of line items with a quantity bubble on the thumbnail. */
export function LineItems({ items, currency, className }: { items: SummaryLine[]; currency?: string; className?: string }) {
  return (
    <ul className={cn("divide-y divide-zinc-200", className)}>
      {items.map((item) => {
        const label = variantLabel(item.size, item.color);
        return (
          <li key={item.key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <div className="relative shrink-0">
              <ProductImg src={item.imageUrl} alt={item.name} className="size-16 rounded-lg" />
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-700 px-1 text-[11px] font-semibold text-white">
                {item.quantity}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-zinc-900">{item.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {[label, item.unitPrice !== undefined ? `${formatPrice(item.unitPrice, currency)} each` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium text-zinc-900">{formatPrice(item.lineTotal, currency)}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function Totals({
  subtotal,
  shippingFee,
  discount,
  total,
  currency,
  totalLabel = "Total",
}: {
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  currency?: string;
  totalLabel?: string;
}) {
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-zinc-600">Subtotal</dt>
        <dd className="text-zinc-900">{formatPrice(subtotal, currency)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-zinc-600">Shipping</dt>
        <dd className="text-zinc-900">{shippingFee === 0 ? "Free" : formatPrice(shippingFee, currency)}</dd>
      </div>
      {discount > 0 && (
        <div className="flex justify-between">
          <dt className="text-zinc-600">Discount</dt>
          <dd className="text-emerald-700">−{formatPrice(discount, currency)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-zinc-200 pt-3 text-base">
        <dt className="font-semibold text-zinc-900">{totalLabel}</dt>
        <dd className="font-semibold text-zinc-900">{formatPrice(total, currency)}</dd>
      </div>
    </dl>
  );
}
