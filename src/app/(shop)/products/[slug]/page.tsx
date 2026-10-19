import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductGrid } from "@/components/shop/product-card";
import { ProductPurchase } from "@/components/shop/product-purchase";
import { ReviewSection } from "@/components/shop/review-section";
import { RatingBadge } from "@/components/shop/reviews";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/shop/section";
import { safeDecode } from "@/components/shop/utils";
import { serverApi } from "@/lib/server-api";
import type { Product, ProductImage, ProductSummary, ReviewList } from "@/lib/types";

const getProduct = cache((slug: string) => serverApi.product(slug));

function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function galleryImages(product: Product): ProductImage[] {
  const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  if (images.length === 0 && product.imageUrl) {
    return [{ id: "primary", url: product.imageUrl, alt: product.name, sortOrder: 0 }];
  }
  return images;
}

export async function generateMetadata(props: PageProps<"/products/[slug]">): Promise<Metadata> {
  const slug = safeDecode((await props.params).slug);
  const product = await getProduct(slug).catch(() => null);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: excerpt(product.description) || undefined,
    openGraph: {
      title: product.name,
      description: excerpt(product.description) || undefined,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const slug = safeDecode((await props.params).slug);
  const product = await getProduct(slug);
  if (!product) notFound();

  const [related, reviews] = await Promise.all([
    serverApi.related(slug).catch((): ProductSummary[] => []),
    serverApi.productReviews(slug, { pageSize: 6 }).catch(
      (): ReviewList => ({
        items: [],
        page: 1,
        pageSize: 6,
        total: 0,
        totalPages: 0,
        summary: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
      }),
    ),
  ]);

  const crumbs: Crumb[] = [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/products" },
  ];
  if (product.category) {
    crumbs.push({ label: product.category.name, href: `/products?category=${encodeURIComponent(product.category.slug)}` });
  }
  crumbs.push({ label: product.name });

  const inStock = product.variants.some((v) => v.isActive && v.stock > 0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: excerpt(product.description, 500),
    image: galleryImages(product).map((i) => i.url),
    sku: product.variants[0]?.sku,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: (product.minPrice / 100).toFixed(2),
      highPrice: (product.maxPrice / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.rating
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating.average, reviewCount: product.rating.count } }
      : {}),
  };

  return (
    <Container className="py-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Breadcrumbs items={crumbs} className="mb-6" />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 xl:gap-16">
        <ProductGallery images={galleryImages(product)} name={product.name} />

        <div>
          {product.category && (
            <Link
              href={`/products?category=${encodeURIComponent(product.category.slug)}`}
              className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-900"
            >
              {product.category.name}
            </Link>
          )}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{product.name}</h1>
          {product.rating && (
            <a href="#reviews" className="mt-2 inline-flex rounded hover:underline">
              <RatingBadge average={product.rating.average} count={product.rating.count} />
            </a>
          )}

          <ProductPurchase product={product} />

          {product.description && (
            <section aria-labelledby="details-title" className="mt-10 border-t border-zinc-200 pt-8">
              <h2 id="details-title" className="text-base font-semibold text-zinc-900">
                Product details
              </h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-600">{product.description}</div>
            </section>
          )}
        </div>
      </div>

      <ReviewSection slug={product.slug} initial={reviews} />

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-20 border-t border-zinc-200 pt-12">
          <SectionHeading
            id="related-title"
            title="You may also like"
            href={product.category ? `/products?category=${encodeURIComponent(product.category.slug)}` : "/products"}
            linkLabel="Shop more"
          />
          <ProductGrid products={related.slice(0, 8)} />
        </section>
      )}
    </Container>
  );
}
