import { NotConfiguredError, TransportError } from "../errors";
import { getSetting } from "@/lib/settings";
import { getSecret } from "@/lib/settings/config";

// Async config resolver — reads from SettingsKv (admin-editable, encrypted
// where secret). Env fallback was removed in Phase D of the settings-first
// migration; configure everything via /admin/configuracoes → E-mail.
async function loadEmailConfig(): Promise<{
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  replyTo: string;
}> {
  const plain = await getSetting("email.smtp");
  const [user, pass] = await Promise.all([
    getSecret("email.smtp.user"),
    getSecret("email.smtp.pass"),
  ]);

  return {
    host: plain.host,
    port: plain.port,
    user: user ?? "",
    pass: pass ?? "",
    from: plain.from,
    replyTo: plain.replyTo ?? "",
  };
}

export async function emailConfigured(): Promise<boolean> {
  const c = await loadEmailConfig();
  return Boolean(c.host && c.port && c.user && c.pass && c.from);
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // For marketing templates (e.g. abandoned_cart): adds List-Unsubscribe
  // header + footer link. Transactional messages leave this false.
  includeUnsubscribe?: boolean;
  unsubscribeUrl?: string;
};

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const cfg = await loadEmailConfig();
  if (!(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from)) {
    throw new NotConfiguredError("email");
  }
  if (!Number.isFinite(cfg.port)) {
    throw new NotConfiguredError("email (porta inválida)");
  }

  // Lazy import — keeps CLI scripts (seed, rollup) from paying the
  // nodemailer startup cost when they don't send email.
  const { createTransport } = await import("nodemailer");
  const transport = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const headers: Record<string, string> = {};
  if (msg.includeUnsubscribe && msg.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    await transport.sendMail({
      from: cfg.from,
      to: msg.to,
      replyTo: cfg.replyTo || undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      headers,
    });
  } catch (err) {
    throw new TransportError("email", err);
  }
}
