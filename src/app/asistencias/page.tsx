import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
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
        <EditorialParallaxHero>
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <PageShell
              eyebrow="Área de Sostenibilidad · Ideas Medioambientales"
              title="Asistencias de sostenibilidad"
              lede="Espacio destinado a herramientas y procesos de apoyo técnico del Área de Sostenibilidad de Ideas Medioambientales."
            />
          </div>
        </EditorialParallaxHero>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">

          <section aria-label="Líneas de trabajo previstas" className="mb-8">
            <div className="premium-card divide-y divide-[var(--color-border-subtle)] overflow-hidden p-0">
              {lineas.map((linea) => (
                <div key={linea} className="flex items-center justify-between gap-3 px-5 py-4">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{linea}</p>
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
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
