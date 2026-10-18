import type { MetadataRoute } from "next";
import { POLICIES } from "@/components/shop/policies";
import { serverApi } from "@/lib/server-api";

const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/bulk-order`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    ...POLICIES.map((p) => ({ url: `${SITE_URL}/policies/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
  try {
    const categories = await serverApi.categories();
    for (const c of categories) {
      entries.push({ url: `${SITE_URL}/products?category=${encodeURIComponent(c.slug)}`, changeFrequency: "weekly", priority: 0.6 });
    }
    // Page through the catalog (60 per page is the API maximum).
    for (let page = 1; page <= 50; page++) {
      const list = await serverApi.products({ page, pageSize: 60 });
      for (const p of list.items) {
        entries.push({ url: `${SITE_URL}/products/${p.slug}`, changeFrequency: "weekly", priority: 0.7 });
      }
      if (page >= list.totalPages) break;
    }
  } catch (err) {
    console.error("sitemap: could not load catalog", err);
  }
  return entries;
}
