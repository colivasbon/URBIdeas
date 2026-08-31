import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase-server"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card } from "@/components/ui/Card"

interface GeoService {
  id: string
  ccaa: string
  scope: string
  service_name: string
  service_type: string
  url: string
  get_capabilities_url: string | null
  provider: string | null
  theme: string | null
  subtheme: string | null
  keywords: string[] | null
  endpoint_status: string
  legal_value: string
  notes: string | null
  geo_layers?: Array<{
    id: string
    layer_name: string
    layer_title: string | null
    thematic_category: string | null
    queryable: boolean
  }>
}

async function getGeoServices(scope?: string, search?: string) {
  const supabase = createSupabaseServer()

  let query = supabase
    .from("geo_services")
    .select("*, geo_layers(id, layer_name, layer_title, thematic_category, queryable)")
    .order("scope")
    .order("ccaa")

  if (scope) {
    query = query.eq("scope", scope)
  }

  if (search) {
    query = query.or(`service_name.ilike.%${search}%,ccaa.ilike.%${search}%,provider.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching geo services:", error)
    return []
  }

  return data as GeoService[]
}

async function getStats() {
  const supabase = createSupabaseServer()

  const [confirmed, pending, failed, total] = await Promise.all([
    supabase.from("geo_services").select("id", { count: "exact", head: true }).eq("endpoint_status", "confirmed"),
    supabase.from("geo_services").select("id", { count: "exact", head: true }).eq("endpoint_status", "pending"),
    supabase.from("geo_services").select("id", { count: "exact", head: true }).eq("endpoint_status", "failed"),
    supabase.from("geo_services").select("id", { count: "exact", head: true }),
  ])

  return {
    confirmed: confirmed.count ?? 0,
    pending: pending.count ?? 0,
    failed: failed.count ?? 0,
    total: total.count ?? 0,
  }
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    deprecated: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  }

  const labels: Record<string, string> = {
    confirmed: "Confirmado",
    pending: "Pendiente",
    failed: "Fallido",
    deprecated: "Obsoleto",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  )
}

function getTypeBadge(type: string) {
  const styles: Record<string, string> = {
    WMS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    WFS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    WMTS: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
    visor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    "ArcGIS REST": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[type] || "bg-gray-100 text-gray-800"}`}>
      {type}
    </span>
  )
}

export default async function ServiciosGeoespaciales({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; search?: string }>
}) {
  const params = await searchParams
  const [services, stats] = await Promise.all([
    getGeoServices(params.scope, params.search),
    getStats(),
  ])

  const groupedByCCAA = services.reduce((acc, service) => {
    const key = service.ccaa || "Sin especificar"
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(service)
    return acc
  }, {} as Record<string, GeoService[]>)

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Servicios Geoespaciales
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Catálogo técnico de servicios OGC (WMS/WFS/WMTS) de urbanismo, clasificación
              del suelo y planeamiento por comunidad autónoma.
            </p>
          </section>

          <section className="mb-10">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card className="text-center">
                <p className="text-2xl font-bold text-[var(--color-primary)]">{stats.total}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Total</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Confirmados</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Pendientes</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Fallidos</p>
              </Card>
            </div>
          </section>

          <section className="mb-6">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/servicios-geoespaciales"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  !params.scope
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Todos
              </Link>
              <Link
                href="/servicios-geoespaciales?scope=estatal"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.scope === "estatal"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Estatal
              </Link>
              <Link
                href="/servicios-geoespaciales?scope=autonomico"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.scope === "autonomico"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Autonómico
              </Link>
            </div>
          </section>

          <section>
            {Object.entries(groupedByCCAA).map(([ccaa, ccaaServices]) => (
              <div key={ccaa} className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
                  {ccaa}
                </h2>
                <div className="space-y-4">
                  {ccaaServices.map((service) => (
                    <Card key={service.id} className="transition-all hover:shadow-md">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {getTypeBadge(service.service_type)}
                            {getStatusBadge(service.endpoint_status)}
                            {service.scope && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                                {service.scope}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                            {service.service_name}
                          </h3>
                          {service.provider && (
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                              {service.provider}
                            </p>
                          )}
                          {service.theme && (
                            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                              Tema: {service.theme} / {service.subtheme}
                            </p>
                          )}
                          {service.notes && (
                            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                              {service.notes}
                            </p>
                          )}
                          {service.geo_layers && service.geo_layers.length > 0 && (
                            <div className="mt-3">
                              <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                                Capas ({service.geo_layers.length}):
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {service.geo_layers.slice(0, 5).map((layer) => (
                                  <span
                                    key={layer.id}
                                    className="inline-flex items-center rounded bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs text-[var(--color-primary)]"
                                  >
                                    {layer.layer_name}
                                    {layer.queryable && " (Q)"}
                                  </span>
                                ))}
                                {service.geo_layers.length > 5 && (
                                  <span className="text-xs text-[var(--color-text-secondary)]">
                                    +{service.geo_layers.length - 5} más
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {service.keywords && service.keywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {service.keywords.map((kw) => (
                                <span
                                  key={kw}
                                  className="inline-flex items-center rounded bg-[var(--color-secondary)]/10 px-2 py-0.5 text-xs text-[var(--color-secondary)]"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <a
                            href={service.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg bg-[var(--color-primary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
                          >
                            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            Abrir
                          </a>
                          {service.get_capabilities_url && (
                            <a
                              href={service.get_capabilities_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-lg bg-[var(--color-secondary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-secondary)] transition-colors hover:bg-[var(--color-secondary)]/20"
                            >
                              GetCapabilities
                            </a>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
