"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/format";

/**
 * Chart container: title, optional subtitle/summary, and a chart/table toggle
 * so every chart has an accessible, non-visual equivalent.
 */
export function ChartCard({
  title,
  subtitle,
  aside,
  table,
  children,
  busy,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Right side of the header (e.g. a total). */
  aside?: React.ReactNode;
  /** Table-view equivalent of the chart. */
  table?: React.ReactNode;
  children: React.ReactNode;
  busy?: boolean;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  return (
    <figure
      aria-labelledby={titleId}
      className={cn("flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-zinc-900">
            {title}
          </h2>
          {subtitle && <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3">
          {aside}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900"
            >
              {showTable ? "Show chart" : "Show table"}
            </button>
          )}
        </div>
      </div>
      <div className={cn("min-w-0 flex-1 px-4 pb-4 pt-3 transition-opacity sm:px-5", busy && "opacity-60")}>
        {showTable && table ? <div className="max-h-80 overflow-auto">{table}</div> : children}
      </div>
    </figure>
  );
}

/** Compact table used as a chart's table view. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: { label: string; align?: "left" | "right" }[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-white text-xs text-zinc-500">
        <tr className="border-b border-zinc-200">
          {columns.map((c) => (
            <th key={c.label} scope="col" className={cn("py-2 pr-3 font-medium", c.align === "right" && "text-right")}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-zinc-100 last:border-0">
            {row.map((cell, j) => {
              const align = columns[j]?.align;
              return j === 0 ? (
                <th key={j} scope="row" className="py-1.5 pr-3 font-normal text-zinc-700">
                  {cell}
                </th>
              ) : (
                <td key={j} className={cn("py-1.5 pr-3 tabular-nums text-zinc-900", align === "right" && "text-right")}>
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Floating readout. Values lead (strong), labels follow (muted). */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  children,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: React.ReactNode;
}) {
  // Flip to the left of the pointer near the right edge.
  const flip = x > containerWidth - 180;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{
        top: y,
        left: flip ? undefined : x + 12,
        right: flip ? containerWidth - x + 12 : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** One tooltip row: short line key in the series color, value, label. */
export function TooltipRow({ color, value, label }: { color?: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color ? (
        <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="font-semibold tabular-nums text-zinc-900">{value}</span>
      <span className="text-zinc-500">{label}</span>
    </div>
  );
}
