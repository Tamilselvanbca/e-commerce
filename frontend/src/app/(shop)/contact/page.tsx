import type { Metadata } from "next";
import Link from "next/link";
import { MailIcon, PhoneIcon, WhatsAppIcon } from "@/components/shop/icons";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { buttonClasses } from "@/components/ui";
import { whatsappUrl } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage() {
  const config = await serverApi.config();
  const card = "flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-5";

  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact us" }]} className="mb-6" />
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Contact us</h1>
        <p className="mt-3 text-base text-zinc-600">
          Questions about an order, sizing or bulk pricing? We usually reply within one business day.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {config.supportEmail && (
            <li className={card}>
              <MailIcon className="mt-0.5 size-5 shrink-0 text-zinc-500" />
              <div>
                <p className="text-sm font-semibold text-zinc-900">Email</p>
                <a href={`mailto:${config.supportEmail}`} className="mt-1 block text-sm text-zinc-700 underline-offset-2 hover:underline">
                  {config.supportEmail}
                </a>
              </div>
            </li>
          )}
          {config.supportPhone && (
            <li className={card}>
              <PhoneIcon className="mt-0.5 size-5 shrink-0 text-zinc-500" />
              <div>
                <p className="text-sm font-semibold text-zinc-900">Phone</p>
                <p className="mt-1 text-sm text-zinc-700">{config.supportPhone}</p>
                <p className="mt-1 text-xs text-zinc-500">Mon–Sat, 10 am – 6 pm IST</p>
              </div>
            </li>
          )}
          {config.whatsappNumber && (
            <li className={`${card} sm:col-span-2`}>
              <WhatsAppIcon className="mt-0.5 size-5 shrink-0 text-[#25D366]" />
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">WhatsApp</p>
                  <p className="mt-1 text-sm text-zinc-700">Chat with us for order help or bulk quotes.</p>
                </div>
                <a
                  href={whatsappUrl(config.whatsappNumber, `Hi ${config.storeName}, I need some help.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("whatsapp", "md")}
                >
                  Chat on WhatsApp
                </a>
              </div>
            </li>
          )}
        </ul>

        <p className="mt-10 text-sm text-zinc-600">
          Tracking an order? Find live status under{" "}
          <Link href="/account/orders" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
            My account → Orders
          </Link>
          . For large quantities, use the{" "}
          <Link href="/bulk-order" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
            bulk order form
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
