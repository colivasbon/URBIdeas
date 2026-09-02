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
        <section className="border-b border-[var(--color-border-subtle)] bg-gradient-to-br from-[var(--color-primary)]/10 via-transparent to-[var(--color-secondary)]/5">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                Registro Urbanístico
                <span className="block text-[var(--color-secondary)]">de España</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                Plataforma de centralización y consulta de información pública de planeamiento
                urbanístico: legislación, PGOU, instrumentos de planeamiento y capas WMS/WFS de
                todo el territorio nacional.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/municipios"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--border-radius)] hover:bg-[var(--color-primary-light)] hover:shadow-[var(--shadow-glow-primary)] transition-all duration-[var(--duration-normal)] active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  Buscar municipio
                </Link>
                <Link
                  href="/mapa"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)] transition-all duration-[var(--duration-normal)] active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                  Ver mapa
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {[
                { label: "Municipios", value: stats.totalMunicipios.toLocaleString("es-ES"), href: "/municipios", color: "var(--color-primary)" },
                { label: "Fuentes Normativas", value: stats.totalLegalSources.toLocaleString("es-ES"), href: "/legislacion", color: "var(--color-secondary)" },
                { label: "Servicios Geo", value: stats.totalGeoServices.toLocaleString("es-ES"), href: "/legislacion", color: "var(--color-accent)" },
                { label: "Capas WMS", value: stats.totalCapasWMS.toLocaleString("es-ES"), href: "/mapa", color: "var(--color-primary)" },
              ].map((stat) => (
                <Link key={stat.label} href={stat.href} className="group block">
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-4 sm:p-5 transition-all duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)] hover:border-[var(--color-border)] hover:-translate-y-0.5 active:scale-[0.99]">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[var(--border-radius)] mb-3" style={{ backgroundColor: `${stat.color}20`, color: stat.color }}>
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-[var(--color-text-secondary)]">
                      {stat.label}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">Acceso rápido</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {[
                { title: "Buscar Municipio", description: "Consulta el planeamiento urbanístico de cualquier municipio de España.", href: "/municipios" },
                { title: "Ver Mapa", description: "Explora las capas WMS y visualiza el planeamiento sobre el mapa.", href: "/mapa" },
                { title: "Legislación Vigente", description: "Accede a la normativa urbanística por nivel: estatal, autonómico y municipal.", href: "/legislacion" },
                { title: "Panel Admin", description: "Gestiona fuentes, capas WMS, servicios geoespaciales y normativa.", href: "/admin" },
              ].map((item) => (
                <Link key={item.title} href={item.href} className="group block">
                  <div className="flex items-start gap-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-4 sm:p-5 transition-all duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)] hover:border-[var(--color-border)] hover:-translate-y-0.5 active:scale-[0.99]">
                    <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-[var(--border-radius)] bg-[var(--color-primary)]/15 text-[var(--color-secondary)] transition-all duration-[var(--duration-normal)] group-hover:bg-[var(--color-secondary)]/20 group-hover:text-[var(--color-secondary-light)]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-secondary)] transition-colors duration-[var(--duration-normal)]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
