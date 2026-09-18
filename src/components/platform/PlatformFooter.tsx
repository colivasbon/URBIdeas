import Image from "next/image";
import Link from "next/link";
import { CORPORATE_URL } from "./PlatformHeader";

export default function PlatformFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer text-hueso">
      <div className="h-1 w-full bg-conifera" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between lg:items-start">
          <div className="max-w-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-[6px] bg-white px-1.5 py-1">
                <Image
                  src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
                  alt="Ideas Medioambientales"
                  width={28}
                  height={28}
                  className="h-7 w-auto"
                />
              </span>
              <div>
                <p className="text-base font-bold">IDEAS Sostenibilidad</p>
                <p className="text-xs text-hueso/60 mt-0.5">
                  Área de Sostenibilidad de Ideas Medioambientales · Albacete
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-hueso/65">
              Conocimiento territorial para decisiones sostenibles. Análisis, diagnóstico municipal y apoyo técnico a proyectos.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Navegación de pie de página">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-conifera">Módulos</p>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">Inicio</Link>
                <Link href="/urbideas" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">URBideas</Link>
                <Link href="/socideas" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">SOCideas</Link>
                <Link href="/asistencias" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">Asistencias</Link>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-conifera">Recursos</p>
              <div className="flex flex-col gap-2">
                <Link href="/urbideas/municipios" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">Municipios</Link>
                <Link href="/urbideas/mapa" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">Mapa y dictamen</Link>
                <Link href="/urbideas/legislacion" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">Legislación</Link>
                <Link href="/socideas/como-funciona" className="text-sm text-hueso/70 hover:text-hueso transition-colors duration-150">Metodología</Link>
              </div>
            </div>
            <div className="max-w-xs col-span-2 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-conifera mb-1.5">Fuentes y aviso</p>
              <p className="text-sm text-hueso/70">INE · AEAT · SEPE · DIRCE</p>
              <p className="mt-2 text-xs leading-relaxed text-hueso/50">
                Información orientativa procedente de fuentes oficiales. Para validez jurídica, acuda al texto publicado en sede electrónica.
              </p>
            </div>
          </nav>
        </div>

        <div className="mt-10 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-hueso/50">
            &copy; {year} IDEAS Sostenibilidad · Ideas Medioambientales
          </p>
          <a
            href={CORPORATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-hueso/65 hover:text-conifera transition-colors duration-150"
          >
            ideasmedioambientales.com
          </a>
        </div>
      </div>
    </footer>
  );
}
