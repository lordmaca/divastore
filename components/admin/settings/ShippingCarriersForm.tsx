"use client";

import { useMemo, useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

export function ShippingCarriersForm({ initial }: { initial: { serviceIds: string[] } }) {
  const [raw, setRaw] = useState(initial.serviceIds.join(", "));
  const serviceIds = useMemo(
    () =>
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [raw],
  );
  const ref = useRef({ serviceIds });
  ref.current = { serviceIds };

  return (
    <SettingCard
      settingKey="shipping.carriersAllowed"
      label="Serviços habilitados"
      description="IDs dos serviços do Melhor Envio a oferecer no checkout. Vazio = todos. Ex.: 1, 2, 3 para Correios PAC/SEDEX + Jadlog .Com."
      getValue={() => ref.current}
    >
      <Field label="IDs de serviço" hint="separe por vírgula">
        <input value={raw} onChange={(e) => setRaw(e.target.value)} className={inputCls} placeholder="ex.: 1, 2, 3" />
      </Field>
      {serviceIds.length > 0 ? (
        <p className="mt-1 text-xs text-[color:var(--foreground)]/60">
          Vai filtrar para: {serviceIds.map((s) => <code key={s} className="mx-0.5">{s}</code>)}
        </p>
      ) : null}
    </SettingCard>
  );
}
