"use client"

import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
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

const methodStyles: Record<string, string> = {
  GET: "bg-[var(--color-success)]/15 text-[var(--color-success-light)]",
  POST: "bg-[var(--color-info)]/15 text-[var(--color-info)]",
  PUT: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  DELETE: "bg-[var(--color-error)]/15 text-[var(--color-error-light)]",
}

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Page header */}
          <section className="mb-6 border-b border-[var(--color-border-subtle)] pb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)] mb-2">
              Desarrolladores
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
              API REST
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-muted)]">
              API pública para consulta del registro de planeamiento urbanístico de España.
              Todas las respuestas están en formato JSON.
            </p>
          </section>

          {/* Rate limiting notice */}
          <div className="border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 rounded-[var(--border-radius-lg)] p-4 mb-6">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Autenticación y rate limiting</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">
              La API es de acceso público sin autenticación. Se aplica un límite de{" "}
              <span className="font-medium text-[var(--color-accent)]">100 peticiones por minuto</span>{" "}
              por dirección IP.
            </p>
          </div>

          {/* Endpoints */}
          <section className="flex flex-col gap-4">
            {endpoints.map((ep) => (
              <div key={ep.path} className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center rounded-[var(--border-radius)] px-2 py-0.5 text-[11px] font-bold ${methodStyles[ep.method]}`}>
                      {ep.method}
                    </span>
                    <code className="text-sm font-semibold text-[var(--color-text-primary)] font-mono">
                      {ep.path}
                    </code>
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)] leading-relaxed">{ep.description}</p>
                </div>

                <div className="px-5 py-4">
                  {ep.params && ep.params.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Parámetros
                      </p>
                      <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] overflow-hidden">
                        <table className="w-full text-sm min-w-[500px]">
                          <thead>
                            <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]">
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Nombre</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Obligatorio</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Descripción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p) => (
                              <tr key={p.name} className="border-b border-[var(--color-border-subtle)] last:border-b-0 transition-colors hover:bg-[var(--color-card-bg)]">
                                <td className="px-3 py-2">
                                  <code className="text-xs text-[var(--color-secondary)] font-mono">{p.name}</code>
                                </td>
                                <td className="px-3 py-2 text-[var(--color-text-secondary)] text-xs">{p.type}</td>
                                <td className="px-3 py-2">
                                  <Badge variant={p.required ? "accent" : "muted"}>
                                    {p.required ? "Sí" : "No"}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-[var(--color-text-secondary)] text-xs">{p.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Ejemplo de respuesta
                    </p>
                    <pre className="overflow-x-auto rounded-[var(--border-radius)] bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] p-4 text-xs leading-relaxed text-[var(--color-text-muted)] font-mono">
                      <code>{ep.example}</code>
                    </pre>
                  </div>
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
