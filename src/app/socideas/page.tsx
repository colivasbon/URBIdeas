import type { Metadata } from "next";
import Link from "next/link";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SocideasSearch from "@/components/socideas/SocideasSearch";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialBackground from "@/components/ui/TerritorialBackground";
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
      <SocideasHeader />

      <main className="flex-1 bg-[var(--color-dark-bg)]">
        <EditorialParallaxHero decor={<TerritorialBackground variant="grid" />} className="hero-musgo bg-[var(--brand-bg)] text-hueso">
        <section className="relative">
          <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8 pb-10">
            <p className="editorial-eyebrow">
              <span>SOCideas · Beta interna · IDEAS Sostenibilidad</span>
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl" style={{ lineHeight: 1.12 }}>
              Diagnóstico municipal con fuentes oficiales
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-hueso sm:text-lg">
              Diagnóstico demográfico y económico de cualquier municipio español a partir de fuentes oficiales trazables. El buscador es el punto de partida.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <SourcePill title="Demografía disponible con trazabilidad INE">
                Demografía disponible · INE
              </SourcePill>
            </div>
            <section aria-label="Buscador municipal" className="glass-card mt-8 rounded-[6px] p-5 text-[var(--color-text-primary)] sm:p-7">
              <SectionHeading
                title="Buscador municipal"
                lede="Escriba el nombre del municipio o de su provincia para abrir su ficha de caracterización."
              />
              <div className="mt-5">
                <SocideasSearch />
              </div>
            </section>
          </div>
        </section>
        </EditorialParallaxHero>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <section aria-label="Fuentes y cobertura">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Fuentes y cobertura</h2>
              <SourcePill title="Economía en desarrollo por subbloques con año declarado">
                Economía en desarrollo · AEAT · ADRH · DIRCE
              </SourcePill>
            </div>
            <div className="mt-6 grid gap-x-8 gap-y-6 md:grid-cols-3">
              <div className="border-t-2 border-t-musgo pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--moss-ink)]">Demografía</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">Población municipal, evolución anual y estructura por edad y sexo. Instituto Nacional de Estadística.</p>
                <p className="mt-3 inline-flex rounded-[6px] bg-musgo px-2 py-0.5 text-xs font-semibold text-white">Disponible</p>
              </div>
              <div className="border-t-2 border-t-conifera pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--moss-ink)]">Economía</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">Renta por declaración, renta y desigualdad, empresas y sector agrario. Cada subbloque declara cobertura y año.</p>
                <p className="mt-3 inline-flex rounded-[6px] bg-crisopa px-2 py-0.5 text-xs font-semibold text-carbon">En desarrollo</p>
              </div>
              <div className="border-t-2 border-dashed border-t-limo pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Secciones censales</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">Geometría oficial del INE bajo demanda. Indicadores por sección solo con fuente oficial a ese nivel.</p>
                <p className="mt-3 inline-flex rounded-[6px] border border-[var(--color-border)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-muted)]" style={{ backgroundColor: 'var(--color-input-bg)' }}>En preparación</p>
              </div>
            </div>
            <p className="mt-6 border-t border-[var(--color-border-subtle)] pt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
              Los datos se sincronizan de forma controlada y se almacenan con trazabilidad; no se consulta a las fuentes oficiales en cada visita.
            </p>
          </section>

          <section aria-label="Enlaces relacionados" className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              style={{ backgroundColor: 'var(--color-card-bg)', color: 'var(--color-text-primary)', borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--color-primary)' }}
              className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold rounded-[6px] hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              Volver a la plataforma
            </Link>
            <Link
              href="/urbideas"
              style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
              className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold rounded-[6px] hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
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
