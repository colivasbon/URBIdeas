"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { supabase } from "@/lib/supabase"

interface CapaWMS {
  id: string
  nombre_capa: string
  url_servicio: string
  tipo_servicio: string
  sistema_referencia: string
  comunidad_autonoma_id: string
  activo: boolean
  comunidad_autonoma?: { nombre: string } | null
}

export default function MapaPage() {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [activeCapas, setActiveCapas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCapas() {
      setLoading(true)
      const { data, error } = await supabase
        .from("capas_wms")
        .select(`
          id,
          nombre_capa,
          url_servicio,
          tipo_servicio,
          sistema_referencia,
          comunidad_autonoma_id,
          activo,
          comunidad_autonoma:comunidades_autonomas(nombre)
        `)
        .eq("activo", true)
        .order("nombre_capa")

      if (!error && data) {
        const mapped = data.map((c) => ({
          ...c,
          comunidad_autonoma: Array.isArray(c.comunidad_autonoma)
            ? c.comunidad_autonoma[0]
            : c.comunidad_autonoma,
        }))
        setCapas(mapped)
      }
      setLoading(false)
    }
    fetchCapas()
  }, [])

  function toggleCapa(id: string) {
    setActiveCapas((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const selectedCapas = capas.filter((c) => activeCapas.includes(c.id))

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              Visor de Mapa
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Explora las capas WMS disponibles y visualiza el planeamiento urbanístico sobre el mapa.
            </p>
          </section>

          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 min-h-[500px]">
              <Card padding={false} className="h-full overflow-hidden">
                <div className="relative flex h-full min-h-[500px] items-center justify-center bg-[var(--color-input-bg)]">
                  {selectedCapas.length === 0 ? (
                    <div className="text-center">
                      <svg
                        className="mx-auto h-16 w-16 text-[var(--color-border)]"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                        />
                      </svg>
                      <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        Selecciona una o más capas en el panel lateral para visualizarlas en el mapa.
                      </p>
                    </div>
                  ) : (
                    <div className="absolute inset-0">
                      <iframe
                        title="Visor WMS"
                        className="h-full w-full border-0"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=-9.5,35.8,4.5,44.0&layer=mapnik`}
                        allowFullScreen
                      />
                      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5">
                        {selectedCapas.map((capa) => (
                          <span
                            key={capa.id}
                            className="inline-flex items-center gap-1 rounded-[var(--border-radius)] bg-[var(--color-dark-bg)]/90 px-2 py-1 text-xs font-medium text-[var(--color-secondary)] backdrop-blur"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-secondary)]" />
                            {capa.nombre_capa}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div className="w-full shrink-0 lg:w-80">
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle>Capas WMS</CardTitle>
                </CardHeader>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                    <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                      Cargando capas...
                    </span>
                  </div>
                ) : capas.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
                    No hay capas WMS activas disponibles.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto pr-1">
                    {capas.map((capa) => {
                      const ccaa = capa.comunidad_autonoma?.nombre ?? "Sin CCAA"
                      return (
                        <label
                          key={capa.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-[var(--border-radius)] px-3 py-2.5 transition-colors ${
                            activeCapas.includes(capa.id)
                              ? "bg-[var(--color-primary)]/20 border border-[var(--color-primary)]"
                              : "hover:bg-[var(--color-input-bg)] border border-transparent"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={activeCapas.includes(capa.id)}
                            onChange={() => toggleCapa(capa.id)}
                            className="mt-0.5 accent-[var(--color-secondary)]"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">
                              {capa.nombre_capa}
                            </span>
                            <span className="text-xs text-[var(--color-text-secondary)]">
                              {ccaa} · {capa.tipo_servicio}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}

                {activeCapas.length > 0 && (
                  <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {activeCapas.length} capa{activeCapas.length !== 1 ? "s" : ""} activa{activeCapas.length !== 1 ? "s" : ""}
                    </p>
                    <button
                      onClick={() => setActiveCapas([])}
                      className="mt-2 text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors"
                    >
                      Desactivar todas
                    </button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
