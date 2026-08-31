import { createSupabaseServer } from "@/lib/supabase-server"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card } from "@/components/ui/Card"

interface SIOSELayer {
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

async function getSIOSELayers() {
  const supabase = createSupabaseServer()

  const { data, error } = await supabase
    .from("geo_layers")
    .select("*, geo_services(service_name, url, ccaa, scope, endpoint_status)")
    .or("thematic_category.eq.siose,thematic_category.eq.ocupacion_suelo,thematic_category.eq.clasificacion_suelo,thematic_category.eq.clase_suelo,thematic_category.eq.categoria_suelo")
    .order("thematic_category")

  if (error) {
    console.error("Error fetching SIOSE layers:", error)
    return []
  }

  return data as SIOSELayer[]
}

async function getStats() {
  const supabase = createSupabaseServer()

  const [siose, ocupacion, clasificacion, clase, categoria] = await Promise.all([
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "siose"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "ocupacion_suelo"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "clasificacion_suelo"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "clase_suelo"),
    supabase.from("geo_layers").select("id", { count: "exact", head: true }).eq("thematic_category", "categoria_suelo"),
  ])

  return {
    siose: siose.count ?? 0,
    ocupacion: ocupacion.count ?? 0,
    clasificacion: clasificacion.count ?? 0,
    clase: clase.count ?? 0,
    categoria: categoria.count ?? 0,
  }
}

function getCategoryBadge(category: string | null) {
  const styles: Record<string, string> = {
    siose: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    ocupacion_suelo: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    clasificacion_suelo: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
    clase_suelo: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    categoria_suelo: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  }

  const labels: Record<string, string> = {
    siose: "SIOSE",
    ocupacion_suelo: "Ocupación del Suelo",
    clasificacion_suelo: "Clasificación del Suelo",
    clase_suelo: "Clase de Suelo",
    categoria_suelo: "Categoría de Suelo",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[category || ""] || "bg-gray-100 text-gray-800"}`}>
      {labels[category || ""] || category}
    </span>
  )
}

export default async function SIOSE() {
  const [layers, stats] = await Promise.all([getSIOSELayers(), getStats()])

  const groupedByCategory = layers.reduce((acc, layer) => {
    const key = layer.thematic_category || "otros"
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(layer)
    return acc
  }, {} as Record<string, SIOSELayer[]>)

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              SIOSE y Ocupación del Suelo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Capas geoespaciales del Sistema de Información sobre Ocupación del Suelo de España
              (SIOSE), ocupación del suelo y clasificación del suelo por comunidad autónoma.
            </p>
          </section>

          <section className="mb-10">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Card className="text-center">
                <p className="text-2xl font-bold text-emerald-600">{stats.siose}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">SIOSE</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.ocupacion}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Ocupación Suelo</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-violet-600">{stats.clasificacion}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Clasificación</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-amber-600">{stats.clase}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Clase</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-rose-600">{stats.categoria}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Categoría</p>
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <Card className="border-l-4 border-l-blue-500">
              <h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">Fuentes estatales</h3>
              <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <li>
                  <a
                    href="https://servicios.idee.es/wms-inspire/occupacion-suelo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    IDEe - Ocupación del Suelo (WMS INSPIRE)
                  </a>
                  <span className="ml-2 text-xs">(IGN / Instituto Geográfico Nacional)</span>
                </li>
                <li>
                  <a
                    href="https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    SIU - Servicios OGC (WFS)
                  </a>
                  <span className="ml-2 text-xs">(Ministerio de Transportes)</span>
                </li>
                <li>
                  <a
                    href="https://www.mivau.gob.es/urbanismo-y-suelo/sistema-de-informacion-urbana/siose"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    Portal SIOSE - Datos Abiertos
                  </a>
                  <span className="ml-2 text-xs">(Ministerio de Transportes)</span>
                </li>
              </ul>
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
