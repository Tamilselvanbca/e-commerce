import { ProductGridSkeleton } from "@/components/shop/product-card";
import { Container } from "@/components/shop/section";

export default function ProductsLoading() {
  return (
    <Container className="py-6 sm:py-10">
      <div aria-busy="true" aria-label="Loading products">
        <div className="mb-4 h-4 w-40 animate-pulse rounded bg-zinc-100" />
        <div className="mb-8 h-9 w-64 animate-pulse rounded bg-zinc-100" />
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="hidden space-y-3 lg:block">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-zinc-100" />
            ))}
          </div>
          <div>
            <div className="mb-5 h-9 animate-pulse rounded bg-zinc-100" />
            <ProductGridSkeleton count={9} className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:gap-x-6 2xl:grid-cols-4" />
          </div>
        </div>
      </div>
    </Container>
  );
}
