import Link from "next/link";
import { cn } from "@/lib/format";
import { IconArrowDown, IconArrowUp } from "./icons";
import { percentChange } from "./utils";

/**
 * Stat tile: label, value (proportional figures), optional delta vs a named
 * previous period. Delta direction is shown with an arrow + sign, never color
 * alone.
 */
export function KpiTile({
  label,
  value,
  hint,
  delta,
  href,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  delta?: { current: number; previous: number; periodLabel: string; formatPrevious?: (n: number) => string };
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {delta && <Delta {...delta} />}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-zinc-200 bg-white p-4";
  return href ? (
    <Link
      href={href}
      className={cn(cls, "transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900")}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Delta({
  current,
  previous,
  periodLabel,
  formatPrevious,
}: {
  current: number;
  previous: number;
  periodLabel: string;
  formatPrevious?: (n: number) => string;
}) {
  const pct = percentChange(current, previous);
  const prevText = formatPrevious ? ` (${formatPrevious(previous)})` : "";
  if (pct === null) {
    return (
      <p className="mt-1 text-xs text-zinc-500">
        {current > 0 ? "No sales in the" : "No change from the"} {periodLabel}
      </p>
    );
  }
  const rounded = Math.round(pct * 10) / 10;
  const up = rounded > 0;
  const flat = rounded === 0;
  const Icon = up ? IconArrowUp : IconArrowDown;
  return (
    <p
      className={cn(
        "mt-1 flex flex-wrap items-center gap-1 text-xs font-medium",
        flat ? "text-zinc-500" : up ? "text-emerald-700" : "text-red-700",
      )}
    >
      {!flat && <Icon className="size-3.5" strokeWidth={2.25} />}
      <span className="tabular-nums">
        {up ? "+" : ""}
        {rounded}%
      </span>
      <span className="font-normal text-zinc-500">
        vs {periodLabel}
        {prevText}
      </span>
    </p>
  );
}
