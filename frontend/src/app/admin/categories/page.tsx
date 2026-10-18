"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/providers";
import { Badge, Button, Checkbox, Field, Input, Modal, ProductImg, Select, Textarea } from "@/components/ui";
import type { Category } from "@/lib/types";
import { categoryOptions, flattenCategories, selfAndDescendants } from "@/components/admin/category-tree";
import { ConfirmDialog, DangerTextButton } from "@/components/admin/confirm-dialog";
import { Row, Table, TableCard, TableEmpty, TableLoading, Td, Th, THead } from "@/components/admin/data-table";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { useApiQuery } from "@/components/admin/hooks";
import { IconPlus } from "@/components/admin/icons";
import { SingleImageField } from "@/components/admin/image-uploader";
import { PageHeader } from "@/components/admin/page-header";
import { formatInt, slugify, validationErrors, withoutError, type FieldErrors } from "@/components/admin/utils";

type AdminCategory = Category & { isActive?: boolean };

export default function AdminCategoriesPage() {
  const toast = useToast();
  const { data, error, isLoading, isFetching, reload } = useApiQuery<{ items: AdminCategory[] }>("/admin/categories");
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const items = data?.items ?? [];
  const nodes = flattenCategories(items);
  const childCount = (id: string) => items.filter((c) => c.parentId === id).length;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/admin/categories/${deleting.id}`, { method: "DELETE" });
      toast.success(`Deleted “${deleting.name}”`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Categories"
        description={data ? `${formatInt(items.length)} ${items.length === 1 ? "category" : "categories"}` : undefined}
        actions={
          <Button onClick={() => setEditing("new")}>
            <IconPlus className="size-4" />
            New category
          </Button>
        }
      />

      {error && data ? (
        <InlineAlert className="mb-3" title="Couldn't refresh the list">
          {error instanceof Error ? error.message : "Try again."}
        </InlineAlert>
      ) : null}

      {!data && !isLoading ? (
        <LoadError error={error} onRetry={reload} what="categories" />
      ) : (
        <TableCard label="Categories" busy={isFetching && !isLoading}>
          {isLoading || !data ? (
            <TableLoading />
          ) : nodes.length === 0 ? (
            <TableEmpty
              title="No categories yet"
              description="Group products so customers can browse them."
              action={
                <Button size="sm" onClick={() => setEditing("new")}>
                  New category
                </Button>
              }
            />
          ) : (
            <Table minWidth={680}>
              <THead>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th align="right">Products</Th>
                <Th align="right">Sort</Th>
                <Th>Status</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </THead>
              <tbody>
                {nodes.map(({ category: c, depth }) => (
                  <Row key={c.id} className={c.isActive === false ? "bg-zinc-50/60" : undefined}>
                    <Td>
                      <div className="flex items-center gap-3" style={{ paddingLeft: depth * 20 }}>
                        {depth > 0 && (
                          <span aria-hidden="true" className="-mr-1 text-zinc-300">
                            └
                          </span>
                        )}
                        <ProductImg src={c.imageUrl} alt="" className="size-8 shrink-0 rounded-md border border-zinc-100" />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setEditing(c)}
                            className="block max-w-60 truncate text-left font-medium text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-900"
                          >
                            {c.name}
                          </button>
                          {depth > 0 && <span className="sr-only">(subcategory, level {depth + 1})</span>}
                          {childCount(c.id) > 0 && (
                            <span className="block text-xs text-zinc-500">
                              {childCount(c.id)} {childCount(c.id) === 1 ? "subcategory" : "subcategories"}
                            </span>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td className="font-mono text-xs text-zinc-500">{c.slug}</Td>
                    <Td align="right" className="tabular-nums">
                      {formatInt(c.productCount)}
                    </Td>
                    <Td align="right" className="tabular-nums text-zinc-500">
                      {c.sortOrder}
                    </Td>
                    <Td>
                      {c.isActive === false ? (
                        <Badge>Hidden</Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">Active</Badge>
                      )}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        Edit
                      </Button>
                      <DangerTextButton size="sm" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
                        Delete
                      </DangerTextButton>
                    </Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          )}
        </TableCard>
      )}

      {editing && (
        <CategoryModal
          category={editing === "new" ? null : editing}
          all={items}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          <div className="space-y-2">
            <p>
              {deleting && deleting.productCount > 0
                ? `Its ${formatInt(deleting.productCount)} ${deleting.productCount === 1 ? "product becomes" : "products become"} uncategorised.`
                : "Products in it become uncategorised."}{" "}
              This can&apos;t be undone.
            </p>
            {deleting && childCount(deleting.id) > 0 && (
              <p className="rounded-md bg-amber-50 px-2.5 py-2 text-amber-900">
                It has {childCount(deleting.id)} {childCount(deleting.id) === 1 ? "subcategory" : "subcategories"}. Move
                them first if you want to keep them under another parent.
              </p>
            )}
          </div>
        }
        confirmLabel="Delete category"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function CategoryModal({
  category,
  all,
  onClose,
  onSaved,
}: {
  category: AdminCategory | null;
  all: AdminCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [description, setDescription] = useState(category?.description ?? "");
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState<string | null>(category?.imageUrl ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (!saving) onClose();
  };

  const effectiveSlug = slugTouched ? slug : slugify(name);
  // A category can't be moved under itself or one of its descendants.
  const blocked = category ? selfAndDescendants(all, category.id) : new Set<string>();
  const parentOptions = categoryOptions(all).filter((o) => !blocked.has(o.category.id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: FieldErrors = {};
    if (!name.trim()) local.name = "Enter a name";
    const order = Number(sortOrder);
    if (!Number.isInteger(order)) local.sortOrder = "Enter a whole number";
    if (effectiveSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effectiveSlug))
      local.slug = "Use lowercase letters, numbers and hyphens";
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        ...(effectiveSlug ? { slug: effectiveSlug } : {}),
        description: description.trim() || null,
        imageUrl,
        parentId: parentId || null,
        sortOrder: order,
        isActive,
      };
      await api(category ? `/admin/categories/${category.id}` : "/admin/categories", {
        method: category ? "PUT" : "POST",
        body,
      });
      toast.success(category ? "Category saved" : "Category created");
      onSaved();
    } catch (err) {
      const fields = validationErrors(err);
      if (fields) setErrors(fields);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={category ? `Edit “${category.name}”` : "New category"}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={saving}>
            {category ? "Save" : "Create category"}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" htmlFor="c-name" error={errors.name}>
          <Input
            id="c-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((x) => withoutError(x, "name"));
            }}
            aria-invalid={Boolean(errors.name) || undefined}
            autoFocus
            required
            maxLength={120}
          />
        </Field>
        <Field
          label="Slug"
          htmlFor="c-slug"
          error={errors.slug}
          hint={slugTouched ? "Clear to generate it from the name." : "Generated from the name."}
        >
          <Input
            id="c-slug"
            value={effectiveSlug}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().replace(/\s+/g, "-");
              setSlug(v);
              setSlugTouched(v !== "");
              setErrors((x) => withoutError(x, "slug"));
            }}
            aria-invalid={Boolean(errors.slug) || undefined}
            className="font-mono text-xs"
            maxLength={120}
          />
        </Field>
        <Field label="Description (optional)" htmlFor="c-desc" error={errors.description}>
          <Textarea id="c-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Parent" htmlFor="c-parent" error={errors.parentId}>
            <Select id="c-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">None (top level)</option>
              {parentOptions.map((o) => (
                <option key={o.category.id} value={o.category.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sort order" htmlFor="c-sort" error={errors.sortOrder} hint="Lower shows first">
            <Input
              id="c-sort"
              type="number"
              inputMode="numeric"
              step="1"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setErrors((x) => withoutError(x, "sortOrder"));
              }}
              aria-invalid={Boolean(errors.sortOrder) || undefined}
              className="tabular-nums"
            />
          </Field>
        </div>
        <SingleImageField value={imageUrl} onChange={setImageUrl} label="Image (optional)" />
        {errors.imageUrl && <p className="text-xs text-red-600">{errors.imageUrl}</p>}
        <Checkbox label="Active (visible in the store)" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </form>
    </Modal>
  );
}
