import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/shop/section";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader title="Checkout" description="Review your details and pay securely." />
      <CheckoutView />
    </Container>
  );
}
