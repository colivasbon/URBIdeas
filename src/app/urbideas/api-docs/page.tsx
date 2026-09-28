"use client"

import UrbideasHeader from "@/components/platform/UrbideasHeader"
import PlatformFooter from "@/components/platform/PlatformFooter"
import PageShell from "@/components/ui/PageShell"
import Breadcrumbs from "@/components/ui/Breadcrumbs"
import { Badge } from "@/components/ui/Badge"

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  description: string
  params?: { name: string; type: string; required: boolean; description: string }[]
  example: string
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/municipios",
    description: "Listar municipios con información de provincia, CCAA e instrumentos de planeamiento.",
    params: [
      { name: "comunidad_autonoma_id", type: "string", required: false, description: "Filtrar por comunidad autónoma" },
      { name: "provincia_id", type: "string", required: false, description: "Filtrar por provincia" },
      { name: "search", type: "string", required: false, description: "Buscar por nombre (parcial)" },
      { name: "limit", type: "number", required: false, description: "Número de resultados (máx. 200, por defecto 50)" },
      { name: "offset", type: "number", required: false, description: "Desplazamiento para paginación" },
    ],
    example: `{
  "data": [
    {
      "id": 1,
      "nombre": "Madrid",
      "codigo_ine": "28079",
      "provincia": {
        "nombre": "Madrid",
        "comunidad_autonoma": { "nombre": "Comunidad de Madrid" }
      },
      "instrumentos_planeamiento": [...]
    }
  ],
  "error": null,
  "count": 8131
}`,
  },
  {
    method: "GET",
    path: "/api/municipios/[id]",
    description: "Detalle completo de un municipio específico con todos sus instrumentos de planeamiento.",
    params: [
      { name: "id", type: "string", required: true, description: "ID del municipio" },
    ],
    example: `{
  "data": {
    "id": 1,
    "nombre": "Madrid",
    "codigo_ine": "28079",
    "poblacion": 3223334,
    "provincia": { "nombre": "Madrid" },
    "instrumentos_planeamiento": [
      {
        "tipo": "PGOU",
        "estado": "vigente",
        "fecha_aprobacion_definitiva": "2019-07-15"
      }
    ]
  },
  "error": null
}`,
  },
  {
    method: "GET",
    path: "/api/busqueda",
    description: "Búsqueda libre de municipios por nombre.",
    params: [
      { name: "q", type: "string", required: true, description: "Texto de búsqueda" },
    ],
    example: `{
  "data": [
    { "id": 45, "nombre": "Barcelona", "codigo_ine": "08019" },
    { "id": 892, "nombre": "Barceloneta", "codigo_ine": "07009" }
  ],
  "error": null
}`,
  },
  {
    method: "GET",
    path: "/api/planeamiento",
    description: "Instrumentos de planeamiento urbanístico filtrables por municipio.",
    params: [
      { name: "municipio_ids", type: "string", required: false, description: "IDs de municipios separados por comas" },
    ],
    example: `{
  "data": [
    {
      "id": 101,
      "tipo": "PGOU",
      "estado": "vigente",
      "municipio": { "nombre": "Sevilla" }
    }
  ],
  "error": null
}`,
  },
  {
    method: "GET",
    path: "/api/legislacion",
    description: "Legislación urbanística vigente, filtrable por ámbito (estatal o autonómico).",
    params: [
      { name: "ambito", type: "string", required: false, description: "\"estatal\" o \"autonomico\"" },
    ],
    example: `{
  "data": [
    {
      "id": 1,
      "titulo": "RDL 7/2015 - Texto Refundido de la Ley de Suelo",
      "referencia_legal": "RDL 7/2015",
      "estado_vigencia": "vigente",
      "ambito": "estatal"
    }
  ],
  "error": null
}`,
  },
  {
    method: "GET",
    path: "/api/capas-wms",
    description: "Capas WMS/WFS disponibles en el sistema, agrupadas por comunidad autónoma.",
    params: [],
    example: `{
  "data": [
    {
      "id": 1,
      "nombre_capa": "Planeamiento Urbanístico",
      "url_servicio": "https://...",
      "tipo_servicio": "WMS",
      "sistema_referencia": "EPSG:25830",
      "comunidad_autonoma": { "nombre": "Andalucía" }
    }
  ],
  "error": null
}`,
  },
  {
    method: "GET",
    path: "/api/export",
    description: "Exportar datos del registro en formato CSV o JSON.",
    params: [
      { name: "format", type: "string", required: false, description: "\"csv\" o \"json\" (por defecto csv)" },
    ],
    example: `// Respuesta con Content-Type: text/csv
// Cabecera: id,nombre,codigo_ine,provincia,ccaa,tipo_planeamiento,estado
// 1,Madrid,28079,Madrid,Comunidad de Madrid,PGOU,vigente`,
  },
]

