"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { buildQuery } from "@/lib/api";
import { Button, ButtonLink, PageLoader, ProductImg } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/format";
import type { AdminProductRow, Category, Paginated, ProductStatus } from "@/lib/types";
import {
  DesktopOnly,
  LinkRow,
  MobileCard,
  MobileList,
  Table,
  TableCard,
  TableEmpty,
  TableFooter,
  TableLoading,
  Td,
  Th,
  THead,
} from "@/components/admin/data-table";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { FilterBar, FilterSelect, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { IconPlus, IconStar } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/page-header";
import { PRODUCT_STATUS_LABELS, ProductStatusBadge, StockBadge } from "@/components/admin/status-badges";
import { formatInt } from "@/components/admin/utils";
import { categoryOptions } from "@/components/admin/category-tree";

const PAGE_SIZE = 20;
const STATUSES: ProductStatus[] = ["active", "draft", "archived"];

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProductsView />
    </Suspense>
  );
}

function ProductsView() {
  const { get, page, update, hrefFor } = useUrlState();
  const q = get("q");
  const category = get("category");
  const status = (STATUSES as string[]).includes(get("status")) ? get("status") : "";
  const hasFilters = Boolean(q || category || status);
  const [searchKey, setSearchKey] = useState(0);

  const categories = useApiQuery<{ items: Category[] }>("/admin/categories");
  const path = `/admin/products${buildQuery({ q, category, status, page, pageSize: PAGE_SIZE })}`;
  const { data, error, isLoading, isFetching, reload } = useApiQuery<Paginated<AdminProductRow>>(path);

  const clearFilters = () => {
    update({ q: null, category: null, status: null });
    setSearchKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader
        title="Products"
        description={data ? `${formatInt(data.total)} ${data.total === 1 ? "product" : "products"}${hasFilters ? " match your filters" : ""}` : undefined}
        actions={
          <ButtonLink href="/admin/products/new">
            <IconPlus className="size-4" />
            New product
          </ButtonLink>
        }
      />

      <Segmented
        label="Product status"
        className="mb-3"
        value={status}
        onChange={(v) => update({ status: v })}
        options={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))]}
      />

      <FilterBar>
        <SearchInput
          key={searchKey}
          label="Search products"
          placeholder="Search by name, slug or SKU"
          defaultValue={q}
          onSearch={(value) => update({ q: value })}
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={(v) => update({ category: v })}
          options={[
            { value: "", label: "All categories" },
            ...categoryOptions(categories.data?.items ?? []).map((c) => ({ value: c.category.slug, label: c.label })),
          ]}
        />
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </FilterBar>

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {!data && !isLoading ? (
        <LoadError error={error} onRetry={reload} what="products" />
      ) : (
        <TableCard
          label="Products"
          busy={isFetching && !isLoading}
          footer={
            data && (
              <TableFooter
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                totalPages={data.totalPages}
                hrefFor={hrefFor}
                noun="products"
              />
            )
          }
        >
          {isLoading || !data ? (
            <TableLoading />
          ) : data.items.length === 0 ? (
            <TableEmpty
              title={hasFilters ? "No products match these filters" : "No products yet"}
              description={hasFilters ? "Try a different search, category or status." : "Add your first product to start selling."}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <ButtonLink href="/admin/products/new" size="sm">
                    New product
                  </ButtonLink>
                )
              }
            />
          ) : (
            <>
            <MobileList label="Products">
              {data.items.map((p) => (
                <MobileCard key={p.id} href={`/admin/products/${p.id}`}>
                  <div className="flex gap-3">
                    <ProductImg src={p.imageUrl} alt="" className="size-14 shrink-0 rounded-lg border border-zinc-100" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium text-zinc-900">{p.name}</span>
                        {p.isFeatured && <IconStar filled className="size-4 shrink-0 text-amber-500" aria-label="Featured" />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {p.category?.name ?? "Uncategorised"} · {formatInt(p.variantCount)} {p.variantCount === 1 ? "variant" : "variants"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium tabular-nums text-zinc-900">
                          {p.variantCount === 0 ? "—" : p.maxPrice > p.minPrice ? `${formatPrice(p.minPrice)} – ${formatPrice(p.maxPrice)}` : formatPrice(p.minPrice)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                          Stock <StockBadge stock={p.totalStock} />
                        </span>
                        <ProductStatusBadge status={p.status} />
                      </div>
                    </div>
                  </div>
                </MobileCard>
              ))}
            </MobileList>
            <DesktopOnly>
            <Table minWidth={960}>
              <THead>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th align="right">Price</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Variants</Th>
                <Th>Status</Th>
                <Th align="center">Featured</Th>
                <Th>Updated</Th>
              </THead>
              <tbody>
                {data.items.map((p) => {
                  const href = `/admin/products/${p.id}`;
                  return (
                    <LinkRow key={p.id} href={href}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <ProductImg src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-md border border-zinc-100" />
                          <div className="min-w-0">
                            <Link href={href} className="block max-w-64 truncate font-medium text-zinc-900 hover:underline">
                              {p.name}
                            </Link>
                            <span className="block max-w-64 truncate text-xs text-zinc-500">/{p.slug}</span>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">{p.category?.name ?? <span className="text-zinc-400">Uncategorised</span>}</Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums text-zinc-900">
                        {p.variantCount === 0
                          ? "—"
                          : p.maxPrice > p.minPrice
                            ? `${formatPrice(p.minPrice)} – ${formatPrice(p.maxPrice)}`
                            : formatPrice(p.minPrice)}
                      </Td>
                      <Td align="right">
                        <StockBadge stock={p.totalStock} />
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {formatInt(p.variantCount)}
                      </Td>
                      <Td>
                        <ProductStatusBadge status={p.status} />
                      </Td>
                      <Td align="center">
                        {p.isFeatured ? (
                          <span className="inline-flex text-amber-500" title="Featured">
                            <IconStar filled className="size-4" />
                            <span className="sr-only">Featured</span>
                          </span>
                        ) : (
                          <span className="text-zinc-300" aria-label="Not featured">
                            —
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-zinc-500">{formatDate(p.updatedAt)}</Td>
                    </LinkRow>
                  );
                })}
              </tbody>
            </Table>
            </DesktopOnly>
            </>
          )}
        </TableCard>
      )}
    </>
  );
}
