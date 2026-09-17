import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import UrbideasHeader from "@/components/platform/UrbideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialBackground from "@/components/ui/TerritorialBackground";

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

export default async function UrbideasHome() {
  const stats = await getStats();

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />

      <main className="flex-1 bg-[var(--color-dark-bg)]">
        <EditorialParallaxHero decor={<TerritorialBackground variant="contours" />} className="hero-musgo bg-[var(--brand-bg)] text-hueso">
        <section className="relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-12 sm:py-16 lg:py-20">
              <div className="max-w-3xl">
                <p className="editorial-eyebrow">
                  <span>URBideas · Módulo de IDEAS Sostenibilidad</span>
                </p>
                <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl" style={{ lineHeight: 1.08 }}>
                  URBideas
                </h1>
                <p className="mt-3 text-xl font-semibold text-hueso sm:text-2xl">
                  Análisis territorial, urbanístico y geoespacial
                </p>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-hueso sm:text-lg">
                  Dictamen territorial de ámbito: dibuja o sube el recinto,
                  cruza el suelo con sus afecciones y recibe un juicio
                  compatible, condicionado o incompatible, listo para descargar.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/urbideas/municipios"
                    className="inline-flex min-h-[48px] items-center px-7 py-3.5 text-sm font-semibold text-white bg-musgo rounded-[6px] hover:bg-musgo-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
                  >
                    Buscar municipio
                  </Link>
                  <Link
                    href="/urbideas/mapa"
                    className="inline-flex min-h-[48px] items-center px-7 py-3.5 text-sm font-semibold text-[var(--color-text-primary)] border-2 border-[var(--color-border)] rounded-[6px] hover:bg-[var(--color-input-bg-hover)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--musgo)]"
                  >
                    Dictaminar un ámbito
                  </Link>
                </div>
                <p className="tnum mt-8 border-t border-white/20 pt-4 text-sm text-hueso">
                  {stats.totalMunicipios.toLocaleString("es-ES")} municipios · {stats.totalLegalSources.toLocaleString("es-ES")} fuentes normativas · {stats.totalCapasWMS.toLocaleString("es-ES")} capas WMS
                </p>
              </div>
            </div>
          </div>
        </section>
        </EditorialParallaxHero>

        <section id="stats-bar" aria-label="Cobertura de URBideas" className="border-b border-[var(--color-border-subtle)] bg-[var(--color-dark-bg-elevated)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                { value: stats.totalMunicipios.toLocaleString("es-ES"), label: "Municipios" },
                { value: stats.totalLegalSources.toLocaleString("es-ES"), label: "Fuentes normativas" },
                { value: stats.totalGeoServices.toLocaleString("es-ES"), label: "Servicios geo" },
                { value: stats.totalCapasWMS.toLocaleString("es-ES"), label: "Capas WMS" },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`py-6 sm:py-8 px-4 sm:px-6 ${
                    i < 3 ? "border-r border-[var(--color-border-subtle)]" : ""
                  }`}
                >
                  <p className="tnum text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="flex items-center gap-3 mb-10">
              <div className="h-px w-12 bg-[var(--color-secondary)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
                Acceso directo
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
              {[
                {
                  title: "Municipios",
                  description: "Consulta el planeamiento urbanístico de cualquier municipio de España.",
                  href: "/urbideas/municipios",
                  number: "01",
                },
                {
                  title: "Mapa",
                  description: "Dibuja un ámbito, cruza sus afecciones, recibe el dictamen y descarga el expediente.",
                  href: "/urbideas/mapa",
                  number: "02",
                },
                {
                  title: "Legislación",
                  description: "Accede a la normativa urbanística por nivel: estatal, autonómico y municipal.",
                  href: "/urbideas/legislacion",
                  number: "03",
                },
                {
                  title: "API",
                  description: "Endpoints REST para consulta programática de datos urbanísticos.",
                  href: "/urbideas/api-docs",
                  number: "04",
                },
              ].map((item) => (
                <Link key={item.title} href={item.href} className="group relative block rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]">
                  <div className="flex items-start gap-5">
                    <span className="tnum text-sm font-bold text-[var(--moss-ink)] mt-0.5">
                      {item.number}
                    </span>
                    <div className="flex-1 border-b-2 border-[var(--color-border-subtle)] pb-6 group-hover:border-conifera transition-colors duration-200">
                      <p className="text-xl font-bold text-[var(--color-text-primary)]">
                        {item.title}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                        {item.description}
                      </p>
                      <span className="mt-3 inline-block text-xs font-semibold text-[var(--moss-ink)]">
                        Explorar
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg-elevated)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  URBideas · Módulo de IDEAS Sostenibilidad
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Información pública de planeamiento urbanístico centralizada y consulta por municipio.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/"
                  className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] border-2 border-[var(--color-border)] rounded-[6px] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                >
                  Volver a la plataforma
                </Link>
                <Link
                  href="/urbideas/api-docs"
                  className="inline-flex min-h-[44px] items-center px-5 py-2.5 text-sm font-semibold text-white bg-musgo rounded-[6px] hover:bg-musgo-hover transition-colors"
                >
                  Documentación API
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
