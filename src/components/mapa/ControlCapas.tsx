"use client"
import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CapaWMS, ComunidadAutonoma } from '@/lib/types'

interface CapaConComunidad extends CapaWMS {
  comunidad_autonoma?: ComunidadAutonoma
}

interface ControlCapasProps {
  capasSeleccionadas: string[]
  onToggleCapa: (capaId: string) => void
}

export function ControlCapas({ capasSeleccionadas, onToggleCapa }: ControlCapasProps) {
  const [capas, setCapas] = useState<CapaConComunidad[]>([])
  const [agrupadas, setAgrupadas] = useState<Record<string, CapaConComunidad[]>>({})
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>({})
  const [leyendas, setLeyendas] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargarCapas() {
      const { data, error } = await supabase
        .from('capas_wms')
        .select('*, comunidad_autonoma:comunidades_autonomas(*)')
        .eq('activo', true)
        .order('nombre_capa')

      if (error || !data) {
        setCargando(false)
        return
      }

      const grouped: Record<string, CapaConComunidad[]> = {}
      for (const capa of data) {
        const ca = capa.comunidad_autonoma
        const nombreCA = ca?.nombre || 'Sin comunidad'
        if (!grouped[nombreCA]) grouped[nombreCA] = []
        grouped[nombreCA].push(capa)
      }

      const sortedKeys = Object.keys(grouped).sort()
      const sorted: Record<string, CapaConComunidad[]> = {}
      for (const k of sortedKeys) {
        sorted[k] = grouped[k]
      }

      setCapas(data)
      setAgrupadas(sorted)
      setColapsadas(
        Object.fromEntries(sortedKeys.map(k => [k, true]))
      )
      setCargando(false)
    }

    cargarCapas()
  }, [])

  useEffect(() => {
    for (const capa of capas) {
      if (leyendas[capa.id]) continue
      const legendUrl = `${capa.url_servicio}?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${capa.nombre_capa}&format=image/png&width=20&height=20`
      setLeyendas(prev => ({ ...prev, [capa.id]: legendUrl }))
    }
  }, [capas, leyendas])

  function toggleGrupo(nombreCA: string) {
    setColapsadas(prev => ({ ...prev, [nombreCA]: !prev[nombreCA] }))
  }

  function toggleGrupoCompleto(nombreCA: string) {
    const capasGrupo = agrupadas[nombreCA] || []
    const todasActivas = capasGrupo.every(c => capasSeleccionadas.includes(c.id))
    for (const capa of capasGrupo) {
      if (todasActivas) {
        if (capasSeleccionadas.includes(capa.id)) {
          onToggleCapa(capa.id)
        }
      } else {
        if (!capasSeleccionadas.includes(capa.id)) {
          onToggleCapa(capa.id)
        }
      }
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

  const totalCapas = capas.length
  const activas = capasSeleccionadas.length

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
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
        {Object.entries(agrupadas).length === 0 ? (
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
                    className="text-[var(--color-text-secondary)] hover:text-white transition-colors"
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
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-medium text-white truncate">{nombreCA}</span>
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-secondary)' }}>
                      {capasGrupo.filter(c => capasSeleccionadas.includes(c.id)).length}/{capasGrupo.length}
                    </span>
                  </button>
                </div>

                {!colapsado && (
                  <div className="pb-1">
                    {capasGrupo.map(capa => {
                      const activa = capasSeleccionadas.includes(capa.id)
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
                              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-tight ${activa ? 'text-white font-medium' : 'text-[var(--color-text-secondary)]'}`}>
                              {capa.nombre_capa}
                            </p>
                            {leyendas[capa.id] && activa && (
                              <img
                                src={leyendas[capa.id]}
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
