"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateHeroSlideOverridesAction,
  deleteHeroSlideAction,
  createManualHeroSlideAction,
} from "@/lib/hero-slide-admin-actions";
import { ImageUpload } from "@/components/admin/settings/ImageUpload";

// Admin view of the HeroSlide queue. Lists every slide (DivaHub + manual),
// shows the effective text (override ?? base), and lets the admin edit
// overrides, toggle enabled, set weight, and delete. Manual slides can be
// created here; DivaHub-auto slides appear automatically when the inbound
// endpoint is called.

export type SlideRow = {
  id: string;
  externalId: string | null;
  source: "DIVAHUB_AUTO" | "MANUAL";
  imageUrl: string;
  imageAlt: string | null;
  // Base (DivaHub / initial) values
  headline: string;
  sub: string | null;
  ctaLabel: string;
  ctaUrl: string;
  // Overrides
  headlineOverride: string | null;
  subOverride: string | null;
  ctaLabelOverride: string | null;
  ctaUrlOverride: string | null;
  enabled: boolean;
  weight: number;
  productLinked: boolean;
  productName: string | null;
  productActive: boolean | null;
  productInStock: boolean | null;
  activeFrom: string | null;
  activeUntil: string | null;
  createdAt: string;
};

export function HeroSlideQueue({ slides }: { slides: SlideRow[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {slides.length === 0 && !creating ? (
        <p className="text-sm text-[color:var(--foreground)]/65 italic">
          Nenhum slide na fila. DivaHub enviará automaticamente ao publicar produtos;
          enquanto isso, você pode criar um slide manual abaixo.
        </p>
      ) : null}

      <ul className="space-y-3">
        {slides.map((s) => (
          <li key={s.id}>
            <SlideCard slide={s} />
          </li>
        ))}
      </ul>

      {creating ? (
        <ManualForm onDone={() => setCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5"
        >
          + criar slide manual
        </button>
      )}
    </div>
  );
}

// ---------- Single slide card ----------

function SlideCard({ slide: s }: { slide: SlideRow }) {
  const router = useRouter();
  const [headline, setHeadline] = useState(s.headlineOverride ?? "");
  const [sub, setSub] = useState(s.subOverride ?? "");
  const [ctaLabel, setCtaLabel] = useState(s.ctaLabelOverride ?? "");
  const [ctaUrl, setCtaUrl] = useState(s.ctaUrlOverride ?? "");
  const [enabled, setEnabled] = useState(s.enabled);
  const [weight, setWeight] = useState(s.weight);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    (headline || null) !== s.headlineOverride ||
    (sub || null) !== s.subOverride ||
    (ctaLabel || null) !== s.ctaLabelOverride ||
    (ctaUrl || null) !== s.ctaUrlOverride ||
    enabled !== s.enabled ||
    weight !== s.weight;

  function save() {
    start(async () => {
      setMsg(null);
      const res = await updateHeroSlideOverridesAction(s.id, {
        headlineOverride: headline || null,
        subOverride: sub || null,
        ctaLabelOverride: ctaLabel || null,
        ctaUrlOverride: ctaUrl || null,
        enabled,
        weight,
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Salvo." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  function remove() {
    if (!confirm("Excluir este slide? Esta ação não pode ser desfeita.")) return;
    start(async () => {
      const res = await deleteHeroSlideAction(s.id);
      if (res.ok) router.refresh();
      else setMsg({ ok: false, text: res.error });
    });
  }

  const availability = !enabled
    ? { text: "Desativado", tone: "bg-zinc-200 text-zinc-700" }
    : s.productLinked && s.productActive === false
      ? { text: "Produto inativo", tone: "bg-amber-100 text-amber-800" }
      : s.productLinked && s.productInStock === false
        ? { text: "Sem estoque", tone: "bg-amber-100 text-amber-800" }
        : { text: "Ativo", tone: "bg-emerald-100 text-emerald-800" };

  const effective = {
    headline: headline || s.headline,
    sub: sub || s.sub || "",
    ctaLabel: ctaLabel || s.ctaLabel,
  };

  return (
    <div className="rounded-2xl bg-white/70 border border-white p-4 space-y-3">
      <div className="flex items-start gap-4">
        <div className="w-40 h-24 rounded-xl overflow-hidden bg-pink-50 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.imageUrl}
            alt={s.imageAlt ?? s.headline}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${availability.tone}`}
            >
              {availability.text}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-100 text-[color:var(--pink-600)]">
              {s.source === "DIVAHUB_AUTO" ? "DivaHub" : "Manual"}
            </span>
            {s.productLinked ? (
              <span className="text-xs text-[color:var(--foreground)]/65 truncate">
                · {s.productName}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-semibold text-[color:var(--foreground)] truncate">
            {effective.headline}
          </p>
          {effective.sub ? (
            <p className="text-xs text-[color:var(--foreground)]/70 line-clamp-2">
              {effective.sub}
            </p>
          ) : null}
          <p className="text-xs text-[color:var(--pink-600)] mt-1">
            [{effective.ctaLabel}]
          </p>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-[color:var(--pink-600)] hover:underline">
          Otimizar textos / controle
        </summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <OverrideField
            label="Headline"
            base={s.headline}
            value={headline}
            onChange={setHeadline}
          />
          <OverrideField
            label="CTA — texto"
            base={s.ctaLabel}
            value={ctaLabel}
            onChange={setCtaLabel}
          />
          <div className="sm:col-span-2">
            <OverrideField
              label="Subtítulo"
              base={s.sub ?? ""}
              value={sub}
              onChange={setSub}
              multiline
            />
          </div>
          <OverrideField
            label="CTA — URL"
            base={s.ctaUrl}
            value={ctaUrl}
            onChange={setCtaUrl}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-pink-500"
              />
              <span>Exibir na home</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span>Peso</span>
              <input
                type="number"
                min={1}
                max={10}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value) || 1)}
                className="w-16 rounded bg-white/80 border border-white px-2 py-1 text-center"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-white/60 mt-3">
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={save}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
          >
            {pending ? "…" : "Salvar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="text-xs text-red-600 hover:underline"
          >
            Excluir slide
          </button>
          {msg ? (
            <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
              {msg.text}
            </span>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function OverrideField(p: {
  label: string;
  base: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium flex items-center justify-between">
        <span>{p.label}</span>
        {p.value ? (
          <button
            type="button"
            onClick={() => p.onChange("")}
            className="text-[10px] text-[color:var(--pink-600)] hover:underline"
          >
            usar sugestão DivaHub
          </button>
        ) : null}
      </span>
      {p.multiline ? (
        <textarea
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          rows={2}
          placeholder={p.base}
          className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
        />
      ) : (
        <input
          type="text"
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          placeholder={p.base}
          className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
        />
      )}
      {!p.value && p.base ? (
        <p className="mt-1 text-[10px] text-[color:var(--foreground)]/55">
          exibindo sugestão: “{p.base}”
        </p>
      ) : null}
    </label>
  );
}

// ---------- Manual create form ----------

function ManualForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [headline, setHeadline] = useState("");
  const [sub, setSub] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Explorar");
  const [ctaUrl, setCtaUrl] = useState("/loja");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    if (!imageUrl || !headline) {
      setMsg({ ok: false, text: "Foto e headline são obrigatórios" });
      return;
    }
    start(async () => {
      setMsg(null);
      const res = await createManualHeroSlideAction({
        imageUrl,
        imageAlt: imageAlt || null,
        headline,
        sub: sub || null,
        ctaLabel,
        ctaUrl,
        productId: null,
        activeFrom: null,
        activeUntil: null,
      });
      if (res.ok) {
        onDone();
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white/70 border border-white p-4 space-y-3">
      <p className="text-xs font-semibold text-[color:var(--pink-600)]">Novo slide manual</p>
      <ImageUpload
        label="Foto do slide"
        hint="1920 × 1080 px (16:9). JPG, PNG, WebP ou AVIF, até 8 MB."
        value={imageUrl}
        onChange={setImageUrl}
        aspect="aspect-video"
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <TextRow label="Headline" value={headline} onChange={setHeadline} />
        <TextRow label="Subtítulo" value={sub} onChange={setSub} />
        <TextRow label="CTA — texto" value={ctaLabel} onChange={setCtaLabel} />
        <TextRow label="CTA — URL" value={ctaUrl} onChange={setCtaUrl} />
        <TextRow label="Texto alternativo" value={imageAlt} onChange={setImageAlt} />
      </div>
      <div className="flex items-center gap-3 pt-2 border-t border-white/60">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
        >
          {pending ? "…" : "Criar slide"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-[color:var(--foreground)]/65 hover:text-[color:var(--pink-600)]"
        >
          cancelar
        </button>
        {msg && !msg.ok ? (
          <span className="text-xs text-red-600">{msg.text}</span>
        ) : null}
      </div>
    </div>
  );
}

function TextRow(p: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{p.label}</span>
      <input
        type="text"
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
      />
    </label>
  );
}
