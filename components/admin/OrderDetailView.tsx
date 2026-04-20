import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ORDER_EVENT_LABEL, FULFILLED_ORDER_STATE_SET } from "@/lib/orders";
import { RetryPublishButton } from "@/components/admin/RetryPublishButton";
import { OrderShipControls } from "@/components/admin/OrderShipControls";
import { InvoiceCard } from "@/components/admin/InvoiceCard";
import { RefundButton } from "@/components/admin/RefundButton";
import { ShippingLabelCard } from "@/components/admin/ShippingLabelCard";
import { DeleteOrderButton } from "@/components/admin/DeleteOrderButton";
import { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { canDeleteOrder, REASON_LABEL } from "@/lib/orders/delete";

// Server component rendered by BOTH the full-page admin detail route and
// the intercepting-route modal overlay. Takes the orderId, fetches all
// cards' data in one round-trip, and composes the UI. Keeps both surfaces
// in lockstep — no risk of drift.

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  AWAITING_PAYMENT: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  PACKED: "bg-emerald-100 text-emerald-800",
  SHIPPED: "bg-sky-100 text-sky-800",
  DELIVERED: "bg-sky-100 text-sky-800",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-red-100 text-red-700",
};

const PAYMENT_STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  IN_PROCESS: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-red-100 text-red-700",
  CHARGED_BACK: "bg-red-100 text-red-700",
};

