import type { Metadata } from "next";
import { Container } from "@/components/shop/section";
import { firstParam } from "@/components/shop/utils";
import { SuccessView } from "./success-view";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

export default async function CheckoutSuccessPage(props: PageProps<"/checkout/success">) {
  const sp = await props.searchParams;
  return (
    <Container className="py-10 sm:py-16">
      <SuccessView orderNumber={firstParam(sp.order) ?? null} sessionId={firstParam(sp.session_id) ?? null} />
    </Container>
  );
}
