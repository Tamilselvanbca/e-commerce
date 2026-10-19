import type { Metadata } from "next";
import { activeFilterCount, categoryTree, parseProductFilters, productsHref, productsQuery } from "@/components/shop/catalog";
import { SearchIcon } from "@/components/shop/icons";
import { ProductGrid } from "@/components/shop/product-card";
import {
  ActiveFilters,
  FiltersSidebar,
  ListingProvider,
  MobileFilters,
  PendingArea,
  SortSelect,
} from "@/components/shop/product-filters";
import { Breadcrumbs, Container, type Crumb } from "@/components/shop/section";
import { ButtonLink, EmptyState, Pagination } from "@/components/ui";
import { serverApi } from "@/lib/server-api";
import type { Category, ProductList } from "@/lib/types";

const PAGE_SIZE = 24;
const EMPTY_FACETS: ProductList["facets"] = { sizes: [], colors: [], priceRange: { min: 0, max: 0 } };

async function loadCategories(): Promise<Category[]> {
  try {
    return await serverApi.categories();
  } catch {
    return [];
  }
}

export async function generateMetadata(props: PageProps<"/products">): Promise<Metadata> {
  const filters = parseProductFilters(await props.searchParams);
  if (filters.q) return { title: `Search results for “${filters.q}”` };
  if (filters.category) {
    const category = (await loadCategories()).find((c) => c.slug === filters.category);
    if (category) return { title: category.name, description: category.description ?? undefined };
  }
  return { title: "Shop all products" };
}

export default async function ProductsPage(props: PageProps<"/products">) {
  const filters = parseProductFilters(await props.searchParams);
  const [result, categories] = await Promise.all([
    serverApi.products(productsQuery(filters, PAGE_SIZE)).then(
      (list) => ({ list, error: null }),
      (error: unknown) => {
        console.error("Could not load products:", error);
        return { list: null, error };
      },
    ),
    loadCategories(),
  ]);
  const list = result.list;

  const category = filters.category ? categories.find((c) => c.slug === filters.category) : undefined;
  const parent = category?.parentId ? categories.find((c) => c.id === category.parentId) : undefined;
  const title = filters.q ? `Results for “${filters.q}”` : (category?.name ?? "All products");

  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];
  if (filters.q || category) crumbs.push({ label: "Shop", href: "/products" });
  else crumbs.push({ label: "Shop" });
  if (parent) crumbs.push({ label: parent.name, href: productsHref({ category: parent.slug }) });
  if (category && !filters.q) crumbs.push({ label: category.name });
  if (filters.q) crumbs.push({ label: "Search" });

  const tree = categoryTree(categories);
  const facets = list?.facets ?? EMPTY_FACETS;
  const total = list?.total ?? 0;
  const hasFilters = activeFilterCount(filters) > 0;

  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={crumbs} className="mb-4" />
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{title}</h1>
        {category?.description && !filters.q && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">{category.description}</p>
        )}
      </div>

      <ListingProvider filters={filters}>
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Product filters">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8 pr-1">
              <FiltersSidebar facets={facets} categories={tree} />
            </div>
          </aside>

          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="lg:hidden">
                  <MobileFilters facets={facets} categories={tree} total={total} />
                </div>
                <p className="text-sm text-zinc-600" aria-live="polite">
                  {list ? (
                    <>
                      <span className="font-medium text-zinc-900">{total}</span> {total === 1 ? "product" : "products"}
                    </>
                  ) : null}
                </p>
              </div>
              <SortSelect />
            </div>

            <ActiveFilters categoryName={category?.name} />

            <PendingArea>
              {!list ? (
                <EmptyState
                  title="We couldn't load products"
                  description="Something went wrong on our side. Please try again in a moment."
                  action={
                    <ButtonLink href={productsHref(filters)} variant="outline">
                      Try again
                    </ButtonLink>
                  }
                />
              ) : list.items.length === 0 ? (
                filters.page > 1 && list.total > 0 ? (
                  <EmptyState
                    title="This page is empty"
                    description="There are fewer results than this page number."
                    action={<ButtonLink href={productsHref({ ...filters, page: 1 })}>Go to first page</ButtonLink>}
                  />
                ) : (
                  <EmptyState
                    icon={<SearchIcon className="size-8" />}
                    title={filters.q ? `No results for “${filters.q}”` : "No products found"}
                    description={
                      hasFilters
                        ? "Try removing some filters or widening the price range."
                        : filters.q
                          ? "Check the spelling or try a more general term."
                          : "New products are added regularly. Please check back soon."
                    }
                    action={
                      hasFilters || filters.q ? (
                        <ButtonLink href={filters.q && hasFilters ? productsHref({ q: filters.q }) : "/products"} variant="outline">
                          {filters.q && hasFilters ? "Clear filters" : "Browse all products"}
                        </ButtonLink>
                      ) : undefined
                    }
                  />
                )
              ) : (
                <ProductGrid
                  products={list.items}
                  priorityCount={4}
                  className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:gap-x-6 2xl:grid-cols-4"
                />
              )}
            </PendingArea>

            {list && list.totalPages > 1 && (
              <div className="mt-12">
                <Pagination page={list.page} totalPages={list.totalPages} hrefFor={(page) => productsHref({ ...filters, page })} />
              </div>
            )}
          </div>
        </div>
      </ListingProvider>
    </Container>
  );
}
