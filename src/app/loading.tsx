export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-14 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] md:h-16" aria-hidden="true" />
      <main id="contenido" className="container-ima flex-1 py-12" role="status" aria-live="polite" aria-label="Cargando página">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton mt-4 h-10 w-full max-w-xl" />
        <div className="skeleton mt-3 h-5 w-full max-w-2xl" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-4 h-6 w-3/4" />
              <div className="skeleton mt-3 h-4 w-full" />
              <div className="skeleton mt-2 h-4 w-5/6" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
