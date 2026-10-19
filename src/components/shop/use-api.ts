"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type State<T> = { key: string | null; data: T | undefined; error: unknown };

/**
 * Fetches `path` with the browser API client whenever it changes.
 * Pass `null` to skip (e.g. while the session is still loading).
 * `loading` is derived (no synchronous setState inside the effect).
 */
export function useApi<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State<T>>({ key: null, data: undefined, error: null });
  const key = path === null ? null : `${path}#${nonce}`;

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    const requestKey = `${path}#${nonce}`;
    api<T>(path).then(
      (data) => {
        if (!cancelled) setState({ key: requestKey, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setState((s) => ({ key: requestKey, data: s.data, error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  /** Replace the cached data (e.g. with the response of a mutation). */
  const mutate = useCallback(
    (updater: T | ((prev: T | undefined) => T)) =>
      setState((s) => ({
        ...s,
        data: typeof updater === "function" ? (updater as (prev: T | undefined) => T)(s.data) : updater,
      })),
    [],
  );

  const settled = key !== null && state.key === key;
  return {
    data: state.data,
    error: settled ? state.error : null,
    /** true while the current request is in flight */
    loading: key !== null && !settled,
    notFound: settled && state.error instanceof ApiError && state.error.status === 404,
    unauthorized: settled && state.error instanceof ApiError && state.error.status === 401,
    reload,
    mutate,
  };
}
