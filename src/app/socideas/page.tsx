import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SocideasSearch from "@/components/socideas/SocideasSearch";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialBackground from "@/components/ui/TerritorialBackground";
import PageShell from "@/components/ui/PageShell";
import SectionHeading from "@/components/ui/SectionHeading";
import SourcePill from "@/components/ui/SourcePill";

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
        <EditorialParallaxHero decor={<TerritorialBackground variant="grid" />}>
          <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8 pb-10">
            <PageShell
              eyebrow="SOCideas · Beta interna · Módulo de IDEAS Sostenibilidad"
              title="Diagnóstico municipal con fuentes oficiales"
              lede="Diagnóstico demográfico y económico de cualquier municipio español a partir de fuentes oficiales trazables. El buscador es el punto de partida: escriba, filtre y abra la ficha."
              meta={
                <SourcePill title="Demografía disponible con trazabilidad INE">
                  Demografía disponible · INE
                </SourcePill>
              }
            />
            <section aria-label="Buscador municipal" className="premium-card relative mt-8 p-5 sm:p-7">
              <SectionHeading
                title="Buscador municipal"
                lede="Escriba el nombre del municipio o de su provincia para abrir su ficha de caracterización."
              />
              <div className="mt-5">
                <SocideasSearch />
              </div>
            </section>
          </div>
        </EditorialParallaxHero>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <section aria-label="Fuentes y cobertura" className="premium-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">Fuentes y cobertura (Fase 2B)</h2>
              <SourcePill title="Economía en desarrollo por subbloques con año declarado">
                Economía en desarrollo · AEAT · ADRH · DIRCE
              </SourcePill>
            </div>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            >
              Volver a la plataforma
            </Link>
            <Link
              href="/urbideas"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
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
