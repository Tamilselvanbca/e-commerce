import { cn } from "@/lib/format";

/**
 * The store logo: public/logo-240.webp and logo-480.webp, made from the brand
 * artwork with a transparent background. Size it with a height class.
 * Pass an empty `name` where the store name is already written next to it.
 */
export function LogoImage({ name, className }: { name: string; className?: string }) {
  return (
    // A fixed, pre-sized asset, so a plain <img> needs no image optimisation server.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-240.webp"
      srcSet="/logo-240.webp 240w, /logo-480.webp 480w"
      sizes="120px"
      width={240}
      height={172}
      alt={name}
      decoding="async"
      className={cn("w-auto", className)}
    />
  );
}
