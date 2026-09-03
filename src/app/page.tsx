import type { Metadata } from "next";
import PlatformHeader, { CORPORATE_URL } from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import ModuleCard from "@/components/platform/ModuleCard";

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
        <section className="relative border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-10 sm:py-14 lg:py-20 flex flex-col items-center text-center gap-6">
              <div className="max-w-3xl w-full">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-secondary)] mb-3">
                  IDEAS Sostenibilidad · Área de Sostenibilidad de Ideas Medioambientales
                </p>
                <h1 className="font-bold tracking-tight leading-[1.05] text-3xl sm:text-4xl lg:text-5xl text-[var(--color-text-primary)] text-balance">
                  Conocimiento territorial para decisiones sostenibles
                </h1>
                <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
                  IDEAS Sostenibilidad reúne herramientas del Área de Sostenibilidad de Ideas
                  Medioambientales para el análisis territorial, la consulta municipal y el apoyo
                  técnico a proyectos.
                </p>
                <p className="mt-4 max-w-2xl mx-auto text-sm text-[var(--color-text-muted)] leading-relaxed">
                  Herramientas para el análisis territorial, la caracterización socioeconómica,
                  la sostenibilidad municipal y el acompañamiento técnico de proyectos.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Módulos de la plataforma">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px w-12 bg-[var(--color-secondary)]" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
                Módulos
              </p>
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
                kicker="Próximo módulo"
                title="SOCideas"
                description="Diagnóstico social, sociodemográfico y socioeconómico del territorio."
                href="/socideas"
                cta="Conocer SOCideas"
                badge="Módulo en desarrollo"
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
