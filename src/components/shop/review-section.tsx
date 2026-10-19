"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";
import type { Review, ReviewEligibility, ReviewList } from "@/lib/types";
import { useAuth, useToast } from "@/components/providers";
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { RatingBreakdown, ReviewCard } from "./reviews";
import { useApi } from "./use-api";
import { loginHref } from "./utils";

type Sort = "newest" | "highest" | "lowest";

/**
 * Reviews block for a product page: rating breakdown, list with sorting and
 * "load more", and the write/edit form for customers who bought the product.
 */
export function ReviewSection({ slug, initial }: { slug: string; initial: ReviewList }) {
  const [sort, setSort] = useState<Sort>("newest");
  const [pages, setPages] = useState<ReviewList[]>([initial]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [changingSort, setChangingSort] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  const eligibility = useApi<ReviewEligibility>(user ? `/products/${encodeURIComponent(slug)}/reviews/eligibility` : null);

  const last = pages[pages.length - 1];
  const items = pages.flatMap((p) => p.items);
  const summary = last.summary;

  async function load(page: number, nextSort: Sort) {
    return api<ReviewList>(`/products/${encodeURIComponent(slug)}/reviews`, { query: { page, pageSize: 6, sort: nextSort } });
  }

  async function changeSort(next: Sort) {
    setSort(next);
    setChangingSort(true);
    try {
      setPages([await load(1, next)]);
    } catch (err) {
      toast.error(err);
    } finally {
      setChangingSort(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await load(last.page + 1, sort);
      setPages((p) => [...p, next]);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingMore(false);
    }
  }

  async function onSaved() {
    eligibility.reload();
    setPages([await load(1, sort)]);
  }

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-20 scroll-mt-24 border-t border-zinc-200 pt-12">
      <h2 id="reviews-title" className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        Customer reviews
      </h2>
      <div className="mt-8 grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-14">
        <div className="space-y-8">
          <RatingBreakdown summary={summary} />
          <WriteReview
            slug={slug}
            signedIn={Boolean(user)}
            eligibility={eligibility.data ?? null}
            loading={Boolean(user) && eligibility.loading && !eligibility.data}
            onSaved={onSaved}
          />
        </div>

        <div>
          {summary.count === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center">
              <p className="text-base font-semibold text-zinc-900">No reviews yet</p>
              <p className="mt-1 text-sm text-zinc-600">Bought this? Be the first to tell others what you thought.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-600">
                  Showing {items.length} of {last.total}
                </p>
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  Sort
                  <Select value={sort} onChange={(e) => changeSort(e.target.value as Sort)} className="h-9 w-40">
                    <option value="newest">Newest</option>
                    <option value="highest">Highest rated</option>
                    <option value="lowest">Lowest rated</option>
                  </Select>
                </label>
              </div>
              <ul className={cn("space-y-4 transition-opacity", changingSort && "opacity-50")} aria-busy={changingSort}>
                {items.map((r) => (
                  <li key={r.id}>
                    <ReviewCard review={r} />
                  </li>
                ))}
              </ul>
              {last.page < last.totalPages && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                    Show more reviews
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function WriteReview({
  slug,
  signedIn,
  eligibility,
  loading,
  onSaved,
}: {
  slug: string;
  signedIn: boolean;
  eligibility: ReviewEligibility | null;
  loading: boolean;
  onSaved: () => Promise<void>;
}) {
  const box = "rounded-2xl border border-zinc-200 bg-white p-5";

  if (!signedIn) {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-zinc-900">Share your thoughts</p>
        <p className="mt-1 text-sm text-zinc-600">Log in to review products you&apos;ve ordered.</p>
        <Link href={loginHref(`/products/${slug}#reviews`)} className="mt-3 inline-block text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
          Log in to write a review
        </Link>
      </div>
    );
  }
  if (loading || !eligibility) {
    return (
      <div className={cn(box, "flex justify-center text-zinc-400")}>
        <Spinner />
      </div>
    );
  }
  if (!eligibility.canReview) {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-zinc-900">Reviews are from verified buyers</p>
        <p className="mt-1 text-sm text-zinc-600">Once you&apos;ve ordered this product, you can share your review here.</p>
      </div>
    );
  }
  return <ReviewForm key={eligibility.review?.id ?? "new"} slug={slug} existing={eligibility.review} onSaved={onSaved} />;
}

function ReviewForm({ slug, existing, onSaved }: { slug: string; existing: Review | null; onSaved: () => Promise<void> }) {
  const uid = useId();
  const toast = useToast();
  const [open, setOpen] = useState(!existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-semibold text-zinc-900">Thanks for your review!</p>
        <p className="mt-1 text-sm text-zinc-600">You rated this {existing?.rating} out of 5.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Edit your review
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return setError("Choose a star rating");
    if (body.trim().length < 10) return setError("Please write at least 10 characters");
    setError(null);
    setSaving(true);
    try {
      await api(`/products/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        body: { rating, title: title.trim() || null, body: body.trim() },
      });
      toast.success(existing ? "Your review was updated" : "Thank you! Your review is live.");
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5" noValidate>
      <p className="text-sm font-semibold text-zinc-900">{existing ? "Edit your review" : "Write a review"}</p>
      <fieldset>
        <legend className="text-sm font-medium text-zinc-800">Your rating</legend>
        <div className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-pressed={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="rounded p-0.5 focus-visible:outline-2 focus-visible:outline-zinc-900"
            >
              <svg viewBox="0 0 24 24" className={cn("size-8", n <= shown ? "text-amber-500" : "text-zinc-300")} fill="currentColor" aria-hidden="true">
                <path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9L12 2.6z" />
              </svg>
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Title (optional)" htmlFor={`${uid}-title`}>
        <Input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Tastes like home" />
      </Field>
      <Field label="Your review" htmlFor={`${uid}-body`} hint="How did it taste? Was it fresh? How was the packing and delivery?">
        <Textarea id={`${uid}-body`} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {existing ? "Update review" : "Submit review"}
        </Button>
        {existing && (
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
