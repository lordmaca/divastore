type Item = { icon: string; text: string };

export function UspBar({ items }: { items: Item[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="w-full border-y border-white/60 bg-white/40 backdrop-blur-sm">
      <ul className="mx-auto max-w-6xl px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {items.slice(0, 6).map((it, i) => (
          <li
            key={`${it.text}-${i}`}
            className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[color:var(--foreground)]/80"
          >
            <span className="text-lg" aria-hidden>
              {it.icon}
            </span>
            <span className="font-medium">{it.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
