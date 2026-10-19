"use client";

import { useState } from "react";
import { cn } from "@/lib/format";

export type SplitSegment = {
  key: string;
  label: string;
  color: string;
  value: number;
  /** Shown in the legend/tooltip under the value. */
  detail?: string;
  formatted: string;
};

/**
 * Part-to-whole as one 100% stacked bar. Segments are separated by a 2px
 * surface gap (no strokes); the outer ends are rounded. The legend below
 * repeats every value and share, so identity never relies on color alone.
 */
export function SplitBar({ segments, label }: { segments: SplitSegment[]; label: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
  const hovered = hover ? segments.find((x) => x.key === hover) : undefined;
  // Tooltip anchors to the hovered segment: from its start when it sits in the
  // left half, to its end otherwise, so it never runs off the card.
  let hoveredStart = 0;
  for (const s of visible) {
    if (s.key === hover) break;
    hoveredStart += total > 0 ? (s.value / total) * 100 : 0;
  }
  const hoveredEnd = hoveredStart + (hovered && total > 0 ? (hovered.value / total) * 100 : 0);
  const tooltipStyle = hoveredStart <= 50 ? { left: `${hoveredStart}%` } : { right: `${Math.max(0, 100 - hoveredEnd)}%` };

  return (
    <div>
      <div className="relative">
        <div className="flex h-4 w-full gap-[2px]" aria-hidden="true">
          {total === 0 ? (
            <div className="h-full w-full rounded-[4px] bg-zinc-100" />
          ) : (
            visible.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "h-full min-w-[3px] transition-opacity",
                  i === 0 && "rounded-l-[4px]",
                  i === visible.length - 1 && "rounded-r-[4px]",
                  hover && hover !== s.key && "opacity-50",
                )}
                style={{ flex: `${s.value} 1 0%`, backgroundColor: s.color }}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
              />
            ))
          )}
        </div>
        {hovered && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={tooltipStyle}
          >
            <span className="font-semibold tabular-nums text-zinc-900">{hovered.formatted}</span>{" "}
            <span className="text-zinc-500">
              {hovered.label} · {share(hovered.value)}%{hovered.detail ? ` · ${hovered.detail}` : ""}
            </span>
          </div>
        )}
      </div>

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Gateway</th>
            <th scope="col">Value</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.key}
              className={cn("border-b border-zinc-100 last:border-0", hover === s.key && "bg-zinc-50")}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
            >
              <th scope="row" className="py-2 pr-3 text-left font-normal text-zinc-700">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
              </th>
              <td className="py-2 pr-3 text-right tabular-nums text-zinc-900">
                {s.formatted}
                {s.detail && <span className="block text-xs text-zinc-500">{s.detail}</span>}
              </td>
              <td className="w-14 py-2 text-right tabular-nums text-zinc-500">{share(s.value)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
