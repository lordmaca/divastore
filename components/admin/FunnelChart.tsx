import { Sparkline } from "./Sparkline";
import { type DayBucket, FUNNEL_LABELS } from "@/lib/metrics";

type Props = {
  data: {
    views: DayBucket[];
    addsToCart: DayBucket[];
    beginCheckout: DayBucket[];
    ordersPaid: DayBucket[];
  };
};

function totals(d: DayBucket[]): number {
  return d.reduce((acc, b) => acc + b.value, 0);
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

export function FunnelChart({ data }: Props) {
  const v = totals(data.views);
  const a = totals(data.addsToCart);
  const b = totals(data.beginCheckout);
  const p = totals(data.ordersPaid);
  return (
    <div className="grid sm:grid-cols-4 gap-3">
      <FunnelStep
        label={FUNNEL_LABELS.views}
        total={v}
        rate={null}
        series={data.views.map((x) => x.value)}
      />
      <FunnelStep
        label={FUNNEL_LABELS.addsToCart}
        total={a}
        rate={pct(a, v)}
        series={data.addsToCart.map((x) => x.value)}
      />
      <FunnelStep
        label={FUNNEL_LABELS.beginCheckout}
        total={b}
        rate={pct(b, a)}
        series={data.beginCheckout.map((x) => x.value)}
      />
      <FunnelStep
        label={FUNNEL_LABELS.ordersPaid}
        total={p}
        rate={pct(p, b)}
        series={data.ordersPaid.map((x) => x.value)}
      />
    </div>
  );
}

function FunnelStep({
  label,
  total,
  rate,
  series,
}: {
  label: string;
  total: number;
  rate: string | null;
  series: number[];
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">{label}</p>
      <div className="flex items-baseline justify-between mt-1">
        <p className="text-xl font-semibold text-[color:var(--pink-600)]">{total.toLocaleString("pt-BR")}</p>
        {rate ? (
          <p className="text-xs text-[color:var(--foreground)]/55">conv {rate}</p>
        ) : null}
      </div>
      <div className="mt-2">
        <Sparkline values={series} ariaLabel={`${label} últimos 28 dias`} />
      </div>
    </div>
  );
}
