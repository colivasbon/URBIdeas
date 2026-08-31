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
      title: "Legislación Vigente",
      description: "Accede a la normativa urbanística por nivel: estatal, autonómico y municipal.",
      href: "/legislacion",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
    },
    {
      title: "Panel Admin",
      description: "Gestiona fuentes, capas WMS, servicios geoespaciales y normativa.",
      href: "/admin",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
