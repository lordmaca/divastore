import type { OrderSink, OrderPayload, AdapterHealth } from "../types";
import { tinyPedidoIncluir, TinyError, loadTinyConfig } from "./http";
import { toTinyPedido } from "./mapper";
import { prisma } from "@/lib/db";

export const tiny: OrderSink = {
  name: "tiny",

  async isEnabled() {
    const cfg = await loadTinyConfig();
    return Boolean(cfg.token);
  },

  async health(): Promise<AdapterHealth> {
    const cfg = await loadTinyConfig();
    if (!cfg.token) {
      return { ok: false, detail: "Tiny API token not configured (stub mode)", checkedAt: new Date() };
    }
    return { ok: true, detail: `configured (${cfg.baseUrl})`, checkedAt: new Date() };
  },

  async publishOrder(order: OrderPayload) {
    const start = Date.now();
    const cfg = await loadTinyConfig();
    if (!cfg.token) {
      // Stub mode: simulate success so end-to-end demo works without creds.
      const stubId = `STUB-${order.number}`;
      await prisma.integrationRun.create({
        data: {
          adapter: "tiny",
          operation: "publishOrder",
          status: "stub_ok",
          payload: { storefrontOrderId: order.storefrontOrderId, externalId: stubId },
          durationMs: Date.now() - start,
        },
      });
      return { externalId: stubId };
    }

    const pedido = toTinyPedido(order);
    try {
      const res = await tinyPedidoIncluir(pedido);
      const externalId = String(res.registro.id);
      await prisma.integrationRun.create({
        data: {
          adapter: "tiny",
          operation: "publishOrder",
          status: "ok",
          payload: { storefrontOrderId: order.storefrontOrderId, externalId, numero: res.registro.numero },
          durationMs: Date.now() - start,
        },
      });
      return { externalId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof TinyError ? err.code : undefined;
      await prisma.integrationRun.create({
        data: {
          adapter: "tiny",
          operation: "publishOrder",
          status: "error",
          error: code ? `${code}: ${message}` : message,
          payload: { storefrontOrderId: order.storefrontOrderId },
          durationMs: Date.now() - start,
        },
      });
      throw err;
    }
  },
};
