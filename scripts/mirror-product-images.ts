import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { mirrorImageIfExternal } from "../lib/integration/divahub/image-mirror";

// Backfill script: for each Image row whose URL is NOT on our public base,
// re-fetch + mirror into our bucket and update the row.
// Safe to re-run — mirrorImageIfExternal is a no-op for URLs already on our base.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const OUR_BASE = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const onlyExternal = OUR_BASE
    ? { url: { not: { startsWith: OUR_BASE } } }
    : {};
  const images = await prisma.image.findMany({
    where: onlyExternal,
    include: { product: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`found ${images.length} images to mirror`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const img of images) {
    const newUrl = await mirrorImageIfExternal(img.url, img.product.slug, img.position);
    if (newUrl === img.url) {
      skipped++;
      continue;
    }
    if (OUR_BASE && !newUrl.startsWith(OUR_BASE)) {
      failed++;
      console.warn("mirror failed, left as-is:", img.product.slug, img.position);
      continue;
    }
    await prisma.image.update({ where: { id: img.id }, data: { url: newUrl } });
    ok++;
    console.log(`mirrored ${img.product.slug}#${img.position}`);
  }
  console.log(`done — ok=${ok} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
