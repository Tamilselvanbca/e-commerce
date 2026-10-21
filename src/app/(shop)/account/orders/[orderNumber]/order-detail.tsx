"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn, courierStatusLabel, formatCourierDate, formatDate, formatPrice, GATEWAY_LABELS, paymentMethodLabel } from "@/lib/format";
import type { OnlineGateway, Order, PaymentInit, Shipment, TrackingEvent } from "@/lib/types";
import { useStoreConfig, useToast } from "@/components/providers";
import { Button, ButtonLink, Card, EmptyState, Modal } from "@/components/ui";
import { AddressLines } from "@/components/shop/address-form";
import { ChevronLeftIcon, ClockIcon, ExternalIcon, TruckIcon } from "@/components/shop/icons";
import {
  GATEWAY_OPTIONS,
  GiftCardRecipients,
  LineItems,
  orderItemLine,
  OrderStatusBadge,
  PaymentStatusBadge,
  Totals,
} from "@/components/shop/order-bits";
import { OrderProgress, StatusTimeline, TrackingEvents } from "@/components/shop/order-progress";
import { Notice } from "@/components/shop/section";
import { useApi } from "@/components/shop/use-api";
import { usePaymentFlow } from "@/components/shop/use-payment";

type Tracking = { shipment: Shipment | null; orderStatus: Order["status"]; events: TrackingEvent[] };

