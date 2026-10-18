"use client";

import { useId, useState } from "react";
import { Button, Input } from "@/components/ui";
import { OPTION_LABELS } from "@/lib/catalog-labels";
import { cn } from "@/lib/format";
import { newUid } from "./image-uploader";
import { IconClose, IconPlus, IconTrash } from "./icons";
import { colorNameToHex, splitList, suggestSku, type FieldErrors } from "./utils";

export type VariantDraft = {
  uid: string;
  id?: string;
  sku: string;
  /** false = SKU follows the auto-suggestion. */
  skuTouched: boolean;
  size: string;
  color: string;
  colorHex: string | null;
  price: string; // rupees
  compareAt: string; // rupees
  stock: string;
  isActive: boolean;
};

export function emptyVariant(uid: string, defaults: Partial<VariantDraft> = {}): VariantDraft {
  return {
    uid,
    sku: "",
    skuTouched: false,
    size: "",
    color: "",
    colorHex: null,
    price: "",
    compareAt: "",
    stock: "0",
    isActive: true,
    ...defaults,
  };
}

/** The SKU that will be submitted for a row. */
export function effectiveSku(v: VariantDraft, slug: string): string {
  return v.skuTouched ? v.sku.trim() : suggestSku(slug, v.size, v.color);
}

const FIELD_LABELS: Record<string, string> = {
  sku: "SKU",
  size: OPTION_LABELS.size,
  color: OPTION_LABELS.color,
  colorHex: `${OPTION_LABELS.color} colour`,
  price: "Price",
  compareAtPrice: "Compare-at price",
  stock: "Stock",
  isActive: "Active",
};

// Dense table input. Not built on the shared <Input> because its h-10/w-full/px-3
// would win over these sizes (no class merging); width and text color come per cell.
const cellBase =
  "block h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 aria-[invalid=true]:border-red-500";

function CellInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(cellBase, className)} {...props} />;
}

/**
 * Editable variants table: size, color (+ swatch), SKU (auto-suggested from
 * slug + size + color until edited), price / compare-at in rupees, stock,
 * active. Includes a sizes × colors generator.
 */
