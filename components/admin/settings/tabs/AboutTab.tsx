"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsSection,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import {
  TextField,
  ToggleField,
  SelectField,
  useDraft,
} from "@/components/admin/settings/fields";
import { saveSettingAction } from "@/lib/admin-actions";
import { ImageUpload } from "@/components/admin/settings/ImageUpload";

type Pillar = { icon: string; title: string; description: string };

type AboutPage = {
  enabled: boolean;
  heading: string;
  tagline: string;
  story: string;
  media: { type: "image" | "video" | "none"; url: string; alt: string };
  pillars: Pillar[];
  visit: {
    storeName: string;
    address: string;
    city: string;
    state: string;
    openingDateIso: string;
    hours: string;
    mapUrl: string;
    shoppingUrl: string;
  };
  contact: { whatsapp: string; instagram: string; email: string };
};

export function AboutTab({ initial }: { initial: AboutPage }) {
  const router = useRouter();
  const { draft, patch, dirty, reset } = useDraft<AboutPage>(initial);
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function patchMedia(m: Partial<AboutPage["media"]>) {
    patch("media", { ...draft.media, ...m });
  }
  function patchVisit(v: Partial<AboutPage["visit"]>) {
    patch("visit", { ...draft.visit, ...v });
  }
  function patchContact(c: Partial<AboutPage["contact"]>) {
    patch("contact", { ...draft.contact, ...c });
  }
  function setPillar(i: number, p: Partial<Pillar>) {
    patch(
      "pillars",
      draft.pillars.map((x, idx) => (idx === i ? { ...x, ...p } : x)),
    );
  }
  function addPillar() {
    if (draft.pillars.length >= 6) return;
    patch("pillars", [...draft.pillars, { icon: "✨", title: "", description: "" }]);
  }
  function removePillar(i: number) {
    patch(
      "pillars",
      draft.pillars.filter((_, idx) => idx !== i),
    );
  }
  function movePillar(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= draft.pillars.length) return;
    const next = draft.pillars.slice();
    const [moved] = next.splice(i, 1);
    next.splice(to, 0, moved);
    patch("pillars", next);
  }

  function save() {
    startSaving(async () => {
      setMsg(null);
      try {
        await saveSettingAction("about.page", {
          enabled: draft.enabled,
          heading: draft.heading.trim(),
          tagline: draft.tagline.trim(),
          story: draft.story.trim(),
          media: {
            type: draft.media.type,
            url: draft.media.type === "none" ? "" : draft.media.url.trim(),
            alt: draft.media.alt.trim(),
          },
          pillars: draft.pillars
            .map((p) => ({
              icon: p.icon.trim() || "✨",
              title: p.title.trim(),
              description: p.description.trim(),
            }))
            .filter((p) => p.title && p.description),
          visit: {
            storeName: draft.visit.storeName.trim(),
            address: draft.visit.address.trim(),
            city: draft.visit.city.trim(),
            state: draft.visit.state.trim(),
            openingDateIso: draft.visit.openingDateIso.trim(),
            hours: draft.visit.hours.trim(),
            mapUrl: draft.visit.mapUrl.trim(),
            shoppingUrl: draft.visit.shoppingUrl.trim(),
          },
          contact: {
            whatsapp: draft.contact.whatsapp.trim(),
            instagram: draft.contact.instagram.trim(),
            email: draft.contact.email.trim(),
          },
        });
        reset(draft);
        setMsg({ ok: true, text: "Página Sobre atualizada." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <div className="space-y-5">
      <TabHeader
        title="Sobre nós"
        description="Conteúdo da página /sobre — história, foto/vídeo da loja física, e informações para visitar."
      />

      <SettingsSection title="Visibilidade e títulos">
        <ToggleField
          label="Página pública ativada"
          description="Se desligado, /sobre responde 404 e o link some do rodapé."
          value={draft.enabled}
          onChange={(v) => patch("enabled", v)}
        />
        <TextField
          label="Título"
          value={draft.heading}
          onChange={(v) => patch("heading", v)}
        />
        <TextField
          label="Subtítulo (tagline)"
          value={draft.tagline}
          onChange={(v) => patch("tagline", v)}
          description="Aparece logo abaixo do título, em destaque."
        />
      </SettingsSection>

      <SettingsSection
        title="História"
        description="Texto principal da página. Parágrafos separados por uma linha em branco."
      >
        <label className="block">
          <span className="text-sm font-medium">Texto</span>
          <textarea
            value={draft.story}
            onChange={(e) => patch("story", e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm"
          />
        </label>
      </SettingsSection>

      <SettingsSection
        title="Foto ou vídeo da loja"
        description="Uma mídia em destaque. Escolha uma imagem (upload) OU cole a URL de um vídeo do YouTube ou arquivo .mp4."
      >
        <SelectField
          label="Tipo de mídia"
          value={draft.media.type}
          onChange={(v) => patchMedia({ type: v as "image" | "video" | "none" })}
          options={[
            { value: "none", label: "Nenhuma" },
            { value: "image", label: "Imagem (upload)" },
            { value: "video", label: "Vídeo (YouTube ou mp4)" },
          ]}
        />
        {draft.media.type === "image" ? (
          <div className="max-w-md">
            <ImageUpload
              label="Foto da loja"
              hint="Sugestão: 1600×900 (16:9). É exibida em destaque no topo da página."
              value={draft.media.url}
              onChange={(url) => patchMedia({ url })}
            />
          </div>
        ) : null}
        {draft.media.type === "video" ? (
          <TextField
            label="URL do vídeo"
            type="url"
            value={draft.media.url}
            onChange={(v) => patchMedia({ url: v })}
            placeholder="https://www.youtube.com/watch?v=… ou https://…/tour.mp4"
            description="YouTube → incorpora o player. mp4/webm direto → reproduz no próprio site."
          />
        ) : null}
        {draft.media.type !== "none" ? (
          <TextField
            label="Texto alternativo (acessibilidade)"
            value={draft.media.alt}
            onChange={(v) => patchMedia({ alt: v })}
            placeholder="Loja Brilho de Diva no Shopping Nova Estação"
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Pilares"
        description="Três (ou mais) destaques exibidos em cards. ícone é um emoji."
      >
        <div className="space-y-3">
          {draft.pillars.map((p, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_auto_1fr_2fr_auto] gap-2 items-center bg-white/40 rounded-xl p-2 border border-white/60"
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label="Subir"
                  onClick={() => movePillar(i, -1)}
                  disabled={i === 0}
                  className="h-5 w-5 rounded-full bg-white/80 border border-white disabled:opacity-30 text-xs"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Descer"
                  onClick={() => movePillar(i, 1)}
                  disabled={i === draft.pillars.length - 1}
                  className="h-5 w-5 rounded-full bg-white/80 border border-white disabled:opacity-30 text-xs"
                >
                  ↓
                </button>
              </div>
              <input
                value={p.icon}
                onChange={(e) => setPillar(i, { icon: e.target.value })}
                className="w-12 text-center rounded-lg bg-white/80 border border-white px-1 py-1 text-lg"
                maxLength={4}
              />
              <input
                value={p.title}
                onChange={(e) => setPillar(i, { title: e.target.value })}
                placeholder="Título"
                className="rounded-lg bg-white/80 border border-white px-2 py-1 text-sm font-medium"
              />
              <input
                value={p.description}
                onChange={(e) => setPillar(i, { description: e.target.value })}
                placeholder="Descrição curta (1–2 linhas)"
                className="rounded-lg bg-white/80 border border-white px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => removePillar(i)}
                aria-label="Remover"
                className="h-7 w-7 rounded-full bg-red-100 text-red-700 hover:bg-red-200 text-sm"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPillar}
            disabled={draft.pillars.length >= 6}
            className="rounded-full bg-white/70 hover:bg-white disabled:opacity-40 text-xs font-medium px-3 py-1 border border-white"
          >
            + Adicionar pilar
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Visite a loja"
        description="Endereço físico, horário e links externos."
      >
        <TextField
          label="Nome da loja"
          value={draft.visit.storeName}
          onChange={(v) => patchVisit({ storeName: v })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Endereço"
            value={draft.visit.address}
            onChange={(v) => patchVisit({ address: v })}
            placeholder="Shopping Nova Estação — Loja 123"
          />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <TextField
              label="Cidade"
              value={draft.visit.city}
              onChange={(v) => patchVisit({ city: v })}
            />
            <TextField
              label="UF"
              value={draft.visit.state}
              onChange={(v) => patchVisit({ state: v.toUpperCase().slice(0, 2) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Data de inauguração"
            type="text"
            value={draft.visit.openingDateIso}
            onChange={(v) => patchVisit({ openingDateIso: v })}
            placeholder="2025-05-25"
            description="Formato ISO AAAA-MM-DD — usado para mostrar 'dias brilhando'."
          />
          <TextField
            label="Horário de funcionamento"
            value={draft.visit.hours}
            onChange={(v) => patchVisit({ hours: v })}
            placeholder="Seg a Sáb, 10h às 22h · Dom, 14h às 20h"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Link 'Como chegar' (Google Maps)"
            type="url"
            value={draft.visit.mapUrl}
            onChange={(v) => patchVisit({ mapUrl: v })}
            placeholder="https://maps.app.goo.gl/..."
          />
          <TextField
            label="Site do shopping"
            type="url"
            value={draft.visit.shoppingUrl}
            onChange={(v) => patchVisit({ shoppingUrl: v })}
            placeholder="https://www.shoppingnovaestacao.com.br"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Contato e redes"
        description="Usado no bloco 'Fica com a gente' no final da página."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TextField
            label="WhatsApp"
            value={draft.contact.whatsapp}
            onChange={(v) => patchContact({ whatsapp: v })}
            placeholder="+5511999999999"
            description="Gera https://wa.me/..."
          />
          <TextField
            label="Instagram"
            value={draft.contact.instagram}
            onChange={(v) => patchContact({ instagram: v })}
            placeholder="@brilhodediva"
          />
          <TextField
            label="E-mail"
            type="email"
            value={draft.contact.email}
            onChange={(v) => patchContact({ email: v })}
          />
        </div>
      </SettingsSection>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-5 py-2"
        >
          {saving ? "Salvando…" : "Salvar tudo"}
        </button>
        {msg ? (
          <span
            className={`text-xs ${
              msg.ok ? "text-[color:var(--foreground)]/70" : "text-red-600"
            }`}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
