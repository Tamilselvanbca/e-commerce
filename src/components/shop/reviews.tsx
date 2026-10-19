// Review display primitives. No hooks, so usable from Server Components.
import Link from "next/link";
import { countryName, DOMESTIC_COUNTRY } from "@/lib/countries";
import { cn, formatDate } from "@/lib/format";
import type { RatingSummary, Review } from "@/lib/types";
import { ProductImg } from "@/components/ui";
import { CheckIcon } from "./icons";

const STAR = "M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9L12 2.6z";

/** Five stars with fractional fill (e.g. 4.5). */
export function Stars({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span
      className={cn("relative inline-flex shrink-0", className ?? "h-4")}
      role="img"
      aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}
    >
      <span className="flex h-full text-zinc-300" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" className="h-full w-auto" fill="currentColor">
            <path d={STAR} />
          </svg>
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex h-full overflow-hidden text-amber-500" style={{ width: `${pct}%` }} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" className="h-full w-auto shrink-0" fill="currentColor">
            <path d={STAR} />
          </svg>
        ))}
      </span>
    </span>
  );
}

/** "★★★★☆ 4.6 (23)" */
export function RatingBadge({ average, count, className }: { average: number; count: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-zinc-600", className)}>
      <Stars value={average} className="h-4" />
      <span className="font-medium text-zinc-900">{average.toFixed(1)}</span>
      <span>
        ({count} {count === 1 ? "review" : "reviews"})
      </span>
    </span>
  );
}

export function RatingBreakdown({ summary, hrefFor }: { summary: RatingSummary; hrefFor?: (rating: number) => string }) {
  return (
    <div>
      <div className="flex items-end gap-3">
        <p className="text-5xl font-semibold tracking-tight text-zinc-900">{summary.count ? summary.average.toFixed(1) : "–"}</p>
        <div className="pb-1.5">
          <Stars value={summary.average} className="h-5" />
          <p className="mt-1 text-sm text-zinc-600">
            {summary.count} {summary.count === 1 ? "review" : "reviews"}
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {[5, 4, 3, 2, 1].map((r) => {
          const n = summary.distribution[String(r) as keyof RatingSummary["distribution"]] ?? 0;
          const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
          const row = (
            <>
              <span className="w-12 shrink-0 text-zinc-700">{r} star</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
                <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-zinc-500">{pct}%</span>
            </>
          );
          return (
            <li key={r}>
              {hrefFor && n > 0 ? (
                <Link href={hrefFor(r)} className="flex items-center gap-3 rounded text-sm hover:underline" aria-label={`${r} star reviews: ${n}`}>
                  {row}
                </Link>
              ) : (
                <span className="flex items-center gap-3 text-sm">{row}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function place(review: Review): string | null {
  if (!review.authorCountry) return review.authorCity;
  const country = review.authorCountry === DOMESTIC_COUNTRY ? "India" : countryName(review.authorCountry);
  return [review.authorCity, country].filter(Boolean).join(", ");
}

export function ReviewCard({ review, showProduct = false }: { review: Review; showProduct?: boolean }) {
  const where = place(review);
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      {showProduct && review.product && (
        <Link href={`/products/${review.product.slug}`} className="mb-4 flex items-center gap-3 rounded-lg hover:underline">
          <ProductImg src={review.product.imageUrl} alt="" className="size-12 shrink-0 rounded-lg" />
          <span className="text-sm font-medium text-zinc-900">{review.product.name}</span>
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} className="h-4" label={`Rated ${review.rating} out of 5`} />
        {review.title && <h3 className="text-sm font-semibold text-zinc-900">{review.title}</h3>}
      </div>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-700">{review.body}</p>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        <span className="font-medium text-zinc-800">{review.authorName}</span>
        {where && <span>· {where}</span>}
        <span>· {formatDate(review.createdAt)}</span>
        {review.verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <CheckIcon className="size-3" />
            Verified purchase
          </span>
        )}
      </p>
    </article>
  );
}
