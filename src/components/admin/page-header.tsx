"use client";

import Link from "next/link";
import { cn } from "@/lib/format";
import { useAdminTitle } from "./hooks";
import { IconChevronLeft } from "./icons";

/**
 * Page title row. Also sets the document title (pass `documentTitle` when the
 * visible title is a React node or differs from what the tab should show).
 */
export function PageHeader({
  title,
  documentTitle,
  description,
  actions,
  back,
  meta,
}: {
  title: React.ReactNode;
  documentTitle?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
}) {
  useAdminTitle(documentTitle ?? (typeof title === "string" ? title : null));
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 rounded-md text-sm text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <IconChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-zinc-600">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** White card with an optional header row. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush = false,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No body padding (for edge-to-edge lists and tables). */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 rounded-xl border border-zinc-200 bg-white", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? undefined : "px-4 py-4 sm:px-5"}>{children}</div>
    </section>
  );
}

/** Two-column label/value list. */
export function DescriptionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-zinc-500">{item.label}</dt>
          <dd className="min-w-0 break-words text-zinc-900">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
