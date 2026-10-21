import type { Metadata } from "next";
import { ClockIcon, SparkIcon, WhatsAppIcon } from "@/components/shop/icons";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { ButtonLink } from "@/components/ui";
import { whatsappUrl } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { PrebookProduct, StoreConfig } from "@/lib/types";
import { PrebookSection } from "./prebook-form";

export const metadata: Metadata = {
  title: "Pre-book",
  description: "Pre-book sweets and snacks for a festival, function or any date. Choose your products and date; we confirm and prepare them fresh.",
};

const STEPS = [
  "Choose the sweets and snacks you want, even ones that are sold out today.",
  "Pick the date you need them and send the booking.",
  "We call or WhatsApp you to confirm the booking and payment, then prepare everything fresh for your date.",
];

export default async function PrebookPage() {
  const config = await serverApi.config().catch((): StoreConfig | null => null);
  const whatsapp = config?.whatsappNumber ?? null;

  // Switched off in Admin → Settings (the menu link is hidden too).
  if (config && !config.prebookEnabled) {
    return (
      <Container className="py-6 sm:py-10">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Pre-book" }]} className="mb-6" />
        <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">Pre-booking is closed right now</h1>
          <p className="mt-2 text-sm text-zinc-600">
            You can still order from our shop{whatsapp ? ", or message us on WhatsApp for a special request" : ""}.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/products">Shop all products</ButtonLink>
            {whatsapp && (
              <a
                href={whatsappUrl(whatsapp, `Hi ${config.storeName}, I'd like to place an advance order.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                <WhatsAppIcon className="size-4 text-[#1ebe5b]" />
                WhatsApp us
              </a>
            )}
          </div>
        </div>
      </Container>
    );
  }

  const products = await serverApi.prebookProducts().catch((): PrebookProduct[] | null => null);

  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Pre-book" }]} className="mb-6" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Festivals · Functions · Any date</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-5xl">Pre-book your sweets.</h1>
          <p className="mt-5 text-base leading-7 text-zinc-600">
            Reserve sweets and snacks ahead of time for Diwali, Pongal, weddings or family functions. Choose what you
            need and the date, and we&apos;ll keep it ready, made fresh.
          </p>

          <div className="mt-8 rounded-2xl bg-brand-700 p-6 text-white">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ClockIcon className="size-4" />
              How pre-booking works
            </p>
            <ol className="mt-4 space-y-3">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-brand-100">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-6 flex gap-3 text-sm text-zinc-600">
            <SparkIcon className="mt-0.5 size-4 shrink-0 text-brand-700" />
            No payment now. Prices shown are estimates; we confirm the final amount with your booking.
          </p>

          {whatsapp && (
            <a
              href={whatsappUrl(whatsapp, `Hi ${config?.storeName ?? "there"}, I'd like to pre-book sweets.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <WhatsAppIcon className="size-4 text-[#1ebe5b]" />
              Prefer WhatsApp? Message us
            </a>
          )}
        </div>

        <div>
          <PrebookSection products={products} />
        </div>
      </div>
    </Container>
  );
}
