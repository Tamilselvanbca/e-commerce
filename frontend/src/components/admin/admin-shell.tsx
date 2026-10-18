"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useStoreConfig } from "@/components/providers";
import { Button, ButtonLink, PageLoader } from "@/components/ui";
import { cn } from "@/lib/format";
import type { User } from "@/lib/types";
import { useEscapeKey } from "./hooks";
import {
  IconCategories,
  IconChat,
  IconClose,
  IconDashboard,
  IconExternal,
  IconGift,
  IconLogout,
  IconMenu,
  IconOrders,
  IconProducts,
  IconSettings,
  IconStar,
  IconTag,
  IconUsers,
} from "./icons";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: IconOrders },
  { href: "/admin/products", label: "Products", icon: IconProducts },
  { href: "/admin/categories", label: "Categories", icon: IconCategories },
  { href: "/admin/users", label: "Customers", icon: IconUsers },
  { href: "/admin/enquiries", label: "Bulk enquiries", icon: IconChat },
  { href: "/admin/reviews", label: "Reviews", icon: IconStar },
  { href: "/admin/discounts", label: "Discounts", icon: IconTag },
  { href: "/admin/gift-cards", label: "Gift cards", icon: IconGift },
  { href: "/admin/settings", label: "Settings", icon: IconSettings },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Client-side guard + chrome for every /admin page. The proxy already sends
 * visitors without a session cookie to /login; this handles expired sessions
 * and signed-in customers without the admin role.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!loading && !user && !signingOut) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, signingOut, pathname, router]);

  const signOut = async (destination = "/") => {
    setSigningOut(true);
    await logout();
    router.replace(destination);
  };

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50">
        <PageLoader />
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <NoAccess
        user={user}
        onSignOut={() => void signOut(`/login?next=${encodeURIComponent(pathname)}`)}
        signingOut={signingOut}
      />
    );
  }

  return (
    <Chrome user={user} pathname={pathname} onSignOut={() => void signOut("/")} signingOut={signingOut}>
      {children}
    </Chrome>
  );
}

function NoAccess({ user, onSignOut, signingOut }: { user: User; onSignOut: () => void; signingOut: boolean }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <IconDashboard className="size-6" />
        </div>
        <h1 className="text-lg font-semibold text-zinc-900">You don&apos;t have access</h1>
        <p className="mt-2 text-sm text-zinc-600">
          You&apos;re signed in as <span className="font-medium text-zinc-900">{user.name || user.phone}</span>. The admin
          area is only available to store staff.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <ButtonLink href="/">Back to the store</ButtonLink>
          <Button variant="outline" onClick={onSignOut} loading={signingOut}>
            Use another account
          </Button>
        </div>
      </div>
    </main>
  );
}

function Chrome({
  user,
  pathname,
  onSignOut,
  signingOut,
  children,
}: {
  user: User;
  pathname: string;
  onSignOut: () => void;
  signingOut: boolean;
  children: React.ReactNode;
}) {
  const { storeName } = useStoreConfig();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  useEscapeKey(drawerOpen, closeDrawer);

  return (
    <div className="flex min-h-dvh flex-1 bg-zinc-50">
      <a
        href="#admin-main"
        className="sr-only z-[60] rounded-md bg-zinc-900 px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-zinc-200 bg-white lg:flex">
        <SidebarContent
          storeName={storeName}
          user={user}
          pathname={pathname}
          onSignOut={onSignOut}
          signingOut={signingOut}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-zinc-900/40" aria-hidden="true" onClick={closeDrawer} />
          <div id="admin-drawer" className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <button
              type="button"
              onClick={closeDrawer}
              autoFocus
              className="absolute right-3 top-3.5 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"
              aria-label="Close navigation"
            >
              <IconClose className="size-5" />
            </button>
            <SidebarContent
              storeName={storeName}
              user={user}
              pathname={pathname}
              onNavigate={closeDrawer}
              onSignOut={onSignOut}
              signingOut={signingOut}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1.5 rounded-md p-1.5 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
          >
            <IconMenu className="size-5" />
          </button>
          <Link href="/admin" className="min-w-0 truncate text-sm font-semibold text-zinc-900">
            {storeName} <span className="font-normal text-zinc-500">Admin</span>
          </Link>
        </header>

        <main id="admin-main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  storeName,
  user,
  pathname,
  onNavigate,
  onSignOut,
  signingOut,
}: {
  storeName: string;
  user: User;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const initial = (user.name || user.phone).replace(/^\+/, "").charAt(0).toUpperCase();
  return (
    <>
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-100 px-5 lg:h-16">
        <Link href="/admin" onClick={onNavigate} className="min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-zinc-900">
          <span className="block truncate text-sm font-semibold text-zinc-900">{storeName}</span>
          <span className="block text-xs text-zinc-500">Admin</span>
        </Link>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900",
                    active ? "bg-brand-700 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
                  )}
                >
                  <Icon className={cn("size-[18px]", active ? "text-white" : "text-zinc-400")} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
          >
            <IconExternal className="size-[18px] text-zinc-400" />
            View store
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </nav>

      <div className="shrink-0 border-t border-zinc-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700"
          >
            {initial || "A"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{user.name || "Admin"}</p>
            <p className="truncate text-xs text-zinc-500">{user.phone}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-50"
            aria-label="Log out"
            title="Log out"
          >
            <IconLogout className="size-[18px]" />
          </button>
        </div>
      </div>
    </>
  );
}