export async function OrderDetailView({
  orderId,
  showBackLink = true,
}: {
  orderId: string;
  showBackLink?: boolean;
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { include: { variant: { include: { product: { select: { slug: true } } } } } },
      payments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      invoices: { orderBy: { createdAt: "desc" }, take: 1 },
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) notFound();
  const latestInvoice = order.invoices[0] ?? null;
  const latestShipment = order.shipments[0] ?? null;

  const addr = order.shippingAddress as Record<string, string>;
  const customerOrderCount = order.customerId
    ? await prisma.order.count({ where: { customerId: order.customerId } })
    : 0;

  const deleteGate = await canDeleteOrder(order.id);
  const alreadyDeleted = Boolean(order.deletedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {showBackLink ? (
            <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/60">
              <Link href="/admin/pedidos" className="hover:underline">
                ← Pedidos
              </Link>
            </p>
          ) : null}
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
            Pedido #{order.number}
          </h1>
          <p className="text-sm text-[color:var(--foreground)]/65">
            Criado em {new Date(order.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_TONE[order.status] ?? ""}`}
          >
            {order.status}
          </span>
          <span className="text-xl font-semibold text-[color:var(--pink-600)]">
            {formatBRL(order.totalCents)}
          </span>
        </div>
      </div>

      {/* Cliente */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Cliente
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium">{order.customer?.name ?? addr.recipient ?? "—"}</p>
            <p className="text-[color:var(--foreground)]/70">{order.customer?.email ?? "—"}</p>
            <p className="text-[color:var(--foreground)]/70">{order.customer?.phone ?? "—"}</p>
            {order.customer?.cpf ? (
              <p className="text-[color:var(--foreground)]/70">CPF: {order.customer.cpf}</p>
            ) : null}
            {order.customer?.guest ? (
              <p className="mt-1 inline-block text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                convidado
              </p>
            ) : null}
            {order.customerId ? (
              <p className="mt-2 text-xs text-[color:var(--foreground)]/60">
                Total de pedidos deste cliente: <strong>{customerOrderCount}</strong>
              </p>
            ) : null}
          </div>
          <address className="not-italic text-[color:var(--foreground)]/75 leading-relaxed">
            {addr.recipient}
            <br />
            {addr.street}, {addr.number}
            {addr.complement ? ` — ${addr.complement}` : ""}
            <br />
            {addr.district} — {addr.city}/{addr.state}
            <br />
            CEP {addr.cep}
          </address>
        </div>
      </section>

      {/* Itens */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Itens
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[color:var(--foreground)]/55">
              <th className="pb-2">SKU</th>
              <th className="pb-2">Produto</th>
              <th className="pb-2 text-right">Qt</th>
              <th className="pb-2 text-right">Unit.</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-t border-white/60">
                <td className="py-2 font-mono text-xs">{it.sku}</td>
                <td className="py-2">{it.nameSnapshot}</td>
                <td className="py-2 text-right">{it.qty}</td>
                <td className="py-2 text-right">{formatBRL(it.unitPriceCents)}</td>
                <td className="py-2 text-right font-medium">{formatBRL(it.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 pt-3 border-t border-white/60 space-y-1 text-sm max-w-xs ml-auto">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frete</span>
            <span>{order.shippingCents > 0 ? formatBRL(order.shippingCents) : "Grátis"}</span>
          </div>
          {order.discountCents > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto {order.couponCode ? `(${order.couponCode})` : ""}</span>
              <span>−{formatBRL(order.discountCents)}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-1 font-semibold text-lg">
            <span>Total</span>
            <span className="text-[color:var(--pink-600)]">{formatBRL(order.totalCents)}</span>
          </div>
        </div>
      </section>

      {/* Pagamento */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Pagamento
        </h2>
        {order.payments.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/60">Sem registros de pagamento.</p>
        ) : (
          <div className="space-y-4">
            {order.payments.map((p) => (
              <div key={p.id} className="border border-white/60 rounded-xl p-4 bg-white/40">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{p.method}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYMENT_STATUS_TONE[p.status] ?? ""}`}
                  >
                    {p.status}
                  </span>
                  {p.installments && p.installments > 1 ? (
                    <span className="text-xs text-[color:var(--foreground)]/65">
                      {p.installments}x de {p.installmentAmountCents ? formatBRL(p.installmentAmountCents) : "?"}
                    </span>
                  ) : null}
                  {p.cardLastFour ? (
                    <span className="text-xs text-[color:var(--foreground)]/65 font-mono">
                      •••• {p.cardLastFour}
                    </span>
                  ) : null}
                  {p.providerId ? (
                    <span className="ml-auto text-xs font-mono text-[color:var(--foreground)]/50">
                      MP: {p.providerId}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <Money label="Bruto" value={p.amountCents} />
                  <Money label="Taxa MP" value={p.feeCents} muted />
                  <Money label="Líquido" value={p.netReceivedCents} muted />
                  {p.refundedCents > 0 ? (
                    <Money label="Reembolsado" value={p.refundedCents} muted />
                  ) : null}
                </div>
                {p.pixQrCode ? (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-[color:var(--pink-600)]">
                      Ver QR code Pix
                    </summary>
                    <pre className="mt-2 p-2 bg-white/70 rounded font-mono whitespace-pre-wrap break-all">
                      {p.pixQrCode}
                    </pre>
                  </details>
                ) : null}
                {p.boletoUrl ? (
                  <p className="mt-3 text-xs">
                    <a
                      href={p.boletoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[color:var(--pink-600)] hover:underline"
                    >
                      Abrir boleto →
                    </a>
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-[color:var(--foreground)]/50">
                  Criado em {new Date(p.createdAt).toLocaleString("pt-BR")}
                  {p.refundedAt ? ` · Reembolsado em ${new Date(p.refundedAt).toLocaleString("pt-BR")}` : ""}
                </p>
                {(p.status === PaymentStatus.APPROVED ||
                  (p.status === PaymentStatus.REFUNDED && p.refundedCents < p.amountCents)) &&
                p.providerId ? (
                  <div className="mt-3">
                    <RefundButton
                      orderId={order.id}
                      paymentId={p.id}
                      amountCents={p.amountCents}
                      refundedCents={p.refundedCents}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <InvoiceCard
        orderId={order.id}
        orderIsPaid={FULFILLED_ORDER_STATE_SET.has(order.status) && order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.REFUNDED}
        orderIsPublishedToTiny={Boolean(order.tinyOrderId)}
        invoice={latestInvoice}
      />

      <ShippingLabelCard
        orderId={order.id}
        orderIsShippable={
          order.status === OrderStatus.PAID || order.status === OrderStatus.PACKED
        }
        shippingCents={order.shippingCents}
        shippingCarrier={order.shippingCarrier}
        shippingServiceId={order.shippingServiceId}
        shippingEtaDays={order.shippingEtaDays}
        destinationCep={addr.cep}
        items={order.items.map((it) => ({
          variantId: it.variantId,
          qty: it.qty,
        }))}
        shipment={latestShipment}
      />

      {/* Manual fulfillment controls + ERP publish status — kept below the
          Shipment card because they're admin-only escape hatches. */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Ações manuais
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <RetryPublishButton
            orderId={order.id}
            alreadyPublished={Boolean(order.tinyOrderId)}
            paid={FULFILLED_ORDER_STATE_SET.has(order.status)}
          />
          <OrderShipControls
            orderId={order.id}
            status={order.status}
            trackingCode={order.trackingCode}
            shippingCarrier={order.shippingCarrier}
          />
          <span className="ml-auto text-xs text-[color:var(--foreground)]/55">
            Tiny: {order.tinyOrderId ? <span className="font-mono">{order.tinyOrderId}</span> : "não publicado"}
          </span>
        </div>
      </section>

      {alreadyDeleted ? (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 text-sm text-red-900">
          <p className="font-medium">Pedido excluído</p>
          <p className="mt-1 text-xs">
            Excluído em {order.deletedAt ? new Date(order.deletedAt).toLocaleString("pt-BR") : "?"}
            {order.deletedBy ? ` · por ${order.deletedBy}` : ""}
          </p>
          {order.deletionReason ? (
            <p className="mt-1 text-xs">Motivo: {order.deletionReason}</p>
          ) : null}
        </section>
      ) : null}

      {/* Linha do tempo */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Linha do tempo
        </h2>
        {order.events.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/60">
            Nenhum evento registrado (pedido anterior à nova timeline — execute <code>./scripts/bdd backfill-events</code>).
          </p>
        ) : (
          <ol className="space-y-3">
            {order.events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <div className="shrink-0 w-2 h-2 rounded-full bg-[color:var(--pink-500)] mt-1.5" />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{ORDER_EVENT_LABEL[e.type] ?? e.type}</span>
                    {e.message ? ` · ${e.message}` : ""}
                  </p>
                  <p className="text-xs text-[color:var(--foreground)]/55 font-mono">
                    {new Date(e.createdAt).toLocaleString("pt-BR")} · {e.actor}
                  </p>
                  {e.metadata ? (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-[color:var(--foreground)]/50">
                        ver detalhes
                      </summary>
                      <pre className="mt-1 p-2 bg-white/70 rounded text-[10px] overflow-auto">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Danger zone — destructive actions live at the bottom, clearly
          separated from the happy-path cards. */}
      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700">
            Zona de perigo
          </h2>
          <p className="text-xs text-red-900/70 mt-1">
            Ações aqui não podem ser desfeitas pela interface. Use com cuidado.
          </p>
        </div>
        <DeleteOrderButton
          orderId={order.id}
          canDelete={deleteGate.ok}
          refusalMessage={!deleteGate.ok ? REASON_LABEL[deleteGate.reason] : null}
          alreadyDeleted={alreadyDeleted}
        />
      </section>
    </div>
  );
}

function Money({
  label,
  value,
  muted,
}: {
  label: string;
  value: number | null | undefined;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-[color:var(--foreground)]/55">{label}</p>
      <p className={muted ? "text-[color:var(--foreground)]/75" : "font-medium"}>
        {value != null ? formatBRL(value) : "—"}
      </p>
    </div>
  );
}
