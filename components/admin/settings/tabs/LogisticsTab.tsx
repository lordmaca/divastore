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
  SelectField,
} from "@/components/admin/settings/fields";
import { ShippingProviderForm } from "@/components/admin/settings/ShippingProviderForm";
import { FreeShippingForm } from "@/components/admin/settings/FreeShippingForm";
import { ShippingInsuranceForm } from "@/components/admin/settings/ShippingInsuranceForm";
import { ShippingCarriersForm } from "@/components/admin/settings/ShippingCarriersForm";
import { ShippingOriginForm } from "@/components/admin/settings/ShippingOriginForm";
import { ShippingPackageForm } from "@/components/admin/settings/ShippingPackageForm";
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
  shippingProvider: { kind: "melhorenvio"; env: "sandbox" | "production" };
  freeShipping: { cents: number };
  shippingInsurance: { enabled: boolean };
  shippingCarriers: { serviceIds: string[] };
  shippingOrigin: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    district: string;
    city: string;
    state: string;
    recipient: string;
    phone?: string;
    email?: string;
    cnpj?: string;
  };
  shippingPackage: {
    widthCm: number;
    heightCm: number;
    lengthCm: number;
    weightG: number;
  };
  melhorEnvioEnv: "sandbox" | "production";
  secrets: {
    token: SecretStatus;
    webhookSecret: SecretStatus;
  };
};

export function LogisticsTab(p: Props) {
  const router = useRouter();
  const [env, setEnv] = useState<"sandbox" | "production">(p.melhorEnvioEnv);
  const [envPending, startEnv] = useTransition();
  const [envMsg, setEnvMsg] = useState<string | null>(null);
  const envDirty = env !== p.melhorEnvioEnv;

  const status: boolean | "partial" =
    p.secrets.token.configured && p.secrets.webhookSecret.configured
      ? true
      : p.secrets.token.configured
        ? "partial"
        : false;

  function saveEnv() {
    startEnv(async () => {
      setEnvMsg(null);
      try {
        await saveSettingAction("melhorenvio.env", { env });
        setEnvMsg("Salvo.");
        router.refresh();
      } catch (e) {
        setEnvMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="space-y-5">
      <TabHeader
        title="Logística (Melhor Envio)"
        description="Cotação de frete no checkout + compra de etiqueta no painel de pedidos + recepção de atualizações do transportador via webhook."
      />

      <StatusStrip
        ok={status}
        label={
          status === true
            ? "Melhor Envio conectado"
            : status === "partial"
              ? "Configuração parcial — falta o webhook secret"
              : "Melhor Envio não configurado"
        }
        detail={`Ambiente: ${p.melhorEnvioEnv} · Webhook: ${p.secrets.webhookSecret.configured ? "configurado" : "sem segredo (rejeita 401)"}`}
      />

      <SettingsSection
        title="Credenciais"
        description="Personal Access Token (escopos: shipping-calculate, shipping-cart, shipping-checkout, shipping-generate, shipping-print, shipping-tracking) + Webhook Secret para verificar status do transportador."
      >
        <div className="space-y-4">
          <SecretField
            label="Token do Melhor Envio"
            description="Gere em Melhor Envio → Configurações → Gerar Token."
            configured={p.secrets.token.configured}
            last4={p.secrets.token.last4}
            source={p.secrets.token.source}
            onSave={async (v) => {
              await saveSecretAction("melhorenvio.token", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("melhorenvio.token");
              router.refresh();
            }}
          />
          <SecretField
            label="Webhook Secret"
            description="HMAC para verificar /api/webhooks/melhorenvio. Quando vazio, o endpoint rejeita todas as chamadas (seguro por padrão)."
            configured={p.secrets.webhookSecret.configured}
            last4={p.secrets.webhookSecret.last4}
            source={p.secrets.webhookSecret.source}
            onSave={async (v) => {
              await saveSecretAction("melhorenvio.webhookSecret", v);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("melhorenvio.webhookSecret");
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Ambiente"
        description="Use sandbox durante testes; production em operação real. Mudar afeta TODAS as cotações e compras de etiqueta."
      >
        <div className="max-w-xs">
          <SelectField<"sandbox" | "production">
            label="Ambiente"
            value={env}
            onChange={setEnv}
            options={[
              { value: "sandbox", label: "Sandbox (testes)" },
              { value: "production", label: "Production (carteira real)" },
            ]}
          />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={!envDirty || envPending}
            onClick={saveEnv}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
          >
            {envPending ? "…" : "Salvar ambiente"}
          </button>
          {envMsg ? (
            <span className="text-xs text-[color:var(--foreground)]/70">{envMsg}</span>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="Provedor de frete">
        <ShippingProviderForm initial={p.shippingProvider} />
      </SettingsSection>

      <SettingsSection
        title="Endereço de origem"
        description="Endereço do depósito/remetente. Telefone, e-mail e CNPJ são usados na compra de etiqueta (não no cálculo do frete)."
      >
        <ShippingOriginForm initial={p.shippingOrigin} />
      </SettingsSection>

      <SettingsSection
        title="Pacote padrão"
        description="Dimensões usadas quando uma variante não tem width/height/length/weight."
      >
        <ShippingPackageForm initial={p.shippingPackage} />
      </SettingsSection>

      <div className="grid lg:grid-cols-2 gap-4">
        <SettingsSection title="Frete grátis">
          <FreeShippingForm initial={p.freeShipping} />
        </SettingsSection>
        <SettingsSection title="Seguro do envio">
          <ShippingInsuranceForm initial={p.shippingInsurance} />
        </SettingsSection>
      </div>

      <SettingsSection
        title="Transportadoras permitidas"
        description="Whitelist de service IDs do Melhor Envio. Vazio = todas."
      >
        <ShippingCarriersForm initial={p.shippingCarriers} />
      </SettingsSection>

      <p className="text-xs text-[color:var(--foreground)]/60">
        Documentação:{" "}
        <Link
          href="/docs/logistics.md"
          className="text-[color:var(--pink-600)] hover:underline"
        >
          docs/logistics.md
        </Link>
      </p>
    </div>
  );
}
