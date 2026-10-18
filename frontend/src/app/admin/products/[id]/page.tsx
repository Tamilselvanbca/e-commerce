"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/ui";
import type { Product } from "@/lib/types";
import { LoadError } from "@/components/admin/feedback";
import { useApiQuery } from "@/components/admin/hooks";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";

export default function AdminEditProductPage() {
  const { id } = useParams<{ id: string }>();
  const path = `/admin/products/${encodeURIComponent(id)}`;
  const { data: product, error, isLoading, reload, setData } = useApiQuery<Product>(path, { keepPrevious: false });
  // Bumped after every save/archive so the form remounts with server state
  // (new variant/image ids, normalised values).
  const [revision, setRevision] = useState(0);

  const replace = (next: Product) => {
    setData(() => next);
    setRevision((r) => r + 1);
  };

  if (isLoading) return <PageLoader />;
  if (!product) {
    return (
      <>
        <PageHeader title="Edit product" back={{ href: "/admin/products", label: "Products" }} />
        <LoadError error={error} onRetry={reload} what="this product" backHref="/admin/products" backLabel="Back to products" />
      </>
    );
  }

  return (
    <ProductForm
      key={`${product.id}:${revision}`}
      product={product}
      onSaved={replace}
      onArchived={() => {
        api<Product>(path).then(replace, () => reload());
      }}
    />
  );
}
