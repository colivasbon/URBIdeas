import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader, { CORPORATE_URL } from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import ModuleCard from "@/components/platform/ModuleCard";
import SectionEyebrow from "@/components/ui/SectionEyebrow";
import SectionReveal from "@/components/ui/SectionReveal";
import KpiNumber from "@/components/ui/KpiNumber";
import TopographicContours from "@/components/ui/TopographicContours";

export const metadata: Metadata = {
  title: "IDEAS Sostenibilidad | Ideas Medioambientales",
  description:
    "Plataforma del Área de Sostenibilidad de Ideas Medioambientales para el análisis territorial, la consulta municipal y el apoyo técnico a proyectos.",
};

const KPIS = [
  { value: "8.130", label: "Municipios con ficha territorial" },
  { value: "INE · AEAT · SEPE", label: "Fuentes oficiales trazables" },
  { value: "2 + 1", label: "Módulos activos y área en preparación" },
];

const COBERTURA = [
  { label: "Municipios", value: "8.130" },
  { label: "Fuentes", value: "INE · AEAT · SEPE · DIRCE" },
  { label: "Trazabilidad", value: "Por indicador y año" },
];

export default function PlatformHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />

      <main id="contenido" className="flex-1">
        {/* Hero — sin animación de entrada (no penalizar LCP) */}
        <section className="relative overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <div
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[54%] lg:block"
            aria-hidden="true"
          >
            <TopographicContours className="text-[var(--musgo)] opacity-[0.28]" />
          </div>
          <div className="container-ima relative">
            <div className="py-16 sm:py-20 lg:py-28">
              <div className="max-w-3xl">
                <p className="editorial-eyebrow">
                  <span>IDEAS Sostenibilidad · Ideas Medioambientales</span>
                </p>
                <h1 className="type-display mt-5 max-w-[16ch] text-[var(--text-primary)]">
                  Conocimiento territorial para decisiones sostenibles
                </h1>
                <p className="measure mt-6 text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
                  Análisis territorial, diagnóstico municipal con fuentes oficiales y apoyo técnico
                  a proyectos, en una sola plataforma.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/urbideas" className="btn btn-primary btn-lg">
                    Acceder a URBideas
                    <svg
                      className="btn-arrow h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                  <Link href="/socideas" className="btn btn-secondary btn-lg">
                    Buscar un municipio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Franja de KPIs */}
        <section aria-label="Cobertura de la plataforma" className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="container-ima">
            <div className="grid grid-cols-1 gap-8 py-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--border-subtle)]">
              {KPIS.map((kpi, i) => (
                <div key={kpi.label} className={i === 0 ? "sm:pr-8" : "sm:px-8"}>
                  <KpiNumber value={kpi.value} label={kpi.label} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Módulos */}
        <SectionReveal className="border-b border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <div className="mb-10 max-w-3xl">
              <SectionEyebrow>Módulos</SectionEyebrow>
              <h2 className="type-h2 mt-3 text-[var(--text-primary)]">
                Dos módulos de consulta, un área en preparación
              </h2>
              <p className="measure mt-3 text-[var(--text-secondary)]">
                URBideas para el análisis territorial y SOCideas para el diagnóstico municipal.
                Mismo lenguaje de datos, misma trazabilidad.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
                kicker="Área en preparación"
                title="Asistencias de sostenibilidad"
                description="Apoyo técnico para caracterización territorial, comunicación, participación, responsabilidad social y seguimiento de proyectos."
                href="/asistencias"
                cta="En preparación"
                badge="En preparación"
                pending
              />
            </div>
          </div>
        </SectionReveal>

        {/* La plataforma + Cobertura — bloque invertido */}
        <SectionReveal>
          <div className="bg-[var(--bg-inverse)] text-[var(--text-inverse)]">
            <div className="container-ima section-ima">
              <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
                <div>
                  <p className="type-overline text-[var(--retama)]">La plataforma</p>
                  <p className="measure mt-5 text-[1.375rem] font-semibold leading-snug text-[var(--text-inverse)] sm:text-2xl">
                    Información, análisis y herramientas aplicadas a la sostenibilidad territorial,
                    con sede en Albacete y proyección nacional.
                  </p>
                  <p className="measure mt-4 text-[var(--text-inverse-secondary)]">
                    Desarrollada por Ideas Medioambientales para interlocución senior a senior:
                    criterios fundamentales, conclusiones importantes y decisiones clave, sin ruido.
                  </p>
                  <a
                    href={CORPORATE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-inverse mt-6 link-external"
                  >
                    Visitar Ideas Medioambientales
                  </a>
                </div>
                <div className="rounded-[6px] border border-white/15 p-6">
                  <p className="type-overline text-[var(--retama)]">Cobertura</p>
                  <dl className="mt-4">
                    {COBERTURA.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-4 border-t border-white/15 py-3 first:border-t-0 first:pt-0"
                      >
                        <dt className="text-sm text-[var(--text-inverse-secondary)]">{row.label}</dt>
                        <dd className="tnum text-right text-sm font-semibold text-[var(--retama)]">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </SectionReveal>
      </main>

      <PlatformFooter />
    </div>
  );
}
