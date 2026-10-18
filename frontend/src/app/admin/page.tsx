"use client";

import Link from "next/link";
import { Suspense } from "react";
import { PageLoader } from "@/components/ui";
import { formatDate, formatPrice, GATEWAY_LABELS, ORDER_STATUS_LABELS, variantLabel, cn } from "@/lib/format";
import type { Dashboard, OrderStatus } from "@/lib/types";
import { BarList } from "@/components/admin/charts/bar-list";
import { ChartCard, ChartTable } from "@/components/admin/charts/chart-card";
import { GATEWAY_COLORS } from "@/components/admin/charts/palette";
import { RevenueChart } from "@/components/admin/charts/revenue-chart";
import { SplitBar } from "@/components/admin/charts/split-bar";
import { DesktopOnly, LinkRow, MobileCard, MobileList, Table, TableCard, Td, Th, THead, TableEmpty } from "@/components/admin/data-table";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { KpiTile } from "@/components/admin/kpi-tile";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { OrderStatusBadge, PaymentStatusBadge, StockBadge } from "@/components/admin/status-badges";
import { formatInt, longDay, plural } from "@/components/admin/utils";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

/** Rounds paise to whole rupees for headline figures. */
const roundRupee = (paise: number) => Math.round(paise / 100) * 100;

const STATUS_ORDER: OrderStatus[] =["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DashboardView />
    </Suspense>
  );
}

