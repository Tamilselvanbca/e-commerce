// About us. NOTE FOR THE STORE OWNER: the story below is placeholder copy.
// Replace it with your own history, people and photos.
import type { Metadata } from "next";
import { Kolam } from "@/components/kolam";
import { GiftIcon, LeafIcon, ShieldIcon, TruckIcon } from "@/components/shop/icons";
import { RatingBadge, ReviewCard } from "@/components/shop/reviews";
import { Breadcrumbs, Container, SectionHeading } from "@/components/shop/section";
import { ButtonLink } from "@/components/ui";
import { serverApi } from "@/lib/server-api";
import type { ReviewList, StoreConfig } from "@/lib/types";

export const metadata: Metadata = {
  title: "About us",
  description: "Our story: traditional sweets and savouries made by hand in small batches, delivered to families in India and around the world.",
};

const VALUES = [
  {
    icon: LeafIcon,
    title: "Traditional recipes",
    text: "Recipes passed down through generations, made the slow way: hand-rolled laddus, hand-twisted murukku, ghee-roasted Mysore pak.",
  },
  {
    icon: ShieldIcon,
    title: "Honest ingredients",
    text: "Pure ghee, cold-pressed oils, real cashews and saffron, organic jaggery. No artificial colours and no shortcuts.",
  },
  {
    icon: GiftIcon,
    title: "Made fresh, packed with care",
    text: "We cook in small batches close to dispatch and pack in sealed, food-grade boxes that keep every bite fresh.",
  },
  {
    icon: TruckIcon,
    title: "India and worldwide",
    text: "From Chennai to Chicago, we ship shelf-stable sweets and snacks to Indian families wherever they call home.",
  },
];

const STEPS = [
  ["Sourcing", "Ghee, flour, nuts and spices from trusted farms and mills we have worked with for years."],
  ["Preparing", "Every batch is cooked by our kitchen team in a clean, hygienic kitchen, following the original recipe."],
  ["Packing", "Cooled, checked and sealed the same day in festive, gift-ready packaging."],
  ["Delivering", "Shipped with tracking across India and to over 30 countries, with updates at every step."],
];

export default async function AboutPage() {
  const [config, reviews] = await Promise.all([
    serverApi.config().catch((): StoreConfig | null => null),
    serverApi.reviews({ pageSize: 3, rating: 5 }).catch((): ReviewList | null => null),
  ]);
  const storeName = config?.storeName ?? "our kitchen";

  return (
    <>
      <Container className="py-6 sm:py-10">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About us" }]} className="mb-6" />

        <section className="relative isolate overflow-hidden rounded-3xl bg-brand-700 px-6 py-14 text-white sm:px-12 sm:py-20">
          <Kolam
            size={9}
            shape="diamond"
            seed={3}
            mirrorDensity={0.5}
            lineColor="#fff7ed"
            strokeWidth={0.14}
            colors={["#FDE047", "#BE185D", "#15803D", "#FFFFFF", "#0E7490"]}
            fillOpacity={0.4}
            drawSeconds={8}
            spinSeconds={360}
            className="absolute -bottom-32 -right-32 -z-10 size-[26rem] opacity-50 sm:size-[32rem] lg:-right-16 lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2 lg:opacity-90"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-200">Our story</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Sweet memories, made by hand.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white sm:text-lg sm:leading-8">
            {storeName} began in a family kitchen, making festival sweets for neighbours and friends. Today we cook the same
            recipes, the same way, for families across India and Indians living abroad who miss the taste of home.
          </p>
          {reviews && reviews.summary.count > 0 && (
            <div className="mt-8 inline-flex rounded-full bg-white px-4 py-2">
              <RatingBadge average={reviews.summary.average} count={reviews.summary.count} />
            </div>
          )}
        </section>

        {/* Story */}
        <section className="mt-16 grid gap-10 sm:mt-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">How it started</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Like a kolam at the doorstep, everything starts with care.
            </h2>
          </div>
          <div className="space-y-4 text-base leading-7 text-zinc-700">
            <p>
              Every morning, homes across South India welcome the day with a kolam drawn in rice flour at the doorstep: a
              simple act of patience and care. That is how we think about our sweets.
            </p>
            <p>
              Our laddus are still rolled by hand, our murukku still twisted one by one, and our Mysore pak still stirred
              in ghee until it turns golden and porous. We make small batches so that what reaches you tastes as fresh
              as it did in our kitchen.
            </p>
            <p>
              Whether it is a box for Deepavali, return gifts for a wedding, or a taste of home for someone far away, we
              are honoured to be part of your celebrations.
            </p>
          </div>
        </section>

        {/* Values */}
        <section aria-labelledby="values-title" className="mt-16 sm:mt-20">
          <SectionHeading id="values-title" eyebrow="What we believe" title="Made the way it should be" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-brand-200 bg-white p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <Icon />
                </span>
                <p className="mt-4 text-base font-semibold text-zinc-900">{title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Process */}
        <section aria-labelledby="process-title" className="mt-16 rounded-3xl bg-brand-50 px-6 py-12 sm:mt-20 sm:px-12">
          <SectionHeading id="process-title" eyebrow="From our kitchen to your home" title="How we make it" />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
                <p className="mt-4 text-base font-semibold text-zinc-900">{title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Reviews */}
        {reviews && reviews.items.length > 0 && (
          <section aria-labelledby="about-reviews-title" className="mt-16 sm:mt-20">
            <SectionHeading id="about-reviews-title" eyebrow="In their words" title="What our customers say" href="/reviews" linkLabel="All reviews" />
            <ul className="grid gap-4 md:grid-cols-3">
              {reviews.items.map((r) => (
                <li key={r.id}>
                  <ReviewCard review={r} showProduct />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <section className="mt-16 flex flex-col items-start justify-between gap-6 rounded-3xl border border-brand-200 bg-white px-6 py-10 sm:mt-20 sm:flex-row sm:items-center sm:px-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Taste the tradition</h2>
            <p className="mt-2 text-sm text-zinc-600">Fresh sweets and savouries, delivered across India and worldwide.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/products" size="lg">
              Shop now
            </ButtonLink>
            <ButtonLink href="/contact" size="lg" variant="outline">
              Contact us
            </ButtonLink>
          </div>
        </section>
      </Container>
      <div className="h-16 sm:h-24" />
    </>
  );
}
