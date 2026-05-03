"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

type Props = {
  initial: { enabled: boolean; merchantId: number };
};

export function GoogleCustomerReviewsForm({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [merchantIdRaw, setMerchantIdRaw] = useState(
    initial.merchantId > 0 ? String(initial.merchantId) : "",
  );

  const ref = useRef({ enabled, merchantId: initial.merchantId });
  // Coerce on every render so the saved value is always a clean number.
  // Empty string → 0 (which the page treats as "disabled" regardless of
  // the toggle, so saving an empty merchantId doesn't blow up).
  ref.current = {
    enabled,
    merchantId: Number(merchantIdRaw.replace(/\D/g, "")) || 0,
  };

  return (
    <SettingCard
      settingKey="integrations.googleCustomerReviews"
      label="Google Customer Reviews"
      description="Pop-up de opt-in que aparece na página /checkout/sucesso quando o pedido é aprovado. Pré-requisito: ativar a integração no Merchant Center → Crescimento → Avaliações do Consumidor, copiar o merchant_id de lá."
      getValue={() => ref.current}
    >
      <Field label="Ativado no site">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Mostrar opt-in na página de sucesso</span>
        </label>
      </Field>
      <Field
        label="Merchant ID"
        hint="Número que aparece em https://merchants.google.com → Configurações → Conta. Só dígitos."
      >
        <input
          value={merchantIdRaw}
          onChange={(e) => setMerchantIdRaw(e.target.value)}
          placeholder="ex: 5777940112"
          className={inputCls}
          inputMode="numeric"
          pattern="[0-9]*"
        />
      </Field>
    </SettingCard>
  );
}
