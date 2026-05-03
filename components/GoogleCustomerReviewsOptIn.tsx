"use client";

import { useEffect } from "react";

// Google Customer Reviews opt-in popup. Renders the Google APIs platform
// loader and calls `gapi.surveyoptin.render()` with the order details so
// Google can ask the customer if they want to receive a post-purchase
// survey by email.
//
// Only mount this component when the order is APPROVED — Google rejects
// opt-ins for pending/cancelled orders and may flag the merchant for
// repeated misuse. The success page enforces that gate before rendering.
//
// Privacy note: this DOES send the customer's email address to Google.
// Customers are opting in, but we should also mention it in the privacy
// policy when we add one. For now, the GCR docs cover the legal side.

type Props = {
  merchantId: number;
  orderId: string;
  email: string;
  // ISO YYYY-MM-DD — the date Google will use to time the survey email.
  estimatedDeliveryDate: string;
  // ISO 3166-1 alpha-2 country code (e.g. "BR"). Brazilian shipping = "BR".
  deliveryCountry: string;
};

declare global {
  interface Window {
    renderOptIn?: () => void;
    gapi?: {
      load: (module: string, cb: () => void) => void;
      surveyoptin?: {
        render: (opts: Record<string, unknown>) => void;
      };
    };
  }
}

export function GoogleCustomerReviewsOptIn(props: Props) {
  useEffect(() => {
    // Define the global callback that Google's loader expects to find at
    // `window.renderOptIn` after `?onload=renderOptIn` finishes loading.
    // Idempotent — clicking back+forward shouldn't double-render.
    if (window.renderOptIn) return;

    window.renderOptIn = function renderOptIn() {
      window.gapi?.load("surveyoptin", () => {
        window.gapi?.surveyoptin?.render({
          merchant_id: props.merchantId,
          order_id: props.orderId,
          email: props.email,
          delivery_country: props.deliveryCountry,
          estimated_delivery_date: props.estimatedDeliveryDate,
          // We deliberately omit `products: [...]` — Google's docs say
          // it's optional and we don't ship GTINs in our catalog
          // (identifier_exists=no in the Merchant feed).
        });
      });
    };

    // Inject the platform.js loader once. The `onload=renderOptIn`
    // search param tells gapi to call our callback when ready.
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-gcr-loader]",
    );
    if (existing) {
      // If the loader already finished while the previous mount was up,
      // call our callback directly — gapi.load is cheap to call again.
      window.renderOptIn();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/platform.js?onload=renderOptIn";
    script.async = true;
    script.defer = true;
    script.dataset.gcrLoader = "1";
    document.body.appendChild(script);

    // We never remove the loader — gapi caches its modules globally and a
    // remove-then-add pattern is more error-prone than just leaving it.
  }, [
    props.merchantId,
    props.orderId,
    props.email,
    props.deliveryCountry,
    props.estimatedDeliveryDate,
  ]);

  return null;
}
