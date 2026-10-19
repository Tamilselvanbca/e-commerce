"use client";

import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, buildQuery, errorMessage } from "@/lib/api";
import { cn, variantLabel } from "@/lib/format";
import type { Address, CartItem, CheckoutSummary, OnlineGateway, Order, PaymentInit, User } from "@/lib/types";
import { useAuth, useToast } from "@/components/providers";
import { Badge, Button, ButtonLink, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { AddressForm, AddressLines } from "@/components/shop/address-form";
import { CheckoutCodes } from "@/components/shop/checkout-codes";
import { BagIcon, GiftIcon, PlusIcon, ShieldIcon } from "@/components/shop/icons";
import { GATEWAY_OPTIONS, LineItems, Totals } from "@/components/shop/order-bits";
import { Notice } from "@/components/shop/section";
import { useApi } from "@/components/shop/use-api";
import { orderHref, usePageRestore, usePaymentFlow } from "@/components/shop/use-payment";
import { useRequireAuth } from "@/components/shop/use-require-auth";
import { EMAIL_RE, loginHref } from "@/components/shop/utils";

export function CheckoutView() {
  const { user, ready } = useRequireAuth("/checkout");
  const summary = useApi<CheckoutSummary>(ready ? "/checkout/summary" : null);
  const addresses = useApi<{ items: Address[] }>(ready ? "/addresses" : null);

  if (!ready || !user) return <CheckoutSkeleton />;

  const failed = summary.error ?? addresses.error;
  if (failed) {
    const unauthorized = summary.unauthorized || addresses.unauthorized;
    return (
      <EmptyState
        title={unauthorized ? "Please log in again" : "We couldn't load checkout"}
        description={unauthorized ? "Your session has expired." : errorMessage(failed)}
        action={
          unauthorized ? (
            <ButtonLink href={loginHref("/checkout")}>Log in</ButtonLink>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                summary.reload();
                addresses.reload();
              }}
            >
              Try again
            </Button>
          )
        }
      />
    );
  }

  if (!summary.data || !addresses.data) return <CheckoutSkeleton />;

  if (summary.data.cart.items.length === 0) {
    return (
      <EmptyState
        icon={<BagIcon className="size-10" />}
        title="Your cart is empty"
        description="Add a few things to your cart before checking out."
        action={<ButtonLink href="/products">Continue shopping</ButtonLink>}
      />
    );
  }

  return <CheckoutForm user={user} summary={summary.data} initialAddresses={addresses.data.items} />;
}

type PlaceError =
  | { kind: "stock"; lines: string[] }
  | { kind: "empty" }
  | { kind: "generic"; message: string };

function stockLines(err: ApiError, items: CartItem[]): string[] {
  const details = err.details as { items?: { variantId: string; available: number }[] } | undefined;
  const rows = Array.isArray(details?.items) ? details.items : [];
  if (rows.length === 0) return [err.message];
  return rows.map((row) => {
    const item = items.find((i) => i.variantId === row.variantId);
    const name = item ? `${item.productName}${variantLabel(item.size, item.color) ? ` (${variantLabel(item.size, item.color)})` : ""}` : "An item";
    return row.available > 0 ? `${name}: only ${row.available} left` : `${name}: out of stock`;
  });
}

