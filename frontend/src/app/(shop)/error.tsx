"use client";

import { useEffect } from "react";
import { AlertIcon } from "@/components/shop/icons";
import { Container } from "@/components/shop/section";
import { Button, ButtonLink } from "@/components/ui";

export default function ShopError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-20 sm:py-28">
      <div className="mx-auto max-w-lg text-center" role="alert">
        <AlertIcon className="mx-auto size-10 text-zinc-400" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          We couldn&apos;t load this page right now. Please try again in a moment.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/" variant="outline">
            Go home
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
