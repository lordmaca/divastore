"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import {
  TextField,
  NumberField,
  ToggleField,
  FieldGrid,
  useDraft,
} from "@/components/admin/settings/fields";
import { saveSettingAction } from "@/lib/admin-actions";

// All five sections of the home editor. Each section saves independently
// so a partial error doesn't block the rest.

type Hero = {
  kicker: string;
  title: string;
  subtitle: string;
  ctaPrimary: { label: string; url: string };
  ctaSecondary: { label: string; url: string };
};

type UspList = { items: Array<{ icon: string; text: string }> };

type Featured = { slugs: string[] };

type Badges = { newDays: number; showBestseller: boolean };

type Newsletter = {
  enabled: boolean;
  headline: string;
  sub: string;
  couponCode: string;
};

type Reviews = { enabled: boolean; limit: number };

type Category = { slug: string; name: string; productCount: number };

type Props = {
  hero: Hero;
  usps: UspList;
  featured: Featured;
  badges: Badges;
  newsletter: Newsletter;
  reviews: Reviews;
  availableCategories: Category[];
};

export function HomeTab(p: Props) {
  return (
    <div className="space-y-5">
      <TabHeader
        title="Home da loja"
        description="Conteúdo da landing page — tudo editável sem redeploy. Mudanças valem em até 60 segundos (cache do storefront)."
      />
      <StatusStrip
        ok={true}
        label="Editável pelo admin"
        detail="Cada bloco salva separado. Use os ajustes abaixo para customizar a home."
      />

      <HeroSection initial={p.hero} />
      <UspSection initial={p.usps} />
      <FeaturedSection
        initial={p.featured}
        availableCategories={p.availableCategories}
      />
      <BadgesSection initial={p.badges} />
      <NewsletterSection initial={p.newsletter} />
      <ReviewsSection initial={p.reviews} />
    </div>
  );
}

// ---------- Hero ----------

function HeroSection({ initial }: { initial: Hero }) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<Hero>(initial);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("home.hero", {
          kicker: draft.kicker.trim(),
          title: draft.title.trim(),
          subtitle: draft.subtitle.trim(),
          ctaPrimary: {
            label: draft.ctaPrimary.label.trim(),
            url: draft.ctaPrimary.url.trim(),
          },
          ctaSecondary: {
            label: draft.ctaSecondary.label.trim(),
            url: draft.ctaSecondary.url.trim(),
          },
        });
        reset(draft);
        setMsg({ ok: true, text: "Topo atualizado." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <SettingsSection
      title="Topo (hero)"
      description="Sobreletra, título, subtítulo e os dois botões exibidos logo no topo."
    >
      <FieldGrid cols={1}>
        <TextField
          label="Sobreletra (kicker)"
          value={draft.kicker}
          onChange={(v) => patch("kicker", v)}
          description="Linha pequena acima do título — ex.: 'Nova coleção', 'Joias artesanais'."
        />
        <TextField
          label="Título"
          value={draft.title}
          onChange={(v) => patch("title", v)}
        />
        <TextField
          label="Subtítulo"
          value={draft.subtitle}
          onChange={(v) => patch("subtitle", v)}
        />
      </FieldGrid>
      <FieldGrid cols={2}>
        <TextField
          label="CTA principal — texto"
          value={draft.ctaPrimary.label}
          onChange={(v) =>
            patch("ctaPrimary", { ...draft.ctaPrimary, label: v })
          }
        />
        <TextField
          label="CTA principal — URL"
          value={draft.ctaPrimary.url}
          onChange={(v) => patch("ctaPrimary", { ...draft.ctaPrimary, url: v })}
          placeholder="/loja"
        />
        <TextField
          label="CTA secundário — texto"
          value={draft.ctaSecondary.label}
          onChange={(v) =>
            patch("ctaSecondary", { ...draft.ctaSecondary, label: v })
          }
        />
        <TextField
          label="CTA secundário — URL"
          value={draft.ctaSecondary.url}
          onChange={(v) =>
            patch("ctaSecondary", { ...draft.ctaSecondary, url: v })
          }
        />
      </FieldGrid>
      <SaveRow dirty={dirty} saving={saving} onSave={save} msg={msg} />
    </SettingsSection>
  );
}

// ---------- USPs ----------

function UspSection({ initial }: { initial: UspList }) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(items) !== JSON.stringify(initial.items);

  function update(i: number, key: "icon" | "text", value: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }
  function removeAt(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    if (items.length >= 6) return;
    setItems((prev) => [...prev, { icon: "✨", text: "" }]);
  }

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        const clean = items
          .map((it) => ({ icon: it.icon.trim(), text: it.text.trim() }))
          .filter((it) => it.text.length > 0);
        await saveSettingAction("home.usps", { items: clean });
        setItems(clean);
        setMsg({ ok: true, text: "Benefícios atualizados." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <SettingsSection
      title="Benefícios (USP bar)"
      description="Faixa com até 6 benefícios exibida logo abaixo do hero. Recomendado: 4."
    >
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={it.icon}
              onChange={(e) => update(i, "icon", e.target.value)}
              placeholder="🚚"
              className="w-14 rounded-xl bg-white/80 border border-white px-3 py-2 text-lg text-center outline-none focus:ring-2 focus:ring-pink-300"
            />
            <input
              value={it.text}
              onChange={(e) => update(i, "text", e.target.value)}
              placeholder="Frete grátis acima de R$ 300"
              className="flex-1 rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-xs text-red-600 hover:underline shrink-0 px-2"
            >
              remover
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={add}
          disabled={items.length >= 6}
          className="rounded-full bg-white/70 hover:bg-white border border-pink-200 disabled:opacity-50 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5"
        >
          + adicionar benefício
        </button>
      </div>
      <SaveRow dirty={dirty} saving={saving} onSave={save} msg={msg} />
    </SettingsSection>
  );
}

