import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { authenticateDivahub } from "@/lib/integration/divahub/auth";
import { productInput, productBatchInput } from "@/lib/integration/divahub/inbound-schema";
import { upsertProductFromDivahub, ManualProductCollisionError } from "@/lib/integration/divahub/upsert";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-key budget: 600 requests / minute (10 rps sustained, burst 60).
const RATE = { capacity: 60, refillPerSecond: 10 };

async function logRun(args: {
  status: string;
  durationMs: number;
  payload?: unknown;
  error?: string;
}) {
  await prisma.integrationRun.create({
    data: {
      adapter: "divahub_inbound",
      operation: "upsertProduct",
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
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Accept either a single product or {products: [...]}.
  const isBatch = body && typeof body === "object" && body !== null && "products" in body;

  try {
    if (isBatch) {
      const parsed = productBatchInput.parse(body);
      const results = [];
      for (const p of parsed.products) {
        const r = await upsertProductFromDivahub(p);
        results.push(r);
      }
      await logRun({
        status: "ok",
        durationMs: Date.now() - start,
        payload: { count: results.length, slugs: results.map((r) => r.slug) },
      });
      return NextResponse.json({ ok: true, results }, { status: 200 });
    }

    const parsed = productInput.parse(body);
    const result = await upsertProductFromDivahub(parsed);
    await logRun({
      status: "ok",
      durationMs: Date.now() - start,
      payload: { slug: result.slug },
    });
    return NextResponse.json({ ok: true, result }, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ZodError) {
      await logRun({
        status: "validation_error",
        durationMs: Date.now() - start,
        error: err.message.slice(0, 500),
      });
      return NextResponse.json(
        { ok: false, error: "validation_failed", issues: err.issues },
        { status: 422 },
      );
    }
    if (err instanceof ManualProductCollisionError) {
      await logRun({
        status: "manual_collision",
        durationMs: Date.now() - start,
        error: err.message,
      });
      return NextResponse.json(
        { ok: false, error: "manual_product_collision", message: err.message },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    await logRun({
      status: "error",
      durationMs: Date.now() - start,
      error: message.slice(0, 500),
    });
    return NextResponse.json({ ok: false, error: "server_error", message }, { status: 500 });
  }
}
