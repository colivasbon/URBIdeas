"use client"

import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
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

const methodColors: Record<string, string> = {
  GET: "bg-green-600",
  POST: "bg-blue-600",
  PUT: "bg-yellow-600",
  DELETE: "bg-red-600",
}

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-10">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              API REST — Registro Urbanístico España
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              API pública para consulta del registro de planeamiento urbanístico de España.
              Todas las respuestas están en formato JSON.
            </p>
          </section>

          <Card className="mb-8">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--border-radius)] bg-[var(--color-accent)]">
                <svg className="h-4 w-4 text-[var(--color-dark-bg)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white">Autenticación y rate limiting</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  La API es de acceso público sin autenticación. Se aplica un límite de{" "}
                  <span className="font-medium text-[var(--color-accent)]">100 peticiones por minuto</span>{" "}
                  por dirección IP. Las cabeceras <code className="rounded bg-[var(--color-input-bg)] px-1.5 py-0.5 text-xs text-[var(--color-secondary)]">X-RateLimit-Limit</code>{" "}
                  y <code className="rounded bg-[var(--color-input-bg)] px-1.5 py-0.5 text-xs text-[var(--color-secondary)]">X-RateLimit-Remaining</code>{" "}
                  se incluyen en cada respuesta.
                </p>
              </div>
            </div>
          </Card>

          <section className="flex flex-col gap-4">
            {endpoints.map((ep) => (
              <Card key={ep.path} className="overflow-hidden">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-[var(--border-radius)] px-2.5 py-1 text-xs font-bold text-white ${methodColors[ep.method]}`}
                    >
                      {ep.method}
                    </span>
                    <code className="text-sm font-semibold text-[var(--color-accent)]">
                      {ep.path}
                    </code>
                  </div>

                  <p className="text-sm text-[var(--color-text-secondary)]">{ep.description}</p>

                  {ep.params && ep.params.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                        Parámetros
                      </p>
                      <div className="overflow-x-auto rounded-[var(--border-radius)] border border-[var(--color-border)]">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--color-border)] bg-[var(--color-input-bg)]">
                              <th className="px-3 py-2 text-left font-semibold text-white">Nombre</th>
                              <th className="px-3 py-2 text-left font-semibold text-white">Tipo</th>
                              <th className="px-3 py-2 text-left font-semibold text-white">Obligatorio</th>
                              <th className="px-3 py-2 text-left font-semibold text-white">Descripción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p) => (
                              <tr key={p.name} className="border-b border-[var(--color-border)] last:border-b-0">
                                <td className="px-3 py-2">
                                  <code className="text-xs text-[var(--color-secondary)]">{p.name}</code>
                                </td>
                                <td className="px-3 py-2 text-[var(--color-text-secondary)]">{p.type}</td>
                                <td className="px-3 py-2">
                                  <Badge variant={p.required ? "accent" : "primary"}>
                                    {p.required ? "Sí" : "No"}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-[var(--color-text-secondary)]">{p.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                      Ejemplo de respuesta
                    </p>
                    <pre className="overflow-x-auto rounded-[var(--border-radius)] bg-[var(--color-input-bg)] p-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      <code>{ep.example}</code>
                    </pre>
                  </div>
                </div>
              </Card>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
