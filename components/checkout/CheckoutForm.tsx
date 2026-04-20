"use client";

import { useEffect, useState } from "react";
import { CepAutofill } from "@/components/checkout/CepAutofill";
import { ShippingOptions } from "@/components/checkout/ShippingOptions";
import { formatBRL } from "@/lib/money";

type Props = {
  action: (fd: FormData) => Promise<void>;
  loggedIn: boolean;
  needsCpf: boolean;
  defaultRecipient: string;
  defaultAddress: {
    cep: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
  } | null;
  cartItems: Array<{
    id: string;
    variantId: string;
    qty: number;
    unitPriceCents: number;
    name: string;
  }>;
  subtotalCents: number;
  freeShippingThresholdCents: number;
  initialCoupon: string;
  couponOk?: { code: string; discountCents: number };
  couponError?: string | null;
  demoMode: boolean;
};

type Option = {
  serviceId: string;
  carrier: string;
  name: string;
  priceCents: number;
  etaDays: number;
};

export function CheckoutForm(props: Props) {
  const [shippingOpt, setShippingOpt] = useState<Option | null>(null);
  const [payment, setPayment] = useState<"PIX" | "CARD" | "BOLETO">("PIX");

  // Pre-fill the CEP the customer already typed on /carrinho. Writing to the
  // input value also fires CepAutofill (which listens to `input`/`change`)
  // so street/city/state populate automatically. Skip when the server
  // already seeded an address book default — defaultValue handles it.
  useEffect(() => {
    if (props.defaultAddress) return;
    try {
      const saved = localStorage.getItem("bdd:shippingCep");
      if (!saved || saved.length !== 8) return;
      const el = document.querySelector<HTMLInputElement>('input[name="cep"]');
      if (!el || el.value) return;
      el.value = `${saved.slice(0, 5)}-${saved.slice(5)}`;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      // private mode / storage disabled — noop.
    }
  }, [props.defaultAddress]);

  const shippingCents = shippingOpt?.priceCents ?? 0;
  const discountCents = props.couponOk?.discountCents ?? 0;
  const totalCents = Math.max(0, props.subtotalCents + shippingCents - discountCents);

  return (
    <form action={props.action} className="grid lg:grid-cols-[1fr_340px] gap-6">
      <div className="glass-card rounded-2xl p-6 space-y-6">
        {!props.loggedIn || props.needsCpf ? (
          <section className="space-y-3">
            <h2 className="font-semibold">Seus dados</h2>
            {!props.loggedIn ? (
              <>
                <Field
                  name="email"
                  type="email"
                  label="E-mail"
                  autoComplete="email"
                  required
                  inputMode="email"
                />
                <Field
                  name="phone"
                  type="tel"
                  label="WhatsApp / celular"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(11) 91234-5678"
                />
              </>
            ) : null}
            {props.needsCpf ? (
              <Field
                name="cpf"
                label="CPF"
                required
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="off"
              />
            ) : null}
            {!props.loggedIn ? (
              <p className="text-xs text-[color:var(--foreground)]/65">
                Criamos uma conta para você acompanhar o pedido. Se já tem cadastro,{" "}
                <a href="/login?next=/checkout" className="text-[color:var(--pink-600)] hover:underline">
                  entre aqui
                </a>
                .
              </p>
            ) : (
              <p className="text-xs text-[color:var(--foreground)]/65">
                O CPF é obrigatório para emissão da nota fiscal e geração da etiqueta de envio.
              </p>
            )}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="font-semibold">Endereço de entrega</h2>
          <Field
            name="recipient"
            label="Destinatário"
            required
            defaultValue={props.defaultRecipient}
            autoComplete="name"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="cep"
              label="CEP"
              required
              pattern="\d{5}-?\d{3}"
              autoComplete="postal-code"
              inputMode="numeric"
              defaultValue={props.defaultAddress?.cep ?? ""}
            />
            <Field
              name="state"
              label="UF"
              required
              maxLength={2}
              className="uppercase"
              autoComplete="address-level1"
              defaultValue={props.defaultAddress?.state ?? ""}
            />
          </div>
          <Field
            name="street"
            label="Rua"
            required
            autoComplete="address-line1"
            defaultValue={props.defaultAddress?.street ?? ""}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="number"
              label="Número"
              required
              autoComplete="address-line2"
              defaultValue={props.defaultAddress?.number ?? ""}
            />
            <Field
              name="complement"
              label="Complemento"
              defaultValue={props.defaultAddress?.complement ?? ""}
            />
          </div>
          <Field
            name="district"
            label="Bairro"
            required
            defaultValue={props.defaultAddress?.district ?? ""}
          />
          <Field
            name="city"
            label="Cidade"
            required
            autoComplete="address-level2"
            defaultValue={props.defaultAddress?.city ?? ""}
          />
          <CepAutofill
            cepFieldName="cep"
            targets={{ street: "street", district: "district", city: "city", state: "state" }}
          />
        </section>

        <section className="space-y-3">
          <ShippingOptions
            cepFieldName="cep"
            items={props.cartItems.map((it) => ({ variantId: it.variantId, qty: it.qty }))}
            freeThresholdCents={props.freeShippingThresholdCents}
            subtotalCents={props.subtotalCents}
            onChange={setShippingOpt}
          />
          <input type="hidden" name="shippingServiceId" value={shippingOpt?.serviceId ?? ""} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Forma de pagamento</h2>
          <div className="grid grid-cols-3 gap-2">
            {(["PIX", "CARD", "BOLETO"] as const).map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm transition-colors ${
                  payment === m
                    ? "border-[color:var(--pink-500)] bg-pink-50"
                    : "border-white/70 bg-white/70 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={m}
                  checked={payment === m}
                  onChange={() => setPayment(m)}
                  className="sr-only"
                />
                <span className="block font-medium">{PAYMENT_LABEL[m]}</span>
                <span className="block text-xs text-[color:var(--foreground)]/60 mt-1">
                  {PAYMENT_HINT[m]}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-t border-white/60 pt-4">
          <label className="flex items-start gap-2 text-sm text-[color:var(--foreground)]/80">
            <input type="checkbox" name="marketingOptIn" className="mt-1 accent-pink-500" />
            <span>Quero receber novidades, promoções e lançamentos por e-mail.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[color:var(--foreground)]/80">
            <input type="checkbox" name="whatsappOptIn" className="mt-1 accent-pink-500" />
            <span>Quero receber atualizações do meu pedido por WhatsApp.</span>
          </label>
        </section>
      </div>

      <aside className="glass-card rounded-2xl p-6 h-fit space-y-4">
        <h2 className="font-semibold">Resumo</h2>
        <ul className="text-sm space-y-1">
          {props.cartItems.map((it) => (
            <li key={it.id} className="flex justify-between gap-2">
              <span className="truncate">
                {it.qty}× {it.name}
              </span>
              <span>{formatBRL(it.qty * it.unitPriceCents)}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-white/70 pt-3 space-y-2">
          <label className="text-sm font-medium">Cupom</label>
          <input
            name="coupon"
            defaultValue={props.couponOk?.code ?? props.initialCoupon ?? ""}
            placeholder="Insira seu código"
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-pink-300"
          />
          {props.couponOk ? (
            <p className="text-xs text-emerald-700">
              Cupom <strong>{props.couponOk.code}</strong> aplicado: −{formatBRL(props.couponOk.discountCents)}
            </p>
          ) : props.couponError ? (
            <p className="text-xs text-red-600">{props.couponError}</p>
          ) : null}
        </div>

        <div className="border-t border-white/70 pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(props.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frete</span>
            <span>{shippingOpt ? formatBRL(shippingCents) : "—"}</span>
          </div>
          {discountCents > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto</span>
              <span>−{formatBRL(discountCents)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-lg pt-1">
            <span>Total</span>
            <span className="text-[color:var(--pink-600)]">{formatBRL(totalCents)}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!shippingOpt}
          className="w-full rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:bg-pink-200 disabled:cursor-not-allowed text-white font-medium px-6 py-3"
        >
          {shippingOpt ? "Pagar com Mercado Pago" : "Informe o CEP para continuar"}
        </button>
        {props.demoMode ? (
          <p className="text-xs text-[color:var(--foreground)]/60 text-center">
            Modo demo: o pagamento será simulado.
          </p>
        ) : null}
      </aside>
    </form>
  );
}

const PAYMENT_LABEL: Record<"PIX" | "CARD" | "BOLETO", string> = {
  PIX: "Pix",
  CARD: "Cartão",
  BOLETO: "Boleto",
};
const PAYMENT_HINT: Record<"PIX" | "CARD" | "BOLETO", string> = {
  PIX: "Aprovação na hora",
  CARD: "Até 12x no crédito",
  BOLETO: "1-3 dias úteis",
};

function Field({
  name,
  label,
  type = "text",
  required,
  pattern,
  maxLength,
  defaultValue,
  placeholder,
  autoComplete,
  inputMode,
  className,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  pattern?: string;
  maxLength?: number;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  className?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={`mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300 ${className ?? ""}`}
      />
    </label>
  );
}
