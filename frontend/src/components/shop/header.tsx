"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn, formatPrice, whatsappUrl } from "@/lib/format";
import type { Category } from "@/lib/types";
import { useAuth, useCart, useStoreConfig } from "@/components/providers";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon, WhatsAppIcon } from "./icons";

export function StoreLogo({ name, onClick }: { name: string; onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      title={name}
      className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Image src="/logo.png" alt={name} width={1200} height={866} priority className="h-14 w-auto" />
    </Link>
  );
}

function SearchInput({ autoFocus, onSubmitted }: { autoFocus?: boolean; onSubmitted?: () => void }) {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  return <SearchField key={q} defaultValue={q} autoFocus={autoFocus} onSubmitted={onSubmitted} />;
}

function SearchField({
  defaultValue = "",
  autoFocus,
  onSubmitted,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  onSubmitted?: () => void;
}) {
  const id = useId();
  return (
    <Form action="/products" role="search" onSubmit={() => onSubmitted?.()} className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="Search sweets & snacks"
        autoComplete="off"
        enterKeyHint="search"
        className="h-10 w-full rounded-full border border-zinc-200 bg-zinc-50 pl-9 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
    </Form>
  );
}

function SearchBox(props: { autoFocus?: boolean; onSubmitted?: () => void }) {
  return (
    <Suspense fallback={<SearchField autoFocus={props.autoFocus} onSubmitted={props.onSubmitted} />}>
      <SearchInput {...props} />
    </Suspense>
  );
}

const iconButton =
  "relative inline-flex size-10 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function SiteHeader({ categories }: { categories: Category[] }) {
  const config = useStoreConfig();
  const { user } = useAuth();
  const { cart } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const count = cart.itemCount;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navLink = (active: boolean) =>
    cn(
      "shrink-0 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-600 xl:px-3",
      active ? "text-brand-800" : "text-zinc-600 hover:text-zinc-900",
    );

  return (
    <>
      {config.freeShippingThreshold > 0 && (
        <div className="bg-brand-800 px-4 py-2 text-center text-xs font-medium text-brand-50 sm:text-sm">
          Free shipping on orders over {formatPrice(config.freeShippingThreshold)}
          {config.whatsappNumber && (
            <>
              <span className="mx-2 hidden text-brand-300 sm:inline" aria-hidden="true">
                ·
              </span>
              <Link href="/bulk-order" className="hidden underline-offset-4 hover:underline sm:inline">
                Festive & bulk orders on WhatsApp
              </Link>
            </>
          )}
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-[#fffaf3]/90 backdrop-blur supports-[backdrop-filter]:bg-[#fffaf3]/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:gap-4 lg:px-8 xl:gap-6">
          <button
            type="button"
            className={cn(iconButton, "-ml-2 lg:hidden")}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <MenuIcon />
          </button>

          <StoreLogo name={config.storeName} />

          <nav aria-label="Main" className="hidden min-w-0 items-center lg:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={navLink(pathname === l.href || (l.href === "/products" && pathname.startsWith("/products")))}
                aria-current={pathname === l.href ? "page" : undefined}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden w-60 xl:block 2xl:w-72">
              <SearchBox />
            </div>
            <button
              type="button"
              className={cn(iconButton, "xl:hidden")}
              onClick={() => setSearchOpen((o) => !o)}
              aria-label={searchOpen ? "Close search" : "Search"}
              aria-expanded={searchOpen}
              aria-controls="mobile-search"
            >
              {searchOpen ? <CloseIcon /> : <SearchIcon />}
            </button>
            <Link href={user ? "/account" : "/login"} className={iconButton} aria-label={user ? "Your account" : "Log in"}>
              <UserIcon />
            </Link>
            <Link href="/cart" className={iconButton} aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}>
              <BagIcon />
              {count > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1 text-[11px] font-semibold text-white ring-2 ring-white"
                  aria-hidden="true"
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          </div>
        </div>
        {searchOpen && (
          <div id="mobile-search" className="mx-auto max-w-7xl border-t border-zinc-100 px-4 py-3 sm:px-6 lg:px-8 xl:hidden">
            <SearchBox autoFocus onSubmitted={() => setSearchOpen(false)} />
          </div>
        )}
      </header>

      <MobileMenu open={menuOpen} onClose={closeMenu} categories={categories} />
    </>
  );
}

/** Desktop header navigation (categories live in the mobile menu and footer). */
const NAV_LINKS = [
  { href: "/products", label: "Shop all" },
  { href: "/bulk-order", label: "Bulk & festive orders" },
  { href: "/reviews", label: "Reviews" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
];

function MobileMenu({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const config = useStoreConfig();
  const { user } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const item =
    "flex items-center justify-between rounded-lg px-3 py-3 text-base font-medium text-zinc-900 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600";

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-menu">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white shadow-xl">
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
          <StoreLogo name={config.storeName} onClick={onClose} />
          <button ref={closeRef} type="button" className={iconButton} onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-1 pb-4">
            <SearchBox onSubmitted={onClose} />
          </div>
          <nav aria-label="Mobile">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={item} onClick={onClose}>
                {l.label}
              </Link>
            ))}
            {categories.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-6 text-xs font-semibold uppercase tracking-wider text-zinc-500">Shop by category</p>
                {categories.map((c) => (
                  <Link key={c.id} href={`/products?category=${encodeURIComponent(c.slug)}`} className={item} onClick={onClose}>
                    {c.name}
                  </Link>
                ))}
              </>
            )}
            <p className="px-3 pb-1 pt-6 text-xs font-semibold uppercase tracking-wider text-zinc-500">Your account</p>
            <Link href="/cart" className={item} onClick={onClose}>
              Cart
            </Link>
            {user ? (
              <>
                <Link href="/account" className={item} onClick={onClose}>
                  My account
                </Link>
                <Link href="/account/orders" className={item} onClick={onClose}>
                  My orders
                </Link>
              </>
            ) : (
              <Link href="/login" className={item} onClick={onClose}>
                Log in / Sign up
              </Link>
            )}
          </nav>
        </div>
        {config.whatsappNumber && (
          <div className="border-t border-zinc-200 p-4">
            <a
              href={whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I have a question.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-medium text-white hover:bg-[#1ebe5b]"
            >
              <WhatsAppIcon className="size-5" />
              Chat with us on WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
