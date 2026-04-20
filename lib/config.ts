// Single source of truth for the storefront's public URL.
// Override per-environment via SITE_URL in .env.local.
export const SITE_URL = (
  process.env.SITE_URL ?? "https://loja.brilhodediva.com.br"
).replace(/\/$/, "");
