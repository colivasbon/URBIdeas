// Estado de carga instantáneo de la ficha municipal (App Router: loading.tsx).
// Se muestra mientras el servidor resuelve la hoja activa (Supabase + capas R2).
// Reproduce la estructura de la ficha (cabecera, pestañas, cifras y tabla) con
// el esqueleto del sistema: pulso plano, sin shimmer.
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-live="polite">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="container-ima flex items-center gap-3 py-4">
          <div className="premium-skeleton h-6 w-6 rounded-[6px]" />
          <div className="premium-skeleton h-4 w-24 rounded-[6px]" />
          <div className="premium-skeleton ml-auto h-8 w-48 rounded-[6px]" />
        </div>
      </div>

      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <div className="page-head">
            <div className="premium-skeleton h-4 w-56 max-w-full rounded-[6px]" />
            <div className="premium-skeleton mt-8 h-10 w-72 max-w-full rounded-[6px]" />
            <div className="premium-skeleton mt-5 h-4 w-80 max-w-full rounded-[6px]" />
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-5">
              <div className="premium-skeleton h-4 w-64 max-w-full rounded-[6px]" />
              <div className="premium-skeleton h-10 w-48 rounded-[6px]" />
            </div>
          </div>

          <div className="-mt-4 flex gap-6 overflow-hidden border-b border-[var(--border-subtle)] pb-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="premium-skeleton h-4 w-28 shrink-0 rounded-[6px]" />
            ))}
          </div>

          <div className="mt-10 flex items-center gap-3">
            <span className="spinner h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            <p className="text-sm text-[var(--text-secondary)]">Cargando la hoja del libro…</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border-t border-[var(--border-strong)] pt-3">
                <div className="premium-skeleton h-7 w-28 rounded-[6px]" />
                <div className="premium-skeleton mt-3 h-3 w-24 rounded-[6px]" />
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-[var(--border-subtle)] pt-10">
            <div className="premium-skeleton h-5 w-52 rounded-[6px]" />
            <div className="mt-5 flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="premium-skeleton h-5 w-full rounded-[6px]" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
