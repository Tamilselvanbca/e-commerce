import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";

// Server wrapper: sets the base title ("Admin | Store") and keeps the admin
// out of search engines. Individual pages refine document.title client-side.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
