"use server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { mercadoPago } from "@/lib/integration/mp/client";
import { tinyBuscarProdutoPorSku } from "@/lib/integration/tiny/http";
import { revalidatePath } from "next/cache";

// Returns-only helpers (no redirects). Called from client Testar buttons in
// /admin/integrations. Every attempt writes one IntegrationRun row so the
// history view tells the same story.

export type TestResult =
  | { ok: true; summary: string; detail?: Record<string, unknown> }
  | { ok: false; error: string; detail?: Record<string, unknown> };

async function log(adapter: string, operation: string, start: number, r: TestResult) {
  await prisma.integrationRun.create({
    data: {
      adapter,
      operation,
      status: r.ok ? "test_ok" : "test_error",
      error: r.ok ? null : r.error.slice(0, 500),
      payload: (r.detail ?? {}) as never,
      durationMs: Date.now() - start,
    },
  });
}

export async function testMercadoPago(): Promise<TestResult> {
  await requireAdmin();
  const start = Date.now();
  if (!(await mercadoPago.isEnabled())) {
    const r: TestResult = {
      ok: false,
      error: "Access token do Mercado Pago não configurado. Acesse /admin/configuracoes.",
    };
    await log("mercadopago", "test", start, r);
    revalidatePath("/admin/integrations");
    return r;
  }
  try {
    const pref = await mercadoPago.createPreference({
      orderId: `TEST-${Date.now()}`,
      items: [{ title: "Teste de integração", quantity: 1, unitPriceCents: 100 }],
      payer: { email: "teste@brilhodediva.com.br", name: "Teste" },
    });
    const r: TestResult = {
      ok: true,
      summary: "Preference criada com sucesso (R$ 1,00 demo).",
      detail: { preferenceId: pref.preferenceId, initPoint: pref.initPoint },
    };
    await log("mercadopago", "test", start, r);
    revalidatePath("/admin/integrations");
    return r;
  } catch (err) {
    const r: TestResult = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    await log("mercadopago", "test", start, r);
    revalidatePath("/admin/integrations");
    return r;
  }
}

export async function testTiny(): Promise<TestResult> {
  await requireAdmin();
  const start = Date.now();
  if (!process.env.TINY_API_TOKEN) {
    const r: TestResult = {
      ok: false,
      error: "TINY_API_TOKEN não configurado. Edite .env.local e reload.",
    };
    await log("tiny", "test", start, r);
    revalidatePath("/admin/integrations");
    return r;
  }
  // Look up a SKU Tiny is likely to know. Prefer the first SKU from the
  // newest paid order; fall back to any variant SKU; last fall back = "BD-TEST".
  const lastItem = await prisma.orderItem.findFirst({
    where: { order: { status: { in: ["PAID", "PACKED", "SHIPPED", "DELIVERED"] } } },
    orderBy: { order: { createdAt: "desc" } },
    select: { sku: true },
  });
  const anyVariant = lastItem
    ? { sku: lastItem.sku }
    : await prisma.variant.findFirst({ select: { sku: true } });
  const sku = anyVariant?.sku ?? "BD-TEST";

  try {
    const res = await tinyBuscarProdutoPorSku(sku);
    const found = Array.isArray(res?.produto) && res!.produto.length > 0;
    const r: TestResult = found
      ? {
          ok: true,
          summary: `SKU ${sku} encontrado no Tiny (${res!.produto.length} resultado).`,
          detail: { sku, produto: res!.produto.slice(0, 3) },
        }
      : {
          ok: true,
          summary: `Conexão OK, mas SKU ${sku} não foi encontrado no Tiny.`,
          detail: { sku },
        };
    await log("tiny", "test", start, r);
    revalidatePath("/admin/integrations");
    return r;
  } catch (err) {
    const r: TestResult = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      detail: { sku },
    };
    await log("tiny", "test", start, r);
    revalidatePath("/admin/integrations");
    return r;
  }
}

export async function testDivaHub(): Promise<TestResult> {
  await requireAdmin();
  const start = Date.now();
  const recent = await prisma.integrationRun.findFirst({
    where: { adapter: "divahub_inbound" },
    orderBy: { createdAt: "desc" },
  });
  const curl = [
    "curl -sS https://loja.brilhodediva.com.br/api/integrations/divahub/health \\",
    "  -H 'Authorization: Bearer <BRILHODEDIVA_API_KEY>'",
  ].join("\n");
  const r: TestResult = recent
    ? {
        ok: true,
        summary: `Última chamada DivaHub inbound: ${recent.operation} · ${recent.status} · ${new Date(recent.createdAt).toLocaleString("pt-BR")}`,
        detail: { curl, lastRunId: recent.id },
      }
    : {
        ok: true,
        summary: "Endpoint pronto. Aguardando primeira chamada do DivaHub.",
        detail: { curl },
      };
  await log("divahub_inbound", "test", start, r);
  revalidatePath("/admin/integrations");
  return r;
}
