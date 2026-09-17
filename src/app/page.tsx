import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader, { CORPORATE_URL } from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import ModuleCard from "@/components/platform/ModuleCard";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
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

      <main className="flex-1 bg-[var(--color-dark-bg)]">
        <EditorialParallaxHero className="hero-musgo bg-[var(--brand-bg)] text-hueso">
        <section className="relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-14 sm:py-18 lg:py-24">
              <div className="max-w-3xl">
                <p className="editorial-eyebrow">
                  <span>IDEAS Sostenibilidad · Ideas Medioambientales</span>
                </p>
                <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl" style={{ lineHeight: 1.08 }}>
                  Conocimiento territorial para decisiones sostenibles
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-hueso sm:text-lg">
                  Análisis territorial, diagnóstico municipal con fuentes oficiales y apoyo técnico a
                  proyectos, en una sola plataforma.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/urbideas"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
                    className="inline-flex min-h-[48px] items-center px-6 py-3 text-sm font-semibold rounded-[6px] hover:opacity-90 transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
                  >
                    Acceder a URBideas
                  </Link>
                  <Link
                    href="/socideas"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)', borderWidth: '2px', borderStyle: 'solid' }}
                    className="inline-flex min-h-[48px] items-center px-6 py-3 text-sm font-semibold rounded-[6px] hover:opacity-80 transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  >
                    Buscar un municipio
                  </Link>
                </div>
                <dl className="tnum mt-12 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-white/20 pt-6 sm:grid-cols-3">
                  {[
                    { v: "8.130", l: "Municipios con ficha territorial" },
                    { v: "INE · AEAT · SEPE", l: "Fuentes oficiales trazables" },
                    { v: "2 + 1", l: "Módulos activos y área en preparación" },
                  ].map((d) => (
                    <div key={d.l} className="sm:border-l sm:border-white/20 sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
                      <dd className="text-2xl font-bold tracking-tight">{d.v}</dd>
                      <dt className="mt-1 text-xs leading-relaxed text-hueso/70">{d.l}</dt>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>
        </EditorialParallaxHero>

        <section aria-label="Módulos de la plataforma">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
            <div className="mb-10">
              <SectionEyebrow>Módulos</SectionEyebrow>
              <div className="mt-3">
                <SectionHeading
                  title="Dos módulos de consulta, un área en preparación"
                  lede="URBideas para el análisis territorial y SOCideas para el diagnóstico municipal. Mismo lenguaje de datos, misma trazabilidad."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <ModuleCard
                kicker="Módulo disponible"
                title="URBideas"
                description="Análisis territorial, urbanístico y geoespacial. Dictamen de ámbito con cruce de afecciones y expediente descargable."
                href="/urbideas"
                cta="Acceder a URBideas"
              />
              <ModuleCard
                kicker="Beta interna"
                title="SOCideas"
                description="Diagnóstico demográfico y económico municipal con fuentes oficiales: población, renta, desigualdad, empresas y sector agrario."
                href="/socideas"
                cta="Buscar un municipio"
                badge="Demografía disponible"
              />
              <ModuleCard
                kicker="Área de trabajo"
                title="Asistencias de sostenibilidad"
                description="Apoyo técnico para caracterización territorial, comunicación, participación, responsabilidad social y seguimiento de proyectos."
                href="/asistencias"
                cta="Ver asistencias"
                badge="Próximamente"
              />
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg-elevated)]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--moss-ink)]">
                  La plataforma
                </p>
                <p className="mt-4 max-w-3xl text-xl font-semibold leading-snug text-[var(--color-text-primary)] sm:text-2xl">
                  Información, análisis y herramientas aplicadas a la sostenibilidad territorial, con sede en Albacete y proyección nacional.
                </p>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-text-secondary)]">
                  Desarrollada por Ideas Medioambientales para interlocución senior a senior: criterios fundamentales, conclusiones importantes y decisiones clave, sin ruido.
                </p>
                <a
                  href={CORPORATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold text-hueso bg-musgo rounded-[6px] hover:bg-musgo-hover transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
                >
                  Visitar Ideas Medioambientales
                </a>
              </div>
              <div className="border-t-2 border-musgo pt-5 lg:max-w-xs lg:justify-self-end lg:w-full">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--moss-ink)]">Cobertura</p>
                <dl className="tnum mt-4 space-y-0">
                  <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="text-sm text-[var(--color-text-secondary)]">Municipios</dt>
                    <dd className="text-lg font-bold text-[var(--color-text-primary)]">8.130</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-[var(--color-border-subtle)] py-3">
                    <dt className="text-sm text-[var(--color-text-secondary)]">Fuentes</dt>
                    <dd className="text-sm font-semibold text-[var(--color-text-primary)]">INE · AEAT · SEPE · DIRCE</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-[var(--color-border-subtle)] py-3">
                    <dt className="text-sm text-[var(--color-text-secondary)]">Trazabilidad</dt>
                    <dd className="text-sm font-semibold text-[var(--color-text-primary)]">Por indicador y año</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
