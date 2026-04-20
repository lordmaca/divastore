"use client";

import { useState, useTransition } from "react";
import {
  subscribeNewsletterAction,
  type NewsletterResult,
} from "@/app/(shop)/newsletter-action";

type Props = {
  headline: string;
  sub: string;
  couponCode: string;
};

export function NewsletterCard({ headline, sub, couponCode }: Props) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<NewsletterResult | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await subscribeNewsletterAction(email, couponCode);
      setResult(res);
      if (res.ok) setEmail("");
    });
  }

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12 w-full">
      <div className="glass-card rounded-3xl px-6 sm:px-12 py-10 text-center relative overflow-hidden">
        <span
          aria-hidden
          className="absolute -top-12 -left-12 text-[180px] text-[color:var(--pink-400)]/10 select-none"
        >
          ✨
        </span>
        <span
          aria-hidden
          className="absolute -bottom-16 -right-10 text-[200px] text-[color:var(--pink-400)]/10 select-none"
        >
          ✨
        </span>
        <h2 className="font-display text-3xl sm:text-4xl text-[color:var(--pink-600)]">
          {headline}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-[color:var(--foreground)]/75 max-w-xl mx-auto">
          {sub}
        </p>

        {result?.ok ? (
          <div className="mt-8 inline-block text-left rounded-2xl bg-pink-50 border border-pink-200 px-6 py-5">
            <p className="text-sm text-[color:var(--foreground)]/80">
              {result.alreadySubscribed
                ? "Bom te ver de volta! Seu cupom continua válido:"
                : "Prontinho! Use o cupom abaixo no checkout:"}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-[color:var(--pink-600)]">
              {result.couponCode}
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-8 flex flex-col sm:flex-row items-stretch justify-center gap-2 max-w-xl mx-auto"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              className="flex-1 rounded-full bg-white/90 border border-white px-5 py-3 outline-none focus:ring-2 focus:ring-pink-300"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white font-medium px-6 py-3"
            >
              {pending ? "Enviando…" : "Quero meu cupom"}
            </button>
          </form>
        )}
        {result && !result.ok ? (
          <p className="mt-3 text-sm text-red-600">{result.error}</p>
        ) : null}
        <p className="mt-5 text-[11px] text-[color:var(--foreground)]/55">
          Ao se inscrever você aceita receber e-mails de marketing. Dá pra sair quando quiser — link de descadastro em todo e-mail.
        </p>
      </div>
    </section>
  );
}
