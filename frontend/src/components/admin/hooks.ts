"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useStoreConfig } from "@/components/providers";

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
type Settled<T> = {
  /** Path + version of the request that settled last. */
  path: string;
  version: number;
  error: unknown;
  /** Last successful data and the path it belongs to. */
  data: T | undefined;
  dataPath: string | null;
};

export type ApiQuery<T> = {
  /** Latest data. With `keepPrevious`, the last successful result is held while a new one loads. */
  data: T | undefined;
  /** Error of the most recent request for the current path (cleared while refetching). */
  error: unknown;
  /** True until the first response for the current path arrives and there is nothing to show. */
  isLoading: boolean;
  /** True whenever a request for the current path/version is in flight. */
  isFetching: boolean;
  reload: () => void;
  /** Locally replace the data (after a mutation that returned fresh data). */
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
};

/**
 * Fetches `path` (already including its query string) with `api()` whenever it
 * changes. Pass `null` to skip. No setState happens synchronously inside the
 * effect; loading flags are derived from what has settled.
 */
export function useApiQuery<T>(path: string | null, { keepPrevious = true } = {}): ApiQuery<T> {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path).then(
      (data) => {
        if (!cancelled) setSettled({ path, version, error: undefined, data, dataPath: path });
      },
      (error: unknown) => {
        // Keep the last good data so the frame doesn't collapse on a failed refetch.
        if (!cancelled)
          setSettled((prev) => ({ path, version, error, data: prev?.data, dataPath: prev?.dataPath ?? null }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const isFetching = path !== null && (!settled || settled.path !== path || settled.version !== version);
  const data = settled && (settled.dataPath === path || keepPrevious) ? settled.data : undefined;
  return {
    data,
    error: !isFetching ? settled?.error : undefined,
    isLoading: isFetching && data === undefined,
    isFetching,
    reload: () => setVersion((v) => v + 1),
    setData: (updater) => setSettled((prev) => (prev ? { ...prev, data: updater(prev.data) } : prev)),
  };
}

// ---------------------------------------------------------------------------
// URL search params as filter state
// ---------------------------------------------------------------------------
export function useUrlState() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const get = (key: string) => searchParams.get(key) ?? "";
  const page = Math.max(1, Number.parseInt(get("page"), 10) || 1);

  /** Applies updates (empty values are removed). Resets `page` unless `keepPage`. */
  const update = (updates: Record<string, string | number | null | undefined>, opts: { keepPage?: boolean } = {}) => {
    // Read the live URL so debounced calls never resurrect stale params.
    const next = new URLSearchParams(typeof window === "undefined" ? searchParams.toString() : window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    if (!opts.keepPage) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return { searchParams, get, page, update, hrefFor };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Sets a specific document title for the current admin page. */
export function useAdminTitle(title: string | null | undefined) {
  const { storeName } = useStoreConfig();
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Admin | ${storeName}`;
  }, [title, storeName]);
}

/** Calls `onEscape` when Escape is pressed while `active`. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}

/** Warns before closing/reloading the tab while `dirty`. */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
