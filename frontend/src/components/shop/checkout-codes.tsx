"use client";

import { useId, useState } from "react";
import { cn, formatPrice } from "@/lib/format";
import type { CheckoutSummary } from "@/lib/types";
import { Button, Input } from "@/components/ui";
import { CheckCircleIcon, GiftIcon, SparkIcon, TagIcon } from "./icons";

/**
 * Coupon code + gift card entry for the checkout summary. The parent owns the
 * applied codes (they are part of the pricing request); this shows the result.
 */
export function CheckoutCodes({
  pricing,
  couponCode,
  giftCardCode,
  onCouponChange,
  onGiftCardChange,
  pending,
}: {
  pricing: CheckoutSummary;
  couponCode: string;
  giftCardCode: string;
  onCouponChange: (code: string) => void;
  onGiftCardChange: (code: string) => void;
  /** A re-price for the current codes is in flight. */
  pending: boolean;
}) {
  const auto = pricing.appliedDiscount?.automatic ? pricing.appliedDiscount : null;
  const coupon = couponCode && !pending ? pricing.coupon : null;
  const card = giftCardCode && !pending ? pricing.giftCard : null;

  return (
    <div className="space-y-4">
      {auto && (
        <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <SparkIcon className="mt-0.5 size-4 text-emerald-700" />
          <span>
            <span className="font-medium">{auto.title}</span> applied: you save {formatPrice(auto.amount)}.
          </span>
        </p>
      )}
      {pricing.offerHint && !pricing.discount && (
        <p className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <SparkIcon className="mt-0.5 size-4 text-brand-700" />
          <span>
            Add {formatPrice(pricing.offerHint.remaining)} more to get the <span className="font-medium">{pricing.offerHint.title}</span>.
          </span>
        </p>
      )}

      <CodeField
        label="Discount code"
        placeholder="Enter code"
        icon={<TagIcon className="size-4" />}
        applied={couponCode}
        pending={pending && Boolean(couponCode)}
        result={
          coupon
            ? coupon.applied
              ? { ok: true, text: `${formatPrice(pricing.discount)} off` }
              : { ok: false, text: coupon.message ?? "This code can't be used", soft: Boolean(auto) }
            : null
        }
        onApply={(code) => onCouponChange(code.toUpperCase())}
        onRemove={() => onCouponChange("")}
      />
      <CodeField
        label="Gift card"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        icon={<GiftIcon className="size-4" />}
        applied={giftCardCode}
        pending={pending && Boolean(giftCardCode)}
        result={
          card
            ? card.applied
              ? {
                  ok: true,
                  text:
                    card.balance !== null && card.balance > card.amount
                      ? `${formatPrice(card.amount)} used, ${formatPrice(card.balance - card.amount)} stays on the card`
                      : `${formatPrice(card.amount)} used`,
                }
              : { ok: false, text: card.message ?? "This gift card can't be used" }
            : null
        }
        onApply={(code) => onGiftCardChange(code.toUpperCase())}
        onRemove={() => onGiftCardChange("")}
      />
    </div>
  );
}

function CodeField({
  label,
  placeholder,
  icon,
  applied,
  pending,
  result,
  onApply,
  onRemove,
}: {
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  applied: string;
  pending: boolean;
  result: { ok: boolean; text: string; soft?: boolean } | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(applied);
  const [open, setOpen] = useState(Boolean(applied));

  if (applied && result?.ok) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-start gap-2 text-emerald-900">
          <CheckCircleIcon className="mt-0.5 size-4 text-emerald-700" />
          <span className="min-w-0">
            <span className="block break-all font-medium">{applied}</span>
            <span className="block text-xs text-emerald-800">{result.text}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onRemove();
          }}
          className="shrink-0 text-xs font-medium text-emerald-900 underline-offset-2 hover:underline"
          aria-label={`Remove ${label.toLowerCase()} ${applied}`}
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-brand-800 underline-offset-4 hover:underline"
        aria-expanded="false"
      >
        {icon}
        Add a {label.toLowerCase()}
      </button>
    );
  }

  const submit = () => {
    const code = draft.trim();
    if (code) onApply(code);
  };
  const errorId = `${id}-msg`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-zinc-800">
        {icon}
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="min-w-0 flex-1 uppercase placeholder:normal-case"
          aria-invalid={result && !result.ok && !result.soft ? true : undefined}
          aria-describedby={result ? errorId : undefined}
        />
        <Button variant="outline" onClick={submit} loading={pending} disabled={!draft.trim() || (draft.trim().toUpperCase() === applied && pending)}>
          Apply
        </Button>
      </div>
      {result && !result.ok && (
        <p id={errorId} className={cn("text-xs", result.soft ? "text-zinc-600" : "text-red-600")}>
          {result.text}
          {applied && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  onRemove();
                }}
                className="font-medium underline underline-offset-2"
              >
                Clear
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
