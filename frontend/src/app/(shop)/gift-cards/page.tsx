import type { Metadata } from "next";
import Link from "next/link";
import { GiftIcon, WhatsAppIcon } from "@/components/shop/icons";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { buttonClasses } from "@/components/ui";
import { whatsappUrl } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { BalanceCheck } from "./balance-check";

export const metadata: Metadata = {
  title: "Gift cards",
  description: "Gift sweets for Diwali, weddings and corporate occasions. Check your gift card balance.",
};

export default async function GiftCardsPage() {
  const config = await serverApi.config();
  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Gift cards" }]} className="mb-6" />
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Gift cards</h1>
          <p className="mt-3 text-base leading-7 text-zinc-600">
            Let them choose their favourite sweets and savouries. A {config.storeName} gift card arrives by email with a code that
            pays for any order on this site, in India or abroad. Whatever isn&apos;t spent stays on the card for next time.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-700">
            {[
              "Enter the code at checkout under “Gift card”.",
              "Use it together with a discount code.",
              "If an order is cancelled, the amount goes back on the card.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <GiftIcon className="mt-0.5 size-4 text-brand-700" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-sm font-semibold text-brand-900">Buying gift cards for family, staff or clients?</p>
            <p className="mt-1 text-sm text-brand-900/80">
              Tell us the amounts and recipients and we&apos;ll send them, with your message, on the day you choose.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {config.whatsappNumber && (
                <a
                  href={whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I'd like to buy gift cards.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("whatsapp", "md")}
                >
                  <WhatsAppIcon className="size-4" />
                  Order on WhatsApp
                </a>
              )}
              <Link href="/bulk-order" className={buttonClasses("outline", "md")}>
                Send an enquiry
              </Link>
            </div>
          </div>
        </div>
        <BalanceCheck />
      </div>
    </Container>
  );
}
