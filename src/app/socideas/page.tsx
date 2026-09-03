import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SocideasSearch from "@/components/socideas/SocideasSearch";

export const metadata: Metadata = {
  title: "SOCideas",
  description:
    "Beta interna de IDEAS Sostenibilidad para la caracterización sociodemográfica municipal con fuentes oficiales trazables.",
};

export default function SocideasHub() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <section className="mb-8 border-b border-[var(--color-border-subtle)] pb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-[var(--color-secondary)]" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)]">
                Beta interna · Fase 2B
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              SOCideas
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--color-text-secondary)]">
              Diagnóstico demográfico y económico de cualquier municipio español a partir de fuentes
              oficiales trazables.
            </p>
          </section>

          <section aria-label="Buscador municipal" className="ideas-section">
            <h2 className="ideas-h2">Buscador municipal</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Escriba el nombre del municipio o de su provincia para abrir su ficha de caracterización.
            </p>
            <div className="mt-4">
              <SocideasSearch />
            </div>
          </section>

          <section aria-label="Fuentes y cobertura" className="mt-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">Fuentes y cobertura (Fase 2B)</h2>
            <ul className="mt-3 list-disc pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              <li>
                <strong>Demografía (disponible):</strong> Instituto Nacional de Estadística (API
                Tempus3): población municipal, evolución anual y estructura por edad y sexo.
              </li>
              <li>
                <strong>Economía (en desarrollo):</strong> AEAT (renta por declaración), INE-ADRH
                (renta y desigualdad), DIRCE (empresas) y Censo Agrario 2020 (superficie y
                ganadería). Cada subbloque declara su cobertura y su año.
              </li>
              <li>
                <strong>Secciones censales (en preparación):</strong> geometría oficial del INE bajo
                demanda; los indicadores por sección solo llegarán con fuente oficial a ese nivel.
              </li>
              <li>
                Los datos se sincronizan de forma controlada y se almacenan con
                trazabilidad; no se consulta a las fuentes oficiales en cada visita.
              </li>
            </ul>
          </section>

          <section aria-label="Enlaces relacionados" className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] transition-all duration-300"
            >
              Volver a la plataforma
            </Link>
            <Link
              href="/urbideas"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all duration-300"
            >
              Acceder a URBideas
            </Link>
          </section>
        </div>
      </main>

      <PlatformFooter />
    </div>
  );
}
