import { NextResponse, type NextRequest } from "next/server";
import { authenticateDivahub } from "@/lib/integration/divahub/auth";
import { deactivateProductBySlug } from "@/lib/integration/divahub/upsert";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE = { capacity: 60, refillPerSecond: 10 };

// DELETE soft-deactivates a product (sets active=false). Hard-delete is not
// supported because OrderItem rows reference Variants via FK Restrict.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateDivahub(req.headers);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }
  const rl = rateLimit(`divahub:${auth.keyHint}:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 },
    );
  }

  const { slug } = await params;
  const result = await deactivateProductBySlug(slug);
  await prisma.integrationRun.create({
    data: {
      adapter: "divahub_inbound",
      operation: "deactivateProduct",
      status: result.deactivated ? "ok" : "noop",
      payload: { slug },
    },
  });
  return NextResponse.json(
    { ok: true, slug, deactivated: result.deactivated },
    { status: result.deactivated ? 200 : 404 },
  );
}
