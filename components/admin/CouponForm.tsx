"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCoupon } from "@/lib/coupon-actions";
import { CouponType } from "@/lib/generated/prisma/enums";

export function CouponForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<CouponType>(CouponType.PERCENT);

  return (
    <form
      className="glass-card rounded-2xl p-5 grid sm:grid-cols-6 gap-3 items-end"
      action={(fd) => {
        const code = String(fd.get("code") ?? "");
        const value = Number(fd.get("value") ?? 0);
        const min = Number(fd.get("minSubtotal") ?? 0);
        const usageLimit = fd.get("usageLimit") ? Number(fd.get("usageLimit")) : undefined;
        start(async () => {
          try {
            await createCoupon({
              code,
              type,
              value: type === CouponType.PERCENT ? value : Math.round(value * 100),
              minSubtotalCents: Math.round(min * 100),
              usageLimit,
            });
            setMsg("Cupom criado!");
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Erro");
          }
        });
      }}
    >
      <label className="sm:col-span-2">
        <span className="text-xs">Código</span>
        <input name="code" required className="mt-1 w-full uppercase rounded-xl bg-white/80 border border-white px-3 py-2 text-sm" />
      </label>
      <label>
        <span className="text-xs">Tipo</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CouponType)}
          className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm"
        >
          <option value={CouponType.PERCENT}>% off</option>
          <option value={CouponType.FIXED}>R$ off</option>
        </select>
      </label>
      <label>
        <span className="text-xs">{type === CouponType.PERCENT ? "Valor (1-100)" : "Valor (R$)"}</span>
        <input name="value" type="number" step="0.01" min="1" required className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm" />
      </label>
      <label>
        <span className="text-xs">Mín. (R$)</span>
        <input name="minSubtotal" type="number" step="0.01" min="0" defaultValue="0" className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm" />
      </label>
      <label>
        <span className="text-xs">Uso máx.</span>
        <input name="usageLimit" type="number" min="1" placeholder="∞" className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm" />
      </label>
      <div className="sm:col-span-6 flex items-center justify-between">
        <button disabled={pending} className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-5 py-2">
          {pending ? "Criando…" : "Criar cupom"}
        </button>
        {msg ? <span className="text-sm text-[color:var(--pink-600)]">{msg}</span> : null}
      </div>
    </form>
  );
}
