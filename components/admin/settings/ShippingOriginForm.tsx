"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, FieldRow, inputCls } from "@/components/admin/SettingCard";

type Value = {
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  recipient: string;
};

function digitsCep(s: string): string {
  return s.replace(/\D/g, "").slice(0, 8);
}

export function ShippingOriginForm({ initial }: { initial: Value }) {
  const [v, setV] = useState(initial);
  const ref = useRef<Value>(v);
  ref.current = { ...v, cep: digitsCep(v.cep), state: v.state.toUpperCase().slice(0, 2) };

  function on<K extends keyof Value>(k: K, val: Value[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  return (
    <SettingCard
      settingKey="shipping.origin"
      label="Endereço de origem"
      description="Ponto de partida dos envios. Sem isso não conseguimos cotar frete."
      getValue={() => ref.current}
    >
      <FieldRow cols={3}>
        <Field label="CEP" hint="8 dígitos">
          <input value={v.cep} onChange={(e) => on("cep", e.target.value)} className={inputCls} placeholder="01310100" />
        </Field>
        <Field label="UF" hint="2 letras">
          <input value={v.state} onChange={(e) => on("state", e.target.value)} maxLength={2} className={`${inputCls} uppercase`} />
        </Field>
        <Field label="Cidade">
          <input value={v.city} onChange={(e) => on("city", e.target.value)} className={inputCls} />
        </Field>
      </FieldRow>
      <div className="h-3" />
      <FieldRow cols={2}>
        <Field label="Rua">
          <input value={v.street} onChange={(e) => on("street", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Número">
          <input value={v.number} onChange={(e) => on("number", e.target.value)} className={inputCls} />
        </Field>
      </FieldRow>
      <div className="h-3" />
      <FieldRow cols={2}>
        <Field label="Bairro">
          <input value={v.district} onChange={(e) => on("district", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Remetente">
          <input value={v.recipient} onChange={(e) => on("recipient", e.target.value)} className={inputCls} />
        </Field>
      </FieldRow>
    </SettingCard>
  );
}
