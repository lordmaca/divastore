"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type HeroSlide = {
  id: string;
  imageUrl: string;
  imageAlt?: string;
  headline: string;
  sub?: string;
  ctaLabel: string;
  ctaUrl: string;
};

// Full-bleed rotating hero. Auto-advances every `autoplayMs` ms; pauses on
// hover / focus / when offscreen. Shows pagination dots + prev/next arrows
// on wider viewports. Mobile-friendly (height clamps, text scales down).
export function HeroSlider({
  slides,
  autoplayMs = 5000,
}: {
  slides: HeroSlide[];
  autoplayMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

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
    if (slides.length <= 1 || paused || !inView) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), autoplayMs);
    return () => clearInterval(t);
  }, [slides.length, paused, inView, autoplayMs]);

  if (slides.length === 0) return null;

  return (
    <section
      ref={rootRef}
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative h-[58vh] min-h-[420px] max-h-[620px] overflow-hidden">
        {slides.map((s, i) => (
          <div
            key={s.id}
            aria-hidden={i !== index ? "true" : undefined}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.imageUrl}
              alt={s.imageAlt ?? s.headline}
              loading={i === 0 ? "eager" : "lazy"}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
            <div className="absolute inset-0 flex items-end sm:items-center">
              <div className="mx-auto max-w-6xl px-6 sm:px-12 pb-10 sm:pb-0 w-full text-white">
                <div className="max-w-xl">
                  <h1 className="font-display text-4xl sm:text-6xl leading-[1.05] drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                    {s.headline}
                  </h1>
                  {s.sub ? (
                    <p className="mt-4 text-base sm:text-lg text-white/90 drop-shadow">
                      {s.sub}
                    </p>
                  ) : null}
                  {s.ctaLabel ? (
                    <Link
                      href={s.ctaUrl || "/loja"}
                      className="mt-6 inline-flex items-center justify-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-7 py-3 shadow-lg"
                    >
                      {s.ctaLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {slides.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() =>
              setIndex((i) => (i - 1 + slides.length) % slides.length)
            }
            aria-label="Slide anterior"
            className="hidden sm:flex absolute top-1/2 -translate-y-1/2 left-3 w-10 h-10 items-center justify-center rounded-full bg-white/30 hover:bg-white/50 text-white backdrop-blur"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            aria-label="Próximo slide"
            className="hidden sm:flex absolute top-1/2 -translate-y-1/2 right-3 w-10 h-10 items-center justify-center rounded-full bg-white/30 hover:bg-white/50 text-white backdrop-blur"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-8 bg-white" : "w-2 bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
