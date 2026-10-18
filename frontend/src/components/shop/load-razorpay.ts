"use client";

// Loads Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js) once per page.

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayFailureResponse = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
};

export type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  /** Logo shown in the checkout header: an https URL or a base64 data URL. */
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  /** Checkout display customisation (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/). */
  config?: {
    display: {
      blocks?: Record<string, { name: string; instruments: { method: string; flows?: string[]; apps?: string[] }[] }>;
      sequence?: string[];
      preferences?: { show_default_blocks?: boolean };
    };
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
};

export type RazorpayInstance = {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", callback: (response: RazorpayFailureResponse) => void) => void;
};

export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let pending: Promise<RazorpayConstructor> | null = null;

let logo: Promise<string | undefined> | null = null;

/**
 * The store logo as a data URL. Razorpay renders it inside its own https iframe,
 * so a data URL works everywhere (including http://localhost in development).
 */
export function loadRazorpayLogo(): Promise<string | undefined> {
  logo ??= fetch("/razorpay-logo.png")
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`logo ${res.status}`))))
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => {
      logo = null;
      return undefined; // Checkout falls back to the store initial.
    });
  return logo;
}

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay can only load in the browser"));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (pending) return pending;

  pending = new Promise<RazorpayConstructor>((resolve, reject) => {
    const fail = () => {
      pending = null;
      reject(new Error("Could not load the Razorpay checkout. Check your connection and try again."));
    };
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener("load", () => (window.Razorpay ? resolve(window.Razorpay) : fail()), { once: true });
    script.addEventListener("error", () => {
      script?.remove();
      fail();
    }, { once: true });
  });
  return pending;
}
