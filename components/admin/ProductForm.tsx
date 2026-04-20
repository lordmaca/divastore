"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/lib/product-actions";
import { formatBRL } from "@/lib/money";
import type { ProductInput } from "@/lib/product-schema";
import { ImageUploader } from "@/components/admin/ImageUploader";

type Variant = ProductInput["variants"][number];
type Image = ProductInput["images"][number];
type Video = ProductInput["videos"][number];

type Props = {
  mode: "create" | "edit";
  productId?: string;
  initial?: Partial<ProductInput>;
  categories: Array<{ slug: string; name: string }>;
  divahubManaged?: boolean;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const emptyVariant: Variant = { sku: "", name: "", priceCents: 0, stock: 0, weightG: null, attributes: null };
const emptyImage: Image = { url: "", alt: "", position: 0 };
const emptyVideo: Video = { url: "", source: "youtube", kind: "reel" };

export function ProductForm({ mode, productId, initial, categories, divahubManaged }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [name, setName] = useState(initial?.name ?? "");
  const [shortNameVal, setShortNameVal] = useState(initial?.shortName ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [categorySlug, setCategorySlug] = useState(initial?.category?.slug ?? "");
  const [categoryName, setCategoryName] = useState(initial?.category?.name ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [seoKeywords, setSeoKeywords] = useState((initial?.seoKeywords ?? []).join(", "));
  const [variants, setVariants] = useState<Variant[]>(
    initial?.variants && initial.variants.length > 0 ? initial.variants : [emptyVariant],
  );
  const [images, setImages] = useState<Image[]>(initial?.images ?? []);
  const [videos, setVideos] = useState<Video[]>(initial?.videos ?? []);

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched && mode === "create") setSlug(slugify(v));
  }

  function setVariant(i: number, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function addVariant() {
    setVariants((p) => [...p, { ...emptyVariant }]);
  }
  function removeVariant(i: number) {
    setVariants((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  }

  function setImage(i: number, patch: Partial<Image>) {
    setImages((prev) => prev.map((img, idx) => (idx === i ? { ...img, ...patch } : img)));
  }
  function addImage() {
    setImages((p) => [...p, { ...emptyImage, position: p.length }]);
  }
  function removeImage(i: number) {
    setImages((p) => p.filter((_, idx) => idx !== i));
  }

  function submit() {
    setError(null);
    const payload: ProductInput = {
      slug,
      name,
      description,
      active,
      shortName: shortNameVal.trim() || undefined,
      seoTitle: seoTitle.trim() || undefined,
      seoDescription: seoDescription.trim() || undefined,
      seoKeywords: seoKeywords
        .split(/[,;\n]+/)
        .map((k) => k.trim())
        .filter(Boolean),
      category:
        categorySlug && categoryName ? { slug: categorySlug, name: categoryName } : undefined,
      variants: variants.map((v) => ({
        ...v,
        priceCents: Number(v.priceCents) || 0,
        stock: Number(v.stock) || 0,
        weightG: v.weightG ? Number(v.weightG) : null,
      })),
      images: images.map((i, idx) => ({
        url: i.url,
        alt: i.alt ?? "",
        position: idx,
      })),
      videos: videos
        .filter((v) => v.url.trim())
        .map((v) => ({ url: v.url.trim(), source: v.source, kind: v.kind })),
    };
    start(async () => {
      try {
        if (mode === "create") {
          const r = await createProduct(payload);
          router.push(`/admin/produtos/${r.id}`);
        } else if (productId) {
          await updateProduct({ ...payload, id: productId });
          router.refresh();
          setError("Salvo!");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {divahubManaged ? (
        <div className="glass-card rounded-2xl p-4 border-l-4 border-amber-400">
          <p className="text-sm">
            <strong>Atenção:</strong> esse produto vem do DivaHub. Suas alterações aqui serão
            sobrescritas na próxima sincronização. Para mudanças permanentes, edite no DivaHub.
          </p>
        </div>
      ) : null}

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Identificação</h2>
        <Field label="Nome">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
            required
          />
        </Field>
        <Field
          label="Slug (URL)"
          hint={mode === "edit" ? "imutável após a criação — usado em /loja/<slug>" : undefined}
        >
          <input
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugTouched(true);
            }}
            disabled={mode === "edit"}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 disabled:opacity-60 font-mono text-sm"
            required
          />
        </Field>
        <Field label="Descrição">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
            required
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Ativo no catálogo
        </label>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">SEO</h2>
        <p className="text-xs text-[color:var(--foreground)]/65 -mt-2">
          Todos opcionais. Vazio = derivamos automaticamente do nome/descrição.
        </p>
        <Field label="Nome curto (cards, breadcrumb)" hint="até 80 chars">
          <input
            value={shortNameVal}
            onChange={(e) => setShortNameVal(e.target.value)}
            maxLength={80}
            placeholder={name}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
          />
        </Field>
        <Field label="SEO title" hint="até 70 chars — aparece como título no Google">
          <input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            maxLength={70}
            placeholder={`${name} — Brilho de Diva`}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
          />
        </Field>
        <Field label="SEO description" hint="até 155 chars — aparece como snippet no Google">
          <textarea
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            maxLength={200}
            rows={2}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
          />
        </Field>
        <Field label="SEO keywords" hint="separe por vírgula">
          <input
            value={seoKeywords}
            onChange={(e) => setSeoKeywords(e.target.value)}
            placeholder="colar, folheado a ouro, presente"
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
          />
        </Field>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Categoria</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Slug" hint="ex: brincos">
            <input
              list="cat-slug-list"
              value={categorySlug}
              onChange={(e) => {
                const v = slugify(e.target.value);
                setCategorySlug(v);
                const match = categories.find((c) => c.slug === v);
                if (match) setCategoryName(match.name);
              }}
              className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 font-mono text-sm"
            />
            <datalist id="cat-slug-list">
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="Nome">
            <input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
            />
          </Field>
        </div>
        <p className="text-xs text-[color:var(--foreground)]/65">
          Deixe vazio para manter sem categoria. Se o slug for novo, será criado.
        </p>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Variantes</h2>
          <button
            type="button"
            onClick={addVariant}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3 py-1"
          >
            + Adicionar variante
          </button>
        </div>
        {variants.map((v, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <Field label="SKU" className="col-span-3">
              <input
                value={v.sku}
                onChange={(e) => setVariant(i, { sku: e.target.value })}
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 font-mono text-xs"
                required
              />
            </Field>
            <Field label="Nome" className="col-span-3">
              <input
                value={v.name ?? ""}
                onChange={(e) => setVariant(i, { name: e.target.value })}
                placeholder="Único"
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
              />
            </Field>
            <Field label="Preço (centavos)" className="col-span-2" hint={formatBRL(v.priceCents || 0)}>
              <input
                type="number"
                min="0"
                value={v.priceCents}
                onChange={(e) => setVariant(i, { priceCents: Number(e.target.value) })}
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
                required
              />
            </Field>
            <Field label="Estoque" className="col-span-2">
              <input
                type="number"
                min="0"
                value={v.stock}
                onChange={(e) => setVariant(i, { stock: Number(e.target.value) })}
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
              />
            </Field>
            <Field label="Peso (g)" className="col-span-1">
              <input
                type="number"
                min="0"
                value={v.weightG ?? ""}
                onChange={(e) =>
                  setVariant(i, { weightG: e.target.value ? Number(e.target.value) : null })
                }
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
              />
            </Field>
            <button
              type="button"
              onClick={() => removeVariant(i)}
              disabled={variants.length === 1}
              className="col-span-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 text-xs font-medium px-2 py-2"
            >
              ×
            </button>
          </div>
        ))}
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Imagens</h2>
          <button
            type="button"
            onClick={addImage}
            className="rounded-full bg-white/70 hover:bg-white text-xs font-medium px-3 py-1 border border-white"
          >
            + Adicionar URL manual
          </button>
        </div>

        <ImageUploader
          productId={productId}
          currentCount={images.length}
          onUploaded={(img) => setImages((prev) => [...prev, { ...img, position: prev.length }])}
        />

        {images.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/65">Nenhuma imagem ainda.</p>
        ) : null}
        {images.map((img, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <Field label="URL" className="col-span-7">
              <input
                value={img.url}
                onChange={(e) => setImage(i, { url: e.target.value })}
                placeholder="https://images.unsplash.com/..."
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-xs"
                required
              />
            </Field>
            <Field label="Texto alternativo" className="col-span-4">
              <input
                value={img.alt ?? ""}
                onChange={(e) => setImage(i, { alt: e.target.value })}
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2"
              />
            </Field>
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="col-span-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium px-2 py-2"
            >
              ×
            </button>
          </div>
        ))}
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Vídeos</h2>
          <button
            type="button"
            disabled={videos.length >= 4}
            onClick={() => setVideos((p) => [...p, { ...emptyVideo }])}
            className="rounded-full bg-white/70 hover:bg-white disabled:opacity-40 text-xs font-medium px-3 py-1 border border-white"
          >
            + Adicionar vídeo
          </button>
        </div>
        <p className="text-xs text-[color:var(--foreground)]/60">
          Até 4 — ordem é prioridade. Use o YouTube sempre que possível (incorpora direto no PDP).
        </p>
        {videos.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/65">Nenhum vídeo.</p>
        ) : null}
        {videos.map((v, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <Field label="URL" className="col-span-6">
              <input
                value={v.url}
                onChange={(e) =>
                  setVideos((prev) => prev.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))
                }
                placeholder="https://youtu.be/… · tiktok.com/… · instagram.com/reel/…"
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-xs"
              />
            </Field>
            <Field label="Fonte" className="col-span-3">
              <select
                value={v.source}
                onChange={(e) =>
                  setVideos((prev) =>
                    prev.map((x, idx) =>
                      idx === i ? { ...x, source: e.target.value as Video["source"] } : x,
                    ),
                  )
                }
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-xs"
              >
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="oci">OCI (self-hosted)</option>
              </select>
            </Field>
            <Field label="Tipo" className="col-span-2">
              <select
                value={v.kind}
                onChange={(e) =>
                  setVideos((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, kind: e.target.value as Video["kind"] } : x)),
                  )
                }
                className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-xs"
              >
                <option value="reel">Reel</option>
                <option value="story">Story</option>
              </select>
            </Field>
            <button
              type="button"
              onClick={() => setVideos((prev) => prev.filter((_, idx) => idx !== i))}
              className="col-span-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium px-2 py-2"
            >
              ×
            </button>
          </div>
        ))}
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white font-medium px-6 py-3"
        >
          {pending ? "Salvando…" : mode === "create" ? "Criar produto" : "Salvar alterações"}
        </button>
        {error ? (
          <span className={error === "Salvo!" ? "text-emerald-700" : "text-red-600"}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="block text-xs font-medium text-[color:var(--foreground)]/75 mb-1">
        {label}
        {hint ? <span className="ml-1 text-[color:var(--foreground)]/55">— {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
