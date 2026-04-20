"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Client-side beacon. Posts to /api/track on every route change in the (shop)
// layout. Uses navigator.sendBeacon when available so it survives navigation.
//
// The server side enforces same-origin + rate-limit + DNT — the client just
// produces the payload. We still respect DNT here to skip the request entirely.
export function Track({ productId }: { productId?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (navigator.doNotTrack === "1") return;

    const key = `${pathname}?${search?.toString() ?? ""}`;
    if (lastFired.current === key) return;
    lastFired.current = key;

    const payload = {
      path: pathname,
      productId: productId ?? null,
      referer: document.referrer || null,
      device: matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop",
      utmSource: search?.get("utm_source") ?? null,
      utmMedium: search?.get("utm_medium") ?? null,
      utmCampaign: search?.get("utm_campaign") ?? null,
    };
    const body = JSON.stringify(payload);

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/track", blob);
      } else {
        fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true })
          .catch(() => undefined);
      }
    } catch {
      // analytics must never break the page
    }
  }, [pathname, search, productId]);

  return null;
}
