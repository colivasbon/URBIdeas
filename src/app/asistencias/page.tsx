import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialGrid from "@/components/ui/TerritorialGrid";
import PageShell from "@/components/ui/PageShell";

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
      <PlatformHeader />

      <main className="flex-1">
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
        >
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
            <PageShell
              eyebrow="Área de Sostenibilidad · Ideas Medioambientales"
              title="Asistencias de sostenibilidad"
              lede="Espacio destinado a herramientas y procesos de apoyo técnico del Área de Sostenibilidad de Ideas Medioambientales."
            />
          </div>
        </EditorialParallaxHero>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">

          <section aria-label="Líneas de trabajo previstas" className="mb-8">
            <div className="divide-y divide-[var(--color-border-subtle)] border-y border-[var(--color-border-subtle)]">
              {lineas.map((linea, i) => (
                <div key={linea} className="flex items-baseline gap-5 px-1 py-4 sm:px-2">
                  <span aria-hidden="true" className="text-sm font-bold tabular-nums text-[var(--color-secondary)]/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="flex-1 text-base font-semibold text-[var(--color-text-primary)]">{linea}</p>
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

          <section aria-label="Enlaces relacionados" className="flex flex-wrap gap-4">
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
            <Link
              href="/socideas"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
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
