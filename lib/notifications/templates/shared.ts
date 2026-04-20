import { SITE_URL } from "@/lib/config";

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
  return `Olá, ${first}`;
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
  const cta =
    ctaLabel && ctaUrl
      ? `<p style="text-align:center;margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#ec4899;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;">${ctaLabel}</a></p>`
      : "";
  const footer = footerNote
    ? `<p style="color:#9ca3af;font-size:12px;margin-top:24px;">${footerNote}</p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#faf5ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:linear-gradient(180deg,#ffffff 0%,#fdf4ff 100%);border-radius:24px;padding:32px;box-shadow:0 1px 0 rgba(236,72,153,0.08);">
    <p style="text-align:center;margin:0 0 24px 0;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:28px;color:#be185d;">Brilho de Diva</span>
    </p>
    <h1 style="margin:0 0 16px 0;font-size:22px;color:#be185d;text-align:center;">${headline}</h1>
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
