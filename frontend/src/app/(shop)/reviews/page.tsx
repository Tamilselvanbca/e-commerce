import type { Metadata } from "next";
import Link from "next/link";
import { Kolam } from "@/components/kolam";
import { RatingBreakdown, ReviewCard } from "@/components/shop/reviews";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { ButtonLink, Pagination } from "@/components/ui";
import { cn } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { ReviewList } from "@/lib/types";

export const metadata: Metadata = {
  title: "Customer reviews",
  description: "Read what customers in India and around the world say about our sweets, snacks and gift boxes.",
};

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReviewsPage(props: PageProps<"/reviews">) {
  const sp = await props.searchParams;
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const rating = Number.parseInt(first(sp.rating) ?? "", 10);
  const ratingFilter = rating >= 1 && rating <= 5 ? rating : undefined;
  const sortParam = first(sp.sort);
  const sort = SORTS.some((s) => s.value === sortParam) ? sortParam : "newest";

  let data: ReviewList | null = null;
  try {
    data = await serverApi.reviews({ page, pageSize: 12, rating: ratingFilter, sort });
  } catch (err) {
    console.error("Could not load reviews:", err);
  }

  const href = (patch: { page?: number; rating?: number | null; sort?: string }) => {
    const params = new URLSearchParams();
    const r = patch.rating === undefined ? ratingFilter : patch.rating;
    const s = patch.sort ?? sort;
    if (r) params.set("rating", String(r));
    if (s && s !== "newest") params.set("sort", s);
    if (patch.page && patch.page > 1) params.set("page", String(patch.page));
    const qs = params.toString();
    return qs ? `/reviews?${qs}` : "/reviews";
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
      active ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:border-brand-700",
    );

  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reviews" }]} className="mb-6" />

      <section className="relative isolate overflow-hidden rounded-3xl bg-brand-700 px-6 py-12 text-white sm:px-12 sm:py-16">
        <Kolam
          size={7}
          shape="diamond"
          seed={13}
          mirrorDensity={0.6}
          lineColor="#fff7ed"
          strokeWidth={0.14}
          drawSeconds={6}
          spinSeconds={360}
          className="absolute -right-20 top-1/2 -z-10 size-80 -translate-y-1/2 opacity-40 sm:size-[26rem] sm:opacity-70"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-200">From our customers</p>
        <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Loved in homes across India and around the world.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-white">
          Every review here is from a customer who ordered from us. Read what they say about our sweets, savouries and
          festive boxes.
        </p>
      </section>

      {!data ? (
        <p className="mt-10 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600">
          Reviews couldn&apos;t be loaded right now. Please try again shortly.
        </p>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14">
          <aside className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <RatingBreakdown summary={data.summary} hrefFor={(r) => href({ rating: r, page: 1 })} />
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-semibold text-zinc-900">Ordered from us?</p>
              <p className="mt-1 text-sm text-zinc-600">Open any product you bought and share your review. It helps other families choose.</p>
              <ButtonLink href="/account/orders" variant="outline" size="sm" className="mt-4">
                Your orders
              </ButtonLink>
            </div>
          </aside>

          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <nav aria-label="Filter by rating" className="flex flex-wrap gap-2">
                <Link href={href({ rating: null, page: 1 })} className={chip(!ratingFilter)} aria-current={!ratingFilter ? "page" : undefined}>
                  All
                </Link>
                {[5, 4, 3, 2, 1].map((r) => (
                  <Link key={r} href={href({ rating: r, page: 1 })} className={chip(ratingFilter === r)} aria-current={ratingFilter === r ? "page" : undefined}>
                    {r} ★
                  </Link>
                ))}
              </nav>
              <nav aria-label="Sort reviews" className="flex gap-3 text-sm">
                {SORTS.map((s) => (
                  <Link
                    key={s.value}
                    href={href({ sort: s.value, page: 1 })}
                    className={sort === s.value ? "font-semibold text-brand-800 underline underline-offset-4" : "text-zinc-600 hover:text-zinc-900"}
                    aria-current={sort === s.value ? "true" : undefined}
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>

            {data.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600">
                {ratingFilter ? `No ${ratingFilter}-star reviews yet.` : "No reviews yet. Be the first to share yours!"}
              </p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {data.items.map((r) => (
                  <li key={r.id}>
                    <ReviewCard review={r} showProduct />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-10">
              <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href({ page: p })} />
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
