import { SITE_URL } from "@/lib/config";
import { safeExternalUrl } from "@/lib/url";

// HTML-escape for email template interpolation. Every customer-sourced
// value (name, address recipient, tracking code, reason, invoice number)
// passes through this before entering `bodyHtml`. Without it, a hostile
// signup name like `<img src=x onerror=...>` renders in the admin inbox
// on every order email.
export function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-export under the email-specific name so existing template imports
// keep working. The shared implementation lives in lib/url.ts so email
// templates and web `<a href>` render paths share the same allowlist.
export const safeEmailUrl = safeExternalUrl;

// Money: we store cents; templates render pt-BR BRL.
export function brl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// pt-BR date: "17 de abril de 2026"
export function formatDatePtBr(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function greeting(name?: string | null): string {
  if (!name) return "Olá, Diva";
  const first = name.trim().split(/\s+/)[0];
  // Output always HTML-safe — callers splice directly into bodyHtml.
  return `Olá, ${escapeHtml(first)}`;
}

export function absoluteUrl(path: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Minimal HTML shell shared by every transactional template. Keeps the
// lavender→pink brand, uses web-safe Georgia-ish serif for the wordmark
// headline (Dancing Script isn't reliable in email clients).
export function renderShell(opts: {
  preheader: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const { preheader, headline, bodyHtml, ctaLabel, ctaUrl, footerNote } = opts;
  // Escape preheader + headline (rendered on the email client), CTA label
  // (arbitrary string in some templates). CTA URL passes through
  // `safeEmailUrl` so a malicious `javascript:` scheme can't slip in via
  // admin-editable trackingUrl / invoice danfeUrl. bodyHtml is the
  // template's own responsibility — it receives already-escaped fields.
  const safeHeadline = escapeHtml(headline);
  const safePreheader = escapeHtml(preheader);
  const cta =
    ctaLabel && ctaUrl
      ? `<p style="text-align:center;margin:32px 0;"><a href="${escapeHtml(safeEmailUrl(ctaUrl))}" style="display:inline-block;background:#ec4899;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;">${escapeHtml(ctaLabel)}</a></p>`
      : "";
  // footerNote is callable-owned HTML (currently: the abandoned-cart
  // unsubscribe link, built from the already-sanitized `d.unsubscribeUrl`).
  // Do NOT escape it here — callers are responsible for sanitizing the
  // dynamic parts they splice in, same contract as `bodyHtml`.
  const footer = footerNote
    ? `<p style="color:#9ca3af;font-size:12px;margin-top:24px;">${footerNote}</p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeHeadline}</title>
</head>
<body style="margin:0;padding:0;background:#faf5ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:linear-gradient(180deg,#ffffff 0%,#fdf4ff 100%);border-radius:24px;padding:32px;box-shadow:0 1px 0 rgba(236,72,153,0.08);">
    <p style="text-align:center;margin:0 0 24px 0;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:28px;color:#be185d;">Brilho de Diva</span>
    </p>
    <h1 style="margin:0 0 16px 0;font-size:22px;color:#be185d;text-align:center;">${safeHeadline}</h1>
    <div style="font-size:15px;line-height:1.55;">${bodyHtml}</div>
    ${cta}
    ${footer}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">
    Brilho de Diva · Realce sua Beleza, Brilhe como uma Diva!
  </p>
</div>
</body>
</html>`;
}
