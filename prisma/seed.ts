import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hash } from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const IMG = (q: string) =>
  `https://images.unsplash.com/${q}?auto=format&fit=crop&w=900&q=80`;

async function main() {
  console.log("Seeding categories…");
  const colares = await prisma.category.upsert({
    where: { slug: "colares" },
    create: { slug: "colares", name: "Colares" },
    update: {},
  });
  const brincos = await prisma.category.upsert({
    where: { slug: "brincos" },
    create: { slug: "brincos", name: "Brincos" },
    update: {},
  });
  const aneis = await prisma.category.upsert({
    where: { slug: "aneis" },
    create: { slug: "aneis", name: "Anéis" },
    update: {},
  });

  const products = [
    {
      slug: "colar-laco-rose",
      name: "Colar Laço Rose",
      description:
        "Colar delicado folheado a ouro 18k com pingente de laço rose. Ajustável de 40cm a 45cm.",
      categoryId: colares.id,
      images: ["photo-1535632787350-4e68ef0ac584", "photo-1611591437281-460bfbe1220a"],
      variants: [
        { sku: "BD-CLR-001", name: "Único", priceCents: 18900, stock: 24, weightG: 8 },
      ],
    },
    {
      slug: "colar-corrente-veneziana",
      name: "Colar Corrente Veneziana",
      description: "Corrente veneziana banhada a ouro 18k. Caimento perfeito para o dia a dia.",
      categoryId: colares.id,
      images: ["photo-1599643477877-530eb83abc8e", "photo-1599643478518-a784e5dc4c8f"],
      variants: [
        { sku: "BD-CLV-040", name: "40 cm", priceCents: 14900, stock: 18, weightG: 6 },
        { sku: "BD-CLV-045", name: "45 cm", priceCents: 16900, stock: 12, weightG: 7 },
      ],
    },
    {
      slug: "brinco-argola-cravejada",
      name: "Brinco Argola Cravejada",
      description: "Argola pequena cravejada com zircônias. Brilho discreto e elegante.",
      categoryId: brincos.id,
      images: ["photo-1605100804763-247f67b3557e", "photo-1535632066927-ab7c9ab60908"],
      variants: [
        { sku: "BD-BAC-PP", name: "Pequena", priceCents: 12900, stock: 30, weightG: 3 },
        { sku: "BD-BAC-G", name: "Média", priceCents: 15900, stock: 22, weightG: 4 },
      ],
    },
    {
      slug: "brinco-gota-perola",
      name: "Brinco Gota com Pérola",
      description: "Brinco em formato de gota com pérola natural. Romântico e atemporal.",
      categoryId: brincos.id,
      images: ["photo-1611652022419-a9419f74343d", "photo-1602173574767-37ac01994b2a"],
      variants: [
        { sku: "BD-BGP-001", name: "Único", priceCents: 13900, stock: 16, weightG: 4 },
      ],
    },
    {
      slug: "anel-solitario-zirconia",
      name: "Anel Solitário Zircônia",
      description: "Anel solitário com zircônia central. Folheado a ouro 18k. Tamanhos 14 a 22.",
      categoryId: aneis.id,
      images: ["photo-1603561591411-07134e71a2a9", "photo-1574740169098-2bf26d6075d4"],
      variants: [
        { sku: "BD-ASZ-16", name: "Aro 16", priceCents: 9900, stock: 14, weightG: 3 },
        { sku: "BD-ASZ-18", name: "Aro 18", priceCents: 9900, stock: 12, weightG: 3 },
        { sku: "BD-ASZ-20", name: "Aro 20", priceCents: 9900, stock: 8, weightG: 3 },
      ],
    },
    {
      slug: "anel-coracao-rose",
      name: "Anel Coração Rose",
      description: "Anel ajustável com coração rosé. Banhado a ouro 18k.",
      categoryId: aneis.id,
      images: ["photo-1543295204-2ae345412549", "photo-1605100804763-247f67b3557e"],
      variants: [
        { sku: "BD-ACR-001", name: "Ajustável", priceCents: 7900, stock: 40, weightG: 2 },
      ],
    },
  ];

  for (const p of products) {
    console.log("Seeding product", p.slug);
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { name: p.name, description: p.description, categoryId: p.categoryId },
      });
    } else {
      await prisma.product.create({
        data: {
          slug: p.slug,
          name: p.name,
          description: p.description,
          categoryId: p.categoryId,
          variants: { create: p.variants },
          images: {
            create: p.images.map((u, i) => ({ url: IMG(u), alt: p.name, position: i })),
          },
        },
      });
    }
  }

  // Admin password MUST come from env. Never hardcode — `npm run seed` against
  // a non-local DB would otherwise instantly compromise the admin account.
  const adminPassRaw = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassRaw || adminPassRaw.length < 12) {
    throw new Error(
      "SEED_ADMIN_PASSWORD must be set (≥12 chars) before running this script. " +
        "Generate one with: openssl rand -hex 24",
    );
  }
  console.log("Seeding admin user…");
  const adminPass = await hash(adminPassRaw, 10);
  await prisma.customer.upsert({
    where: { email: "admin@brilhodediva.com.br" },
    create: {
      email: "admin@brilhodediva.com.br",
      passwordHash: adminPass,
      name: "Admin",
      role: "ADMIN",
    },
    update: { role: "ADMIN", passwordHash: adminPass },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
