"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/format";
import { formatInt } from "../utils";
import { VIZ } from "./palette";

export type BarListRow = { key: string; label: string; value: number; href?: string };

/**
 * Horizontal bars for one series across nominal categories: every bar takes
 * the same slot-1 hue (length carries the value), square at the baseline with
 * a 4px rounded data end. Label and value sit on the line above each bar so
 * the bar gets the full width even in a narrow card.
 */
export function BarList({
  rows,
  unit,
  formatValue = formatInt,
}: {
  rows: BarListRow[];
  /** Used in the hover readout, e.g. "orders". */
  unit: string;
  formatValue?: (n: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        const share = total > 0 ? Math.round((r.value / total) * 100) : 0;
        const isHover = hover === r.key;
        return (
          <li key={r.key} onPointerEnter={() => setHover(r.key)} onPointerLeave={() => setHover(null)}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              {r.href ? (
                <Link
                  href={r.href}
                  className="min-w-0 truncate rounded text-sm text-zinc-700 hover:text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-900"
                >
                  {r.label}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-sm text-zinc-700">{r.label}</span>
              )}
              <span className="shrink-0 text-sm tabular-nums text-zinc-900">
                {formatValue(r.value)}
                <span className="ml-1.5 inline-block w-9 text-right text-xs text-zinc-400">{share}%</span>
              </span>
            </div>
            <div className="relative h-2.5" aria-hidden="true">
              {r.value > 0 && (
                <div
                  className={cn("h-full rounded-r-[4px] transition-opacity", isHover && "opacity-80")}
                  style={{ width: `max(${pct}%, 3px)`, backgroundColor: VIZ.series1 }}
                />
              )}
              {isHover && (
                <div
                  className="pointer-events-none absolute top-full z-10 mt-1.5 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-md"
                  // Start at the bar end for short bars; end at it for long ones.
                  style={pct <= 50 ? { left: `${pct}%` } : { right: `${100 - pct}%` }}
                >
                  <span className="font-semibold tabular-nums text-zinc-900">{formatValue(r.value)}</span>{" "}
                  <span className="text-zinc-500">
                    {unit} · {share}% of total
                  </span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
