"use client";

import { useRouter } from "next/navigation";
import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { SecretField } from "@/components/admin/settings/fields";
import { MpPublicKeyForm } from "@/components/admin/settings/MpPublicKeyForm";
import { saveSecretAction, clearSecretAction } from "@/lib/admin-actions";

type SecretStatus = {
  configured: boolean;
  source: "db" | null;
  last4: string | null;
};

type Props = {
  mpPublicKey: { hint: string };
  secrets: {
    accessToken: SecretStatus;
    webhookSecret: SecretStatus;
  };
};

export function PaymentsTab(p: Props) {
  const router = useRouter();
  const ok = p.secrets.accessToken.configured && p.secrets.webhookSecret.configured;
  const partial = p.secrets.accessToken.configured || p.secrets.webhookSecret.configured;
  const status: boolean | "partial" = ok ? true : partial ? "partial" : false;

  return (
    <div className="space-y-5">
      <TabHeader
        title="Mercado Pago"
        description="Checkout Pro + webhook signado + API de reembolso. Credenciais criptografadas (AES-256-GCM) em banco."
      />

      <StatusStrip
        ok={status}
        label={
          ok
            ? "Mercado Pago conectado"
            : partial
              ? "Credenciais incompletas"
              : "Não configurado"
        }
      />

      <SettingsSection
        title="Credenciais"
        description="Access Token + Webhook Secret. Nunca voltam em texto claro — somente os 4 últimos caracteres ficam visíveis para confirmação."
      >
        <div className="space-y-4">
          <SecretField
            label="Access Token"
            description="Gere em Mercado Pago → Credenciais → Produção (ou Teste). Aceita tokens APP-USR-... e TEST-..."
            configured={p.secrets.accessToken.configured}
            last4={p.secrets.accessToken.last4}
            source={p.secrets.accessToken.source}
            onSave={async (v) => {
              await saveSecretAction("mp.accessToken", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("mp.accessToken");
              router.refresh();
            }}
          />
          <SecretField
            label="Webhook Secret"
            description="Segredo HMAC que o Mercado Pago usa para assinar eventos. Configure o mesmo valor no painel MP → Webhooks."
            configured={p.secrets.webhookSecret.configured}
            last4={p.secrets.webhookSecret.last4}
            source={p.secrets.webhookSecret.source}
            onSave={async (v) => {
              await saveSecretAction("mp.webhookSecret", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("mp.webhookSecret");
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Public Key"
        description="Public key do Mercado Pago. Não é um segredo — é usada pelo SDK do MP no frontend (Bricks). Cole o valor completo."
      >
        <MpPublicKeyForm initial={p.mpPublicKey} />
      </SettingsSection>
    </div>
  );
}