export function OrderDetail({ orderNumber }: { orderNumber: string }) {
  const path = `/orders/${encodeURIComponent(orderNumber)}`;
  const { data: order, error, loading, notFound, reload, mutate } = useApi<Order>(path);
  const tracking = useApi<Tracking>(order?.shipment ? `${path}/tracking` : null);
  // Reading the courier's scans can move the order on (shipped, delivered).
  const moved = tracking.data && order && tracking.data.orderStatus !== order.status ? tracking.data.orderStatus : null;
  const shown = order && moved ? { ...order, status: moved } : order;

  if (loading && !order) return <DetailSkeleton />;

  if (!shown) {
    return (
      <EmptyState
        title={notFound ? "Order not found" : "We couldn't load this order"}
        description={notFound ? "Check the order number or find it in your order history." : error ? errorMessage(error) : undefined}
        action={
          notFound ? (
            <ButtonLink href="/account/orders">View my orders</ButtonLink>
          ) : (
            <Button variant="outline" onClick={reload}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  return <OrderView order={shown} onChange={(o) => mutate(o)} reload={reload} tracking={tracking.data ?? null} trackingLoading={tracking.loading} />;
}

function OrderView({
  order,
  onChange,
  reload,
  tracking,
  trackingLoading,
}: {
  order: Order;
  onChange: (order: Order) => void;
  reload: () => void;
  tracking: Tracking | null;
  trackingLoading: boolean;
}) {
  const config = useStoreConfig();
  const toast = useToast();
  const { startPayment, paymentUi, processing } = usePaymentFlow({ onIncomplete: () => reload() });

  const enabled = (["razorpay", "stripe", "mock"] as OnlineGateway[]).filter((g) => config.gateways[g]?.enabled);
  const [payOpen, setPayOpen] = useState(false);
  const [gateway, setGateway] = useState<OnlineGateway | null>(null);
  const [paying, setPaying] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const chosen: OnlineGateway | null = gateway ?? enabled.find((g) => g === order.paymentGateway) ?? enabled[0] ?? null;

  async function pay() {
    if (!chosen) return;
    setPaying(true);
    try {
      const res = await api<{ order: Order; payment: PaymentInit }>(`/orders/${encodeURIComponent(order.orderNumber)}/pay`, {
        method: "POST",
        body: { gateway: chosen },
      });
      onChange(res.order);
      setPayOpen(false);
      await startPayment(res.order, res.payment);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ORDER_NOT_PAYABLE") {
        toast.error("This order can no longer be paid. It may have expired or already been paid.");
        setPayOpen(false);
        reload();
      } else {
        toast.error(err);
      }
    } finally {
      setPaying(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      const res = await api<{ order: Order }>(`/orders/${encodeURIComponent(order.orderNumber)}/cancel`, { method: "POST" });
      onChange(res.order);
      setCancelOpen(false);
      toast.success("Order cancelled");
    } catch (err) {
      toast.error(err);
    } finally {
      setCancelling(false);
    }
  }

  const shipment = tracking?.shipment ?? order.shipment;
  const events = tracking?.events ?? [];

  return (
    <div className="space-y-6">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
        <ChevronLeftIcon className="size-4" />
        All orders
      </Link>

      {/* Header */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-lg font-semibold text-zinc-900">{order.orderNumber}</h2>
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Placed on {formatDate(order.createdAt, true)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          {(order.canPay || order.canCancel) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {order.canCancel && (
                <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={processing}>
                  Cancel order
                </Button>
              )}
              {order.canPay && (
                <Button onClick={() => setPayOpen(true)} disabled={enabled.length === 0 || processing} loading={processing}>
                  Pay now
                </Button>
              )}
            </div>
          )}
        </div>

        {order.canPay && (
          <Notice tone="warning" className="mt-5">
            <span className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {order.paymentStatus === "failed" ? "Your last payment attempt failed. " : "This order is awaiting payment. "}
                {order.expiresAt ? `Complete the payment by ${formatDate(order.expiresAt, true)} to confirm it.` : "Complete the payment to confirm it."}
              </span>
            </span>
          </Notice>
        )}

        {order.kind === "goods" && (
          <div className="mt-6">
            <OrderProgress order={order} />
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {/* Items */}
          <Card className="p-5 sm:p-6">
            <h3 className="mb-5 text-base font-semibold text-zinc-900">Items</h3>
            {order.status === "delivered" && order.items.some((i) => i.productSlug) && (
              <p className="-mt-3 mb-4 text-sm text-zinc-600">Delivered! How was it? Your review helps other customers.</p>
            )}
            <LineItems
              items={order.items.map((item) => ({
                ...orderItemLine(item),
                // After delivery: review each product (its review form is on the product page).
                action:
                  order.status === "delivered" && item.productSlug ? (
                    <Link
                      href={`/products/${encodeURIComponent(item.productSlug)}#reviews`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline-offset-4 hover:underline"
                    >
                      ★ Write a review
                    </Link>
                  ) : undefined,
              }))}
              currency={order.currency}
            />
            <div className="mt-5 border-t border-zinc-200 pt-5">
              <Totals
                hideShipping={order.kind === "gift_card"}
                subtotal={order.subtotal}
                shippingFee={order.shippingFee}
                discount={order.discount}
                discountLabel={order.discountCode ?? order.discountTitle}
                total={order.total}
                giftCardAmount={order.giftCardAmount}
                amountDue={order.amountDue}
                currency={order.currency}
                totalLabel={order.paymentStatus === "paid" && !order.giftCardAmount ? "Total paid" : "Total"}
              />
            </div>
          </Card>

          {/* Shipment */}
          {shipment && (
            <Card className="p-5 sm:p-6">
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <TruckIcon className="size-5" />
                Shipment
              </h3>
              {(shipment.trackingStatus || (!shipment.shippedAt && !shipment.deliveredAt)) && (
                <p className="mt-3 inline-flex rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-800 ring-1 ring-inset ring-violet-200">
                  {shipment.deliveredAt
                    ? "Delivered"
                    : shipment.trackingStatus
                      ? courierStatusLabel(shipment.trackingStatus)
                      : "Packed, waiting for the courier to collect it"}
                </p>
              )}
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-zinc-500">Courier</dt>
                  <dd className="mt-0.5 font-medium text-zinc-900">{shipment.courier ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Tracking number (AWB)</dt>
                  <dd className="mt-0.5 break-all font-mono font-medium text-zinc-900">{shipment.awb ?? "—"}</dd>
                </div>
                {shipment.deliveredAt ? (
                  <div>
                    <dt className="text-zinc-500">Delivered</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">{formatDate(shipment.deliveredAt)}</dd>
                  </div>
                ) : shipment.expectedDelivery ? (
                  <div>
                    <dt className="text-zinc-500">Expected delivery</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">{formatCourierDate(shipment.expectedDelivery)}</dd>
                  </div>
                ) : (
                  <div>
                    <dt className="text-zinc-500">Shipped</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900">{shipment.shippedAt ? formatDate(shipment.shippedAt) : "Not yet"}</dd>
                  </div>
                )}
              </dl>
              {shipment.trackingUrl && (
                <a
                  href={shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 underline underline-offset-4"
                >
                  Track on courier website
                  <ExternalIcon className="size-4" />
                </a>
              )}
              {trackingLoading && events.length === 0 ? (
                <div className="mt-6 h-16 animate-pulse rounded-lg bg-zinc-100" />
              ) : events.length > 0 ? (
                <div className="mt-6 border-t border-zinc-200 pt-5">
                  <h4 className="mb-4 text-sm font-semibold text-zinc-900">Tracking updates</h4>
                  <TrackingEvents events={events} />
                </div>
              ) : null}
            </Card>
          )}

          {/* Timeline */}
          <Card className="p-5 sm:p-6">
            <h3 className="mb-5 text-base font-semibold text-zinc-900">Order history</h3>
            <StatusTimeline history={order.statusHistory} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            {order.shippingAddress ? (
              <>
                <h3 className="text-base font-semibold text-zinc-900">Shipping address</h3>
                <AddressLines address={order.shippingAddress} className="mt-3 not-italic text-sm leading-6 text-zinc-600" />
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-zinc-900">Gift card for</h3>
                <GiftCardRecipients order={order} className="mt-3" />
              </>
            )}
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="text-base font-semibold text-zinc-900">Payment</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Status</dt>
                <dd>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </dd>
              </div>
              {order.paymentMethod ? (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-zinc-500">Paid with</dt>
                  <dd className="text-right text-zinc-900">
                    {paymentMethodLabel(order.paymentMethod)}
                    {order.paymentGateway && (
                      <span className="block text-xs text-zinc-500">via {GATEWAY_LABELS[order.paymentGateway] ?? order.paymentGateway}</span>
                    )}
                  </dd>
                </div>
              ) : (
                order.paymentGateway && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-zinc-500">Method</dt>
                    <dd className="text-right text-zinc-900">{GATEWAY_LABELS[order.paymentGateway] ?? order.paymentGateway}</dd>
                  </div>
                )
              )}
              {order.giftCard && order.giftCardAmount > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Gift card</dt>
                  <dd className="text-right text-zinc-900">
                    <span className="font-mono">{order.giftCard.code}</span> · {formatPrice(order.giftCardAmount, order.currency)}
                  </dd>
                </div>
              )}
              {order.paidAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Paid on</dt>
                  <dd className="text-right text-zinc-900">{formatDate(order.paidAt, true)}</dd>
                </div>
              )}
            </dl>
          </Card>
          {(order.email || order.phone || order.notes) && (
            <Card className="p-5 sm:p-6">
              <h3 className="text-base font-semibold text-zinc-900">Contact & notes</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {order.email && (
                  <div>
                    <dt className="text-zinc-500">Email</dt>
                    <dd className="break-all text-zinc-900">{order.email}</dd>
                  </div>
                )}
                {order.phone && (
                  <div>
                    <dt className="text-zinc-500">Phone</dt>
                    <dd className="text-zinc-900">{order.phone}</dd>
                  </div>
                )}
                {order.notes && (
                  <div>
                    <dt className="text-zinc-500">Notes</dt>
                    <dd className="whitespace-pre-line text-zinc-900">{order.notes}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}
        </div>
      </div>

      {/* Pay now */}
      <Modal
        open={payOpen}
        onClose={() => (paying ? undefined : setPayOpen(false))}
        title="Choose a payment method"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayOpen(false)} disabled={paying}>
              Not now
            </Button>
            <Button onClick={pay} loading={paying} disabled={!chosen}>
              Continue to pay
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="sr-only">Payment method</legend>
          <div className="space-y-3">
            {enabled.map((g) => {
              const checked = chosen === g;
              return (
                <label
                  key={g}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-zinc-900",
                    checked ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-zinc-200 hover:border-zinc-400",
                  )}
                >
                  <input
                    type="radio"
                    name="pay-gateway"
                    value={g}
                    checked={checked}
                    onChange={() => setGateway(g)}
                    className="mt-1 size-4 shrink-0 accent-brand-700"
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-900">{GATEWAY_OPTIONS[g].title}</span>
                    <span className="mt-0.5 block text-sm text-zinc-600">{GATEWAY_OPTIONS[g].description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Modal>

      {/* Cancel */}
      <Modal
        open={cancelOpen}
        onClose={() => (cancelling ? undefined : setCancelOpen(false))}
        title="Cancel this order?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep order
            </Button>
            <Button variant="danger" onClick={cancel} loading={cancelling}>
              Cancel order
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600">
          Order <span className="font-mono font-medium text-zinc-900">{order.orderNumber}</span> will be cancelled and the
          items released. This can&apos;t be undone.
        </p>
      </Modal>

      {paymentUi}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading order">
      <div className="h-4 w-24 rounded bg-zinc-100" />
      <div className="h-44 rounded-xl bg-zinc-100" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-72 rounded-xl bg-zinc-100" />
        <div className="h-48 rounded-xl bg-zinc-100" />
      </div>
    </div>
  );
}
