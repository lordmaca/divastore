// One-off: backfill the youtube field on the existing about.page setting
// + normalise the Instagram value to the official handle the user gave.
// Idempotent — running twice is a no-op.

import { prisma } from "../lib/db";
import { getSetting, setSetting } from "../lib/settings";

async function main() {
  const cur = await getSetting("about.page");
  const next = {
    ...cur,
    contact: {
      ...cur.contact,
      instagram: cur.contact.instagram || "@brilhodedivaoficial",
      youtube:
        (cur.contact as { youtube?: string }).youtube ||
        "https://www.youtube.com/@BrilhodeDivaOficial",
    },
  };
  await setSetting("about.page", next, "ops:seed-social");
  console.log("about.page.contact updated:");
  console.log("  instagram:", next.contact.instagram);
  console.log("  youtube:  ", (next.contact as { youtube?: string }).youtube);
  console.log("  whatsapp: ", next.contact.whatsapp);
  console.log("  email:    ", next.contact.email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
