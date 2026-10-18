"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { AdminDiscount } from "@/lib/types";
import { useToast } from "@/components/providers";
import { Badge, PageLoader } from "@/components/ui";
import { ConfirmDialog, DangerTextButton } from "@/components/admin/confirm-dialog";
import { DiscountForm } from "@/components/admin/discount-form";
import { DISCOUNT_STATE, discountState } from "@/components/admin/discount-utils";
import { LoadError } from "@/components/admin/feedback";
import { useApiQuery } from "@/components/admin/hooks";
import { PageHeader } from "@/components/admin/page-header";
import { formatInt, plural } from "@/components/admin/utils";

export default function EditDiscountPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, reload } = useApiQuery<AdminDiscount>(`/admin/discounts/${id}`);
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!data) return <LoadError error={error} onRetry={reload} backHref="/admin/discounts" backLabel="Back to discounts" what="this discount" />;

  const state = DISCOUNT_STATE[discountState(data)];

  async function remove() {
    setDeleting(true);
    try {
      await api(`/admin/discounts/${id}`, { method: "DELETE" });
      toast.success("Discount deleted");
      router.push("/admin/discounts");
    } catch (err) {
      toast.error(err);
      setDeleting(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <PageHeader
        title={data.code ? <span className="font-mono">{data.code}</span> : data.title}
        documentTitle={data.code ?? data.title}
        back={{ href: "/admin/discounts", label: "Discounts" }}
        meta={
          <>
            <Badge className={state.className}>{state.label}</Badge>
            <span className="text-sm text-zinc-600">
              Used on {formatInt(data.timesUsed)} {plural(data.timesUsed, "order")}
              {data.totalSaved ? ` · customers saved ${formatPrice(data.totalSaved)}` : ""}
            </span>
          </>
        }
        actions={data.timesUsed === 0 ? <DangerTextButton onClick={() => setConfirm(true)}>Delete</DangerTextButton> : undefined}
      />
      <DiscountForm key={data.updatedAt} discount={data} />
      <ConfirmDialog
        open={confirm}
        title="Delete this discount?"
        description="It hasn't been used on any order. This can't be undone."
        confirmLabel="Delete discount"
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
