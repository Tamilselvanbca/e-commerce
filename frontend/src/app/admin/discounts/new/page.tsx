"use client";

import { DiscountForm } from "@/components/admin/discount-form";
import { PageHeader } from "@/components/admin/page-header";

export default function NewDiscountPage() {
  return (
    <>
      <PageHeader title="New discount" back={{ href: "/admin/discounts", label: "Discounts" }} />
      <DiscountForm />
    </>
  );
}
