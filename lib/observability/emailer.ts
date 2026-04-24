import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { sendEmail, emailConfigured } from "@/lib/notifications/channels/email";
import { SITE_URL } from "@/lib/config";
import { AlertSeverity } from "@/lib/generated/prisma/enums";

/**
 * Alert emailer — sends a consolidated digest to the recipient list.
 *
 * Batching: one email per scanner pass, listing every open alert that is
 * either (a) never emailed, or (b) last emailed outside the cooldown
 * window. This avoids spamming the admin with one message per failure
 * while still re-reminding them if something stays broken.
 */

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  INFO: "Info",
  WARN: "Atenção",
  ERROR: "Crítico",
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  INFO: "#3b82f6",
  WARN: "#d97706",
  ERROR: "#dc2626",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTs(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export async function runEmailer(): Promise<{
  sent: number;
  skippedByCooldown: number;
  recipients: string[];
}> {
  const cfg = await getSetting("alerts.config");
  if (!cfg.enabled || cfg.recipients.length === 0) {
    return { sent: 0, skippedByCooldown: 0, recipients: [] };
  }
  if (!(await emailConfigured())) {
    // Can't send — scanner still ran, alerts still in DB. Admin sees them
    // in /admin/observability even without email.
    return { sent: 0, skippedByCooldown: 0, recipients: [] };
  }

  const cooldownMs = cfg.emailCooldownMinutes * 60 * 1000;
  const now = new Date();

  const openAlerts = await prisma.alert.findMany({
    where: { resolvedAt: null },
    orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
  });

  const due = openAlerts.filter(
    (a) => a.emailedAt === null || now.getTime() - a.emailedAt.getTime() >= cooldownMs,
  );
  const skippedByCooldown = openAlerts.length - due.length;

  if (due.length === 0) {
    return { sent: 0, skippedByCooldown, recipients: cfg.recipients };
  }

  const mostSevere: AlertSeverity = due.some((a) => a.severity === AlertSeverity.ERROR)
    ? AlertSeverity.ERROR
    : due.some((a) => a.severity === AlertSeverity.WARN)
      ? AlertSeverity.WARN
      : AlertSeverity.INFO;

  const subject = `[Brilho de Diva · ${SEVERITY_LABEL[mostSevere]}] ${due.length} alerta${due.length > 1 ? "s" : ""} aberto${due.length > 1 ? "s" : ""}`;

  const rows = due
    .map((a) => {
      const color = SEVERITY_COLOR[a.severity];
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;vertical-align:top;width:90px;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:600;">
              ${SEVERITY_LABEL[a.severity]}
            </span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;">
            <div style="font-weight:600;color:#111;font-size:14px;">${esc(a.title)}</div>
            <div style="color:#444;font-size:13px;margin-top:3px;">${esc(a.message)}</div>
            <div style="color:#888;font-size:11px;margin-top:5px;">
              ${esc(a.category)} · visto ${a.occurrences}× · última ${fmtTs(a.lastSeenAt)}
              <span style="color:#bbb;"> · ${esc(a.signature)}</span>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#ff86bd,#d23a85);padding:20px 24px;border-radius:14px 14px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Observabilidade · Brilho de Diva</h1>
        <p style="margin:4px 0 0;color:#fff;opacity:0.85;font-size:13px;">
          ${due.length} alerta${due.length > 1 ? "s" : ""} aberto${due.length > 1 ? "s" : ""}.
          ${skippedByCooldown > 0 ? `(${skippedByCooldown} em cooldown, não repetidos neste e-mail.)` : ""}
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;">
        ${rows}
      </table>
      <div style="padding:16px 24px;background:#fafafa;border-radius:0 0 14px 14px;font-size:12px;color:#666;">
        <p style="margin:0 0 6px;">
          Ver detalhes e resolver em:
          <a href="${SITE_URL}/admin/observability" style="color:#d23a85;">${SITE_URL}/admin/observability</a>
        </p>
        <p style="margin:0;color:#999;">
          Este e-mail foi enviado automaticamente pelo scanner de alertas. Para alterar destinatários
          ou limites, edite em <a href="${SITE_URL}/admin/observability" style="color:#d23a85;">Configurações da observabilidade</a>.
        </p>
      </div>
    </div>`;

  const text = due
    .map(
      (a) =>
        `[${SEVERITY_LABEL[a.severity]}] ${a.title}\n  ${a.message}\n  (${a.signature}, visto ${a.occurrences}×, última ${fmtTs(a.lastSeenAt)})\n`,
    )
    .join("\n") +
    `\nAcesse ${SITE_URL}/admin/observability para detalhes.\n`;

  let sent = 0;
  // One envelope per recipient so a bounce on one address doesn't drop the
  // others. Emails are small; the iteration cost is trivial.
  for (const to of cfg.recipients) {
    try {
      await sendEmail({ to, subject, html, text });
      sent++;
    } catch (err) {
      console.error(`[emailer] send to ${to} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Even if some recipients failed, mark the batch emailed — the cooldown
  // prevents an immediate retry storm. The admin still sees the alerts.
  if (sent > 0) {
    await prisma.alert.updateMany({
      where: { id: { in: due.map((a) => a.id) } },
      data: { emailedAt: now },
    });
  }

  return { sent, skippedByCooldown, recipients: cfg.recipients };
}
