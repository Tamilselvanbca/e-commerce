"use client";

import { useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import type { Order } from "@/lib/types";
import { useCart } from "@/components/providers";
import { ButtonLink, Card, EmptyState, Spinner } from "@/components/ui";
import { AddressLines } from "@/components/shop/address-form";
import { AlertIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from "@/components/shop/icons";
import { LineItems, orderItemLine, Totals } from "@/components/shop/order-bits";
import { orderHref } from "@/components/shop/use-payment";
import { loginHref } from "@/components/shop/utils";

const POLL_MS = 3000;
const MAX_POLLS = 10;

export function SuccessView({ orderNumber, sessionId }: { orderNumber: string | null; sessionId: string | null }) {
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [polls, setPolls] = useState(0);

  // Initial load: verify the Stripe session when present, otherwise fetch the order.
  useEffect(() => {
    if (!orderNumber && !sessionId) return;
    let cancelled = false;
    const fetchOrder = () => api<Order>(`/orders/${encodeURIComponent(orderNumber!)}`);
    const load = sessionId
      ? api<{ order: Order }>("/payments/stripe/verify", { method: "POST", body: { sessionId } })
          .then((r) => r.order)
          .catch((err: unknown) => (orderNumber ? fetchOrder() : Promise.reject(err)))
      : fetchOrder();
    load.then(
      (o) => {
        if (cancelled) return;
        setOrder(o);
        void refreshCart();
      },
      (err: unknown) => {
        if (!cancelled) setError(err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [orderNumber, sessionId, refreshCart]);

  // Poll while the payment is still being confirmed (webhooks can lag a few seconds).
  const awaiting = order !== null && order.status === "pending" && order.paymentStatus === "pending";
  const pollNumber = awaiting ? order.orderNumber : null;
  useEffect(() => {
    if (!pollNumber || polls >= MAX_POLLS) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<Order>(`/orders/${encodeURIComponent(pollNumber)}`).then(
        (o) => {
          if (cancelled) return;
          setOrder(o);
          setPolls((n) => n + 1);
          if (o.paymentStatus === "paid") void refreshCart();
        },
        () => {
          if (!cancelled) setPolls((n) => n + 1);
        },
      );
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pollNumber, polls, refreshCart]);

  if (!orderNumber && !sessionId) {
    return (
      <EmptyState
        title="No order to show"
        description="Find all your orders in your account."
        action={<ButtonLink href="/account/orders">View my orders</ButtonLink>}
      />
    );
  }

  if (error) {
    const unauthorized = error instanceof ApiError && error.status === 401;
    const here = `/checkout/success?order=${encodeURIComponent(orderNumber ?? "")}`;
    return (
      <EmptyState
        icon={<AlertIcon className="size-10" />}
        title={unauthorized ? "Log in to view your order" : "We couldn't load your order"}
        description={
          unauthorized
            ? "Your payment is safe. Log in with the same mobile number to see your order."
            : `${errorMessage(error)}. If you completed the payment, your order will appear in your account shortly.`
        }
        action={
          <ButtonLink href={unauthorized ? loginHref(here) : "/account/orders"}>
            {unauthorized ? "Log in" : "View my orders"}
          </ButtonLink>
        }
      />
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center" role="status">
        <Spinner className="size-7 text-zinc-900" />
        <p className="text-sm font-medium text-zinc-900">Confirming your order…</p>
      </div>
    );
  }

  const paid = order.paymentStatus === "paid";
  const failed = order.paymentStatus === "failed" && order.status === "pending";
  const cancelled = order.status === "cancelled";
  const stillWaiting = awaiting && polls >= MAX_POLLS;

  let header: { icon: React.ReactNode; title: string; text: React.ReactNode; tone: string };
  if (paid) {
    header = {
      icon: <CheckCircleIcon className="size-12" />,
      tone: "text-emerald-600",
      title: "Thank you! Your order is confirmed.",
      text: order.email ? (
        <>
          We&apos;ve sent a confirmation to <span className="font-medium text-zinc-900">{order.email}</span>.
        </>
      ) : (
        "We'll notify you when it ships."
      ),
    };
  } else if (cancelled) {
    header = {
      icon: <XCircleIcon className="size-12" />,
      tone: "text-zinc-500",
      title: "This order was cancelled",
      text: "No payment was taken for this order. You can place a new order any time.",
    };
  } else if (failed) {
    header = {
      icon: <XCircleIcon className="size-12" />,
      tone: "text-red-600",
      title: "Payment failed",
      text: "Your order is saved. You can retry the payment from your order page before it expires.",
    };
  } else if (stillWaiting) {
    header = {
      icon: <ClockIcon className="size-12" />,
      tone: "text-amber-600",
      title: "Still waiting for payment confirmation",
      text: "This can take a few minutes. If money was deducted, your order will be confirmed automatically. Check your order page for updates.",
    };
  } else {
    header = {
      icon: <Spinner className="size-11" />,
      tone: "text-zinc-900",
      title: "Payment is being confirmed",
      text: "Please don't close this page. This usually takes a few seconds.",
    };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center" aria-live="polite">
        <div className={`mx-auto flex justify-center ${header.tone}`}>{header.icon}</div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{header.title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-600">{header.text}</p>
        <p className="mt-4 text-sm text-zinc-600">
          Order <span className="font-mono font-medium text-zinc-900">{order.orderNumber}</span> · {formatDate(order.createdAt, true)}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={orderHref(order.orderNumber)} variant={paid || failed ? "primary" : "outline"}>
            {failed ? "Retry payment" : "View order"}
          </ButtonLink>
          <ButtonLink href="/products" variant={paid ? "outline" : "ghost"}>
            Continue shopping
          </ButtonLink>
        </div>
      </div>

      <Card className="mt-10 overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Delivering to</h2>
            <AddressLines address={order.shippingAddress} className="mt-2 not-italic text-sm leading-6 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Total</h2>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatPrice(order.total, order.currency)}</p>
            <p className="text-sm text-zinc-600">
              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
            </p>
          </div>
        </div>
        <div className="border-t border-zinc-200 p-5 sm:p-6">
          <LineItems items={order.items.map(orderItemLine)} currency={order.currency} />
          <div className="mt-5 border-t border-zinc-200 pt-5">
            <Totals
              subtotal={order.subtotal}
              shippingFee={order.shippingFee}
              discount={order.discount}
              discountLabel={order.discountCode ?? order.discountTitle}
              total={order.total}
              giftCardAmount={order.giftCardAmount}
              amountDue={order.amountDue}
              currency={order.currency}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
