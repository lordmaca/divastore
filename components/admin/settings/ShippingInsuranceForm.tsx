"use client";

import { useRef, useState } from "react";
import { SettingCard } from "@/components/admin/SettingCard";

export function ShippingInsuranceForm({ initial }: { initial: { enabled: boolean } }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const ref = useRef({ enabled });
  ref.current = { enabled };

  return (
    <SettingCard
      settingKey="shipping.insuranceOn"
      label="Declarar valor (seguro)"
      description="Declara o valor dos itens no envio. Recomendado para joias — pode encarecer o frete."
      getValue={() => ref.current}
    >
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Declarar valor em todos os envios
      </label>
    </SettingCard>
  );
}
