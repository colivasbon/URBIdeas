import type { Metadata } from "next";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = {
  title: "Fuentes",
  description: "Registro de fuentes y conectores de INCideas.",
};

const FUENTES = [
  {
    organismo: "INE",
    tipo: "Oficial estructurada",
    categorias: ["Territorio", "Población"],
    formato: "API, CSV",
    estabilidad: "Alta",
  },
  {
    organismo: "IGN / PNOA",
    tipo: "Oficial cartográfica",
    categorias: ["Territorio", "Riesgos"],
    formato: "WMS, WMTS, descargas",
    estabilidad: "Alta",
  },
  {
    organismo: "OpenStreetMap",
    tipo: "Colaborativa",
    categorias: ["Infraestructuras", "Equipamientos"],
    formato: "API, GeoJSON, OSM XML",
    estabilidad: "Media",
  },
  {
    organismo: "Catálogo de Protección Civil",
    tipo: "Oficial documental",
    categorias: ["Riesgos", "Medios y recursos"],
    formato: "PDF, web",
    estabilidad: "Media",
  },
  {
    organismo: "Ayuntamientos",
    tipo: "Municipal",
    categorias: ["Servicios básicos", "Equipamientos", "Medios y recursos"],
    formato: "Web, correo, teléfono",
    estabilidad: "Variable",
  },
  {
    organismo: "Operadores",
    tipo: "Operador o concesionaria",
    categorias: ["Servicios básicos", "Infraestructuras"],
    formato: "Web, API, correo",
    estabilidad: "Variable",
  },
];

export default function IncideasFuentesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Fuentes" },
            ]}
            className="mb-6"
          />
          <div className="max-w-4xl">
            <h1 className="type-h1 text-[var(--text-primary)]">Registro de fuentes</h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              Cada fuente registra su organismo, cobertura, formato, licencia, frecuencia y nivel de
              confianza. No se programan conectores sin comprobar el esquema real.
            </p>

            <div className="mt-10 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Organismo</th>
                    <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Tipo</th>
                    <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Categorías</th>
                    <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Formato</th>
                    <th className="pb-3 font-semibold text-[var(--text-primary)]">Estabilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {FUENTES.map((f) => (
                    <tr key={f.organismo}>
                      <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">{f.organismo}</td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)]">{f.tipo}</td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)]">{f.categorias.join(", ")}</td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)]">{f.formato}</td>
                      <td className="py-3 text-[var(--text-secondary)]">{f.estabilidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-10 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <h2 className="type-h4 text-[var(--text-primary)]">Prioridad de fuentes</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-[var(--text-secondary)]">
                <li>Fuentes estatales.</li>
                <li>Fuentes autonómicas.</li>
                <li>Fuentes provinciales.</li>
                <li>Fuentes municipales.</li>
                <li>Operadores.</li>
                <li>OpenStreetMap.</li>
                <li>Otras fuentes abiertas.</li>
                <li>Fuentes comerciales autorizadas.</li>
                <li>Plantillas y encuestas municipales.</li>
              </ol>
            </div>

            <p className="mt-8">
              <Link href="/incideas/metodologia" className="link text-sm">
                Ver metodología
              </Link>
            </p>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
