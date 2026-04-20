"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

export function MpPublicKeyForm({ initial }: { initial: { hint: string } }) {
  const [hint, setHint] = useState(initial.hint);
  const ref = useRef({ hint });
  ref.current = { hint };

  return (
    <SettingCard
      settingKey="mp.publicKeyHint"
      label="Mercado Pago — Public Key"
      description="A public key do Mercado Pago não é um segredo — é exposta ao frontend pelo SDK do MP. Cole o valor completo (ex: APP_USR-… ou TEST-…) para que o admin confirme qual credencial está ativa."
      getValue={() => ref.current}
    >
      <Field label="Public Key" hint="ex.: APP_USR-1234abcd-5678-… ou TEST-…">
        <input value={hint} onChange={(e) => setHint(e.target.value)} className={inputCls} />
      </Field>
    </SettingCard>
  );
}
