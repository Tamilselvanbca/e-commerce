"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useToast } from "@/components/providers";
import { Badge, Button, Field, Input, Modal, PageLoader, ProductImg, Textarea } from "@/components/ui";
import { formatDate, formatPrice, GATEWAY_LABELS, ORDER_STATUS_LABELS, paymentMethodLabel, variantLabel } from "@/lib/format";
import type { AdminOrder, Order, OrderStatus } from "@/lib/types";
import { ConfirmDialog, DangerTextButton } from "@/components/admin/confirm-dialog";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { useApiQuery } from "@/components/admin/hooks";
import { IconExternal } from "@/components/admin/icons";
import { DescriptionList, PageHeader, Panel } from "@/components/admin/page-header";
import { GatewayLabel, OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/status-badges";
import { formatInt, plural, validationErrors, type FieldErrors } from "@/components/admin/utils";

/** Allowed manual transitions (mirrors the API contract). */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

const STATUS_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  processing: "Start processing",
  shipped: "Mark as shipped",
  delivered: "Mark as delivered",
  cancelled: "Cancel order",
};

const PAYMENT_ROW_TONE = {
  created: "bg-amber-50 text-amber-800 ring-amber-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failed: "bg-red-50 text-red-800 ring-red-200",
} as const;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = safeDecode(params.orderNumber);
  const apiPath = `/admin/orders/${encodeURIComponent(orderNumber)}`;
  const { data: order, error, isLoading, isFetching, reload, setData } = useApiQuery<AdminOrder>(apiPath, {
    keepPrevious: false,
  });

  /** Merge an `Order` returned by a mutation, then refetch for payments/customer. */
  const applyOrder = (next: Order) => {
    setData((prev) => (prev ? { ...prev, ...next, customer: prev.customer, payments: prev.payments } : prev));
    reload();
  };

  if (isLoading) return <PageLoader />;
  if (!order) {
    return (
      <>
        <PageHeader title={`Order ${orderNumber}`} back={{ href: "/admin/orders", label: "Orders" }} />
        <LoadError error={error} onRetry={reload} what="this order" backHref="/admin/orders" backLabel="Back to orders" />
      </>
    );
  }

  const history = [...order.statusHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        documentTitle={`Order ${order.orderNumber}`}
        title={
          <>
            <span>Order {order.orderNumber}</span>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </>
        }
        description={
          <>
            Placed {formatDate(order.createdAt, true)}
            {order.paymentGateway ? ` · ${GATEWAY_LABELS[order.paymentGateway]}` : ""}
            {order.paymentMethod ? ` (${paymentMethodLabel(order.paymentMethod)})` : ""}
            {order.paidAt ? ` · Paid ${formatDate(order.paidAt, true)}` : ""}
            {isFetching ? <span className="ml-2 text-zinc-400">Refreshing…</span> : null}
          </>
        }
      />

      {error ? (
        <InlineAlert className="mb-4" title="Couldn't refresh this order">
          {errorMessage(error)}
        </InlineAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <ItemsPanel order={order} />
          <PaymentsPanel order={order} />
          <Panel title="Status history">
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">No status changes recorded.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-zinc-200 pl-5">
                {history.map((h, i) => (
                  <li key={`${h.createdAt}-${i}`} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-white ${i === 0 ? "bg-brand-700" : "bg-zinc-300"}`}
                    />
                    <p className="text-sm font-medium text-zinc-900">
                      {ORDER_STATUS_LABELS[h.status as OrderStatus] ?? h.status}
                    </p>
                    {h.note && <p className="mt-0.5 text-sm text-zinc-600">{h.note}</p>}
                    <p className="mt-0.5 text-xs text-zinc-500">{formatDate(h.createdAt, true)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <FulfilmentPanel order={order} apiPath={apiPath} onUpdated={applyOrder} />

          <Panel title="Customer">
            <DescriptionList
              items={[
                {
                  label: "Name",
                  value: order.customer ? (
                    <Link href={`/admin/users/${order.customer.id}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                      {order.customer.name || "Unnamed customer"}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                { label: "Phone", value: order.phone || order.customer?.phone || "—" },
                { label: "Email", value: order.email || order.customer?.email || "—" },
              ]}
            />
          </Panel>

          {!order.shippingAddress ? (
            <Panel title="Gift card for" description="Bought online; delivered by email when paid.">
              <ul className="space-y-3 text-sm">
                {order.items
                  .filter((i) => i.giftCard)
                  .map((i) => (
                    <li key={i.id} className="leading-6 text-zinc-700">
                      <span className="font-medium text-zinc-900">{i.giftCard!.recipientName}</span>
                      <span className="block break-all">{i.giftCard!.recipientEmail}</span>
                      {i.giftCard!.senderName && <span className="block">From {i.giftCard!.senderName}</span>}
                      {i.giftCard!.message && <span className="mt-1 block whitespace-pre-line italic text-zinc-600">&ldquo;{i.giftCard!.message}&rdquo;</span>}
                      {i.giftCard!.id ? (
                        <Link href={`/admin/gift-cards/${i.giftCard!.id}`} className="mt-1 inline-block font-mono text-brand-800 hover:underline">
                          {i.giftCard!.code}
                        </Link>
                      ) : (
                        <span className="mt-1 block text-xs text-zinc-500">The card is issued when the payment is confirmed.</span>
                      )}
                    </li>
                  ))}
              </ul>
            </Panel>
          ) : (
          <Panel title="Shipping address">
            <address className="text-sm not-italic leading-6 text-zinc-700">
              <span className="font-medium text-zinc-900">{order.shippingAddress.fullName}</span>
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 && (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              )}
              {order.shippingAddress.landmark && (
                <>
                  <br />
                  Near {order.shippingAddress.landmark}
                </>
              )}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
              <br />
              {order.shippingAddress.country}
              <br />
              <span className="text-zinc-500">Phone: {order.shippingAddress.phone}</span>
            </address>
          </Panel>
          )}

          <Panel title="Customer notes">
            {order.notes ? (
              <p className="whitespace-pre-line text-sm text-zinc-700">{order.notes}</p>
            ) : (
              <p className="text-sm text-zinc-500">No notes.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function ItemsPanel({ order }: { order: AdminOrder }) {
  return (
    <Panel title={`Items (${formatInt(order.items.reduce((s, i) => s + i.quantity, 0))})`} flush>
      <ul className="divide-y divide-zinc-100">
        {order.items.map((item) => {
          const variant = variantLabel(item.size, item.color);
          return (
            <li key={item.id} className="flex gap-3 px-4 py-3 sm:px-5">
              <ProductImg src={item.imageUrl} alt={item.productName} className="size-14 shrink-0 rounded-lg border border-zinc-100" />
              <div className="min-w-0 flex-1">
                {item.productId ? (
                  <Link href={`/admin/products/${item.productId}`} className="text-sm font-medium text-zinc-900 hover:underline">
                    {item.productName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-zinc-900">{item.productName}</p>
                )}
                <p className="mt-0.5 text-xs text-zinc-500">{[variant, `SKU ${item.sku}`].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-xs tabular-nums text-zinc-600">
                  {formatPrice(item.unitPrice)} × {formatInt(item.quantity)}
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums text-zinc-900">{formatPrice(item.lineTotal)}</p>
            </li>
          );
        })}
      </ul>
      <dl className="space-y-1.5 border-t border-zinc-200 px-4 py-4 text-sm sm:px-5">
        <div className="flex justify-between">
          <dt className="text-zinc-600">Subtotal</dt>
          <dd className="tabular-nums text-zinc-900">{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-600">Shipping</dt>
          <dd className="tabular-nums text-zinc-900">{order.shippingFee ? formatPrice(order.shippingFee) : "Free"}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="min-w-0 text-zinc-600">
              Discount
              {(order.discountCode || order.discountTitle) && (
                <span className="ml-1 break-all text-zinc-500">
                  ({order.discountCode ? <span className="font-mono">{order.discountCode}</span> : `${order.discountTitle}, automatic`})
                </span>
              )}
            </dt>
            <dd className="shrink-0 tabular-nums text-zinc-900">−{formatPrice(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold">
          <dt className="text-zinc-900">Total</dt>
          <dd className="tabular-nums text-zinc-900">{formatPrice(order.total)}</dd>
        </div>
        {order.giftCardAmount > 0 && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="min-w-0 text-zinc-600">
                Gift card
                {order.giftCard?.id && (
                  <Link href={`/admin/gift-cards/${order.giftCard.id}`} className="ml-1 font-mono text-zinc-500 underline-offset-2 hover:underline">
                    {order.giftCard.code}
                  </Link>
                )}
              </dt>
              <dd className="shrink-0 tabular-nums text-zinc-900">−{formatPrice(order.giftCardAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt className="text-zinc-900">Paid online</dt>
              <dd className="tabular-nums text-zinc-900">{formatPrice(order.amountDue)}</dd>
            </div>
          </>
        )}
      </dl>
    </Panel>
  );
}

function PaymentsPanel({ order }: { order: AdminOrder }) {
  const payments = order.payments ?? [];
  return (
    <Panel title="Payments" description={payments.length ? plural(payments.length, "attempt") : undefined} flush>
      {payments.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500 sm:px-5">No payment attempts yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {payments.map((p, i) => (
            <li key={`${p.gatewayOrderId}-${i}`} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">
                    <GatewayLabel gateway={p.gateway} />
                  </span>
                  <Badge className={PAYMENT_ROW_TONE[p.status] ?? undefined}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </Badge>
                </div>
                <span className="text-sm font-medium tabular-nums text-zinc-900">{formatPrice(p.amount)}</span>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="inline text-zinc-500">Gateway order: </dt>
                  <dd className="inline break-all font-mono text-zinc-700">{p.gatewayOrderId}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="inline text-zinc-500">Payment ID: </dt>
                  <dd className="inline break-all font-mono text-zinc-700">{p.gatewayPaymentId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-zinc-500">Created: </dt>
                  <dd className="inline text-zinc-700">{formatDate(p.createdAt, true)}</dd>
                </div>
                {p.methodDetails && (
                  <div className="min-w-0">
                    <dt className="inline text-zinc-500">Paid with: </dt>
                    <dd className="inline text-zinc-700">{paymentMethodLabel(p.methodDetails)}</dd>
                  </div>
                )}
              </dl>
              {p.error && <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{p.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

type ModalKind = "status" | "shipment" | "shiprocket" | "refund" | null;

function FulfilmentPanel({
  order,
  apiPath,
  onUpdated,
}: {
  order: AdminOrder;
  apiPath: string;
  onUpdated: (order: Order) => void;
}) {
  const toast = useToast();
  const [modal, setModal] = useState<ModalKind>(null);
  const [targetStatus, setTargetStatus] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const next = NEXT_STATUSES[order.status] ?? [];
  const advance = next.filter((s) => s !== "cancelled");
  const canCancel = next.includes("cancelled");
  const canShip = ["confirmed", "processing", "shipped"].includes(order.status);
  const canShiprocket = ["confirmed", "processing"].includes(order.status);
  // Orders paid fully by gift card are refunded to the card on cancellation.
  const canRefund = order.status === "cancelled" && order.paymentStatus === "paid" && order.amountDue > 0;
  const shipment = order.shipment;

  const openStatus = (s: OrderStatus) => {
    setTargetStatus(s);
    setNote("");
    setModal("status");
  };
  const close = () => {
    if (!saving) setModal(null);
  };

  const submitStatus = async () => {
    if (!targetStatus) return;
    setSaving(true);
    try {
      const updated = await api<Order>(`${apiPath}/status`, {
        method: "PATCH",
        body: { status: targetStatus, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast.success(`Order marked ${ORDER_STATUS_LABELS[targetStatus].toLowerCase()}`);
      setModal(null);
      onUpdated(updated);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitRefund = async () => {
    setSaving(true);
    try {
      const updated = await api<Order>(`${apiPath}/payment`, { method: "PATCH", body: { paymentStatus: "refunded" } });
      toast.success("Payment marked as refunded");
      setModal(null);
      onUpdated(updated);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const isPaid = order.paymentStatus === "paid";
  const statusDescription: Partial<Record<OrderStatus, React.ReactNode>> = {
    processing: "Use this once you start packing the order.",
    shipped: "The customer will get a shipping email. To include courier and AWB details, use “Add shipment” instead.",
    delivered: "The customer will get a delivery confirmation email.",
    cancelled: (
      <div className="space-y-2">
        <p>This releases the reserved stock and emails the customer. It can&apos;t be undone.</p>
        {order.giftCardAmount > 0 && (
          <p className="rounded-md bg-zinc-50 px-2.5 py-2 text-zinc-700">
            The {formatPrice(order.giftCardAmount)} paid by gift card goes back on the card automatically.
          </p>
        )}
        {isPaid && order.amountDue > 0 && (
          <p className="rounded-md bg-amber-50 px-2.5 py-2 text-amber-900">
            This order is paid. Refund {formatPrice(order.amountDue)} in the{" "}
            {order.paymentGateway ? GATEWAY_LABELS[order.paymentGateway] : "payment gateway"} dashboard, then use “Mark refunded” here.
          </p>
        )}
      </div>
    ),
  };

  return (
    <Panel title="Fulfilment">
      <div className="space-y-4">
        {shipment ? (
          <DescriptionList
            items={[
              { label: "Provider", value: shipment.provider === "shiprocket" ? "Shiprocket" : "Manual" },
              { label: "Courier", value: shipment.courier || "—" },
              { label: "AWB", value: shipment.awb ? <span className="font-mono">{shipment.awb}</span> : "—" },
              {
                label: "Tracking",
                value: shipment.trackingUrl ? (
                  <a
                    href={shipment.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-zinc-900 underline-offset-2 hover:underline"
                  >
                    Open tracking <IconExternal className="size-3.5" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  "—"
                ),
              },
              { label: "Shipped", value: formatDate(shipment.shippedAt, true) },
              { label: "Delivered", value: formatDate(shipment.deliveredAt, true) },
            ]}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            {order.status === "pending"
              ? "Waiting for payment. Unpaid orders are cancelled automatically when they expire."
              : order.status === "cancelled"
                ? `Cancelled ${formatDate(order.cancelledAt, true)}.`
                : "Not shipped yet."}
          </p>
        )}

        {(advance.length > 0 || canShip || canShiprocket || canCancel || canRefund) && (
          <div className="flex flex-col gap-2">
            {canShip && (
              <Button onClick={() => setModal("shipment")}>{shipment?.awb ? "Update shipment" : "Add shipment"}</Button>
            )}
            {canShiprocket && (
              <Button variant="outline" onClick={() => setModal("shiprocket")}>
                Ship with Shiprocket
              </Button>
            )}
            {advance.map((s) => (
              <Button key={s} variant={canShip ? "outline" : "primary"} onClick={() => openStatus(s)}>
                {STATUS_ACTION_LABEL[s] ?? ORDER_STATUS_LABELS[s]}
              </Button>
            ))}
            {canRefund && (
              <Button variant="outline" onClick={() => setModal("refund")}>
                Mark refunded
              </Button>
            )}
            {canCancel && (
              <DangerTextButton onClick={() => openStatus("cancelled")}>Cancel order</DangerTextButton>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={modal === "status" && targetStatus !== null}
        title={targetStatus ? `${STATUS_ACTION_LABEL[targetStatus] ?? "Update status"}?` : "Update status"}
        description={targetStatus ? statusDescription[targetStatus] : null}
        confirmLabel={targetStatus === "cancelled" ? "Cancel order" : "Update status"}
        cancelLabel={targetStatus === "cancelled" ? "Keep order" : "Cancel"}
        tone={targetStatus === "cancelled" ? "danger" : "primary"}
        loading={saving}
        onConfirm={submitStatus}
        onClose={close}
      >
        <Field
          label={targetStatus === "cancelled" ? "Reason (optional, included in the email)" : "Note (optional)"}
          htmlFor="status-note"
        >
          <Textarea id="status-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={modal === "refund"}
        title="Mark payment as refunded?"
        description={
          <p>
            This only updates the record here. Make sure you&apos;ve already refunded{" "}
            <span className="font-medium text-zinc-900">{formatPrice(order.amountDue)}</span> in the{" "}
            {order.paymentGateway ? GATEWAY_LABELS[order.paymentGateway] : "payment gateway"} dashboard.
            {order.giftCardAmount > 0 && ` The ${formatPrice(order.giftCardAmount)} paid by gift card went back on the card when the order was cancelled.`}
          </p>
        }
        confirmLabel="Mark refunded"
        loading={saving}
        onConfirm={submitRefund}
        onClose={close}
      />

      {modal === "shipment" && (
        <ShipmentModal
          order={order}
          apiPath={apiPath}
          onClose={() => setModal(null)}
          onSaved={(o) => {
            setModal(null);
            onUpdated(o);
          }}
        />
      )}
      {modal === "shiprocket" && (
        <ShiprocketModal
          apiPath={apiPath}
          onClose={() => setModal(null)}
          onSaved={(o) => {
            setModal(null);
            onUpdated(o);
          }}
        />
      )}
    </Panel>
  );
}

function ShipmentModal({
  order,
  apiPath,
  onClose,
  onSaved,
}: {
  order: AdminOrder;
  apiPath: string;
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const toast = useToast();
  const [courier, setCourier] = useState(order.shipment?.courier ?? "");
  const [awb, setAwb] = useState(order.shipment?.awb ?? "");
  const [trackingUrl, setTrackingUrl] = useState(order.shipment?.trackingUrl ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: FieldErrors = {};
    if (!courier.trim()) local.courier = "Enter the courier name";
    if (!awb.trim()) local.awb = "Enter the AWB / tracking number";
    if (trackingUrl.trim() && !/^https?:\/\//i.test(trackingUrl.trim())) local.trackingUrl = "Use a full URL starting with https://";
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      const updated = await api<Order>(`${apiPath}/shipment`, {
        method: "POST",
        body: { courier: courier.trim(), awb: awb.trim(), ...(trackingUrl.trim() ? { trackingUrl: trackingUrl.trim() } : {}) },
      });
      toast.success(order.status === "shipped" ? "Shipment updated" : "Shipment added and order marked shipped");
      onSaved(updated);
    } catch (err) {
      const fields = validationErrors(err);
      if (fields) setErrors(fields);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={order.status === "shipped" ? "Update shipment" : "Add shipment"}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="shipment-form" loading={saving}>
            {order.status === "shipped" ? "Save" : "Save and mark shipped"}
          </Button>
        </>
      }
    >
      <form id="shipment-form" onSubmit={submit} className="space-y-4" noValidate>
        {order.status !== "shipped" && (
          <p className="text-sm text-zinc-600">The order moves to “Shipped” and the customer gets an email with these details.</p>
        )}
        <Field label="Courier" htmlFor="ship-courier" error={errors.courier}>
          <Input
            id="ship-courier"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            placeholder="e.g. Delhivery, Blue Dart"
            aria-invalid={Boolean(errors.courier) || undefined}
            autoFocus
            required
          />
        </Field>
        <Field label="AWB / tracking number" htmlFor="ship-awb" error={errors.awb}>
          <Input
            id="ship-awb"
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
            aria-invalid={Boolean(errors.awb) || undefined}
            className="font-mono"
            required
          />
        </Field>
        <Field label="Tracking URL (optional)" htmlFor="ship-url" error={errors.trackingUrl}>
          <Input
            id="ship-url"
            type="url"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://"
            aria-invalid={Boolean(errors.trackingUrl) || undefined}
          />
        </Field>
      </form>
    </Modal>
  );
}

function ShiprocketModal({
  apiPath,
  onClose,
  onSaved,
}: {
  apiPath: string;
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const toast = useToast();
  const [dims, setDims] = useState({ weight: "", length: "", breadth: "", height: "" });
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) {
      const n = Number.parseFloat(v);
      if (v.trim() && Number.isFinite(n) && n > 0) body[k] = n;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Order>(`${apiPath}/shiprocket`, { method: "POST", body });
      toast.success("Shiprocket shipment created");
      onSaved(updated);
    } catch (err) {
      setError(err);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof dims, label: string, unit: string) => (
    <Field label={`${label} (${unit})`} htmlFor={`sr-${key}`}>
      <Input
        id={`sr-${key}`}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={dims[key]}
        onChange={(e) => setDims((d) => ({ ...d, [key]: e.target.value }))}
        placeholder="Default"
      />
    </Field>
  );

  return (
    <Modal
      open
      onClose={close}
      title="Ship with Shiprocket"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="shiprocket-form" loading={saving}>
            Create shipment
          </Button>
        </>
      }
    >
      <form id="shiprocket-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-zinc-600">
          Creates the order in Shiprocket and assigns an AWB. Leave the package details empty to use the store defaults.
        </p>
        {error ? (
          <InlineAlert
            title={
              error instanceof ApiError && error.code === "GATEWAY_ERROR"
                ? "Shiprocket rejected the request"
                : "Couldn't create the Shiprocket shipment"
            }
          >
            <p>{errorMessage(error)}</p>
            {error instanceof ApiError && (
              <p className="mt-1 font-mono text-xs opacity-80">
                {error.status} {error.code}
              </p>
            )}
          </InlineAlert>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {field("weight", "Weight", "kg")}
          {field("length", "Length", "cm")}
          {field("breadth", "Breadth", "cm")}
          {field("height", "Height", "cm")}
        </div>
      </form>
    </Modal>
  );
}
