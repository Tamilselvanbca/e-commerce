"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Cart, StoreConfig, User } from "@/lib/types";

// ---------------------------------------------------------------------------
// Store config (fetched once on the server in the root layout)
// ---------------------------------------------------------------------------
const ConfigContext = createContext<StoreConfig | null>(null);

export function useStoreConfig(): StoreConfig {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useStoreConfig must be used inside <Providers>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
type ToastApi = {
  success: (message: string) => void;
  error: (messageOrError: unknown) => void;
  info: (message: string) => void;
};
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Providers>");
  return ctx;
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={
            "pointer-events-auto w-full max-w-sm rounded-lg px-4 py-3 text-left text-sm font-medium shadow-lg ring-1 " +
            (t.tone === "error"
              ? "bg-red-600 text-white ring-red-700"
              : t.tone === "success"
                ? "bg-brand-700 text-white ring-brand-800"
                : "bg-white text-zinc-900 ring-zinc-200")
          }
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
type AuthState = {
  user: User | null;
  /** true until the first /auth/me request finishes */
  loading: boolean;
  /** Re-fetches the current user (call after login / profile update). */
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <Providers>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
type CartState = {
  cart: Cart;
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (variantId: string, quantity?: number) => Promise<Cart>;
  updateItem: (itemId: string, quantity: number) => Promise<Cart>;
  removeItem: (itemId: string) => Promise<Cart>;
  clear: () => Promise<void>;
  /** Replace local state with a cart returned by another endpoint. */
  setCart: (cart: Cart) => void;
};
const EMPTY_CART: Cart = { id: null, items: [], itemCount: 0, subtotal: 0 };
const CartContext = createContext<CartState | null>(null);

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <Providers>");
  return ctx;
}

// ---------------------------------------------------------------------------
export function Providers({ config, children }: { config: StoreConfig; children: React.ReactNode }) {
  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (message: string, tone: Toast["tone"]) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
    },
    [dismiss],
  );
  const toast = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, "success"),
      info: (m) => push(m, "info"),
      error: (e) => push(typeof e === "string" ? e : errorMessage(e), "error"),
    }),
    [push],
  );

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api<{ user: User | null }>("/auth/me");
      setUser(user);
      return user;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      setUser(null);
      return null;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Cart
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [cartLoading, setCartLoading] = useState(true);
  const refreshCart = useCallback(async () => {
    try {
      setCart(await api<Cart>("/cart"));
    } catch (err) {
      console.error(err);
    } finally {
      setCartLoading(false);
    }
  }, []);

  // Initial load of the session user and cart.
  useEffect(() => {
    let cancelled = false;
    api<{ user: User | null }>("/auth/me")
      .then(({ user }) => !cancelled && setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => !cancelled && setAuthLoading(false));
    api<Cart>("/cart")
      .then((c) => !cancelled && setCart(c))
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setCartLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setCart(EMPTY_CART);
  }, []);

  const auth = useMemo<AuthState>(
    () => ({ user, loading: authLoading, refresh: refreshUser, setUser, logout }),
    [user, authLoading, refreshUser, logout],
  );

  const cartState = useMemo<CartState>(
    () => ({
      cart,
      loading: cartLoading,
      refresh: refreshCart,
      setCart,
      addItem: async (variantId, quantity = 1) => {
        const next = await api<Cart>("/cart/items", { method: "POST", body: { variantId, quantity } });
        setCart(next);
        return next;
      },
      updateItem: async (itemId, quantity) => {
        const next = await api<Cart>(`/cart/items/${itemId}`, { method: "PATCH", body: { quantity } });
        setCart(next);
        return next;
      },
      removeItem: async (itemId) => {
        const next = await api<Cart>(`/cart/items/${itemId}`, { method: "DELETE" });
        setCart(next);
        return next;
      },
      clear: async () => {
        setCart(await api<Cart>("/cart", { method: "DELETE" }));
      },
    }),
    [cart, cartLoading, refreshCart],
  );

  return (
    <ConfigContext.Provider value={config}>
      <ToastContext.Provider value={toast}>
        <AuthContext.Provider value={auth}>
          <CartContext.Provider value={cartState}>
            {children}
            <ToastViewport toasts={toasts} dismiss={dismiss} />
          </CartContext.Provider>
        </AuthContext.Provider>
      </ToastContext.Provider>
    </ConfigContext.Provider>
  );
}
