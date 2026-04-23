// One-off probe: validates that the saved `divahub.apiKey` secret + the
// `divahub.outbound` URL setting authenticate against the live DivaHub
// Divinha public API. Runs three checks:
//   1. Secret + URL present; key hint (first 6 + last 3) matches j3H9h2…jIQ.
//   2. GET /api/public/divinha/health (unauthenticated) returns ok:true.
//   3. POST /api/public/divinha/turn (authenticated, Accept: application/json
//      for a deterministic single-doc response) returns a turnId.
//
// Usage: tsx scripts/validate-divinha.ts

import { prisma } from "../lib/db";
import { getSecret } from "../lib/settings/config";
import { getSetting } from "../lib/settings";

const EXPECTED_HINT = "j3H9h2…jIQ"; // from the DivaHub delivery note

function hint(key: string): string {
  return key.length > 8 ? `${key.slice(0, 6)}…${key.slice(-3)}` : "…";
}

async function main() {
  const failures: string[] = [];

  console.log("— Step 1 — load stored credentials");
  const [apiKey, outbound] = await Promise.all([
    getSecret("divahub.apiKey"),
    getSetting("divahub.outbound"),
  ]);

  if (!apiKey) {
    failures.push("divahub.apiKey secret is not set");
  } else {
    const h = hint(apiKey);
    const match = h === EXPECTED_HINT;
    console.log(`  key hint:     ${h}${match ? "  ✅ matches" : `  ❌ expected ${EXPECTED_HINT}`}`);
    if (!match) failures.push(`key hint mismatch (got ${h}, expected ${EXPECTED_HINT})`);
  }

  const rawUrl = outbound.url?.trim() ?? "";
  // Normalise: drop trailing slash + trailing /api — the contract's paths
  // already include /api/public/... so the stored setting should be just
  // the origin. Probe defensively so we can tell the key error from the
  // URL error even if the admin setting has a stale suffix.
  const url = rawUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  if (!rawUrl) {
    failures.push("divahub.outbound.url is not set — go to /admin/configuracoes → DivaHub");
  } else {
    console.log(`  outbound url: ${rawUrl}${rawUrl !== url ? `  (normalised → ${url})` : ""}`);
    if (rawUrl !== url) {
      failures.push(`outbound url has a stale suffix — admin should be set to ${url}`);
    }
  }

  if (!apiKey || !url) {
    console.log("\nStopping early — fix the above before running the HTTP checks.");
    console.log(`\nResult: ${failures.length} failure(s):\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  // Don't block HTTP checks on a URL-suffix warning; the normalised url is
  // usable. Key-hint warnings are also non-blocking — we still want to know
  // whether DivaHub accepts the key we actually have.

  console.log("\n— Step 2 — GET /api/public/divinha/health (no auth)");
  {
    const t0 = Date.now();
    const res = await fetch(`${url}/api/public/divinha/health`, {
      headers: { Accept: "application/json" },
    });
    const dt = Date.now() - t0;
    const body = await res.text();
    console.log(`  status: ${res.status} (${dt} ms)`);
    console.log(`  body:   ${body.slice(0, 400)}`);
    if (res.status !== 200) failures.push(`/health returned ${res.status}`);
    try {
      const parsed = JSON.parse(body);
      if (parsed.ok !== true) failures.push(`/health returned ok=${parsed.ok}`);
    } catch {
      failures.push("/health body was not valid JSON");
    }
  }

  console.log("\n— Step 3 — POST /api/public/divinha/turn (authenticated, JSON fallback)");
  {
    const reqId = crypto.randomUUID();
    const payload = {
      conversationId: null,
      channel: "storefront_web",
      locale: "pt-BR",
      user: {
        customerId: null,
        sessionKey: "probe_validate_divinha_local",
        email: null,
        firstName: null,
        isAuthenticated: false,
      },
      message: {
        id: `msg_probe_${Date.now()}`,
        role: "user",
        content: "Oi, só um teste — responde com algo curto.",
        attachments: [],
      },
      cartSnapshot: {
        items: [],
        subtotalCents: 0,
        couponCode: null,
        currency: "BRL",
      },
      context: {
        referrerPath: "/probe",
        viewedProductSlug: null,
        utmSource: "probe_script",
        deviceHint: "desktop",
      },
      history: [],
    };

    const t0 = Date.now();
    const res = await fetch(`${url}/api/public/divinha/turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Brilho-Request-Id": reqId,
        "X-Brilho-Version": "1",
      },
      body: JSON.stringify(payload),
    });
    const dt = Date.now() - t0;
    const body = await res.text();
    console.log(`  status:     ${res.status} (${dt} ms)`);
    console.log(`  request id: ${reqId}`);
    console.log(`  body:       ${body.slice(0, 1200)}${body.length > 1200 ? " …(truncated)" : ""}`);

    if (res.status !== 200) {
      failures.push(`/turn returned ${res.status}`);
    } else {
      try {
        const parsed = JSON.parse(body);
        if (!parsed.turnId) failures.push("/turn response missing turnId");
        if (!parsed.conversationId) failures.push("/turn response missing conversationId");
        if (!Array.isArray(parsed.messages)) failures.push("/turn response missing messages[]");
        if (!Array.isArray(parsed.actions)) failures.push("/turn response missing actions[]");
      } catch {
        failures.push("/turn body was not valid JSON");
      }
    }
  }

  console.log("\n— Result —");
  if (failures.length === 0) {
    console.log("✅ All checks passed. Divinha public API is reachable and authenticated.");
  } else {
    console.log(`❌ ${failures.length} failure(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Probe crashed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
