import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/shop/section";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your cart" };

export default function CartPage() {
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader title="Your cart" />
      <CartView />
    </Container>
  );
}
