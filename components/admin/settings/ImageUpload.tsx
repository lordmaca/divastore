"use client";

import { useRef, useState } from "react";

// Single-image picker backed by the existing /api/admin/uploads endpoint
// (purpose="home" lands under S3 `homes/new/<random>.<ext>`). Returns the
// public URL via onChange. Shows a preview with a "Remover" button so the
// admin can clear the field.

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  aspect = "aspect-video",
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  aspect?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "home");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "upload_failed" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ok: true; url: string };
      onChange(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="text-sm font-medium mb-1">{label}</div>
      {value ? (
        <div className={`relative ${aspect} rounded-xl overflow-hidden bg-white/60`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1"
          >
            remover
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`${aspect} w-full rounded-xl border-2 border-dashed border-white bg-white/40 hover:bg-white/60 disabled:opacity-50 text-sm text-[color:var(--foreground)]/70 flex flex-col items-center justify-center gap-1`}
        >
          <span className="text-2xl">📷</span>
          <span>{busy ? "Enviando…" : "Escolher imagem"}</span>
          <span className="text-[10px] text-[color:var(--foreground)]/55">jpg / png / webp · até 8 MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      {hint ? <p className="mt-1 text-xs text-[color:var(--foreground)]/60">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
