import Link from "next/link";
import { Kolam } from "@/components/kolam";
import { topLevelCategories } from "@/components/shop/catalog";
import { ArrowRightIcon, GiftIcon, LeafIcon, ShieldIcon, TruckIcon, WhatsAppIcon } from "@/components/shop/icons";
import { ProductGrid } from "@/components/shop/product-card";
import { Container, SectionHeading } from "@/components/shop/section";
import { ButtonLink, ProductImg } from "@/components/ui";
import { formatPrice, whatsappUrl } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Category, ProductSummary, StoreConfig } from "@/lib/types";

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error(err);
    return fallback;
  }
}

const TILE_TONES = [
  "bg-brand-100 text-brand-950",
  "bg-amber-100 text-amber-950",
  "bg-brand-700 text-white",
  "bg-yellow-100 text-yellow-950",
  "bg-brand-200 text-brand-950",
  "bg-orange-50 text-orange-950",
];

/** Rangoli colours that stand out on the saffron hero. */
const HERO_RANGOLI = ["#FDE047", "#BE185D", "#15803D", "#FFFFFF", "#0E7490", "#7C2D12", "#6D28D9"];

export default async function HomePage() {
  const [config, categories, featured, newest] = await Promise.all([
    safe<StoreConfig | null>(serverApi.config(), null),
    safe<Category[]>(serverApi.categories(), []),
    safe<ProductSummary[]>(serverApi.products({ featured: true, pageSize: 8 }).then((r) => r.items), []),
    safe<ProductSummary[]>(serverApi.products({ sort: "newest", pageSize: 8 }).then((r) => r.items), []),
  ]);
  const storeName = config?.storeName ?? "our kitchen";
  const tiles = topLevelCategories(categories).slice(0, 6);
  const whatsapp = config?.whatsappNumber ?? null;
  const giftCategory = tiles.find((c) => /gift|hamper|box/i.test(c.slug));
  const sweetsCategory = tiles.find((c) => /sweet|mithai/i.test(c.slug));

  return (
    <>
      {/* Hero */}
      <Container className="pt-4 sm:pt-6">
        <div className="grid gap-4 lg:grid-cols-12">
          <section
            aria-labelledby="hero-title"
            className="relative isolate overflow-hidden rounded-3xl bg-brand-700 bg-[radial-gradient(circle_at_80%_30%,var(--color-brand-500),transparent_60%)] px-6 py-14 text-white sm:px-12 sm:py-20 lg:col-span-8 lg:py-24"
          >
            {/* Kolam drawn in rice-flour white, then filled with rangoli colours. */}
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 -z-10 size-[24rem] opacity-40 sm:-right-16 sm:size-[28rem] sm:opacity-60 lg:-right-28 lg:top-1/2 lg:bottom-auto lg:size-[30rem] lg:-translate-y-1/2 lg:opacity-100">
              <Kolam
                size={9}
                shape="diamond"
                seed={3}
                mirrorDensity={0.5}
                lineColor="#fff7ed"
                strokeWidth={0.15}
                colors={HERO_RANGOLI}
                fillOpacity={0.5}
                drawSeconds={7}
                delay={0.3}
                spinSeconds={300}
                className="size-full"
              />
            </div>
            <div aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-brand-700 from-40% via-brand-700/80 to-transparent lg:w-2/3" />

            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-200">Handmade in small batches</p>
            <h1 id="hero-title" className="mt-5 max-w-lg text-5xl font-semibold leading-[0.98] tracking-tight sm:text-6xl lg:text-[4rem]">
              Sweets & savouries, made the <span className="italic text-yellow-200">traditional</span> way.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-white">

              Ghee-rich mithai, crunchy murukku and festive gift boxes from {storeName}, prepared fresh and packed with
              care for your family.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={sweetsCategory ? `/products?category=${sweetsCategory.slug}` : "/products"}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 text-base font-semibold text-brand-800 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Shop sweets
              </Link>
              <Link
                href={giftCategory ? `/products?category=${giftCategory.slug}` : "/products"}
                className="inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-medium text-white ring-1 ring-inset ring-white/50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Festive gift boxes
              </Link>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
            <Link
              href="/products?sort=popular"
              className="group relative isolate flex min-h-44 flex-col justify-between overflow-hidden rounded-3xl bg-amber-100 p-6 text-amber-950 transition-colors hover:bg-amber-200/70 sm:p-8"
            >
              <Kolam size={5} shape="diamond" seed={4} mirrorDensity={0.5} strokeWidth={0.14} still className="absolute -right-10 -top-10 -z-10 size-44 text-amber-700/25" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Most loved</p>
              <div className="flex items-end justify-between gap-4">
                <p className="text-3xl font-semibold leading-tight tracking-tight">
                  Bestsellers,
                  <br />
                  fresh every day.
                </p>
                <ArrowRightIcon className="size-6 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
            <Link
              href="/bulk-order"
              className="group relative isolate flex min-h-44 flex-col justify-between overflow-hidden rounded-3xl bg-brand-100 p-6 text-brand-950 transition-colors hover:bg-brand-200/70 sm:p-8"
            >
              <Kolam size={5} seed={6} mirrorDensity={0.5} strokeWidth={0.14} still className="absolute -bottom-12 -right-12 -z-10 size-44 text-brand-700/20" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Weddings & festivals</p>
              <div className="flex items-end justify-between gap-4">
                <p className="text-3xl font-semibold leading-tight tracking-tight">
                  Bulk orders,
                  <br />
                  special prices.
                </p>
                <ArrowRightIcon className="size-6 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </div>
        </div>
      </Container>

      {/* Trust strip */}
      <Container className="mt-6">
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 lg:grid-cols-4">
          <TrustItem icon={<LeafIcon />} title="Freshly made" text="Small batches, packed to order" />
          <TrustItem
            icon={<TruckIcon />}
            title={config && config.freeShippingThreshold > 0 ? "Free shipping" : "Pan-India delivery"}
            text={
              config && config.freeShippingThreshold > 0
                ? `On orders over ${formatPrice(config.freeShippingThreshold)}`
                : "Shipped across India"
            }
          />
          <TrustItem icon={<ShieldIcon />} title="Secure payments" text="UPI, cards, net banking & wallets" />
          <TrustItem icon={<GiftIcon />} title="Festive gifting" text="Custom boxes for every occasion" />
        </ul>
      </Container>

      {/* Categories */}
      {tiles.length > 0 && (
        <Container className="mt-16 sm:mt-20">
          <section aria-labelledby="categories-title">
            <SectionHeading id="categories-title" eyebrow="Browse" title="Shop by category" href="/products" linkLabel="All products" />
            <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${tiles.length % 3 === 0 ? "md:grid-cols-3" : "lg:grid-cols-4"}`}>
              {tiles.map((c, i) => (
                <li key={c.id}>
                  <CategoryTile category={c} tone={TILE_TONES[i % TILE_TONES.length]} seed={i + 2} />
                </li>
              ))}
            </ul>
          </section>
        </Container>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <Container className="mt-16 sm:mt-20">
          <section aria-labelledby="featured-title">
            <SectionHeading id="featured-title" eyebrow="Our specialities" title="Festive favourites" href="/products" />
            <ProductGrid products={featured} priorityCount={4} />
          </section>
        </Container>
      )}

      {/* Bulk / WhatsApp CTA */}
      <Container className="mt-16 sm:mt-20">
        <section
          aria-labelledby="bulk-title"
          className="relative isolate overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 px-6 py-12 sm:px-12 sm:py-16"
        >
          <Kolam
            size={7}
            shape="diamond"
            seed={9}
            mirrorDensity={0.45}
            strokeWidth={0.13}
            drawSeconds={8}
            className="absolute -right-16 top-1/2 -z-10 hidden size-96 -translate-y-1/2 text-amber-700/25 md:block"
          />
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Weddings · Festivals · Corporate gifting</p>
              <h2 id="bulk-title" className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Planning a celebration?
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-zinc-600">
                Return gifts, Diwali and Pongal hampers or sweets for the whole office. Get bulk pricing and custom boxes,
                prepared fresh for your date. Message us on WhatsApp or send an enquiry for a quote.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              {whatsapp && (
                <a
                  href={whatsappUrl(whatsapp, `Hi ${storeName}, I'd like to place a bulk order.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-6 text-base font-medium text-white transition-colors hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  <WhatsAppIcon />
                  Chat on WhatsApp
                </a>
              )}
              <ButtonLink href="/bulk-order" size="lg" variant={whatsapp ? "outline" : "primary"}>
                Request a bulk quote
              </ButtonLink>
            </div>
          </div>
        </section>
      </Container>

      {/* New arrivals */}
      {newest.length > 0 && (
        <Container className="mt-16 sm:mt-20">
          <section aria-labelledby="new-title">
            <SectionHeading id="new-title" eyebrow="Fresh from the kitchen" title="New arrivals" href="/products?sort=newest" />
            <ProductGrid products={newest} />
          </section>
        </Container>
      )}

      {featured.length === 0 && newest.length === 0 && (
        <Container className="mt-16">
          <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center">
            <p className="text-base font-semibold text-zinc-900">Our menu is on its way</p>
            <p className="mt-1 text-sm text-zinc-600">New sweets and snacks are being added. Please check back shortly.</p>
          </div>
        </Container>
      )}

      <div className="h-16 sm:h-24" />
    </>
  );
}

function TrustItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3 bg-white p-4 sm:p-5">
      <span className="mt-0.5 text-brand-700">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500 sm:text-sm">{text}</p>
      </div>
    </li>
  );
}

function CategoryTile({ category, tone, seed }: { category: Category; tone: string; seed: number }) {
  const href = `/products?category=${encodeURIComponent(category.slug)}`;
  if (category.imageUrl) {
    return (
      <Link href={href} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-zinc-100 sm:aspect-[4/3]">
        <ProductImg
          src={category.imageUrl}
          alt=""
          className="size-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-zinc-950/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 text-white sm:p-6">
          <div>
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">{category.name}</p>
            <p className="text-xs text-white/80 sm:text-sm">{category.productCount} products</p>
          </div>
          <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-1" />
        </div>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`group relative isolate flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-2xl p-4 transition-opacity hover:opacity-90 sm:aspect-[4/3] sm:p-6 ${tone}`}
    >
      <Kolam
        size={5}
        shape="diamond"
        seed={seed}
        mirrorDensity={0.5}
        strokeWidth={0.14}
        still
        className="absolute -right-8 -top-8 -z-10 size-36 opacity-20 transition-transform duration-700 group-hover:rotate-45 sm:size-44"
      />
      <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">{category.productCount} products</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl xl:text-4xl">{category.name}</p>
        <ArrowRightIcon className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
