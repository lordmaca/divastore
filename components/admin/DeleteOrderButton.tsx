"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOrderAction } from "@/lib/admin-actions";

type Props = {
  orderId: string;
  /**
   * Pre-computed from `canDeleteOrder` on the server so the UI shows
   * the friendly refusal message without an extra round-trip.
   */
  canDelete: boolean;
  refusalMessage?: string | null;
  alreadyDeleted: boolean;
};

export function DeleteOrderButton({ orderId, canDelete, refusalMessage, alreadyDeleted }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (alreadyDeleted) {
    return (
      <p className="text-xs text-[color:var(--foreground)]/65">
        Este pedido já foi excluído. Ele continua no banco de dados para fins de auditoria, mas não aparece mais nas listas por padrão.
      </p>
    );
  }

  if (!canDelete) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-medium">Exclusão bloqueada</p>
        <p className="mt-0.5">{refusalMessage ?? "Há dados que impedem a exclusão."}</p>
      </div>
    );
  }

  function submit() {
    if (reason.trim().length < 10) {
      setMsg("Motivo precisa ter ao menos 10 caracteres");
      return;
    }
    if (!ack) {
      setMsg("Marque a confirmação para prosseguir");
      return;
    }
    start(async () => {
      setMsg(null);
      const res = await deleteOrderAction({ orderId, reason });
      if (res.ok) {
        router.push("/admin/pedidos");
        router.refresh();
      } else {
        setMsg(res.message);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-white hover:bg-red-50 border border-red-300 text-red-700 text-xs font-medium px-3 py-1.5"
      >
        Excluir pedido
      </button>
    );
  }

  return (
    <div className="w-full sm:max-w-md rounded-xl border border-red-200 bg-red-50/80 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800">Excluir pedido</p>
      <p className="text-xs text-red-900/80">
        A exclusão é <strong>soft-delete</strong> — o pedido é ocultado das listas, mas o registro
        permanece no banco de dados para auditoria. NF-e, pagamentos e histórico seguem intactos.
      </p>
      <label className="block text-xs">
        <span className="text-red-900/80">Motivo (mín. 10 caracteres)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-red-200 bg-white px-2 py-1.5 text-sm"
          placeholder="Ex: Pedido duplicado criado por erro — cliente pagou apenas o pedido #42"
        />
      </label>
      <label className="flex items-start gap-1.5 text-xs text-red-900/80">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5 accent-red-600"
        />
        <span>Entendo que o pedido será ocultado e que esta ação é registrada na linha do tempo.</span>
      </label>
      {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
        >
          {pending ? "…" : "Confirmar exclusão"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMsg(null);
            setReason("");
            setAck(false);
          }}
          className="text-xs text-[color:var(--foreground)]/65"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