function DashboardView() {
  const { get, update } = useUrlState();
  const raw = get("days");
  const days: RangeValue = RANGES.some((r) => r.value === raw) ? (raw as RangeValue) : "30";
  const { data, error, isLoading, isFetching, reload } = useApiQuery<Dashboard>(`/admin/dashboard?days=${days}`);

  const rangeControl = (
    <Segmented
      label="Date range"
      value={days}
      onChange={(v) => update({ days: v === "30" ? null : v })}
      options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
    />
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          data
            ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}`
            : `Store performance over the last ${days} days`
        }
        actions={rangeControl}
      />

      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <LoadError error={error} onRetry={reload} what="the dashboard" />
      ) : (
        <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching || undefined}>
          {error ? (
            <InlineAlert title="Couldn't refresh the dashboard">Showing the previous numbers.</InlineAlert>
          ) : null}
          <DashboardBody data={data} />
        </div>
      )}
    </>
  );
}

function DashboardBody({ data }: { data: Dashboard }) {
  const { totals } = data;
  const period = `previous ${data.range.days} days`;

  const statusRows = STATUS_ORDER.map((status) => ({
    key: status,
    label: ORDER_STATUS_LABELS[status],
    value: data.ordersByStatus.find((s) => s.status === status)?.count ?? 0,
    href: `/admin/orders?status=${status}`,
  }));
  const statusTotal = statusRows.reduce((s, r) => s + r.value, 0);

  const gatewaySegments = data.gatewaySplit.map((g) => ({
    key: g.gateway,
    label: GATEWAY_LABELS[g.gateway] ?? g.gateway,
    color: GATEWAY_COLORS[g.gateway] ?? "#a1a1aa",
    value: g.revenue,
    formatted: formatPrice(g.revenue),
    detail: plural(g.orders, "order"),
  }));
  const gatewayRevenue = data.gatewaySplit.reduce((s, g) => s + g.revenue, 0);

  return (
    <>
      {/* KPI row */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <KpiTile
            label="Revenue"
            value={formatPrice(totals.revenue)}
            delta={{
              current: totals.revenue,
              previous: totals.previousRevenue,
              periodLabel: period,
              formatPrevious: (n) => formatPrice(roundRupee(n)),
            }}
          />
        </div>
        <KpiTile
          label="Paid orders"
          value={formatInt(totals.paidOrders)}
          delta={{ current: totals.paidOrders, previous: totals.previousOrders, periodLabel: period }}
          hint={`${formatInt(totals.orders)} placed in total`}
        />
        <KpiTile label="Avg. order value" value={formatPrice(roundRupee(totals.avgOrderValue))} hint="Paid orders" />
        <KpiTile label="New customers" value={formatInt(totals.newCustomers)} hint="First sign-in this period" />
        <KpiTile
          label="Pending fulfilment"
          value={formatInt(totals.pendingFulfilment)}
          hint="Paid, not yet shipped"
          href="/admin/orders?status=confirmed"
        />
      </section>

      {/* Revenue + status */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue by day"
          subtitle="Paid orders only"
          aside={<span className="text-sm font-semibold text-zinc-900">{formatPrice(totals.revenue)}</span>}
          table={
            <ChartTable
              caption="Revenue and orders by day"
              columns={[{ label: "Date" }, { label: "Revenue", align: "right" }, { label: "Orders", align: "right" }]}
              rows={[...data.revenueByDay]
                .reverse()
                .map((d) => [longDay(d.date), formatPrice(d.revenue), formatInt(d.orders)])}
            />
          }
        >
          <RevenueChart data={data.revenueByDay} />
        </ChartCard>

        <ChartCard
          title="Orders by status"
          subtitle={`${plural(statusTotal, "order")} in this period`}
          table={
            <ChartTable
              caption="Orders by status"
              columns={[{ label: "Status" }, { label: "Orders", align: "right" }, { label: "Share", align: "right" }]}
              rows={statusRows.map((r) => [
                r.label,
                formatInt(r.value),
                `${statusTotal ? Math.round((r.value / statusTotal) * 100) : 0}%`,
              ])}
            />
          }
        >
          {statusTotal === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">No orders in this period</p>
          ) : (
            <BarList rows={statusRows} unit="orders" />
          )}
        </ChartCard>
      </div>

      {/* Gateways + top products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Payment gateways" subtitle="Share of paid revenue">
          {gatewaySegments.length === 0 || gatewayRevenue === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">No paid orders in this period</p>
          ) : (
            <SplitBar segments={gatewaySegments} label="Paid revenue by payment gateway" />
          )}
        </ChartCard>

        <Panel title="Top products" description="By revenue from paid orders" className="lg:col-span-2" flush>
          {data.topProducts.length === 0 ? (
            <TableEmpty title="No sales yet" description="Best sellers will show up here." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-zinc-100">
                    <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">
                      Product
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Units
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p, i) => (
                    <tr key={p.productId} className="border-b border-zinc-100 last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal sm:px-5">
                        <span className="mr-2 inline-block w-4 text-xs tabular-nums text-zinc-400">{i + 1}</span>
                        <Link
                          href={`/admin/products/${p.productId}`}
                          className="font-medium text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-900"
                        >
                          {p.name}
                        </Link>
                      </th>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{formatInt(p.quantity)}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 sm:px-5">
                        {formatPrice(p.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Recent orders + low stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Recent orders</h2>
            <Link href="/admin/orders" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              View all
            </Link>
          </div>
          <TableCard label="Recent orders">
            {data.recentOrders.length === 0 ? (
              <TableEmpty title="No orders yet" />
            ) : (
              <>
              <MobileList label="Recent orders">
                {data.recentOrders.map((o) => (
                  <MobileCard key={o.id} href={`/admin/orders/${encodeURIComponent(o.orderNumber)}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-zinc-900">{o.orderNumber}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{formatPrice(o.total)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {o.customer?.name || o.customer?.phone || "—"} · {formatDate(o.createdAt, true)}
                    </p>
                    <span className="mt-2 flex flex-wrap gap-1">
                      <OrderStatusBadge status={o.status} />
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </span>
                  </MobileCard>
                ))}
              </MobileList>
              <DesktopOnly>
              <Table minWidth={520}>
                <THead>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th align="right">Total</Th>
                  <Th>Status</Th>
                </THead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <LinkRow key={o.id} href={`/admin/orders/${encodeURIComponent(o.orderNumber)}`}>
                      <Td>
                        <Link
                          href={`/admin/orders/${encodeURIComponent(o.orderNumber)}`}
                          className="whitespace-nowrap font-medium text-zinc-900 hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                        <span className="block whitespace-nowrap text-xs text-zinc-500">{formatDate(o.createdAt, true)}</span>
                      </Td>
                      <Td className="max-w-40 truncate">{o.customer?.name || o.customer?.phone || "—"}</Td>
                      <Td align="right" className="font-medium tabular-nums text-zinc-900">
                        {formatPrice(o.total)}
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          <OrderStatusBadge status={o.status} />
                          <PaymentStatusBadge status={o.paymentStatus} />
                        </span>
                      </Td>
                    </LinkRow>
                  ))}
                </tbody>
              </Table>
              </DesktopOnly>
              </>
            )}
          </TableCard>
        </div>

        <Panel title="Low stock" description="Active variants running out" flush>
          {data.lowStock.length === 0 ? (
            <TableEmpty title="All variants are well stocked" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {data.lowStock.map((v) => (
                <li key={v.variantId}>
                  <Link
                    href={`/admin/products/${v.productId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-900">{v.productName}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {[variantLabel(v.size, v.color), v.sku].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <StockBadge stock={v.stock} low={Number.MAX_SAFE_INTEGER} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
