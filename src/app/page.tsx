import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase-server"
import { Card } from "@/components/ui/Card"
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

  const statCards = [
    {
      label: "Total Municipios",
      value: stats.totalMunicipios.toLocaleString("es-ES"),
      href: "/municipios",
      color: "var(--color-primary)",
    },
    {
      label: "Fuentes Normativas",
      value: stats.totalLegalSources.toLocaleString("es-ES"),
      href: "/fuentes-normativas",
      color: "var(--color-secondary)",
    },
    {
      label: "Servicios Geoespaciales",
      value: stats.totalGeoServices.toLocaleString("es-ES"),
      href: "/servicios-geoespaciales",
      color: "var(--color-accent)",
      valueColor: "var(--color-dark-bg)",
    },
    {
      label: "Capas WMS Activas",
      value: stats.totalCapasWMS.toLocaleString("es-ES"),
      href: "/mapa",
      color: "var(--color-primary)",
    },
  ]

  const quickAccess = [
    {
      title: "Buscar Municipio",
      description: "Consulta el planeamiento urbanístico de cualquier municipio de España.",
      href: "/municipios",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      ),
    },
    {
      title: "Ver Mapa",
      description: "Explora las capas WMS y visualiza el planeamiento sobre el mapa.",
      href: "/mapa",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
      ),
    },
    {
      title: "Fuentes Normativas",
      description: "Consulta la jerarquía normativa urbanística por nivel administrativo.",
      href: "/fuentes-normativas",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
    },
    {
      title: "Servicios Geoespaciales",
      description: "Accede al catálogo de servicios OGC (WMS/WFS) de urbanismo por CCAA.",
      href: "/servicios-geoespaciales",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" />
        </svg>
      ),
    },
    {
      title: "SIOSE y Ocupación del Suelo",
      description: "Consulta las capas del Sistema de Información sobre Ocupación del Suelo.",
      href: "/siose",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
        </svg>
      ),
    },
    {
      title: "Calificación del Suelo",
      description: "Explora calificación urbanística, sectores, ámbitos y unidades de actuación.",
      href: "/calificacion-suelo",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Registro Urbanístico de España
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Plataforma de centralización y consulta de información pública de planeamiento
              urbanístico: legislación, PGOU, instrumentos de planeamiento y capas WMS/WFS de
              todo el territorio nacional.
            </p>
          </section>

          <section className="mb-10">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {statCards.map((stat) => (
                <Link key={stat.label} href={stat.href} className="group block">
                  <Card className="transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-[var(--color-primary)]/10">
                    <div
                      className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[var(--border-radius)]"
                      style={{ backgroundColor: stat.color }}
                    >
                      <span
                        className="text-lg font-bold"
                        style={{ color: stat.valueColor ?? "#fff" }}
                      >
                        {stat.value.charAt(0)}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stat.value}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {stat.label}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-lg font-semibold text-[var(--color-text-primary)]">Acceso rápido</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quickAccess.map((item) => (
                <Link key={item.title} href={item.href} className="group block">
                  <Card className="flex items-start gap-4 transition-all duration-200 hover:border-[var(--color-secondary)] hover:shadow-lg hover:shadow-[var(--color-secondary)]/10">
                    <div className="shrink-0 rounded-[var(--border-radius)] bg-[var(--color-primary)]/20 p-2.5 text-[var(--color-secondary)] transition-colors duration-200 group-hover:bg-[var(--color-secondary)]/20">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-secondary)]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                        {item.description}
                      </p>
                    </div>
                  </Card>
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
