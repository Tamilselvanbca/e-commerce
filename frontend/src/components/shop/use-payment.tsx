"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { Order, PaymentInit } from "@/lib/types";
import { useCart, useToast } from "@/components/providers";
import { Button, Modal, Spinner } from "@/components/ui";
import { loadRazorpay, loadRazorpayLogo } from "./load-razorpay";

type MockInit = Extract<PaymentInit, { gateway: "mock" }>;

export function orderHref(orderNumber: string) {
  return `/account/orders/${encodeURIComponent(orderNumber)}`;
}

export function successHref(orderNumber: string) {
  return `/checkout/success?order=${encodeURIComponent(orderNumber)}`;
}

/**
 * Runs `onRestore` when the page comes back from the browser's back/forward
 * cache (e.g. the customer pressed Back on the Stripe page), so "processing"
 * UI doesn't stay stuck.
 */
export function usePageRestore(onRestore: () => void) {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) onRestore();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [onRestore]);
}

/**
 * Shared handling of a `PaymentInit` returned by `POST /checkout` and
 * `POST /orders/:orderNumber/pay`.
 *
 * - razorpay: opens Razorpay Checkout, verifies the signature server side.
 * - stripe: redirects to the hosted Checkout page.
 * - mock: shows a dialog to simulate success / failure (development only).
 *
 * Render `paymentUi` somewhere in the calling component.
 */
export function usePaymentFlow(options: { onIncomplete?: (order: Order) => void } = {}) {
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const [mock, setMock] = useState<{ order: Order; payment: MockInit } | null>(null);
  const [mockBusy, setMockBusy] = useState<"success" | "failure" | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const clearProcessing = useCallback(() => setProcessing(null), []);
  usePageRestore(clearProcessing);

  function incomplete(order: Order) {
    if (options.onIncomplete) options.onIncomplete(order);
    else router.push(orderHref(order.orderNumber));
  }

  async function succeeded(order: Order) {
    setProcessing("Payment received. Taking you to your order…");
    await cart.refresh();
    router.replace(successHref(order.orderNumber));
  }

  async function openRazorpay(order: Order, payment: Extract<PaymentInit, { gateway: "razorpay" }>) {
    const [Razorpay, image] = await Promise.all([loadRazorpay(), loadRazorpayLogo()]);
    let handled = false;
    const rzp = new Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      image,
      prefill: {
        name: payment.prefill.name ?? undefined,
        email: payment.prefill.email ?? undefined,
        contact: payment.prefill.contact,
      },
      theme: { color: "#c2410c" },
      // Show UPI (QR on desktop, UPI apps on mobile, UPI ID) first; other methods follow.
      config: {
        display: {
          blocks: { upi: { name: "Pay using UPI", instruments: [{ method: "upi" }] } },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: true },
        },
      },
      handler: async (response) => {
        handled = true;
        setProcessing("Confirming your payment…");
        try {
          const { order: paid } = await api<{ order: Order }>("/payments/razorpay/verify", {
            method: "POST",
            body: {
              orderNumber: order.orderNumber,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            },
          });
          await succeeded(paid);
        } catch (err) {
          setProcessing(null);
          toast.error(`We couldn't confirm your payment: ${errorMessage(err)}. If money was deducted, it will reflect on your order shortly.`);
          incomplete(order);
        }
      },
      modal: {
        ondismiss: () => {
          if (handled) return;
          toast.info("Payment not completed. You can retry from your order page.");
          incomplete(order);
        },
      },
    });
    rzp.on("payment.failed", (response) => {
      // Razorpay keeps its dialog open so the customer can retry; just record the failure.
      api("/payments/razorpay/failed", {
        method: "POST",
        body: {
          orderNumber: order.orderNumber,
          razorpayOrderId: payment.razorpayOrderId,
          error: {
            code: response.error?.code,
            description: response.error?.description,
            reason: response.error?.reason,
          },
        },
      }).catch(() => {});
    });
    rzp.open();
  }

  /** Starts the payment for `order`. Rejects only if the gateway could not be opened. */
  async function startPayment(order: Order, payment: PaymentInit) {
    switch (payment.gateway) {
      case "stripe":
        setProcessing("Redirecting to secure payment…");
        window.location.assign(payment.checkoutUrl);
        return;
      case "mock":
        setMock({ order, payment });
        return;
      case "razorpay":
        await openRazorpay(order, payment);
        return;
    }
  }

  async function completeMock(outcome: "success" | "failure") {
    if (!mock) return;
    setMockBusy(outcome);
    try {
      const { order } = await api<{ order: Order }>("/payments/mock/complete", {
        method: "POST",
        body: { orderNumber: mock.order.orderNumber, mockPaymentId: mock.payment.mockPaymentId, outcome },
      });
      setMock(null);
      if (outcome === "success" && order.paymentStatus === "paid") {
        await succeeded(order);
      } else {
        toast.error("Payment failed. You can retry from your order page.");
        incomplete(order);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setMockBusy(null);
    }
  }

  function closeMock() {
    if (!mock || mockBusy) return;
    const { order } = mock;
    setMock(null);
    toast.info("Payment not completed. You can retry from your order page.");
    incomplete(order);
  }

  const paymentUi = (
    <>
      <Modal
        open={mock !== null}
        onClose={closeMock}
        title="Test payment"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => completeMock("failure")} loading={mockBusy === "failure"} disabled={mockBusy !== null}>
              Simulate failure
            </Button>
            <Button onClick={() => completeMock("success")} loading={mockBusy === "success"} disabled={mockBusy !== null}>
              Simulate successful payment
            </Button>
          </>
        }
      >
        {mock && (
          <div className="space-y-3 text-sm text-zinc-600">
            <p>
              This development-only gateway lets you test the order flow without real money. Choose an outcome for
              order <span className="font-medium text-zinc-900">{mock.order.orderNumber}</span>.
            </p>
            <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
              <span>Amount</span>
              <span className="font-semibold text-zinc-900">{formatPrice(mock.payment.amount, mock.payment.currency)}</span>
            </div>
          </div>
        )}
      </Modal>
      {processing && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-white/80 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-3 text-center">
            <Spinner className="size-7 text-zinc-900" />
            <p className="text-sm font-medium text-zinc-900">{processing}</p>
          </div>
        </div>
      )}
    </>
  );

  return { startPayment, paymentUi, processing: processing !== null };
}
