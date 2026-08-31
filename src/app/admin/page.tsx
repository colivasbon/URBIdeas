"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { supabase } from "@/lib/supabase"

type Tab = "fuentes" | "capas" | "geo_services" | "legal" | "estado"

interface FuenteGeoportal {
  id: string
  nombre: string
  url: string
  tipo_servicio: string
  ultima_actualizacion: string
  activo: boolean
}

interface CapaWMSAdmin {
  id: string
  nombre_capa: string
  url_servicio: string
  tipo_servicio: string
  sistema_referencia: string
  fecha_verificacion: string
  activo: boolean
  comunidad_autonoma?: { nombre: string } | null
}

interface GeoService {
  id: string
  ccaa: string
  scope: string
  service_name: string
  service_type: string
  url: string
  endpoint_status: string
  legal_value: string
  provider: string | null
  theme: string | null
  notes: string | null
}

interface LegalSource {
  id: string
  territory: string
  level: string
  name: string
  type: string
  url: string | null
  authority: string | null
  legal_value: string
  status: string
}

interface SystemStats {
  totalMunicipios: number
  totalCapasActivas: number
  totalLegislacion: number
  totalGeoServices: number
  totalLegalSources: number
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fuentes")
  const [fuentes, setFuentes] = useState<FuenteGeoportal[]>([])
  const [capas, setCapas] = useState<CapaWMSAdmin[]>([])
  const [geoServices, setGeoServices] = useState<GeoService[]>([])
  const [legalSources, setLegalSources] = useState<LegalSource[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      const fuentesRes = await fetch("/api/fuentes").then((r) => r.json()).catch(() => ({ data: [] }))
      const capasRes = await fetch("/api/capas-wms").then((r) => r.json()).catch(() => ({ data: [] }))

      let totalMunicipios = 0
      let totalLegislacion = 0
      let totalGeoServices = 0
      let totalLegalSources = 0

      try {
        const { count } = await supabase.from("municipios").select("id", { count: "exact", head: true })
        totalMunicipios = count ?? 0
      } catch { /* table may not exist */ }

      try {
        const { count } = await supabase.from("normativa_vigente").select("id", { count: "exact", head: true })
        totalLegislacion = count ?? 0
      } catch { /* table may not exist */ }

      try {
        const { data } = await supabase.from("geo_services").select("*").order("ccaa")
        if (data) {
          setGeoServices(data as GeoService[])
          totalGeoServices = data.length
        }
      } catch { /* table may not exist */ }

      try {
        const { data } = await supabase.from("legal_sources").select("*").order("level").order("territory")
        if (data) {
          setLegalSources(data as LegalSource[])
          totalLegalSources = data.length
        }
      } catch { /* table may not exist */ }

      if (fuentesRes.data) setFuentes(fuentesRes.data)

      if (capasRes.data) {
        const mapped = capasRes.data.map((c: Record<string, unknown>) => ({
          ...c,
          comunidad_autonoma: Array.isArray(c.comunidad_autonoma)
            ? (c.comunidad_autonoma as Record<string, unknown>[])[0]
            : c.comunidad_autonoma,
        }))
        setCapas(mapped)
      }

      const capasActivas = capasRes.data?.filter((c: CapaWMSAdmin) => c.activo).length ?? 0

      setStats({
        totalMunicipios,
        totalCapasActivas: capasActivas,
        totalLegislacion,
        totalGeoServices,
        totalLegalSources,
      })

      setLoading(false)
    }
    loadData()
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: "fuentes", label: "Fuentes Geoportales" },
    { key: "capas", label: "Capas WMS" },
    { key: "geo_services", label: "Servicios Geo" },
    { key: "legal", label: "Fuentes Normativas" },
    { key: "estado", label: "Estado del Sistema" },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Panel de Administración
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Gestiona fuentes geoportales, capas WMS, servicios geoespaciales,
              fuentes normativas y supervisa el estado del sistema.
            </p>
          </section>

          <div className="mb-6 flex gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-[var(--border-radius)] px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
              <span className="ml-3 text-sm text-[var(--color-text-secondary)]">
                Cargando datos...
              </span>
            </div>
          ) : (
            <>
              {tab === "fuentes" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Fuentes Geoportales</CardTitle>
                  </CardHeader>
                  {fuentes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                      No hay fuentes geoportales registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Nombre</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">URL</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Tipo</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Última actualización</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Activo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fuentes.map((f) => (
                            <tr
                              key={f.id}
                              className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
                            >
                              <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{f.nombre}</td>
                              <td className="px-4 py-3">
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="max-w-[200px] truncate text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors underline underline-offset-2 inline-block"
                                >
                                  {f.url}
                                </a>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="primary">{f.tipo_servicio}</Badge>
                              </td>
                              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                                {f.ultima_actualizacion
                                  ? new Date(f.ultima_actualizacion).toLocaleDateString("es-ES")
                                  : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={f.activo ? "success" : "danger"}>
                                  {f.activo ? "Sí" : "No"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {tab === "capas" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Capas WMS (Legacy)</CardTitle>
                  </CardHeader>
                  {capas.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                      No hay capas WMS registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Comunidad</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Nombre Capa</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">URL</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Tipo</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Activo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {capas.map((c) => (
                            <tr
                              key={c.id}
                              className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
                            >
                              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                                {c.comunidad_autonoma?.nombre ?? "—"}
                              </td>
                              <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{c.nombre_capa}</td>
                              <td className="px-4 py-3">
                                <a
                                  href={c.url_servicio}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="max-w-[180px] truncate text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors underline underline-offset-2 inline-block"
                                >
                                  {c.url_servicio}
                                </a>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="secondary">{c.tipo_servicio}</Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={c.activo ? "success" : "danger"}>
                                  {c.activo ? "Sí" : "No"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {tab === "geo_services" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Servicios Geoespaciales (OGC)</CardTitle>
                  </CardHeader>
                  {geoServices.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                      No hay servicios geoespaciales registrados.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">CCAA</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Servicio</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Tipo</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Estado</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Valor Legal</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {geoServices.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
                            >
                              <td className="px-4 py-3 text-[var(--color-text-secondary)]">{s.ccaa}</td>
                              <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{s.service_name}</td>
                              <td className="px-4 py-3">
                                <Badge variant="secondary">{s.service_type}</Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={
                                  s.endpoint_status === "confirmed" ? "success" :
                                  s.endpoint_status === "pending" ? "accent" : "danger"
                                }>
                                  {s.endpoint_status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={
                                  s.legal_value === "vinculante" ? "success" :
                                  s.legal_value === "oficial_referencia" ? "primary" : "accent"
                                }>
                                  {s.legal_value}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="max-w-[180px] truncate text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors underline underline-offset-2 inline-block"
                                >
                                  {s.url}
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {tab === "legal" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Fuentes Normativas</CardTitle>
                  </CardHeader>
                  {legalSources.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                      No hay fuentes normativas registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Territorio</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Nivel</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Nombre</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Tipo</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Valor Legal</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Estado</th>
                            <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {legalSources.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
                            >
                              <td className="px-4 py-3 text-[var(--color-text-secondary)]">{s.territory}</td>
                              <td className="px-4 py-3">
                                <Badge variant={
                                  s.level === "estatal" ? "primary" :
                                  s.level === "autonomico" ? "secondary" : "accent"
                                }>
                                  {s.level}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 font-medium text-[var(--color-text-primary)] max-w-[300px] truncate">{s.name}</td>
                              <td className="px-4 py-3 text-[var(--color-text-secondary)]">{s.type?.replace(/_/g, " ")}</td>
                              <td className="px-4 py-3">
                                <Badge variant={
                                  s.legal_value === "vinculante" ? "success" :
                                  s.legal_value === "oficial_referencia" ? "primary" : "accent"
                                }>
                                  {s.legal_value}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={s.status === "vigente" ? "success" : "danger"}>
                                  {s.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                {s.url ? (
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="max-w-[150px] truncate text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors underline underline-offset-2 inline-block"
                                  >
                                    {s.url}
                                  </a>
                                ) : (
                                  <span className="text-[var(--color-text-secondary)]">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {tab === "estado" && stats && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--border-radius)] bg-[var(--color-primary)]">
                        <svg className="h-6 w-6 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                          {stats.totalMunicipios.toLocaleString("es-ES")}
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">Municipios registrados</p>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--border-radius)] bg-[var(--color-secondary)]">
                        <svg className="h-6 w-6 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.totalCapasActivas}</p>
                        <p className="text-sm text-[var(--color-text-secondary)]">Capas WMS activas</p>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--border-radius)] bg-[var(--color-accent)]">
                        <svg className="h-6 w-6 text-[var(--color-dark-bg)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                          {stats.totalLegislacion.toLocaleString("es-ES")}
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">Entradas de legislación</p>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--border-radius)] bg-emerald-500">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                          {stats.totalGeoServices.toLocaleString("es-ES")}
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">Servicios geoespaciales</p>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--border-radius)] bg-violet-500">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                          {stats.totalLegalSources.toLocaleString("es-ES")}
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">Fuentes normativas</p>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
