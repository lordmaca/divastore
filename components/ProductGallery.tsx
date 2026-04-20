"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  youtubeId,
  youtubeEmbedUrl,
  youtubeThumbnail,
  platformLabel,
} from "@/lib/video";

type ImageMedia = {
  kind: "image";
  id: string;
  url: string;
  alt: string | null;
};
type VideoMedia = {
  kind: "video";
  id: string;
  url: string;
  source: "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "OCI";
  format: "REEL" | "STORY";
};
export type MediaItem = ImageMedia | VideoMedia;

type Props = {
  media: MediaItem[];
  productName: string;
};

function isYouTubeShort(url: string): boolean {
  return /youtube\.com\/shorts\//.test(url);
}

function VideoThumbInner({ item, productName }: { item: VideoMedia; productName: string }) {
  if (item.source === "YOUTUBE") {
    const id = youtubeId(item.url);
    if (id) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          src={youtubeThumbnail(id)}
          alt={`${productName} — vídeo`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      );
    }
  }
  const grad =
    item.source === "TIKTOK"
      ? "from-zinc-800 to-zinc-900"
      : item.source === "INSTAGRAM"
        ? "from-fuchsia-500 to-amber-400"
        : "from-pink-200 to-pink-300";
  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${grad}`}>
      <span className="absolute bottom-1 right-1 text-[10px] font-semibold text-white bg-black/40 rounded px-1 py-0.5">
        {platformLabel(item.source)}
      </span>
    </div>
  );
}

function Thumb({
  item,
  isActive,
  onClick,
  productName,
}: {
  item: MediaItem;
  isActive: boolean;
  onClick: () => void;
  productName: string;
}) {
  const ring = isActive
    ? "ring-2 ring-[color:var(--pink-500)] ring-offset-2 ring-offset-transparent"
    : "opacity-75 hover:opacity-100";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={item.kind === "video" ? "Vídeo" : "Imagem"}
      aria-current={isActive ? "true" : undefined}
      className={`relative aspect-square rounded-xl overflow-hidden transition-all ${ring}`}
    >
      {item.kind === "image" ? (
        <Image src={item.url} alt={item.alt ?? productName} fill className="object-cover" sizes="20vw" />
      ) : (
        <VideoThumbInner item={item} productName={productName} />
      )}
      {item.kind === "video" ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/55 text-white w-8 h-8 flex items-center justify-center text-sm">
            ▶
          </span>
        </span>
      ) : null}
    </button>
  );
}

function PrimaryFrame({ item, productName }: { item: MediaItem; productName: string }) {
  if (item.kind === "image") {
    return (
      <Image
        key={item.id}
        src={item.url}
        alt={item.alt ?? productName}
        fill
        className="object-cover transition-opacity duration-300"
        sizes="(max-width: 1024px) 100vw, 50vw"
        priority
      />
    );
  }
  if (item.source === "YOUTUBE") {
    const id = youtubeId(item.url);
    if (id) {
      const short = isYouTubeShort(item.url) || item.format === "REEL";
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <iframe
            key={`yt-${id}`}
            src={`${youtubeEmbedUrl(id)}&playsinline=1`}
            title={`${productName} — vídeo`}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={`border-0 ${short ? "h-full aspect-[9/16]" : "w-full aspect-video"}`}
          />
        </div>
      );
    }
  }
  if (item.source === "OCI") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={item.url} controls preload="metadata" className="max-w-full max-h-full" />
      </div>
    );
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-pink-100 to-pink-200 group"
    >
      <span className="rounded-full bg-black/60 text-white w-16 h-16 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
        ▶
      </span>
      <span className="mt-3 rounded-full bg-white/85 text-[color:var(--pink-600)] font-medium px-4 py-1.5 text-sm shadow">
        Abrir no {platformLabel(item.source)}
      </span>
    </a>
  );
}

export function ProductGallery({ media, productName }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const total = media.length;
  const next = useCallback(() => setActive((i) => (i + 1) % Math.max(1, total)), [total]);
  const prev = useCallback(
    () => setActive((i) => (i - 1 + Math.max(1, total)) % Math.max(1, total)),
    [total],
  );

  useEffect(() => {
    if (!lightbox) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox, next, prev]);

  if (total === 0) {
    return (
      <div className="relative aspect-square rounded-2xl overflow-hidden glass-card flex items-center justify-center text-[color:var(--pink-400)]">
        sem imagem
      </div>
    );
  }

  const current = media[active];
  const isVideo = current.kind === "video";

  return (
    <div className="space-y-3">
      {isVideo ? (
        <div
          className="relative aspect-square rounded-2xl overflow-hidden glass-card w-full"
        >
          <PrimaryFrame item={current} productName={productName} />
          {total > 1 ? (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/50 text-white text-xs px-2 py-0.5 pointer-events-none">
              {active + 1} / {total}
            </span>
          ) : null}
          <span className="absolute top-3 left-3 rounded-full bg-[color:var(--pink-500)] text-white text-xs font-semibold px-2 py-0.5 shadow pointer-events-none">
            {platformLabel(current.source)} · {current.format === "REEL" ? "Reel" : "Story"}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label={`Ampliar ${productName}`}
          className="relative aspect-square rounded-2xl overflow-hidden glass-card block w-full group"
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
            if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
            touchX.current = null;
          }}
        >
          <PrimaryFrame item={current} productName={productName} />
          <span
            aria-hidden
            className="absolute bottom-3 right-3 rounded-full bg-white/80 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
          >
            ⤢ ampliar
          </span>
          {total > 1 ? (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/50 text-white text-xs px-2 py-0.5">
              {active + 1} / {total}
            </span>
          ) : null}
        </button>
      )}

      {total > 1 ? (
        <div className="grid grid-cols-5 gap-2">
          {media.map((item, i) => (
            <Thumb
              key={item.id}
              item={item}
              isActive={i === active}
              onClick={() => setActive(i)}
              productName={productName}
            />
          ))}
        </div>
      ) : null}

      {lightbox && current.kind === "image" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} — imagem ${active + 1} de ${total}`}
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center animate-[fadeIn_.15s_ease-out]"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white text-xl flex items-center justify-center"
          >
            ✕
          </button>

          {total > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label="Anterior"
                className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white text-xl flex items-center justify-center"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label="Próxima"
                className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white text-xl flex items-center justify-center"
              >
                ›
              </button>
            </>
          ) : null}

          <div
            className="relative w-full max-w-5xl aspect-square sm:aspect-[4/3] mx-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
              if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
              touchX.current = null;
            }}
          >
            <Image
              key={`lb-${current.id}`}
              src={current.url}
              alt={current.alt ?? productName}
              fill
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>

          {total > 1 ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
              {media.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === active ? "w-6 bg-white" : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
