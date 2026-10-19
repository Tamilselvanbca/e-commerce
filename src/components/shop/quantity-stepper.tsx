"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { MinusIcon, PlusIcon } from "./icons";

/**
 * − [n] + control. Buttons change the value immediately; typed values are
 * committed (clamped to [min, max]) on blur or Enter.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled,
  size = "md",
  label = "Quantity",
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const upper = Math.max(min, max);
  const clamp = (n: number) => Math.min(upper, Math.max(min, Number.isFinite(n) ? Math.round(n) : value));

  const commit = () => {
    if (draft === null) return;
    const n = clamp(Number.parseInt(draft, 10));
    setDraft(null);
    if (n !== value) onChange(n);
  };

  const height = size === "sm" ? "h-8" : "h-10";
  const btn = cn(
    "flex shrink-0 items-center justify-center text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900",
    size === "sm" ? "size-8" : "size-10",
  );

  return (
    <div
      className={cn("inline-flex items-center overflow-hidden rounded-lg border border-zinc-300 bg-white", disabled && "opacity-60")}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={btn}
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <MinusIcon className="size-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={upper}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={cn(
          "border-x border-zinc-200 bg-transparent text-center text-sm font-medium text-zinc-900 focus:outline-none",
          height,
          size === "sm" ? "w-10" : "w-12",
        )}
      />
      <button
        type="button"
        className={btn}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= upper}
        aria-label="Increase quantity"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
