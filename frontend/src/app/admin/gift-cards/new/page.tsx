"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { cn, formatPrice } from "@/lib/format";
import type { GiftCard } from "@/lib/types";
import { useStoreConfig, useToast } from "@/components/providers";
import { Button, ButtonLink, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { rupeesToPaise } from "@/components/admin/discount-utils";
import { InlineAlert } from "@/components/admin/feedback";
import { useUnsavedChangesWarning } from "@/components/admin/hooks";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { validationErrors, withoutError, type FieldErrors } from "@/components/admin/utils";

const PRESETS = [500, 1000, 2000, 5000];

/** Today + 1 year as YYYY-MM-DD, the suggested expiry. */
function inAYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function NewGiftCardPage() {
  const router = useRouter();
  const toast = useToast();
  const { storeName } = useStoreConfig();
  const uid = useId();
  const [amount, setAmount] = useState("1000");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState(inAYear);
  const [sendEmail, setSendEmail] = useState(true);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useUnsavedChangesWarning(Boolean(recipientName || recipientEmail || message) && !saving);

  const clear = (key: string) => setErrors((e) => withoutError(e, key));
  const fid = (name: string) => `${uid}-${name}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const paise = rupeesToPaise(amount);
    const local: FieldErrors = {};
    if (paise === null || Number.isNaN(paise) || paise < 100) local.amount = "Enter an amount of at least ₹1";
    if (sendEmail && !recipientEmail.trim()) local.recipientEmail = "Add an email to send the gift card, or untick Send by email";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      const card = await api<GiftCard & { emailed: boolean }>("/admin/gift-cards", {
        method: "POST",
        body: {
          amount: paise,
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          senderName: senderName.trim() || null,
          message: message.trim() || null,
          // End of the chosen day in the browser's time zone.
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          sendEmail,
          note: note.trim() || null,
        },
      });
      toast.success(card.emailed ? `Gift card sent to ${card.recipientEmail}` : "Gift card created");
      router.push(`/admin/gift-cards/${card.id}`);
    } catch (err) {
      const fieldErrors = validationErrors(err);
      if (fieldErrors) setErrors(fieldErrors);
      setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  const paise = rupeesToPaise(amount);
  return (
    <>
      <PageHeader title="Issue gift card" back={{ href: "/admin/gift-cards", label: "Gift cards" }} />
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Panel title="Amount">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setAmount(String(p));
                    clear("amount");
                  }}
                  aria-pressed={amount === String(p)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-zinc-900",
                    amount === String(p) ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  {formatPrice(p * 100)}
                </button>
              ))}
            </div>
            <Field label="Amount" htmlFor={fid("amount")} error={errors.amount} className="mt-4 max-w-xs">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">₹</span>
                <Input
                  id={fid("amount")}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={0.01}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    clear("amount");
                  }}
                  className="pl-7"
                  aria-invalid={errors.amount ? true : undefined}
                />
              </div>
            </Field>
          </Panel>

          <Panel title="Recipient">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" htmlFor={fid("rname")} error={errors.recipientName}>
                <Input id={fid("rname")} value={recipientName} maxLength={100} onChange={(e) => setRecipientName(e.target.value)} />
              </Field>
              <Field label="Email" htmlFor={fid("remail")} error={errors.recipientEmail}>
                <Input
                  id={fid("remail")}
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => {
                    setRecipientEmail(e.target.value);
                    clear("recipientEmail");
                  }}
                  aria-invalid={errors.recipientEmail ? true : undefined}
                />
              </Field>
              <Field label="From (optional)" htmlFor={fid("sender")} hint={`Shown as "… sent you a gift card". Leave empty to send it from ${storeName}.`}>
                <Input id={fid("sender")} value={senderName} maxLength={100} onChange={(e) => setSenderName(e.target.value)} />
              </Field>
              <Field label="Expires on" htmlFor={fid("expires")} error={errors.expiresAt} hint="Leave empty for no expiry.">
                <Input id={fid("expires")} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </Field>
              <Field label="Message (optional)" htmlFor={fid("message")} className="sm:col-span-2">
                <Textarea id={fid("message")} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Happy Diwali! Enjoy some sweets on us." />
              </Field>
            </div>
          </Panel>

          <Panel title="Internal note (optional)" description="Only staff see this, in the card's history.">
            <Input aria-label="Internal note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Corporate order #42, or goodwill for a late delivery" />
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-8">
          <Panel title="Summary">
            <p className="text-2xl font-semibold tabular-nums text-zinc-900">{paise && !Number.isNaN(paise) ? formatPrice(paise) : "₹—"}</p>
            <p className="mt-1 text-sm text-zinc-600">
              A 16-character code is generated. Customers enter it at checkout; unused balance stays on the card.
            </p>
            <Checkbox
              className="mt-4"
              label="Send by email to the recipient"
              checked={sendEmail}
              onChange={(e) => {
                setSendEmail(e.target.checked);
                clear("recipientEmail");
              }}
            />
          </Panel>
          {formError && <InlineAlert title="Not created">{formError}</InlineAlert>}
          <div className="flex gap-2">
            <Button type="submit" loading={saving} className="flex-1">
              {sendEmail ? "Create & send" : "Create gift card"}
            </Button>
            <ButtonLink href="/admin/gift-cards" variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        </div>
      </form>
    </>
  );
}
