"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Props = {
  images: Array<{ url: string; alt?: string | null }>;
  fallbackAlt: string;
};

// Card-level slideshow: shows image 0 by default, fades through the rest while
// the card is hovered (desktop) or focused (keyboard). Pauses when the user
// leaves. On touch devices a quick tap toggles between frames so the slideshow
// is still discoverable without hover state. Dot indicators show position.
export function ProductCardSlideshow({ images, fallbackAlt }: Props) {
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || images.length <= 1) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 1400);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [active, images.length]);

  // When hover/focus ends, snap back to the cover so the grid looks tidy.
  useEffect(() => {
    if (!active) setIndex(0);
  }, [active]);

  if (images.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-[color:var(--pink-400)]">
        sem imagem
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onTouchStart={() => {
        // Tap to advance one frame; UX hint that there's more to see.
        setIndex((i) => (i + 1) % images.length);
      }}
    >
      {images.map((img, i) => (
        <Image
          key={i}
          src={img.url}
          alt={img.alt ?? fallbackAlt}
          fill
          className={`object-cover transition-opacity duration-500 ${
            i === index ? "opacity-100" : "opacity-0"
          } ${i === 0 ? "group-hover:scale-[1.03]" : ""} transition-transform`}
          sizes="(max-width: 640px) 50vw, 25vw"
          priority={i === 0}
        />
      ))}

      {images.length > 1 ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === index ? "w-4 bg-white" : "w-1 bg-white/60"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
