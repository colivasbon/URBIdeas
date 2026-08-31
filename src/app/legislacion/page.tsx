import { createSupabaseServer } from "@/lib/supabase-server"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card } from "@/components/ui/Card"

interface LegalSource {
  id: string
  territory: string
  level: string
  name: string
  type: string
  url: string | null
  authority: string | null
  description: string | null
  legal_value: string
  priority: string
  publication_date: string | null
  status: string
  communities_autonomas?: { nombre: string } | null
}

async function getLegalSources(level?: string) {
  const supabase = createSupabaseServer()

  let query = supabase
    .from("legal_sources")
    .select("*, communities_autonomas(nombre)")
    .order("level")
    .order("territory")
    .order("name")

  if (level) {
    query = query.eq("level", level)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching legal sources:", error)
    return []
  }

  return data as LegalSource[]
}

async function getStats() {
  const supabase = createSupabaseServer()

  const [estatal, autonomico, provincial, municipal, vinculantes] = await Promise.all([
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "estatal"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "autonomico"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "provincial"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "municipal"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("legal_value", "vinculante"),
  ])

  return {
    estatal: estatal.count ?? 0,
    autonomico: autonomico.count ?? 0,
    provincial: provincial.count ?? 0,
    municipal: municipal.count ?? 0,
    vinculantes: vinculantes.count ?? 0,
  }
}

function getLegalValueBadge(value: string) {
  const styles: Record<string, string> = {
    vinculante: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    oficial_referencia: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    informativo: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    descubrimiento: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  }

  const labels: Record<string, string> = {
    vinculante: "Vinculante",
    oficial_referencia: "Oficial",
    informativo: "Informativo",
    descubrimiento: "Descubrimiento",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[value] || styles.informativo}`}>
      {labels[value] || value}
    </span>
  )
}

function getLevelBadge(level: string) {
  const styles: Record<string, string> = {
    estatal: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    autonomico: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
    provincial: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    municipal: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  }

  const labels: Record<string, string> = {
    estatal: "Estatal",
    autonomico: "Autonómico",
    provincial: "Provincial",
    municipal: "Municipal",
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[level] || styles.autonomico}`}>
      {labels[level] || level}
    </span>
  )
}

function groupByTerritory(sources: LegalSource[]) {
  const groups: Record<string, LegalSource[]> = {}
  for (const source of sources) {
    const key = source.territory
    if (!groups[key]) groups[key] = []
    groups[key].push(source)
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
}

export default async function LegislacionPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>
}) {
  const params = await searchParams
  const [sources, stats] = await Promise.all([
    getLegalSources(params.level),
    getStats(),
  ])

  const grouped = groupByTerritory(sources)

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Legislación Urbanística
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Jerarquía normativa urbanística de España: legislación estatal básica,
              normativa autonómica, publicaciones oficiales y planeamiento municipal.
            </p>
          </section>

          <section className="mb-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Card className="text-center">
                <p className="text-2xl font-bold text-purple-600">{stats.estatal}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Estatal</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-indigo-600">{stats.autonomico}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Autonómico</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-orange-600">{stats.provincial}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Provincial</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-teal-600">{stats.municipal}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Municipal</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.vinculantes}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Vinculantes</p>
              </Card>
            </div>
          </section>

          <section className="mb-6">
            <div className="flex flex-wrap gap-2">
              <a
                href="/legislacion"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  !params.level
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 border border-[var(--color-border)]"
                }`}
              >
                Todos
              </a>
              <a
                href="/legislacion?level=estatal"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "estatal"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 border border-[var(--color-border)]"
                }`}
              >
                Estatal
              </a>
              <a
                href="/legislacion?level=autonomico"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "autonomico"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 border border-[var(--color-border)]"
                }`}
              >
                Autonómico
              </a>
              <a
                href="/legislacion?level=provincial"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "provincial"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 border border-[var(--color-border)]"
                }`}
              >
                Provincial
              </a>
              <a
                href="/legislacion?level=municipal"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "municipal"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 border border-[var(--color-border)]"
                }`}
              >
                Municipal
              </a>
            </div>
          </section>

          <section className="mb-8">
            <Card className="border-l-4 border-l-purple-500">
              <h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">Orden de consulta</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                La app resuelve la información en este orden: 1) Legislación estatal básica →
                2) Legislación autonómica urbanística aplicable → 3) Publicación oficial intermedia
                (BOP, boletín autonómico) → 4) Planeamiento municipal vigente → 5) Capas gráficas de apoyo.
              </p>
            </Card>
          </section>

          <section>
            {grouped.length === 0 ? (
              <Card>
                <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
                  No se encontraron fuentes normativas para el filtro seleccionado.
                </p>
              </Card>
            ) : (
              grouped.map(([territory, territorySources]) => (
                <div key={territory} className="mb-8">
                  <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
                    {territory}
                  </h2>
                  <div className="space-y-3">
                    {territorySources.map((source) => (
                      <Card key={source.id} className="transition-all hover:shadow-md">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              {getLevelBadge(source.level)}
                              {getLegalValueBadge(source.legal_value)}
                              {source.status !== "vigente" && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                  {source.status}
                                </span>
                              )}
                              {source.type && (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  {source.type.replace(/_/g, " ")}
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                              {source.name}
                            </h3>
                            {source.authority && (
                              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                {source.authority}
                              </p>
                            )}
                            {source.description && (
                              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                                {source.description}
                              </p>
                            )}
                            {source.publication_date && (
                              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                                Publicación: {new Date(source.publication_date).toLocaleDateString("es-ES")}
                              </p>
                            )}
                          </div>
                          {source.url && (
                            <div className="shrink-0">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-lg bg-[var(--color-primary)]/10 px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
                              >
                                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                                Consultar
                              </a>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
