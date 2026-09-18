// Estado de carga instantáneo de la ficha municipal (App Router: loading.tsx).
// Se muestra mientras el servidor resuelve la hoja activa (Supabase + capas R2).
// Reutiliza el esqueleto premium del sistema (pulso plano, sin shimmer).
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-live="polite">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="premium-skeleton h-6 w-6 rounded-[6px]" />
          <div className="premium-skeleton h-4 w-24 rounded-[4px]" />
          <div className="premium-skeleton ml-auto h-8 w-48 rounded-[6px]" />
        </div>
      </div>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mb-8 border-b border-[var(--color-border-subtle)] pb-8">
            <div className="premium-skeleton h-3 w-40 rounded-[4px]" />
            <div className="premium-skeleton mt-4 h-9 w-72 max-w-full rounded-[6px]" />
            <div className="premium-skeleton mt-3 h-4 w-56 max-w-full rounded-[4px]" />
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="premium-skeleton h-9 w-36 rounded-[6px]" />
            ))}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <span className="tab-spinner is-pending" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
              Cargando hoja del libro…
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="premium-card p-4">
                <div className="premium-skeleton h-3 w-20 rounded-[4px]" />
                <div className="premium-skeleton mt-3 h-7 w-28 rounded-[4px]" />
                <div className="premium-skeleton mt-3 h-3 w-24 rounded-[4px]" />
              </div>
            ))}
          </div>

          <div className="premium-card mt-8 p-5">
            <div className="premium-skeleton h-4 w-52 rounded-[4px]" />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="premium-skeleton h-5 w-full rounded-[4px]" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
