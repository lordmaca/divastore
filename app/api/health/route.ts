import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public liveness probe. Intentionally minimal — we do not expose adapter
// names, configuration state, or any reconnaissance signal here. Operators
// who need detail use the admin-only endpoint at /api/admin/health.
//
// Rate-limited generously per IP — uptime monitors typically hit at 1/min.
// The cap kills only hostile loops.
const RATE = { capacity: 60, refillPerSecond: 2 };

export async function GET(req: NextRequest) {
  const rl = rateLimit(`health:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({ ok: dbOk }, { status: dbOk ? 200 : 503 });
}
