"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/providers";
import { Button, ButtonLink, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { formatPrice, paiseToRupees, rupeesToPaise } from "@/lib/format";
import type { Category, Product, ProductInput, ProductStatus } from "@/lib/types";
import { categoryOptions } from "./category-tree";
import { ConfirmDialog } from "./confirm-dialog";
import { InlineAlert } from "./feedback";
import { useApiQuery, useUnsavedChangesWarning } from "./hooks";
import { IconExternal } from "./icons";
import { ImageUploader, type ImageDraft } from "./image-uploader";
import { PageHeader, Panel } from "./page-header";
import { PRODUCT_STATUS_LABELS, ProductStatusBadge } from "./status-badges";
import { effectiveSku, emptyVariant, VariantEditor, type VariantDraft } from "./variant-editor";
import { formatInt, slugify, validationErrors, withoutError, type FieldErrors } from "./utils";

const STATUSES: ProductStatus[] = ["active", "draft", "archived"];
const STATUS_HINT: Record<ProductStatus, string> = {
  active: "Visible in the store.",
  draft: "Hidden from the store while you work on it.",
  archived: "Hidden and kept for past orders.",
};

function variantsFrom(product?: Product): VariantDraft[] {
  if (!product || product.variants.length === 0) return [emptyVariant("new-0")];
  return product.variants.map((v) => ({
    uid: v.id,
    id: v.id,
    sku: v.sku,
    skuTouched: true,
    size: v.size ?? "",
    color: v.color ?? "",
    colorHex: v.colorHex,
    price: paiseToRupees(v.price),
    compareAt: paiseToRupees(v.compareAtPrice),
    stock: String(v.stock),
    isActive: v.isActive,
  }));
}

function imagesFrom(product?: Product): ImageDraft[] {
  if (!product) return [];
  return [...product.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => ({ uid: img.id, id: img.id, url: img.url, key: img.key ?? null, alt: img.alt ?? "" }));
}

/**
 * Create/edit form for a product. For edits, remount with a new `key` after a
 * save (the parent does this) so new variant ids from the server are picked up.
 */
export function ProductForm({
  product,
  onSaved,
  onArchived,
}: {
  product?: Product;
  onSaved?: (product: Product) => void;
  onArchived?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(product);
  const categories = useApiQuery<{ items: Category[] }>("/admin/categories");

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(product?.description ?? "");
  const [ingredients, setIngredients] = useState(product?.ingredients ?? "");
  const [showIngredients, setShowIngredients] = useState(product?.showIngredients ?? true);
  const [categoryId, setCategoryId] = useState(product?.category?.id ?? "");
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "draft");
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [variants, setVariantsRaw] = useState<VariantDraft[]>(() => variantsFrom(product));
  const [images, setImagesRaw] = useState<ImageDraft[]>(() => imagesFrom(product));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useUnsavedChangesWarning(dirty && !saving);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>> = (action) => {
    setVariantsRaw(action);
    setDirty(true);
  };
  const setImages: React.Dispatch<React.SetStateAction<ImageDraft[]>> = (action) => {
    setImagesRaw(action);
    setDirty(true);
  };
  const clearError = (path: string, prefix = false) => setErrors((e) => withoutError(e, path, prefix));
  const touched = (path: string) => {
    setDirty(true);
    clearError(path);
  };

  /** Validates locally and builds the request body. */
  const build = (): { input: ProductInput | null; errors: FieldErrors } => {
    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = "Enter a product name";
    if (slugTouched && slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      errs.slug = "Use lowercase letters, numbers and hyphens";
    if (variants.length === 0) errs.variants = "Add at least one variant";

    const skus = new Map<string, number>();
    const rows = variants.map((v, i) => {
      const sku = effectiveSku(v, effectiveSlug);
      const price = rupeesToPaise(v.price);
      const compare = v.compareAt.trim() ? rupeesToPaise(v.compareAt) : null;
      const stock = Number(v.stock);
      if (!sku) errs[`variants.${i}.sku`] = "Enter a SKU";
      else if (skus.has(sku.toLowerCase())) errs[`variants.${i}.sku`] = `Same SKU as variant ${(skus.get(sku.toLowerCase()) ?? 0) + 1}`;
      else skus.set(sku.toLowerCase(), i);
      if (!v.price.trim() || !Number.isFinite(price) || price <= 0) errs[`variants.${i}.price`] = "Enter a price above ₹0";
      if (compare !== null && (!Number.isFinite(compare) || compare < 0))
        errs[`variants.${i}.compareAtPrice`] = "Enter a valid amount or leave empty";
      if (v.stock.trim() === "" || !Number.isInteger(stock) || stock < 0)
        errs[`variants.${i}.stock`] = "Enter a whole number, 0 or more";
      return {
        ...(v.id ? { id: v.id } : {}),
        sku,
        size: v.size.trim() || null,
        color: v.color.trim() || null,
        colorHex: v.colorHex,
        price,
        compareAtPrice: compare,
        stock,
        isActive: v.isActive,
      };
    });

    if (Object.keys(errs).length) return { input: null, errors: errs };
    return {
      errors: errs,
      input: {
        name: name.trim(),
        ...(effectiveSlug ? { slug: effectiveSlug } : {}),
        description,
        ingredients: ingredients.trim() || null,
        showIngredients,
        categoryId: categoryId || null,
        status,
        isFeatured,
        variants: rows,
        images: images.map((img) => ({
          ...(img.id ? { id: img.id } : {}),
          url: img.url,
          key: img.key ?? null,
          alt: img.alt.trim() || null,
        })),
      },
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { input, errors: localErrors } = build();
    setErrors(localErrors);
    setFormError(input ? null : "Fix the highlighted fields and try again.");
    if (!input) return;

    setSaving(true);
    try {
      const saved = await api<Product>(isEdit ? `/admin/products/${product!.id}` : "/admin/products", {
        method: isEdit ? "PUT" : "POST",
        body: input,
      });
      setDirty(false);
      if (isEdit) {
        toast.success("Product saved");
        onSaved?.(saved);
      } else {
        toast.success("Product created");
        router.replace(`/admin/products/${saved.id}`);
      }
    } catch (err) {
      const fields = validationErrors(err);
      if (fields) {
        setErrors(fields);
        setFormError(Object.values(fields)[0] ?? "Some fields need attention.");
      } else {
        setFormError(null);
      }
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!product) return;
    setArchiving(true);
    try {
      await api(`/admin/products/${product.id}`, { method: "DELETE" });
      toast.success("Product archived");
      setConfirmArchive(false);
      setDirty(false);
      onArchived?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setArchiving(false);
    }
  };

  const totalStock = variants.reduce((s, v) => s + (Number(v.stock) > 0 ? Number(v.stock) : 0), 0);
  const prices = variants.map((v) => rupeesToPaise(v.price)).filter((p) => Number.isFinite(p) && p > 0);
  const knownFieldKeys = new Set(["name", "slug", "description", "ingredients", "categoryId", "status", "isFeatured", "variants"]);
  const otherErrors = Object.entries(errors).filter(
    ([k]) => !knownFieldKeys.has(k) && !k.startsWith("variants.") && !k.startsWith("images."),
  );

  const saveButton = (
    <Button type="submit" form="product-form" loading={saving}>
      {isEdit ? "Save changes" : "Create product"}
    </Button>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        documentTitle={isEdit ? product!.name : "New product"}
        title={
          isEdit ? (
            <>
              <span className="min-w-0 break-words">{product!.name}</span>
              <ProductStatusBadge status={product!.status} />
            </>
          ) : (
            "New product"
          )
        }
        description={isEdit ? `/${product!.slug}` : "Add details, variants and images. Save as draft until it's ready."}
        actions={
          <>
            {isEdit && product!.status === "active" && (
              <ButtonLink href={`/products/${product!.slug}`} variant="ghost" target="_blank" rel="noopener">
                View in store <IconExternal className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </ButtonLink>
            )}
            {isEdit && product!.status !== "archived" && (
              <Button variant="outline" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            )}
            {saveButton}
          </>
        }
      />

      <form id="product-form" onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <InlineAlert title="Couldn't save the product">
            <p>{formError}</p>
            {otherErrors.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {otherErrors.map(([k, m]) => (
                  <li key={k}>
                    {k || "Request"}: {m}
                  </li>
                ))}
              </ul>
            )}
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <Panel title="Details">
              <div className="space-y-4">
                <Field label="Name" htmlFor="p-name" error={errors.name}>
                  <Input
                    id="p-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      touched("name");
                      if (!slugTouched) clearError("slug");
                    }}
                    aria-invalid={Boolean(errors.name) || undefined}
                    maxLength={200}
                    required
                  />
                </Field>
                <Field
                  label="URL slug"
                  htmlFor="p-slug"
                  error={errors.slug}
                  hint={slugTouched ? "Clear the field to generate it from the name again." : "Generated from the name."}
                >
                  <div className="flex items-center rounded-lg focus-within:ring-0">
                    <span className="flex h-10 items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-500">
                      /products/
                    </span>
                    <Input
                      id="p-slug"
                      value={effectiveSlug}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase().replace(/\s+/g, "-");
                        setSlug(v);
                        setSlugTouched(v !== "");
                        touched("slug");
                      }}
                      aria-invalid={Boolean(errors.slug) || undefined}
                      className="rounded-l-none font-mono text-xs"
                      maxLength={120}
                    />
                  </div>
                </Field>
                <Field label="Description" htmlFor="p-desc" error={errors.description}>
                  <Textarea
                    id="p-desc"
                    rows={6}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      touched("description");
                    }}
                    aria-invalid={Boolean(errors.description) || undefined}
                  />
                </Field>
                <Field
                  label="Ingredients"
                  htmlFor="p-ingredients"
                  error={errors.ingredients}
                  hint="Shown under the description on the product page, e.g. gram flour, pure ghee, sugar, cardamom."
                >
                  <Textarea
                    id="p-ingredients"
                    rows={3}
                    value={ingredients}
                    onChange={(e) => {
                      setIngredients(e.target.value);
                      touched("ingredients");
                    }}
                    maxLength={5000}
                    aria-invalid={Boolean(errors.ingredients) || undefined}
                  />
                </Field>
                <Checkbox
                  label="Show ingredients on the product page"
                  checked={showIngredients}
                  onChange={(e) => {
                    setShowIngredients(e.target.checked);
                    touched("showIngredients");
                  }}
                />
              </div>
            </Panel>

            <Panel title="Images" description="Drag files onto the tile or click to upload. Reorder with the arrows." id="images">
              {errors.images && <p className="mb-3 text-sm text-red-600">{errors.images}</p>}
              <ImageUploader images={images} setImages={setImages} errors={errors} />
            </Panel>
          </div>

          <div className="min-w-0 space-y-4">
            <Panel title="Status">
              <div className="space-y-4">
                <Field label="Visibility" htmlFor="p-status" error={errors.status} hint={STATUS_HINT[status]}>
                  <Select
                    id="p-status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value as ProductStatus);
                      touched("status");
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PRODUCT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <Checkbox
                    label="Featured on the home page"
                    checked={isFeatured}
                    onChange={(e) => {
                      setIsFeatured(e.target.checked);
                      touched("isFeatured");
                    }}
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Organisation">
              <Field label="Category" htmlFor="p-category" error={errors.categoryId}>
                <Select
                  id="p-category"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    touched("categoryId");
                  }}
                  disabled={categories.isLoading}
                >
                  <option value="">Uncategorised</option>
                  {categoryOptions(categories.data?.items ?? []).map((c) => (
                    <option key={c.category.id} value={c.category.id}>
                      {c.label}
                    </option>
                  ))}
                  {/* Keep the current value selectable while categories load. */}
                  {categories.isLoading && product?.category && (
                    <option value={product.category.id}>{product.category.name}</option>
                  )}
                </Select>
              </Field>
            </Panel>

            <Panel title="Summary">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Variants</dt>
                  <dd className="tabular-nums text-zinc-900">
                    {formatInt(variants.length)}
                    {variants.some((v) => !v.isActive) && (
                      <span className="text-zinc-500"> ({formatInt(variants.filter((v) => !v.isActive).length)} inactive)</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Total stock</dt>
                  <dd className="tabular-nums text-zinc-900">{formatInt(totalStock)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Price</dt>
                  <dd className="tabular-nums text-zinc-900">
                    {prices.length === 0
                      ? "—"
                      : Math.min(...prices) === Math.max(...prices)
                        ? formatPrice(prices[0])
                        : `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Images</dt>
                  <dd className="tabular-nums text-zinc-900">{formatInt(images.length)}</dd>
                </div>
              </dl>
            </Panel>
          </div>
        </div>

        <Panel title="Variants" description="Each sellable pack size / flavour combination with its own SKU, price and stock.">
          <VariantEditor
            variants={variants}
            setVariants={setVariants}
            slug={effectiveSlug}
            errors={errors}
            onFieldEdited={(path, prefix) => {
              setDirty(true);
              clearError(path, prefix);
              clearError("variants");
            }}
          />
        </Panel>

        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {dirty && <span className="mr-auto text-sm text-zinc-500">Unsaved changes</span>}
          <ButtonLink href="/admin/products" variant="ghost">
            Cancel
          </ButtonLink>
          {saveButton}
        </div>
      </form>

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this product?"
        description="It will be hidden from the store. Past orders keep their details, and you can make it active again later."
        confirmLabel="Archive product"
        loading={archiving}
        onConfirm={archive}
        onClose={() => setConfirmArchive(false)}
      />
    </>
  );
}
