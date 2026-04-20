type Props = { value: number; size?: number; className?: string };

// Filled-vs-outline star bar. Read-only; for the input version use ReviewForm.
export function StarRating({ value, size = 16, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span aria-label={`${clamped.toFixed(1)} de 5`} className={`inline-flex gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} filled={i <= clamped} size={size} />
      ))}
    </span>
  );
}

function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2 L14.9 8.6 L22 9.3 L16.5 14.1 L18.2 21 L12 17.3 L5.8 21 L7.5 14.1 L2 9.3 L9.1 8.6 Z"
        fill={filled ? "var(--pink-500)" : "none"}
        stroke="var(--pink-500)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
