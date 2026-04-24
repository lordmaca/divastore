// DivaHub adapter — catalog/content side is still stub (public catalog API
// not yet exposed), but the Divinha public API is live. Adapter health
// delegates to Divinha so /admin/integrations reflects the real state.

import type { CatalogSource, ContentSource, AdapterHealth } from "../types";
import { health as divinhaHealth, loadDivinhaConfig } from "./divinha";

export const divahub: CatalogSource & ContentSource = {
  name: "divahub",

  async isEnabled() {
    const cfg = await loadDivinhaConfig();
    return Boolean(cfg.url && cfg.key);
  },

  async health(): Promise<AdapterHealth> {
    const h = await divinhaHealth();
    return {
      ok: h.ok,
      detail: h.ok
        ? `Divinha v${h.version ?? "?"} — llm ${h.llmOk ? "ok" : "down"}`
        : (h.detail ?? "Divinha indisponível"),
      checkedAt: h.checkedAt,
    };
  },

  async listProducts() {
    return [];
  },

  async getAssets() {
    return [];
  },
};