function CheckoutForm({
  user,
  summary,
  initialAddresses,
}: {
  user: User;
  summary: CheckoutSummary;
  initialAddresses: Address[];
}) {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const uid = useId();
  const { startPayment, paymentUi, processing } = usePaymentFlow();

  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [addressId, setAddressId] = useState<string | null>(
    () => initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? null,
  );
  const [adding, setAdding] = useState(initialAddresses.length === 0);
  const [email, setEmail] = useState(user.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  // Codes the customer applied; they're part of the pricing request below.
  const [couponCode, setCouponCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  // Shipping depends on the destination, so re-price for the selected address and codes.
  const quote = useApi<CheckoutSummary>(
    addressId || couponCode || giftCardCode
      ? `/checkout/summary${buildQuery({ addressId, couponCode, giftCardCode })}`
      : null,
  );
  const pricing = quote.data ?? summary;
  const international = pricing.international;
  // The gift card covers everything: no online payment needed.
  const coveredByGiftCard = Boolean(giftCardCode && pricing.giftCard?.applied && pricing.amountDue === 0);
  // Until the customer picks one, suggest Stripe (international cards) for overseas addresses.
  const [chosenGateway, setGateway] = useState<OnlineGateway | null>(null);
  const suggestedGateway: OnlineGateway | null =
    international && summary.gateways.includes("stripe") ? "stripe" : (summary.gateways.find((g) => g !== "stripe") ?? summary.gateways[0] ?? null);
  const gateway = chosenGateway && summary.gateways.includes(chosenGateway) ? chosenGateway : suggestedGateway;
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placeError, setPlaceError] = useState<PlaceError | null>(null);
  const resetSubmitting = useCallback(() => setSubmitting(false), []);
  usePageRestore(resetSubmitting);

  const items = summary.cart.items;
  const unavailable = items.filter((i) => !i.isAvailable);
  const emailRequired = !user.email;

  function onAddressSaved(address: Address) {
    setAddresses((list) => {
      const rest = list.filter((a) => a.id !== address.id).map((a) => (address.isDefault ? { ...a, isDefault: false } : a));
      return address.isDefault ? [address, ...rest] : [...rest, address];
    });
    setAddressId(address.id);
    setAdding(false);
    toast.success("Address saved");
  }

  async function placeOrder() {
    setPlaceError(null);
    const trimmedEmail = email.trim();
    if (emailRequired && !trimmedEmail) {
      setEmailError("Enter your email so we can send order updates");
      document.getElementById(`${uid}-email`)?.focus();
      return;
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Enter a valid email address");
      document.getElementById(`${uid}-email`)?.focus();
      return;
    }
    setEmailError(null);
    if (!addressId) {
      setPlaceError({ kind: "generic", message: "Select a delivery address or add a new one." });
      return;
    }
    if (!gateway && !coveredByGiftCard) {
      setPlaceError({ kind: "generic", message: "Select a payment method." });
      return;
    }

    setSubmitting(true);
    let created: { order: Order; payment: PaymentInit };
    try {
      created = await api<{ order: Order; payment: PaymentInit }>("/checkout", {
        method: "POST",
        body: {
          addressId,
          gateway: coveredByGiftCard ? "gift_card" : gateway,
          // Only send codes that apply, so a stale code can't block the order.
          ...(couponCode && pricing.coupon?.applied ? { couponCode } : {}),
          ...(giftCardCode && pricing.giftCard?.applied ? { giftCardCode } : {}),
          ...(trimmedEmail ? { email: trimmedEmail } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === "OUT_OF_STOCK") setPlaceError({ kind: "stock", lines: stockLines(err, items) });
      else if (err instanceof ApiError && err.code === "CART_EMPTY") setPlaceError({ kind: "empty" });
      else if (err instanceof ApiError && ["COUPON_INVALID", "GIFT_CARD_INVALID", "GIFT_CARD_INSUFFICIENT"].includes(err.code)) {
        // Something changed since the preview (e.g. the code ran out); show fresh prices.
        setPlaceError({ kind: "generic", message: `${err.message} Your order summary has been updated.` });
        quote.reload();
      }
      else if (err instanceof ApiError && err.code === "GATEWAY_ERROR")
        setPlaceError({
          kind: "generic",
          message: "The payment provider is not responding. Please try again or choose another payment method.",
        });
      else if (err instanceof ApiError && err.status === 401) router.replace(loginHref("/checkout"));
      else setPlaceError({ kind: "generic", message: errorMessage(err) });
      return;
    }

    if (emailRequired && trimmedEmail) void auth.refresh();

    try {
      await startPayment(created.order, created.payment);
    } catch (err) {
      toast.error(err);
      router.push(orderHref(created.order.orderNumber));
    }
  }

  const busy = submitting || processing;
  const canPlace =
    !busy &&
    unavailable.length === 0 &&
    (summary.gateways.length > 0 || coveredByGiftCard) &&
    Boolean(addressId) &&
    !adding &&
    !quote.loading;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start xl:gap-12">
      <div className="space-y-6">
        {/* 1. Contact */}
        <StepCard step={1} title="Contact details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={emailRequired ? "Email" : "Email for order updates"}
              htmlFor={`${uid}-email`}
              error={emailError}
              hint={emailRequired ? "Order confirmation and shipping updates are sent here." : undefined}
            >
              <Input
                id={`${uid}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                placeholder="you@example.com"
                required={emailRequired}
                aria-invalid={emailError ? true : undefined}
              />
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-800">Mobile</p>
              <p className="flex h-10 items-center rounded-lg bg-zinc-50 px-3 text-sm text-zinc-700">{user.phone}</p>
            </div>
          </div>
        </StepCard>

        {/* 2. Address */}
        <StepCard
          step={2}
          title="Delivery address"
          action={
            !adding && addresses.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                <PlusIcon className="size-4" />
                Add new
              </Button>
            ) : null
          }
        >
          {addresses.length > 0 && (
            <fieldset>
              <legend className="sr-only">Choose a delivery address</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => {
                  const checked = a.id === addressId;
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        "relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-900",
                        checked ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-zinc-200 hover:border-zinc-400",
                      )}
                    >
                      <input
                        type="radio"
                        name="address"
                        value={a.id}
                        checked={checked}
                        onChange={() => setAddressId(a.id)}
                        className="mt-1 size-4 shrink-0 accent-brand-700"
                      />
                      <div className="min-w-0 flex-1">
                        <AddressLines address={a} />
                        {a.isDefault && <Badge className="mt-2 bg-brand-700 text-white ring-brand-700">Default</Badge>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          {adding && (
            <div className={cn(addresses.length > 0 && "mt-5 border-t border-zinc-200 pt-5")}>
              {addresses.length > 0 && <h3 className="mb-4 text-sm font-semibold text-zinc-900">New address</h3>}
              <AddressForm
                defaults={{ fullName: user.name, phone: user.phone }}
                onSaved={onAddressSaved}
                onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
                submitLabel="Save and use this address"
                showDefaultToggle={addresses.length > 0}
              />
            </div>
          )}
        </StepCard>

        {/* 3. Payment */}
        <StepCard step={3} title="Payment method">
          {coveredByGiftCard ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <GiftIcon className="mt-0.5 size-5 text-emerald-700" />
              <span>
                <span className="block font-medium">Paid with your gift card</span>
                Your gift card covers the whole order, so there&apos;s nothing to pay online.
              </span>
            </div>
          ) : summary.gateways.length === 0 ? (
            <Notice tone="warning" title="Online payments are temporarily unavailable">
              Please try again later or contact us to complete your order.
            </Notice>
          ) : (
            <fieldset>
              <legend className="sr-only">Choose a payment method</legend>
              <div className="space-y-3">
                {summary.gateways.map((g) => {
                  const option = GATEWAY_OPTIONS[g] ?? { title: g, description: "" };
                  const checked = gateway === g;
                  return (
                    <label
                      key={g}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-900",
                        checked ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-zinc-200 hover:border-zinc-400",
                      )}
                    >
                      <input
                        type="radio"
                        name="gateway"
                        value={g}
                        checked={checked}
                        onChange={() => setGateway(g)}
                        className="mt-1 size-4 shrink-0 accent-brand-700"
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-900">{option.title}</span>
                        {option.description && <span className="mt-0.5 block text-sm text-zinc-600">{option.description}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          <div className="mt-5">
            <Field label="Order notes (optional)" htmlFor={`${uid}-notes`} hint="Delivery instructions or anything else we should know.">
              <Textarea id={`${uid}-notes`} rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </StepCard>
      </div>

      {/* 4. Summary */}
      <aside aria-labelledby="checkout-summary-title" className="lg:sticky lg:top-24">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 id="checkout-summary-title" className="text-base font-semibold text-zinc-900">
              Order summary
            </h2>
            <Link href="/cart" className="text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline">
              Edit cart
            </Link>
          </div>
          <LineItems
            className="mt-5"
            items={items.map((i) => ({
              key: i.id,
              name: i.productName,
              size: i.size,
              color: i.color,
              imageUrl: i.imageUrl,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            }))}
          />
          <div className="mt-5 border-t border-zinc-200 pt-5">
            <CheckoutCodes
              pricing={pricing}
              couponCode={couponCode}
              giftCardCode={giftCardCode}
              onCouponChange={setCouponCode}
              onGiftCardChange={setGiftCardCode}
              pending={quote.loading}
            />
          </div>
          <div className={cn("mt-5 border-t border-zinc-200 pt-5 transition-opacity", quote.loading && "opacity-60")} aria-busy={quote.loading || undefined}>
            <Totals
              subtotal={pricing.subtotal}
              shippingFee={pricing.shippingFee}
              discount={pricing.discount}
              discountLabel={pricing.appliedDiscount ? (pricing.appliedDiscount.code ?? pricing.appliedDiscount.title) : null}
              total={pricing.total}
              giftCardAmount={pricing.giftCardAmount}
              amountDue={pricing.amountDue}
            />
            {international && (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                International delivery. Prices are charged in Indian Rupees; your card provider converts to your currency.
                Import duties or taxes, if any, are collected by the courier on delivery.
              </p>
            )}
          </div>

          <div className="mt-5 space-y-3" aria-live="polite">
            {unavailable.length > 0 && (
              <Notice tone="warning" title="Some items are unavailable">
                <Link href="/cart" className="font-medium underline underline-offset-4">
                  Review your cart
                </Link>{" "}
                to update or remove them.
              </Notice>
            )}
            {placeError?.kind === "stock" && (
              <Notice tone="error" title="Some items just sold out">
                <ul className="list-disc space-y-0.5 pl-4">
                  {placeError.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <Link href="/cart" className="mt-2 inline-block font-medium underline underline-offset-4">
                  Update your cart
                </Link>
              </Notice>
            )}
            {placeError?.kind === "empty" && (
              <Notice tone="error" title="Your cart is empty">
                It may have been checked out in another tab.{" "}
                <Link href="/cart" className="font-medium underline underline-offset-4">
                  Back to cart
                </Link>
              </Notice>
            )}
            {placeError?.kind === "generic" && <Notice tone="error">{placeError.message}</Notice>}
          </div>

          <Button size="lg" className="mt-5 w-full" onClick={placeOrder} loading={busy} disabled={!canPlace}>
            {busy ? "Processing…" : coveredByGiftCard ? "Place order" : "Place order & pay"}
          </Button>
          {adding && addresses.length > 0 && (
            <p className="mt-2 text-center text-xs text-zinc-500">Save or cancel the new address to continue.</p>
          )}
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <ShieldIcon className="size-4" />
            Payments are encrypted and processed securely.
          </p>
        </div>
      </aside>
      {paymentUi}
    </div>
  );
}

function StepCard({
  step,
  title,
  action,
  children,
}: {
  step: number;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6" aria-labelledby={`step-${step}-title`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={`step-${step}-title`} className="flex items-center gap-3 text-base font-semibold text-zinc-900">
          <span className="flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white" aria-hidden="true">
            {step}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid animate-pulse gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy="true" aria-label="Loading checkout">
      <div className="space-y-6">
        <div className="h-40 rounded-2xl bg-zinc-100" />
        <div className="h-56 rounded-2xl bg-zinc-100" />
        <div className="h-48 rounded-2xl bg-zinc-100" />
      </div>
      <div className="h-96 rounded-2xl bg-zinc-100" />
    </div>
  );
}
