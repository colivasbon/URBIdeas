"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Badge } from "@/components/ui/Badge"
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
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Page header */}
          <section className="mb-6 border-b border-[var(--color-border-subtle)] pb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-[var(--color-secondary)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)]">
                Gestión
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              Panel de Administración
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Gestiona fuentes geoportales, capas WMS, servicios geoespaciales,
              fuentes normativas y supervisa el estado del sistema.
            </p>
          </section>

          {/* Tabs */}
          <div className="mb-6 flex gap-0 border-b border-[var(--color-border-subtle)] overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150 -mb-px',
                  tab === t.key
                    ? 'text-[var(--color-text-primary)] border-b-2 border-[var(--color-secondary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
              <span className="ml-3 text-xs text-[var(--color-text-muted)]">
                Cargando datos...
              </span>
            </div>
          ) : (
            <>
              {tab === "fuentes" && (
                <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] overflow-hidden">
                  {fuentes.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                      No hay fuentes geoportales registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Nombre</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">URL</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Última actualización</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Activo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fuentes.map((f) => (
                            <tr
                              key={f.id}
                              className="border-b border-[var(--color-border-subtle)] transition-colors duration-150 hover:bg-[var(--color-card-bg)]"
                            >
                              <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{f.nombre}</td>
                              <td className="px-4 py-2.5">
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="max-w-[200px] truncate text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors text-xs inline-block"
                                >
                                  {f.url}
                                </a>
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant="primary">{f.tipo_servicio}</Badge>
                              </td>
                              <td className="px-4 py-2.5 text-[var(--color-text-secondary)] text-xs">
                                {f.ultima_actualizacion
                                  ? new Date(f.ultima_actualizacion).toLocaleDateString("es-ES")
                                  : "—"}
                              </td>
                              <td className="px-4 py-2.5">
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
                </div>
              )}

              {tab === "capas" && (
                <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] overflow-hidden">
                  {capas.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                      No hay capas WMS registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Comunidad</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Nombre Capa</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">URL</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Activo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {capas.map((c) => (
                            <tr
                              key={c.id}
                              className="border-b border-[var(--color-border-subtle)] transition-colors duration-150 hover:bg-[var(--color-card-bg)]"
                            >
                              <td className="px-4 py-2.5 text-[var(--color-text-secondary)] text-xs">
                                {c.comunidad_autonoma?.nombre ?? "—"}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{c.nombre_capa}</td>
                              <td className="px-4 py-2.5">
                                <a
                                  href={c.url_servicio}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="max-w-[180px] truncate text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors text-xs inline-block"
                                >
                                  {c.url_servicio}
                                </a>
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant="secondary">{c.tipo_servicio}</Badge>
                              </td>
                              <td className="px-4 py-2.5">
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
                </div>
              )}

              {tab === "geo_services" && (
                <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] overflow-hidden">
                  {geoServices.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                      No hay servicios geoespaciales registrados.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[700px]">
                        <thead>
                          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">CCAA</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Servicio</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Valor Legal</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {geoServices.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-[var(--color-border-subtle)] transition-colors duration-150 hover:bg-[var(--color-card-bg)]"
                            >
                              <td className="px-4 py-2.5 text-[var(--color-text-secondary)] text-xs">{s.ccaa}</td>
                              <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{s.service_name}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant="secondary">{s.service_type}</Badge>
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant={
                                  s.endpoint_status === "confirmed" ? "success" :
                                  s.endpoint_status === "pending" ? "accent" : "danger"
                                }>
                                  {s.endpoint_status}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant={
                                  s.legal_value === "vinculante" ? "success" :
                                  s.legal_value === "oficial_referencia" ? "primary" : "accent"
                                }>
                                  {s.legal_value}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5">
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="max-w-[180px] truncate text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors text-xs inline-block"
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
                </div>
              )}

              {tab === "legal" && (
                <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] overflow-hidden">
                  {legalSources.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                      No hay fuentes normativas registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[700px]">
                        <thead>
                          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Territorio</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Nivel</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Nombre</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Valor Legal</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {legalSources.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-[var(--color-border-subtle)] transition-colors duration-150 hover:bg-[var(--color-card-bg)]"
                            >
                              <td className="px-4 py-2.5 text-[var(--color-text-secondary)] text-xs">{s.territory}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant={
                                  s.level === "estatal" ? "primary" :
                                  s.level === "autonomico" ? "secondary" : "accent"
                                }>
                                  {s.level}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)] max-w-[300px] truncate">{s.name}</td>
                              <td className="px-4 py-2.5 text-[var(--color-text-secondary)] text-xs">{s.type?.replace(/_/g, " ")}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant={
                                  s.legal_value === "vinculante" ? "success" :
                                  s.legal_value === "oficial_referencia" ? "primary" : "accent"
                                }>
                                  {s.legal_value}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant={s.status === "vigente" ? "success" : "danger"}>
                                  {s.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5">
                                {s.url ? (
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="max-w-[150px] truncate text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors text-xs inline-block"
                                  >
                                    {s.url}
                                  </a>
                                ) : (
                                  <span className="text-[var(--color-text-muted)]">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === "estado" && stats && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: "Municipios registrados", value: stats.totalMunicipios.toLocaleString("es-ES"), color: "var(--color-primary)" },
                    { label: "Capas WMS activas", value: stats.totalCapasActivas.toLocaleString("es-ES"), color: "var(--color-secondary)" },
                    { label: "Entradas de legislación", value: stats.totalLegislacion.toLocaleString("es-ES"), color: "var(--color-accent)" },
                    { label: "Servicios geoespaciales", value: stats.totalGeoServices.toLocaleString("es-ES"), color: "var(--color-success)" },
                    { label: "Fuentes normativas", value: stats.totalLegalSources.toLocaleString("es-ES"), color: "var(--color-info)" },
                  ].map((stat) => (
                    <div key={stat.label} className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] p-5">
                      <p className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</p>
                    </div>
                  ))}
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
