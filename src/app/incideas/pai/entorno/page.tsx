"use client";

import dynamic from "next/dynamic";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

const AnalisisEntornoPAI = dynamic(() => import("@/components/incideas/pai/AnalisisEntornoPAI"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] items-center justify-center rounded-[6px] border border-[var(--border-subtle)]">
      <span className="text-sm text-[var(--text-muted)]">Cargando mapa…</span>
    </div>
  ),
});

export default function PaiEntornoPage() {
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
              { label: "Análisis de entorno" },
            ]}
            className="mb-6"
          />
          <p className="type-label text-[var(--moss-ink)]">Planes de Autoprotección</p>
          <h1 className="type-h1 mt-2 text-[var(--text-primary)]">Análisis de entorno</h1>
          <p className="mt-3 mb-8 max-w-[68ch] text-[var(--text-secondary)]">
            Distancias y rumbos desde el ámbito de la instalación a núcleos, infraestructuras, instalaciones de generación,
            espacios protegidos, masa forestal, montes de utilidad pública, cauces y zonas inundables, con la misma redacción
            que la tabla de entorno de los PAI.
          </p>
          <AnalisisEntornoPAI />
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
