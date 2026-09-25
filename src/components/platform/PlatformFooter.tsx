import Link from "next/link";
import { CORPORATE_URL } from "./PlatformHeader";

export default function PlatformFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-12 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between lg:items-start">
          <div className="max-w-sm">
            {/* Pendiente: no existe versión negativa del logo en /public/logo.
                Se usa wordmark tipográfico hasta disponer de ella (ver informe). */}
            <p className="text-base font-bold text-[var(--text-inverse)]">IDEAS Sostenibilidad</p>
            <p className="mt-1 text-xs text-[var(--text-inverse-secondary)]">
              Área de Sostenibilidad de Ideas Medioambientales · Albacete
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-inverse-secondary)]">
              Conocimiento territorial para decisiones sostenibles. Análisis, diagnóstico municipal
              y apoyo técnico a proyectos.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Navegación de pie de página">
            <div className="flex flex-col gap-2">
              <p className="type-overline text-[var(--retama)]">Módulos</p>
              <Link href="/" className="text-sm">Inicio</Link>
              <Link href="/urbideas" className="text-sm">URBideas</Link>
              <Link href="/socideas" className="text-sm">SOCideas</Link>
            </div>
            <div className="flex flex-col gap-2">
              <p className="type-overline text-[var(--retama)]">Recursos</p>
              <Link href="/urbideas/municipios" className="text-sm">Municipios</Link>
              <Link href="/urbideas/mapa" className="text-sm">Mapa y dictamen</Link>
              <Link href="/urbideas/legislacion" className="text-sm">Legislación</Link>
              <Link href="/socideas/como-funciona" className="text-sm">Metodología</Link>
            </div>
            <div className="col-span-2 max-w-xs sm:col-span-1">
              <p className="type-overline text-[var(--retama)]">Fuentes y aviso</p>
              <p className="mt-2 text-sm text-[var(--text-inverse)]">INE · AEAT · SEPE · DIRCE</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-inverse-secondary)]">
                Información orientativa procedente de fuentes oficiales. Para validez jurídica,
                acuda al texto publicado en sede electrónica.
              </p>
            </div>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/15 pt-5 sm:flex-row">
          <p className="text-xs text-[var(--text-inverse-secondary)]">
            &copy; {year} IDEAS Sostenibilidad · Ideas Medioambientales
          </p>
          <a
            href={CORPORATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-xs font-semibold text-[var(--text-inverse)]"
          >
            ideasmedioambientales.com
          </a>
        </div>
      </div>
    </footer>
  );
}
