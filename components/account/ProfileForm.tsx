"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateProfileAction,
  changePasswordAction,
  type ProfileResult,
} from "@/app/(account)/minha-conta/perfil/actions";
import { formatCpf } from "@/lib/cpf";

type Props = {
  defaults: {
    name: string;
    email: string;
    phone: string;
    cpf: string;
    marketingOptIn: boolean;
    whatsappOptIn: boolean;
  };
};

export function ProfileForm({ defaults }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [profileMsg, setProfileMsg] = useState<ProfileResult | null>(null);

  const [pwPending, startPw] = useTransition();
  const [pwMsg, setPwMsg] = useState<ProfileResult | null>(null);

  async function onProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateProfileAction(fd);
      setProfileMsg(res);
      if (res.ok) router.refresh();
    });
  }

  async function onPwSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startPw(async () => {
      const res = await changePasswordAction(fd);
      setPwMsg(res);
      if (res.ok) form.reset();
    });
  }

  return (
    <div className="space-y-6">
      {/* Dados pessoais */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold text-lg mb-4">Dados pessoais</h2>
        <form onSubmit={onProfileSubmit} className="space-y-4">
          <Field
            label="Nome completo"
            name="name"
            defaultValue={defaults.name}
            required
            autoComplete="name"
          />
          <Field
            label="E-mail"
            name="email"
            defaultValue={defaults.email}
            disabled
            hint="O e-mail não pode ser alterado — é seu identificador de login."
          />
          <Field
            label="Celular / WhatsApp"
            name="phone"
            type="tel"
            defaultValue={defaults.phone}
            placeholder="(11) 91234-5678"
            inputMode="tel"
            autoComplete="tel"
          />
          <Field
            label="CPF"
            name="cpf"
            defaultValue={defaults.cpf ? formatCpf(defaults.cpf) : ""}
            placeholder="000.000.000-00"
            required
            hint="Obrigatório para emissão da nota fiscal eletrônica (NF-e) e geração da etiqueta de envio."
          />

          <h3 className="font-medium pt-2">Preferências de comunicação</h3>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="marketingOptIn"
              defaultChecked={defaults.marketingOptIn}
              className="mt-1 accent-pink-500"
            />
            <span>Quero receber novidades, promoções e lançamentos por e-mail.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="whatsappOptIn"
              defaultChecked={defaults.whatsappOptIn}
              className="mt-1 accent-pink-500"
            />
            <span>
              Quero receber atualizações de pedido por WhatsApp. <em>Stub — ainda não ativo.</em>
            </span>
          </label>
          <p className="text-xs text-[color:var(--foreground)]/60">
            Mensagens transacionais (confirmação de pedido, rastreio, redefinição de senha) são
            sempre enviadas — só o marketing gate nessas opções.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-5 py-2"
            >
              {pending ? "Salvando…" : "Salvar alterações"}
            </button>
            {profileMsg ? (
              <span
                className={`text-sm ${profileMsg.ok ? "text-emerald-700" : "text-red-600"}`}
              >
                {profileMsg.ok ? "Dados atualizados." : profileMsg.error}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      {/* Segurança */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold text-lg mb-4">Alterar senha</h2>
        <form onSubmit={onPwSubmit} className="space-y-4 max-w-md">
          <Field
            label="Senha atual"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Field
            label="Nova senha"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
          <Field
            label="Confirmar nova senha"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pwPending}
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-5 py-2"
            >
              {pwPending ? "Salvando…" : "Alterar senha"}
            </button>
            {pwMsg ? (
              <span className={`text-sm ${pwMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
                {pwMsg.ok ? "Senha alterada com sucesso." : pwMsg.error}
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function Field(p: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  inputMode?: "tel" | "email" | "text" | "numeric";
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{p.label}</span>
      <input
        name={p.name}
        type={p.type ?? "text"}
        defaultValue={p.defaultValue}
        placeholder={p.placeholder}
        autoComplete={p.autoComplete}
        required={p.required}
        disabled={p.disabled}
        minLength={p.minLength}
        inputMode={p.inputMode}
        className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {p.hint ? <p className="mt-1 text-xs text-[color:var(--foreground)]/60">{p.hint}</p> : null}
    </label>
  );
}
