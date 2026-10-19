// Catalog helpers shared by server pages and client filters (no React).
import type { Category, ProductSort } from "@/lib/types";
import { firstParam, pageParam, type SearchParamsRecord } from "./utils";

const bySort = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function topLevelCategories(categories: Category[]): Category[] {
  return categories.filter((c) => !c.parentId).sort(bySort);
}

export type CategoryNode = Category & { children: Category[] };

/** Two-level tree (top-level categories with their direct children). */
export function categoryTree(categories: Category[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id));
  return categories
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .sort(bySort)
    .map((parent) => ({ ...parent, children: categories.filter((c) => c.parentId === parent.id).sort(bySort) }));
}

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "rating", label: "Top rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

/** Filters for the product listing, parsed from the URL. Prices are in paise. */
export type ProductFilters = {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes: string[];
  colors: string[];
  inStock: boolean;
  sort?: ProductSort;
  page: number;
};

function priceParam(value: string | string[] | undefined): number | undefined {
  const n = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function listParam(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseProductFilters(sp: SearchParamsRecord): ProductFilters {
  const sort = firstParam(sp.sort);
  return {
    q: firstParam(sp.q)?.trim() || undefined,
    category: firstParam(sp.category),
    minPrice: priceParam(sp.minPrice),
    maxPrice: priceParam(sp.maxPrice),
    sizes: listParam(sp.sizes),
    colors: listParam(sp.colors),
    inStock: firstParam(sp.inStock) === "true",
    sort: sort && SORTS.has(sort) ? (sort as ProductSort) : undefined,
    page: pageParam(sp.page),
  };
}

/** Builds the `/products?...` URL for a set of filters (empty values are omitted). */
/** Number of active filters (search query and sort excluded). Safe on server and client. */
export function activeFilterCount(f: ProductFilters): number {
  return (
    (f.category ? 1 : 0) +
    (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) +
    f.sizes.length +
    f.colors.length +
    (f.inStock ? 1 : 0)
  );
}

export function productsHref(filters: Partial<ProductFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sizes?.length) params.set("sizes", filters.sizes.join(","));
  if (filters.colors?.length) params.set("colors", filters.colors.join(","));
  if (filters.inStock) params.set("inStock", "true");
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

/** Query object for `serverApi.products`. */
export function productsQuery(filters: ProductFilters, pageSize = 24) {
  return {
    q: filters.q,
    category: filters.category,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sizes: filters.sizes.length ? filters.sizes.join(",") : undefined,
    colors: filters.colors.length ? filters.colors.join(",") : undefined,
    inStock: filters.inStock ? true : undefined,
    sort: filters.sort,
    page: filters.page,
    pageSize,
  };
}
