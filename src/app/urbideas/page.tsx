import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import UrbideasHeader from "@/components/platform/UrbideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import MapSheet, { type SheetLegendItem } from "@/components/platform/MapSheet";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = {
  title: "URBideas",
  description:
    "Herramienta de IDEAS Sostenibilidad para el análisis territorial, urbanístico y geoespacial.",
};

async function getStats() {
  const supabase = createSupabaseServerSafe();
  if (!supabase) {
    return {
      totalMunicipios: 0,
      totalInstrumentos: 0,
      totalCapasWMS: 0,
      totalLegalSources: 0,
      totalGeoServices: 0,
    };
  }

  const [municipiosRes, instrumentosRes, capasRes, legalRes, geoServicesRes] = await Promise.all([
    supabase.from("municipios").select("id", { count: "exact", head: true }),
    supabase.from("instrumentos_planeamiento").select("id", { count: "exact", head: true }),
    supabase.from("capas_wms").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }),
    supabase.from("geo_services").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalMunicipios: municipiosRes.count ?? 0,
    totalInstrumentos: instrumentosRes.count ?? 0,
    totalCapasWMS: capasRes.count ?? 0,
    totalLegalSources: legalRes.count ?? 0,
    totalGeoServices: geoServicesRes.count ?? 0,
  };
}

const HERRAMIENTAS = [
  {
    nombre: "Mapa y dictamen",
    href: "/urbideas/mapa",
    descripcion: "Dibuje o suba un recinto, cruce el suelo con sus afecciones y descargue el expediente.",
  },
  {
    nombre: "Municipios",
    href: "/urbideas/municipios",
    descripcion: "Planeamiento urbanístico vigente de cualquier municipio de España.",
  },
  {
    nombre: "Legislación",
    href: "/urbideas/legislacion",
    descripcion: "Normativa urbanística por nivel: estatal, autonómica y municipal.",
  },
  {
    nombre: "API",
    href: "/urbideas/api-docs",
    descripcion: "Endpoints REST para consultar los mismos datos desde sus herramientas.",
  },
];

// El dictamen sí es una secuencia: se numera.
const PASOS = [
  { titulo: "Delimitar el ámbito", texto: "Dibújelo sobre el mapa o suba un KML, GeoJSON o shapefile." },
  { titulo: "Cruzar afecciones", texto: "El recinto se superpone con las capas oficiales de suelo y protección." },
  { titulo: "Leer el dictamen", texto: "Compatible, condicionado o incompatible, con la afección que lo motiva." },
  { titulo: "Descargar el expediente", texto: "PDF del dictamen o paquete completo con las capas del cruce." },
];

const fmt = (n: number) => n.toLocaleString("es-ES");

export default async function UrbideasHome() {
  const stats = await getStats();

  const legend: SheetLegendItem[] = [
    { label: "Municipios", value: stats.totalMunicipios },
    { label: "Instrumentos de planeamiento", value: stats.totalInstrumentos },
    { label: "Fuentes normativas", value: stats.totalLegalSources },
    { label: "Capas WMS activas", value: stats.totalCapasWMS },
  ]
    .filter((i) => i.value > 0)
    .map((i) => ({ label: i.label, value: fmt(i.value) }));

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />

      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[{ label: "SOCideas", href: "/" }, { label: "URBideas" }]}
            className="mb-6"
          />
          <MapSheet legend={legend}>
            <div className="max-w-[42rem]">
              <p className="type-label text-[var(--moss-ink)]">URBideas</p>
              <h1 className="type-display mt-4 max-w-[17ch] text-[var(--text-primary)]">
                Qué se puede hacer en un suelo, antes de proyectar
              </h1>
              <p className="mt-6 max-w-[36rem] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
                Delimite un ámbito y URBideas lo cruza con planeamiento y afecciones para emitir un
                dictamen compatible, condicionado o incompatible, listo para descargar.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/urbideas/mapa" className="btn btn-primary btn-lg">
                  Dictaminar un ámbito
                </Link>
                <Link href="/urbideas/municipios" className="btn btn-secondary btn-lg">
                  Consultar un municipio
                </Link>
              </div>
            </div>
          </MapSheet>
        </section>

        <section aria-labelledby="dictamen" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <h2 id="dictamen" className="type-h2 text-[var(--text-primary)]">
              Cómo se obtiene un dictamen
            </h2>
            <ol className="step-list mt-10">
              {PASOS.map((p, i) => (
                <li key={p.titulo} className="step-list__item">
                  <span className="step-list__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="type-h4 text-[var(--text-primary)]">{p.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="herramientas" className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)]">
          <div className="container-ima section-ima">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
              <h2 id="herramientas" className="type-h2 text-[var(--text-primary)]">
                Herramientas del módulo
              </h2>
              <dl className="module-index">
                {HERRAMIENTAS.map((h) => (
                  <div key={h.nombre} className="module-index__row">
                    <dt>
                      <Link href={h.href} className="module-index__name">
                        {h.nombre}
                      </Link>
                    </dt>
                    <dd className="module-index__desc">{h.descripcion}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
