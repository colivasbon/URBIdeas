import type { Metadata } from "next";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import IncideasSearch from "@/components/incideas/IncideasSearch";

export const metadata: Metadata = {
  title: "Municipios",
  description: "Buscar municipios para consultar su información de emergencias.",
};

export default function IncideasMunicipiosPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Municipios" },
            ]}
            className="mb-6"
          />
          <div className="max-w-2xl">
            <h1 className="type-h1 text-[var(--text-primary)]">Buscar municipio</h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              Seleccione un municipio para consultar su información territorial, de población,
              riesgos, recursos y equipamientos para emergencias.
            </p>
            <div className="mt-8">
              <IncideasSearch />
            </div>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
