import { createSupabaseServer } from "@/lib/supabase-server"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card } from "@/components/ui/Card"

interface CalificacionLayer {
  id: string
  layer_name: string
  layer_title: string | null
  abstract: string | null
  thematic_category: string | null
  internal_taxonomy: string | null
  queryable: boolean
  notes: string | null
  geo_services: {
    service_name: string
    url: string
    ccaa: string
    scope: string
    endpoint_status: string
  }
}

async function getCalificacionLayers() {
  const supabase = createSupabaseServer()

  const { data, error } = await supabase
    .from("geo_layers")
    .select("*, geo_services(service_name, url, ccaa, scope, endpoint_status)")
    .or("thematic_category.eq.calificacion_urbanistica,thematic_category.eq.zonificacion,thematic_category.eq.usos_suelo,thematic_category.eq.planeamiento_general,thematic_category.eq.planeamiento_desarrollo,thematic_category.eq.sector,thematic_category.eq.ambito,thematic_category.eq.unidad_actuacion")
    .order("thematic_category")

  if (error) {
    console.error("Error fetching calificacion layers:", error)
    return []
  }

  return data as CalificacionLayer[]
}

async function getStats() {
  const supabase = createSupabaseServer()

  const [calificacion, zonificacion, usos, general, desarrollo, sector, ambito, unidad] = await Promise.all([
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "calificacion_urbanistica"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "zonificacion"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "usos_suelo"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "planeamiento_general"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "planeamiento_desarrollo"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "sector"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "ambito"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "unidad_actuacion"),
  ])

  return {
    calificacion: calificacion.count ?? 0,
    zonificacion: zonificacion.count ?? 0,
    usos: usos.count ?? 0,
    general: general.count ?? 0,
    desarrollo: desarrollo.count ?? 0,
    sector: sector.count ?? 0,
    ambito: ambito.count ?? 0,
    unidad: unidad.count ?? 0,
  }
}

function getCategoryBadge(category: string | null) {
  const styles: Record<string, string> = {
    calificacion_urbanistica: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
    zonificacion: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
    usos_suelo: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    planeamiento_general: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
    planeamiento_desarrollo: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    sector: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
    ambito: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
    unidad_actuacion: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  }

  const labels: Record<string, string> = {
    calificacion_urbanistica: "Calificación Urbanística",
    zonificacion: "Zonificación",
    usos_suelo: "Usos del Suelo",
    planeamiento_general: "Planeamiento General",
    planeamiento_desarrollo: "Planeamiento de Desarrollo",
    sector: "Sector",
    ambito: "Ámbito",
    unidad_actuacion: "Unidad de Actuación",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[category || ""] || "bg-gray-100 text-gray-800"}`}>
      {labels[category || ""] || category}
    </span>
  )
}

export default async function CalificacionSuelo() {
  const [layers, stats] = await Promise.all([getCalificacionLayers(), getStats()])

  const groupedByCategory = layers.reduce((acc, layer) => {
    const key = layer.thematic_category || "otros"
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(layer)
    return acc
  }, {} as Record<string, CalificacionLayer[]>)

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Calificación y Clasificación del Suelo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Capas de calificación urbanística, zonificación, usos del suelo, sectores,
              ámbitos y unidades de actuación por comunidad autónoma.
            </p>
          </section>

          <section className="mb-10">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card className="text-center">
                <p className="text-2xl font-bold text-rose-600">{stats.calificacion}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Calificación</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-orange-600">{stats.usos}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Usos</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-indigo-600">{stats.general}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">P. General</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-cyan-600">{stats.sector}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Sectores</p>
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <Card className="border-l-4 border-l-rose-500">
              <h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">Taxonomía interna de la app</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-[var(--color-text-secondary)] sm:grid-cols-4">
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Clasificación del suelo</p>
                  <p className="text-xs">→ land_cover / soil_class</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Calificación urbanística</p>
                  <p className="text-xs">→ urban_zone / planned_land_use</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Usos del suelo</p>
                  <p className="text-xs">→ land_use / soil_category</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Planeamiento</p>
                  <p className="text-xs">→ municipal_plan / planning_sector</p>
                </div>
              </div>
            </Card>
          </section>

          <section>
            {Object.entries(groupedByCategory).map(([category, categoryLayers]) => (
              <div key={category} className="mb-8">
                <div className="mb-4 flex items-center gap-3">
                  {getCategoryBadge(category)}
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </h2>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    ({categoryLayers.length} capas)
                  </span>
                </div>
                <div className="space-y-3">
                  {categoryLayers.map((layer) => (
                    <Card key={layer.id} className="transition-all hover:shadow-md">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {getCategoryBadge(layer.thematic_category)}
                            {layer.geo_services?.scope && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                                {layer.geo_services.scope}
                              </span>
                            )}
                            {layer.queryable && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Consultable
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                            {layer.layer_title || layer.layer_name}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                            {layer.geo_services?.ccaa} / {layer.geo_services?.service_name}
                          </p>
                          <p className="mt-1 font-mono text-xs text-[var(--color-text-secondary)]">
                            {layer.layer_name}
                          </p>
                          {layer.abstract && (
                            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                              {layer.abstract}
                            </p>
                          )}
                          {layer.notes && (
                            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                              {layer.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <a
                            href={layer.geo_services?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg bg-[var(--color-primary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
                          >
                            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            Abrir servicio
                          </a>
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
