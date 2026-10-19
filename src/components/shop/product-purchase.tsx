"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { OPTION_LABELS } from "@/lib/catalog-labels";
import { cn, formatPrice, variantLabel, whatsappUrl } from "@/lib/format";
import type { Product, Variant } from "@/lib/types";
import { useAuth, useCart, useStoreConfig, useToast } from "@/components/providers";
import { Button, Price } from "@/components/ui";
import { CheckIcon, LeafIcon, ShieldIcon, TruckIcon, WhatsAppIcon } from "./icons";

const SIZE = OPTION_LABELS.size;
const COLOR = OPTION_LABELS.color;
import { QuantityStepper } from "./quantity-stepper";
import { detailNumber, loginHref, productWhatsAppMessage } from "./utils";

const LOW_STOCK = 5;
const MAX_QTY = 100;

type OptionState = "ok" | "soldout" | "unavailable";

export function ProductPurchase({ product }: { product: Product }) {
  const config = useStoreConfig();
  const cart = useCart();
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const uid = useId();

  const variants = product.variants.filter((v) => v.isActive);
  const sizes = product.options.sizes;
  const colors = product.options.colors;
  const hasSizes = sizes.length > 0;
  const hasColors = colors.length > 0;
  const anyInStock = variants.some((v) => v.stock > 0);

  const [color, setColor] = useState<string | null>(() => {
    if (!hasColors) return null;
    return variants.find((v) => v.stock > 0 && v.color)?.color ?? colors[0]?.name ?? null;
  });
  // Preselect the first pack size that's in stock so the price shows straight away.
  const [size, setSize] = useState<string | null>(() => {
    if (!hasSizes) return null;
    const firstColor = hasColors ? (variants.find((v) => v.stock > 0 && v.color)?.color ?? null) : null;
    return (
      sizes.find((s) => variants.some((v) => v.size === s && v.stock > 0 && (!hasColors || v.color === firstColor))) ??
      (sizes.length === 1 ? sizes[0] : null)
    );
  });
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState<"add" | "buy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const matches = (v: Variant, s: string | null, c: string | null) =>
    (!hasSizes || v.size === s) && (!hasColors || v.color === c);

  const complete = (!hasSizes || size !== null) && (!hasColors || color !== null);
  const selected = complete ? (variants.find((v) => matches(v, size, color)) ?? null) : null;

  const sizeState = (s: string): OptionState => {
    const candidates = variants.filter((v) => v.size === s && (!hasColors || color === null || v.color === color));
    if (candidates.length === 0) return "unavailable";
    return candidates.some((v) => v.stock > 0) ? "ok" : "soldout";
  };
  const colorState = (c: string): { state: OptionState; comboOut: boolean } => {
    const candidates = variants.filter((v) => v.color === c);
    if (candidates.length === 0) return { state: "unavailable", comboOut: true };
    if (!candidates.some((v) => v.stock > 0)) return { state: "soldout", comboOut: true };
    const comboOut = hasSizes && size !== null && !candidates.some((v) => v.size === size && v.stock > 0);
    return { state: "ok", comboOut };
  };

  const maxQty = selected ? Math.max(1, Math.min(selected.stock, MAX_QTY)) : MAX_QTY;
  const qty = Math.min(quantity, maxQty);
  const selectedLabel = selected ? variantLabel(selected.size, selected.color) : null;

  function chooseColor(c: string) {
    setColor(c);
    setError(null);
    setAdded(false);
    if (size !== null && !variants.some((v) => v.color === c && v.size === size && v.stock > 0)) setSize(null);
  }

  function chooseSize(s: string) {
    setSize(s);
    setError(null);
    setAdded(false);
  }

  function missingSelection(): string | null {
    if (hasColors && !color) return `Please select a ${COLOR.toLowerCase()}`;
    if (hasSizes && !size) return `Please select a ${SIZE.toLowerCase()}`;
    if (!selected) return "This combination is not available";
    if (selected.stock <= 0) return "This option is sold out";
    return null;
  }

  async function addToCart(buyNow: boolean) {
    const problem = missingSelection();
    if (problem || !selected) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(buyNow ? "buy" : "add");
    try {
      await cart.addItem(selected.id, qty);
      if (buyNow) {
        router.push(user ? "/checkout" : loginHref("/checkout"));
        return;
      }
      setAdded(true);
      toast.success(`Added to cart: ${product.name}${selectedLabel ? ` (${selectedLabel})` : ""}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "OUT_OF_STOCK") {
        const available = detailNumber(err, "available");
        toast.error(
          available !== null && available > 0
            ? `Only ${available} more can be added for this option.`
            : "Sorry, this option just sold out.",
        );
      } else {
        toast.error(err);
      }
    } finally {
      setBusy(null);
    }
  }

  // Stock message
  let stock: { tone: "ok" | "low" | "out" | "hint"; text: string };
  if (!anyInStock) stock = { tone: "out", text: "Out of stock" };
  else if (selected && selected.stock <= 0) stock = { tone: "out", text: "Sold out in this option" };
  else if (selected && selected.stock <= LOW_STOCK) stock = { tone: "low", text: `Only ${selected.stock} left, order soon` };
  else if (selected) stock = { tone: "ok", text: "In stock, ready to ship" };
  else if (complete) stock = { tone: "out", text: "This combination is not available" };
  else
    stock = {
      tone: "hint",
      text: hasColors && !color ? `Select a ${COLOR.toLowerCase()}` : `Select a ${SIZE.toLowerCase()} to see availability`,
    };

  const whatsappHref = config.whatsappNumber
    ? whatsappUrl(
        config.whatsappNumber,
        productWhatsAppMessage({
          storeName: config.storeName,
          productName: product.name,
          variant: selectedLabel,
          sku: selected?.sku,
          quantity: qty,
        }),
      )
    : null;

  const canBuy = anyInStock && (!selected || selected.stock > 0);

  return (
    <div>
      <div className="mt-4">
        {selected ? (
          <Price price={selected.price} compareAtPrice={selected.compareAtPrice} size="lg" />
        ) : (
          <Price price={product.minPrice} maxPrice={product.maxPrice} compareAtPrice={product.compareAtPrice} size="lg" />
        )}
        <p className="mt-1 text-xs text-zinc-500">Inclusive of all taxes</p>
      </div>

      <div className="mt-8 space-y-6">
        {hasColors && (
          <fieldset>
            <legend className="text-sm font-medium text-zinc-900">
              {COLOR}
              {color && <span className="font-normal text-zinc-600">: {color}</span>}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {colors.map((c) => {
                const { state, comboOut } = colorState(c.name);
                const active = color === c.name;
                const disabled = state !== "ok";
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => chooseColor(c.name)}
                    disabled={disabled}
                    aria-pressed={active}
                    aria-label={`${c.name}${disabled ? " (sold out)" : comboOut ? ` (not available in the selected ${SIZE.toLowerCase()})` : ""}`}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed",
                      active
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-zinc-300 bg-white text-zinc-900 hover:border-brand-700",
                      (disabled || comboOut) && !active && "border-zinc-200 bg-zinc-50 text-zinc-400 line-through",
                    )}
                  >
                    {c.hex && (
                      <span
                        className={cn("size-3.5 rounded-full ring-1 ring-inset", active ? "ring-white/50" : "ring-black/10")}
                        style={{ backgroundColor: c.hex }}
                        aria-hidden="true"
                      />
                    )}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {hasSizes && (
          <fieldset>
            <legend className="text-sm font-medium text-zinc-900">
              {SIZE}
              {size && <span className="font-normal text-zinc-600">: {size}</span>}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {sizes.map((s) => {
                const state = sizeState(s);
                const active = size === s;
                const disabled = state !== "ok";
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => chooseSize(s)}
                    disabled={disabled}
                    aria-pressed={active}
                    aria-label={`${s}${state === "soldout" ? " (sold out)" : state === "unavailable" ? " (not available)" : ""}`}
                    className={cn(
                      "h-11 min-w-12 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
                      active
                        ? "border-brand-700 bg-brand-700 text-white"
                        : disabled
                          ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 line-through"
                          : "border-zinc-300 bg-white text-zinc-900 hover:border-brand-700",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="flex items-center gap-2 text-sm" aria-live="polite">
          <span
            className={cn(
              "size-2 rounded-full",
              stock.tone === "ok" && "bg-emerald-500",
              stock.tone === "low" && "bg-amber-500",
              stock.tone === "out" && "bg-red-500",
              stock.tone === "hint" && "bg-zinc-300",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              stock.tone === "low" ? "font-medium text-amber-700" : stock.tone === "out" ? "text-red-700" : "text-zinc-700",
            )}
          >
            {stock.text}
          </span>
          {selected && <span className="ml-auto text-xs text-zinc-400">SKU {selected.sku}</span>}
        </div>

        {canBuy && (
          <div>
            <label htmlFor={`${uid}-qty`} className="text-sm font-medium text-zinc-900">
              Quantity
            </label>
            <div className="mt-2">
              <QuantityStepper id={`${uid}-qty`} value={qty} onChange={setQuantity} max={maxQty} disabled={busy !== null} />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button size="lg" variant="outline" onClick={() => addToCart(false)} loading={busy === "add"} disabled={!canBuy || busy !== null}>
            {anyInStock ? "Add to cart" : "Out of stock"}
          </Button>
          <Button size="lg" onClick={() => addToCart(true)} loading={busy === "buy"} disabled={!canBuy || busy !== null}>
            Buy now
          </Button>
        </div>

        {added && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200" role="status">
            <span className="flex items-center gap-2">
              <CheckIcon className="size-4" />
              Added to your cart
            </span>
            <Link href="/cart" className="font-medium underline underline-offset-4">
              View cart ({cart.cart.itemCount})
            </Link>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="text-sm font-medium text-zinc-900">Ordering for a wedding, festival or office?</p>
          <p className="mt-1 text-sm text-zinc-600">Special pricing on bulk quantities and custom gift boxes.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#25D366] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                <WhatsAppIcon className="size-4" />
                Bulk order on WhatsApp
              </a>
            )}
            <Link
              href={`/bulk-order?product=${encodeURIComponent(product.slug)}`}
              className="inline-flex h-10 flex-auto items-center justify-center whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              Request bulk quote
            </Link>
          </div>
        </div>

        <ul className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
          <li className="flex items-center gap-2">
            <ShieldIcon className="size-4 text-zinc-900" />
            Secure checkout
          </li>
          <li className="flex items-center gap-2">
            <TruckIcon className="size-4 text-zinc-900" />
            {config.freeShippingThreshold > 0 ? `Free over ${formatPrice(config.freeShippingThreshold)}` : "Ships across India"}
          </li>
          <li className="flex items-center gap-2">
            <LeafIcon className="size-4 text-zinc-900" />
            Freshly packed
          </li>
        </ul>
      </div>
    </div>
  );
}
