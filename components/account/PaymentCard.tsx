"use client";

import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/money";

type Props = {
  method: "PIX" | "BOLETO" | "CARD";
  status: "PENDING" | "IN_PROCESS" | "APPROVED" | "REJECTED" | "CANCELLED" | "REFUNDED" | "CHARGED_BACK";
  amountCents: number;
  installments: number | null;
  installmentAmountCents: number | null;
  cardLastFour: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixExpiresAt: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
  boletoExpiresAt: string | null;
  refundedCents: number;
  refundedAt: string | null;
};

// pt-BR labels + status tone. Kept inside the component so the customer
// surface stays self-contained.
const STATUS_LABEL: Record<Props["status"], string> = {
  PENDING: "Aguardando pagamento",
  IN_PROCESS: "Em análise",
  APPROVED: "Pago",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  CHARGED_BACK: "Chargeback",
};

const STATUS_TONE: Record<Props["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  IN_PROCESS: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-red-100 text-red-700",
  CHARGED_BACK: "bg-red-100 text-red-700",
};

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "expirado";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${s}s` : `${s}s`;
}

export function PaymentCard(p: Props) {
  const [copied, setCopied] = useState(false);
  const remaining = useCountdown(p.pixExpiresAt ?? p.boletoExpiresAt);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* non-fatal */
    }
  }

  return (
    <section className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-sm">Pagamento</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[p.status]}`}>
          {STATUS_LABEL[p.status]}
        </span>
      </div>

      <div className="text-sm text-[color:var(--foreground)]/80 space-y-1">
        <p>
          <span className="text-[color:var(--foreground)]/55">Forma:</span>{" "}
          {p.method === "CARD"
            ? `Cartão${p.cardLastFour ? ` •••• ${p.cardLastFour}` : ""}`
            : p.method === "PIX"
              ? "Pix"
              : "Boleto"}
        </p>
        {p.installments && p.installments > 1 && p.installmentAmountCents ? (
          <p>
            <span className="text-[color:var(--foreground)]/55">Parcelamento:</span>{" "}
            {p.installments}x de {formatBRL(p.installmentAmountCents)}
          </p>
        ) : null}
        <p>
          <span className="text-[color:var(--foreground)]/55">Valor:</span>{" "}
          <strong>{formatBRL(p.amountCents)}</strong>
        </p>
        {p.refundedCents > 0 ? (
          <p className="text-red-600">
            Reembolso de <strong>{formatBRL(p.refundedCents)}</strong>
            {p.refundedAt ? ` · ${new Date(p.refundedAt).toLocaleDateString("pt-BR")}` : ""}
          </p>
        ) : null}
      </div>

      {p.status === "PENDING" && p.method === "PIX" && p.pixQrCode ? (
        <div className="border-t border-white/60 pt-3 space-y-3">
          <p className="text-sm text-[color:var(--foreground)]/80">
            Escaneie o QR code no seu app de banco ou copie o código Pix abaixo.
          </p>
          {p.pixQrCodeBase64 ? (
            <div className="flex justify-center">
              <img
                src={`data:image/png;base64,${p.pixQrCodeBase64}`}
                alt="QR code Pix"
                className="w-56 h-56 rounded-xl bg-white p-2"
              />
            </div>
          ) : null}
          <div>
            <p className="text-xs text-[color:var(--foreground)]/60 mb-1">
              Código Pix copia-e-cola:
            </p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 text-[11px] font-mono bg-white/80 rounded-xl px-3 py-2 break-all">
                {p.pixQrCode}
              </code>
              <button
                type="button"
                onClick={() => copy(p.pixQrCode!)}
                className="rounded-xl bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
          {remaining ? (
            <p className="text-xs text-[color:var(--foreground)]/65">
              Expira em <strong>{remaining}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {p.status === "PENDING" && p.method === "BOLETO" && p.boletoUrl ? (
        <div className="border-t border-white/60 pt-3 space-y-2">
          <a
            href={p.boletoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-5 py-2"
          >
            Baixar boleto (PDF)
          </a>
          {p.boletoBarcode ? (
            <div>
              <p className="text-xs text-[color:var(--foreground)]/60 mb-1">Código de barras:</p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 text-[11px] font-mono bg-white/80 rounded-xl px-3 py-2 break-all">
                  {p.boletoBarcode}
                </code>
                <button
                  type="button"
                  onClick={() => copy(p.boletoBarcode!)}
                  className="rounded-xl bg-white/80 hover:bg-white text-[color:var(--pink-600)] text-xs font-medium px-3 border border-pink-200"
                >
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          ) : null}
          {remaining ? (
            <p className="text-xs text-[color:var(--foreground)]/65">
              Vence em <strong>{remaining}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
