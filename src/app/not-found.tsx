import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <main id="contenido" className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="flex max-w-md flex-col items-center text-center">
          <span className="text-[var(--musgo)]" aria-hidden="true">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6.75V15m6-6v8.25m.5-12.75 4.5 2.25v13.5l-4.5-2.25-6 3-4.5-2.25V5.25l4.5 2.25 6-3Z"
              />
            </svg>
          </span>
          <p className="type-overline mt-4 text-[var(--text-muted)]">Error 404</p>
          <h1 className="type-h3 mt-2 text-[var(--text-primary)]">Esta página no existe</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            La dirección puede estar mal escrita o el recurso haberse movido. Puede volver al
            inicio o buscar directamente un municipio.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-primary">
              Volver al inicio
            </Link>
            <Link href="/urbideas/municipios" className="btn btn-secondary">
              Buscar municipio
            </Link>
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
