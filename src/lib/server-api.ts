// Server Component data fetching for public (non-user-specific) data.
// Calls the backend directly over the internal network instead of going
// through the /api rewrite.
import type { Agent } from "node:http";
import { buildQuery } from "./api";
import type { Category, Offer, PrebookProduct, Product, ProductList, ProductSummary, ReviewList, StoreConfig } from "./types";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ServerApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Set by the single-process GoDaddy bundle (deploy/godaddy/server.js): an agent
 * that reaches the API in memory, because the platform refuses a connection to
 * the app's own port.
 */
const inProcessAgent = () => (globalThis as unknown as { __shopApiAgent?: Agent }).__shopApiAgent;

async function request(url: string): Promise<{ status: number; body: string }> {
  const agent = inProcessAgent();
  if (!agent) {
    const res = await fetch(`${BACKEND_URL}${url}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    return { status: res.status, body: await res.text() };
  }
  const http = await import("node:http");
  return new Promise((resolve, reject) => {
    const req = http.request({ path: url, host: "localhost", headers: { Accept: "application/json" }, agent }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 500, body }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

async function get<T>(path: string, query?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const { status, body } = await request(`/api${path}${buildQuery(query)}`);
  if (status < 200 || status >= 300) {
    let message = `Request failed (${status})`;
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ServerApiError(status, message);
  }
  return JSON.parse(body) as T;
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
  /** Running offers (automatic offers and listed coupons). */
  offers: () => get<{ items: Offer[] }>("/offers").then((r) => r.items),
  /** Every active product (in stock or not) for the Pre-book form. */
  prebookProducts: () => get<{ items: PrebookProduct[] }>("/prebookings/products").then((r) => r.items),
  productReviews: (slug: string, query: Record<string, string | number | undefined> = {}) =>
    get<ReviewList>(`/products/${encodeURIComponent(slug)}/reviews`, query),
};
