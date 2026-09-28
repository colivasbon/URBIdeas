"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Badge } from "@/components/ui/Badge"
import PageShell from "@/components/ui/PageShell"
import Breadcrumbs from "@/components/ui/Breadcrumbs"
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
    { key: "fuentes", label: "Fuentes geoportales" },
    { key: "capas", label: "Capas WMS" },
    { key: "geo_services", label: "Servicios geoespaciales" },
    { key: "legal", label: "Fuentes normativas" },
    { key: "estado", label: "Estado del sistema" },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={
              <Breadcrumbs items={[{ label: "SOCideas", href: "/" }, { label: "Administración" }]} />
            }
            title="Panel de administración"
            lede="Gestione fuentes geoportales, capas WMS, servicios geoespaciales y fuentes normativas, y supervise el estado del sistema."
          />

          {/* Pestañas */}
          <div className="tabs mb-6 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "tab shrink-0 whitespace-nowrap focus-visible:rounded-[6px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  tab === t.key
                    ? "font-semibold text-[var(--text-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--conifera)] after:content-['']"
                    : "",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-16" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <span className="text-sm text-[var(--text-secondary)]">Cargando datos…</span>
            </div>
          ) : (
            <>
              {tab === "fuentes" && (
                <AdminTable
                  empty="No hay fuentes geoportales registradas."
                  isEmpty={fuentes.length === 0}
                  minWidth="min-w-[640px]"
                  headers={["Nombre", "URL", "Tipo", "Última actualización", "Activo"]}
                >
                  {fuentes.map((f) => (
                    <tr key={f.id}>
                      <td className="font-medium">{f.nombre}</td>
                      <td>
                        <UrlLink href={f.url} max="max-w-[200px]" />
                      </td>
                      <td>
                        <Badge variant="primary">{f.tipo_servicio}</Badge>
                      </td>
                      <td className="meta tnum">
                        {f.ultima_actualizacion
                          ? new Date(f.ultima_actualizacion).toLocaleDateString("es-ES")
                          : "—"}
                      </td>
                      <td>
                        <Badge variant={f.activo ? "success" : "danger"}>{f.activo ? "Sí" : "No"}</Badge>
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}

              {tab === "capas" && (
                <AdminTable
                  empty="No hay capas WMS registradas."
                  isEmpty={capas.length === 0}
                  minWidth="min-w-[640px]"
                  headers={["Comunidad", "Nombre de la capa", "URL", "Tipo", "Activo"]}
                >
                  {capas.map((c) => (
                    <tr key={c.id}>
                      <td className="meta">{c.comunidad_autonoma?.nombre ?? "—"}</td>
                      <td className="font-medium">{c.nombre_capa}</td>
                      <td>
                        <UrlLink href={c.url_servicio} max="max-w-[180px]" />
                      </td>
                      <td>
                        <Badge variant="secondary">{c.tipo_servicio}</Badge>
                      </td>
                      <td>
                        <Badge variant={c.activo ? "success" : "danger"}>{c.activo ? "Sí" : "No"}</Badge>
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}

              {tab === "geo_services" && (
                <AdminTable
                  empty="No hay servicios geoespaciales registrados."
                  isEmpty={geoServices.length === 0}
                  minWidth="min-w-[760px]"
                  headers={["CCAA", "Servicio", "Tipo", "Estado", "Valor legal", "URL"]}
                >
                  {geoServices.map((s) => (
                    <tr key={s.id}>
                      <td className="meta">{s.ccaa}</td>
                      <td className="font-medium">{s.service_name}</td>
                      <td>
                        <Badge variant="secondary">{s.service_type}</Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            s.endpoint_status === "confirmed"
                              ? "success"
                              : s.endpoint_status === "pending"
                                ? "accent"
                                : "danger"
                          }
                        >
                          {s.endpoint_status}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={legalValueVariant(s.legal_value)}>{s.legal_value}</Badge>
                      </td>
                      <td>
                        <UrlLink href={s.url} max="max-w-[180px]" />
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}

              {tab === "legal" && (
                <AdminTable
                  empty="No hay fuentes normativas registradas."
                  isEmpty={legalSources.length === 0}
                  minWidth="min-w-[820px]"
                  headers={["Territorio", "Nivel", "Nombre", "Tipo", "Valor legal", "Estado", "URL"]}
                >
                  {legalSources.map((s) => (
                    <tr key={s.id}>
                      <td className="meta">{s.territory}</td>
                      <td>
                        <Badge
                          variant={
                            s.level === "estatal" ? "primary" : s.level === "autonomico" ? "secondary" : "accent"
                          }
                        >
                          {s.level}
                        </Badge>
                      </td>
                      <td className="max-w-[300px] truncate font-medium">{s.name}</td>
                      <td className="meta">{s.type?.replace(/_/g, " ")}</td>
                      <td>
                        <Badge variant={legalValueVariant(s.legal_value)}>{s.legal_value}</Badge>
                      </td>
                      <td>
                        <Badge variant={s.status === "vigente" ? "success" : "danger"}>{s.status}</Badge>
                      </td>
                      <td>
                        {s.url ? (
                          <UrlLink href={s.url} max="max-w-[150px]" />
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}

              {tab === "estado" && stats && (
                <dl className="grid grid-cols-1 border-t border-[var(--border-strong)] sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: "Municipios registrados", value: stats.totalMunicipios },
                    { label: "Capas WMS activas", value: stats.totalCapasActivas },
                    { label: "Entradas de legislación", value: stats.totalLegislacion },
                    { label: "Servicios geoespaciales", value: stats.totalGeoServices },
                    { label: "Fuentes normativas", value: stats.totalLegalSources },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col-reverse gap-1 border-b border-[var(--border-subtle)] py-5 sm:pr-6"
                    >
                      <dt className="type-body-sm text-[var(--text-secondary)]">{stat.label}</dt>
                      <dd className="type-h2 tnum text-[var(--text-primary)]">
                        {stat.value.toLocaleString("es-ES")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

function legalValueVariant(value: string) {
  return value === "vinculante" ? "success" : value === "oficial_referencia" ? "primary" : "accent"
}

function AdminTable({
  headers,
  isEmpty,
  empty,
  minWidth,
  children,
}: {
  headers: string[]
  isEmpty: boolean
  empty: string
  minWidth: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {isEmpty ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]">{empty}</p>
      ) : (
        <div className="data-table-wrap">
          <table className={`data-table ${minWidth}`}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UrlLink({ href, max }: { href: string; max: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`link inline-block truncate align-middle text-xs ${max}`}
    >
      {href}
    </a>
  )
}

