"use client"
import React, { useEffect, useState, useMemo } from 'react'
import type { CapaWMS } from '@/lib/types'

interface ControlCapasProps {
  capasSeleccionadas: string[]
  onToggleCapa: (capaId: string) => void
}

export function ControlCapas({ capasSeleccionadas, onToggleCapa }: ControlCapasProps) {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function cargarCapas() {
      try {
        const res = await fetch('/api/capas-wms')
        const json = await res.json()

        if (json.error) {
          setError(json.error)
          setCargando(false)
          return
        }

        setCapas(json.data || [])

        const groups: Record<string, boolean> = {}
        for (const capa of json.data || []) {
          const nombre = capa.comunidad_autonoma?.nombre || 'Sin comunidad'
          if (!(nombre in groups)) groups[nombre] = true
        }
        setColapsadas(groups)
      } catch {
        setError('Error al cargar capas')
      } finally {
        setCargando(false)
      }
    }
    cargarCapas()
  }, [])

  const agrupadas = useMemo(() => {
    const grouped: Record<string, CapaWMS[]> = {}
    for (const capa of capas) {
      const nombre = capa.comunidad_autonoma?.nombre || 'Sin comunidad'
      if (!grouped[nombre]) grouped[nombre] = []
      grouped[nombre].push(capa)
    }
    const sorted: Record<string, CapaWMS[]> = {}
    for (const k of Object.keys(grouped).sort()) {
      sorted[k] = grouped[k]
    }
    return sorted
  }, [capas])

  function toggleGrupo(nombreCA: string) {
    setColapsadas(prev => ({ ...prev, [nombreCA]: !prev[nombreCA] }))
  }

  function toggleGrupoCompleto(nombreCA: string) {
    const capasGrupo = agrupadas[nombreCA] || []
    const todasActivas = capasGrupo.every(c => capasSeleccionadas.includes(c.id))
    for (const capa of capasGrupo) {
      const estaActiva = capasSeleccionadas.includes(capa.id)
      if (todasActivas && estaActiva) onToggleCapa(capa.id)
      if (!todasActivas && !estaActiva) onToggleCapa(capa.id)
    }
  }

  if (cargando) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        <div className="animate-spin inline-block w-5 h-5 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full mb-2" />
        <p className="text-xs">Cargando capas...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
      </div>
    )
  }

  const totalCapas = capas.length
  const activas = capasSeleccionadas.length

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Capas WMS
        </h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {activas} de {totalCapas} activas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.keys(agrupadas).length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
            <p className="text-xs">No hay capas disponibles</p>
          </div>
        ) : (
          Object.entries(agrupadas).map(([nombreCA, capasGrupo]) => {
            const todasActivas = capasGrupo.every(c => capasSeleccionadas.includes(c.id))
            const algunasActivas = capasGrupo.some(c => capasSeleccionadas.includes(c.id)) && !todasActivas
            const colapsado = colapsadas[nombreCA]

            return (
              <div key={nombreCA} className="border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 px-4 py-2 cursor-pointer select-none hover:bg-[var(--color-input-bg)] transition-colors">
                  <button
                    onClick={() => toggleGrupo(nombreCA)}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                    aria-label={colapsado ? 'Expandir' : 'Colapsar'}
                  >
                    <svg className={`w-3 h-3 transition-transform ${colapsado ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <button
                    onClick={() => toggleGrupoCompleto(nombreCA)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    <div className={`
                      w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors
                      ${todasActivas
                        ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)]'
                        : algunasActivas
                          ? 'bg-[var(--color-secondary)]/30 border-[var(--color-secondary)]'
                          : 'border-[var(--color-border)]'
                      }
                    `}>
                      {(todasActivas || algunasActivas) && (
                        <svg className="w-2.5 h-2.5 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                         </svg>
                       )}
                     </div>
                     <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{nombreCA}</span>
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-secondary)' }}>
                      {capasGrupo.filter(c => capasSeleccionadas.includes(c.id)).length}/{capasGrupo.length}
                    </span>
                  </button>
                </div>

                {!colapsado && (
                  <div className="pb-1">
                    {capasGrupo.map(capa => {
                      const activa = capasSeleccionadas.includes(capa.id)
                      const legendUrl = `${capa.url_servicio}?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${capa.nombre_capa}&format=image/png&width=20&height=20`
                      return (
                        <div
                          key={capa.id}
                          className={`flex items-start gap-2 pl-8 pr-4 py-1.5 cursor-pointer transition-colors ${activa ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-input-bg)]'}`}
                          onClick={() => onToggleCapa(capa.id)}
                        >
                          <div className={`
                            w-3 h-3 mt-0.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                            ${activa
                              ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)]'
                              : 'border-[var(--color-border)]'
                            }
                          `}>
                            {activa && (
                              <svg className="w-2 h-2 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-tight ${activa ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
                              {capa.nombre_capa}
                            </p>
                            {activa && (
                              <img
                                src={legendUrl}
                                alt={`Leyenda: ${capa.nombre_capa}`}
                                className="mt-1 max-h-6"
                                style={{ imageRendering: 'auto' }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
