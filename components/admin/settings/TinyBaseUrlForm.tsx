"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

export function TinyBaseUrlForm({ initial }: { initial: { url: string } }) {
  const [url, setUrl] = useState(initial.url);
  const ref = useRef({ url });
  ref.current = { url: url.replace(/\/$/, "") };

  return (
    <SettingCard
      settingKey="tiny.baseUrl"
      label="Tiny ERP — base URL"
      description="Endpoint da API Tiny v2. Default é api.tiny.com.br; só altere se usar ambiente alternativo."
      getValue={() => ref.current}
    >
      <Field label="URL">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
      </Field>
    </SettingCard>
  );
}
