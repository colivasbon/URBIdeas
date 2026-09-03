import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";

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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <section className="mb-8 border-b border-[var(--color-border-subtle)] pb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-[var(--color-secondary)]" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)]">
                Área de Sostenibilidad
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              Asistencias de sostenibilidad
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--color-text-secondary)]">
              Espacio destinado a herramientas y procesos de apoyo técnico del Área de
              Sostenibilidad de Ideas Medioambientales.
            </p>
          </section>

          <section aria-label="Líneas de trabajo previstas" className="mb-8">
            <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] divide-y divide-[var(--color-border-subtle)]">
              {lineas.map((linea) => (
                <div key={linea} className="px-5 py-4">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{linea}</p>
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
