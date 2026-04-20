"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, FieldRow, inputCls } from "@/components/admin/SettingCard";

type Value = { widthCm: number; heightCm: number; lengthCm: number; weightG: number };

export function ShippingPackageForm({ initial }: { initial: Value }) {
  const [v, setV] = useState(initial);
  const ref = useRef<Value>(v);
  ref.current = {
    widthCm: Math.max(0, Number(v.widthCm) || 0),
    heightCm: Math.max(0, Number(v.heightCm) || 0),
    lengthCm: Math.max(0, Number(v.lengthCm) || 0),
    weightG: Math.max(0, Number(v.weightG) || 0),
  };
  function on<K extends keyof Value>(k: K, val: Value[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  return (
    <SettingCard
      settingKey="shipping.defaultPackage"
      label="Pacote padrão (fallback)"
      description="Usado quando a variante não tem dimensões. Caixa pequena de joia por padrão."
      getValue={() => ref.current}
    >
      <FieldRow cols={4}>
        <Field label="Largura (cm)">
          <input type="number" min="0" value={v.widthCm} onChange={(e) => on("widthCm", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Altura (cm)">
          <input type="number" min="0" value={v.heightCm} onChange={(e) => on("heightCm", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Comprimento (cm)">
          <input type="number" min="0" value={v.lengthCm} onChange={(e) => on("lengthCm", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Peso (g)">
          <input type="number" min="0" value={v.weightG} onChange={(e) => on("weightG", Number(e.target.value))} className={inputCls} />
        </Field>
      </FieldRow>
    </SettingCard>
  );
}
