import type { MetadataRoute } from "next";

const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Read SITE_URL at runtime (it isn't known when the Docker image is built).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/checkout", "/cart", "/login"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
