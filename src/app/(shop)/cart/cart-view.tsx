"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { cn, formatPrice, variantLabel, whatsappUrl } from "@/lib/format";
import type { CartItem } from "@/lib/types";
import { useAuth, useCart, useStoreConfig, useToast } from "@/components/providers";
import { Button, ButtonLink, EmptyState, Price, ProductImg } from "@/components/ui";
import { AlertIcon, BagIcon, ShieldIcon, TrashIcon, WhatsAppIcon } from "@/components/shop/icons";
import { QuantityStepper } from "@/components/shop/quantity-stepper";
import { Notice } from "@/components/shop/section";
import { estimateShipping } from "@/components/shop/shipping";
import { cartWhatsAppMessage, detailNumber, loginHref } from "@/components/shop/utils";

const MAX_QTY = 100;

function unavailableReason(item: CartItem): string {
  if (item.stock <= 0) return "This item is out of stock. Remove it to continue.";
  if (item.stock < item.quantity) return `Only ${item.stock} left. Reduce the quantity to continue.`;
  return "This item is no longer available. Remove it to continue.";
}

export function CartView() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const { user } = useAuth();
  const config = useStoreConfig();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <CartSkeleton />;

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={<BagIcon className="size-10" />}
        title="Your cart is empty"
        description="Looks like you haven't added anything yet. Explore the collection and find something you love."
        action={<ButtonLink href="/products">Start shopping</ButtonLink>}
      />
    );
  }

  async function changeQuantity(item: CartItem, quantity: number) {
    setBusy(item.id);
    try {
      await updateItem(item.id, quantity);
    } catch (err) {
      if (err instanceof ApiError && err.code === "OUT_OF_STOCK") {
        const available = detailNumber(err, "available");
        toast.error(available !== null ? `Only ${available} available for ${item.productName}.` : err.message);
      } else {
        toast.error(err);
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: CartItem) {
    setBusy(item.id);
    try {
      await removeItem(item.id);
      toast.info(`Removed ${item.productName} from your cart`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  const unavailable = cart.items.filter((i) => !i.isAvailable);
  const shipping = estimateShipping(cart.subtotal, config);
  const total = cart.subtotal + shipping.fee;
  const checkoutHref = user ? "/checkout" : loginHref("/checkout");

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start xl:gap-14">
      <section aria-labelledby="cart-items-title">
        <h2 id="cart-items-title" className="sr-only">
          Items in your cart
        </h2>
        {unavailable.length > 0 && (
          <Notice tone="warning" className="mb-4" title="Some items need your attention">
            Update or remove the highlighted {unavailable.length === 1 ? "item" : "items"} before checking out.
          </Notice>
        )}
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
          {cart.items.map((item) => {
            const label = variantLabel(item.size, item.color);
            const max = Math.max(1, Math.min(item.stock, MAX_QTY));
            const href = `/products/${item.productSlug}`;
            return (
              <li key={item.id} className={cn("flex gap-4 py-6 sm:gap-6", busy === item.id && "opacity-60")}>
                <Link href={href} className="shrink-0">
                  <ProductImg src={item.imageUrl} alt={item.productName} className="h-28 w-22 rounded-lg sm:h-36 sm:w-28" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={href} className="line-clamp-2 text-sm font-medium text-zinc-900 hover:underline sm:text-base">
                        {item.productName}
                      </Link>
                      {label && <p className="mt-1 text-sm text-zinc-600">{label}</p>}
                      <Price price={item.price} compareAtPrice={item.compareAtPrice} size="sm" className="mt-1" />
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-zinc-900 sm:text-base">{formatPrice(item.lineTotal)}</p>
                  </div>

                  {!item.isAvailable && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
                      <AlertIcon className="mt-0.5 size-4" />
                      {unavailableReason(item)}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <QuantityStepper
                      size="sm"
                      value={item.quantity}
                      max={max}
                      onChange={(q) => changeQuantity(item, q)}
                      disabled={busy !== null || item.stock <= 0}
                      label={`Quantity for ${item.productName}`}
                    />
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
                      aria-label={`Remove ${item.productName}${label ? ` (${label})` : ""} from cart`}
                    >
                      <TrashIcon className="size-4" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-6">
          <Link href="/products" className="text-sm font-medium text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline">
            ← Continue shopping
          </Link>
        </div>
      </section>

      <aside aria-labelledby="summary-title" className="lg:sticky lg:top-24">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 sm:p-6">
          <h2 id="summary-title" className="text-base font-semibold text-zinc-900">
            Order summary
          </h2>

          {shipping.threshold > 0 && (
            <div className="mt-4">
              <p className="text-sm text-zinc-700">
                {shipping.remaining > 0 ? (
                  <>
                    Add <span className="font-semibold text-zinc-900">{formatPrice(shipping.remaining)}</span> more for free
                    shipping
                  </>
                ) : (
                  <span className="font-medium text-emerald-700">You&apos;ve unlocked free shipping</span>
                )}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
                <div
                  className={cn("h-full rounded-full", shipping.remaining > 0 ? "bg-brand-600" : "bg-emerald-600")}
                  style={{ width: `${shipping.progress}%` }}
                />
              </div>
            </div>
          )}

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-600">
                Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})
              </dt>
              <dd className="font-medium text-zinc-900">{formatPrice(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-600">Shipping within India (estimate)</dt>
              <dd className="font-medium text-zinc-900">{shipping.fee === 0 ? "Free" : formatPrice(shipping.fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-base">
              <dt className="font-semibold text-zinc-900">Estimated total</dt>
              <dd className="font-semibold text-zinc-900">{formatPrice(total)}</dd>
            </div>
          </dl>
          {config.internationalShippingFee > 0 && (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Shipping outside India is {formatPrice(config.internationalShippingFee)}
              {config.internationalFreeShippingThreshold > 0
                ? ` (free over ${formatPrice(config.internationalFreeShippingThreshold)})`
                : ""}
              , calculated at checkout from your delivery address.
            </p>
          )}

          <div className="mt-6 space-y-3">
            {unavailable.length > 0 ? (
              <Button size="lg" className="w-full" disabled>
                Proceed to checkout
              </Button>
            ) : (
              <ButtonLink href={checkoutHref} size="lg" className="w-full">
                Proceed to checkout
              </ButtonLink>
            )}
            {!user && <p className="text-center text-xs text-zinc-500">You&apos;ll log in with your mobile number (OTP) to check out.</p>}
            {config.whatsappNumber && (
              <a
                href={whatsappUrl(config.whatsappNumber, cartWhatsAppMessage(config.storeName, cart.items))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                <WhatsAppIcon className="size-4 text-[#25D366]" />
                Order in bulk via WhatsApp
              </a>
            )}
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
            <ShieldIcon className="size-4" />
            Secure payments with UPI, cards, net banking & wallets
          </p>
        </div>
      </aside>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid animate-pulse gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy="true" aria-label="Loading cart">
      <div className="divide-y divide-zinc-100 border-y border-zinc-100">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-4 py-6">
            <div className="h-28 w-22 rounded-lg bg-zinc-100 sm:h-36 sm:w-28" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-2/3 rounded bg-zinc-100" />
              <div className="h-4 w-1/4 rounded bg-zinc-100" />
              <div className="h-8 w-28 rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-zinc-100" />
    </div>
  );
}