// Método → variante de estado del sistema (hoy solo hay GET).
const methodVariant: Record<Endpoint["method"], "primary" | "success" | "accent" | "danger"> = {
  GET: "primary",
  POST: "success",
  PUT: "accent",
  DELETE: "danger",
}

const anchor = (path: string) =>
  "ep-" + path.replace(/^\/api\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "")

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)]">
      <UrbideasHeader />

      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16 lg:pb-24">
          <PageShell
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "SOCideas", href: "/" },
                  { label: "URBideas", href: "/urbideas" },
                  { label: "API" },
                ]}
              />
            }
            title="API REST de URBideas"
            lede="Consulte desde sus herramientas el registro de planeamiento urbanístico de España: municipios, instrumentos, legislación y capas WMS. Todas las respuestas se devuelven en JSON."
          />

          <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-16">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Acceso</h2>
              <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                Acceso público, sin autenticación. Límite de{" "}
                <span className="font-semibold text-[var(--text-primary)]">100 peticiones por minuto</span> por
                dirección IP.
              </p>

              <h2 className="mt-8 text-sm font-semibold text-[var(--text-primary)]">Endpoints</h2>
              <nav aria-label="Índice de endpoints" className="mt-2">
                <ul className="border-t border-[var(--border-subtle)]">
                  {endpoints.map((ep) => (
                    <li key={ep.path} className="border-b border-[var(--border-subtle)]">
                      <a
                        href={`#${anchor(ep.path)}`}
                        className="flex min-h-[44px] items-center gap-3 rounded-[6px] py-2 text-sm text-[var(--text-link)] hover:text-[var(--text-link-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                      >
                        <span className="w-10 shrink-0 text-xs font-semibold text-[var(--text-muted)]">{ep.method}</span>
                        <code className="min-w-0 break-all font-mono text-[13px]">{ep.path}</code>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <div className="min-w-0">
              {endpoints.map((ep, i) => (
                <section
                  key={ep.path}
                  id={anchor(ep.path)}
                  aria-labelledby={`${anchor(ep.path)}-t`}
                  className={["scroll-mt-24 pb-10", i === 0 ? "" : "border-t border-[var(--border-subtle)] pt-10"].join(" ")}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={methodVariant[ep.method]}>{ep.method}</Badge>
                    <h3 id={`${anchor(ep.path)}-t`} className="min-w-0 break-all">
                      <code className="font-mono text-base font-semibold text-[var(--text-primary)]">{ep.path}</code>
                    </h3>
                  </div>
                  <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                    {ep.description}
                  </p>

                  {ep.params && ep.params.length > 0 ? (
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">Parámetros</h4>
                      <div className="data-table-wrap mt-3 rounded-[6px] border border-[var(--border-subtle)]">
                        <table className="data-table min-w-[520px]">
                          <thead>
                            <tr>
                              <th scope="col">Nombre</th>
                              <th scope="col">Tipo</th>
                              <th scope="col">Obligatorio</th>
                              <th scope="col">Descripción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p) => (
                              <tr key={p.name}>
                                <td>
                                  <code className="font-mono text-[13px] text-[var(--text-primary)]">{p.name}</code>
                                </td>
                                <td className="meta">{p.type}</td>
                                <td className={p.required ? "font-medium" : "meta"}>{p.required ? "Sí" : "No"}</td>
                                <td className="meta">{p.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-6 text-sm text-[var(--text-muted)]">Sin parámetros.</p>
                  )}

                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Ejemplo de respuesta</h4>
                    <pre className="mt-3 overflow-x-auto rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] p-4 font-mono text-[13px] leading-relaxed text-[var(--text-primary)]">
                      <code>{ep.example}</code>
                    </pre>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  )
}
