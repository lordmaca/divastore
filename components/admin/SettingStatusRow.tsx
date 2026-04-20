type Props = {
  label: string;
  envVar: string;
  configured: boolean;
  hint?: string;
};

// Read-only row for env-resident secrets. Shows "configured / not configured"
// and a bcrypt-style hint, never the value itself.
export function SettingStatusRow({ label, envVar, configured, hint }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-white/60 first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-xs font-mono text-[color:var(--foreground)]/55">{envVar}</p>
      </div>
      <div className="text-right shrink-0">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs ${
            configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {configured ? "configurado" : "ausente"}
        </span>
        {hint ? (
          <p className="mt-1 text-xs font-mono text-[color:var(--foreground)]/55">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
