"use client";

import { useRef, useState } from "react";

type Uploaded = { url: string; alt: string; position: number };

type Props = {
  productId?: string;
  onUploaded: (img: Uploaded) => void;
  currentCount: number;
  maxImages?: number;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export function ImageUploader({ productId, onUploaded, currentCount, maxImages = 20 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadOne(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", "product");
    if (productId) fd.append("productId", productId);
    const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "upload_failed" }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const json = (await res.json()) as { ok: true; url: string };
    return json.url;
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    const remaining = Math.max(0, maxImages - currentCount);
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) {
      setError(`Limite de ${maxImages} imagens atingido.`);
      return;
    }
    setBusy(true);
    try {
      let pos = currentCount;
      for (const f of files) {
        const url = await uploadOne(f);
        onUploaded({ url, alt: "", position: pos++ });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no upload.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-4 text-sm transition-colors ${
        dragOver ? "border-[color:var(--pink-500)] bg-pink-50" : "border-white/70 bg-white/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[color:var(--foreground)]/75">
          Arraste imagens aqui ou{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[color:var(--pink-600)] hover:underline"
          >
            selecione do computador
          </button>
          . jpg/png/webp/avif, até 8 MB.
        </p>
        <span className="text-xs text-[color:var(--foreground)]/55">
          {currentCount}/{maxImages}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy ? (
        <p className="mt-2 text-xs text-[color:var(--pink-600)]">Enviando…</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