// ---------- Featured categories ----------

function FeaturedSection(p: { initial: Featured; availableCategories: Category[] }) {
  const router = useRouter();
  const [slugs, setSlugs] = useState<string[]>(p.initial.slugs);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(slugs) !== JSON.stringify(p.initial.slugs);

  function toggle(slug: string) {
    setSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 6) return prev;
      return [...prev, slug];
    });
  }

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("home.featuredCategories", { slugs });
        setMsg({ ok: true, text: "Categorias salvas." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <SettingsSection
      title="Categorias em destaque"
      description="Selecione até 6 categorias pra aparecerem como tiles na home. Se não marcar nenhuma, escolhemos automaticamente as 4 com mais produtos ativos."
    >
      <ul className="grid sm:grid-cols-2 gap-2">
        {p.availableCategories.map((c) => (
          <li key={c.slug}>
            <label
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer text-sm ${
                slugs.includes(c.slug)
                  ? "bg-pink-50 border-[color:var(--pink-400)]"
                  : "bg-white/70 border-white hover:bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={slugs.includes(c.slug)}
                onChange={() => toggle(c.slug)}
                className="accent-pink-500"
              />
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-[color:var(--foreground)]/60">
                {c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <SaveRow dirty={dirty} saving={saving} onSave={save} msg={msg} />
    </SettingsSection>
  );
}

// ---------- Badges ----------

function BadgesSection({ initial }: { initial: Badges }) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<Badges>(initial);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("home.badges", draft);
        reset(draft);
        setMsg({ ok: true, text: "Badges atualizados." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <SettingsSection
      title="Badges no carousel de destaques"
      description="Marcas automáticas aplicadas aos produtos exibidos na home."
    >
      <FieldGrid cols={2}>
        <NumberField
          label="'Novo' — dias"
          value={draft.newDays}
          onChange={(v) => patch("newDays", v)}
          min={1}
          max={180}
          description="Produtos criados nos últimos N dias ganham o selo 'Novo'."
        />
        <ToggleField
          label="Exibir 'Mais vendido'"
          value={draft.showBestseller}
          onChange={(v) => patch("showBestseller", v)}
          description="Marca o top-3 por pedidos no último mês."
        />
      </FieldGrid>
      <SaveRow dirty={dirty} saving={saving} onSave={save} msg={msg} />
    </SettingsSection>
  );
}

// ---------- Newsletter ----------

function NewsletterSection({ initial }: { initial: Newsletter }) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<Newsletter>(initial);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("home.newsletter", {
          enabled: draft.enabled,
          headline: draft.headline.trim(),
          sub: draft.sub.trim(),
          couponCode: draft.couponCode.trim().toUpperCase(),
        });
        reset({ ...draft, couponCode: draft.couponCode.trim().toUpperCase() });
        setMsg({ ok: true, text: "Newsletter atualizada." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <SettingsSection
      title="Newsletter + cupom"
      description="Bloco de captura de e-mail. O cupom precisa existir em /admin/cupons para valer no checkout."
    >
      <ToggleField
        label="Exibir o bloco"
        value={draft.enabled}
        onChange={(v) => patch("enabled", v)}
      />
      <FieldGrid cols={1}>
        <TextField
          label="Headline"
          value={draft.headline}
          onChange={(v) => patch("headline", v)}
        />
        <TextField
          label="Descrição"
          value={draft.sub}
          onChange={(v) => patch("sub", v)}
        />
        <TextField
          label="Código do cupom"
          value={draft.couponCode}
          onChange={(v) => patch("couponCode", v)}
          placeholder="BEMVINDA10"
          description="Este código é mostrado após o cadastro. Precisa existir em /admin/cupons para ser aceito."
        />
      </FieldGrid>
      <SaveRow dirty={dirty} saving={saving} onSave={save} msg={msg} />
    </SettingsSection>
  );
}

// ---------- Reviews widget ----------

function ReviewsSection({ initial }: { initial: Reviews }) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<Reviews>(initial);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("home.reviews", draft);
        reset(draft);
        setMsg({ ok: true, text: "Avaliações atualizadas." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <SettingsSection
      title="Avaliações (prova social)"
      description="Mostra a média + as avaliações mais recentes. Só avaliações publicadas (status PUBLISHED) contam."
    >
      <FieldGrid cols={2}>
        <ToggleField
          label="Exibir o bloco"
          value={draft.enabled}
          onChange={(v) => patch("enabled", v)}
        />
        <NumberField
          label="Quantidade exibida"
          value={draft.limit}
          onChange={(v) => patch("limit", v)}
          min={1}
          max={6}
        />
      </FieldGrid>
      <SaveRow dirty={dirty} saving={saving} onSave={save} msg={msg} />
    </SettingsSection>
  );
}

// ---------- Shared save row ----------

function SaveRow(p: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  msg: { ok: boolean; text: string } | null;
}) {
  return (
    <div className="flex items-center gap-3 pt-2 border-t border-white/60">
      <button
        type="button"
        disabled={!p.dirty || p.saving}
        onClick={p.onSave}
        className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
      >
        {p.saving ? "…" : "Salvar"}
      </button>
      {p.msg ? (
        <span className={`text-xs ${p.msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {p.msg.text}
        </span>
      ) : null}
    </div>
  );
}
