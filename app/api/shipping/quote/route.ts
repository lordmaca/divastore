import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { quoteForVariants } from "@/lib/shipping";
import { SITE_URL } from "@/lib/config";
import { normalizeCep } from "@/lib/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE = { capacity: 30, refillPerSecond: 3 };

const schema = z.object({
  toCep: z.string().min(8).max(9),
  items: z.array(z.object({ variantId: z.string().min(1), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL) {
    return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }
  const rl = rateLimit(`quote:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const start = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ ok: false, error: "validation_failed", issues: err.issues }, { status: 422 });
    }
    throw err;
  }

  const toCep = normalizeCep(parsed.toCep);
  if (toCep.length !== 8) {
    return NextResponse.json({ ok: false, error: "invalid_cep" }, { status: 422 });
  }

  try {
    const { options, warnings } = await quoteForVariants(toCep, parsed.items);
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "quote",
        status: options.length > 0 ? "ok" : "empty",
        durationMs: Date.now() - start,
        payload: { toCep, itemCount: parsed.items.length, warnings, options: options.length },
      },
    });
    return NextResponse.json({ ok: true, options, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "quote",
        status: "error",
        durationMs: Date.now() - start,
        error: message.slice(0, 500),
      },
    });
    return NextResponse.json({ ok: false, error: "server_error", message }, { status: 500 });
  }
}
