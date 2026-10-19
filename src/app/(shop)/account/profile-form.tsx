"use client";

import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";
import { useAuth, useToast } from "@/components/providers";
import { Button, Card, Field, Input } from "@/components/ui";
import { EMAIL_RE, fieldErrorsFrom } from "@/components/shop/utils";

export function ProfileSection() {
  const { user } = useAuth();
  if (!user) return null;
  // Remount the form when the stored profile changes so fields reset to the saved values.
  return <ProfileForm key={`${user.id}:${user.name ?? ""}:${user.email ?? ""}`} user={user} />;
}

function ProfileForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const uid = useId();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== (user.name ?? "") || email.trim() !== (user.email ?? "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length > 80) next.name = "Name must be 80 characters or fewer";
    if (email.trim() && !EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const { user: updated } = await api<{ user: User }>("/auth/me", {
        method: "PATCH",
        body: { name: name.trim() || undefined, email: email.trim() || null },
      });
      setUser(updated);
      toast.success("Profile updated");
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      if (fields.name || fields.email) setErrors({ name: fields.name, email: fields.email });
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-900">Profile</h2>
      <p className="mt-1 text-sm text-zinc-600">Order confirmations and shipping updates are sent to your email.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 max-w-xl space-y-5">
        <Field label="Full name" htmlFor={`${uid}-name`} error={errors.name}>
          <Input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={80}
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>
        <Field label="Email" htmlFor={`${uid}-email`} error={errors.email}>
          <Input
            id={`${uid}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>
        <Field label="Mobile number" htmlFor={`${uid}-phone`} hint="Your mobile number is used to log in and can't be changed here.">
          <Input id={`${uid}-phone`} value={user.phone} disabled readOnly />
        </Field>
        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <div className="flex items-center gap-4">
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
          <p className="text-xs text-zinc-500">Member since {formatDate(user.createdAt)}</p>
        </div>
      </form>
    </Card>
  );
}
