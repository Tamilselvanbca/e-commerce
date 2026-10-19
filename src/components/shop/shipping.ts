import type { StoreConfig } from "@/lib/types";

/** Shipping estimate used on the cart page (checkout uses the server's figure). */
export function estimateShipping(subtotal: number, config: Pick<StoreConfig, "shippingFee" | "freeShippingThreshold">) {
  const threshold = config.freeShippingThreshold;
  const qualifies = threshold > 0 && subtotal >= threshold;
  const fee = qualifies || config.shippingFee <= 0 ? 0 : config.shippingFee;
  const remaining = threshold > 0 && !qualifies ? threshold - subtotal : 0;
  const progress = threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 100;
  return { fee, remaining, progress, threshold };
}
