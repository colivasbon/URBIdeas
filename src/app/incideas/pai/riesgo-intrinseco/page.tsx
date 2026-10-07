import type { Metadata } from "next";
import { Suspense } from "react";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import CalculadoraRiesgoIntrinseco from "@/components/incideas/pai/CalculadoraRiesgoIntrinseco";

export const metadata: Metadata = {
  title: "Riesgo intrínseco · PAI · INCideas",
  description: "Densidad de carga de fuego y nivel de riesgo intrínseco de plantas fotovoltaicas según el R.D. 164/2025.",
};

export default function PaiRiesgoIntrinsecoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "PAI", href: "/incideas/pai" },
              { label: "Riesgo intrínseco" },
            ]}
            className="mb-6"
          />
          <p className="type-label text-[var(--moss-ink)]">Planes de Autoprotección</p>
          <h1 className="type-h1 mt-2 text-[var(--text-primary)]">Riesgo intrínseco</h1>
          <p className="mt-3 mb-8 max-w-[68ch] text-[var(--text-secondary)]">
            Qs = Σ (qi · Ci · Gi) · R / A por sector de incendio, con las cantidades tipo de materiales de una planta
            fotovoltaica y los umbrales del Reglamento de seguridad contra incendios en establecimientos industriales
            (R.D. 164/2025).
          </p>
          <Suspense fallback={null}>
            <CalculadoraRiesgoIntrinseco />
          </Suspense>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
