import { Container } from "@/components/shop/section";
import { ButtonLink } from "@/components/ui";

export default function ShopNotFound() {
  return (
    <Container className="py-20 sm:py-28">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">We couldn&apos;t find that page</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          The product may have sold out or been removed, or the link may be incorrect.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/products">Browse products</ButtonLink>
          <ButtonLink href="/" variant="outline">
            Go home
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
