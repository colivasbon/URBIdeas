import Image from "next/image";
import Link from "next/link";
import { CORPORATE_URL } from "./PlatformHeader";

export default function PlatformFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto opacity-80"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">IDEAS Sostenibilidad</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Área de Sostenibilidad de Ideas Medioambientales
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-4 sm:flex-row sm:gap-10" aria-label="Navegación de pie de página">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Módulos</p>
              <div className="flex flex-col gap-1">
                <Link href="/" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Inicio</Link>
                <Link href="/urbideas" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">URBideas · análisis territorial</Link>
                <Link href="/socideas" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">SOCideas · diagnóstico municipal</Link>
                <Link href="/socideas/como-funciona" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Cómo funciona SOCideas</Link>
                <Link href="/asistencias" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Asistencias</Link>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fuentes</p>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-[var(--color-text-secondary)]">INE · AEAT · SEPE · DIRCE</p>
                <p className="text-xs text-[var(--color-text-muted)]">Trazabilidad por indicador y año</p>
              </div>
            </div>
            <div className="max-w-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Aviso</p>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                La información mostrada procede de fuentes oficiales. Su consulta es orientativa;
                para validez jurídica, acuda al texto publicado en la correspondiente sede electrónica.
              </p>
            </div>
          </nav>
        </div>

        <div className="mt-8 pt-5 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            &copy; {year} IDEAS Sostenibilidad · Ideas Medioambientales
          </p>
          <a
            href={CORPORATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            ideasmedioambientales.com <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
