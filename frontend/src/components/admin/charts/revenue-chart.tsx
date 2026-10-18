"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { compactRupees, longDay, niceTicks, plural, shortDay } from "../utils";
import { ChartTooltip, TooltipRow } from "./chart-card";
import { VIZ } from "./palette";

type Point = { date: string; revenue: number; orders: number };

const HEIGHT = 260; // includes the x-axis band, so the card never scrolls
const PAD = { top: 12, right: 12, bottom: 28 };

/** Measures an element's content width (0 until the first observation). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Single-series revenue line with a soft area wash. One y-axis (revenue);
 * the order count rides in the tooltip and table instead of a second axis.
 * Pointer: crosshair snaps to the nearest day. Keyboard: focus the chart and
 * use ←/→ (Home/End) to step through days; the readout is announced.
 */
export function RevenueChart({ data }: { data: Point[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const n = data.length;
  const maxRevenue = data.reduce((m, d) => Math.max(m, d.revenue), 0);
  // With no revenue at all, draw just the ₹0 baseline.
  const ticks = maxRevenue > 0 ? niceTicks(maxRevenue, 4) : [0];
  const yMax = maxRevenue > 0 ? ticks[ticks.length - 1] : 1;
  const tickLabels = ticks.map((t) => compactRupees(t));
  const left = Math.max(...tickLabels.map((l) => l.length)) * 6.6 + 14;

  const innerW = Math.max(0, width - left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerH;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const x = (i: number) => left + (n > 1 ? i * step : innerW / 2);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.revenue).toFixed(1)}`).join("");
  const areaPath = n > 0 ? `${linePath}L${x(n - 1).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z` : "";

  // X labels: as many as fit (~64px each), always anchored on the latest day.
  const maxLabels = Math.max(2, Math.floor(innerW / 64));
  const labelEvery = Math.max(1, Math.ceil(n / maxLabels));
  const xLabels = data
    .map((d, i) => ({ i, label: shortDay(d.date) }))
    .filter(({ i }) => (n - 1 - i) % labelEvery === 0);

  const indexFromClientX = (clientX: number, rect: DOMRect) => {
    if (n <= 1) return 0;
    const px = clientX - rect.left;
    return Math.min(n - 1, Math.max(0, Math.round((px - left) / step)));
  };

  const total = data.reduce((s, d) => s + d.revenue, 0);
  const peak = data.reduce<Point | null>((best, d) => (!best || d.revenue > best.revenue ? d : best), null);
  const summary =
    n === 0
      ? "Revenue by day: no data."
      : `Revenue by day from ${longDay(data[0].date)} to ${longDay(data[n - 1].date)}. Total ${formatPrice(total)}.` +
        (peak && peak.revenue > 0 ? ` Highest ${formatPrice(peak.revenue)} on ${longDay(peak.date)}.` : "") +
        " Use the left and right arrow keys to read each day.";

  const activePoint = active !== null ? data[active] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 && n > 0 && (
        <div
          tabIndex={0}
          role="group"
          aria-roledescription="chart"
          aria-label={summary}
          className="h-full w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          onFocus={() => setActive((a) => a ?? n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            const keys: Record<string, (a: number) => number> = {
              ArrowLeft: (a) => Math.max(0, a - 1),
              ArrowRight: (a) => Math.min(n - 1, a + 1),
              Home: () => 0,
              End: () => n - 1,
            };
            const fn = keys[e.key];
            if (!fn) return;
            e.preventDefault();
            setActive((a) => fn(a ?? n - 1));
          }}
        >
          <svg width={width} height={HEIGHT} aria-hidden="true" className="block overflow-visible">
            {/* Gridlines + y ticks */}
            {ticks.map((t, i) => (
              <g key={t}>
                <line
                  x1={left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={i === 0 ? VIZ.axis : VIZ.grid}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-zinc-500 text-[11px] tabular-nums"
                >
                  {tickLabels[i]}
                </text>
              </g>
            ))}

            {/* X labels */}
            {xLabels.map(({ i, label }) => {
              const px = x(i);
              const anchor = px - 26 < left - 8 ? "start" : px + 26 > width ? "end" : "middle";
              return (
                <text
                  key={i}
                  x={px}
                  y={baseline + 18}
                  textAnchor={anchor}
                  className="fill-zinc-500 text-[11px] tabular-nums"
                >
                  {label}
                </text>
              );
            })}

            {/* Area wash + line */}
            <path d={areaPath} fill={VIZ.series1} fillOpacity={0.1} />
            <path d={linePath} fill="none" stroke={VIZ.series1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {n === 1 && <circle cx={x(0)} cy={y(data[0].revenue)} r={4} fill={VIZ.series1} stroke={VIZ.surface} strokeWidth={2} />}

            {/* Crosshair + active marker */}
            {activePoint && active !== null && (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={PAD.top}
                  y2={baseline}
                  stroke={VIZ.crosshair}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <circle cx={x(active)} cy={y(activePoint.revenue)} r={5} fill={VIZ.series1} stroke={VIZ.surface} strokeWidth={2} />
              </g>
            )}

            {/* Hit layer: the whole plot, so the reader aims at a date, not a 2px line */}
            <rect
              x={left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={(e) => {
                const svg = e.currentTarget.ownerSVGElement;
                if (svg) setActive(indexFromClientX(e.clientX, svg.getBoundingClientRect()));
              }}
              onPointerLeave={() => setActive(null)}
            />
          </svg>

          {maxRevenue === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-zinc-500">
              No paid orders in this period
            </p>
          )}

          {activePoint && active !== null && (
            <ChartTooltip x={x(active)} y={PAD.top} containerWidth={width}>
              <p className="mb-1 text-zinc-500">{longDay(activePoint.date)}</p>
              <TooltipRow color={VIZ.series1} value={formatPrice(activePoint.revenue)} label="revenue" />
              <TooltipRow value={plural(activePoint.orders, "order")} label="" />
            </ChartTooltip>
          )}
        </div>
      )}

      {/* Announce the keyboard readout */}
      <p className="sr-only" aria-live="polite">
        {activePoint
          ? `${longDay(activePoint.date)}: ${formatPrice(activePoint.revenue)} revenue, ${plural(activePoint.orders, "order")}`
          : ""}
      </p>
    </div>
  );
}
