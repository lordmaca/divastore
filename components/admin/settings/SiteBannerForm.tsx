"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, FieldRow, inputCls } from "@/components/admin/SettingCard";

type Value = { enabled: boolean; message: string };

export function SiteBannerForm({ initial }: { initial: Value }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [message, setMessage] = useState(initial.message);
  const ref = useRef({ enabled, message });
  ref.current = { enabled, message };

  return (
    <SettingCard
      settingKey="site.banner"
      label="Banner do site"
      description="Mensagem fixa no topo do storefront. Desativado se desmarcado."
      getValue={() => ref.current}
    >
      <FieldRow cols={2}>
        <label className="flex items-center gap-2 text-sm self-end">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Ativo
        </label>
        <Field label="Mensagem">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            className={inputCls}
            placeholder="Ex: Frete grátis acima de R$ 299 ✨"
          />
        </Field>
      </FieldRow>
    </SettingCard>
  );
}
