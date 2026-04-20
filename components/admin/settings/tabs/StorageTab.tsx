"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import {
  TextField,
  SecretField,
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

type S3Plain = {
  endpoint: string;
  region: string;
  publicBucket: string;
  privateBucket: string;
  prefix: string;
  publicBaseUrl: string;
};

type Props = {
  plain: S3Plain;
  secrets: {
    accessKeyId: SecretStatus;
    secretAccessKey: SecretStatus;
  };
  effective: {
    publicConfigured: boolean;
    privateConfigured: boolean;
  };
};

export function StorageTab(p: Props) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<S3Plain>({ ...p.plain });
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState<boolean | null>(null);

  const status: boolean | "partial" = p.effective.publicConfigured
    ? p.effective.privateConfigured
      ? true
      : "partial"
    : false;

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("s3.config", {
          endpoint: draft.endpoint.trim(),
          region: draft.region.trim(),
          publicBucket: draft.publicBucket.trim(),
          privateBucket: draft.privateBucket.trim(),
          prefix: draft.prefix.trim(),
          publicBaseUrl: draft.publicBaseUrl.trim().replace(/\/$/, ""),
        });
        reset({
          endpoint: draft.endpoint.trim(),
          region: draft.region.trim(),
          publicBucket: draft.publicBucket.trim(),
          privateBucket: draft.privateBucket.trim(),
          prefix: draft.prefix.trim(),
          publicBaseUrl: draft.publicBaseUrl.trim().replace(/\/$/, ""),
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
        title="Armazenamento (S3-compatível)"
        description="OCI Object Storage via API S3. Dois buckets: o público para imagens de produto, o privado para docs sensíveis (acesso via URL assinada)."
      />

      <StatusStrip
        ok={status}
        label={
          status === true
            ? "Armazenamento conectado (público + privado)"
            : status === "partial"
              ? "Bucket público ok, privado ainda não"
              : "Armazenamento não configurado"
        }
      />

      <SettingsSection
        title="Endpoint + buckets"
        description="Endpoint e região do provedor. OCI usa forçosamente path-style."
      >
        <FieldGrid cols={2}>
          <TextField
            label="Endpoint"
            type="url"
            value={draft.endpoint}
            onChange={(v) => patch("endpoint", v)}
            placeholder="https://<tenant>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com"
            required
          />
          <TextField
            label="Região"
            value={draft.region}
            onChange={(v) => patch("region", v)}
            placeholder="sa-saopaulo-1"
            required
          />
          <TextField
            label="Bucket público"
            value={draft.publicBucket}
            onChange={(v) => patch("publicBucket", v)}
            placeholder="brilhodediva-public"
            required
          />
          <TextField
            label="Bucket privado"
            value={draft.privateBucket}
            onChange={(v) => patch("privateBucket", v)}
            placeholder="brilhodediva-private"
          />
          <TextField
            label="Prefixo de objetos"
            value={draft.prefix}
            onChange={(v) => patch("prefix", v)}
            placeholder="storefront/"
            description="Ex: `storefront/` para separar do catálogo DivaHub no mesmo bucket."
          />
          <TextField
            label="Base pública de URLs"
            type="url"
            value={draft.publicBaseUrl}
            onChange={(v) => patch("publicBaseUrl", v)}
            placeholder="https://cdn.brilhodediva.com.br"
            description="URL pública servida como base para imagens (CDN/domínio custom)."
            required
          />
        </FieldGrid>
        <div className="flex items-center gap-3 pt-2 border-t border-white/60">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
          >
            {saving ? "…" : "Salvar configuração"}
          </button>
          {msg ? (
            <span className={`text-xs ${msgOk ? "text-emerald-700" : "text-red-600"}`}>
              {msg}
            </span>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Credenciais"
        description="Access Key + Secret Key do usuário IAM. Ambos os buckets usam as mesmas credenciais."
      >
        <div className="space-y-4">
          <SecretField
            label="Access Key ID"
            description="Identificador do usuário IAM — sem ele, uploads falham com `s3_not_configured`."
            configured={p.secrets.accessKeyId.configured}
            last4={p.secrets.accessKeyId.last4}
            source={p.secrets.accessKeyId.source}
            onSave={async (v) => {
              await saveSecretAction("s3.accessKeyId", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("s3.accessKeyId");
              router.refresh();
            }}
          />
          <SecretField
            label="Secret Access Key"
            description="Nunca volta em texto claro. Rotacione no painel OCI e cole aqui."
            configured={p.secrets.secretAccessKey.configured}
            last4={p.secrets.secretAccessKey.last4}
            source={p.secrets.secretAccessKey.source}
            onSave={async (v) => {
              await saveSecretAction("s3.secretAccessKey", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("s3.secretAccessKey");
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
