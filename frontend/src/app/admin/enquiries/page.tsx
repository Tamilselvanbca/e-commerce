"use client";

import { Suspense, useId, useState } from "react";
import { api, buildQuery } from "@/lib/api";
import { useToast } from "@/components/providers";
import { Button, PageLoader, Pagination, Spinner, Textarea } from "@/components/ui";
import { cn, formatDate } from "@/lib/format";
import type { BulkEnquiry, BulkEnquiryStatus, Paginated } from "@/lib/types";
import { TableEmpty } from "@/components/admin/data-table";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { IconWhatsApp } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/page-header";
import { ENQUIRY_STATUS_LABELS, EnquiryStatusBadge } from "@/components/admin/status-badges";
import { formatInt } from "@/components/admin/utils";

const PAGE_SIZE = 10;
const STATUSES: BulkEnquiryStatus[] = ["new", "contacted", "converted", "closed"];

export default function AdminEnquiriesPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EnquiriesView />
    </Suspense>
  );
}

function EnquiriesView() {
  const { get, page, update, hrefFor } = useUrlState();
  const status = (STATUSES as string[]).includes(get("status")) ? get("status") : "";
  const path = `/admin/bulk-enquiries${buildQuery({ status, page, pageSize: PAGE_SIZE })}`;
  const { data, error, isLoading, isFetching, reload, setData } = useApiQuery<Paginated<BulkEnquiry>>(path);

  const replaceItem = (next: BulkEnquiry) =>
    setData((prev) => (prev ? { ...prev, items: prev.items.map((e) => (e.id === next.id ? next : e)) } : prev));

  return (
    <>
      <PageHeader
        title="Bulk enquiries"
        description={
          data
            ? `${formatInt(data.total)} ${data.total === 1 ? "enquiry" : "enquiries"}${status ? ` marked ${ENQUIRY_STATUS_LABELS[status as BulkEnquiryStatus].toLowerCase()}` : ""}`
            : "Bulk order requests sent from the store, usually followed up on WhatsApp."
        }
      />

      <Segmented
        label="Enquiry status"
        className="mb-4"
        value={status}
        onChange={(v) => update({ status: v })}
        options={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: ENQUIRY_STATUS_LABELS[s] }))]}
      />

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <LoadError error={error} onRetry={reload} what="enquiries" />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <TableEmpty
            title={status ? "No enquiries with this status" : "No bulk enquiries yet"}
            description={status ? "Try another status." : "Requests from the bulk order form will appear here."}
          />
        </div>
      ) : (
        <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching || undefined}>
          {data.items.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} onUpdated={replaceItem} />
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

function EnquiryCard({ enquiry, onUpdated }: { enquiry: BulkEnquiry; onUpdated: (e: BulkEnquiry) => void }) {
  const toast = useToast();
  const id = useId();
  const [status, setStatus] = useState<BulkEnquiryStatus>(enquiry.status);
  const [statusSaving, setStatusSaving] = useState(false);
  const [notes, setNotes] = useState(enquiry.adminNotes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesDirty = notes.trim() !== (enquiry.adminNotes ?? "").trim();
  const totalQty = enquiry.items.reduce((s, i) => s + (i.quantity || 0), 0);

  const patch = async (body: { status?: BulkEnquiryStatus; adminNotes?: string }) => {
    const res = await api<BulkEnquiry | undefined>(`/admin/bulk-enquiries/${enquiry.id}`, { method: "PATCH", body });
    // Use the server copy when one is returned; otherwise apply the change locally.
    onUpdated(res && typeof res === "object" && "id" in res ? res : { ...enquiry, ...body });
  };

  const changeStatus = async (next: BulkEnquiryStatus) => {
    const prev = status;
    setStatus(next); // optimistic; rolled back on error
    setStatusSaving(true);
    try {
      await patch({ status: next });
      toast.success(`Marked as ${ENQUIRY_STATUS_LABELS[next].toLowerCase()}`);
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
            <span className="break-words">{enquiry.name}</span>
            {enquiry.company && <span className="font-normal text-zinc-500">· {enquiry.company}</span>}
            <EnquiryStatusBadge status={status} />
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">Received {formatDate(enquiry.createdAt, true)}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-status`} className="text-xs font-medium text-zinc-500">
            Status
          </label>
          {/* Compact select; the shared <Select> is h-10/w-full and can't be resized via className. */}
          <select
            id={`${id}-status`}
            value={status}
            onChange={(e) => void changeStatus(e.target.value as BulkEnquiryStatus)}
            disabled={statusSaving}
            className="block h-8 w-36 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ENQUIRY_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {statusSaving && <Spinner className="size-4 text-zinc-400" />}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 px-4 py-4 sm:px-5 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-zinc-500">Phone</dt>
            <dd className="tabular-nums text-zinc-900">{enquiry.phone}</dd>
            <dt className="text-zinc-500">Email</dt>
            <dd className="min-w-0 break-all text-zinc-900">{enquiry.email || "—"}</dd>
          </dl>

          {enquiry.message && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-zinc-500">Message</h3>
              <p className="whitespace-pre-line break-words text-sm text-zinc-800">{enquiry.message}</p>
            </div>
          )}

          <div>
            <h3 className="mb-1 text-xs font-medium text-zinc-500">
              Items{enquiry.items.length > 0 ? ` · ${formatInt(totalQty)} units` : ""}
            </h3>
            {enquiry.items.length === 0 ? (
              <p className="text-sm text-zinc-500">No specific products listed.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiry.items.map((item, i) => (
                    <tr key={`${item.variantId ?? item.productId ?? item.productName}-${i}`} className="border-b border-zinc-100 last:border-0">
                      <td className="py-1.5 pr-3">
                        <span className="text-zinc-900">{item.productName}</span>
                        {item.variantLabel && <span className="text-zinc-500"> · {item.variantLabel}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-900">× {formatInt(item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
              placeholder="Quote sent, follow-up date, delivery terms…"
              maxLength={2000}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              {notesDirty && (
                <Button variant="ghost" size="sm" onClick={() => setNotes(enquiry.adminNotes ?? "")} disabled={notesSaving}>
                  Discard
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={saveNotes} disabled={!notesDirty} loading={notesSaving}>
                Save notes
              </Button>
            </div>
          </div>
          <div className="mt-auto">
            {enquiry.whatsappUrl ? (
              <a
                href={enquiry.whatsappUrl}
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
