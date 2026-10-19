"use client";

import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { COUNTRIES, countryName, dialCode, DOMESTIC_COUNTRY, toE164 } from "@/lib/countries";
import type { Address, AddressInput } from "@/lib/types";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui";
import { fieldErrorsFrom, normalizeIndianPhone, PINCODE_RE } from "./utils";

const POSTCODE_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,10}$/;

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

type FormState = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
};

type Errors = Partial<Record<keyof FormState, string>>;

/** Shows Indian numbers as 10 digits and others in full international form. */
function displayPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.startsWith("+91") ? normalizeIndianPhone(phone) : phone;
}

function toForm(address?: Partial<Address> | null, defaults?: { fullName?: string | null; phone?: string | null }): FormState {
  return {
    fullName: address?.fullName ?? defaults?.fullName ?? "",
    phone: displayPhone(address?.phone ?? defaults?.phone),
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    landmark: address?.landmark ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    pincode: address?.pincode ?? "",
    country: address?.country ?? "IN",
    isDefault: address?.isDefault ?? false,
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  const name = f.fullName.trim();
  if (name.length < 2 || name.length > 80) e.fullName = "Enter the recipient's full name (2–80 characters)";
  const domestic = f.country === DOMESTIC_COUNTRY;
  if (!toE164(f.phone, dialCode(f.country))) {
    e.phone = domestic ? "Enter a 10-digit mobile number" : `Enter a valid phone number (with +${dialCode(f.country)} or without)`;
  }
  const line1 = f.line1.trim();
  if (line1.length < 3 || line1.length > 200) e.line1 = "Enter the house / flat number and street";
  if (!f.city.trim()) e.city = "Enter the city";
  if (!f.state.trim() || f.state.trim().length < 2) e.state = domestic ? "Select the state" : "Enter the state, province or region";
  if (domestic && !PINCODE_RE.test(f.pincode.trim())) e.pincode = "Enter a 6-digit PIN code";
  if (!domestic && !POSTCODE_RE.test(f.pincode.trim())) e.pincode = "Enter the postal / ZIP code";
  return e;
}

function toInput(f: FormState): AddressInput {
  return {
    fullName: f.fullName.trim(),
    phone: toE164(f.phone, dialCode(f.country)) ?? f.phone.trim(),
    line1: f.line1.trim(),
    line2: f.line2.trim() || null,
    landmark: f.landmark.trim() || null,
    city: f.city.trim(),
    state: f.state.trim(),
    pincode: f.pincode.trim().toUpperCase(),
    country: f.country || DOMESTIC_COUNTRY,
    isDefault: f.isDefault,
  };
}

/**
 * Create / edit an address. Calls `POST /addresses` or `PATCH /addresses/:id`
 * and hands the saved address to `onSaved`.
 */
export function AddressForm({
  address,
  defaults,
  onSaved,
  onCancel,
  submitLabel,
  showDefaultToggle = true,
}: {
  address?: Address | null;
  defaults?: { fullName?: string | null; phone?: string | null };
  onSaved: (address: Address) => void;
  onCancel?: () => void;
  submitLabel?: string;
  showDefaultToggle?: boolean;
}) {
  const uid = useId();
  const [form, setForm] = useState<FormState>(() => toForm(address, defaults));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(address?.id);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const id = (name: string) => `${uid}-${name}`;
  const domestic = form.country === DOMESTIC_COUNTRY;
  const states = form.state && !INDIAN_STATES.includes(form.state) ? [form.state, ...INDIAN_STATES] : INDIAN_STATES;

  const setCountry = (country: string) => {
    setForm((f) => ({
      ...f,
      country,
      // Indian states / PIN codes don't carry over to other countries (and vice versa).
      state: (country === DOMESTIC_COUNTRY) === (f.country === DOMESTIC_COUNTRY) ? f.state : "",
      pincode: (country === DOMESTIC_COUNTRY) === (f.country === DOMESTIC_COUNTRY) ? f.pincode : "",
    }));
    setErrors({});
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(id(first))?.focus();
      return;
    }
    setSaving(true);
    try {
      const body = toInput(form);
      const saved = editing
        ? await api<Address>(`/addresses/${address!.id}`, { method: "PATCH", body })
        : await api<Address>("/addresses", { method: "POST", body });
      onSaved(saved);
    } catch (err) {
      const fieldErrors = fieldErrorsFrom(err);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors as Errors);
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const err = (key: keyof FormState) => (errors[key] ? { "aria-invalid": true } : {});

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field
        label="Country"
        htmlFor={id("country")}
        error={errors.country}
        hint={domestic ? undefined : "International delivery: shipping is calculated at checkout. Customs duties, if any, are paid on delivery."}
      >
        <Select id={id("country")} value={form.country} onChange={(e) => setCountry(e.target.value)} autoComplete="country">
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor={id("fullName")} error={errors.fullName}>
          <Input
            id={id("fullName")}
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            autoComplete="name"
            maxLength={80}
            required
            {...err("fullName")}
          />
        </Field>
        <Field label="Mobile number" htmlFor={id("phone")} error={errors.phone}>
          <Input
            id={id("phone")}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={domestic ? "10-digit mobile" : `+${dialCode(form.country)} …`}
            required
            {...err("phone")}
          />
        </Field>
      </div>
      <Field label="Address line 1" htmlFor={id("line1")} error={errors.line1} hint="House / flat no., building, street">
        <Input
          id={id("line1")}
          value={form.line1}
          onChange={(e) => set("line1", e.target.value)}
          autoComplete="address-line1"
          maxLength={200}
          required
          {...err("line1")}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 2 (optional)" htmlFor={id("line2")} error={errors.line2} hint="Area, locality">
          <Input
            id={id("line2")}
            value={form.line2}
            onChange={(e) => set("line2", e.target.value)}
            autoComplete="address-line2"
            maxLength={200}
          />
        </Field>
        <Field label="Landmark (optional)" htmlFor={id("landmark")} error={errors.landmark}>
          <Input id={id("landmark")} value={form.landmark} onChange={(e) => set("landmark", e.target.value)} maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" htmlFor={id("city")} error={errors.city}>
          <Input
            id={id("city")}
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            autoComplete="address-level2"
            required
            {...err("city")}
          />
        </Field>
        <Field label={domestic ? "State" : "State / province / region"} htmlFor={id("state")} error={errors.state}>
          {domestic ? (
            <Select
              id={id("state")}
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              autoComplete="address-level1"
              required
              {...err("state")}
            >
              <option value="">Select state</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={id("state")}
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              autoComplete="address-level1"
              maxLength={80}
              required
              {...err("state")}
            />
          )}
        </Field>
        <Field label={domestic ? "PIN code" : "Postal / ZIP code"} htmlFor={id("pincode")} error={errors.pincode}>
          <Input
            id={id("pincode")}
            value={form.pincode}
            onChange={(e) =>
              set("pincode", domestic ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.slice(0, 12))
            }
            inputMode={domestic ? "numeric" : "text"}
            autoComplete="postal-code"
            maxLength={domestic ? 6 : 12}
            required
            {...err("pincode")}
          />
        </Field>
      </div>
      {showDefaultToggle && !(editing && address?.isDefault) && (
        <Checkbox
          label="Make this my default address"
          checked={form.isDefault}
          onChange={(e) => set("isDefault", e.target.checked)}
        />
      )}
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {submitLabel ?? (editing ? "Save changes" : "Save address")}
        </Button>
      </div>
    </form>
  );
}

/** Read-only address block. */
export function AddressLines({
  address,
  className,
}: {
  address: Omit<Address, "id" | "isDefault">;
  className?: string;
}) {
  const cityLine = [address.city, address.state].filter(Boolean).join(", ");
  return (
    <address className={className ?? "not-italic text-sm leading-6 text-zinc-600"}>
      <span className="block font-medium text-zinc-900">{address.fullName}</span>
      <span className="block">{address.line1}</span>
      {address.line2 && <span className="block">{address.line2}</span>}
      {address.landmark && <span className="block">Near {address.landmark}</span>}
      <span className="block">
        {cityLine} {address.pincode}
        {address.country && address.country !== DOMESTIC_COUNTRY ? `, ${countryName(address.country)}` : ""}
      </span>
      <span className="block">Phone: {address.phone}</span>
    </address>
  );
}
