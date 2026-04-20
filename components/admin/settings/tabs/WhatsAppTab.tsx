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
  FieldGrid,
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
  config: { phoneNumberId: string; apiVersion: string };
  secrets: { accessToken: SecretStatus };
};

export function WhatsAppTab(p: Props) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft({
    phoneNumberId: p.config.phoneNumberId,
    apiVersion: p.config.apiVersion || "v21.0",
  });
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState<boolean | null>(null);

  const status: boolean | "partial" =
    p.secrets.accessToken.configured && draft.phoneNumberId
      ? "partial" // status stays "partial" because the adapter is stubbed
      : p.secrets.accessToken.configured || draft.phoneNumberId
        ? false
        : false;

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("whatsapp.config", {
          phoneNumberId: draft.phoneNumberId.trim(),
          apiVersion: draft.apiVersion.trim() || "v21.0",
        });
        reset({
          phoneNumberId: draft.phoneNumberId.trim(),
          apiVersion: draft.apiVersion.trim() || "v21.0",
        });
        setMsgOk(true);
        setMsg("Configuração salva.");
        router.refresh();
      } catch (e) {
        setMsgOk(false);
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="space-y-5">
      <TabHeader
        title="WhatsApp (Meta Cloud API)"
        description="Notificações transacionais via WhatsApp. O adaptador ainda está em stub — as credenciais aqui salvas só começam a ser enviadas depois que a verificação Meta Business estiver aprovada e o stub for substituído. Ver docs/plans/whatsapp.md."
      />

      <StatusStrip
        ok={status}
        label={
          p.secrets.accessToken.configured && draft.phoneNumberId
            ? "Credenciais salvas — adaptador ainda em stub"
            : "Não configurado"
        }
        detail="Envio real depende de verificação Meta Business e substituição do stub em lib/notifications/channels/whatsapp.ts."
      />

      <SettingsSection
        title="Credenciais"
        description="Access Token (permanente via System User) + Phone Number ID do número registrado no Business Manager."
      >
        <FieldGrid cols={2}>
          <TextField
            label="Phone Number ID"
            value={draft.phoneNumberId}
            onChange={(v) => patch("phoneNumberId", v)}
            placeholder="1234567890123456"
            description="Numérico, aparece no Meta Business Manager → WhatsApp → Números."
          />
          <TextField
            label="Versão da Graph API"
            value={draft.apiVersion}
            onChange={(v) => patch("apiVersion", v)}
            placeholder="v21.0"
            description="Ex: v21.0. Atualize quando a Meta publicar uma nova versão estável."
          />
        </FieldGrid>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
          >
            {saving ? "…" : "Salvar"}
          </button>
          {msg ? (
            <span className={`text-xs ${msgOk ? "text-emerald-700" : "text-red-600"}`}>
              {msg}
            </span>
          ) : null}
        </div>

        <div className="pt-4 border-t border-white/60">
          <SecretField
            label="Access Token"
            description="Token permanente via System User. Não use tokens de usuário comum (24h TTL)."
            configured={p.secrets.accessToken.configured}
            last4={p.secrets.accessToken.last4}
            source={p.secrets.accessToken.source}
            onSave={async (v) => {
              await saveSecretAction("whatsapp.accessToken", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("whatsapp.accessToken");
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>

      <p className="text-xs text-[color:var(--foreground)]/60">
        Roteiro completo de ativação:{" "}
        <Link
          href="/docs/plans/whatsapp.md"
          className="text-[color:var(--pink-600)] hover:underline"
        >
          docs/plans/whatsapp.md
        </Link>
      </p>
    </div>
  );
}
