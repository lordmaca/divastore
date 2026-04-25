import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { sendEmail, emailConfigured } from "@/lib/notifications/channels/email";
import { SITE_URL } from "@/lib/config";

/**
 * Operational email to the team whenever an order hits PAID.
 *
 * Not the customer-facing `payment_approved` template — that goes to the
 * customer via the Notification queue. This one is internal: the merchant
 * wants to know the moment money lands. Sent to the list in
 * `notifications.adminOrders.recipients` — editable in the admin.
 *
 * Idempotent by orderId via an IntegrationRun marker row with
 * `inputHash = orderId`. MP's webhook can fire multiple times for the
 * same payment; this guarantees at most one admin email per order.
 *
 * Fire-and-forget: errors are logged to IntegrationRun (`status: error`)
 * but never thrown. The payment flow must not break if mail is down.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function fmtPt(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export async function notifyAdminNewOrder(orderId: string): Promise<void> {
  try {
    const cfg = await getSetting("notifications.adminOrders");
    if (!cfg.enabled || cfg.recipients.length === 0) return;
    if (!(await emailConfigured())) return;

    // Idempotency: one successful notification per order, lifetime.
    const already = await prisma.integrationRun.findFirst({
      where: {
        adapter: "admin_notifications",
        operation: "new_order",
        status: "ok",
        inputHash: orderId,
      },
      select: { id: true },
    });
    if (already) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        totalCents: true,
        shippingCents: true,
        discountCents: true,
        createdAt: true,
        lastPaymentMethod: true,
        shippingAddress: true,
        customer: { select: { name: true, email: true, phone: true } },
        items: {
          select: {
            qty: true,
            unitPriceCents: true,
            totalCents: true,
            nameSnapshot: true,
            sku: true,
          },
        },
      },
    });
    if (!order) return;

    const addr = (order.shippingAddress ?? {}) as {
      recipient?: string;
      cep?: string;
      street?: string;
      number?: string;
      complement?: string;
      district?: string;
      city?: string;
      state?: string;
    };
    const customerName = order.customer?.name ?? addr.recipient ?? "—";
    const customerEmail = order.customer?.email ?? "";
    const customerPhone = order.customer?.phone ?? "";
    const adminUrl = `${SITE_URL}/admin/pedidos`;

    const subject =
      `✨ Novo pedido #${order.number} — ${fmtBRL(order.totalCents)} — ${customerName}`;

    const itemsRowsHtml = order.items
      .map(
        (it) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f0eaf3;">${it.qty}×</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0eaf3;">
              ${esc(it.nameSnapshot)}
              <div style="color:#888;font-size:11px;font-family:monospace;">${esc(it.sku)}</div>
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0eaf3;text-align:right;">
              ${fmtBRL(it.totalCents)}
            </td>
          </tr>`,
      )
      .join("");

    const itemsText = order.items
      .map((it) => `  ${it.qty}× ${it.nameSnapshot} (${it.sku}) — ${fmtBRL(it.totalCents)}`)
      .join("\n");

    const addressHtml = addr.street
      ? `${esc(addr.street)}, ${esc(addr.number ?? "s/n")}` +
        (addr.complement ? ` · ${esc(addr.complement)}` : "") +
        `<br/>${esc(addr.district ?? "")} · ${esc(addr.city ?? "")}/${esc(addr.state ?? "")}` +
        (addr.cep ? ` · CEP ${esc(addr.cep)}` : "")
      : "—";

    const addressText = addr.street
      ? `${addr.street}, ${addr.number ?? "s/n"}${addr.complement ? ` · ${addr.complement}` : ""}\n` +
        `${addr.district ?? ""} · ${addr.city ?? ""}/${addr.state ?? ""}` +
        (addr.cep ? ` · CEP ${addr.cep}` : "")
      : "—";

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;color:#333;">
        <div style="background:linear-gradient(135deg,#ff86bd,#d23a85);padding:20px 24px;border-radius:14px 14px 0 0;color:#fff;">
          <div style="opacity:0.9;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Brilho de Diva · Admin</div>
          <h1 style="margin:4px 0 0;font-size:22px;">Novo pedido #${order.number}</h1>
          <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">
            Pagamento aprovado · ${fmtPt(order.createdAt)}
            ${order.lastPaymentMethod ? ` · ${esc(order.lastPaymentMethod)}` : ""}
          </p>
        </div>

        <div style="background:#fff;padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:13px;color:#888;">Total</p>
          <p style="margin:0 0 18px;font-size:28px;font-weight:700;color:#d23a85;">
            ${fmtBRL(order.totalCents)}
          </p>

          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px;">
            <thead>
              <tr style="text-align:left;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">
                <th style="padding:6px 10px;">Qtd</th>
                <th style="padding:6px 10px;">Item</th>
                <th style="padding:6px 10px;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsRowsHtml}</tbody>
          </table>

          <div style="font-size:12px;color:#666;margin:4px 0 14px;">
            Frete ${fmtBRL(order.shippingCents)}
            ${order.discountCents > 0 ? ` · Desconto ${fmtBRL(order.discountCents)}` : ""}
          </div>

          <div style="background:#fff0f7;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#d23a85;">Cliente</p>
            <p style="margin:4px 0 0;font-size:14px;">
              <strong>${esc(customerName)}</strong>
              ${customerEmail ? `<br/><span style="color:#555;">${esc(customerEmail)}</span>` : ""}
              ${customerPhone ? ` · ${esc(customerPhone)}` : ""}
            </p>
          </div>

          <div style="background:#fdf6fb;border-radius:10px;padding:12px 14px;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#d23a85;">Endereço de entrega</p>
            <p style="margin:4px 0 0;font-size:13px;line-height:1.55;">${addressHtml}</p>
          </div>

          <div style="text-align:center;margin-top:22px;">
            <a href="${adminUrl}" style="display:inline-block;background:#d23a85;color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:600;font-size:13px;">
              Abrir no admin →
            </a>
          </div>
        </div>

        <div style="padding:12px 24px;background:#fafafa;border-radius:0 0 14px 14px;font-size:11px;color:#999;text-align:center;">
          E-mail automático · editar destinatários em
          <a href="${SITE_URL}/admin/observability" style="color:#d23a85;">Observability</a>
        </div>
      </div>`;

    const text =
      `Novo pedido #${order.number} — ${fmtBRL(order.totalCents)}\n` +
      `Cliente: ${customerName}${customerEmail ? ` <${customerEmail}>` : ""}` +
      `${customerPhone ? ` · ${customerPhone}` : ""}\n\n` +
      `Itens:\n${itemsText}\n\n` +
      `Frete: ${fmtBRL(order.shippingCents)}\n` +
      (order.discountCents > 0 ? `Desconto: ${fmtBRL(order.discountCents)}\n` : "") +
      `Total: ${fmtBRL(order.totalCents)}\n\n` +
      `Endereço:\n${addressText}\n\n` +
      `Abrir no admin: ${adminUrl}\n`;

    const started = Date.now();
    let sent = 0;
    const errors: string[] = [];
    for (const to of cfg.recipients) {
      try {
        await sendEmail({ to, subject, html, text });
        sent++;
      } catch (err) {
        errors.push(`${to}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await prisma.integrationRun.create({
      data: {
        adapter: "admin_notifications",
        operation: "new_order",
        status: sent > 0 ? "ok" : "error",
        durationMs: Date.now() - started,
        inputHash: orderId,
        error: errors.length ? errors.join(" | ").slice(0, 500) : null,
        payload: {
          orderId,
          orderNumber: order.number,
          totalCents: order.totalCents,
          sent,
          attempted: cfg.recipients.length,
        } as never,
      },
    });
  } catch (err) {
    console.error("[notifyAdminNewOrder] failed:", err);
  }
}
