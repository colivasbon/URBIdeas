import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase-server"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"

async function getStats() {
  const supabase = createSupabaseServer()

  const [municipiosRes, instrumentosRes, capasRes, legalRes, geoServicesRes] = await Promise.all([
    supabase.from("municipios").select("id", { count: "exact", head: true }),
    supabase.from("instrumentos_planeamiento").select("id", { count: "exact", head: true }),
    supabase.from("capas_wms").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }),
    supabase.from("geo_services").select("id", { count: "exact", head: true }),
  ])

  return {
    totalMunicipios: municipiosRes.count ?? 0,
    totalInstrumentos: instrumentosRes.count ?? 0,
    totalCapasWMS: capasRes.count ?? 0,
    totalLegalSources: legalRes.count ?? 0,
    totalGeoServices: geoServicesRes.count ?? 0,
  }
}

export default async function Home() {
  const stats = await getStats()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero — full width, editorial */}
        <section className="border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="py-16 sm:py-20 lg:py-28 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)] mb-4">
                  Ideas Medioambientales
                </p>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[var(--color-text-primary)] leading-[1.1]">
                  Registro<br />
                  Urbanístico<br />
                  <span className="text-[var(--color-secondary)]">de España</span>
                </h1>
                <p className="mt-6 max-w-lg text-base text-[var(--color-text-secondary)] leading-relaxed">
                  Centralización y consulta de información pública de planeamiento
                  urbanístico: legislación, PGOU, instrumentos de planeamiento y capas WMS/WFS de
                  todo el territorio nacional.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                <Link
                  href="/municipios"
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-light)] transition-all duration-200 active:scale-[0.98]"
                >
                  Buscar municipio
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  href="/mapa"
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-lg hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)] transition-all duration-200 active:scale-[0.98]"
                >
                  Explorar mapa
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats — inline row */}
        <section className="border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--color-border-subtle)]">
              {[
                { value: stats.totalMunicipios.toLocaleString("es-ES"), label: "Municipios" },
                { value: stats.totalLegalSources.toLocaleString("es-ES"), label: "Fuentes normativas" },
                { value: stats.totalGeoServices.toLocaleString("es-ES"), label: "Servicios geo" },
                { value: stats.totalCapasWMS.toLocaleString("es-ES"), label: "Capas WMS" },
              ].map((stat) => (
                <div key={stat.label} className="py-6 sm:py-8 px-4 sm:px-6 first:pl-0 last:pr-0">
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quick access — editorial grid */}
        <section>
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12">
              {[
                {
                  title: "Municipios",
                  description: "Consulta el planeamiento urbanístico de cualquier municipio de España.",
                  href: "/municipios",
                  number: "01",
                },
                {
                  title: "Mapa",
                  description: "Explora las capas WMS y visualiza el planeamiento sobre el mapa.",
                  href: "/mapa",
                  number: "02",
                },
                {
                  title: "Legislación",
                  description: "Accede a la normativa urbanística por nivel: estatal, autonómico y municipal.",
                  href: "/legislacion",
                  number: "03",
                },
                {
                  title: "API",
                  description: "Endpoints REST para consulta programática de datos urbanísticos.",
                  href: "/api-docs",
                  number: "04",
                },
              ].map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group block border-b border-[var(--color-border-subtle)] pb-8 last:border-b-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-xs font-bold text-[var(--color-text-muted)] mt-1 tabular-nums">
                      {item.number}
                    </span>
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-secondary)] transition-colors duration-200">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                    <svg className="h-5 w-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-secondary)] transition-all duration-200 group-hover:translate-x-1 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
