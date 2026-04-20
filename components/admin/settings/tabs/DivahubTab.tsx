"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import {
  SecretField,
  TextField,
  useDraft,
} from "@/components/admin/settings/fields";
import {
  saveSettingAction,
  saveSecretAction,
  clearSecretAction,
} from "@/lib/admin-actions";

type SecretStatus = {
  configured: boolean;
  source: "db" | null;
  last4: string | null;
};

type Props = {
  outbound: { url: string };
  secrets: {
    apiKey: SecretStatus;
    inboundApiKey: SecretStatus;
  };
};

export function DivahubTab(p: Props) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<{ url: string }>({
    url: p.outbound.url,
  });
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const outboundConfigured = Boolean(draft.url && p.secrets.apiKey.configured);
  const inboundConfigured = p.secrets.inboundApiKey.configured;
  const status: boolean | "partial" =
    outboundConfigured && inboundConfigured
      ? true
      : outboundConfigured || inboundConfigured
        ? "partial"
        : false;

  function saveUrl() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("divahub.outbound", { url: draft.url.trim() });
        reset({ url: draft.url.trim() });
        setMsg("URL salva.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="space-y-5">
      <TabHeader
        title="DivaHub"
        description="Sister project para publicação em marketplaces + importação de catálogo. Saída (outbound) = chamadas deste storefront para DivaHub; Entrada (inbound) = DivaHub publicando produtos aqui."
      />

      <StatusStrip
        ok={status}
        label={
          status === true
            ? "DivaHub conectado (entrada + saída)"
            : status === "partial"
              ? "Configuração parcial"
              : "DivaHub não configurado"
        }
        detail="Saída pendente até DivaHub expor API pública. Entrada é usada por /api/integrations/divahub/*."
      />

      <SettingsSection
        title="Saída (DivaHub API)"
        description="Configuração para quando o DivaHub publicar uma API pública. Hoje é apenas reservada."
      >
        <div className="max-w-xl space-y-3">
          <TextField
            label="URL da API"
            type="url"
            value={draft.url}
            onChange={(v) => patch("url", v)}
            placeholder="https://divahub.brilhodediva.com.br/api"
          />
          <SecretField
            label="Chave de API"
            description="Token emitido pelo DivaHub para esta integração."
            configured={p.secrets.apiKey.configured}
            last4={p.secrets.apiKey.last4}
            source={p.secrets.apiKey.source}
            onSave={async (v) => {
              await saveSecretAction("divahub.apiKey", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("divahub.apiKey");
              router.refresh();
            }}
          />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={saveUrl}
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
            >
              {saving ? "…" : "Salvar URL"}
            </button>
            {msg ? (
              <span className="text-xs text-[color:var(--foreground)]/70">{msg}</span>
            ) : null}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Entrada (inbound)"
        description="Chave padrão usada em /api/integrations/divahub/*. Para rotação zero-downtime com múltiplas chaves, use o Integration Center."
      >
        <SecretField
          label="Chave de entrada padrão"
          description="DivaHub autentica nas rotas inbound com este token. Rotação avançada com múltiplas chaves SHA-256 fica em /admin/integrations."
          configured={p.secrets.inboundApiKey.configured}
          last4={p.secrets.inboundApiKey.last4}
          source={p.secrets.inboundApiKey.source}
          onSave={async (v) => {
            await saveSecretAction("divahub.inboundApiKey", v);
            router.refresh();
          }}
          onClear={async () => {
            await clearSecretAction("divahub.inboundApiKey");
            router.refresh();
          }}
        />
        <p className="text-xs text-[color:var(--foreground)]/60 pt-2 border-t border-white/60">
          <Link
            href="/admin/integrations"
            className="text-[color:var(--pink-600)] hover:underline"
          >
            Integration Center → DivaHub → Chaves de API
          </Link>{" "}
          para gerar e rotacionar chaves adicionais com auditoria.
        </p>
      </SettingsSection>
    </div>
  );
}
