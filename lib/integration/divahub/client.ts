// DivaHub adapter — STUB.
// DivaHub (~/divahub) currently exposes only session-authenticated internal routes.
// Once it ships a public API + API-key auth, fill these methods. Do NOT call
// internal /api/* routes from here.

import type { CatalogSource, ContentSource, AdapterHealth } from "../types";
import { getSecret } from "@/lib/settings/config";
import { getSetting } from "@/lib/settings";

// Resolves outbound DivaHub config from encrypted secret (`divahub.apiKey`)
// + plain setting (`divahub.outbound`). Edit via /admin/configuracoes → DivaHub.
async function loadDivahubConfig() {
  const [key, outbound] = await Promise.all([
    getSecret("divahub.apiKey"),
    getSetting("divahub.outbound"),
  ]);
  return {
    url: outbound.url,
    key: key ?? "",
  };
}

export const divahub: CatalogSource & ContentSource = {
  name: "divahub",

  async isEnabled() {
    const cfg = await loadDivahubConfig();
    return Boolean(cfg.url && cfg.key);
  },

  async health(): Promise<AdapterHealth> {
    const cfg = await loadDivahubConfig();
    if (!cfg.url || !cfg.key) {
      return {
        ok: false,
        detail: "DivaHub outbound não configurado (url + key)",
        checkedAt: new Date(),
      };
    }
    return { ok: false, detail: "DivaHub public API not yet available", checkedAt: new Date() };
  },

  async listProducts() {
    return [];
  },

  async getAssets() {
    return [];
  },
};
