// Layout helpers for storefront pages (server-compatible).
import Link from "next/link";
import { cn } from "@/lib/format";
import { ArrowRightIcon, ChevronRightIcon } from "./icons";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function SectionHeading({
  title,
  eyebrow,
  href,
  linkLabel = "View all",
  id,
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  linkLabel?: string;
  id?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</p>}
        <h2 id={id} className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-900"
        >
          {linkLabel}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 text-zinc-400" />}
            {item.href ? (
              <Link href={item.href} className="hover:text-zinc-900">
                {item.label}
              </Link>
            ) : (
              <span className="text-zinc-900" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-zinc-600">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Inline alert box for errors / notices (announced to screen readers). */
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "error" | "warning" | "success";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    error: "bg-red-50 text-red-800 ring-red-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 text-sm ring-1 ring-inset", tones, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}
