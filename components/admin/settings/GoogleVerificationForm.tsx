"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

export function GoogleVerificationForm({ initial }: { initial: { content: string } }) {
  const [content, setContent] = useState(initial.content);
  const ref = useRef({ content });
  ref.current = { content: content.trim() };

  return (
    <SettingCard
      settingKey="seo.googleVerification"
      label="Google Search Console — meta tag"
      description="No Google Search Console, adicione uma nova propriedade (tipo prefixo da URL) e escolha 'Meta tag HTML'. Cole apenas o valor do content aqui (sem as aspas)."
      getValue={() => ref.current}
    >
      <Field label="Conteúdo da meta tag" hint="ex: A1b2C3d4E5…">
        <input value={content} onChange={(e) => setContent(e.target.value)} className={inputCls} />
      </Field>
    </SettingCard>
  );
}
