"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundPaymentAction } from "@/lib/admin-actions";
import { formatBRL } from "@/lib/money";

type Props = {
  orderId: string;
  paymentId: string;
  amountCents: number;
  refundedCents: number;
};

// Inline button that expands into a confirmation form. Amount defaults to
// the full remaining balance but can be overridden for partial refunds.
// Requires a ≥10-char reason plus an explicit "irreversível" checkbox.
export function RefundButton(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  const remaining = p.amountCents - p.refundedCents;
  const remainingReais = (remaining / 100).toFixed(2);

  const [amountReais, setAmountReais] = useState(remainingReais);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);

  if (remaining <= 0) {
    return <span className="text-xs text-[color:var(--foreground)]/50">já reembolsado</span>;
  }

  function submit() {
    const parsed = Number(amountReais.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setOk(false);
      setMsg("Valor inválido");
      return;
    }
    const amountCents = Math.round(parsed * 100);
    if (amountCents > remaining) {
      setOk(false);
      setMsg(`Máximo permitido: R$ ${remainingReais}`);
      return;
    }
    if (reason.trim().length < 10) {
      setOk(false);
      setMsg("Motivo precisa ter ao menos 10 caracteres");
      return;
    }
    if (!ack) {
      setOk(false);
      setMsg("Confirme que você entende que o reembolso é irreversível");
      return;
    }

    start(async () => {
      setMsg(null);
      setOk(null);
      try {
        const res = await refundPaymentAction({
          orderId: p.orderId,
          paymentId: p.paymentId,
          amountCents: amountCents === remaining && p.refundedCents === 0 ? undefined : amountCents,
          reason: reason.trim(),
        });
        if (res.ok) {
          setOk(true);
          setMsg(
            `Reembolso ${res.fullyRefunded ? "total" : "parcial"} de ${formatBRL(res.amountCents)} confirmado.`,
          );
          setOpen(false);
          router.refresh();
        } else {
          setOk(false);
          setMsg(`Falha: ${res.reason}`);
        }
      } catch (e) {
        setOk(false);
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1"
        >
          Reembolsar
        </button>
        {msg ? (
          <p className={`text-[10px] ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-72 space-y-2 bg-white/80 rounded-xl p-3 border border-red-200">
      <p className="text-xs font-medium">Reembolsar pagamento</p>
      <label className="block text-xs">
        <span className="text-[color:var(--foreground)]/65">
          Valor (R$) — máx {remainingReais}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={amountReais}
          onChange={(e) => setAmountReais(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-pink-200 px-2 py-1"
        />
      </label>
      <label className="block text-xs">
        <span className="text-[color:var(--foreground)]/65">Motivo (mín. 10 caracteres)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-0.5 w-full rounded-lg border border-pink-200 px-2 py-1"
        />
      </label>
      <label className="flex items-start gap-1.5 text-[11px] text-[color:var(--foreground)]/80">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5 accent-red-500"
        />
        <span>Entendo que o reembolso é irreversível</span>
      </label>
      {msg ? (
        <p className={`text-[10px] ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>
      ) : null}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
        >
          {pending ? "…" : "Confirmar reembolso"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMsg(null);
          }}
          className="text-xs text-[color:var(--foreground)]/65"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
