"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pagination, Spinner } from "@/components/ui";
import { cn } from "@/lib/format";
import { formatInt } from "./utils";

/**
 * Card that holds a table. The table scrolls horizontally inside the card on
 * narrow screens; while `busy` the previous rows stay visible but dimmed.
 */
export function TableCard({
  children,
  footer,
  busy,
  className,
  label,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  className?: string;
  /** Accessible name for the scroll region. */
  label?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-zinc-200 bg-white", className)}>
      {/* The scroll container is focusable so keyboard users can scroll it horizontally. */}
      <div
        className={cn("relative overflow-x-auto transition-opacity", busy && "opacity-60")}
        tabIndex={0}
        role="region"
        aria-label={label ?? "Table"}
        aria-busy={busy || undefined}
      >
        {children}
      </div>
      {busy && (
        <div className="pointer-events-none absolute right-3 top-3 text-zinc-400">
          <Spinner className="size-4" />
        </div>
      )}
      {footer}
    </div>
  );
}

/** `minWidth` (px) is where the card starts scrolling horizontally instead of squeezing columns. */
export function Table({ children, minWidth = 720 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <table className="w-full border-collapse text-left text-sm text-zinc-700" style={{ minWidth }}>
      {children}
    </table>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-medium text-zinc-500">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * Table row that navigates to `href` on click. Each row must also contain a
 * real <Link> to the same place (for keyboard and screen-reader users); clicks
 * on links, buttons and form controls inside the row are left alone.
 */
export function LinkRow({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      className={cn("cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50", className)}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a,button,input,select,textarea,label")) return;
        if (window.getSelection()?.toString()) return; // allow selecting text
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-zinc-100 last:border-0", className)}>{children}</tr>;
}

// ---------------------------------------------------------------------------
// Phone layout: below `md`, lists render as stacked cards instead of a wide
// table that would need sideways scrolling. Pages render both:
//   <MobileList>…<MobileCard/>…</MobileList>  +  <DesktopOnly><Table/></DesktopOnly>
// ---------------------------------------------------------------------------
export function DesktopOnly({ children }: { children: React.ReactNode }) {
  return <div className="hidden md:block">{children}</div>;
}

export function MobileList({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <ul className="divide-y divide-zinc-100 md:hidden" aria-label={label}>
      {children}
    </ul>
  );
}

export function MobileCard({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="block px-4 py-3.5 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 active:bg-zinc-100"
      >
        {children}
      </Link>
    </li>
  );
}

/** "Showing 21–40 of 134" + pagination, under a table. */
export function TableFooter({
  page,
  pageSize,
  total,
  totalPages,
  hrefFor,
  noun = "results",
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 sm:flex-row">
      <p className="text-xs text-zinc-500 tabular-nums">
        Showing {formatInt(from)}–{formatInt(to)} of {formatInt(total)} {noun}
      </p>
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  );
}

/** Centered message inside a table card. */
export function TableEmpty({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function TableLoading() {
  return (
    <div className="flex items-center justify-center px-6 py-16 text-zinc-400">
      <Spinner className="size-5" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
