"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OPTION_LABELS } from "@/lib/catalog-labels";
import { cn, formatPrice, paiseToRupees, rupeesToPaise } from "@/lib/format";
import type { ProductFacets } from "@/lib/types";
import { Button, Checkbox, Spinner } from "@/components/ui";
import { activeFilterCount, productsHref, SORT_OPTIONS, type CategoryNode, type ProductFilters } from "./catalog";
import { CloseIcon, FilterIcon } from "./icons";

// ---------------------------------------------------------------------------
// Navigation context: filter changes push a new URL inside a transition so the
// current results stay visible (dimmed) until the server render arrives.
// ---------------------------------------------------------------------------
type ListingCtx = { pending: boolean; filters: ProductFilters; apply: (patch: Partial<ProductFilters>) => void };
const ListingContext = createContext<ListingCtx | null>(null);

function useListing(): ListingCtx {
  const ctx = useContext(ListingContext);
  if (!ctx) throw new Error("Filters must be rendered inside <ListingProvider>");
  return ctx;
}

export function ListingProvider({ filters, children }: { filters: ProductFilters; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const apply = useCallback(
    (patch: Partial<ProductFilters>) => {
      const href = productsHref({ ...filters, ...patch, page: patch.page ?? 1 });
      startTransition(() => router.push(href, { scroll: false }));
    },
    [filters, router],
  );
  const value = useMemo(() => ({ pending, filters, apply }), [pending, filters, apply]);
  return <ListingContext.Provider value={value}>{children}</ListingContext.Provider>;
}

/** Dims its children while a filter navigation is pending. */
export function PendingArea({ children }: { children: React.ReactNode }) {
  const { pending } = useListing();
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50")}>
      {children}
    </div>
  );
}

const CLEARED: Partial<ProductFilters> = {
  category: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  sizes: [],
  colors: [],
  inStock: false,
};

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------
export function SortSelect() {
  const { filters, apply } = useListing();
  const id = useId();
  const options = SORT_OPTIONS.filter((o) => o.value !== "relevance" || filters.q);
  const value = filters.sort ?? (filters.q ? "relevance" : "newest");
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="hidden text-sm text-zinc-600 sm:block">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => apply({ sort: e.target.value as ProductFilters["sort"] })}
        className="h-9 min-w-36 rounded-lg border border-zinc-300 bg-white pl-3 pr-8 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        aria-label="Sort products"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter panel (shared by the desktop sidebar and the mobile sheet)
// ---------------------------------------------------------------------------
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-b border-zinc-200 py-5 first:pt-0 last:border-b-0">
      <h3 id={id} className="mb-3 text-sm font-semibold text-zinc-900">
        {title}
      </h3>
      {children}
    </section>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function PriceFilter({ facets }: { facets: ProductFacets }) {
  const { filters, apply } = useListing();
  const uid = useId();
  const [min, setMin] = useState(paiseToRupees(filters.minPrice));
  const [max, setMax] = useState(paiseToRupees(filters.maxPrice));
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const minPaise = min.trim() ? rupeesToPaise(min) : undefined;
    const maxPaise = max.trim() ? rupeesToPaise(max) : undefined;
    if ((minPaise !== undefined && (Number.isNaN(minPaise) || minPaise < 0)) || (maxPaise !== undefined && (Number.isNaN(maxPaise) || maxPaise < 0))) {
      setError("Enter valid amounts");
      return;
    }
    if (minPaise !== undefined && maxPaise !== undefined && minPaise > maxPaise) {
      setError("Minimum must be less than maximum");
      return;
    }
    setError(null);
    apply({ minPrice: minPaise, maxPrice: maxPaise });
  }

  const range = facets.priceRange;
  const hasRange = range && range.max > 0;
  const input =
    "h-9 w-full rounded-lg border border-zinc-300 bg-white pl-6 pr-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <label htmlFor={`${uid}-min`} className="sr-only">
            Minimum price in rupees
          </label>
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₹</span>
          <input
            id={`${uid}-min`}
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder={hasRange ? paiseToRupees(range.min) : "Min"}
            className={input}
          />
        </div>
        <span className="text-zinc-400" aria-hidden="true">
          –
        </span>
        <div className="relative flex-1">
          <label htmlFor={`${uid}-max`} className="sr-only">
            Maximum price in rupees
          </label>
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">₹</span>
          <input
            id={`${uid}-max`}
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder={hasRange ? paiseToRupees(range.max) : "Max"}
            className={input}
          />
        </div>
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Go
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : hasRange ? (
        <p className="mt-2 text-xs text-zinc-500">
          {formatPrice(range.min)} – {formatPrice(range.max)}
        </p>
      ) : null}
    </form>
  );
}

