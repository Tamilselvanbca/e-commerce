"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import type { OrderSummary, Paginated } from "@/lib/types";
import { Button, ButtonLink, Card, EmptyState, Pagination, ProductImg } from "@/components/ui";
import { BoxesIcon, ChevronRightIcon } from "@/components/shop/icons";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/shop/order-bits";
import { useApi } from "@/components/shop/use-api";
import { orderHref } from "@/components/shop/use-payment";

export function OrdersList({ page }: { page: number }) {
  const { data, error, loading, reload } = useApi<Paginated<OrderSummary>>(`/orders?page=${page}`);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-900">Orders</h2>
      <p className="mt-1 text-sm text-zinc-600">Track, pay for or review your orders.</p>

      <div className="mt-6">
        {loading && !data ? (
          <ul className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="h-24 rounded-xl bg-zinc-100" />
            ))}
          </ul>
        ) : error && !data ? (
          <EmptyState
            title="We couldn't load your orders"
            description={errorMessage(error)}
            action={
              <Button variant="outline" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : !data || data.items.length === 0 ? (
          page > 1 && data && data.total > 0 ? (
            <EmptyState title="No orders on this page" action={<ButtonLink href="/account/orders">Go to first page</ButtonLink>} />
          ) : (
            <EmptyState
              icon={<BoxesIcon className="size-10" />}
              title="No orders yet"
              description="When you place an order, it will appear here so you can track it."
              action={<ButtonLink href="/products">Start shopping</ButtonLink>}
            />
          )
        ) : (
          <>
            <ul className={loading ? "space-y-3 opacity-60" : "space-y-3"}>
              {data.items.map((o) => (
                <li key={o.id}>
                  <Link
                    href={orderHref(o.orderNumber)}
                    className="group flex items-center gap-4 rounded-xl border border-zinc-200 p-3 transition-colors hover:border-zinc-400 hover:bg-zinc-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:p-4"
                  >
                    <ProductImg src={o.previewImage} alt="" className="size-16 shrink-0 rounded-lg sm:size-20" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-mono text-sm font-medium text-zinc-900">{o.orderNumber}</p>
                        <OrderStatusBadge status={o.status} />
                        {o.status !== "cancelled" && o.paymentStatus !== "paid" && <PaymentStatusBadge status={o.paymentStatus} />}
                      </div>
                      <p className="mt-1 text-sm text-zinc-600">
                        {formatDate(o.createdAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{formatPrice(o.total)}</p>
                      <ChevronRightIcon className="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {data.totalPages > 1 && (
              <div className="mt-8">
                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  hrefFor={(p) => (p > 1 ? `/account/orders?page=${p}` : "/account/orders")}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
