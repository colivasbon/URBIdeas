import type { Metadata } from "next";
import Link from "next/link";
import AsistenciasHeader from "@/components/platform/AsistenciasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialGrid from "@/components/ui/TerritorialGrid";

export const metadata: Metadata = {
  title: "Asistencias de sostenibilidad",
  description:
    "Próximas herramientas y procesos de apoyo técnico del Área de Sostenibilidad de Ideas Medioambientales.",
};

const lineas = [
  "Caracterización territorial",
  "Diagnóstico socioeconómico",
  "Comunicación y participación",
  "Responsabilidad social",
  "Seguimiento de medidas e indicadores",
];

export default function AsistenciasPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AsistenciasHeader />

      <main className="flex-1 bg-[var(--color-dark-bg)]">
        <EditorialParallaxHero
          decor={
            <div
              className="territorial-background territorial-background--index"
              data-parallax="off"
              aria-hidden="true"
              role="presentation"
            >
              <TerritorialGrid depth={0} className="territorial-grid--index" />
            </div>
          }
          className="hero-musgo bg-[var(--brand-bg)] text-hueso"
        >
        <section className="relative">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <p className="editorial-eyebrow">
              <span>Área de Sostenibilidad · Ideas Medioambientales</span>
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl" style={{ lineHeight: 1.12 }}>
              Asistencias de sostenibilidad
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-hueso sm:text-lg">
              Herramientas y procesos de apoyo técnico del Área de Sostenibilidad.
            </p>
          </div>
        </section>
        </EditorialParallaxHero>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">

          <section aria-label="Líneas de trabajo previstas" className="mb-8 max-w-3xl">
            <div className="border-t-2 border-musgo">
              {lineas.map((linea, i) => (
                <div key={linea} className="flex items-baseline gap-5 border-b border-[var(--color-border-subtle)] py-5">
                  <span aria-hidden="true" className="tnum text-sm font-bold text-[var(--moss-ink)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="flex-1 text-base font-semibold text-[var(--color-text-primary)] sm:text-lg">{linea}</p>
                  <span className="shrink-0 text-xs font-medium text-[var(--color-text-muted)]">
                    Próximamente
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              Próximamente se incorporarán nuevas herramientas y recursos.
            </p>
          </section>

          <section aria-label="Enlaces relacionados" className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] border-2 border-[var(--color-border)] rounded-[6px] hover:bg-[var(--color-input-bg-hover)] transition-colors"
            >
              Volver a la plataforma
            </Link>
            <Link
              href="/urbideas"
              className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold text-white bg-musgo rounded-[6px] hover:bg-musgo-hover transition-colors"
            >
              Acceder a URBideas
            </Link>
            <Link
              href="/socideas"
              className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold text-[var(--moss-ink)] hover:underline hover:underline-offset-4"
            >
              Conocer SOCideas
            </Link>
          </section>
        </div>
      </main>

      <PlatformFooter />
    </div>
  );
}
