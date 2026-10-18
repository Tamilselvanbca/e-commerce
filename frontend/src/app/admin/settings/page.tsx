"use client";

import { Fragment, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";
import type { AdminSettings, SettingField, SettingsGroup } from "@/lib/types";
import { useAuth, useToast } from "@/components/providers";
import { Button, Input, PageLoader } from "@/components/ui";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { useApiQuery, useUnsavedChangesWarning } from "@/components/admin/hooks";
import { DescriptionList, PageHeader, Panel } from "@/components/admin/page-header";
import { SettingFieldRow, fromInput, type SettingEdit } from "@/components/admin/setting-field";
import { validationErrors, type FieldErrors } from "@/components/admin/utils";

export default function AdminSettingsPage() {
  const { data, error, isLoading, reload, setData } = useApiQuery<AdminSettings>("/admin/settings");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Changes apply to the live store straight away. Anything not saved here uses the value from the server's .env file."
      />
      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <LoadError error={error} onRetry={reload} what="settings" />
      ) : (
        <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <nav aria-label="Settings sections" className="mb-5 lg:sticky lg:top-8 lg:mb-0">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
              {[...data.groups, { id: "server", title: "Server" }].map((g) => (
                <li key={g.id}>
                  <a
                    href={`#${g.id}`}
                    className="block rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 lg:rounded-lg lg:border-0 lg:bg-transparent lg:py-2"
                  >
                    {g.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-6">
            {data.groups.map((group) => (
              <GroupForm key={group.id} group={group} settings={data} onSaved={(next) => setData(() => next)} />
            ))}
            <ServerPanel server={data.server} />
          </div>
        </div>
      )}
    </>
  );
}

/** Builds the PUT body for a group: only settings whose value would actually change. */
function changesFor(fields: SettingField[], edits: Record<string, SettingEdit>) {
  const values: Record<string, string | null> = {};
  for (const field of fields) {
    const edit = edits[field.key];
    if (!edit) continue;
    if (edit.kind === "reset") {
      if (field.source === "admin") values[field.key] = null;
    } else if (edit.kind === "remove") {
      values[field.key] = "";
    } else if (field.type === "secret") {
      if (edit.value.trim()) values[field.key] = edit.value.trim();
    } else {
      const next = fromInput(field, edit.value);
      if (next !== field.value) values[field.key] = next;
    }
  }
  return values;
}

/** Fields wider than half the grid: long selects, checkboxes, pickers and URLs. */
const isWide = (f: SettingField) => f.type === "select" || f.type === "boolean" || f.type === "url" || Boolean(f.lookup || f.webhook);

function GroupForm({
  group,
  settings,
  onSaved,
}: {
  group: SettingsGroup;
  settings: AdminSettings;
  onSaved: (next: AdminSettings) => void;
}) {
  const toast = useToast();
  const [edits, setEdits] = useState<Record<string, SettingEdit>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changes = changesFor(group.fields, edits);
  const dirty = Object.keys(changes).length > 0;
  useUnsavedChangesWarning(dirty);

  const setEdit = (key: string, edit: SettingEdit | undefined) => {
    setEdits((prev) => {
      const next = { ...prev };
      if (edit) next[key] = edit;
      else delete next[key];
      return next;
    });
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setFormError(null);
    try {
      const next = await api<AdminSettings>("/admin/settings", { method: "PUT", body: { values: changes } });
      onSaved(next);
      setEdits({});
      setErrors({});
      toast.success(`${group.title} saved`);
    } catch (err) {
      const fieldErrors = validationErrors(err);
      if (fieldErrors) {
        setErrors(fieldErrors);
        const unshown = Object.keys(fieldErrors).some((key) => !group.fields.some((f) => f.key === key));
        setFormError(unshown ? errorMessage(err) : "Check the highlighted settings.");
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const adminEmail = group.fields.find((f) => f.key === "ADMIN_NOTIFY_EMAIL")?.value ?? "";

  return (
    <form onSubmit={save} noValidate>
      <Panel id={group.id} title={group.title} description={group.description} className="scroll-mt-20 lg:scroll-mt-8">
        {group.id === "payments" && settings.server.mockPayments && (
          <InlineAlert tone="warning" className="mb-5" title="Test payments are switched on">
            Customers can &ldquo;pay&rdquo; without being charged (ENABLE_MOCK_PAYMENTS in .env). Turn this off on the server before going live.
          </InlineAlert>
        )}
        {group.id === "login" && settings.server.otpCodesInResponse && (
          <InlineAlert tone="warning" className="mb-5" title="Development mode">
            Login codes are shown on screen (OTP_EXPOSE_IN_RESPONSE in .env). This is ignored for Twilio Verify and must be off in production.
          </InlineAlert>
        )}

        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          {group.fields.map((field, i) => (
            <Fragment key={field.key}>
              {field.section && (
                <h3 className={cn("text-xs font-semibold uppercase tracking-wider text-zinc-500 md:col-span-2", i > 0 && "mt-2 border-t border-zinc-100 pt-5")}>
                  {field.section}
                </h3>
              )}
              <div className={cn(isWide(field) && "md:col-span-2")}>
                <SettingFieldRow
                  field={field}
                  edit={edits[field.key]}
                  error={errors[field.key]}
                  webhookUrl={field.webhook ? settings.webhooks[field.webhook] : undefined}
                  onEdit={(edit) => setEdit(field.key, edit)}
                />
              </div>
            </Fragment>
          ))}
        </div>

        {group.id === "email" && <TestEmail defaultTo={adminEmail} disabled={dirty} />}

        <div className="mt-6 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {formError && (
            <InlineAlert className="sm:mr-auto" title="Not saved">
              {formError}
            </InlineAlert>
          )}
          {dirty && !formError && <p className="text-sm text-zinc-500 sm:mr-auto">You have unsaved changes.</p>}
          <div className="flex gap-2">
            {(dirty || Object.keys(edits).length > 0) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEdits({});
                  setErrors({});
                  setFormError(null);
                }}
                disabled={saving}
              >
                Discard
              </Button>
            )}
            <Button type="submit" loading={saving} disabled={!dirty} className="flex-1 sm:flex-none" aria-label={`Save changes to ${group.title}`}>
              Save changes
            </Button>
          </div>
        </div>
      </Panel>
    </form>
  );
}

