"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";
import type { SettingField, VerifyTemplate } from "@/lib/types";
import { useToast } from "@/components/providers";
import { Badge, Button, Checkbox, Input, Select } from "@/components/ui";
import { IconCopy } from "./icons";

/** A pending change to one setting. Absent = unchanged. */
export type SettingEdit = { kind: "value"; value: string } | { kind: "reset" } | { kind: "remove" };

/** Server value → what the input shows (money is stored in paise, edited in rupees). */
export function toInput(field: SettingField, raw: string | null): string {
  if (raw === null) return "";
  if (field.type === "money") {
    const paise = Number(raw);
    return raw !== "" && Number.isFinite(paise) ? String(paise / 100) : raw;
  }
  return raw;
}

/** Input text → value sent to the API. Invalid numbers pass through so the API can explain. */
export function fromInput(field: SettingField, text: string): string {
  const value = text.trim();
  if (field.type === "money") {
    const rupees = Number(value);
    return value !== "" && Number.isFinite(rupees) ? String(Math.round(rupees * 100)) : value;
  }
  return value;
}

const SOURCE_BADGES = {
  admin: { label: "Saved here", className: "bg-brand-50 text-brand-800 ring-brand-200" },
  env: { label: "From .env", className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  default: { label: "Default", className: "bg-white text-zinc-500 ring-zinc-200" },
} as const;

export function SettingFieldRow({
  field,
  edit,
  error,
  webhookUrl,
  onEdit,
}: {
  field: SettingField;
  edit: SettingEdit | undefined;
  error: string | undefined;
  webhookUrl?: string;
  onEdit: (edit: SettingEdit | undefined) => void;
}) {
  const id = `setting-${field.key}`;
  const helpId = `${id}-help`;
  const badge = SOURCE_BADGES[field.source];
  const resetting = edit?.kind === "reset";
  const describedBy = error || field.help ? helpId : undefined;

  const shown =
    edit?.kind === "value" ? edit.value : resetting ? toInput(field, field.fallback.value) : toInput(field, field.value);
  const setText = (value: string) => onEdit({ kind: "value", value });

  let control: React.ReactNode;
  if (field.type === "secret") {
    control = <SecretControl id={id} field={field} edit={edit} describedBy={describedBy} invalid={Boolean(error)} onEdit={onEdit} />;
  } else if (field.type === "boolean") {
    control = (
      <Checkbox
        id={id}
        label={field.checkboxLabel ?? "Enabled"}
        checked={shown === "true"}
        onChange={(e) => setText(e.target.checked ? "true" : "false")}
        aria-describedby={describedBy}
      />
    );
  } else if (field.type === "select") {
    const options = field.options ?? [];
    const known = options.some((o) => o.value === shown);
    control = (
      <Select id={id} value={shown} onChange={(e) => setText(e.target.value)} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy}>
        {!known && <option value={shown}>{shown || "Choose…"}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  } else {
    const numeric = field.type === "number" || field.type === "money";
    const prefix = field.type === "money" ? "₹" : field.prefix;
    control = (
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {prefix && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">{prefix}</span>
          )}
          <Input
            id={id}
            type={numeric ? "number" : field.type === "text" ? "text" : field.type}
            inputMode={field.type === "money" || (field.step ?? 1) < 1 ? "decimal" : numeric ? "numeric" : undefined}
            step={field.type === "money" ? 0.01 : field.step}
            min={field.type === "money" ? 0 : field.min}
            max={field.type === "money" ? undefined : field.max}
            value={shown}
            placeholder={field.placeholder}
            required={field.required}
            spellCheck={false}
            autoComplete="off"
            className={cn(prefix && "pl-7")}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
          />
        </div>
        {field.suffix && <span className="shrink-0 text-sm text-zinc-500">{field.suffix}</span>}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {field.type === "boolean" ? (
          <p className="text-sm font-medium text-zinc-800">{field.label}</p>
        ) : (
          <label htmlFor={id} className="text-sm font-medium text-zinc-800">
            {field.label}
            {field.required && <span className="text-zinc-400"> (required)</span>}
          </label>
        )}
        <span className="flex items-center gap-2">
          {resetting ? (
            <button type="button" onClick={() => onEdit(undefined)} className="text-xs font-medium text-brand-800 underline-offset-2 hover:underline">
              Undo
            </button>
          ) : (
            field.source === "admin" && (
              <button
                type="button"
                onClick={() => onEdit({ kind: "reset" })}
                className="text-xs text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
                title={field.type === "secret" ? undefined : `.env value: ${toInput(field, field.fallback.value) || "(empty)"}`}
              >
                Use .env value
              </button>
            )
          )}
          <Badge className={resetting ? "bg-amber-50 text-amber-800 ring-amber-200" : badge.className}>
            {resetting ? "Resets on save" : badge.label}
          </Badge>
        </span>
      </div>

      {resetting && field.type !== "secret" ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Will use the .env value: <span className="font-medium text-zinc-900">{shown || "(empty)"}</span>
        </div>
      ) : (
        control
      )}

      {field.lookup === "twilioVerifyTemplates" && !resetting && <VerifyTemplatePicker value={shown} onPick={setText} />}
      {webhookUrl && <WebhookUrl url={webhookUrl} />}

      {error ? (
        <p id={helpId} className="text-xs text-red-600">
          {error}
        </p>
      ) : field.help ? (
        <p id={helpId} className="text-xs text-zinc-500">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}

function SecretControl({
  id,
  field,
  edit,
  describedBy,
  invalid,
  onEdit,
}: {
  id: string;
  field: SettingField;
  edit: SettingEdit | undefined;
  describedBy?: string;
  invalid: boolean;
  onEdit: (edit: SettingEdit | undefined) => void;
}) {
  const [visible, setVisible] = useState(false);
  const isSet = field.secret?.set ?? false;

  if (edit?.kind === "remove" || edit?.kind === "reset") {
    const text =
      edit.kind === "remove"
        ? "Will be removed when you save."
        : `Will use the .env value when you save${field.fallback.set ? "" : " (not set there)"}.`;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span>{text}</span>
        <button type="button" onClick={() => onEdit(undefined)} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
          Undo
        </button>
      </div>
    );
  }

  if (isSet && edit?.kind !== "value") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5">
        <span className="font-mono text-sm text-zinc-800">{field.secret?.hint ?? "••••"}</span>
        <span className="text-xs text-zinc-500">Hidden for security</span>
        <span className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => onEdit({ kind: "value", value: "" })} aria-label={`Replace ${field.label}`}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => onEdit({ kind: "remove" })} aria-label={`Remove ${field.label}`}>
            Remove
          </Button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={edit?.kind === "value" ? edit.value : ""}
        placeholder={isSet ? "Enter the new value" : (field.placeholder ?? "Not set")}
        autoComplete="new-password"
        spellCheck={false}
        autoFocus={isSet}
        onChange={(e) => onEdit({ kind: "value", value: e.target.value })}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-0 flex-1 font-mono"
      />
      <Button size="sm" variant="ghost" onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-label={visible ? "Hide value" : "Show value"}>
        {visible ? "Hide" : "Show"}
      </Button>
      {isSet && (
        <Button size="sm" variant="ghost" onClick={() => onEdit(undefined)}>
          Cancel
        </Button>
      )}
    </div>
  );
}

