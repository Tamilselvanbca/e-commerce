"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { DIAL_OPTIONS, toE164 } from "@/lib/countries";
import { cn } from "@/lib/format";
import type { User } from "@/lib/types";
import { useAuth, useCart, useToast } from "@/components/providers";
import { Button, Field, Input, PageLoader } from "@/components/ui";
import { ShieldIcon } from "@/components/shop/icons";
import { detailNumber } from "@/components/shop/utils";

type OtpRequestResponse = { phone: string; expiresIn: number; resendIn: number; devCode?: string };
type Step = "phone" | "code";

function maskPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const auth = useAuth();
  const cart = useCart();
  const toast = useToast();
  const uid = useId();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [dial, setDial] = useState("91");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"request" | "verify" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // Already signed in: go straight to the destination.
  useEffect(() => {
    if (!auth.loading && auth.user && !done) router.replace(next);
  }, [auth.loading, auth.user, done, next, router]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestOtp(isResend: boolean) {
    const e164 = toE164(phone, dial);
    if (!e164) {
      setError(dial === "91" ? "Enter a valid 10-digit Indian mobile number" : "Enter a valid mobile number");
      return;
    }
    setError(null);
    setInfo(null);
    setBusy("request");
    try {
      const res = await api<OtpRequestResponse>("/auth/otp/request", { method: "POST", body: { phone: e164 } });
      setSentTo(res.phone);
      setDevCode(res.devCode ?? null);
      setCooldown(res.resendIn);
      setCode("");
      setStep("code");
      setInfo(isResend ? "A new code has been sent." : null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "OTP_COOLDOWN") {
        const wait = detailNumber(err, "retryAfter") ?? 30;
        setCooldown(wait);
        if (step === "phone") {
          // A code was sent moments ago; let the customer enter it.
          setSentTo(e164);
          setStep("code");
          setInfo(`We already sent a code to this number. You can request a new one in ${wait}s.`);
        } else {
          setError(`Please wait ${wait}s before requesting another code.`);
        }
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      codeRef.current?.focus();
      return;
    }
    setError(null);
    setInfo(null);
    setBusy("verify");
    try {
      const res = await api<{ user: User; isNewUser: boolean }>("/auth/otp/verify", {
        method: "POST",
        body: { phone: sentTo ?? toE164(phone, dial) ?? phone, code, ...(name.trim() ? { name: name.trim() } : {}) },
      });
      setDone(true);
      auth.setUser(res.user);
      await cart.refresh();
      toast.success(res.isNewUser ? "Welcome! Your account is ready." : `Welcome back${res.user.name ? `, ${res.user.name}` : ""}!`);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.code === "OTP_INVALID") {
        const left = detailNumber(err, "attemptsLeft");
        setError(
          left !== null
            ? left > 0
              ? `That code is incorrect. ${left} ${left === 1 ? "attempt" : "attempts"} left.`
              : "Too many incorrect attempts. Please request a new code."
            : "That code is incorrect. Please try again.",
        );
        setCode("");
        codeRef.current?.focus();
      } else if (err instanceof ApiError && err.code === "OTP_EXPIRED") {
        setError("This code has expired. Request a new one.");
        setCode("");
      } else {
        setError(errorMessage(err));
      }
      setBusy(null);
    }
  }

  if (auth.loading || (auth.user && !done)) return <PageLoader />;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      {step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void requestOtp(false);
          }}
          noValidate
          className="space-y-5"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Log in or sign up</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Enter your mobile number. We&apos;ll send you a one-time code. Customers outside India, choose your country code.
            </p>
          </div>
          <Field label="Mobile number" htmlFor={`${uid}-phone`}>
            <div
              className={cn(
                "flex h-12 overflow-hidden rounded-lg border bg-white focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900",
                error ? "border-red-500" : "border-zinc-300",
              )}
            >
              <label htmlFor={`${uid}-dial`} className="sr-only">
                Country code
              </label>
              {/* Shows just "+91"; the transparent native select on top keeps it accessible. */}
              <span className="relative inline-flex shrink-0 items-center gap-1 border-r border-zinc-200 bg-zinc-50 pl-3 pr-2 text-sm font-medium text-zinc-700">
                +{dial}
                <svg viewBox="0 0 20 20" className="size-4 text-zinc-400" fill="currentColor" aria-hidden="true">
                  <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
                </svg>
                <select
                  id={`${uid}-dial`}
                  value={dial}
                  onChange={(e) => {
                    setDial(e.target.value);
                    setError(null);
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {DIAL_OPTIONS.map((o) => (
                    <option key={o.dial} value={o.dial}>
                      +{o.dial} {o.label}
                    </option>
                  ))}
                </select>
              </span>
              <input
                id={`${uid}-phone`}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={dial === "91" ? "98765 43210" : "Mobile number"}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/[^\d\s+-]/g, "").slice(0, 16));
                  setError(null);
                }}
                className="min-w-0 flex-1 bg-transparent px-3 text-base tracking-wide text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${uid}-error` : undefined}
                autoFocus
                required
              />
            </div>
          </Field>
          <ErrorText id={`${uid}-error`} error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy === "request"}>
            Send code
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
            <ShieldIcon className="size-3.5" />
            We never share your number.
          </p>
        </form>
      ) : (
        <form onSubmit={verifyOtp} noValidate className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Enter the code</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Sent to <span className="font-medium text-zinc-900">{maskPhone(sentTo ?? phone)}</span>.{" "}
              <button
                type="button"
                className="font-medium text-zinc-900 underline underline-offset-4"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                  setInfo(null);
                  setDevCode(null);
                }}
              >
                Change number
              </button>
            </p>
          </div>

          {devCode && (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Development mode: your code is <span className="font-mono text-sm font-semibold tracking-widest">{devCode}</span>
            </div>
          )}

          <Field label="6-digit code" htmlFor={`${uid}-code`}>
            <input
              ref={codeRef}
              id={`${uid}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="••••••"
              className={cn(
                "block h-14 w-full rounded-lg border bg-white px-3 text-center font-mono text-2xl tracking-[0.5em] text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900",
                error ? "border-red-500" : "border-zinc-300",
              )}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
              required
            />
          </Field>

          <Field label="Your name (optional)" htmlFor={`${uid}-name`} hint="New here? Tell us what to call you.">
            <Input
              id={`${uid}-name`}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </Field>

          <ErrorText id={`${uid}-error`} error={error} />
          {info && !error && (
            <p className="text-sm text-zinc-600" role="status">
              {info}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={busy === "verify"} disabled={busy === "request"}>
            Verify & continue
          </Button>

          <div className="text-center text-sm text-zinc-600">
            {cooldown > 0 ? (
              <span>Resend code in {cooldown}s</span>
            ) : (
              <button
                type="button"
                className="font-medium text-zinc-900 underline underline-offset-4 disabled:opacity-50"
                onClick={() => requestOtp(true)}
                disabled={busy !== null}
              >
                {busy === "request" ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function ErrorText({ id, error }: { id: string; error: string | null }) {
  return (
    <div id={id} aria-live="assertive">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
