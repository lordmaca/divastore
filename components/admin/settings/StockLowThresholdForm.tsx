"use client";

import { useRef, useState } from "react";
import { SettingCard, Field, inputCls } from "@/components/admin/SettingCard";

export function StockLowThresholdForm({ initial }: { initial: { units: number } }) {
  const [units, setUnits] = useState(initial.units);
  const ref = useRef({ units });
  ref.current = { units: Math.max(0, Number(units) || 0) };

  return (
    <SettingCard
      settingKey="stock.lowThreshold"
      label="Alerta de estoque baixo"
      description="Variantes com estoque ≤ esse número aparecem no dashboard."
      getValue={() => ref.current}
    >
      <Field label="Limite (unidades)">
        <input
          type="number"
          min="0"
          value={units}
          onChange={(e) => setUnits(Number(e.target.value))}
          className={inputCls}
        />
      </Field>
    </SettingCard>
  );
}
