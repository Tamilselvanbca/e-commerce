"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth, useToast } from "@/components/providers";
import { Badge, Button, PageLoader } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/format";
import type { Address, AdminUserRow, OrderSummary, User } from "@/lib/types";
import { ConfirmDialog, DangerTextButton } from "@/components/admin/confirm-dialog";
import { LinkRow, Table, TableCard, TableEmpty, Td, Th, THead } from "@/components/admin/data-table";
import { LoadError } from "@/components/admin/feedback";
import { useApiQuery } from "@/components/admin/hooks";
import { DescriptionList, PageHeader, Panel } from "@/components/admin/page-header";
import { BlockedBadge, OrderStatusBadge, PaymentStatusBadge, RoleBadge } from "@/components/admin/status-badges";
import { formatInt } from "@/components/admin/utils";

type AdminUser = User & Partial<Pick<AdminUserRow, "isBlocked" | "orderCount" | "totalSpent" | "lastLoginAt">>;
type UserDetail = { user: AdminUser; addresses: Address[]; orders: OrderSummary[] };
type Action = "role" | "block" | null;

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const toast = useToast();
  const path = `/admin/users/${encodeURIComponent(id)}`;
  const { data, error, isLoading, reload, setData } = useApiQuery<UserDetail>(path, { keepPrevious: false });
  const [action, setAction] = useState<Action>(null);
  const [saving, setSaving] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!data) {
    return (
      <>
        <PageHeader title="Customer" back={{ href: "/admin/users", label: "Customers" }} />
        <LoadError error={error} onRetry={reload} what="this customer" backHref="/admin/users" backLabel="Back to customers" />
      </>
    );
  }

  const { user, addresses, orders } = data;
  const isSelf = me?.id === user.id;
  const isAdmin = user.role === "admin";
  const isBlocked = Boolean(user.isBlocked);
  const displayName = user.name || "Unnamed customer";
  const lastOrderAt = orders.reduce<string | null>((latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest), null);
  const totalSpent = user.totalSpent ?? orders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.total, 0);

  const apply = async () => {
    if (!action) return;
    const body = action === "role" ? { role: isAdmin ? "customer" : "admin" } : { isBlocked: !isBlocked };
    setSaving(true);
    try {
      const res = await api<AdminUser | { user: AdminUser }>(path, { method: "PATCH", body });
      // The contract returns the user; tolerate a `{ user }` wrapper too.
      const updated = "user" in res && res.user && typeof res.user === "object" ? res.user : (res as AdminUser);
      setData((prev) => (prev ? { ...prev, user: { ...prev.user, ...body, ...updated } } : prev));
      toast.success(
        action === "role"
          ? isAdmin
            ? `${displayName} is no longer an admin`
            : `${displayName} is now an admin`
          : isBlocked
            ? `${displayName} has been unblocked`
            : `${displayName} has been blocked`,
      );
      setAction(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "Customers" }}
        documentTitle={displayName}
        title={
          <>
            <span className="min-w-0 break-words">{displayName}</span>
            <RoleBadge role={user.role} />
            {isBlocked && <BlockedBadge />}
            {isSelf && <Badge>You</Badge>}
          </>
        }
        description={`${user.phone} · Joined ${formatDate(user.createdAt)}`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Orders" value={formatInt(user.orderCount ?? orders.length)} />
            <Stat label="Total spent" value={formatPrice(totalSpent)} />
            <Stat label="Last order" value={lastOrderAt ? formatDate(lastOrderAt) : "—"} className="col-span-2 sm:col-span-1" />
          </section>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Orders</h2>
            <TableCard label="Customer orders">
              {orders.length === 0 ? (
                <TableEmpty title="No orders yet" />
              ) : (
                <Table minWidth={620}>
                  <THead>
                    <Th>Order</Th>
                    <Th>Date</Th>
                    <Th align="right">Items</Th>
                    <Th align="right">Total</Th>
                    <Th>Payment</Th>
                    <Th>Status</Th>
                  </THead>
                  <tbody>
                    {orders.map((o) => {
                      const href = `/admin/orders/${encodeURIComponent(o.orderNumber)}`;
                      return (
                        <LinkRow key={o.id} href={href}>
                          <Td>
                            <Link href={href} className="whitespace-nowrap font-medium text-zinc-900 hover:underline">
                              {o.orderNumber}
                            </Link>
                          </Td>
                          <Td className="whitespace-nowrap text-zinc-500">{formatDate(o.createdAt, true)}</Td>
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
                        </LinkRow>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </TableCard>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Profile">
            <DescriptionList
              items={[
                { label: "Name", value: user.name || "—" },
                { label: "Phone", value: user.phone },
                {
                  label: "Email",
                  value: user.email ? (
                    <span className="break-all">{user.email}</span>
                  ) : (
                    "—"
                  ),
                },
                { label: "Role", value: isAdmin ? "Admin" : "Customer" },
                { label: "Joined", value: formatDate(user.createdAt, true) },
                ...(user.lastLoginAt !== undefined ? [{ label: "Last sign-in", value: formatDate(user.lastLoginAt, true) }] : []),
              ]}
            />
          </Panel>

          <Panel title="Access">
            <div className="space-y-3">
              {isSelf && (
                <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  This is your account. You can&apos;t change your own role or block yourself.
                </p>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">Admin access</p>
                  <p className="text-xs text-zinc-500">
                    {isAdmin ? "Can manage orders, products and customers." : "Regular customer account."}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={isSelf} onClick={() => setAction("role")}>
                  {isAdmin ? "Remove admin" : "Make admin"}
                </Button>
              </div>
              <div className="flex items-start justify-between gap-3 border-t border-zinc-100 pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{isBlocked ? "Blocked" : "Active account"}</p>
                  <p className="text-xs text-zinc-500">
                    {isBlocked ? "Can't sign in or place orders." : "Can sign in and place orders."}
                  </p>
                </div>
                {isBlocked ? (
                  <Button variant="outline" size="sm" disabled={isSelf} onClick={() => setAction("block")}>
                    Unblock
                  </Button>
                ) : (
                  <DangerTextButton size="sm" disabled={isSelf} onClick={() => setAction("block")}>
                    Block
                  </DangerTextButton>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Addresses" description={addresses.length ? `${addresses.length} saved` : undefined}>
            {addresses.length === 0 ? (
              <p className="text-sm text-zinc-500">No saved addresses.</p>
            ) : (
              <ul className="space-y-3">
                {addresses.map((a) => (
                  <li key={a.id} className="rounded-lg border border-zinc-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-900">{a.fullName}</p>
                      {a.isDefault && <Badge>Default</Badge>}
                    </div>
                    <address className="mt-1 text-sm not-italic leading-6 text-zinc-600">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}
                      {a.landmark ? ` (near ${a.landmark})` : ""}
                      <br />
                      {a.city}, {a.state} {a.pincode}, {a.country}
                      <br />
                      {a.phone}
                    </address>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={action === "role"}
        title={isAdmin ? `Remove admin access for ${displayName}?` : `Make ${displayName} an admin?`}
        description={
          isAdmin
            ? "They'll lose access to the admin area immediately."
            : "They'll get full access to orders, products and customers in the admin area."
        }
        confirmLabel={isAdmin ? "Remove admin" : "Make admin"}
        tone={isAdmin ? "danger" : "primary"}
        loading={saving}
        confirmDisabled={isSelf}
        onConfirm={apply}
        onClose={() => setAction(null)}
      />
      <ConfirmDialog
        open={action === "block"}
        title={isBlocked ? `Unblock ${displayName}?` : `Block ${displayName}?`}
        description={
          isBlocked
            ? "They'll be able to sign in and place orders again."
            : "They won't be able to sign in or place orders. Existing orders are not affected."
        }
        confirmLabel={isBlocked ? "Unblock" : "Block customer"}
        tone={isBlocked ? "primary" : "danger"}
        loading={saving}
        confirmDisabled={isSelf}
        onConfirm={apply}
        onClose={() => setAction(null)}
      />
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-4 ${className ?? ""}`}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">{value}</p>
    </div>
  );
}
