import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { serverApi } from "@/lib/server-api";
import type { StoreConfig } from "@/lib/types";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Every page depends on live store data (config, catalog, session), so render
// on each request instead of attempting static prerendering at build time.
export const dynamic = "force-dynamic";

const FALLBACK_CONFIG: StoreConfig = {
  storeName: process.env.NEXT_PUBLIC_STORE_NAME ?? "My Store",
  currency: "INR",
  shippingFee: 0,
  freeShippingThreshold: 0,
  internationalShippingFee: 0,
  internationalFreeShippingThreshold: 0,
  supportEmail: null,
  supportPhone: null,
  whatsappNumber: null,
  gateways: { razorpay: { enabled: false, keyId: null }, stripe: { enabled: false }, mock: { enabled: false } },
};

async function loadConfig(): Promise<StoreConfig> {
  try {
    return await serverApi.config();
  } catch (err) {
    console.error("Could not load store config from the backend:", err);
    return FALLBACK_CONFIG;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await loadConfig();
  return {
    title: { default: config.storeName, template: `%s | ${config.storeName}` },
    description: `Traditional sweets and savouries from ${config.storeName}: laddus, mithai, murukku and festive gift boxes, freshly made and delivered across India. Bulk orders on WhatsApp.`,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const config = await loadConfig();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  );
}
