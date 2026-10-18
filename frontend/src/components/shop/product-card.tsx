// Product tile + grid. No hooks, so usable from Server Components.
import Link from "next/link";
import { discountPercent } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { Price, ProductImg } from "@/components/ui";
import { Stars } from "./reviews";

export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const off = discountPercent(product.minPrice, product.compareAtPrice);
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-zinc-100">
        <ProductImg
          src={product.imageUrl}
          alt={product.name}
          loading={priority ? "eager" : "lazy"}
          className="size-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {!product.inStock ? (
            <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 shadow-sm">
              Sold out
            </span>
          ) : off ? (
            <span className="rounded-full bg-brand-700 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
              {off}% off
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 space-y-1 px-0.5">
        {product.category && (
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{product.category.name}</p>
        )}
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 group-hover:underline group-hover:underline-offset-4">
          {product.name}
        </h3>
        {product.rating && (
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            <Stars value={product.rating.average} className="h-3.5" />
            <span className="font-medium text-zinc-700">{product.rating.average.toFixed(1)}</span>
            <span>({product.rating.count})</span>
          </p>
        )}
        <Price
          price={product.minPrice}
          maxPrice={product.maxPrice}
          compareAtPrice={product.compareAtPrice}
          size="sm"
          className={product.inStock ? "" : "opacity-60"}
        />
      </div>
    </Link>
  );
}

export function ProductGrid({
  products,
  className,
  priorityCount = 0,
}: {
  products: ProductSummary[];
  className?: string;
  priorityCount?: number;
}) {
  return (
    <ul className={className ?? "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6"}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6"} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[3/4] rounded-xl bg-zinc-100" />
          <div className="mt-3 h-3 w-1/3 rounded bg-zinc-100" />
          <div className="mt-2 h-4 w-3/4 rounded bg-zinc-100" />
          <div className="mt-2 h-4 w-1/4 rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}
