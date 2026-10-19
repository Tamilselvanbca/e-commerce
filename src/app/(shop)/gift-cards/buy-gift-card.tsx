"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn, formatPrice } from "@/lib/format";
import type { OnlineGateway, Order, PaymentInit } from "@/lib/types";
import { useAuth, useStoreConfig } from "@/components/providers";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { GiftIcon } from "@/components/shop/icons";
import { GATEWAY_OPTIONS } from "@/components/shop/order-bits";
import { Notice } from "@/components/shop/section";
import { usePaymentFlow } from "@/components/shop/use-payment";
import { EMAIL_RE, loginHref } from "@/components/shop/utils";

const PRESETS = [50000, 100000, 200000, 500000];
const DRAFT_KEY = "gift-card-draft";

type Draft = { amount: string; recipientName: string; recipientEmail: string; senderName: string; message: string };
const EMPTY: Draft = { amount: "1000", recipientName: "", recipientEmail: "", senderName: "", message: "" };

/** Keeps the form across the login redirect. */
function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function BuyGiftCard() {
  const router = useRouter();
  const { user } = useAuth();
  const config = useStoreConfig();
  const uid = useId();
  const { startPayment, paymentUi, processing } = usePaymentFlow();
  const gateways = (["razorpay", "stripe", "mock"] as OnlineGateway[]).filter((g) => config.gateways[g]?.enabled);
  const { min, max } = config.giftCardPurchase;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [chosen, setChosen] = useState<OnlineGateway | null>(null);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const gateway = chosen ?? gateways.find((g) => g !== "stripe") ?? gateways[0] ?? null;

  // Restore a draft saved before logging in (runs once, after hydration).
  useEffect(() => {
    const saved = loadDraft();
    if (!saved) return;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off restore of browser-only state
    setDraft(saved);
  }, []);

  const set = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };
  const fid = (name: string) => `${uid}-${name}`;
  const paise = Math.round(Number(draft.amount) * 100);
  const amountOk = draft.amount.trim() !== "" && Number.isInteger(Number(draft.amount)) && paise >= min && paise <= max;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local: Record<string, string> = {};
    if (!amountOk) local.amount = `Choose a whole rupee amount from ${formatPrice(min)} to ${formatPrice(max)}`;
    if (!draft.recipientName.trim()) local.recipientName = "Enter who it's for";
    if (!EMAIL_RE.test(draft.recipientEmail.trim())) local.recipientEmail = "Enter a valid email address";
    if (user && !user.email && !EMAIL_RE.test(email.trim())) local.email = "Enter your email for the receipt";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    if (!user) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
      router.push(loginHref("/gift-cards"));
      return;
    }
    if (!gateway) return;

    setSubmitting(true);
    try {
      const created = await api<{ order: Order; payment: PaymentInit }>("/gift-cards/purchase", {
        method: "POST",
        body: {
          amount: paise,
          recipientName: draft.recipientName.trim(),
          recipientEmail: draft.recipientEmail.trim(),
          senderName: draft.senderName.trim() || null,
          message: draft.message.trim() || null,
          gateway,
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      await startPayment(created.order, created.payment);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        for (const d of err.details as { path?: string; message?: string }[]) {
          if (d.path && d.message) fieldErrors[d.path] = d.message;
        }
        setErrors(fieldErrors);
      }
      setFormError(errorMessage(err));
    }
  }

  const busy = submitting || processing;
  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 id={`${uid}-title`} className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
        <GiftIcon className="size-5 text-brand-700" />
        Send a gift card
      </h2>
      <p className="mt-1 text-sm text-zinc-600">Delivered instantly by email once you pay. Valid for one year.</p>

      {/* Preview */}
      <div
        aria-hidden="true"
        className="mt-5 overflow-hidden rounded-xl bg-brand-700 bg-[radial-gradient(circle_at_90%_10%,var(--color-brand-500),transparent_60%)] p-5 text-white shadow-sm"
      >
        <p className="text-sm font-semibold tracking-wide">{config.storeName}</p>
        <p className="mt-6 text-3xl font-semibold tabular-nums">{amountOk ? formatPrice(paise) : "₹—"}</p>
        <p className="mt-1 truncate text-sm text-brand-100">
          {draft.recipientName.trim() ? `For ${draft.recipientName.trim()}` : "Gift card"}
          {draft.senderName.trim() || user?.name ? ` · from ${draft.senderName.trim() || user?.name}` : ""}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="mt-5 space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-800">Amount</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter((p) => p >= min && p <= max).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={paise === p}
                onClick={() => set("amount", String(p / 100))}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-zinc-900",
                  paise === p ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50",
                )}
              >
                {formatPrice(p)}
              </button>
            ))}
          </div>
          <Field label="Or enter an amount" htmlFor={fid("amount")} error={errors.amount} className="mt-3 max-w-56">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">₹</span>
              <Input
                id={fid("amount")}
                type="number"
                inputMode="numeric"
                min={min / 100}
                max={max / 100}
                step={1}
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                className="pl-7"
                aria-invalid={errors.amount ? true : undefined}
              />
            </div>
          </Field>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recipient's name" htmlFor={fid("rname")} error={errors.recipientName}>
            <Input
              id={fid("rname")}
              value={draft.recipientName}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => set("recipientName", e.target.value)}
              aria-invalid={errors.recipientName ? true : undefined}
            />
          </Field>
          <Field label="Recipient's email" htmlFor={fid("remail")} error={errors.recipientEmail}>
            <Input
              id={fid("remail")}
              type="email"
              value={draft.recipientEmail}
              autoComplete="off"
              onChange={(e) => set("recipientEmail", e.target.value)}
              aria-invalid={errors.recipientEmail ? true : undefined}
            />
          </Field>
          <Field label="From (optional)" htmlFor={fid("sender")} hint={user?.name ? `Leave empty to use ${user.name}` : undefined}>
            <Input id={fid("sender")} value={draft.senderName} maxLength={100} onChange={(e) => set("senderName", e.target.value)} />
          </Field>
          {user && !user.email && (
            <Field label="Your email (for the receipt)" htmlFor={fid("email")} error={errors.email}>
              <Input
                id={fid("email")}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((er) => ({ ...er, email: "" }));
                }}
                aria-invalid={errors.email ? true : undefined}
              />
            </Field>
          )}
          <Field label="Message (optional)" htmlFor={fid("message")} className="sm:col-span-2">
            <Textarea
              id={fid("message")}
              rows={3}
              maxLength={500}
              value={draft.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Happy Diwali! Enjoy some sweets on us."
            />
          </Field>
        </div>

        {user &&
          (gateways.length === 0 ? (
            <Notice tone="warning" title="Online payments are temporarily unavailable">
              Please order your gift card on WhatsApp or through the enquiry form.
            </Notice>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-zinc-800">Pay with</legend>
              <div className="space-y-2">
                {gateways.map((g) => (
                  <label
                    key={g}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-zinc-900",
                      gateway === g ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-zinc-200 hover:border-zinc-400",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${uid}-gateway`}
                      checked={gateway === g}
                      onChange={() => setChosen(g)}
                      className="mt-1 size-4 shrink-0 accent-brand-700"
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">{GATEWAY_OPTIONS[g].title}</span>
                      <span className="block text-xs text-zinc-600">{GATEWAY_OPTIONS[g].description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

        {formError && <Notice tone="error">{formError}</Notice>}

        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={Boolean(user) && gateways.length === 0}>
          {busy ? "Processing…" : !user ? "Log in to continue" : amountOk ? `Pay ${formatPrice(paise)} & send` : "Pay & send"}
        </Button>
        {!user && <p className="text-center text-xs text-zinc-500">You&apos;ll log in with your mobile number, then pay. Your details are kept.</p>}
      </form>
      {paymentUi}
    </section>
  );
}
