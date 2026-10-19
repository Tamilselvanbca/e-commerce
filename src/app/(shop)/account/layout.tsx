import type { Metadata } from "next";
import { AccountShell } from "@/components/shop/account-shell";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return <AccountShell>{children}</AccountShell>;
}
