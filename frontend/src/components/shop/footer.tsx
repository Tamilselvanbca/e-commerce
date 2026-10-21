"use client";

import Link from "next/link";
import { whatsappUrl } from "@/lib/format";
import type { Category } from "@/lib/types";
import { useStoreConfig } from "@/components/providers";
import { Kolam } from "@/components/kolam";
import { LogoImage } from "@/components/logo";
import { MailIcon, PhoneIcon, WhatsAppIcon } from "./icons";

export function SiteFooter({ categories, year }: { categories: Category[]; year: number }) {
  const config = useStoreConfig();
  // brand-100 text on brand-700 keeps WCAG AA contrast for small text.
  const link = "text-sm text-brand-100 transition-colors hover:text-white";
  const heading = "text-xs font-semibold uppercase tracking-wider text-white";

  return (
    <footer className="relative isolate mt-auto overflow-hidden bg-brand-700 bg-[radial-gradient(circle_at_85%_0%,var(--color-brand-600),transparent_55%)] text-white">
      {/* Kolam border motif along the top edge, and a large kolam behind the content. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-px left-0 right-0 flex justify-center gap-6 overflow-hidden text-white/30">
        {Array.from({ length: 14 }, (_, i) => (
          <Kolam key={i} size={3} shape="diamond" seed={2} mirrorDensity={0} strokeWidth={0.2} still className="size-10 shrink-0 -translate-y-1/2" />
        ))}
      </div>
      <Kolam
        size={7}
        shape="diamond"
        seed={9}
        mirrorDensity={0.45}
        strokeWidth={0.12}
        still
        className="pointer-events-none absolute -bottom-32 -right-24 -z-10 size-96 text-white/10"
      />

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 lg:px-8">
        {/* Brand block spans the full row up to xl, then 5 columns side by side. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 xl:grid-cols-12">
          <div className="col-span-2 md:col-span-3 xl:col-span-3">
            {/* The logo's red outline needs a light ground, so it sits on a cream badge. */}
            <Link
              href="/"
              className="inline-block rounded-2xl bg-[#fffaf3] px-4 py-2 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <LogoImage name={config.storeName} className="h-20" />
            </Link>
            <p className="mt-3 max-w-md text-sm leading-6 text-brand-100 xl:max-w-xs">
              Traditional sweets and savouries, freshly made in small batches and delivered across India and worldwide.
              Special pricing on festive, wedding and corporate orders.
            </p>
            {config.whatsappNumber && (
              <a
                href={whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I'd like to place a bulk order.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
              >
                <WhatsAppIcon className="size-4 text-[#1ebe5b]" />
                Festive & bulk orders on WhatsApp
              </a>
            )}
          </div>

          <nav aria-label="Shop" className="xl:col-span-2">
            <p className={heading}>Shop</p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/products" className={link}>
                  All products
                </Link>
              </li>
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link href={`/products?category=${encodeURIComponent(c.slug)}`} className={link}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Our store" className="xl:col-span-2">
            <p className={heading}>Our store</p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/about" className={link}>
                  About us
                </Link>
              </li>
              <li>
                <Link href="/reviews" className={link}>
                  Customer reviews
                </Link>
              </li>
              {config.prebookEnabled && (
                <li>
                  <Link href="/prebook" className={link}>
                    Pre-book
                  </Link>
                </li>
              )}
              <li>
                <Link href="/bulk-order" className={link}>
                  Bulk & festive orders
                </Link>
              </li>
              <li>
                <Link href="/gift-cards" className={link}>
                  Gift cards
                </Link>
              </li>
              <li>
                <Link href="/contact" className={link}>
                  Contact us
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Help" className="xl:col-span-2">
            <p className={heading}>Help</p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/account/orders" className={link}>
                  Track your order
                </Link>
              </li>
              <li>
                <Link href="/account" className={link}>
                  My account
                </Link>
              </li>
              <li>
                <Link href="/cart" className={link}>
                  Cart
                </Link>
              </li>
              <li>
                <Link href="/policies/shipping" className={link}>
                  Shipping
                </Link>
              </li>
            </ul>
          </nav>

          <div className="col-span-2 md:col-span-3 xl:col-span-3">
            <p className={heading}>Contact</p>
            {/* Inline on tablets (full-width row), stacked in the desktop column. */}
            <ul className="mt-4 space-y-3 md:flex md:flex-wrap md:gap-x-8 md:space-y-0 xl:block xl:space-y-3">
              {config.supportEmail && (
                <li>
                  <a href={`mailto:${config.supportEmail}`} className={`${link} inline-flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]`}>
                    <MailIcon className="size-4 shrink-0 text-brand-200" />
                    {config.supportEmail}
                  </a>
                </li>
              )}
              {config.supportPhone && (
                <li>
                  <a href={`tel:${config.supportPhone.replace(/\s/g, "")}`} className={`${link} inline-flex items-center gap-2`}>
                    <PhoneIcon className="size-4 shrink-0 text-brand-200" />
                    {config.supportPhone}
                  </a>
                </li>
              )}
              {config.whatsappNumber && (
                <li>
                  <a
                    href={whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I need help with an order.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${link} inline-flex items-center gap-2`}
                  >
                    <WhatsAppIcon className="size-4 shrink-0 text-brand-200" />
                    WhatsApp support
                  </a>
                </li>
              )}
              {!config.supportEmail && !config.supportPhone && !config.whatsappNumber && (
                <li>
                  <Link href="/bulk-order" className={link}>
                    Send us an enquiry
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>

        <nav aria-label="Policies" className="mt-12 border-t border-white/20 pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            {[
              ["/policies/shipping", "Shipping policy"],
              ["/policies/refunds", "Returns & refunds"],
              ["/policies/privacy", "Privacy policy"],
              ["/policies/terms", "Terms & conditions"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-brand-100 hover:text-white">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-4 flex flex-col gap-3 text-xs text-brand-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
            <p>
              © {year} {config.storeName}. All rights reserved.
            </p>
            {config.fssaiLicenseNo && <p>FSSAI Lic. No. {config.fssaiLicenseNo}</p>}
          </div>
          <p>Secure payments: UPI, cards, net banking & wallets · International cards accepted</p>
        </div>
      </div>
    </footer>
  );
}
