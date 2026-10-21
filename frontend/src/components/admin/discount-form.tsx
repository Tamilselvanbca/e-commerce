"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";
import type { AdminDiscount, DiscountInput, DiscountType } from "@/lib/types";
import { useToast } from "@/components/providers";
import { Button, ButtonLink, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { discountValueLabel, fromLocalInput, paiseToRupees, randomCode, rupeesToPaise, toLocalInput } from "./discount-utils";
import { InlineAlert } from "./feedback";
import { useUnsavedChangesWarning } from "./hooks";
import { Panel } from "./page-header";
import { validationErrors, withoutError, type FieldErrors } from "./utils";

type Draft = {
  automatic: boolean;
  code: string;
  title: string;
  description: string;
  type: DiscountType;
  percent: string;
  amount: string; // rupees
  maxDiscount: string; // rupees
  minSubtotal: string; // rupees
  region: DiscountInput["region"];
  startsAt: string; // datetime-local
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  firstOrderOnly: boolean;
  showInOffers: boolean;
  isActive: boolean;
};

function toDraft(d?: AdminDiscount): Draft {
  return {
    automatic: d ? d.code === null : false,
    code: d?.code ?? "",
    title: d?.title ?? "",
    description: d?.description ?? "",
    type: d?.type ?? "percent",
    percent: d?.type === "percent" ? String(d.value) : "",
    amount: d?.type === "fixed" ? paiseToRupees(d.value) : "",
    maxDiscount: paiseToRupees(d?.maxDiscount),
    minSubtotal: paiseToRupees(d?.minSubtotal),
    region: d?.region ?? "all",
    startsAt: toLocalInput(d?.startsAt ?? null),
    endsAt: toLocalInput(d?.endsAt ?? null),
    usageLimit: d?.usageLimit ? String(d.usageLimit) : "",
    perCustomerLimit: d?.perCustomerLimit ? String(d.perCustomerLimit) : "",
    firstOrderOnly: d?.firstOrderOnly ?? false,
    // New codes are listed by default; existing ones keep their setting.
    showInOffers: d?.showInOffers ?? true,
    isActive: d?.isActive ?? true,
  };
}

const int = (v: string) => (v.trim() ? Number(v) : null);

/** Builds the API body; returns field errors for values that aren't numbers. */
function toInput(d: Draft): { input: DiscountInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const money = (key: string, v: string) => {
    const paise = rupeesToPaise(v);
    if (Number.isNaN(paise)) errors[key] = "Enter an amount in rupees";
    return paise;
  };
  const value = d.type === "percent" ? Number(d.percent || NaN) : d.type === "fixed" ? money("value", d.amount) : 0;
  if (d.type !== "free_shipping" && (value === null || Number.isNaN(value))) {
    errors.value = d.type === "percent" ? "Enter a percentage from 1 to 100" : "Enter an amount in rupees";
  }
  const input: DiscountInput = {
    code: d.automatic ? null : d.code.trim().toUpperCase(),
    title: d.title.trim(),
    description: d.description.trim() || null,
    type: d.type,
    value: value ?? 0,
    maxDiscount: d.type === "percent" ? money("maxDiscount", d.maxDiscount) : null,
    minSubtotal: money("minSubtotal", d.minSubtotal) ?? 0,
    region: d.region,
    startsAt: fromLocalInput(d.startsAt),
    endsAt: fromLocalInput(d.endsAt),
    usageLimit: int(d.usageLimit),
    perCustomerLimit: int(d.perCustomerLimit),
    firstOrderOnly: d.firstOrderOnly,
    showInOffers: !d.automatic && d.showInOffers,
    isActive: d.isActive,
  };
  return { input, errors };
}

const TYPES: { value: DiscountType; label: string; hint: string }[] = [
  { value: "percent", label: "Percentage", hint: "e.g. 10% off" },
  { value: "fixed", label: "Fixed amount", hint: "e.g. ₹100 off" },
  { value: "free_shipping", label: "Free shipping", hint: "Removes the delivery fee" },
];

export function DiscountForm({ discount }: { discount?: AdminDiscount }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(discount));
  const [initial] = useState(() => JSON.stringify(toDraft(discount)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== initial;
  useUnsavedChangesWarning(dirty && !saving);

  const set = <K extends keyof Draft>(key: K, value: Draft[K], errorKey: string = key) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => withoutError(e, errorKey));
  };
  const fid = (name: string) => `${uid}-${name}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { input, errors: local } = toInput(draft);
    if (!input.title) local.title = "Enter a title customers will see";
    if (!draft.automatic && !input.code) local.code = "Enter a code, or choose Automatic offer";
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError("Check the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api<AdminDiscount>(discount ? `/admin/discounts/${discount.id}` : "/admin/discounts", {
        method: discount ? "PUT" : "POST",
        body: input,
      });
      toast.success(discount ? "Discount saved" : `${saved.code ?? saved.title} created`);
      router.push("/admin/discounts");
    } catch (err) {
      const fieldErrors = validationErrors(err);
      if (fieldErrors) setErrors(fieldErrors);
      if (err instanceof ApiError && err.code === "CODE_TAKEN") setErrors({ code: "This code is already taken" });
      setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  const preview = toInput(draft).input;
  return (
    <form onSubmit={save} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        <Panel title="How customers get it">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Discount kind</legend>
            {[
              { automatic: false, title: "Discount code", text: "Customers type a code at checkout." },
              { automatic: true, title: "Automatic offer", text: "Applies by itself when the cart qualifies." },
            ].map((o) => (
              <label
                key={o.title}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-zinc-900",
                  draft.automatic === o.automatic ? "border-brand-600 bg-brand-50" : "border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-kind`}
                  checked={draft.automatic === o.automatic}
                  onChange={() => set("automatic", o.automatic, "code")}
                  className="mt-0.5 size-4 shrink-0 accent-brand-700"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{o.title}</span>
                  <span className="block text-xs text-zinc-600">{o.text}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {!draft.automatic && (
              <Field label="Code" htmlFor={fid("code")} error={errors.code} hint="Letters, numbers, - or _. Not case sensitive.">
                <div className="flex gap-2">
                  <Input
                    id={fid("code")}
                    value={draft.code}
                    onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
                    placeholder="DIWALI10"
                    maxLength={30}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 font-mono uppercase"
                    aria-invalid={errors.code ? true : undefined}
                  />
                  <Button variant="outline" onClick={() => set("code", randomCode())}>
                    Generate
                  </Button>
                </div>
              </Field>
            )}
            <Field
              label="Title"
              htmlFor={fid("title")}
              error={errors.title}
              hint="Shown to customers, e.g. Diwali offer."
              className={cn(draft.automatic && "sm:col-span-2")}
            >
              <Input
                id={fid("title")}
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={80}
                aria-invalid={errors.title ? true : undefined}
              />
            </Field>
            <Field label="Description (optional)" htmlFor={fid("description")} error={errors.description} className="sm:col-span-2">
              <Textarea
                id={fid("description")}
                rows={2}
                maxLength={300}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Value">
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Discount type</legend>
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-zinc-900",
                  draft.type === t.value ? "border-brand-600 bg-brand-50" : "border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-type`}
                  checked={draft.type === t.value}
                  onChange={() => set("type", t.value, "value")}
                  className="mt-0.5 size-4 shrink-0 accent-brand-700"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{t.label}</span>
                  <span className="block text-xs text-zinc-600">{t.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {draft.type !== "free_shipping" && (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {draft.type === "percent" ? (
                <>
                  <Field label="Percentage off" htmlFor={fid("value")} error={errors.value}>
                    <Affix suffix="%">
                      <Input
                        id={fid("value")}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        value={draft.percent}
                        onChange={(e) => set("percent", e.target.value, "value")}
                        aria-invalid={errors.value ? true : undefined}
                      />
                    </Affix>
                  </Field>
                  <Field label="Maximum discount (optional)" htmlFor={fid("max")} error={errors.maxDiscount} hint="Caps the saving on big orders.">
                    <Affix prefix="₹">
                      <Input
                        id={fid("max")}
                        type="number"
                        inputMode="decimal"
                        min={1}
                        step={0.01}
                        value={draft.maxDiscount}
                        onChange={(e) => set("maxDiscount", e.target.value)}
                        className="pl-7"
                        aria-invalid={errors.maxDiscount ? true : undefined}
                      />
                    </Affix>
                  </Field>
                </>
              ) : (
                <Field label="Amount off" htmlFor={fid("value")} error={errors.value}>
                  <Affix prefix="₹">
                    <Input
                      id={fid("value")}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={0.01}
                      value={draft.amount}
                      onChange={(e) => set("amount", e.target.value, "value")}
                      className="pl-7"
                      aria-invalid={errors.value ? true : undefined}
                    />
                  </Affix>
                </Field>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Conditions">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Minimum order (optional)" htmlFor={fid("min")} error={errors.minSubtotal} hint="Cart subtotal before delivery.">
              <Affix prefix="₹">
                <Input
                  id={fid("min")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={draft.minSubtotal}
                  onChange={(e) => set("minSubtotal", e.target.value)}
                  className="pl-7"
                  aria-invalid={errors.minSubtotal ? true : undefined}
                />
              </Affix>
            </Field>
            <Field label="Delivery region" htmlFor={fid("region")} error={errors.region}>
              <Select id={fid("region")} value={draft.region} onChange={(e) => set("region", e.target.value as Draft["region"])}>
                <option value="all">Everywhere</option>
                <option value="domestic">Deliveries within India</option>
                <option value="international">International deliveries</option>
              </Select>
            </Field>
            <Field label="Total uses (optional)" htmlFor={fid("usage")} error={errors.usageLimit} hint="Orders that can use it in total.">
              <Input
                id={fid("usage")}
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.usageLimit}
                onChange={(e) => set("usageLimit", e.target.value)}
                placeholder="Unlimited"
                aria-invalid={errors.usageLimit ? true : undefined}
              />
            </Field>
            <Field label="Uses per customer (optional)" htmlFor={fid("per")} error={errors.perCustomerLimit}>
              <Input
                id={fid("per")}
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.perCustomerLimit}
                onChange={(e) => set("perCustomerLimit", e.target.value)}
                placeholder="Unlimited"
                aria-invalid={errors.perCustomerLimit ? true : undefined}
              />
            </Field>
            <Checkbox
              className="sm:col-span-2"
              label="Only for a customer's first order"
              checked={draft.firstOrderOnly}
              onChange={(e) => set("firstOrderOnly", e.target.checked)}
            />
          </div>
        </Panel>

        <Panel title="Schedule" description="Leave empty to start now and run until you switch it off.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts" htmlFor={fid("starts")} error={errors.startsAt}>
              <Input id={fid("starts")} type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </Field>
            <Field label="Ends" htmlFor={fid("ends")} error={errors.endsAt}>
              <Input
                id={fid("ends")}
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                aria-invalid={errors.endsAt ? true : undefined}
              />
            </Field>
          </div>
        </Panel>
      </div>

      <div className="space-y-4 lg:sticky lg:top-8">
        <Panel title="Summary">
          <p className="text-sm font-medium text-zinc-900">
            {draft.automatic ? "Automatic offer" : preview.code ? <span className="font-mono">{preview.code}</span> : "New code"}
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            {preview.title || "Untitled"}: {Number.isNaN(preview.value) ? "…" : discountValueLabel(preview)}
          </p>
          <Checkbox
            className="mt-4"
            label="Active"
            checked={draft.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          <p className="mt-1 text-xs text-zinc-500">Turn off to pause it without deleting.</p>
          {draft.automatic ? (
            <p className="mt-4 text-xs text-zinc-500">
              Automatic offers are listed to customers under &ldquo;Available offers&rdquo; (product, cart and checkout pages).
            </p>
          ) : (
            <>
              <Checkbox
                className="mt-4"
                label="Show in Available offers"
                checked={draft.showInOffers}
                onChange={(e) => set("showInOffers", e.target.checked)}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Customers see this code with an Apply button on product, cart and checkout pages. Turn off for private codes
                (influencers, staff, apology codes).
              </p>
            </>
          )}
        </Panel>
        {formError && <InlineAlert title="Not saved">{formError}</InlineAlert>}
        <div className="flex gap-2">
          <Button type="submit" loading={saving} className="flex-1">
            {discount ? "Save changes" : "Create discount"}
          </Button>
          <ButtonLink href="/admin/discounts" variant="ghost">
            Cancel
          </ButtonLink>
        </div>
      </div>
    </form>
  );
}

function Affix({ prefix, suffix, children }: { prefix?: string; suffix?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">{prefix}</span>}
        {children}
      </div>
      {suffix && <span className="shrink-0 text-sm text-zinc-500">{suffix}</span>}
    </div>
  );
}
