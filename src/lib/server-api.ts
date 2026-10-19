// Server Component data fetching for public (non-user-specific) data.
// Calls the backend directly over the internal network instead of going
// through the /api rewrite.
import { buildQuery } from "./api";
import type { Category, Product, ProductList, ProductSummary, ReviewList, StoreConfig } from "./types";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ServerApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string, query?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const res = await fetch(`${BACKEND_URL}/api${path}${buildQuery(query)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ServerApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const serverApi = {
  config: () => get<StoreConfig>("/config"),
  categories: () => get<{ items: Category[] }>("/categories").then((r) => r.items),
  products: (query: Record<string, string | number | boolean | null | undefined>) => get<ProductList>("/products", query),
  /** Returns null when the product doesn't exist (404). */
  product: async (slug: string): Promise<Product | null> => {
    try {
      return await get<Product>(`/products/${encodeURIComponent(slug)}`);
    } catch (err) {
      if (err instanceof ServerApiError && err.status === 404) return null;
      throw err;
    }
  },
  related: (slug: string) =>
    get<{ items: ProductSummary[] }>(`/products/${encodeURIComponent(slug)}/related`).then((r) => r.items),
  reviews: (query: Record<string, string | number | undefined>) => get<ReviewList>("/reviews", query),
  productReviews: (slug: string, query: Record<string, string | number | undefined> = {}) =>
    get<ReviewList>(`/products/${encodeURIComponent(slug)}/reviews`, query),
};
