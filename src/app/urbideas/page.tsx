import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import UrbideasHeader from "@/components/platform/UrbideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SectionReveal from "@/components/ui/SectionReveal";
import KpiNumber from "@/components/ui/KpiNumber";
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

const ACCESOS = [
  {
    title: "Municipios",
    description: "Consulta el planeamiento urbanístico de cualquier municipio de España.",
    href: "/urbideas/municipios",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 21h18M5 21V7l6-4 6 4v14M9 21v-6h4v6M9 9h.01M13 9h.01M9 12h.01M13 12h.01"
      />
    ),
  },
  {
    title: "Mapa y dictamen",
    description: "Dibuja un ámbito, cruza sus afecciones, recibe el dictamen y descarga el expediente.",
    href: "/urbideas/mapa",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6.75V15m6-6v8.25m.5-12.75 4.5 2.25v13.5l-4.5-2.25-6 3-4.5-2.25V5.25l4.5 2.25 6-3Z"
      />
    ),
  },
  {
    title: "Legislación",
    description: "Accede a la normativa urbanística por nivel: estatal, autonómica y municipal.",
    href: "/urbideas/legislacion",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.04 9.75 4.5A4.5 4.5 0 0 0 3 8.25c0 .41.33.75.75.75h16.5c.41 0 .75-.34.75-.75a4.5 4.5 0 0 0-6.75-3.75L12 6.04Zm0 0v13.5m-6.75 0h13.5"
      />
    ),
  },
  {
    title: "API",
    description: "Endpoints REST para consulta programática de datos urbanísticos.",
    href: "/urbideas/api-docs",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m6.75 7.5-4.5 4.5 4.5 4.5m10.5-9 4.5 4.5-4.5 4.5M14.25 4.5l-4.5 15"
      />
    ),
  },
];

export default async function UrbideasHome() {
  const stats = await getStats();

  const kpis = [
    { value: stats.totalMunicipios.toLocaleString("es-ES"), label: "Municipios" },
    { value: stats.totalLegalSources.toLocaleString("es-ES"), label: "Fuentes normativas" },
    { value: stats.totalGeoServices.toLocaleString("es-ES"), label: "Servicios geo" },
    { value: stats.totalCapasWMS.toLocaleString("es-ES"), label: "Capas WMS" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />

      <main id="contenido" className="flex-1">
        {/* Cabecera de módulo */}
        <section className="relative overflow-hidden bg-[var(--bg-inverse)] text-[var(--text-inverse)]">
          <div className="container-ima relative py-12 sm:py-16 lg:py-20">
            <Breadcrumbs
              items={[
                { label: "IDEAS Sostenibilidad", href: "/" },
                { label: "URBideas" },
              ]}
              tone="inverse"
            />
            <p className="type-overline mt-5 text-[var(--retama)]">URBideas · Módulo</p>
            <h1 className="type-h1 mt-3 text-[var(--text-inverse)]">Análisis territorial, urbanístico y geoespacial</h1>
            <p className="measure mt-5 text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-inverse-secondary)]">
              Dictamen territorial de ámbito: dibuja o sube el recinto, cruza el suelo con sus
              afecciones y recibe un juicio compatible, condicionado o incompatible, listo para
              descargar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/urbideas/municipios" className="btn btn-primary btn-lg">
                Buscar municipio
                <svg className="btn-arrow h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link href="/urbideas/mapa" className="btn btn-inverse btn-lg">
                Dictaminar un ámbito
              </Link>
            </div>
          </div>
        </section>

        {/* Cifras de cobertura */}
        <section aria-label="Cobertura de URBideas" className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="container-ima">
            <div className="grid grid-cols-2 gap-y-8 py-8 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[var(--border-subtle)]">
              {kpis.map((stat, i) => (
                <div key={stat.label} className={i === 0 ? "sm:pr-6" : "sm:px-6"}>
                  <KpiNumber value={stat.value} label={stat.label} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Accesos directos */}
        <SectionReveal>
          <div className="container-ima section-ima">
            <p className="type-overline text-[var(--moss-ink)]">Acceso directo</p>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {ACCESOS.map((item) => (
                <Link key={item.title} href={item.href} className="card card-interactive p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      {item.icon}
                    </svg>
                  </span>
                  <h2 className="type-h3 mt-4 text-[var(--text-primary)]">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                  <span className="btn btn-link mt-4 px-0" aria-hidden="true">
                    Explorar
                    <svg className="btn-arrow h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </SectionReveal>
      </main>

      <PlatformFooter />
    </div>
  );
}
