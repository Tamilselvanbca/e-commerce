"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/format";
import type { ProductImage } from "@/lib/types";
import { ProductImg } from "@/components/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

/** Main image + thumbnails. Arrow keys move between images (on the main image or the thumbnails). */
export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = images.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const current = images[safeIndex];

  const go = (next: number, focusThumb = false) => {
    if (count === 0) return;
    const i = (next + count) % count;
    setIndex(i);
    if (focusThumb) thumbs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, focusThumb: boolean) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      go(safeIndex + 1, focusThumb);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(safeIndex - 1, focusThumb);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0, focusThumb);
    } else if (e.key === "End") {
      e.preventDefault();
      go(count - 1, focusThumb);
    }
  };

  const arrow =
    "absolute top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-sm ring-1 ring-black/5 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-zinc-900";

  return (
    // self-start keeps the 4:5 image from stretching to the height of the details column.
    <div className="flex flex-col gap-3 self-start lg:sticky lg:top-24 lg:flex-row-reverse lg:items-start lg:gap-4">
      <div
        className="group relative aspect-[4/5] w-full min-w-0 flex-1 overflow-hidden rounded-2xl bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        role="group"
        aria-roledescription="carousel"
        aria-label={`${name} images`}
        tabIndex={count > 1 ? 0 : undefined}
        onKeyDown={(e) => onKeyDown(e, false)}
      >
        <ProductImg
          key={current?.id ?? "placeholder"}
          src={current?.url}
          alt={current?.alt || (count > 1 ? `${name}, image ${safeIndex + 1} of ${count}` : name)}
          loading="eager"
          className="size-full"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(safeIndex - 1)} className={cn(arrow, "left-3")} aria-label="Previous image">
              <ChevronLeftIcon />
            </button>
            <button type="button" onClick={() => go(safeIndex + 1)} className={cn(arrow, "right-3")} aria-label="Next image">
              <ChevronRightIcon />
            </button>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900/70 px-2.5 py-1 text-xs font-medium text-white" aria-live="polite">
              {safeIndex + 1} / {count}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <ul
          className="flex gap-2 overflow-x-auto pb-1 lg:w-20 lg:flex-col lg:overflow-visible lg:pb-0"
          aria-label="Choose image"
        >
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                type="button"
                onClick={() => setIndex(i)}
                onKeyDown={(e) => onKeyDown(e, true)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === safeIndex ? "true" : undefined}
                tabIndex={i === safeIndex ? 0 : -1}
                className={cn(
                  "block size-16 overflow-hidden rounded-lg bg-zinc-100 ring-offset-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 lg:size-20",
                  i === safeIndex ? "ring-2 ring-brand-700" : "opacity-70 hover:opacity-100",
                )}
              >
                <ProductImg src={img.url} alt="" className="size-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
