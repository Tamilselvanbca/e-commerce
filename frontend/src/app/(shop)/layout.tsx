import { KolamBackdrop } from "@/components/kolam";
import { SiteFooter } from "@/components/shop/footer";
import { SiteHeader } from "@/components/shop/header";
import { topLevelCategories } from "@/components/shop/catalog";
import { serverApi } from "@/lib/server-api";
import type { Category } from "@/lib/types";

async function loadCategories(): Promise<Category[]> {
  try {
    return await serverApi.categories();
  } catch (err) {
    console.error("Could not load categories:", err);
    return [];
  }
}

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const categories = topLevelCategories(await loadCategories());
  const year = new Date().getFullYear();
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to content
      </a>
      <KolamBackdrop />
      <SiteHeader categories={categories} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter categories={categories} year={year} />
    </>
  );
}
