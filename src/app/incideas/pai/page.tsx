import type { Metadata } from "next";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Badge from "@/components/ui/Badge";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = {
  title: "PAI · INCideas",
  description:
    "Herramientas para Planes de Autoprotección frente a incendios forestales: análisis de entorno y riesgo intrínseco según el R.D. 164/2025.",
};

const HERRAMIENTAS = [
  {
    href: "/incideas/pai/entorno",
    titulo: "Análisis de entorno",
    descripcion:
      "Dibuja el ámbito o carga el KMZ de la instalación y ve cómo se trazan las distancias sobre el mapa, con filtros por tipo, capas oficiales y exportación. Genera la tabla de descripción del entorno (núcleos, infraestructuras, generación, ENP y Red Natura 2000, masa forestal y MUP, cauces y ARPSI), ubicación catastral, accesos y medios externos.",
    fuentes: "OSM · IEPNB · SNCZI · Catastro · IGN",
  },
  {
    href: "/incideas/pai/riesgo-intrinseco",
    titulo: "Riesgo intrínseco",
    descripcion:
      "Con el nombre del proyecto, la potencia y la superficie de cada sector calcula la densidad de carga de fuego y el nivel de riesgo por sector y global. Exporta las tablas para Word y el XLSX con fórmulas.",
    fuentes: "R.D. 164/2025",
  },
];

export default function PaiHub() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "PAI" },
            ]}
            className="mb-6"
          />
          <div className="flex flex-wrap items-center gap-3">
            <p className="type-label text-[var(--moss-ink)]">Planes de Autoprotección</p>
            <Badge variant="muted">Beta interna</Badge>
          </div>
          <h1 className="type-h1 mt-4 max-w-[22ch] text-[var(--text-primary)]">
            Datos de entorno y riesgo intrínseco para PAI de instalaciones
          </h1>
          <p className="mt-5 max-w-[62ch] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
            Automatiza los apartados de los Planes de Autoprotección frente a incendios forestales que dependen de fuentes
            públicas, con cobertura para toda España. El técnico revisa y ajusta el resultado antes de trasladarlo al documento.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {HERRAMIENTAS.map((h) => (
              <Link key={h.href} href={h.href} className="card card-interactive flex flex-col p-6">
                <h2 className="type-h3 text-[var(--text-primary)]">{h.titulo}</h2>
                <p className="mt-3 flex-1 text-[var(--text-secondary)]">{h.descripcion}</p>
                <p className="mt-5 text-sm text-[var(--text-muted)]">{h.fuentes}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