function WebhookUrl({ url }: { url: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
      <span>Webhook URL:</span>
      <code className="break-all rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-800">{url}</code>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-zinc-700 hover:bg-zinc-100"
        onClick={() => {
          navigator.clipboard.writeText(url).then(
            () => toast.success("Webhook URL copied"),
            () => toast.error("Couldn't copy. Select the address and copy it manually."),
          );
        }}
      >
        <IconCopy className="size-3.5" />
        Copy
      </button>
    </div>
  );
}

function VerifyTemplatePicker({ value, onPick }: { value: string; onPick: (sid: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<VerifyTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: VerifyTemplate[] }>("/admin/settings/twilio-verify-templates");
      setItems(res.items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!items) {
    return (
      <div className="space-y-1">
        <Button size="sm" variant="outline" onClick={load} loading={loading}>
          Choose from my Twilio templates
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  const choices = [{ sid: "", name: "Service default", channels: [], text: "The standard message of your Verify service." }, ...items];
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-zinc-500">
        {items.length ? "Pick the message customers receive (uses the saved Twilio keys):" : "No templates found on this Twilio account."}
      </legend>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {choices.map((t) => (
          <label
            key={t.sid || "default"}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
              value === t.sid ? "border-brand-600 bg-brand-50" : "border-zinc-200 hover:bg-zinc-50",
            )}
          >
            <input
              type="radio"
              name="twilio-verify-template"
              checked={value === t.sid}
              onChange={() => onPick(t.sid)}
              className="mt-0.5 size-4 shrink-0 accent-brand-700"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-900">{t.name}</span>
              {t.sid && <span className="block break-all font-mono text-xs text-zinc-500">{t.sid}</span>}
              {t.text && <span className="mt-1 block text-xs leading-5 text-zinc-600">{t.text}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
