export default function LojaLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="h-10 w-64 rounded-full bg-white/50 animate-pulse mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card rounded-2xl overflow-hidden">
            <div className="aspect-square bg-pink-50/60 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 bg-white/60 rounded animate-pulse" />
              <div className="h-4 w-1/3 bg-white/60 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
