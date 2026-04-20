"use client";

import { useRouter } from "next/navigation";
import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { SecretField } from "@/components/admin/settings/fields";
import { TinyBaseUrlForm } from "@/components/admin/settings/TinyBaseUrlForm";
import { saveSecretAction, clearSecretAction } from "@/lib/admin-actions";

type SecretStatus = {
  configured: boolean;
  source: "db" | null;
  last4: string | null;
};

type Props = {
  tinyBaseUrl: { url: string };
  secrets: {
    apiToken: SecretStatus;
    webhookSecret: SecretStatus;
  };
};

export function ErpTab(p: Props) {
  const router = useRouter();
  const ok = p.secrets.apiToken.configured;
  const status: boolean | "partial" = ok ? true : false;

  return (
    <div className="space-y-5">
      <TabHeader
        title="Tiny ERP"
        description="Publicação de pedidos, sincronização de estoque (cron 30 min), emissão de NF-e, cancelamento de NF-e. Credenciais criptografadas em banco."
      />
      <StatusStrip
        ok={status}
        label={ok ? "Tiny conectado" : "Tiny não configurado"}
        detail={
          p.secrets.webhookSecret.configured
            ? "Webhook de estoque ativo"
            : "Webhook de estoque: somente cron de 30 em 30 min"
        }
      />

      <SettingsSection
        title="Credenciais"
        description="API Token é usado em TODAS as chamadas (pedidos, NF-e, estoque). Webhook Secret é opcional — somente quando Tiny v3 estiver configurado para empurrar eventos."
      >
        <div className="space-y-4">
          <SecretField
            label="API Token"
            description="Gere em Tiny → Configurações → API. Precisa do escopo completo (pedidos + notas fiscais + produtos)."
            configured={p.secrets.apiToken.configured}
            last4={p.secrets.apiToken.last4}
            source={p.secrets.apiToken.source}
            onSave={async (v) => {
              await saveSecretAction("tiny.apiToken", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("tiny.apiToken");
              router.refresh();
            }}
          />
          <SecretField
            label="Webhook Secret"
            description="HMAC para verificar /api/webhooks/tiny. Opcional — quando vazio, o endpoint rejeita todas as requisições (seguro por padrão)."
            configured={p.secrets.webhookSecret.configured}
            last4={p.secrets.webhookSecret.last4}
            source={p.secrets.webhookSecret.source}
            onSave={async (v) => {
              await saveSecretAction("tiny.webhookSecret", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("tiny.webhookSecret");
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Endpoint da API"
        description="Fallback: api.tiny.com.br/api2. Só ajuste para instâncias corporativas (ex: mobit.com.br)."
      >
        <TinyBaseUrlForm initial={p.tinyBaseUrl} />
      </SettingsSection>
    </div>
  );
}
