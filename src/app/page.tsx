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
        {/* Hero editorial */}
        <section className="border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)] mb-4">
                Ideas Medioambientales
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl" style={{ fontFamily: "var(--font-serif)" }}>
                Registro Urbanístico
                <span className="block text-[var(--color-text-secondary)] mt-1">de España</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                Plataforma de centralización y consulta de información pública de planeamiento
                urbanístico: legislación, PGOU, instrumentos de planeamiento y capas WMS/WFS de
                todo el territorio nacional.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/municipios"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--border-radius)] hover:bg-[var(--color-primary-light)] transition-colors duration-200"
                >
                  Buscar municipio
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  href="/mapa"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-[var(--border-radius)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors duration-200"
                >
                  Ver mapa
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Datos del registro */}
        <section className="border-b border-[var(--color-border-subtle)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-6">
              Datos del registro
            </p>
            <div className="grid grid-cols-2 gap-8 sm:gap-12 lg:grid-cols-4">
              <div>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>
                  {stats.totalMunicipios.toLocaleString("es-ES")}
                </p>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Municipios</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>
                  {stats.totalLegalSources.toLocaleString("es-ES")}
                </p>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Fuentes normativas</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>
                  {stats.totalGeoServices.toLocaleString("es-ES")}
                </p>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Servicios geo</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: "var(--font-serif)" }}>
                  {stats.totalCapasWMS.toLocaleString("es-ES")}
                </p>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Capas WMS</p>
              </div>
            </div>
          </div>
        </section>

        {/* Acceso directo */}
        <section>
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-6">
              Acceso directo
            </p>
            <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--color-border-subtle)] sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-[var(--color-border-subtle)] sm:border sm:border-[var(--color-border-subtle)] sm:rounded-[var(--border-radius-lg)]">
              {[
                {
                  title: "Buscar Municipio",
                  description: "Consulta el planeamiento urbanístico de cualquier municipio de España.",
                  href: "/municipios",
                },
                {
                  title: "Visor de Mapa",
                  description: "Explora las capas WMS y visualiza el planeamiento sobre el mapa.",
                  href: "/mapa",
                },
                {
                  title: "Legislación Vigente",
                  description: "Accede a la normativa urbanística por nivel: estatal, autonómico y municipal.",
                  href: "/legislacion",
                },
                {
                  title: "Documentación API",
                  description: "Endpoints REST para consulta programática de datos urbanísticos.",
                  href: "/api-docs",
                },
              ].map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group flex items-start gap-4 bg-[var(--color-dark-bg)] p-5 sm:p-6 transition-colors duration-150 hover:bg-[var(--color-card-bg)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-secondary)] transition-colors duration-150">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  <svg className="h-4 w-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-secondary)] transition-all duration-150 group-hover:translate-x-0.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
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
