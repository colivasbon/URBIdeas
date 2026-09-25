"use client";

import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <main id="contenido" className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="flex max-w-md flex-col items-center text-center" role="alert">
          <span className="text-[var(--rupestre-700)]" aria-hidden="true">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </span>
          <p className="type-overline mt-4 text-[var(--text-muted)]">Error inesperado</p>
          <h1 className="type-h3 mt-2 text-[var(--text-primary)]">No se pudo cargar la página</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            Ha ocurrido un problema al recuperar los datos. Puede reintentar la operación o
            volver al inicio.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="btn btn-primary">
              Reintentar
            </button>
            <Link href="/" className="btn btn-secondary">
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
