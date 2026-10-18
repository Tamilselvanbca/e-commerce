import type { Metadata } from "next";
import { XCircleIcon } from "@/components/shop/icons";
import { Container } from "@/components/shop/section";
import { firstParam } from "@/components/shop/utils";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Payment cancelled", robots: { index: false } };

export default async function CheckoutCancelledPage(props: PageProps<"/checkout/cancelled">) {
  const orderNumber = firstParam((await props.searchParams).order);
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-lg text-center">
        <XCircleIcon className="mx-auto size-12 text-zinc-400" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Payment cancelled</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          No money was taken. {orderNumber ? "Your order is saved, so you" : "You"} can retry the payment whenever you&apos;re
          ready{orderNumber ? ", before the order expires" : ""}.
        </p>
        {orderNumber && (
          <p className="mt-3 text-sm text-zinc-600">
            Order <span className="font-mono font-medium text-zinc-900">{orderNumber}</span>
          </p>
        )}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {orderNumber ? (
            <ButtonLink href={`/account/orders/${encodeURIComponent(orderNumber)}`}>Retry payment</ButtonLink>
          ) : (
            <ButtonLink href="/account/orders">View my orders</ButtonLink>
          )}
          <ButtonLink href="/cart" variant="outline">
            Back to cart
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
