"use client";

import { Suspense, useId, useState } from "react";
import Link from "next/link";
import { api, buildQuery } from "@/lib/api";
import { useStoreConfig, useToast } from "@/components/providers";
import { Button, PageLoader, Pagination, Spinner, Textarea } from "@/components/ui";
import { cn, formatDate, formatPrice } from "@/lib/format";
import type { Paginated, Prebooking, PrebookingStatus } from "@/lib/types";
import { TableEmpty } from "@/components/admin/data-table";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { FilterBar, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { IconWhatsApp } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/page-header";
import { PREBOOKING_STATUS_LABELS, PrebookingStatusBadge } from "@/components/admin/status-badges";
import { formatInt } from "@/components/admin/utils";

const PAGE_SIZE = 10;
const STATUSES: PrebookingStatus[] = ["new", "confirmed", "ready", "completed", "cancelled"];

/** "Sat, 1 Nov 2026" for a YYYY-MM-DD date. */
const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

export default function AdminPrebookingsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PrebookingsView />
    </Suspense>
  );
}

function PrebookingsView() {
  const { prebookEnabled } = useStoreConfig();
  const { get, page, update, hrefFor } = useUrlState();
  const q = get("q");
  const status = (STATUSES as string[]).includes(get("status")) ? get("status") : "";
  const path = `/admin/prebookings${buildQuery({ status, q, page, pageSize: PAGE_SIZE })}`;
  const { data, error, isLoading, isFetching, reload, setData } = useApiQuery<Paginated<Prebooking>>(path);

  const replaceItem = (next: Prebooking) =>
    setData((prev) => (prev ? { ...prev, items: prev.items.map((b) => (b.id === next.id ? next : b)) } : prev));

  return (
    <>
      <PageHeader
        title="Pre-bookings"
        description={
          data
            ? `${formatInt(data.total)} ${data.total === 1 ? "pre-booking" : "pre-bookings"}${status ? ` marked ${PREBOOKING_STATUS_LABELS[status as PrebookingStatus].toLowerCase()}` : ""}. Open ones are listed first, soonest date first.`
            : "Bookings from the Pre-book page. Confirm them with the customer and arrange payment."
        }
      />

      {!prebookEnabled && (
        <InlineAlert tone="warning" className="mb-4" title="Pre-booking is switched off">
          Customers can&apos;t see the Pre-book page or send new bookings. Turn it on in{" "}
          <Link href="/admin/settings" className="font-medium underline underline-offset-2">
            Settings → Store details
          </Link>
          .
        </InlineAlert>
      )}

      <Segmented
        label="Pre-booking status"
        className="mb-3"
        value={status}
        onChange={(v) => update({ status: v })}
        options={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: PREBOOKING_STATUS_LABELS[s] }))]}
      />
      <FilterBar>
        <SearchInput
          label="Search pre-bookings"
          placeholder="Search by name, phone or reference"
          defaultValue={q}
          onSearch={(value) => update({ q: value })}
        />
      </FilterBar>

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <LoadError error={error} onRetry={reload} what="pre-bookings" />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <TableEmpty
            title={status || q ? "No pre-bookings match" : "No pre-bookings yet"}
            description={status || q ? "Try another status or search." : "Bookings from the Pre-book page will appear here."}
          />
        </div>
      ) : (
        <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching || undefined}>
          {data.items.map((booking) => (
            <PrebookingCard key={booking.id} booking={booking} onUpdated={replaceItem} />
          ))}
          {data.totalPages > 1 && (
            <div className="pt-2">
              <Pagination page={data.page} totalPages={data.totalPages} hrefFor={hrefFor} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PrebookingCard({ booking, onUpdated }: { booking: Prebooking; onUpdated: (b: Prebooking) => void }) {
  const toast = useToast();
  const id = useId();
  const [status, setStatus] = useState<PrebookingStatus>(booking.status);
  const [statusSaving, setStatusSaving] = useState(false);
  const [notes, setNotes] = useState(booking.adminNotes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesDirty = notes.trim() !== (booking.adminNotes ?? "").trim();

  const patch = async (body: { status?: PrebookingStatus; adminNotes?: string }) => {
    onUpdated(await api<Prebooking>(`/admin/prebookings/${booking.id}`, { method: "PATCH", body }));
  };

  const changeStatus = async (next: PrebookingStatus) => {
    const prev = status;
    setStatus(next); // optimistic; rolled back on error
    setStatusSaving(true);
    try {
      await patch({ status: next });
      toast.success(`Marked as ${PREBOOKING_STATUS_LABELS[next].toLowerCase()}`);
    } catch (err) {
      setStatus(prev);
      toast.error(err);
    } finally {
      setStatusSaving(false);
    }
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await patch({ adminNotes: notes.trim() });
      toast.success("Notes saved");
    } catch (err) {
      toast.error(err);
    } finally {
      setNotesSaving(false);
    }
  };

  return (
    <article
      aria-labelledby={`${id}-name`}
      className={cn("rounded-xl border bg-white", status === "new" ? "border-zinc-300 shadow-sm" : "border-zinc-200")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={`${id}-name`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
            <span className="break-words">{booking.name}</span>
            <span className="font-mono text-xs font-normal text-zinc-500">{booking.reference}</span>
            <PrebookingStatusBadge status={status} />
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">Booked {formatDate(booking.createdAt, true)}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-status`} className="text-xs font-medium text-zinc-500">
            Status
          </label>
          {/* Compact select; the shared <Select> is h-10/w-full and can't be resized via className. */}
          <select
            id={`${id}-status`}
            value={status}
            onChange={(e) => void changeStatus(e.target.value as PrebookingStatus)}
            disabled={statusSaving}
            className="block h-8 w-36 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {PREBOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {statusSaving && <Spinner className="size-4 text-zinc-400" />}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 px-4 py-4 sm:px-5 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <p className="inline-flex rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800">
            For {formatDay(booking.deliveryDate)}
          </p>
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-zinc-500">Phone</dt>
            <dd className="tabular-nums text-zinc-900">{booking.phone}</dd>
            <dt className="text-zinc-500">Email</dt>
            <dd className="min-w-0 break-all text-zinc-900">{booking.email || "—"}</dd>
            <dt className="text-zinc-500">Address</dt>
            <dd className="min-w-0 whitespace-pre-line break-words text-zinc-900">{booking.address || "Pickup / not given"}</dd>
          </dl>

          <div>
            <h3 className="mb-1 text-xs font-medium text-zinc-500">Items</h3>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {booking.items.map((item) => (
                  <tr key={item.variantId} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-3">
                      <span className="text-zinc-900">{item.productName}</span>
                      {item.variantLabel && <span className="text-zinc-500"> · {item.variantLabel}</span>}
                      <span className="tabular-nums text-zinc-500">
                        {" "}
                        · {formatInt(item.quantity)} × {formatPrice(item.unitPrice)}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-zinc-900">{formatPrice(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="pt-2 text-left font-medium text-zinc-900">
                    Estimated total
                  </th>
                  <td className="pt-2 text-right font-semibold tabular-nums text-zinc-900">{formatPrice(booking.estimatedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {booking.notes && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-zinc-500">Customer notes</h3>
              <p className="whitespace-pre-line break-words text-sm text-zinc-800">{booking.notes}</p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <label htmlFor={`${id}-notes`} className="mb-1 block text-xs font-medium text-zinc-500">
              Admin notes
            </label>
            <Textarea
              id={`${id}-notes`}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Advance received, final price, delivery time…"
              maxLength={2000}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              {notesDirty && (
                <Button variant="ghost" size="sm" onClick={() => setNotes(booking.adminNotes ?? "")} disabled={notesSaving}>
                  Discard
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={saveNotes} disabled={!notesDirty} loading={notesSaving}>
                Save notes
              </Button>
            </div>
          </div>
          <div className="mt-auto">
            {booking.whatsappUrl ? (
              <a
                href={booking.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:w-auto"
              >
                <IconWhatsApp className="size-4" />
                Chat on WhatsApp
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p className="text-xs text-zinc-500">WhatsApp link unavailable for this number.</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
