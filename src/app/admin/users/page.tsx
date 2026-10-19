"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { buildQuery } from "@/lib/api";
import { Button, PageLoader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/format";
import type { AdminUserRow, Paginated } from "@/lib/types";
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
import { FilterBar, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { PageHeader } from "@/components/admin/page-header";
import { BlockedBadge, RoleBadge } from "@/components/admin/status-badges";
import { formatInt } from "@/components/admin/utils";

const PAGE_SIZE = 20;
const ROLES = [
  { value: "", label: "Everyone" },
  { value: "customer", label: "Customers" },
  { value: "admin", label: "Admins" },
] as const;

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <UsersView />
    </Suspense>
  );
}

function UsersView() {
  const { get, page, update, hrefFor } = useUrlState();
  const q = get("q");
  const role = ROLES.some((r) => r.value === get("role")) ? get("role") : "";
  const hasFilters = Boolean(q || role);
  const [searchKey, setSearchKey] = useState(0);

  const path = `/admin/users${buildQuery({ q, role, page, pageSize: PAGE_SIZE })}`;
  const { data, error, isLoading, isFetching, reload } = useApiQuery<Paginated<AdminUserRow>>(path);

  const clearFilters = () => {
    update({ q: null, role: null });
    setSearchKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description={data ? `${formatInt(data.total)} ${data.total === 1 ? "account" : "accounts"}${hasFilters ? " match your filters" : ""}` : undefined}
      />

      <FilterBar>
        <SearchInput
          key={searchKey}
          label="Search customers"
          placeholder="Name, phone or email"
          defaultValue={q}
          onSearch={(value) => update({ q: value })}
        />
        <Segmented
          label="Role"
          value={role}
          onChange={(v) => update({ role: v })}
          options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
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
        <LoadError error={error} onRetry={reload} what="customers" />
      ) : (
        <TableCard
          label="Customers"
          busy={isFetching && !isLoading}
          footer={
            data && (
              <TableFooter
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                totalPages={data.totalPages}
                hrefFor={hrefFor}
                noun="accounts"
              />
            )
          }
        >
          {isLoading || !data ? (
            <TableLoading />
          ) : data.items.length === 0 ? (
            <TableEmpty
              title={hasFilters ? "No accounts match these filters" : "No customers yet"}
              description={hasFilters ? "Try a different search or role." : "Customers appear here after their first sign-in."}
            />
          ) : (
            <>
            <MobileList label="Customers">
              {data.items.map((u) => (
                <MobileCard key={u.id} href={`/admin/users/${u.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-zinc-900">{u.name || "No name"}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{formatPrice(u.totalSpent)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {u.phone}
                    {u.email ? ` · ${u.email}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    <RoleBadge role={u.role} />
                    {u.isBlocked && <BlockedBadge />}
                    <span>
                      {formatInt(u.orderCount)} {u.orderCount === 1 ? "order" : "orders"} · joined {formatDate(u.createdAt)}
                    </span>
                  </div>
                </MobileCard>
              ))}
            </MobileList>
            <DesktopOnly>
            <Table minWidth={900}>
              <THead>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Total spent</Th>
                <Th>Joined</Th>
                <Th>
                  <span className="sr-only">Account status</span>
                </Th>
              </THead>
              <tbody>
                {data.items.map((u) => {
                  const href = `/admin/users/${u.id}`;
                  return (
                    <LinkRow key={u.id} href={href} className={u.isBlocked ? "bg-red-50/40" : undefined}>
                      <Td>
                        <Link href={href} className="block max-w-52 truncate font-medium text-zinc-900 hover:underline">
                          {u.name || <span className="font-normal italic text-zinc-500">No name</span>}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums">{u.phone}</Td>
                      <Td>
                        <span className="block max-w-56 truncate">{u.email || <span className="text-zinc-400">—</span>}</span>
                      </Td>
                      <Td>
                        <RoleBadge role={u.role} />
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {formatInt(u.orderCount)}
                      </Td>
                      <Td align="right" className="font-medium tabular-nums text-zinc-900">
                        {formatPrice(u.totalSpent)}
                      </Td>
                      <Td className="whitespace-nowrap text-zinc-500">{formatDate(u.createdAt)}</Td>
                      <Td>{u.isBlocked && <BlockedBadge />}</Td>
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
