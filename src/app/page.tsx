import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase-server"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import HeroParallax from "@/components/ui/HeroParallax"

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
        {/* Hero with JS parallax */}
        <HeroParallax>
          <section className="relative border-b border-[var(--color-border-subtle)]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="py-20 sm:py-28 lg:py-36 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-12">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-px w-12 bg-[var(--color-secondary)]" />
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-secondary)]">
                      Ideas Medioambientales
                    </p>
                  </div>
                  <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter text-[var(--color-text-primary)] leading-[0.95]">
                    Registro
                    <br />
                    Urbanístico
                    <br />
                    <span className="text-[var(--color-secondary)]">de España</span>
                  </h1>
                  <p className="mt-8 max-w-lg text-lg text-[var(--color-text-secondary)] leading-relaxed">
                    Centralización y consulta de información pública de planeamiento
                    urbanístico: legislación, PGOU, instrumentos y capas WMS/WFS de
                    todo el territorio nacional.
                  </p>
                  <div className="mt-10 flex flex-wrap gap-4">
                    <Link
                      href="/municipios"
                      className="inline-flex items-center gap-3 px-7 py-3.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] hover:shadow-lg hover:shadow-[var(--color-primary)]/20 transition-all duration-300 active:scale-[0.97]"
                    >
                      Buscar municipio
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                    <Link
                      href="/mapa"
                      className="inline-flex items-center gap-3 px-7 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] hover:bg-[var(--color-input-bg-hover)] transition-all duration-300 active:scale-[0.97]"
                    >
                      Explorar mapa
                    </Link>
                  </div>
                </div>

                {/* Floating coordinates display */}
                <div className="hidden lg:block">
                  <div className="bg-[var(--color-card-bg)]/80 backdrop-blur-sm border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-lg">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-3">
                      Cobertura territorial
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline gap-8">
                        <span className="text-xs text-[var(--color-text-muted)]">Municipios</span>
                        <span className="text-lg font-bold text-[var(--color-text-primary)] tabular-nums">{stats.totalMunicipios.toLocaleString("es-ES")}</span>
                      </div>
                      <div className="h-px bg-[var(--color-border-subtle)]" />
                      <div className="flex justify-between items-baseline gap-8">
                        <span className="text-xs text-[var(--color-text-muted)]">Fuentes normativas</span>
                        <span className="text-lg font-bold text-[var(--color-text-primary)] tabular-nums">{stats.totalLegalSources.toLocaleString("es-ES")}</span>
                      </div>
                      <div className="h-px bg-[var(--color-border-subtle)]" />
                      <div className="flex justify-between items-baseline gap-8">
                        <span className="text-xs text-[var(--color-text-muted)]">Capas WMS</span>
                        <span className="text-lg font-bold text-[var(--color-text-primary)] tabular-nums">{stats.totalCapasWMS.toLocaleString("es-ES")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </HeroParallax>

        {/* Stats bar */}
        <section className="border-b border-[var(--color-border-subtle)] bg-[var(--color-dark-bg-elevated)]">
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
                    i < 3 ? 'border-r border-[var(--color-border-subtle)]' : ''
                  }`}
                >
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)] tabular-nums">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quick access */}
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
                  className="group relative block"
                >
                  <div className="flex items-start gap-5">
                    <span className="text-sm font-bold text-[var(--color-secondary)]/60 mt-0.5 tabular-nums">
                      {item.number}
                    </span>
                    <div className="flex-1 border-b border-[var(--color-border-subtle)] pb-6 group-hover:border-[var(--color-secondary)]/40 transition-colors duration-300">
                      <p className="text-xl font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-secondary)] transition-colors duration-300">
                        {item.title}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
                        {item.description}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--color-secondary)] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-0 group-hover:translate-x-1">
                        Explorar
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom section */}
        <section className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg-elevated)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Registro Urbanístico de España
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Información pública de planeamiento urbanístico centralizada y consulta por municipio.
                </p>
              </div>
              <Link
                href="/api-docs"
                className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
              >
                Documentación API
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
