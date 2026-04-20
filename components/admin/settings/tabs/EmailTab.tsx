"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveSettingAction,
  saveSecretAction,
  clearSecretAction,
  testEmailAction,
} from "@/lib/admin-actions";
import {
  TextField,
  NumberField,
  SecretField,
  FieldGrid,
  useDraft,
} from "@/components/admin/settings/fields";
import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";

type EmailSmtp = {
  host: string;
  port: number;
  from: string;
  replyTo?: string;
};

type SecretStatus = {
  configured: boolean;
  source: "db" | null;
  last4: string | null;
};

type Props = {
  smtp: EmailSmtp;
  userSecret: SecretStatus;
  passSecret: SecretStatus;
  canSend: boolean;   // emailConfigured() snapshot at render time
  adminEmail: string; // prefills the "test-email" input
};

export function EmailTab(p: Props) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<EmailSmtp>({
    host: p.smtp.host,
    port: p.smtp.port,
    from: p.smtp.from,
    replyTo: p.smtp.replyTo ?? "",
  });
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState<boolean | null>(null);

  const [testTo, setTestTo] = useState(p.adminEmail);
  const [testing, startTesting] = useTransition();
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  function savePlain() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("email.smtp", {
          host: draft.host.trim(),
          port: draft.port,
          from: draft.from.trim(),
          replyTo: draft.replyTo?.trim() || "",
        });
        reset({ ...draft, replyTo: draft.replyTo?.trim() ?? "" });
        setMsgOk(true);
        setMsg("Configuração salva.");
        router.refresh();
      } catch (e) {
        setMsgOk(false);
        setMsg(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  function runTest() {
    startTesting(async () => {
      setTestMsg(null);
      const r = await testEmailAction(testTo);
      setTestOk(r.ok);
      setTestMsg(r.ok ? `E-mail enviado para ${testTo}` : `Falha: ${r.error}`);
    });
  }

  const statusOk: boolean | "partial" =
    p.canSend
      ? true
      : p.userSecret.configured || p.passSecret.configured || p.smtp.host
        ? "partial"
        : false;

  return (
    <div className="space-y-5">
      <TabHeader
        title="E-mail (SMTP)"
        description="Credenciais e remetente para os e-mails transacionais. Usuário e senha ficam criptografados em AES-256-GCM. Aceita qualquer provedor SMTP (Gmail App Password, Resend, SendGrid, Postmark, Zoho)."
      />

      <StatusStrip
        ok={statusOk}
        label={
          p.canSend
            ? "Configuração completa — pronto para enviar"
            : statusOk === "partial"
              ? "Configuração parcial — faltam campos"
              : "Não configurado"
        }
      />

      <SettingsSection
        title="Servidor SMTP"
        description="Host, porta e remetente. Mudanças valem em até 30 segundos (cache interno)."
      >
        <FieldGrid cols={2}>
          <TextField
            label="Host SMTP"
            placeholder="smtp.gmail.com"
            value={draft.host}
            onChange={(v) => patch("host", v)}
            required
          />
          <NumberField
            label="Porta"
            value={draft.port}
            onChange={(v) => patch("port", v)}
            min={1}
            max={65535}
            description="465 (TLS) · 587 (STARTTLS) · 25 (sem TLS)"
            required
          />
          <TextField
            label="Remetente (From)"
            placeholder="Brilho de Diva <contato@brilhodediva.com.br>"
            value={draft.from}
            onChange={(v) => patch("from", v)}
            required
          />
          <TextField
            label="Reply-To (opcional)"
            placeholder="contato@brilhodediva.com.br"
            value={draft.replyTo ?? ""}
            onChange={(v) => patch("replyTo", v)}
            type="email"
          />
        </FieldGrid>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={savePlain}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
          >
            {saving ? "…" : "Salvar servidor"}
          </button>
          {msg ? (
            <span className={`text-xs ${msgOk ? "text-emerald-700" : "text-red-600"}`}>
              {msg}
            </span>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Credenciais"
        description="Nunca voltam em texto claro. Se precisar verificar, rode bdd test-email."
      >
        <div className="space-y-4">
          <SecretField
            label="Usuário SMTP"
            description="Geralmente o e-mail da conta (Gmail / Zoho) ou o usuário fornecido pelo provedor."
            configured={p.userSecret.configured}
            last4={p.userSecret.last4}
            source={p.userSecret.source}
            onSave={async (plaintext) => {
              await saveSecretAction("email.smtp.user", plaintext);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("email.smtp.user");
              router.refresh();
            }}
          />
          <SecretField
            label="Senha SMTP"
            description="Para Gmail: gere uma App Password em myaccount.google.com/apppasswords."
            configured={p.passSecret.configured}
            last4={p.passSecret.last4}
            source={p.passSecret.source}
            onSave={async (plaintext) => {
              await saveSecretAction("email.smtp.pass", plaintext);
              router.refresh();
            }}
            onClear={async () => {
              await clearSecretAction("email.smtp.pass");
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Testar envio"
        description="Usa as credenciais atualmente salvas (com fallback para env)."
      >
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]">
            <TextField
              label="Destinatário"
              type="email"
              value={testTo}
              onChange={setTestTo}
              required
            />
          </div>
          <button
            type="button"
            disabled={testing || !testTo}
            onClick={runTest}
            className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] disabled:opacity-50 text-xs font-medium px-4 py-2"
          >
            {testing ? "Enviando…" : "Enviar teste"}
          </button>
        </div>
        {testMsg ? (
          <p className={`text-xs mt-2 ${testOk ? "text-emerald-700" : "text-red-600"}`}>
            {testMsg}
          </p>
        ) : null}
      </SettingsSection>
    </div>
  );
}
