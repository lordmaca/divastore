"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";
import { formatBRL } from "@/lib/money";

export function FreeShippingForm({ initial }: { initial: { cents: number } }) {
  const [reais, setReais] = useState((initial.cents / 100).toFixed(2));
  const ref = useRef<{ cents: number }>({ cents: initial.cents });
  ref.current = { cents: Math.max(0, Math.round(Number(reais.replace(",", ".")) * 100) || 0) };

  return (
    <SettingCard
      settingKey="shipping.freeThresholdCents"
      label="Frete grátis"
      description="Valor mínimo do subtotal para oferecer frete grátis. 0 desativa."
      getValue={() => ref.current}
    >
      <Field label="Valor mínimo (R$)" hint={formatBRL(ref.current.cents)}>
        <input
          type="number"
          step="0.01"
          min="0"
          value={reais}
          onChange={(e) => setReais(e.target.value)}
          className={inputCls}
        />
      </Field>
    </SettingCard>
  );
}
