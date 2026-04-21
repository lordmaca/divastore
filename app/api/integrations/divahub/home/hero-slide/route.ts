import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { authenticateDivahub } from "@/lib/integration/divahub/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { HeroSlideSource } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-key rate limit: same budget as /products (600/min).
const RATE = { capacity: 60, refillPerSecond: 10 };

// Inbound hero-slide pipeline for DivaHub.
//   - POST   upserts a slide (by externalId) with the content generated
//            by DivaHub + optional product link + active window.
//   - DELETE disables a slide (soft delete — keeps history/audit).
//
// Content rules: admin overrides survive upserts. We only write the
// base columns (`imageUrl`, `headline`, `sub`, `ctaLabel`, `ctaUrl`,
// `imageAlt`, `activeFrom`, `activeUntil`); the `*Override` columns are
// untouched by DivaHub and stay under admin control.

const isoDate = z
  .string()
  .datetime({ offset: true })
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

const upsertSchema = z.object({
  externalId: z.string().min(1).max(120),
  // Product linkage: either storefront cuid (id) or Product.externalId
  // (DivaHub's own id) — at most one must resolve.
  productId: z.string().max(60).optional().nullable(),
  productExternalId: z.string().max(120).optional().nullable(),
  // 2000 chars covers the universal safe HTTP URL length; OCI/S3 signed
  // URLs and long object-key paths easily break past 500.
  imageUrl: z.string().url().max(2000),
  imageAlt: z.string().max(300).optional().nullable(),
  headline: z.string().min(1).max(200),
  sub: z.string().max(300).optional().nullable(),
  ctaLabel: z.string().min(1).max(60),
  ctaUrl: z.string().min(1).max(500),
  activeFrom: isoDate,
  activeUntil: isoDate,
});

type UpsertInput = z.infer<typeof upsertSchema>;

async function resolveProductId(input: UpsertInput): Promise<string | null> {
  if (input.productId) {
    const p = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true },
    });
    return p?.id ?? null;
  }
  if (input.productExternalId) {
    const p = await prisma.product.findUnique({
      where: { externalId: input.productExternalId },
      select: { id: true },
    });
    return p?.id ?? null;
  }
  return null;
}

async function logRun(args: {
  operation: "upsertHeroSlide" | "deleteHeroSlide";
  status: string;
  durationMs: number;
  payload?: unknown;
  error?: string;
}) {
  await prisma.integrationRun.create({
    data: {
      adapter: "divahub_inbound",
      operation: args.operation,
      status: args.status,
      durationMs: args.durationMs,
      error: args.error,
      payload: args.payload as never,
    },
  });
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await authenticateDivahub(req.headers);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }

  const rl = rateLimit(`divahub:${auth.keyHint}:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: UpsertInput;
  try {
    const raw = (await req.json()) as unknown;
    body = upsertSchema.parse(raw);
  } catch (err) {
    const msg =
      err instanceof ZodError ? err.issues.map((i) => i.message).join("; ") : "invalid_json";
    await logRun({
      operation: "upsertHeroSlide",
      status: "error",
      durationMs: Date.now() - start,
      error: msg.slice(0, 500),
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const productId = await resolveProductId(body);
  if ((body.productId || body.productExternalId) && !productId) {
    await logRun({
      operation: "upsertHeroSlide",
      status: "error",
      durationMs: Date.now() - start,
      error: "product_not_found",
      payload: { externalId: body.externalId },
    });
    return NextResponse.json(
      { ok: false, error: "product_not_found" },
      { status: 404 },
    );
  }

  const baseData = {
    imageUrl: body.imageUrl,
    imageAlt: body.imageAlt ?? null,
    headline: body.headline,
    sub: body.sub ?? null,
    ctaLabel: body.ctaLabel,
    ctaUrl: body.ctaUrl,
    productId,
    activeFrom: body.activeFrom,
    activeUntil: body.activeUntil,
  };

  const slide = await prisma.heroSlide.upsert({
    where: { externalId: body.externalId },
    create: {
      externalId: body.externalId,
      source: HeroSlideSource.DIVAHUB_AUTO,
      enabled: true,
      ...baseData,
    },
    // Upsert is additive — we never touch the *Override columns.
    update: baseData,
    select: { id: true, externalId: true },
  });

  revalidatePath("/");
  await logRun({
    operation: "upsertHeroSlide",
    status: "ok",
    durationMs: Date.now() - start,
    payload: { externalId: slide.externalId, id: slide.id, productLinked: Boolean(productId) },
  });
  return NextResponse.json({ ok: true, id: slide.id, externalId: slide.externalId });
}

export async function DELETE(req: NextRequest) {
  const start = Date.now();
  const auth = await authenticateDivahub(req.headers);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }

  const externalId = req.nextUrl.searchParams.get("externalId");
  if (!externalId) {
    return NextResponse.json(
      { ok: false, error: "externalId_required" },
      { status: 400 },
    );
  }

  const row = await prisma.heroSlide.findUnique({
    where: { externalId },
    select: { id: true },
  });
  if (!row) {
    return NextResponse.json({ ok: true, already: "absent" });
  }

  await prisma.heroSlide.update({
    where: { id: row.id },
    data: { enabled: false },
  });

  revalidatePath("/");
  await logRun({
    operation: "deleteHeroSlide",
    status: "ok",
    durationMs: Date.now() - start,
    payload: { externalId },
  });
  return NextResponse.json({ ok: true, disabled: externalId });
}
