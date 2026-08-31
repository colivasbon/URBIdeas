"use client"

import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { ControlCapas } from "@/components/mapa/ControlCapas"
import type { CapaWMS } from "@/lib/types"

const VisorMapa = dynamic(() => import("@/components/mapa/VisorMapa"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[500px] items-center justify-center bg-[var(--color-input-bg)]">
      <div className="text-center">
        <div className="animate-spin inline-block w-8 h-8 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">Cargando mapa...</p>
      </div>
    </div>
  ),
})

export default function MapaPage() {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [activeCapas, setActiveCapas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCapas() {
      try {
        const res = await fetch("/api/capas-wms")
        const json = await res.json()
        if (!json.error && json.data) {
          setCapas(json.data)
        }
      } catch {
        // Error silently ignored
      } finally {
        setLoading(false)
      }
    }
    fetchCapas()
  }, [])

  const toggleCapa = useCallback((id: string) => {
    setActiveCapas(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }, [])

  const selectedCapas = capas
    .filter(c => activeCapas.includes(c.id))
    .map(c => ({
      id: c.id,
      nombre_capa: c.nombre_capa,
      url_servicio: c.url_servicio,
      formato_soportado: c.formato_soportado || "image/png",
    }))

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
              <div className="h-full overflow-hidden rounded-[var(--border-radius)] border border-[var(--color-border)]">
                <VisorMapa capasActivas={selectedCapas} />
              </div>
            </div>

            <div className="w-full shrink-0 lg:w-80">
              <div className="sticky top-20 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] overflow-hidden" style={{ maxHeight: 'calc(100vh - 120px)' }}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                    <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                      Cargando capas...
                    </span>
                  </div>
                ) : (
                  <ControlCapas
                    capasSeleccionadas={activeCapas}
                    onToggleCapa={toggleCapa}
                  />
                )}

                {activeCapas.length > 0 && (
                  <div className="px-4 py-3 border-t border-[var(--color-border)]">
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
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
