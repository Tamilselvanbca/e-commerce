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
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
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
