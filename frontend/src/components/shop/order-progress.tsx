// Order status visualisations (no hooks).
import { cn, formatDate, ORDER_STATUS_LABELS } from "@/lib/format";
import type { Order, OrderStatus, TrackingEvent } from "@/lib/types";
import { CheckIcon, XCircleIcon } from "./icons";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "processing", label: "Processing" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
];

export function statusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

/** Confirmed → Processing → Shipped → Delivered. Cancelled orders get a distinct banner. */
export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-zinc-100 px-4 py-4 text-sm text-zinc-700 ring-1 ring-inset ring-zinc-200">
        <XCircleIcon className="mt-0.5 size-5 text-zinc-500" />
        <div>
          <p className="font-semibold text-zinc-900">Order cancelled</p>
          <p className="mt-0.5">
            {order.cancelledAt ? `Cancelled on ${formatDate(order.cancelledAt, true)}.` : "This order has been cancelled."}
            {order.paymentStatus === "refunded" && " Your refund has been processed."}
            {order.paymentStatus === "paid" && " Any amount paid will be refunded to the original payment method."}
          </p>
        </div>
      </div>
    );
  }

  const current = STEPS.findIndex((s) => s.status === order.status); // -1 while awaiting payment
  const pct = current <= 0 ? 0 : (current / (STEPS.length - 1)) * 100;

  return (
    <div className="relative">
      {/* Track between the first and last dot centres (columns are 25% wide). */}
      <div className="absolute left-[12.5%] right-[12.5%] top-[11px] h-0.5 rounded-full bg-zinc-200" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="relative grid grid-cols-4" aria-label="Order progress">
        {STEPS.map((step, i) => {
          const done = current >= i;
          const active = current === i;
          return (
            <li key={step.status} className="flex flex-col items-center text-center">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border-2 bg-white",
                  done ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 text-transparent",
                  active && "ring-4 ring-zinc-900/10",
                )}
              >
                <CheckIcon className="size-3.5" />
              </span>
              <span
                className={cn("mt-2 text-xs font-medium sm:text-sm", done ? "text-zinc-900" : "text-zinc-500")}
                aria-current={active ? "step" : undefined}
              >
                {step.label}
                <span className="sr-only">{done ? " (completed)" : " (upcoming)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StatusTimeline({ history }: { history: Order["statusHistory"] }) {
  const items = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (items.length === 0) return <p className="text-sm text-zinc-500">No updates yet.</p>;
  return (
    <ol className="space-y-0">
      {items.map((h, i) => (
        <li key={`${h.status}-${h.createdAt}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-zinc-200" aria-hidden="true" />}
          <span
            className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full", i === 0 ? "bg-brand-700" : "bg-zinc-300")}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{statusLabel(h.status)}</p>
            {h.note && <p className="mt-0.5 text-sm text-zinc-600">{h.note}</p>}
            <p className="mt-0.5 text-xs text-zinc-500">{formatDate(h.createdAt, true)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TrackingEvents({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <ol className="space-y-4">
      {sorted.map((e, i) => (
        <li key={`${e.date}-${i}`} className="flex gap-3 text-sm">
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", i === 0 ? "bg-violet-600" : "bg-zinc-300")} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-zinc-900">{e.activity || e.status}</p>
            <p className="text-xs text-zinc-500">
              {[e.activity && e.status !== e.activity ? e.status : null, e.location, formatDate(e.date, true)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
