type Props = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  ariaLabel?: string;
};

// Tiny SVG sparkline. No external deps. Renders nothing if no data points.
export function Sparkline({
  values,
  width = 160,
  height = 36,
  stroke = "var(--pink-500)",
  fill = "rgba(255, 95, 169, 0.15)",
  ariaLabel,
}: Props) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const dx = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: i * dx,
    y: height - (v / max) * (height - 2) - 1,
  }));
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={ariaLabel} role="img">
      <path d={area} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
