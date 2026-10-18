import type { Metadata } from "next";
import Link from "next/link";
import { GiftIcon, WhatsAppIcon } from "@/components/shop/icons";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { buttonClasses } from "@/components/ui";
import { whatsappUrl } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { BalanceCheck } from "./balance-check";
import { BuyGiftCard } from "./buy-gift-card";

export const metadata: Metadata = {
  title: "Gift cards",
  description: "Send a sweets gift card by email for Diwali, weddings and birthdays, or check your gift card balance.",
};

export default async function GiftCardsPage() {
  const config = await serverApi.config();
  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Gift cards" }]} className="mb-6" />
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Gift cards</h1>
        <p className="mt-3 text-base leading-7 text-zinc-600">
          Let them choose their favourite sweets and savouries. A {config.storeName} gift card arrives by email with a code that
          pays for any order on this site, in India or abroad. Whatever isn&apos;t spent stays on the card for next time.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <BuyGiftCard />

        <div className="space-y-6">
          <BalanceCheck />
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-semibold text-zinc-900">How it works</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {[
                "The recipient enters the code at checkout under “Gift card”.",
                "It can be used together with a discount code.",
                "If an order is cancelled, the amount goes back on the card.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <GiftIcon className="mt-0.5 size-4 text-brand-700" />
                  {t}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:p-6">
            <h2 className="text-base font-semibold text-brand-900">Gift cards for staff or clients?</h2>
            <p className="mt-1 text-sm text-brand-900/80">
              For many recipients or corporate invoicing, send us the list and we&apos;ll issue the cards with your message.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {config.whatsappNumber && (
                <a
                  href={whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I'd like to order gift cards for my team.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("whatsapp", "md")}
                >
                  <WhatsAppIcon className="size-4" />
                  WhatsApp us
                </a>
              )}
              <Link href="/bulk-order" className={buttonClasses("outline", "md")}>
                Send an enquiry
              </Link>
            </div>
          </section>
        </div>
      </div>
    </Container>
  );
}
