// SSRF guard for outbound fetch() calls whose URL/host comes from admin-
// editable settings. Without this, a compromised admin could point Tiny,
// Melhor Envio, or the DivaHub client at `http://169.254.169.254/` (cloud
// metadata), `http://127.0.0.1:…` (internal services), or a capture
// domain under their control.
//
// Each adapter defines its own allowlist. The guard:
//   1. Requires https://
//   2. Requires the hostname to exactly match one of the allowed hosts.
//   3. Refuses URLs whose hostname resolves to a raw IPv4/IPv6 literal.
//
// On violation the guard throws an Error — callers should wrap the fetch
// in try/catch (all three adapters already do) and log to IntegrationRun
// so the admin sees the misconfiguration.

export type SsrfAllowlist = {
  // Human label for the adapter — used only in error messages.
  label: string;
  // Exact hostnames allowed. Wildcards are expressed as entries in the
  // array (e.g. both "melhorenvio.com.br" and "sandbox.melhorenvio.com.br").
  hosts: readonly string[];
};

export function assertAllowedUrl(raw: string, allow: SsrfAllowlist): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${allow.label}: malformed URL "${raw}"`);
  }
  if (u.protocol !== "https:") {
    throw new Error(
      `${allow.label}: only https:// is allowed, got "${u.protocol}" in "${raw}"`,
    );
  }
  // IP literals (IPv4 dotted, IPv6 in brackets, or IPv6 containing colon)
  // are never allowed. Real providers give us hostnames.
  const host = u.hostname;
  const looksLikeIp =
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":") || host === "localhost";
  if (looksLikeIp) {
    throw new Error(`${allow.label}: IP literal / localhost host "${host}" rejected`);
  }
  const lower = host.toLowerCase();
  const ok = allow.hosts.some(
    (h) => lower === h.toLowerCase() || lower.endsWith(`.${h.toLowerCase()}`),
  );
  if (!ok) {
    throw new Error(
      `${allow.label}: host "${host}" not in allowlist [${allow.hosts.join(", ")}]`,
    );
  }
  return u;
}

// Named allowlists for the three admin-editable integrations. Tight on
// purpose: add a host here explicitly when onboarding a new environment,
// rather than relaxing the checker.
export const TINY_ALLOW: SsrfAllowlist = {
  label: "Tiny",
  hosts: ["api.tiny.com.br", "erp.tiny.com.br"],
};
export const MELHORENVIO_ALLOW: SsrfAllowlist = {
  label: "MelhorEnvio",
  hosts: ["melhorenvio.com.br", "sandbox.melhorenvio.com.br"],
};
export const DIVAHUB_ALLOW: SsrfAllowlist = {
  label: "DivaHub",
  hosts: ["divahub.brilhodediva.com.br", "staging.divahub.brilhodediva.com.br"],
};
