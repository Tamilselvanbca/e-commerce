"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/format";
import { useAuth, useToast } from "@/components/providers";
import { PageLoader } from "@/components/ui";
import { BoxesIcon, ExternalIcon, LogoutIcon, MapPinIcon, UserIcon } from "./icons";
import { Container } from "./section";
import { useRequireAuth } from "./use-require-auth";

const NAV = [
  { href: "/account", label: "Profile", icon: UserIcon, match: (p: string) => p === "/account" },
  { href: "/account/addresses", label: "Addresses", icon: MapPinIcon, match: (p: string) => p.startsWith("/account/addresses") },
  { href: "/account/orders", label: "Orders", icon: BoxesIcon, match: (p: string) => p.startsWith("/account/orders") },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const { user, ready } = useRequireAuth(pathname, !leaving);

  async function logout() {
    setLeaving(true);
    await auth.logout();
    toast.success("You've been logged out");
    router.replace("/");
  }

  if (!ready || !user) {
    return (
      <Container className="py-10">
        <PageLoader />
      </Container>
    );
  }

  const item = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-600",
      active ? "bg-brand-700 text-white" : "text-zinc-700 hover:bg-brand-50 hover:text-zinc-900",
    );

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">My account</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {user.name ? `Hi ${user.name}, ` : ""}manage your profile, addresses and orders.
        </p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Account">
          <ul className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
            {NAV.map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <li key={href}>
                  <Link href={href} className={item(active)} aria-current={active ? "page" : undefined}>
                    <Icon className="size-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
            {user.role === "admin" && (
              <li>
                <Link href="/admin" className={item(false)}>
                  <ExternalIcon className="size-4" />
                  Admin panel
                </Link>
              </li>
            )}
            <li className="lg:mt-4 lg:border-t lg:border-zinc-200 lg:pt-4">
              <button type="button" onClick={logout} className={cn(item(false), "w-full")} disabled={leaving}>
                <LogoutIcon className="size-4" />
                Log out
              </button>
            </li>
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
