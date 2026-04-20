type Props = { className?: string; size?: number; delay?: string };

export function Sparkle({ className = "", size = 20, delay = "0s" }: Props) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`sparkle ${className}`}
      style={{ animationDelay: delay }}
    >
      <path
        d="M12 0 L13.6 9 L24 12 L13.6 15 L12 24 L10.4 15 L0 12 L10.4 9 Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}
