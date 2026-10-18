"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { api, buildQuery } from "@/lib/api";
import { countryName } from "@/lib/countries";
import { cn, formatDate } from "@/lib/format";
import type { ReviewList, Review } from "@/lib/types";
import { useToast } from "@/components/providers";
import { Badge, Button, PageLoader, Pagination, ProductImg } from "@/components/ui";
import { Stars } from "@/components/shop/reviews";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { TableEmpty } from "@/components/admin/data-table";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { FilterBar, SearchInput, Segmented } from "@/components/admin/filters";
import { useApiQuery, useUrlState } from "@/components/admin/hooks";
import { PageHeader } from "@/components/admin/page-header";
import { formatInt } from "@/components/admin/utils";

const PAGE_SIZE = 20;

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ReviewsView />
    </Suspense>
  );
}

function ReviewsView() {
  const { get, page, update, hrefFor } = useUrlState();
  const status = ["published", "hidden"].includes(get("status")) ? get("status") : "";
  const rating = ["1", "2", "3", "4", "5"].includes(get("rating")) ? get("rating") : "";
  const q = get("q");
  const path = `/admin/reviews${buildQuery({ status, rating, q, page, pageSize: PAGE_SIZE })}`;
  const { data, error, isLoading, isFetching, reload } = useApiQuery<ReviewList>(path);

  return (
    <>
      <PageHeader
        title="Reviews"
        description={
          data
            ? `${formatInt(data.summary.count)} published · average ${data.summary.count ? data.summary.average.toFixed(1) : "–"} / 5`
            : "Customer reviews from verified orders. Hide anything inappropriate."
        }
      />

      <FilterBar className="mb-4">
        <Segmented
          label="Review status"
          value={status}
          onChange={(v) => update({ status: v })}
          options={[
            { value: "", label: "All" },
            { value: "published", label: "Published" },
            { value: "hidden", label: "Hidden" },
          ]}
        />
        <Segmented
          label="Rating"
          value={rating}
          onChange={(v) => update({ rating: v })}
          options={[{ value: "", label: "Any rating" }, ...["5", "4", "3", "2", "1"].map((r) => ({ value: r, label: `${r} ★` }))]}
        />
        <SearchInput defaultValue={q} onSearch={(v) => update({ q: v })} placeholder="Search text, customer or product" label="Search reviews" />
      </FilterBar>

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {isLoading ? (
        <PageLoader />
      ) : !data ? (
        <LoadError error={error} onRetry={reload} what="reviews" />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <TableEmpty title="No reviews found" description={status || rating || q ? "Try other filters." : "Customer reviews will appear here."} />
        </div>
      ) : (
        <div className={cn("space-y-3 transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching || undefined}>
          {data.items.map((review) => (
            <ReviewRow key={review.id} review={review} onChanged={reload} />
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

function ReviewRow({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"status" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hidden = review.status === "hidden";

  async function toggle() {
    setBusy("status");
    try {
      await api(`/admin/reviews/${review.id}`, { method: "PATCH", body: { status: hidden ? "published" : "hidden" } });
      toast.success(hidden ? "Review published" : "Review hidden from the store");
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(`/admin/reviews/${review.id}`, { method: "DELETE" });
      toast.success("Review deleted");
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={cn("rounded-xl border bg-white p-4 sm:p-5", hidden ? "border-dashed border-zinc-300" : "border-zinc-200")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {review.product && (
          <Link href={`/products/${review.product.slug}`} target="_blank" className="flex shrink-0 items-center gap-3 sm:w-56">
            <ProductImg src={review.product.imageUrl} alt="" className="size-12 rounded-lg" />
            <span className="text-sm font-medium text-zinc-900 hover:underline">{review.product.name}</span>
          </Link>
        )}
        <div className={cn("min-w-0 flex-1", hidden && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={review.rating} className="h-4" label={`Rated ${review.rating} out of 5`} />
            {review.title && <p className="text-sm font-semibold text-zinc-900">{review.title}</p>}
            {hidden && <Badge>Hidden</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">{review.body}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {review.authorName}
            {review.authorCity || review.authorCountry
              ? ` · ${[review.authorCity, review.authorCountry ? countryName(review.authorCountry) : null].filter(Boolean).join(", ")}`
              : ""}
            {" · "}
            {formatDate(review.createdAt, true)}
            {review.verified ? " · Verified purchase" : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={toggle} loading={busy === "status"} disabled={busy !== null}>
            {hidden ? "Publish" : "Hide"}
          </Button>
          <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            Delete
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this review?"
        description="This permanently removes the review. To keep it but take it off the store, use Hide instead."
        confirmLabel="Delete review"
        loading={busy === "delete"}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
  );
}