function TestEmail({ defaultTo, disabled }: { defaultTo: string; disabled: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [to, setTo] = useState(defaultTo || user?.email || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api("/admin/settings/test-email", { method: "POST", body: { to: to.trim() } });
      toast.success(`Test email sent to ${to.trim()}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  // Not a nested <form>: this sits inside the email settings form.
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <label htmlFor="test-email-to" className="block text-sm font-medium text-zinc-800">
        Send a test email
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">
        {disabled ? "Save your changes first; the test uses the saved settings." : "Checks the saved settings by sending a short message."}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          id="test-email-to"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!disabled && to.trim()) void send();
            }
          }}
          placeholder="you@example.com"
          autoComplete="email"
          className="sm:max-w-xs"
          aria-invalid={Boolean(error) || undefined}
        />
        <Button variant="outline" onClick={send} loading={sending} disabled={disabled || !to.trim()}>
          Send test email
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ServerPanel({ server }: { server: AdminSettings["server"] }) {
  const onOff = (v: boolean) => (v ? "On" : "Off");
  return (
    <Panel
      id="server"
      title="Server"
      description="Set in the server's .env file by your developer; shown here for reference."
      className="scroll-mt-20 lg:scroll-mt-8"
    >
      <DescriptionList
        items={[
          { label: "Environment", value: <span className="capitalize">{server.environment}</span> },
          { label: "Store address", value: <span className="break-all">{server.frontendUrl}</span> },
          { label: "Currency", value: server.currency },
          { label: "Admin phones", value: `${server.adminPhones} number${server.adminPhones === 1 ? "" : "s"} in ADMIN_PHONES` },
          { label: "Test payments", value: onOff(server.mockPayments) },
          {
            label: "Secrets key",
            value: server.dedicatedEncryptionKey
              ? "Dedicated key (SETTINGS_ENCRYPTION_KEY)"
              : "Derived from OTP_SECRET. Set SETTINGS_ENCRYPTION_KEY so changing OTP_SECRET doesn't make saved secrets unreadable.",
          },
        ]}
      />
    </Panel>
  );
}
