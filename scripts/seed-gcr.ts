// One-off: enable Google Customer Reviews + set the merchant id given by
// the user (5777940112). Idempotent — running twice is a no-op.

import { prisma } from "../lib/db";
import { setSetting } from "../lib/settings";

async function main() {
  await setSetting(
    "integrations.googleCustomerReviews",
    { enabled: true, merchantId: 5777940112 },
    "ops:seed-gcr",
  );
  console.log("integrations.googleCustomerReviews enabled with merchantId=5777940112");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
