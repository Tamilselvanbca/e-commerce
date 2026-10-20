"use client";

import { useId, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { PrebookProduct, Prebooking } from "@/lib/types";
import { useAuth } from "@/components/providers";
import { Button, Field, Input, PageLoader, ProductImg, Textarea } from "@/components/ui";
import { CheckCircleIcon, MinusIcon, PlusIcon, SearchIcon, WhatsAppIcon } from "@/components/shop/icons";
import { EMAIL_RE, fieldErrorsFrom, isValidPhone, normalizeIndianPhone } from "@/components/shop/utils";

type Errors = Record<string, string | undefined>;
type Result = Prebooking & { whatsappUrl: string | null };

const MAX_QTY = 9999;

/** "Sat, 1 Nov 2026" for a YYYY-MM-DD date. */
const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

function localDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PrebookSection({ products }: { products: PrebookProduct[] | null }) {
  const { user, loading } = useAuth();
  if (!products || products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
        <p className="text-base font-semibold text-zinc-900">
          {products ? "Nothing to pre-book yet" : "We couldn't load the products"}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {products ? "Our sweets and snacks will be listed here soon." : "Please refresh the page in a moment."}
        </p>
      </div>
    );
  }
  if (loading) return <PageLoader />;
  return <PrebookForm key={user?.id ?? "guest"} products={products} />;
}

