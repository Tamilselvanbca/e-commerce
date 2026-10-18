import type { Metadata } from "next";
import { BoxesIcon, SparkIcon, TruckIcon, WhatsAppIcon } from "@/components/shop/icons";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { firstParam } from "@/components/shop/utils";
import { variantLabel, whatsappUrl } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { StoreConfig } from "@/lib/types";
import { BulkOrderSection, type BulkPrefill } from "./bulk-order-form";

export const metadata: Metadata = {
  title: "Bulk & festive orders",
  description: "Sweets and snacks in bulk for weddings, festivals and corporate gifting. Request a quote or chat with us on WhatsApp.",
};

async function loadPrefill(slug: string | undefined): Promise<BulkPrefill | null> {
  if (!slug) return null;
  try {
    const product = await serverApi.product(slug);
    if (!product) return null;
    const labels = product.variants.filter((v) => v.isActive).map((v) => variantLabel(v.size, v.color));
    return { productId: product.id, productName: product.name, variantOptions: [...new Set(labels.filter(Boolean))] };
  } catch {
    return null;
  }
}

async function loadConfig(): Promise<StoreConfig | null> {
  try {
    return await serverApi.config();
  } catch {
    return null;
  }
}

const BENEFITS = [
  { icon: SparkIcon, title: "Volume pricing", text: "Better rates as quantities grow, for return gifts, functions and resellers." },
  { icon: BoxesIcon, title: "Custom gift boxes", text: "Mix sweets and savouries, choose pack sizes, add your name or message." },
  { icon: TruckIcon, title: "Delivered fresh", text: "Prepared close to your date and dispatched to one or many addresses." },
];

const STEPS = [
  "Tell us what you need: sweets or snacks, quantities and the date of your event.",
  "We confirm freshness and availability and send you a quote, usually within a working day.",
  "Approve the quote and we prepare, pack and dispatch, keeping you updated.",
];

export default async function BulkOrderPage(props: PageProps<"/bulk-order">) {
  const sp = await props.searchParams;
  const [prefill, config] = await Promise.all([loadPrefill(firstParam(sp.product)), loadConfig()]);
  const whatsapp = config?.whatsappNumber ?? null;
  const storeName = config?.storeName ?? "there";

  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bulk orders" }]} className="mb-6" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Weddings · Festivals · Corporate gifting</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
            Sweets for every celebration.
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-600">
            Wedding return gifts, Diwali and Pongal hampers, office celebrations or stock for your shop. We prepare
            bulk orders fresh, with special pricing and a dedicated point of contact.
          </p>

          {whatsapp && (
            <a
              href={whatsappUrl(whatsapp, `Hi ${storeName}, I'd like to discuss a bulk order.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-6 text-base font-medium text-white transition-colors hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              <WhatsAppIcon />
              Chat on WhatsApp
            </a>
          )}

          <ul className="mt-10 space-y-5">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900">
                  <Icon />
                </span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{title}</p>
                  <p className="mt-0.5 text-sm text-zinc-600">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 rounded-2xl bg-brand-700 p-6 text-white">
            <p className="text-sm font-semibold">How it works</p>
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
        </div>

        <div>
          <BulkOrderSection prefill={prefill} />
        </div>
      </div>
    </Container>
  );
}
