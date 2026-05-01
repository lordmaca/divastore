import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { mirrorImageIfExternal } from "../lib/integration/divahub/image-mirror";

// Backfill: HeroSlide rows whose imageUrl is NOT on our public bucket get
// re-fetched and mirrored. DivaHub ships pre-signed OCI URLs with a 7-day
// TTL; once expired the upstream returns 403 and the bytes are unrecoverable
// from here. Run this while the signature is still valid.
//
// Safe to re-run — mirrorImageIfExternal is a no-op for URLs already on our
// base, and rows with a still-external URL whose fetch fails are left alone.
//
// Usage: npx tsx --env-file=.env.local scripts/mirror-hero-slides.ts

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const OUR_BASE = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const onlyExternal = OUR_BASE
    ? { imageUrl: { not: { startsWith: OUR_BASE } } }
    : {};
  const slides = await prisma.heroSlide.findMany({
    where: onlyExternal,
    orderBy: { createdAt: "asc" },
  });
  console.log(`found ${slides.length} hero slides to mirror`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const slide of slides) {
    const newUrl = await mirrorImageIfExternal(
      slide.imageUrl,
      `hero/${slide.externalId}`,
      0,
    );
    if (newUrl === slide.imageUrl) {
      skipped++;
      console.warn(`skipped (likely 403/expired): ${slide.externalId}`);
      continue;
    }
    if (OUR_BASE && !newUrl.startsWith(OUR_BASE)) {
      failed++;
      console.warn(`mirror failed, left as-is: ${slide.externalId}`);
      continue;
    }
    await prisma.heroSlide.update({
      where: { id: slide.id },
      data: { imageUrl: newUrl },
    });
    ok++;
    console.log(`mirrored ${slide.externalId}`);
  }
  console.log(`done — ok=${ok} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
