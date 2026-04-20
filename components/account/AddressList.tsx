"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CepAutofill } from "@/components/checkout/CepAutofill";
import {
  createAddressAction,
  updateAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  type AddressResult,
} from "@/app/(account)/minha-conta/enderecos/actions";

export type AddressDto = {
  id: string;
  label: string | null;
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  isDefault: boolean;
};

export function AddressList({ addresses }: { addresses: AddressDto[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(addresses.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<AddressResult | null>(null);
  const [pending, start] = useTransition();

  function handle(result: AddressResult) {
    setMsg(result);
    if (result.ok) {
      setAdding(false);
      setEditingId(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.ok ? "Endereço salvo." : msg.error}
        </p>
      ) : null}

      {addresses.length === 0 && !adding ? (
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-[color:var(--foreground)]/70 mb-4">
            Você ainda não cadastrou endereços.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-5 py-2"
          >
            Adicionar endereço
          </button>
        </div>
      ) : null}

      <ul className="space-y-3">
        {addresses.map((a) =>
          editingId === a.id ? (
            <li key={a.id}>
              <AddressForm
                defaults={a}
                submitLabel="Salvar alterações"
                onCancel={() => setEditingId(null)}
                onSubmit={async (fd) => handle(await updateAddressAction(a.id, fd))}
              />
            </li>
          ) : (
            <li
              key={a.id}
              className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            >
              <div className="text-sm leading-relaxed">
                <p className="font-medium">
                  {a.label || a.recipient}
                  {a.isDefault ? (
                    <span className="ml-2 text-[10px] bg-pink-100 text-[color:var(--pink-600)] px-2 py-0.5 rounded-full">
                      padrão
                    </span>
                  ) : null}
                </p>
                {a.label ? (
                  <p className="text-[color:var(--foreground)]/80">{a.recipient}</p>
                ) : null}
                <p className="text-[color:var(--foreground)]/80">
                  {a.street}, {a.number}
                  {a.complement ? ` — ${a.complement}` : ""}
                </p>
                <p className="text-[color:var(--foreground)]/80">
                  {a.district} — {a.city}/{a.state}
                </p>
                <p className="text-[color:var(--foreground)]/65">
                  CEP {a.cep.slice(0, 5)}-{a.cep.slice(5)}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2 shrink-0">
                {!a.isDefault ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => handle(await setDefaultAddressAction(a.id)))
                    }
                    className="rounded-full bg-white/80 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1"
                  >
                    Tornar padrão
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(a.id);
                    setAdding(false);
                  }}
                  className="rounded-full bg-white/80 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!confirm("Excluir este endereço?")) return;
                      handle(await deleteAddressAction(a.id));
                    })
                  }
                  className="rounded-full bg-white/80 hover:bg-white border border-red-200 text-red-600 text-xs font-medium px-3 py-1"
                >
                  Excluir
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <AddressForm
          submitLabel="Adicionar endereço"
          onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
          onSubmit={async (fd) => handle(await createAddressAction(fd))}
        />
      ) : addresses.length > 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-5 py-2"
        >
          + Adicionar outro endereço
        </button>
      ) : null}
    </div>
  );
}

function AddressForm(props: {
  defaults?: Partial<AddressDto>;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const d = props.defaults ?? {};

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await props.onSubmit(fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="glass-card rounded-2xl p-5 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Apelido (opcional)"
          name="label"
          defaultValue={d.label ?? ""}
          placeholder="Ex: Casa, Trabalho"
        />
        <Field
          label="Destinatário"
          name="recipient"
          defaultValue={d.recipient ?? ""}
          required
          autoComplete="name"
        />
      </div>
      <div className="grid sm:grid-cols-[1fr_80px] gap-3">
        <Field
          label="CEP"
          name="cep"
          defaultValue={d.cep ?? ""}
          required
          pattern="\d{5}-?\d{3}"
          autoComplete="postal-code"
          inputMode="numeric"
        />
        <Field label="UF" name="state" defaultValue={d.state ?? ""} required maxLength={2} />
      </div>
      <Field label="Rua" name="street" defaultValue={d.street ?? ""} required autoComplete="address-line1" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Número" name="number" defaultValue={d.number ?? ""} required />
        <Field label="Complemento" name="complement" defaultValue={d.complement ?? ""} />
      </div>
      <Field label="Bairro" name="district" defaultValue={d.district ?? ""} required />
      <Field label="Cidade" name="city" defaultValue={d.city ?? ""} required autoComplete="address-level2" />

      <CepAutofill
        cepFieldName="cep"
        targets={{ street: "street", district: "district", city: "city", state: "state" }}
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-5 py-2"
        >
          {pending ? "Salvando…" : props.submitLabel}
        </button>
        {props.onCancel ? (
          <button
            type="button"
            onClick={props.onCancel}
            className="text-sm text-[color:var(--foreground)]/65 hover:text-[color:var(--pink-600)]"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field(p: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "text" | "numeric";
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{p.label}</span>
      <input
        name={p.name}
        defaultValue={p.defaultValue}
        placeholder={p.placeholder}
        required={p.required}
        maxLength={p.maxLength}
        pattern={p.pattern}
        autoComplete={p.autoComplete}
        inputMode={p.inputMode}
        className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300"
      />
    </label>
  );
}
