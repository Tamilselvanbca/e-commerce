"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers";
import { loginHref } from "./utils";

/**
 * Redirects to /login?next=<next> once the session check resolves without a user.
 * `src/proxy.ts` already redirects when there is no cookie at all; this covers
 * expired sessions. Pass `enabled = false` to suspend the redirect (e.g. while logging out).
 */
export function useRequireAuth(next: string, enabled = true) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (enabled && !loading && !user) router.replace(loginHref(next));
  }, [enabled, loading, user, router, next]);

  return { user, ready: !loading && user !== null };
}
