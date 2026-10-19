// Store policy pages. Payment gateways (Razorpay in particular) require these
// pages to be live before activating an account.
//
// NOTE FOR THE STORE OWNER: this is starting-point text. Review and adapt it
// (ideally with a legal advisor) to match how your business actually operates.
import { formatPrice } from "@/lib/format";
import type { StoreConfig } from "@/lib/types";

export type Policy = {
  slug: string;
  title: string;
  summary: string;
  sections: (config: StoreConfig) => { heading: string; body: React.ReactNode }[];
};

function contactLine(config: StoreConfig) {
  const parts = [config.supportEmail && `email ${config.supportEmail}`, config.supportPhone && `call ${config.supportPhone}`].filter(Boolean);
  return parts.length ? parts.join(" or ") : "use the contact details on our Contact page";
}

export const POLICIES: Policy[] = [
  {
    slug: "shipping",
    title: "Shipping policy",
    summary: "Where we deliver, how long it takes and what it costs.",
    sections: (c) => [
      {
        heading: "Delivery areas",
        body: (
          <p>
            We ship to serviceable PIN codes across India through our courier partners. Milk-based and syrup sweets with a
            short shelf life may only be available for delivery to nearby cities; this is shown on the product page.
          </p>
        ),
      },
      {
        heading: "Freshness and packing",
        body: (
          <p>
            Sweets and snacks are prepared in small batches and packed in food-grade, sealed packaging shortly before dispatch.
            Each pack shows its best-before date. Please refrigerate milk-based sweets on arrival.
          </p>
        ),
      },
      {
        heading: "Shipping charges",
        body: (
          <p>
            {c.freeShippingThreshold > 0 ? (
              <>
                Shipping is free on orders of {formatPrice(c.freeShippingThreshold)} or more. Smaller orders have a flat
                shipping charge of {formatPrice(c.shippingFee)}, shown at checkout before you pay.
              </>
            ) : (
              <>Shipping charges, if any, are shown at checkout before you pay.</>
            )}
          </p>
        ),
      },
      {
        heading: "Dispatch and delivery times",
        body: (
          <p>
            Orders are usually prepared and dispatched within 1–2 business days of payment confirmation. Delivery typically
            takes 2–6 business days depending on your location. You&apos;ll receive an email with the courier name and tracking
            number when your order ships, and you can follow it from <em>My account → Orders</em>.
          </p>
        ),
      },
      {
        heading: "Delays",
        body: (
          <p>
            Courier delays caused by weather, holidays or other events outside our control can happen. If your order hasn&apos;t
            arrived within 10 business days, please {contactLine(c)}.
          </p>
        ),
      },
    ],
  },
  {
    slug: "refunds",
    title: "Returns & refunds",
    summary: "What to do if something isn't right with your order.",
    sections: (c) => [
      {
        heading: "Food items can't be returned",
        body: (
          <p>
            For hygiene and food-safety reasons, sweets and snacks cannot be returned once delivered, unless they arrive
            damaged, spoiled or different from what you ordered.
          </p>
        ),
      },
      {
        heading: "Damaged, spoiled or wrong items",
        body: (
          <p>
            If a pack arrives damaged, tampered with, spoiled before its best-before date, or isn&apos;t what you ordered,{" "}
            {contactLine(c)} within 24 hours of delivery with your order number and photos of the product and packaging.
            We&apos;ll send a fresh replacement or give you a full refund for the affected items.
          </p>
        ),
      },
      {
        heading: "Cancellations",
        body: (
          <p>
            Unpaid orders can be cancelled from your order page. Paid orders can be cancelled by contacting us before they are
            prepared for dispatch. Custom and bulk orders can&apos;t be cancelled once preparation has started.
          </p>
        ),
      },
      {
        heading: "Refunds",
        body: (
          <p>
            Approved refunds are issued to the original payment method (UPI, card, net banking or wallet) within 5–7 business
            days. Your bank may take a few additional days to reflect the credit.
          </p>
        ),
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    summary: "What information we collect and how we use it.",
    sections: (c) => [
      {
        heading: "Information we collect",
        body: (
          <p>
            Your mobile number (to log you in with a one-time password), your name, email address and delivery addresses, and
            details of the orders you place. Payments are processed by Razorpay or Stripe; we never see or store your full card
            details.
          </p>
        ),
      },
      {
        heading: "How we use it",
        body: (
          <p>
            To process and deliver your orders, send order updates, provide customer support, prevent fraud, and improve our store.
            We do not sell your personal information.
          </p>
        ),
      },
      {
        heading: "Who we share it with",
        body: (
          <p>
            Only with service providers who help us run the store: payment gateways, courier and logistics partners, and our SMS,
            email and hosting providers. They may use your information only to provide their service to us.
          </p>
        ),
      },
      {
        heading: "Cookies",
        body: <p>We use essential cookies to keep you logged in and to remember your cart. We don&apos;t use advertising cookies.</p>,
      },
      {
        heading: "Your choices",
        body: (
          <p>
            You can update your name, email and addresses from <em>My account</em>. To request a copy or deletion of your data,{" "}
            {contactLine(c)}.
          </p>
        ),
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms & conditions",
    summary: "The terms that apply when you use our store.",
    sections: (c) => [
      {
        heading: "About these terms",
        body: (
          <p>
            By using this website and placing an order with {c.storeName}, you agree to these terms, together with our shipping,
            returns and privacy policies.
          </p>
        ),
      },
      {
        heading: "Orders and pricing",
        body: (
          <p>
            All prices are in Indian Rupees and inclusive of applicable taxes. Weights shown are net weights; product photos
            are for illustration and handmade items may vary slightly. An order is confirmed only once payment is received.
            Unpaid orders are released automatically after a short time. We may cancel an order and refund you in full if an item
            becomes unavailable or was listed at an incorrect price.
          </p>
        ),
      },
      {
        heading: "Your account",
        body: (
          <p>
            You log in with a one-time password sent to your mobile number. Keep access to your phone secure and don&apos;t share
            login codes with anyone. We may suspend accounts that are used fraudulently.
          </p>
        ),
      },
      {
        heading: "Ingredients and allergens",
        body: (
          <p>
            Ingredients are listed on each product page and pack. Our kitchen handles milk, nuts, sesame, wheat and peanuts, so
            any product may contain traces of these.
          </p>
        ),
      },
      {
        heading: "Bulk orders",
        body: <p>Bulk, wedding and corporate orders placed through WhatsApp or the bulk enquiry form are subject to a separate written quote.</p>,
      },
      {
        heading: "Contact",
        body: <p>Questions about these terms? Please {contactLine(c)}.</p>,
      },
    ],
  },
];

export function findPolicy(slug: string) {
  return POLICIES.find((p) => p.slug === slug) ?? null;
}
