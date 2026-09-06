import type { Metadata } from "next";
import PlatformHeader, { CORPORATE_URL } from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import ModuleCard from "@/components/platform/ModuleCard";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialBackground from "@/components/ui/TerritorialBackground";
import SectionEyebrow from "@/components/ui/SectionEyebrow";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "IDEAS Sostenibilidad | Ideas Medioambientales",
  description:
    "Plataforma del Área de Sostenibilidad de Ideas Medioambientales para el análisis territorial, la consulta municipal y el apoyo técnico a proyectos.",
};

export default function PlatformHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />

      <main className="flex-1">
        <EditorialParallaxHero decor={<TerritorialBackground variant="transition" />}>
        <section className="relative border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-10 sm:py-14 lg:py-20 flex flex-col items-center text-center gap-6">
              <div className="max-w-3xl w-full premium-reveal">
                <SectionEyebrow>
                  IDEAS Sostenibilidad · Área de Sostenibilidad de Ideas Medioambientales
                </SectionEyebrow>
                <h1 className="editorial-display mt-4 text-4xl text-[var(--color-text-primary)] sm:text-5xl lg:text-6xl">
                  Conocimiento territorial para decisiones sostenibles
                </h1>
                <p className="editorial-lede mt-6 max-w-2xl mx-auto">
                  Análisis territorial, diagnóstico municipal con fuentes oficiales y apoyo técnico a
                  proyectos, en una sola plataforma.
                </p>
                <dl className="mt-8 flex flex-wrap items-stretch justify-center gap-3 text-left">
                  {[
                    { v: "8.130", l: "Municipios con ficha territorial" },
                    { v: "INE · AEAT · SEPE", l: "Fuentes oficiales trazables" },
                    { v: "2 + 1", l: "Módulos activos y área en preparación" },
                  ].map((d) => (
                    <div
                      key={d.l}
                      className="data-card min-w-40 flex-1 sm:max-w-60"
                    >
                      <dt className="data-card__detail">{d.l}</dt>
                      <dd className="data-card__value text-lg">{d.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>
        </EditorialParallaxHero>

        <section aria-label="Módulos de la plataforma">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="mb-8">
              <SectionEyebrow>Módulos</SectionEyebrow>
              <div className="mt-3">
                <SectionHeading
                  title="Dos módulos de consulta, un área en preparación"
                  lede="URBideas para el análisis territorial y SOCideas para el diagnóstico municipal. Cada entrada conserva su acento y comparte el mismo lenguaje de datos."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <ModuleCard
                kicker="Módulo disponible"
                title="URBideas"
                description="Análisis territorial, urbanístico y geoespacial."
                href="/urbideas"
                cta="Acceder a URBideas"
              />
              <ModuleCard
                kicker="Beta interna"
                title="SOCideas"
                description="Diagnóstico demográfico y económico municipal con fuentes oficiales: población, renta, desigualdad, empresas y sector agrario."
                href="/socideas"
                cta="Buscar un municipio"
                badge="Demografía disponible · Economía en desarrollo"
              />
              <ModuleCard
                kicker="Área de trabajo"
                title="Asistencias de sostenibilidad"
                description="Herramientas y procesos de apoyo para la caracterización territorial, la comunicación, la participación, la responsabilidad social y el seguimiento de proyectos."
                href="/asistencias"
                cta="Ver asistencias"
                badge="Próximamente"
              />
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg-elevated)]">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
              La plataforma
            </p>
            <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-[var(--color-text-primary)]">
              Una plataforma desarrollada por Ideas Medioambientales para integrar información,
              análisis y herramientas aplicadas a la sostenibilidad territorial.
            </p>
            <a
              href={CORPORATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
            >
              Visitar Ideas Medioambientales
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
