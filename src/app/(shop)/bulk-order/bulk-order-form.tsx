"use client";

import { useId, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { whatsappUrl } from "@/lib/format";
import type { BulkEnquiryItem } from "@/lib/types";
import { useAuth, useStoreConfig } from "@/components/providers";
import { Button, Field, Input, PageLoader, Textarea } from "@/components/ui";
import { CheckCircleIcon, PlusIcon, TrashIcon, WhatsAppIcon } from "@/components/shop/icons";
import { EMAIL_RE, fieldErrorsFrom, isValidPhone, normalizeIndianPhone } from "@/components/shop/utils";

export type BulkPrefill = {
  productId: string;
  productName: string;
  variantOptions: string[];
};

type Row = { key: number; productId: string | null; productName: string; variantLabel: string; quantity: string };
type Errors = Record<string, string | undefined>;

const MAX_ROWS = 50;

export function BulkOrderSection({ prefill }: { prefill: BulkPrefill | null }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return <BulkOrderForm key={user?.id ?? "guest"} prefill={prefill} />;
}

function BulkOrderForm({ prefill }: { prefill: BulkPrefill | null }) {
  const config = useStoreConfig();
  const { user } = useAuth();
  const uid = useId();
  const nextKey = useRef(2);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ? normalizeIndianPhone(user.phone) : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [
    prefill
      ? { key: 1, productId: prefill.productId, productName: prefill.productName, variantLabel: "", quantity: "50" }
      : { key: 1, productId: null, productName: "", variantLabel: "", quantity: "" },
  ]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; whatsappUrl: string | null } | null>(null);

  const updateRow = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((e) => ({ ...e, [`row-${key}`]: undefined }));
  };
  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    const key = nextKey.current++;
    setRows((rs) => [...rs, { key, productId: null, productName: "", variantLabel: "", quantity: "" }]);
  };
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  function validate(): { errors: Errors; items: BulkEnquiryItem[] } {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = "Enter your name";
    if (!isValidPhone(phone.trim())) e.phone = "Enter a valid 10-digit mobile number";
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address";
    const items: BulkEnquiryItem[] = [];
    for (const r of rows) {
      const productName = r.productName.trim();
      const qtyText = r.quantity.trim();
      if (!productName && !qtyText && !r.variantLabel.trim()) continue;
      const qty = Number.parseInt(qtyText, 10);
      if (!productName) e[`row-${r.key}`] = "Enter the product name";
      else if (!Number.isFinite(qty) || qty < 1) e[`row-${r.key}`] = "Enter a quantity of at least 1";
      else {
        items.push({
          productId: r.productId && productName === prefill?.productName ? r.productId : undefined,
          productName,
          variantLabel: r.variantLabel.trim() || undefined,
          quantity: qty,
        });
      }
    }
    if (items.length === 0 && !message.trim() && Object.keys(e).every((k) => !k.startsWith("row-"))) {
      e.message = "Tell us what you need, or add at least one item";
    }
    return { errors: e, items };
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const { errors: found, items } = validate();
    setErrors(found);
    setFormError(null);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      document.getElementById(`${uid}-${firstKey}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const compactPhone = phone.trim().replace(/[\s-]/g, "");
      const res = await api<{ id: string; whatsappUrl: string | null }>("/bulk-enquiries", {
        method: "POST",
        body: {
          name: name.trim(),
          phone: compactPhone.startsWith("+") ? compactPhone : normalizeIndianPhone(compactPhone),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(company.trim() ? { company: company.trim() } : {}),
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(items.length ? { items } : {}),
        },
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const chatHref =
      result.whatsappUrl ??
      (config.whatsappNumber ? whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I just sent a bulk order enquiry (ref ${result.id}).`) : null);
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center sm:p-10" role="status">
        <CheckCircleIcon className="mx-auto size-12 text-emerald-600" />
        <h2 className="mt-4 text-xl font-semibold text-zinc-900">Thanks, we&apos;ve got your enquiry</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600">
          Our team will get back to you with pricing and timelines, usually within one working day.
          {chatHref ? " Continue on WhatsApp for a faster response." : ""}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {chatHref && (
            <a
              href={chatHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-6 text-base font-medium text-white transition-colors hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <WhatsAppIcon className="size-5" />
              Continue on WhatsApp
            </a>
          )}
          <Button variant="outline" size="lg" onClick={() => setResult(null)}>
            Send another enquiry
          </Button>
        </div>
      </div>
    );
  }

  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true } : {});

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Request a bulk quote</h2>
        <p className="mt-1 text-sm text-zinc-600">Share a few details and we&apos;ll send you a quote.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor={`${uid}-name`} error={errors.name}>
          <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} {...invalid("name")} />
        </Field>
        <Field label="Mobile number" htmlFor={`${uid}-phone`} error={errors.phone}>
          <Input
            id={`${uid}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile"
            {...invalid("phone")}
          />
        </Field>
        <Field label="Email (optional)" htmlFor={`${uid}-email`} error={errors.email}>
          <Input id={`${uid}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...invalid("email")} />
        </Field>
        <Field label="Company / organisation (optional)" htmlFor={`${uid}-company`} error={errors.company}>
          <Input id={`${uid}-company`} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-zinc-800">Items</legend>
        <p className="mt-0.5 text-xs text-zinc-500">Add the sweets and snacks you&apos;re interested in. Pack sizes and flavours can be mixed.</p>
        <div className="mt-3 space-y-3">
          {rows.map((r, i) => {
            const err = errors[`row-${r.key}`];
            const listId = r.productId && prefill?.variantOptions.length ? `${uid}-variants` : undefined;
            return (
              <div key={r.key} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_6rem_auto] sm:items-end">
                  <div>
                    <label htmlFor={`${uid}-row-${r.key}`} className="mb-1 block text-xs font-medium text-zinc-600">
                      Product {rows.length > 1 ? i + 1 : ""}
                    </label>
                    <Input
                      id={`${uid}-row-${r.key}`}
                      value={r.productName}
                      onChange={(e) => updateRow(r.key, { productName: e.target.value })}
                      placeholder="e.g. Classic cotton tee"
                      maxLength={200}
                      aria-invalid={err ? true : undefined}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-variant-${r.key}`} className="mb-1 block text-xs font-medium text-zinc-600">
                      Pack size / flavour
                    </label>
                    <Input
                      id={`${uid}-variant-${r.key}`}
                      value={r.variantLabel}
                      onChange={(e) => updateRow(r.key, { variantLabel: e.target.value })}
                      placeholder="Optional"
                      list={listId}
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-qty-${r.key}`} className="mb-1 block text-xs font-medium text-zinc-600">
                      Quantity
                    </label>
                    <Input
                      id={`${uid}-qty-${r.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      aria-invalid={err ? true : undefined}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => removeRow(r.key)}
                    disabled={rows.length === 1}
                    aria-label={`Remove item ${i + 1}`}
                    className="justify-self-end"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
                {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
              </div>
            );
          })}
        </div>
        {prefill && prefill.variantOptions.length > 0 && (
          <datalist id={`${uid}-variants`}>
            {prefill.variantOptions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        )}
        {rows.length < MAX_ROWS && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={addRow}>
            <PlusIcon className="size-4" />
            Add another item
          </Button>
        )}
      </fieldset>

      <Field label="Message" htmlFor={`${uid}-message`} error={errors.message} hint="Deadline, branding / printing needs, delivery city…">
        <Textarea
          id={`${uid}-message`}
          rows={4}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (errors.message) setErrors((x) => ({ ...x, message: undefined }));
          }}
          maxLength={2000}
          {...invalid("message")}
        />
      </Field>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={submitting}>
        Send enquiry
      </Button>
    </form>
  );
}
