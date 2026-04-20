export default function PdpLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="h-4 w-40 bg-white/50 rounded animate-pulse mb-6" />
      <div className="grid lg:grid-cols-2 gap-10">
        <div className="aspect-square rounded-2xl glass-card animate-pulse" />
        <div className="space-y-4">
          <div className="h-10 w-2/3 bg-white/60 rounded animate-pulse" />
          <div className="h-4 w-full bg-white/50 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-white/50 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-white/50 rounded animate-pulse" />
          <div className="h-32 rounded-2xl glass-card animate-pulse" />
        </div>
      </div>
    </main>
  );
}
