import type { NextConfig } from "next";

// Security headers applied to every route. Clickjacking, MIME-sniffing, and
// mixed-content downgrade are all covered at the app layer so an nginx
// rewrite can't accidentally drop them.
//
// CSP is shipped in report-only mode first — `Content-Security-Policy-
// Report-Only` — so browsers evaluate + log violations to the console
// without breaking anything we missed. Flip to enforcing once we've
// watched a few real sessions with no unexpected violations. YouTube
// embeds (Divinha product videos + /sobre media) and the Mercado Pago
// redirect are both top-level navigations, so frame-ancestors 'self' is
// the tightest policy that still lets our own UI render.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Tailwind-generated + shadcn-style inline styles in server-rendered HTML.
  "style-src 'self' 'unsafe-inline'",
  // Fonts loaded from self (next/font ships them through /_next/static/).
  "font-src 'self' data:",
  // Images: own origin, the OCI public + DivaHub asset buckets, Unsplash
  // for placeholder hero, data: for favicons/inline SVG.
  "img-src 'self' data: blob: https://*.oraclecloud.com https://images.unsplash.com https://*.brilhodediva.com.br",
  // Scripts: self only. No inline, no eval. If we ever add GA/FB Pixel,
  // whitelist explicitly here — don't relax to 'unsafe-inline'.
  "script-src 'self'",
  // XHR / fetch: self + the three integrations the browser might talk to
  // (all of ours go through the BFF so this is conservative).
  "connect-src 'self' https://*.brilhodediva.com.br",
  // YouTube embeds inside product pages and /sobre.
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  // Who can frame us: only ourselves. Blocks clickjacking on checkout.
  "frame-ancestors 'self'",
  // No Flash/plug-ins.
  "object-src 'none'",
  // Forms must post back to our own origin — prevents a compromised form
  // handler from leaking a checkout body off-site.
  "form-action 'self' https://*.mercadopago.com.br https://*.mercadopago.com",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  // Report-only for the first deploy so we catch false positives before
  // enforcing. Swap to `Content-Security-Policy` once logs are clean.
  { key: "Content-Security-Policy-Report-Only", value: CSP_DIRECTIVES },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // OCI Object Storage native endpoint — sa-saopaulo-1.
      { protocol: "https", hostname: "objectstorage.sa-saopaulo-1.oraclecloud.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