function FilterPanel({ facets, categories }: { facets: ProductFacets; categories: CategoryNode[] }) {
  const { filters, apply } = useListing();
  const sizes = useMemo(() => [...new Set([...facets.sizes, ...filters.sizes])], [facets.sizes, filters.sizes]);
  const colors = useMemo(() => {
    const list = [...facets.colors];
    for (const name of filters.colors) if (!list.some((c) => c.name === name)) list.push({ name, hex: null });
    return list;
  }, [facets.colors, filters.colors]);

  const catButton = (active: boolean) =>
    cn(
      "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-zinc-900",
      active ? "bg-brand-700 font-medium text-white" : "text-zinc-700 hover:bg-zinc-100",
    );

  return (
    <div>
      {categories.length > 0 && (
        <FilterGroup title="Category">
          <ul className="space-y-0.5">
            <li>
              <button type="button" className={catButton(!filters.category)} aria-pressed={!filters.category} onClick={() => apply({ category: undefined })}>
                All categories
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={catButton(filters.category === c.slug)}
                  aria-pressed={filters.category === c.slug}
                  onClick={() => apply({ category: c.slug })}
                >
                  {c.name}
                </button>
                {c.children.length > 0 && (
                  <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-zinc-200 pl-2">
                    {c.children.map((child) => (
                      <li key={child.id}>
                        <button
                          type="button"
                          className={catButton(filters.category === child.slug)}
                          aria-pressed={filters.category === child.slug}
                          onClick={() => apply({ category: child.slug })}
                        >
                          {child.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </FilterGroup>
      )}

      <FilterGroup title="Price">
        <PriceFilter key={`${filters.minPrice ?? ""}-${filters.maxPrice ?? ""}`} facets={facets} />
      </FilterGroup>

      {sizes.length > 0 && (
        <FilterGroup title={OPTION_LABELS.size}>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => {
              const active = filters.sizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => apply({ sizes: toggle(filters.sizes, size) })}
                  className={cn(
                    "h-9 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
                    active ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-900",
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </FilterGroup>
      )}

      {colors.length > 0 && (
        <FilterGroup title={OPTION_LABELS.color}>
          <div className="grid grid-cols-2 gap-1.5">
            {colors.map((color) => {
              const active = filters.colors.includes(color.name);
              return (
                <button
                  key={color.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => apply({ colors: toggle(filters.colors, color.name) })}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
                    active ? "border-brand-700 bg-brand-50 font-medium text-zinc-900" : "border-transparent text-zinc-700 hover:bg-zinc-100",
                  )}
                >
                  <span
                    className={cn(
                      "size-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
                      active && "ring-2 ring-brand-700 ring-offset-1",
                      !color.hex && "bg-zinc-200",
                    )}
                    style={color.hex ? { backgroundColor: color.hex } : undefined}
                    aria-hidden="true"
                  />
                  <span className="truncate">{color.name}</span>
                </button>
              );
            })}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title="Availability">
        <Checkbox label="In stock only" checked={filters.inStock} onChange={(e) => apply({ inStock: e.target.checked })} />
      </FilterGroup>
    </div>
  );
}

export function FiltersSidebar({ facets, categories }: { facets: ProductFacets; categories: CategoryNode[] }) {
  const { filters, apply, pending } = useListing();
  const count = activeFilterCount(filters);
  return (
    <div>
      <div className="mb-5 flex h-6 items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-900">
          Filters
          {pending && <Spinner className="size-3.5 text-zinc-500" />}
        </h2>
        {count > 0 && (
          <button type="button" className="text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline" onClick={() => apply(CLEARED)}>
            Clear all
          </button>
        )}
      </div>
      <FilterPanel facets={facets} categories={categories} />
    </div>
  );
}

export function MobileFilters({ facets, categories, total }: { facets: ProductFacets; categories: CategoryNode[]; total: number }) {
  const { filters, apply, pending } = useListing();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-filters">
        <FilterIcon className="size-4" />
        Filters
        {count > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-semibold text-white">{count}</span>
        )}
      </Button>
      {open && (
        <div id="mobile-filters" className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                Filters
                {pending && <Spinner className="size-4 text-zinc-500" />}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100"
                aria-label="Close filters"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-5">
              <FilterPanel facets={facets} categories={categories} />
            </div>
            <div className="flex gap-3 border-t border-zinc-200 p-4">
              <Button variant="outline" className="flex-1" onClick={() => apply(CLEARED)} disabled={count === 0}>
                Clear all
              </Button>
              <Button className="flex-1" onClick={() => setOpen(false)} loading={pending}>
                {pending ? "Updating" : `Show ${total} ${total === 1 ? "result" : "results"}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Removable chips for the active filters. */
export function ActiveFilters({ categoryName }: { categoryName?: string }) {
  const { filters, apply } = useListing();
  const chips: { key: string; label: string; remove: Partial<ProductFilters> }[] = [];
  if (filters.category) chips.push({ key: "cat", label: categoryName ?? filters.category, remove: { category: undefined } });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const label =
      filters.minPrice !== undefined && filters.maxPrice !== undefined
        ? `${formatPrice(filters.minPrice)} – ${formatPrice(filters.maxPrice)}`
        : filters.minPrice !== undefined
          ? `From ${formatPrice(filters.minPrice)}`
          : `Up to ${formatPrice(filters.maxPrice!)}`;
    chips.push({ key: "price", label, remove: { minPrice: undefined, maxPrice: undefined } });
  }
  for (const s of filters.sizes) chips.push({ key: `s-${s}`, label: `Size ${s}`, remove: { sizes: filters.sizes.filter((x) => x !== s) } });
  for (const c of filters.colors) chips.push({ key: `c-${c}`, label: c, remove: { colors: filters.colors.filter((x) => x !== c) } });
  if (filters.inStock) chips.push({ key: "stock", label: "In stock", remove: { inStock: false } });
  if (chips.length === 0) return null;

  return (
    <ul className="mb-6 flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => apply(chip.remove)}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pl-3 pr-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-200"
            aria-label={`Remove filter: ${chip.label}`}
          >
            {chip.label}
            <CloseIcon className="size-3.5" />
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <button type="button" onClick={() => apply(CLEARED)} className="px-2 text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline">
            Clear all
          </button>
        </li>
      )}
    </ul>
  );
}
