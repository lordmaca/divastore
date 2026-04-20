"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  issueInvoiceAction,
  reconcileInvoiceAction,
  cancelInvoiceAction,
} from "@/lib/admin-actions";

type InvoiceRow = {
  id: string;
  status: "REQUESTED" | "ISSUED" | "CANCELLED" | "FAILED";
  number: string | null;
  serie: string | null;
  accessKey: string | null;
  danfeUrl: string | null;
  xmlUrl: string | null;
  issuedAt: Date | string | null;
  cancelledAt: Date | string | null;
  cancellationReason: string | null;
  lastError: string | null;
  attempts: number;
  providerInvoiceId: string | null;
};

type Props = {
  orderId: string;
  orderIsPaid: boolean;
  orderIsPublishedToTiny: boolean;
  invoice: InvoiceRow | null;
};

const STATUS_TONE: Record<InvoiceRow["status"], string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  ISSUED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-100 text-zinc-700",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<InvoiceRow["status"], string> = {
  REQUESTED: "Aguardando SEFAZ",
  ISSUED: "Emitida",
  CANCELLED: "Cancelada",
  FAILED: "Falhou",
};

export function InvoiceCard(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  function issue() {
    start(async () => {
      setMsg(null);
      const res = await issueInvoiceAction(p.orderId);
      setMsg(
        res.ok
          ? "NF-e solicitada. Verifique o status em alguns segundos."
          : `Não foi possível solicitar: ${res.reason}`,
      );
      router.refresh();
    });
  }

  function refresh() {
    if (!p.invoice) return;
    start(async () => {
      setMsg(null);
      try {
        await reconcileInvoiceAction(p.invoice!.id);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  function cancel() {
    if (!p.invoice) return;
    start(async () => {
      setMsg(null);
      try {
        await cancelInvoiceAction(p.invoice!.id, reason);
        setCancelOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  const canIssue = !p.invoice || p.invoice.status === "FAILED" || p.invoice.status === "CANCELLED";
  const canCancel = p.invoice?.status === "ISSUED";

  return (
    <section className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65">
          Fiscal (NF-e)
        </h2>
        {p.invoice ? (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[p.invoice.status]}`}>
            {STATUS_LABEL[p.invoice.status]}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--foreground)]/55">sem emissão</span>
        )}
      </div>

      {p.invoice ? (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-[color:var(--foreground)]/55">Número / Série</p>
            <p>{p.invoice.number ? `${p.invoice.number}${p.invoice.serie ? " / " + p.invoice.serie : ""}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--foreground)]/55">Chave de acesso</p>
            <p className="font-mono text-xs break-all">{p.invoice.accessKey ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--foreground)]/55">Tiny NF id</p>
            <p className="font-mono text-xs">{p.invoice.providerInvoiceId ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--foreground)]/55">Tentativas de polling</p>
            <p>{p.invoice.attempts}</p>
          </div>
          {p.invoice.issuedAt ? (
            <div>
              <p className="text-xs text-[color:var(--foreground)]/55">Emitida em</p>
              <p>{new Date(p.invoice.issuedAt).toLocaleString("pt-BR")}</p>
            </div>
          ) : null}
          {p.invoice.cancelledAt ? (
            <div>
              <p className="text-xs text-[color:var(--foreground)]/55">Cancelada em</p>
              <p>{new Date(p.invoice.cancelledAt).toLocaleString("pt-BR")}</p>
            </div>
          ) : null}
          {p.invoice.cancellationReason ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-[color:var(--foreground)]/55">Motivo do cancelamento</p>
              <p>{p.invoice.cancellationReason}</p>
            </div>
          ) : null}
          {p.invoice.lastError ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-[color:var(--foreground)]/55">Último erro</p>
              <p className="text-red-600 text-xs">{p.invoice.lastError}</p>
            </div>
          ) : null}
        </div>
      ) : !p.orderIsPaid ? (
        <p className="text-xs text-[color:var(--foreground)]/65">
          Pedido ainda não foi pago — NF-e só pode ser emitida após aprovação do pagamento.
        </p>
      ) : !p.orderIsPublishedToTiny ? (
        <p className="text-xs text-[color:var(--foreground)]/65">
          Pedido ainda não foi publicado no Tiny — publique antes de emitir a NF-e.
        </p>
      ) : (
        <p className="text-xs text-[color:var(--foreground)]/65">
          NF-e ainda não solicitada. Com a emissão automática ligada, o pedido deve gerar a nota
          automaticamente — clique abaixo se quiser solicitar manualmente.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/60">
        {p.invoice?.danfeUrl ? (
          <a
            href={p.invoice.danfeUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3 py-1.5"
          >
            Baixar DANFE
          </a>
        ) : null}
        {p.invoice?.xmlUrl ? (
          <a
            href={p.invoice.xmlUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5"
          >
            Baixar XML
          </a>
        ) : null}
        {canIssue && p.orderIsPaid && p.orderIsPublishedToTiny ? (
          <button
            type="button"
            disabled={pending}
            onClick={issue}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
          >
            {pending ? "…" : p.invoice ? "Re-emitir" : "Emitir NF-e"}
          </button>
        ) : null}
        {p.invoice?.status === "REQUESTED" ? (
          <button
            type="button"
            disabled={pending}
            onClick={refresh}
            className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "…" : "Atualizar status"}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            onClick={() => setCancelOpen((v) => !v)}
            className="rounded-full bg-white/70 hover:bg-white border border-red-200 text-red-700 text-xs font-medium px-3 py-1.5"
          >
            Cancelar NF-e
          </button>
        ) : null}
      </div>

      {msg ? <p className="text-xs text-[color:var(--foreground)]/70">{msg}</p> : null}

      {cancelOpen ? (
        <div className="border-t border-white/60 pt-3 space-y-2">
          <p className="text-xs font-medium">Motivo (mínimo 15 caracteres)</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length < 15}
              onClick={cancel}
              className="rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
            >
              {pending ? "…" : "Confirmar cancelamento"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCancelOpen(false);
                setReason("");
              }}
              className="text-xs text-[color:var(--foreground)]/65"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
