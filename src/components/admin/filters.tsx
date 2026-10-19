"use client";

import { useEffect, useId, useRef } from "react";
import { Select } from "@/components/ui";
import { cn } from "@/lib/format";
import { IconSearch } from "./icons";

/** One row of filters above a list; wraps on small screens. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-end gap-3", className)}>{children}</div>;
}

/**
 * Debounced search box (uncontrolled). Calls `onSearch` 350 ms after typing
 * stops, or immediately on Enter. Remount with a new `key` to reset it.
 */
export function SearchInput({
  defaultValue,
  onSearch,
  placeholder = "Search",
  label = "Search",
  className,
}: {
  defaultValue: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const t = timer;
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);
  const fire = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onSearch(value.trim());
  };
  return (
    <form
      role="search"
      className={cn("relative min-w-0 flex-1 basis-56", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement | null;
        fire(input?.value ?? "");
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="block h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        onChange={(e) => {
          const value = e.target.value;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => fire(value), 350);
        }}
      />
    </form>
  );
}

/** Labelled select used in filter rows. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-36">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Row of toggle buttons for a single choice (status tabs, date range).
 * Wraps onto more lines on narrow screens so no option is hidden.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("max-w-full py-1", className)}>
      <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900",
                size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
                active ? "bg-white text-brand-800 shadow-sm ring-1 ring-brand-200" : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              {o.label}
              {o.count !== undefined && <span className="ml-1.5 tabular-nums text-zinc-400">{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Labelled date input for filter rows (value is YYYY-MM-DD). */
export function DateFilter({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="block h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
    </div>
  );
}
