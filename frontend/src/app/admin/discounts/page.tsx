"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { api, buildQuery } from "@/lib/api";
import { cn, formatPrice } from "@/lib/format";
import type { AdminDiscount } from "@/lib/types";
import { useToast } from "@/components/providers";
import { Badge, ButtonLink, PageLoader } from "@/components/ui";
import {
  DesktopOnly,
  LinkRow,
  MobileCard,
  MobileList,
  Table,
  TableCard,
  TableEmpty,
  TableLoading,
  Td,
  Th,
  THead,
} from "@/components/admin/data-table";
import {
  DISCOUNT_STATE,
  discountConditions,
  discountState,
  discountValueLabel,
  validityLabel,
} from "@/components/admin/discount-utils";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { FilterBar, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { IconPlus } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/page-header";
import { formatInt } from "@/components/admin/utils";

export default function AdminDiscountsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DiscountsView />
    </Suspense>
  );
}

function DiscountsView() {
  const { get, update } = useUrlState();
  const kind = ["code", "automatic"].includes(get("kind")) ? get("kind") : "";
  const status = ["active", "inactive"].includes(get("status")) ? get("status") : "";
  const q = get("q");
  const { data, error, isLoading, isFetching, reload, setData } = useApiQuery<{ items: AdminDiscount[] }>(
    `/admin/discounts${buildQuery({ kind, status, q })}`,
  );
  const filtered = Boolean(kind || status || q);

  const replace = (next: AdminDiscount) =>
    setData((prev) => (prev ? { items: prev.items.map((d) => (d.id === next.id ? next : d)) } : prev));

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Coupon codes and automatic offers. One discount applies per order; the bigger saving wins."
        actions={
          <ButtonLink href="/admin/discounts/new">
            <IconPlus className="size-4" />
            New discount
          </ButtonLink>
        }
      />

      <FilterBar className="mb-4">
        <Segmented
          label="Discount kind"
          value={kind}
          onChange={(v) => update({ kind: v })}
          options={[
            { value: "", label: "All" },
            { value: "code", label: "Codes" },
            { value: "automatic", label: "Automatic" },
          ]}
        />
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => update({ status: v })}
          options={[
            { value: "", label: "Any status" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Off or ended" },
          ]}
        />
        <SearchInput defaultValue={q} onSearch={(v) => update({ q: v })} placeholder="Search code or title" label="Search discounts" />
      </FilterBar>

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {!data && !isLoading ? (
        <LoadError error={error} onRetry={reload} what="discounts" />
      ) : (
        <TableCard label="Discounts" busy={isFetching && !isLoading}>
          {isLoading || !data ? (
            <TableLoading />
          ) : data.items.length === 0 ? (
            <TableEmpty
              title={filtered ? "No discounts match" : "No discounts yet"}
              description={filtered ? "Try other filters." : "Create a code like DIWALI10, or an automatic festive offer."}
              action={
                !filtered && (
                  <ButtonLink href="/admin/discounts/new" size="sm">
                    New discount
                  </ButtonLink>
                )
              }
            />
          ) : (
            <>
              <MobileList label="Discounts">
                {data.items.map((d) => {
                  const state = DISCOUNT_STATE[discountState(d)];
                  return (
                    <MobileCard key={d.id} href={`/admin/discounts/${d.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900">{d.code ? <span className="font-mono">{d.code}</span> : d.title}</p>
                          <p className="mt-0.5 text-sm text-zinc-700">{discountValueLabel(d)}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {[d.code ? d.title : "Automatic", ...discountConditions(d)].join(" · ")}
                          </p>
                        </div>
                        <Badge className={state.className}>{state.label}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">
                        {formatInt(d.timesUsed)}
                        {d.usageLimit ? ` / ${formatInt(d.usageLimit)}` : ""} used · {validityLabel(d)}
                      </p>
                    </MobileCard>
                  );
                })}
              </MobileList>
              <DesktopOnly>
                <Table minWidth={900}>
                  <THead>
                    <Th>Discount</Th>
                    <Th>Value</Th>
                    <Th>Conditions</Th>
                    <Th align="right">Used</Th>
                    <Th align="right">Saved</Th>
                    <Th>Validity</Th>
                    <Th>Status</Th>
                  </THead>
                  <tbody>
                    {data.items.map((d) => (
                      <DiscountRow key={d.id} discount={d} onChanged={replace} />
                    ))}
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

function DiscountRow({ discount: d, onChanged }: { discount: AdminDiscount; onChanged: (d: AdminDiscount) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const href = `/admin/discounts/${d.id}`;
  const state = DISCOUNT_STATE[discountState(d)];
  const conditions = discountConditions(d);

  async function toggle() {
    setBusy(true);
    try {
      const next = await api<AdminDiscount>(`/admin/discounts/${d.id}`, { method: "PATCH", body: { isActive: !d.isActive } });
      onChanged(next);
      toast.success(next.isActive ? `${next.code ?? next.title} switched on` : `${next.code ?? next.title} switched off`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinkRow href={href}>
      <Td>
        <Link href={href} className="block max-w-56 truncate font-medium text-zinc-900 hover:underline">
          {d.code ? <span className="font-mono">{d.code}</span> : d.title}
        </Link>
        <span className="block max-w-56 truncate text-xs text-zinc-500">{d.code ? d.title : "Automatic offer"}</span>
      </Td>
      <Td className="whitespace-nowrap text-zinc-900">{discountValueLabel(d)}</Td>
      <Td className="text-xs text-zinc-600">{conditions.length ? conditions.join(" · ") : <span className="text-zinc-400">None</span>}</Td>
      <Td align="right" className="whitespace-nowrap tabular-nums">
        {formatInt(d.timesUsed)}
        {d.usageLimit ? <span className="text-zinc-400"> / {formatInt(d.usageLimit)}</span> : null}
      </Td>
      <Td align="right" className="whitespace-nowrap tabular-nums">
        {d.totalSaved ? formatPrice(d.totalSaved) : <span className="text-zinc-400">—</span>}
      </Td>
      <Td className="whitespace-nowrap text-xs text-zinc-600">{validityLabel(d)}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={d.isActive}
            aria-label={`${d.isActive ? "Switch off" : "Switch on"} ${d.code ?? d.title}`}
            onClick={toggle}
            disabled={busy}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50",
              d.isActive ? "bg-brand-700" : "bg-zinc-300",
            )}
          >
            <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", d.isActive ? "translate-x-4.5" : "translate-x-0.5")} />
          </button>
          <Badge className={state.className}>{state.label}</Badge>
        </div>
      </Td>
    </LinkRow>
  );
}
