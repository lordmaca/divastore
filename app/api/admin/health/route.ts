import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { adapters } from "@/lib/integration/registry";
import { requireAdmin } from "@/lib/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Admin-only detailed health: per-adapter configured-vs-not, last-checked
// timestamps, durations. Anything that could leak operational posture lives
// here, not at the public /api/health.
const RATE = { capacity: 20, refillPerSecond: 1 };

export async function GET(req: NextRequest) {
  await requireAdmin();
  const rl = rateLimit(`admin:health:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }
  const start = Date.now();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const integrations = await Promise.all(
    Object.values(adapters).map(async (a) => ({
      name: a.name,
      enabled: await a.isEnabled(),
      health: await a.health(),
    })),
  );
  return NextResponse.json(
    {
      ok: dbOk,
      service: "brilhodediva-storefront",
      uptimeMs: Date.now() - start,
      db: dbOk,
      integrations,
      ts: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
