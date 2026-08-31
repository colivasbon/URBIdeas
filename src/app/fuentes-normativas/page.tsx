import Link from "next/link"
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

async function getLegalSources(level?: string, communityId?: string) {
  const supabase = createSupabaseServer()

  let query = supabase
    .from("legal_sources")
    .select("*, communities_autonomas(nombre)")
    .order("level")
    .order("territory")

  if (level) {
    query = query.eq("level", level)
  }

  if (communityId) {
    query = query.eq("community_id", communityId)
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

  const [estatal, autonomico, provincial, municipal] = await Promise.all([
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "estatal"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "autonomico"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "provincial"),
    supabase.from("legal_sources").select("id", { count: "exact", head: true }).eq("level", "municipal"),
  ])

  return {
    estatal: estatal.count ?? 0,
    autonomico: autonomico.count ?? 0,
    provincial: provincial.count ?? 0,
    municipal: municipal.count ?? 0,
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

export default async function FuentesNormativas({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; community?: string }>
}) {
  const params = await searchParams
  const [sources, stats] = await Promise.all([
    getLegalSources(params.level, params.community),
    getStats(),
  ])

  const groupedSources = sources.reduce((acc, source) => {
    const key = source.territory
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(source)
    return acc
  }, {} as Record<string, LegalSource[]>)

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Fuentes Normativas
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Catálogo completo de fuentes jurídicas por nivel administrativo: estatal,
              autonómico, provincial y municipal.
            </p>
          </section>

          <section className="mb-10">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card className="text-center">
                <p className="text-2xl font-bold text-[var(--color-primary)]">{stats.estatal}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Estatal</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-[var(--color-secondary)]">{stats.autonomico}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Autonómico</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-[var(--color-accent)]">{stats.provincial}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Provincial</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-bold text-[var(--color-primary)]">{stats.municipal}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Municipal</p>
              </Card>
            </div>
          </section>

          <section className="mb-6">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/fuentes-normativas"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  !params.level
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Todos
              </Link>
              <Link
                href="/fuentes-normativas?level=estatal"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "estatal"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Estatal
              </Link>
              <Link
                href="/fuentes-normativas?level=autonomico"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "autonomico"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Autonómico
              </Link>
              <Link
                href="/fuentes-normativas?level=provincial"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "provincial"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Provincial
              </Link>
              <Link
                href="/fuentes-normativas?level=municipal"
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  params.level === "municipal"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card-bg)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                }`}
              >
                Municipal
              </Link>
            </div>
          </section>

          <section>
            {Object.entries(groupedSources).map(([territory, territorySources]) => (
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
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
