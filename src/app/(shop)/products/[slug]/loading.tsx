import { Container } from "@/components/shop/section";

export default function ProductLoading() {
  return (
    <Container className="py-6 sm:py-10">
      <div className="animate-pulse" aria-busy="true" aria-label="Loading product">
        <div className="mb-6 h-4 w-56 rounded bg-zinc-100" />
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="aspect-[4/5] rounded-2xl bg-zinc-100" />
          <div className="space-y-4">
            <div className="h-3 w-24 rounded bg-zinc-100" />
            <div className="h-9 w-3/4 rounded bg-zinc-100" />
            <div className="h-7 w-32 rounded bg-zinc-100" />
            <div className="flex gap-3 pt-6">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="size-10 rounded-full bg-zinc-100" />
              ))}
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-11 w-12 rounded-lg bg-zinc-100" />
              ))}
            </div>
            <div className="grid gap-3 pt-4 sm:grid-cols-2">
              <div className="h-12 rounded-lg bg-zinc-100" />
              <div className="h-12 rounded-lg bg-zinc-100" />
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
