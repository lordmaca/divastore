"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

type Value = { kind: "melhorenvio"; env: "sandbox" | "production" };

export function ShippingProviderForm({ initial }: { initial: Value }) {
  const [env, setEnv] = useState<Value["env"]>(initial.env);
  const ref = useRef<Value>({ kind: "melhorenvio", env });
  ref.current = { kind: "melhorenvio", env };

  return (
    <SettingCard
      settingKey="shipping.provider"
      label="Provedor de frete"
      description="Único provedor hoje: Melhor Envio. O ambiente define qual API será chamada."
      getValue={() => ref.current}
    >
      <Field label="Ambiente">
        <select value={env} onChange={(e) => setEnv(e.target.value as Value["env"])} className={inputCls}>
          <option value="sandbox">sandbox (teste, sem cobranças reais)</option>
          <option value="production">production (cobra de verdade)</option>
        </select>
      </Field>
      <p className="mt-2 text-xs text-[color:var(--foreground)]/60">
        Este campo só muda o ambiente para o qual fazemos chamadas. O token de acesso fica em{" "}
        <code>MELHORENVIO_TOKEN</code> no <code>.env.local</code>.
      </p>
    </SettingCard>
  );
}
