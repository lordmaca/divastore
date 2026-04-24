// One-off ops: normalise the stored DivaHub outbound URL (drop stale /api
// suffix) and flip the divinha.enabled kill switch to true. Run once to
// complete the go-live; afterwards the admin toggles via /admin/configuracoes.

import { prisma } from "../lib/db";
import { getSetting, setSetting } from "../lib/settings";

async function main() {
  const outbound = await getSetting("divahub.outbound");
  const clean = outbound.url.replace(/\/+$/, "").replace(/\/api$/, "");
  if (outbound.url !== clean) {
    await setSetting("divahub.outbound", { url: clean }, "ops:enable-divinha");
    console.log(`outbound url: ${outbound.url} → ${clean}`);
  } else {
    console.log(`outbound url: ${outbound.url} (unchanged)`);
  }

  await setSetting("divinha.enabled", { enabled: true }, "ops:enable-divinha");
  console.log("divinha.enabled: true");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
