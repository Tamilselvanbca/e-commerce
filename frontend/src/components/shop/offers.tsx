"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn, formatPrice, offerBenefit, offerTerms } from "@/lib/format";
import type { CheckoutSummary, Offer } from "@/lib/types";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui";
import { CheckCircleIcon, TagIcon } from "./icons";
import { useApi } from "./use-api";
import { loginHref } from "./utils";

/** What an offer card shows next to (or under) the offer. */
type OfferAction =
  | { kind: "apply"; onApply: () => void; pending?: boolean; saving?: number }
  | { kind: "applied"; saving?: number }
  | { kind: "auto" }
  | { kind: "locked"; remaining: number; progress: number }
  | { kind: "info" };

/** One offer, coupon-style: benefit, terms, code chip and its state (Apply, Applied, add ₹X more). */
function OfferCard({ offer, action }: { offer: Offer; action: OfferAction }) {
  const applied = action.kind === "applied";
  return (
    <div className={cn("rounded-xl border p-3", applied ? "border-emerald-300 bg-emerald-50/70" : "border-dashed border-brand-300 bg-white")}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            applied ? "bg-emerald-100 text-emerald-700" : "bg-brand-50 text-brand-700",
          )}
          aria-hidden="true"
        >
          <TagIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{offerBenefit(offer)}</p>
          <p className="mt-0.5 text-xs text-zinc-600">{offerTerms(offer)}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            {offer.code ? (
              <span className="rounded border border-dashed border-zinc-400 bg-zinc-50 px-1.5 py-0.5 font-mono font-semibold tracking-wide text-zinc-800">
                {offer.code}
              </span>
            ) : (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700">No code needed</span>
            )}
            <span className="min-w-0 break-words">{offer.title}</span>
          </p>
          {offer.description && <p className="mt-1 text-xs text-zinc-500">{offer.description}</p>}
        </div>
        <div className="shrink-0 text-right">
          {action.kind === "apply" && (
            <>
              <Button size="sm" variant="outline" onClick={action.onApply} loading={action.pending} className="border-brand-600 text-brand-800">
                Apply
              </Button>
              {action.saving ? <p className="mt-1 text-xs font-medium text-emerald-700">Save {formatPrice(action.saving)}</p> : null}
            </>
          )}
          {applied && (
            <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircleIcon className="size-4" />
              Applied
            </p>
          )}
          {applied && action.saving ? <p className="mt-0.5 text-xs text-emerald-800">You save {formatPrice(action.saving)}</p> : null}
          {action.kind === "auto" && <p className="max-w-24 text-xs font-medium text-emerald-700">Applies automatically</p>}
        </div>
      </div>
      {action.kind === "locked" && (
        <div className="mt-2.5 pl-11">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(4, Math.min(100, action.progress))}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-700">
            Add <span className="font-semibold text-zinc-900">{formatPrice(action.remaining)}</span> more to unlock
          </p>
        </div>
      )}
    </div>
  );
}

/** "Available offers" heading and cards; shows `limit` and a toggle for the rest. */
function OfferStack({
  cards,
  limit = 3,
  heading = "Available offers",
  footer,
}: {
  cards: { offer: Offer; action: OfferAction }[];
  limit?: number;
  heading?: string;
  footer?: React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  if (cards.length === 0) return null;
  const shown = all ? cards : cards.slice(0, limit);
  return (
    <section aria-label={heading}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <TagIcon className="size-4 text-brand-700" />
        {heading}
        <span className="rounded-full bg-brand-50 px-2 text-xs font-medium text-brand-800">{cards.length}</span>
      </h3>
      <ul className="mt-3 space-y-2">
        {shown.map((c) => (
          <li key={c.offer.id}>
            <OfferCard offer={c.offer} action={c.action} />
          </li>
        ))}
      </ul>
      {cards.length > limit && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2 text-sm font-medium text-brand-800 underline-offset-4 hover:underline"
          aria-expanded={all}
        >
          {all ? "Show fewer offers" : `View all ${cards.length} offers`}
        </button>
      )}
      {footer}
    </section>
  );
}

const progress = (subtotal: number, min: number) => (min > 0 ? (subtotal / min) * 100 : 100);

/** Product page: the running offers, for information (they're applied in the cart and at checkout). */
export function ProductOffers({ offers }: { offers: Offer[] }) {
  return (
    <OfferStack
      cards={offers.map((offer) => ({ offer, action: { kind: "info" } }))}
      footer={<p className="mt-2 text-xs text-zinc-500">Apply coupons in your cart or at checkout. One offer per order.</p>}
    />
  );
}

/** Cart: offers against the cart subtotal; Apply goes to checkout with the coupon applied. */
export function CartOffers({ subtotal }: { subtotal: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const { data } = useApi<{ items: Offer[] }>("/offers");
  const offers = data?.items ?? [];
  const applyHref = (code: string) => {
    const next = `/checkout?coupon=${encodeURIComponent(code)}`;
    return user ? next : loginHref(next);
  };
  const cards = offers
    .map((offer) => {
      const eligible = subtotal >= offer.minSubtotal;
      const action: OfferAction = !eligible
        ? { kind: "locked", remaining: offer.minSubtotal - subtotal, progress: progress(subtotal, offer.minSubtotal) }
        : offer.code
          ? { kind: "apply", onApply: () => router.push(applyHref(offer.code!)) }
          : { kind: "auto" };
      return { offer, action, eligible };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible));
  return <OfferStack cards={cards} limit={2} />;
}

/** Checkout: offers for this cart; Apply puts the coupon on the order. */
export function CheckoutOffers({
  pricing,
  couponCode,
  onApply,
  pending,
}: {
  pricing: CheckoutSummary;
  couponCode: string;
  onApply: (code: string) => void;
  pending: boolean;
}) {
  const cards = pricing.offers.map((offer) => {
    const applied = pricing.appliedDiscount?.id === offer.id;
    let action: OfferAction;
    if (!offer.eligible) {
      action = { kind: "locked", remaining: offer.remaining, progress: progress(pricing.subtotal, offer.minSubtotal) };
    } else if (applied) {
      action = { kind: "applied", saving: pricing.appliedDiscount?.amount };
    } else if (offer.code) {
      const code = offer.code;
      action = { kind: "apply", onApply: () => onApply(code), pending: pending && couponCode === code, saving: offer.saving };
    } else {
      // Eligible automatic offer that another, bigger discount beat (one offer per order).
      action = { kind: "info" };
    }
    return { offer, action };
  });
  return <OfferStack cards={cards} />;
}