export function VariantEditor({
  variants,
  setVariants,
  slug,
  errors,
  onFieldEdited,
}: {
  variants: VariantDraft[];
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>;
  slug: string;
  errors: FieldErrors;
  /** Called with an error path (e.g. "variants.2.price") when that field changes. */
  onFieldEdited: (path: string, prefix?: boolean) => void;
}) {
  const update = (index: number, patch: Partial<VariantDraft>, field: string) => {
    setVariants((list) => list.map((v, i) => (i === index ? { ...v, ...patch } : v)));
    onFieldEdited(`variants.${index}.${field}`);
  };

  const remove = (index: number) => {
    setVariants((list) => list.filter((_, i) => i !== index));
    onFieldEdited("variants", true); // indexes shift; drop all row errors
  };

  const add = () => {
    const uid = newUid("v");
    setVariants((list) => {
      const last = list[list.length - 1];
      // Carry the last row's prices to speed up data entry.
      return [...list, emptyVariant(uid, last ? { price: last.price, compareAt: last.compareAt } : {})];
    });
  };

  const listError = errors.variants;

  return (
    <div className="space-y-4">
      <VariantGenerator variants={variants} setVariants={setVariants} />

      {listError && <p className="text-sm text-red-600">{listError}</p>}

      {/* `relative` contains absolutely positioned descendants (e.g. sr-only labels) so they don't widen the page. */}
      <div className="relative overflow-x-auto rounded-lg border border-zinc-200" tabIndex={0} role="region" aria-label="Variants">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                {OPTION_LABELS.size}
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                {OPTION_LABELS.color}
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                SKU
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Price ₹
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Compare-at ₹
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Stock
              </th>
              <th scope="col" className="px-2 py-2 text-center font-medium">
                Active
              </th>
              <th scope="col" className="w-12 px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const n = i + 1;
              const err = (f: string) => errors[`variants.${i}.${f}`];
              const rowErrors = Object.entries(errors)
                .filter(([k]) => k.startsWith(`variants.${i}.`) || k === `variants.${i}`)
                .map(([k, m]) => `${FIELD_LABELS[k.split(".")[2] ?? ""] ?? "Variant"}: ${m}`);
              const suggestion = suggestSku(slug, v.size, v.color);
              return (
                <VariantRows key={v.uid} hasErrors={rowErrors.length > 0} errors={rowErrors} inactive={!v.isActive}>
                  <td className="px-3 py-2 text-xs tabular-nums text-zinc-400">{n}</td>
                  <td className="px-2 py-2">
                    <CellInput
                      aria-label={`${OPTION_LABELS.size}, variant ${n}`}
                      aria-invalid={Boolean(err("size")) || undefined}
                      value={v.size}
                      onChange={(e) => update(i, { size: e.target.value }, "size")}
                      placeholder={`e.g. ${OPTION_LABELS.sizeExample}`}
                      className="w-24 text-zinc-900"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="relative inline-flex shrink-0" title={v.colorHex ?? "No swatch color"}>
                        <input
                          type="color"
                          aria-label={`Swatch color${v.colorHex ? ` ${v.colorHex}` : " (not set)"}, variant ${n}`}
                          value={v.colorHex ?? "#ffffff"}
                          onChange={(e) => update(i, { colorHex: e.target.value }, "colorHex")}
                          className="h-9 w-9 cursor-pointer rounded-md border border-zinc-300 bg-white p-1"
                        />
                        {/* "No color" mark (slashed white swatch) so an unset hex never reads as a real color. */}
                        {!v.colorHex && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-1 rounded-sm bg-white bg-[linear-gradient(135deg,transparent_46%,#a1a1aa_46%,#a1a1aa_54%,transparent_54%)] ring-1 ring-inset ring-zinc-200"
                          />
                        )}
                      </span>
                      <CellInput
                        aria-label={`${OPTION_LABELS.color}, variant ${n}`}
                        aria-invalid={Boolean(err("color")) || undefined}
                        value={v.color}
                        onChange={(e) => {
                          const color = e.target.value;
                          const patch: Partial<VariantDraft> = { color };
                          if (!v.colorHex) {
                            const hex = colorNameToHex(color);
                            if (hex) patch.colorHex = hex;
                          }
                          update(i, patch, "color");
                        }}
                        placeholder={`e.g. ${OPTION_LABELS.colorExample}`}
                        className="w-24 text-zinc-900"
                      />
                      {/* Fixed-width slot so rows stay aligned whether or not a hex is set. */}
                      <span className="inline-flex w-6 shrink-0 justify-center">
                        {v.colorHex && (
                          <button
                            type="button"
                            onClick={() => update(i, { colorHex: null }, "colorHex")}
                            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
                            aria-label={`Clear swatch color ${v.colorHex}, variant ${n}`}
                            title={`Clear swatch color (${v.colorHex})`}
                          >
                            <IconClose className="size-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <CellInput
                      aria-label={`SKU, variant ${n}`}
                      aria-invalid={Boolean(err("sku")) || undefined}
                      value={v.skuTouched ? v.sku : suggestion}
                      onChange={(e) => {
                        const sku = e.target.value.toUpperCase();
                        update(i, { sku, skuTouched: sku.trim() !== "" }, "sku");
                      }}
                      placeholder={suggestion || "SKU"}
                      className={cn("w-44 font-mono text-xs", v.skuTouched ? "text-zinc-900" : "text-zinc-500")}
                      title={v.skuTouched ? undefined : "Auto-generated from slug, size and color. Type to override."}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <CellInput
                      aria-label={`Price in rupees, variant ${n}`}
                      aria-invalid={Boolean(err("price")) || undefined}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={v.price}
                      onChange={(e) => update(i, { price: e.target.value }, "price")}
                      className="w-24 text-right tabular-nums text-zinc-900"
                      required
                    />
                  </td>
                  <td className="px-2 py-2">
                    <CellInput
                      aria-label={`Compare-at price in rupees, variant ${n}`}
                      aria-invalid={Boolean(err("compareAtPrice")) || undefined}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={v.compareAt}
                      onChange={(e) => update(i, { compareAt: e.target.value }, "compareAtPrice")}
                      placeholder="—"
                      className="w-24 text-right tabular-nums text-zinc-900"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <CellInput
                      aria-label={`Stock, variant ${n}`}
                      aria-invalid={Boolean(err("stock")) || undefined}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={v.stock}
                      onChange={(e) => update(i, { stock: e.target.value }, "stock")}
                      className={cn(
                        "w-16 text-right tabular-nums",
                        v.stock.trim() !== "" && Number(v.stock) <= 0 ? "text-red-700" : "text-zinc-900",
                      )}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Active, variant ${n}`}
                      checked={v.isActive}
                      onChange={(e) => update(i, { isActive: e.target.checked }, "isActive")}
                      className="size-4 rounded border-zinc-300 accent-brand-700"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={variants.length <= 1}
                      aria-label={`Remove variant ${n}`}
                      title={variants.length <= 1 ? "A product needs at least one variant" : "Remove variant"}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                    >
                      <IconTrash className="size-4" />
                    </button>
                  </td>
                </VariantRows>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={add}>
          <IconPlus className="size-4" />
          Add variant
        </Button>
        <p className="text-xs text-zinc-500">
          Variants used in past orders are deactivated instead of deleted when removed.
        </p>
      </div>
    </div>
  );
}

function VariantRows({
  children,
  errors,
  hasErrors,
  inactive,
}: {
  children: React.ReactNode;
  errors: string[];
  hasErrors: boolean;
  inactive: boolean;
}) {
  return (
    <>
      <tr className={cn("border-zinc-100", !hasErrors && "border-b last:border-0", inactive && "bg-zinc-50/80")}>
        {children}
      </tr>
      {hasErrors && (
        <tr className="border-b border-zinc-100 last:border-0">
          <td />
          <td colSpan={8} className="px-2 pb-2">
            <ul className="space-y-0.5 text-xs text-red-600">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

/** "S, M, L" × "Black, White" -> rows (existing combinations are skipped). */
function VariantGenerator({
  variants,
  setVariants,
}: {
  variants: VariantDraft[];
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const sizeList = splitList(sizes);
  const colorList = splitList(colors);
  const combos: { size: string; color: string }[] = [];
  for (const size of sizeList.length ? sizeList : [""])
    for (const color of colorList.length ? colorList : [""]) if (size || color) combos.push({ size, color });

  const key = (size: string, color: string) => `${size.trim().toLowerCase()}|${color.trim().toLowerCase()}`;
  const existing = new Set(variants.map((v) => key(v.size, v.color)));
  const fresh = combos.filter((c) => !existing.has(key(c.size, c.color)));

  const generate = () => {
    const rows = fresh.map((c) =>
      emptyVariant(newUid("v"), {
        size: c.size,
        color: c.color,
        colorHex: c.color ? colorNameToHex(c.color) : null,
        price,
        stock: stock || "0",
      }),
    );
    setVariants((list) => {
      // Replace a single untouched blank row instead of keeping it around.
      const blank = (v: VariantDraft) => !v.id && !v.size && !v.color && !v.price && !v.skuTouched;
      const base = list.length === 1 && blank(list[0]) ? [] : list;
      return [...base, ...rows];
    });
    setSizes("");
    setColors("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-900"
      >
        Generate variants from {OPTION_LABELS.sizes.toLowerCase()} and {OPTION_LABELS.colors.toLowerCase()}…
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={`${id}-sizes`} className="mb-1 block text-xs font-medium text-zinc-600">
            {OPTION_LABELS.sizes} (comma-separated)
          </label>
          <Input id={`${id}-sizes`} value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder={OPTION_LABELS.sizeListExample} autoFocus />
        </div>
        <div>
          <label htmlFor={`${id}-colors`} className="mb-1 block text-xs font-medium text-zinc-600">
            {OPTION_LABELS.colors} (comma-separated, optional)
          </label>
          <Input id={`${id}-colors`} value={colors} onChange={(e) => setColors(e.target.value)} placeholder={OPTION_LABELS.colorListExample} />
        </div>
        <div>
          <label htmlFor={`${id}-price`} className="mb-1 block text-xs font-medium text-zinc-600">
            Price ₹ (optional)
          </label>
          <Input
            id={`${id}-price`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-stock`} className="mb-1 block text-xs font-medium text-zinc-600">
            Stock each (optional)
          </label>
          <Input
            id={`${id}-stock`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500" aria-live="polite">
          {combos.length === 0
            ? `Enter ${OPTION_LABELS.sizes.toLowerCase()}, ${OPTION_LABELS.colors.toLowerCase()} or both.`
            : fresh.length === combos.length
              ? `${fresh.length} new ${fresh.length === 1 ? "variant" : "variants"}`
              : `${fresh.length} new, ${combos.length - fresh.length} already exist`}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={generate} disabled={fresh.length === 0}>
            Add {fresh.length || ""} {fresh.length === 1 ? "variant" : "variants"}
          </Button>
        </div>
      </div>
    </div>
  );
}