function PrebookForm({ products }: { products: PrebookProduct[] }) {
  const { user } = useAuth();
  const uid = useId();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [packs, setPacks] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.variants[0].id])),
  );
  const [search, setSearch] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ? normalizeIndianPhone(user.phone) : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term) || p.category?.name.toLowerCase().includes(term));
  }, [products, search]);

  const chosen = products
    .filter((p) => (quantities[p.id] ?? 0) > 0)
    .map((p) => {
      const variant = p.variants.find((v) => v.id === packs[p.id]) ?? p.variants[0];
      return { product: p, variant, quantity: quantities[p.id] };
    });
  const itemCount = chosen.reduce((sum, c) => sum + c.quantity, 0);
  const total = chosen.reduce((sum, c) => sum + c.variant.price * c.quantity, 0);

  const setQuantity = (productId: string, qty: number) => {
    setQuantities((q) => ({ ...q, [productId]: Math.max(0, Math.min(MAX_QTY, qty)) }));
    if (errors.items) setErrors((e) => ({ ...e, items: undefined }));
  };
  const clear = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  function validate(): Errors {
    const e: Errors = {};
    if (chosen.length === 0) e.items = "Add at least one product (use the + button)";
    if (name.trim().length < 2) e.name = "Enter your name";
    if (!isValidPhone(phone.trim())) e.phone = "Enter a valid 10-digit mobile number";
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address";
    if (!deliveryDate) e.deliveryDate = "Choose the date you need it";
    else if (deliveryDate < localDate(1)) e.deliveryDate = "Choose a date from tomorrow onwards";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const found = validate();
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
      const res = await api<Result>("/prebookings", {
        method: "POST",
        body: {
          name: name.trim(),
          phone: compactPhone.startsWith("+") ? compactPhone : normalizeIndianPhone(compactPhone),
          ...(email.trim() ? { email: email.trim() } : {}),
          deliveryDate,
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          items: chosen.map((c) => ({ variantId: c.variant.id, quantity: c.quantity })),
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
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center sm:p-10" role="status">
        <CheckCircleIcon className="mx-auto size-12 text-emerald-600" />
        <h2 className="mt-4 text-xl font-semibold text-zinc-900">Your pre-booking is received</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Reference <span className="font-mono font-semibold text-zinc-900">{result.reference}</span> for{" "}
          <span className="font-semibold text-zinc-900">{formatDay(result.deliveryDate)}</span> · estimated{" "}
          {formatPrice(result.estimatedTotal)}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600">
          We&apos;ll contact you to confirm the booking and payment.
          {result.whatsappUrl ? " Message us on WhatsApp for a faster reply." : ""}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {result.whatsappUrl && (
            <a
              href={result.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-6 text-base font-medium text-white transition-colors hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <WhatsAppIcon className="size-5" />
              Continue on WhatsApp
            </a>
          )}
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              setResult(null);
              setQuantities({});
            }}
          >
            Pre-book something else
          </Button>
        </div>
      </div>
    );
  }

  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true as const } : {});

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-8">
      <fieldset>
        <legend className="text-lg font-semibold text-zinc-900">1. Choose products</legend>
        <p className="mt-1 text-sm text-zinc-600">All our sweets and snacks, including ones that are sold out today.</p>

        {products.length > 6 && (
          <div className="relative mt-4">
            <label htmlFor={`${uid}-search`} className="sr-only">
              Search products
            </label>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              id={`${uid}-search`}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
              className="pl-9"
            />
          </div>
        )}

        <ul id={`${uid}-items`} tabIndex={-1} className="mt-3 divide-y divide-zinc-100 outline-none">
          {visible.map((p) => {
            const variant = p.variants.find((v) => v.id === packs[p.id]) ?? p.variants[0];
            const qty = quantities[p.id] ?? 0;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                <ProductImg src={p.imageUrl ?? undefined} alt="" className="size-14 shrink-0 rounded-lg border border-zinc-100" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                  {p.category && <p className="truncate text-xs text-zinc-500">{p.category.name}</p>}
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                  {p.variants.length > 1 ? (
                    <>
                      <label htmlFor={`${uid}-pack-${p.id}`} className="sr-only">
                        Pack size for {p.name}
                      </label>
                      <select
                        id={`${uid}-pack-${p.id}`}
                        value={variant.id}
                        onChange={(e) => setPacks((s) => ({ ...s, [p.id]: e.target.value }))}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      >
                        {p.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label ?? "Standard"} · {formatPrice(v.price)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="text-sm tabular-nums text-zinc-700">
                      {variant.label ? `${variant.label} · ` : ""}
                      {formatPrice(variant.price)}
                    </span>
                  )}
                  <div className="flex items-center rounded-lg border border-zinc-300">
                    <button
                      type="button"
                      onClick={() => setQuantity(p.id, qty - 1)}
                      disabled={qty === 0}
                      aria-label={`Fewer ${p.name}`}
                      className="inline-flex size-9 items-center justify-center rounded-l-lg text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                    >
                      <MinusIcon className="size-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_QTY}
                      value={qty}
                      onChange={(e) => setQuantity(p.id, Number.parseInt(e.target.value || "0", 10) || 0)}
                      aria-label={`Quantity of ${p.name}`}
                      className="h-9 w-12 border-x border-zinc-300 text-center text-sm tabular-nums text-zinc-900 [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-zinc-900 [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(p.id, qty + 1)}
                      aria-label={`More ${p.name}`}
                      className="inline-flex size-9 items-center justify-center rounded-r-lg text-zinc-700 hover:bg-zinc-100"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">No products match “{search}”.</li>}
        </ul>
        {errors.items && <p className="mt-2 text-sm text-red-600">{errors.items}</p>}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm">
          <span className="text-brand-900">
            {itemCount === 0 ? "No products chosen yet" : `${itemCount} ${itemCount === 1 ? "item" : "items"} chosen`}
          </span>
          <span className="font-semibold tabular-nums text-brand-900">Estimated {formatPrice(total)}</span>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-zinc-900">2. Your details and date</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor={`${uid}-name`} error={errors.name}>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clear("name");
              }}
              autoComplete="name"
              maxLength={80}
              {...invalid("name")}
            />
          </Field>
          <Field label="Mobile number" htmlFor={`${uid}-phone`} error={errors.phone}>
            <Input
              id={`${uid}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clear("phone");
              }}
              placeholder="10-digit mobile"
              {...invalid("phone")}
            />
          </Field>
          <Field label="Email (optional)" htmlFor={`${uid}-email`} error={errors.email} hint="We'll email you a copy of the booking.">
            <Input
              id={`${uid}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear("email");
              }}
              {...invalid("email")}
            />
          </Field>
          <Field label="Date you need it" htmlFor={`${uid}-deliveryDate`} error={errors.deliveryDate}>
            <Input
              id={`${uid}-deliveryDate`}
              type="date"
              value={deliveryDate}
              min={localDate(1)}
              max={localDate(365)}
              onChange={(e) => {
                setDeliveryDate(e.target.value);
                clear("deliveryDate");
              }}
              suppressHydrationWarning
              {...invalid("deliveryDate")}
            />
          </Field>
        </div>
        <Field label="Delivery address (optional)" htmlFor={`${uid}-address`} error={errors.address} hint="Leave empty if you'll collect it from us.">
          <Textarea
            id={`${uid}-address`}
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
            maxLength={1000}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor={`${uid}-notes`} error={errors.notes} hint="Occasion, delivery time, packing or anything else.">
          <Textarea id={`${uid}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={submitting}>
        Send pre-booking
      </Button>
    </form>
  );
}
