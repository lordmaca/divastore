import { SITE_URL } from "@/lib/config";

// Accept an admin/upstream-supplied URL string and return it only if the
// scheme is safe to render in a browser `<a href>` or email CTA. Rejects
// `javascript:`, `data:`, `vbscript:`, `file:` etc. that would execute on
// click. Allowed: `https:`, `http:`, `mailto:`, and relative paths (which
// resolve on our origin).
//
// Used by:
//   - Email templates (trackingUrl, invoice danfeUrl/xmlUrl, unsubscribe)
//   - Order detail page in /minha-conta (same fields rendered as <a href>)
//
// Anything else returns `fallback` (default: site home). That's safer than
// throwing — the surrounding render keeps working with a harmless click
// target instead of crashing an email send or a page SSR.
export function safeExternalUrl(
  raw: string | null | undefined,
  fallback: string = SITE_URL,
): string {
  if (!raw) return fallback;
  const s = String(raw).trim();
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:" && u.protocol !== "mailto:") {
      return fallback;
    }
    return s;
  } catch {
    if (s.startsWith("/")) return s;
    return fallback;
  }
}
