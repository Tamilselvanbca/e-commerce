"use client";

import { useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/providers";
import { ProductImg, Spinner } from "@/components/ui";
import { cn } from "@/lib/format";
import { IconChevronLeft, IconChevronRight, IconTrash, IconUpload } from "./icons";
import { ALLOWED_IMAGE_TYPES, checkImageFile } from "./utils";

export type UploadResult = { url: string; key: string };

/** Uploads one image to `POST /admin/uploads` (multipart field `file`). */
export function uploadImage(file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);
  return api<UploadResult>("/admin/uploads", { method: "POST", body });
}

let uidSeq = 0;
/** Unique id for client-side list rows. Call from event handlers only. */
export function newUid(prefix = "n"): string {
  uidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidSeq.toString(36)}`;
}

export type ImageDraft = { uid: string; id?: string; url: string; key?: string | null; alt: string };

type Pending = { uid: string; name: string; preview: string };

/**
 * Product image manager: upload (button or drop), reorder (first image is the
 * cover), alt text, remove. `setImages` must accept updater functions because
 * uploads finish asynchronously.
 */
export function ImageUploader({
  images,
  setImages,
  errors,
}: {
  images: ImageDraft[];
  setImages: React.Dispatch<React.SetStateAction<ImageDraft[]>>;
  errors?: Record<string, string>;
}) {
  const toast = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const accepted: { file: File; p: Pending }[] = [];
    for (const file of files) {
      const problem = checkImageFile(file);
      if (problem) toast.error(problem);
      else accepted.push({ file, p: { uid: newUid("img"), name: file.name, preview: URL.createObjectURL(file) } });
    }
    if (!accepted.length) return;
    setPending((list) => [...list, ...accepted.map((a) => a.p)]);

    const results = await Promise.allSettled(accepted.map((a) => uploadImage(a.file)));
    const added: ImageDraft[] = [];
    results.forEach((r, i) => {
      const { p } = accepted[i];
      if (r.status === "fulfilled") added.push({ uid: p.uid, url: r.value.url, key: r.value.key, alt: "" });
      else toast.error(`${p.name}: ${r.reason instanceof Error ? r.reason.message : "upload failed"}`);
      URL.revokeObjectURL(p.preview);
    });
    // Append in the order the files were chosen.
    if (added.length) setImages((list) => [...list, ...added]);
    const done = new Set(accepted.map((a) => a.p.uid));
    setPending((list) => list.filter((p) => !done.has(p.uid)));
    if (added.length) toast.success(added.length === 1 ? "Image uploaded" : `${added.length} images uploaded`);
  };

  const move = (index: number, delta: number) =>
    setImages((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (uid: string) => setImages((list) => list.filter((img) => img.uid !== uid));
  const setAlt = (uid: string, alt: string) =>
    setImages((list) => list.map((img) => (img.uid === uid ? { ...img, alt } : img)));

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {images.map((img, i) => {
          const err = errors?.[`images.${i}.url`] ?? errors?.[`images.${i}.alt`] ?? errors?.[`images.${i}`];
          return (
            <li key={img.uid} className={cn("rounded-lg border bg-white p-2", err ? "border-red-300" : "border-zinc-200")}>
              <div className="relative">
                <ProductImg src={img.url} alt={img.alt || `Product image ${i + 1}`} className="aspect-square w-full rounded-md" />
                <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm">
                  {i === 0 ? "Cover" : i + 1}
                </span>
              </div>
              <label className="mt-2 block">
                <span className="sr-only">Alt text for image {i + 1}</span>
                <input
                  type="text"
                  value={img.alt}
                  onChange={(e) => setAlt(img.uid, e.target.value)}
                  placeholder="Alt text"
                  maxLength={200}
                  className="block h-8 w-full rounded-md border border-zinc-300 px-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </label>
              {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex">
                  <IconButton label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <IconChevronLeft className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Move image ${i + 1} later`}
                    disabled={i === images.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <IconChevronRight className="size-4" />
                  </IconButton>
                </div>
                <IconButton label={`Remove image ${i + 1}`} onClick={() => remove(img.uid)} danger>
                  <IconTrash className="size-4" />
                </IconButton>
              </div>
            </li>
          );
        })}

        {pending.map((p) => (
          <li key={p.uid} className="rounded-lg border border-zinc-200 bg-white p-2" aria-live="polite">
            <div className="relative">
              <ProductImg src={p.preview} alt="" className="aspect-square w-full rounded-md opacity-50" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-700">
                <Spinner className="size-5" />
                <span className="text-xs font-medium">Uploading…</span>
              </div>
            </div>
            <p className="mt-2 truncate text-xs text-zinc-500">{p.name}</p>
          </li>
        ))}

        <li>
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex aspect-square h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zinc-900",
              dragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50",
            )}
          >
            <IconUpload className="size-5 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-800">Upload images</span>
            <span className="text-xs text-zinc-500">JPEG, PNG, WebP, GIF or AVIF · max 5 MB</span>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) void handleFiles(files);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
          </label>
        </li>
      </ul>
      {images.length > 1 && <p className="mt-2 text-xs text-zinc-500">The first image is used as the cover in listings.</p>}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-30",
        danger ? "text-zinc-500 hover:bg-red-50 hover:text-red-700" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

/** Single image field (used for category images). */
export function SingleImageField({
  value,
  onChange,
  label = "Image",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const toast = useToast();
  const inputId = useId();
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    const problem = checkImageFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      onChange(url);
    } catch (err) {
      toast.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-800">{label}</span>
      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-zinc-200">
          <ProductImg src={value} alt="" className="size-full" />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Spinner className="size-4" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zinc-900"
          >
            <IconUpload className="size-4" />
            {value ? "Replace" : "Upload"}
            <input
              id={inputId}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
