"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { buildQuery } from "@/lib/api";
import { Button, PageLoader } from "@/components/ui";
import { formatDate, formatPrice, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/format";
import type { OrderStatus, OrderSummary, Paginated, PaymentStatus } from "@/lib/types";
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
import { DateFilter, FilterBar, FilterSelect, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { PageHeader } from "@/components/admin/page-header";
import { GatewayLabel, OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/status-badges";
import { formatInt } from "@/components/admin/utils";

const PAGE_SIZE = 20;
const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const { get, page, update, hrefFor } = useUrlState();
  const status = (ORDER_STATUSES as string[]).includes(get("status")) ? get("status") : "";
  const paymentStatus = (PAYMENT_STATUSES as string[]).includes(get("paymentStatus")) ? get("paymentStatus") : "";
  const q = get("q");
  const from = get("from");
  const to = get("to");
  const hasFilters = Boolean(status || paymentStatus || q || from || to);
  const [searchKey, setSearchKey] = useState(0);

  const path = `/admin/orders${buildQuery({ status, paymentStatus, q, from, to, page, pageSize: PAGE_SIZE })}`;
  const { data, error, isLoading, isFetching, reload } = useApiQuery<Paginated<OrderSummary>>(path);

  const clearFilters = () => {
    update({ status: null, paymentStatus: null, q: null, from: null, to: null });
    setSearchKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description={data ? `${formatInt(data.total)} ${data.total === 1 ? "order" : "orders"}${hasFilters ? " match your filters" : ""}` : undefined}
      />

      <Segmented
        label="Order status"
        className="mb-3"
        value={status}
        onChange={(v) => update({ status: v })}
        options={[{ value: "", label: "All" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))]}
      />

      <FilterBar>
        <SearchInput
          key={searchKey}
          label="Search orders"
          placeholder="Order number, customer name or phone"
          defaultValue={q}
          onSearch={(value) => update({ q: value })}
        />
        <FilterSelect
          label="Payment"
          value={paymentStatus}
          onChange={(v) => update({ paymentStatus: v })}
          options={[
            { value: "", label: "All payments" },
            ...PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] })),
          ]}
        />
        <DateFilter label="From" value={from} max={to || undefined} onChange={(v) => update({ from: v })} />
        <DateFilter label="To" value={to} min={from || undefined} onChange={(v) => update({ to: v })} />
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
        <LoadError error={error} onRetry={reload} what="orders" />
      ) : (
        <TableCard
          label="Orders"
          busy={isFetching && !isLoading}
          footer={
            data && (
              <TableFooter
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                totalPages={data.totalPages}
                hrefFor={hrefFor}
                noun="orders"
              />
            )
          }
        >
          {isLoading || !data ? (
            <TableLoading />
          ) : data.items.length === 0 ? (
            <TableEmpty
              title={hasFilters ? "No orders match these filters" : "No orders yet"}
              description={hasFilters ? "Try a different status, date range or search." : "New orders will appear here."}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
            <MobileList label="Orders">
              {data.items.map((o) => (
                <MobileCard key={o.id} href={`/admin/orders/${encodeURIComponent(o.orderNumber)}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-zinc-900">{o.orderNumber}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{formatPrice(o.total)}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
                    <span className="min-w-0 truncate">
                      {o.customer?.name || o.customer?.phone || "—"} · {formatInt(o.itemCount)} {o.itemCount === 1 ? "item" : "items"}
                    </span>
                    <span className="shrink-0">{formatDate(o.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <PaymentStatusBadge status={o.paymentStatus} />
                    <span className="text-xs text-zinc-500">
                      <GatewayLabel gateway={o.paymentGateway} />
                    </span>
                  </div>
                </MobileCard>
              ))}
            </MobileList>
            <DesktopOnly>
            <Table minWidth={880}>
              <THead>
                <Th>Order</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th align="right">Items</Th>
                <Th align="right">Total</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th>Gateway</Th>
              </THead>
              <tbody>
                {data.items.map((o) => {
                  const href = `/admin/orders/${encodeURIComponent(o.orderNumber)}`;
                  return (
                    <LinkRow key={o.id} href={href}>
                      <Td>
                        <Link href={href} className="whitespace-nowrap font-medium text-zinc-900 hover:underline">
                          {o.orderNumber}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-zinc-500">{formatDate(o.createdAt, true)}</Td>
                      <Td>
                        <span className="block max-w-48 truncate text-zinc-900">{o.customer?.name || "—"}</span>
                        <span className="block text-xs text-zinc-500">{o.customer?.phone}</span>
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {formatInt(o.itemCount)}
                      </Td>
                      <Td align="right" className="font-medium tabular-nums text-zinc-900">
                        {formatPrice(o.total)}
                      </Td>
                      <Td>
                        <PaymentStatusBadge status={o.paymentStatus} />
                      </Td>
                      <Td>
                        <OrderStatusBadge status={o.status} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        <GatewayLabel gateway={o.paymentGateway} />
                      </Td>
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
