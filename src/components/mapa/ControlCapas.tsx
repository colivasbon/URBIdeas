"use client"
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import type { CapaWMS } from '@/lib/types'

interface ControlCapasProps {
  capasSeleccionadas: string[]
  onToggleCapa: (capaId: string) => void
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim()
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const normalized = normalizeText(text)
  const normalizedQuery = normalizeText(query)
  const idx = normalized.indexOf(normalizedQuery)
  if (idx === -1) return text
  return (
    <>
      {text.substring(0, idx)}
      <span style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>
        {text.substring(idx, idx + query.length)}
      </span>
      {text.substring(idx + query.length)}
    </>
  )
}

export function ControlCapas({ capasSeleccionadas, onToggleCapa }: ControlCapasProps) {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)

  const categorias = [
    { key: null, label: 'Todas' },
    { key: 'planeamiento_general', label: 'Planeamiento' },
    { key: 'clasificacion_suelo', label: 'Clasificación suelo' },
    { key: 'calificacion_urbanistica', label: 'Calificación urbanística' },
    { key: 'siose', label: 'SIOSE' },
    { key: 'ocupacion_suelo', label: 'Ocupación suelo' },
    { key: 'clase_suelo', label: 'Clase suelo' },
    { key: 'categoria_suelo', label: 'Categoría suelo' },
    { key: 'usos_suelo', label: 'Usos suelo' },
    { key: 'sector', label: 'Sectores' },
    { key: 'ambito', label: 'Ámbitos' },
    { key: 'unidad_actuacion', label: 'Unidades actuación' },
    { key: 'infraestructuras', label: 'Infraestructuras' },
    { key: 'medio_ambiente', label: 'Medio ambiente' },
  ]

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
          const ca = capa.comunidad_autonoma
          const nombre = Array.isArray(ca) ? ca[0]?.nombre : ca?.nombre
          const key = nombre || 'Sin comunidad'
          if (!(key in groups)) groups[key] = true
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
    const deduped: CapaWMS[] = []
    const seen = new Set<string>()
    for (const capa of capas) {
      const key = `${capa.nombre_capa}|${capa.url_servicio}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(capa)
    }

    const grouped: Record<string, CapaWMS[]> = {}
    for (const capa of deduped) {
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

  const agrupadasFiltradas = useMemo(() => {
    const hasBusqueda = busqueda.trim().length > 0
    const hasCategoria = categoriaActiva !== null
    if (!hasBusqueda && !hasCategoria) return agrupadas
    const q = hasBusqueda ? normalizeText(busqueda) : ''
    const result: Record<string, CapaWMS[]> = {}
    for (const [nombreCA, capasGrupo] of Object.entries(agrupadas)) {
      if (hasBusqueda && normalizeText(nombreCA).includes(q)) {
        result[nombreCA] = hasCategoria
          ? capasGrupo.filter(c => c.categoria === categoriaActiva)
          : capasGrupo
      } else {
        const filtered = capasGrupo.filter(c => {
          const matchBusqueda = !hasBusqueda || normalizeText(c.nombre_capa).includes(q)
          const matchCategoria = !hasCategoria || c.categoria === categoriaActiva
          return matchBusqueda && matchCategoria
        })
        if (filtered.length > 0) result[nombreCA] = filtered
      }
    }
    return result
  }, [agrupadas, busqueda, categoriaActiva])

  const colapsadasConBusqueda = useMemo(() => {
    if (!busqueda.trim() && categoriaActiva === null) return colapsadas
    const next = { ...colapsadas }
    for (const nombreCA of Object.keys(agrupadasFiltradas)) {
      next[nombreCA] = false
    }
    return next
  }, [colapsadas, busqueda, categoriaActiva, agrupadasFiltradas])

  const toggleGrupo = useCallback((nombreCA: string) => {
    setColapsadas(prev => ({ ...prev, [nombreCA]: !prev[nombreCA] }))
  }, [])

  const toggleGrupoCompleto = useCallback((nombreCA: string) => {
    const capasGrupo = agrupadas[nombreCA] || []
    const todasActivas = capasGrupo.every(c => capasSeleccionadas.includes(c.id))
    for (const capa of capasGrupo) {
      const estaActiva = capasSeleccionadas.includes(capa.id)
      if (todasActivas && estaActiva) onToggleCapa(capa.id)
      if (!todasActivas && !estaActiva) onToggleCapa(capa.id)
    }
  }, [agrupadas, capasSeleccionadas, onToggleCapa])

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

      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--color-text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar capa o comunidad..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex flex-wrap gap-1">
          {categorias.map(cat => (
            <button
              key={cat.key ?? 'all'}
              onClick={() => setCategoriaActiva(cat.key)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                categoriaActiva === cat.key
                  ? 'bg-[var(--color-secondary)] text-white border-[var(--color-secondary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.keys(agrupadasFiltradas).length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
            <p className="text-xs">
              {busqueda
                ? `No se encontraron capas para "${busqueda}"`
                : "No hay capas disponibles"
              }
            </p>
          </div>
        ) : (
          Object.entries(agrupadasFiltradas).map(([nombreCA, capasGrupo]) => {
            const todasActivas = capasGrupo.every(c => capasSeleccionadas.includes(c.id))
            const algunasActivas = capasGrupo.some(c => capasSeleccionadas.includes(c.id)) && !todasActivas
            const colapsado = colapsadasConBusqueda[nombreCA]

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
                     <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                       {busqueda ? highlightMatch(nombreCA, busqueda) : nombreCA}
                     </span>
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
                              {busqueda ? highlightMatch(capa.nombre_capa, busqueda) : capa.nombre_capa}
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
