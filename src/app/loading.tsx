export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-14 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] md:h-16" aria-hidden="true" />
      <main id="contenido" className="container-ima flex-1 pb-16" role="status" aria-live="polite" aria-label="Cargando página">
        <div className="page-head" aria-hidden="true">
          <div className="skeleton h-4 w-48" />
          <div className="skeleton mt-6 h-10 w-full max-w-xl" />
          <div className="skeleton mt-4 h-5 w-full max-w-2xl" />
          <div className="skeleton mt-2 h-5 w-full max-w-lg" />
        </div>
        <div className="border-t border-[var(--border-strong)]" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid gap-2 border-b border-[var(--border-subtle)] py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-4 w-full max-w-md" />
            </div>
          ))}
        </div>
        <span className="sr-only">Cargando página…</span>
      </main>
    </div>
  );
}
