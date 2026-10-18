"use client";

import Link from "next/link";
import { Suspense } from "react";
import { buildQuery } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import type { GiftCardList, GiftCardStatus } from "@/lib/types";
import { Badge, ButtonLink, PageLoader } from "@/components/ui";
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
import { GIFT_CARD_STATUS } from "@/components/admin/discount-utils";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { FilterBar, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { IconPlus } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/page-header";
import { formatInt } from "@/components/admin/utils";

const PAGE_SIZE = 20;
const STATUSES: GiftCardStatus[] = ["active", "used", "expired", "disabled"];

export default function AdminGiftCardsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <GiftCardsView />
    </Suspense>
  );
}

function GiftCardsView() {
  const { get, page, update, hrefFor } = useUrlState();
  const status = (STATUSES as string[]).includes(get("status")) ? get("status") : "";
  const q = get("q");
  const { data, error, isLoading, isFetching, reload } = useApiQuery<GiftCardList>(
    `/admin/gift-cards${buildQuery({ status, q, page, pageSize: PAGE_SIZE })}`,
  );
  const filtered = Boolean(status || q);

  return (
    <>
      <PageHeader
        title="Gift cards"
        description={
          data
            ? `${formatInt(data.summary.cards)} issued · ${formatPrice(data.summary.outstanding)} unspent balance`
            : "Issue gift cards for festivals, corporate gifting or goodwill."
        }
        actions={
          <ButtonLink href="/admin/gift-cards/new">
            <IconPlus className="size-4" />
            Issue gift card
          </ButtonLink>
        }
      />

      <FilterBar className="mb-4">
        <Segmented
          label="Gift card status"
          value={status}
          onChange={(v) => update({ status: v })}
          options={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: GIFT_CARD_STATUS[s].label }))]}
        />
        <SearchInput defaultValue={q} onSearch={(v) => update({ q: v })} placeholder="Code, recipient name or email" label="Search gift cards" />
      </FilterBar>

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {!data && !isLoading ? (
        <LoadError error={error} onRetry={reload} what="gift cards" />
      ) : (
        <TableCard
          label="Gift cards"
          busy={isFetching && !isLoading}
          footer={
            data && (
              <TableFooter page={data.page} pageSize={data.pageSize} total={data.total} totalPages={data.totalPages} hrefFor={hrefFor} noun="gift cards" />
            )
          }
        >
          {isLoading || !data ? (
            <TableLoading />
          ) : data.items.length === 0 ? (
            <TableEmpty
              title={filtered ? "No gift cards match" : "No gift cards yet"}
              description={filtered ? "Try other filters." : "Issue one and it is emailed to the recipient with its code."}
              action={
                !filtered && (
                  <ButtonLink href="/admin/gift-cards/new" size="sm">
                    Issue gift card
                  </ButtonLink>
                )
              }
            />
          ) : (
            <>
              <MobileList label="Gift cards">
                {data.items.map((g) => (
                  <MobileCard key={g.id} href={`/admin/gift-cards/${g.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium text-zinc-900">{g.code}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{g.recipientName ?? g.recipientEmail ?? "No recipient"}</p>
                      </div>
                      <Badge className={GIFT_CARD_STATUS[g.status].className}>{GIFT_CARD_STATUS[g.status].label}</Badge>
                    </div>
                    <p className="mt-2 text-sm tabular-nums text-zinc-900">
                      {formatPrice(g.balance)} <span className="text-zinc-500">of {formatPrice(g.initialBalance)}</span>
                    </p>
                  </MobileCard>
                ))}
              </MobileList>
              <DesktopOnly>
                <Table minWidth={860}>
                  <THead>
                    <Th>Code</Th>
                    <Th>Recipient</Th>
                    <Th align="right">Balance</Th>
                    <Th align="right">Value</Th>
                    <Th>Expires</Th>
                    <Th>Issued</Th>
                    <Th>Status</Th>
                  </THead>
                  <tbody>
                    {data.items.map((g) => {
                      const href = `/admin/gift-cards/${g.id}`;
                      return (
                        <LinkRow key={g.id} href={href}>
                          <Td>
                            <Link href={href} className="whitespace-nowrap font-mono font-medium text-zinc-900 hover:underline">
                              {g.code}
                            </Link>
                          </Td>
                          <Td>
                            <span className="block max-w-56 truncate text-zinc-900">{g.recipientName ?? "—"}</span>
                            {g.recipientEmail && <span className="block max-w-56 truncate text-xs text-zinc-500">{g.recipientEmail}</span>}
                          </Td>
                          <Td align="right" className="whitespace-nowrap tabular-nums font-medium text-zinc-900">
                            {formatPrice(g.balance)}
                          </Td>
                          <Td align="right" className="whitespace-nowrap tabular-nums">
                            {formatPrice(g.initialBalance)}
                          </Td>
                          <Td className="whitespace-nowrap text-zinc-600">{g.expiresAt ? formatDate(g.expiresAt) : "Never"}</Td>
                          <Td className="whitespace-nowrap text-zinc-600">{formatDate(g.createdAt)}</Td>
                          <Td>
                            <Badge className={GIFT_CARD_STATUS[g.status].className}>{GIFT_CARD_STATUS[g.status].label}</Badge>
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
