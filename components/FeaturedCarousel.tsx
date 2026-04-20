"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/money";
import { shortName } from "@/lib/description";

type Item = {
  id: string;
  slug: string;
  name: string;
  images: Array<{ url: string; alt?: string | null }>;
  fromCents: number;
  badge?: "new" | "bestseller" | null;
};

// Landing-page featured carousel. Auto-advances every 4s, pauses on hover /
// keyboard focus / when offscreen. Cards fade-cycle through all images while
// they're the primary tile, so there's always motion — but never chaotic.
export function FeaturedCarousel({ items }: { items: Item[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // Pause when scrolled out of view — saves battery and avoids distraction
  // for customers scrolled down reading elsewhere.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setInView(e?.isIntersecting ?? true),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView || items.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 4000);
    return () => clearInterval(t);
  }, [paused, inView, items.length]);

  if (items.length === 0) return null;

  // Window of 3 visible tiles centered around the current index (desktop).
  // The CSS translates the whole track; we snap to the current index.
  const visible = 3;
  const offset = -(index * (100 / visible));

  return (
    <div
      ref={rootRef}
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="overflow-hidden -mx-4 sm:mx-0 sm:rounded-3xl">
        <ul
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(${offset}%)` }}
        >
          {items.concat(items).map((it, i) => (
            <li
              key={`${it.id}-${i}`}
              className="shrink-0 basis-full sm:basis-1/2 lg:basis-1/3 px-2 sm:px-3"
              aria-hidden={i % items.length !== index ? "true" : undefined}
            >
              <FeaturedTile item={it} isActive={i % items.length === index} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ir para destaque ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-8 bg-[color:var(--pink-500)]" : "w-2 bg-[color:var(--pink-500)]/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function FeaturedTile({ item, isActive }: { item: Item; isActive: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!isActive || item.images.length <= 1) {
      setFrame(0);
      return;
    }
    const t = setInterval(() => setFrame((f) => (f + 1) % item.images.length), 2200);
    return () => clearInterval(t);
  }, [isActive, item.images.length]);

  const primary = item.images[frame] ?? item.images[0];
  return (
    <Link
      href={`/loja/${item.slug}`}
      className="group glass-card rounded-2xl overflow-hidden block transition-transform hover:-translate-y-1"
    >
      <div className="relative aspect-[4/5] bg-pink-50/50">
        {item.images.map((img, i) => (
          <Image
            key={i}
            src={img.url}
            alt={img.alt ?? item.name}
            fill
            className={`object-cover transition-opacity duration-700 ${
              i === frame ? "opacity-100" : "opacity-0"
            }`}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={i === 0 && isActive}
          />
        )) /* Empty state */}
        {item.images.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[color:var(--pink-400)]">
            sem imagem
          </div>
        ) : null}
        {item.badge ? (
          <span
            className={`absolute top-3 left-3 rounded-full text-white text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 shadow ${
              item.badge === "bestseller" ? "bg-amber-500" : "bg-emerald-500"
            }`}
          >
            {item.badge === "bestseller" ? "Mais vendido" : "Novo"}
          </span>
        ) : isActive ? (
          <span className="absolute top-3 left-3 rounded-full bg-[color:var(--pink-500)] text-white text-xs font-semibold px-3 py-1 shadow">
            Destaque
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <h3 className="font-medium text-[color:var(--foreground)] line-clamp-2 min-h-[3em]" title={item.name}>
          {shortName(item.name, 54)}
        </h3>
        <p className="mt-2 text-[color:var(--pink-600)] font-semibold">
          a partir de {formatBRL(item.fromCents)}
        </p>
      </div>
    </Link>
  );
}
