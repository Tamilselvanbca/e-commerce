"use client";

import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import type { GiftCardBalance } from "@/lib/types";
import { Button, Field, Input } from "@/components/ui";
import { Notice } from "@/components/shop/section";

export function BalanceCheck() {
  const id = useId();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GiftCardBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<GiftCardBalance>("/gift-cards/balance", { method: "POST", body: { code: code.trim() } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-zinc-900">
        Check your balance
      </h2>
      <form onSubmit={check} className="mt-4 space-y-3" noValidate>
        <Field label="Gift card code" htmlFor={`${id}-code`} error={error}>
          <div className="flex gap-2">
            <Input
              id={`${id}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 font-mono uppercase placeholder:font-sans placeholder:normal-case"
              aria-invalid={error ? true : undefined}
            />
            <Button type="submit" loading={loading} disabled={!code.trim()}>
              Check
            </Button>
          </div>
        </Field>
      </form>
      <div aria-live="polite">
        {result && (
          <div className="mt-5 rounded-xl bg-zinc-50 p-4">
            <p className="text-sm text-zinc-600">
              Card <span className="font-mono">{result.code}</span>
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900">{formatPrice(result.balance, result.currency)}</p>
            {result.usable ? (
              <p className="mt-1 text-sm text-zinc-600">
                Available to spend{result.expiresAt ? ` until ${formatDate(result.expiresAt)}` : ""}.
              </p>
            ) : (
              <Notice tone="warning" className="mt-3">
                {result.message}
              </Notice>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
