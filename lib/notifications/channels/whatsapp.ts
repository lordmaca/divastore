import { NotConfiguredError } from "../errors";
import { getSecret } from "@/lib/settings/config";
import { getSetting } from "@/lib/settings";

// WhatsApp is intentionally NOT implemented in this pass. The adapter exists
// so the dispatcher has a consistent interface — when Meta Business
// verification clears and the Cloud API token is provisioned, replace the
// body of `sendWhatsApp` below.
//
// Meta Cloud API integration plan: docs/plans/whatsapp.md.
//
// Config resolves from encrypted `whatsapp.accessToken` secret + plain
// `whatsapp.config` (phoneNumberId, apiVersion) — both editable via
// /admin/configuracoes.
//
// Templates are already designed to map 1:1 from the email `text` field, so
// the future implementation only needs to:
//   1. Map our internal template name → Meta template id
//   2. Substitute {{1}}..{{n}} parameters from msg.data
//   3. POST to graph.facebook.com/{apiVersion}/{phoneNumberId}/messages

export type WhatsAppMessage = {
  to: string;          // E.164, e.g. +5511999998888
  template: string;    // internal template name
  data: Record<string, unknown>;
  text: string;        // rendered pt-BR fallback — used for audit, not sent
};

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

export async function loadWhatsAppConfig(): Promise<WhatsAppConfig> {
  const [accessToken, cfg] = await Promise.all([
    getSecret("whatsapp.accessToken"),
    getSetting("whatsapp.config"),
  ]);
  return {
    accessToken: accessToken ?? "",
    phoneNumberId: cfg.phoneNumberId ?? "",
    apiVersion: cfg.apiVersion || "v21.0",
  };
}

export async function whatsappConfigured(): Promise<boolean> {
  const c = await loadWhatsAppConfig();
  return Boolean(c.accessToken && c.phoneNumberId);
}

export async function sendWhatsApp(_msg: WhatsAppMessage): Promise<void> {
  throw new NotConfiguredError("whatsapp");
}
