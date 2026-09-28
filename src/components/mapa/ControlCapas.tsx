"use client"
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import type { CapaWMS } from '@/lib/types'
import { FAMILIAS, clasificarCapa } from '@/lib/familias'

interface ControlCapasProps {
  capasSeleccionadas: string[]
  onToggleCapa: (capaId: string) => void
  onToggleFamilia?: (familiaId: string, activar: boolean, capaIds: string[]) => void
  filtroCA?: string
  onFiltroCAChange?: (ca: string) => void
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim()
}

function conFamilia(capa: CapaWMS): CapaWMS {
  if (capa.familia) return capa
  const cls = clasificarCapa({ nombre_capa: capa.nombre_capa, layer_title: capa.layer_title, categoria: capa.categoria })
  return { ...capa, familia: cls.familia, severidad: cls.severidad, norma_ref: cls.norma }
}

export function ControlCapas({ capasSeleccionadas, onToggleCapa, onToggleFamilia, filtroCA, onFiltroCAChange }: ControlCapasProps) {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const f of FAMILIAS) init[f.id] = true
    return init
  })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCAInt, setFiltroCAInt] = useState<string>('todas')
  const filtroCAEff = filtroCA ?? filtroCAInt
  const setFiltroCA = onFiltroCAChange ?? setFiltroCAInt

  useEffect(() => {
    async function cargarCapas() {
      try {
        const res = await fetch('/api/capas-wms')
        const json = await res.json()
        if (json.error) { setError(json.error); setCargando(false); return }
        setCapas((json.data || []).map(conFamilia))
      } catch {
        setError('sin respuesta del servidor')
      } finally {
        setCargando(false)
      }
    }
    cargarCapas()
  }, [])

  const comunidades = useMemo(() => {
    const set = new Set<string>()
    for (const c of capas) {
      const n = c.comunidad_autonoma?.nombre
      if (n) set.add(n)
    }
    return [...set].sort()
  }, [capas])

  const agrupadas = useMemo(() => {
    const q = normalizeText(busqueda)
    const result: Record<string, CapaWMS[]> = {}
    for (const f of FAMILIAS) result[f.id] = []
    const seen = new Set<string>()
    for (const capa of capas) {
      const key = `${capa.nombre_capa}|${capa.url_servicio}`
      if (seen.has(key)) continue
      seen.add(key)
      if (filtroCAEff !== 'todas' && capa.comunidad_autonoma?.nombre !== filtroCAEff && !(filtroCAEff === 'Estatal' && capa.estatal)) continue
      if (q && !normalizeText(`${capa.layer_title || ''} ${capa.nombre_capa} ${capa.comunidad_autonoma?.nombre || ''}`).includes(q)) continue
      const fam = capa.familia || 'usos'
      if (!result[fam]) result[fam] = []
      result[fam].push(capa)
    }
    return result
  }, [capas, busqueda, filtroCAEff])

  const toggleGrupo = useCallback((fam: string) => {
    setColapsadas(prev => ({ ...prev, [fam]: !prev[fam] }))
  }, [])

  const toggleFamiliaCompleta = useCallback((fam: string) => {
    const grupo = agrupadas[fam] || []
    const todasActivas = grupo.length > 0 && grupo.every(c => capasSeleccionadas.includes(c.id))
    if (onToggleFamilia) {
      onToggleFamilia(fam, !todasActivas, grupo.map(c => c.id))
      return
    }
    for (const capa of grupo) {
      const activa = capasSeleccionadas.includes(capa.id)
      if (!todasActivas && !activa) onToggleCapa(capa.id)
      if (todasActivas && activa) onToggleCapa(capa.id)
    }
  }, [agrupadas, capasSeleccionadas, onToggleCapa, onToggleFamilia])

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-[var(--text-muted)]" role="status">
        <span className="spinner" aria-hidden="true" />
        Cargando capas por familias…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-[var(--danger-ink)]" role="alert">
          No se pudieron cargar las capas ({error}). Recargue la página para intentarlo de nuevo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Capas por familia</h3>
          <p className="tnum mt-0.5 text-xs text-[var(--text-secondary)]">
            {capasSeleccionadas.length} de {capas.length} activas en {FAMILIAS.length} familias de veto
          </p>
        </div>
        <div className="relative">
          <label htmlFor="capas-busqueda" className="sr-only">Buscar capa</label>
          <input
            id="capas-busqueda"
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar capa"
            className="input pr-10 lg:min-h-[36px]"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              aria-label="Limpiar búsqueda"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div>
          <label htmlFor="capas-filtro-ca" className="field-label">Limitar a</label>
          <select
            id="capas-filtro-ca"
            value={filtroCAEff}
            onChange={(e) => setFiltroCA(e.target.value)}
            className="input lg:min-h-[36px]"
            title="Autoseleccionada a partir del ámbito. «Toda España» solo amplía el listado; el cruce siempre se acota al territorio del recinto."
          >
            <option value="todas">Toda España</option>
            {comunidades.map(ca => <option key={ca} value={ca}>{ca}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {FAMILIAS.map(fam => {
          const grupo = agrupadas[fam.id] || []
          const activas = grupo.filter(c => capasSeleccionadas.includes(c.id)).length
          const todasActivas = grupo.length > 0 && activas === grupo.length
          const colapsado = busqueda ? false : (colapsadas[fam.id] ?? true)
          return (
            <div key={fam.id} className="border-b border-[var(--border-subtle)]">
              <div className="flex min-h-[44px] items-center gap-1 pr-3 pl-1">
                <button
                  type="button"
                  onClick={() => toggleGrupo(fam.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                  aria-label={colapsado ? `Expandir ${fam.titulo}` : `Colapsar ${fam.titulo}`}
                  aria-expanded={!colapsado}
                >
                  <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${colapsado ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFamiliaCompleta(fam.id)}
                  className="flex min-h-[40px] min-w-0 flex-1 items-center gap-3 rounded-[6px] text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                  title={todasActivas ? 'Desactivar familia' : 'Activar familia'}
                  aria-pressed={todasActivas}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{fam.titulo}</span>
                  <span className="tnum text-xs text-[var(--text-muted)]">{activas}/{grupo.length}</span>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${todasActivas ? 'bg-[var(--musgo)]' : activas > 0 ? 'bg-[var(--musgo-300)]' : 'bg-[var(--limo)]'}`}
                  >
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--hueso)] transition-[left] ${todasActivas ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                </button>
              </div>
              {!colapsado && (
                <div className="pb-2">
                  {grupo.length === 0 && (
                    <p className="py-2 pr-4 pl-10 text-xs text-[var(--text-muted)]">Sin capas en esta familia para el filtro actual.</p>
                  )}
                  {grupo.map(capa => {
                    const activa = capasSeleccionadas.includes(capa.id)
                    const severidad = capa.severidad === 'veto' ? 'Veto' : capa.severidad === 'condicionante' ? 'Condicionante' : 'Informativo'
                    const meta = [capa.norma_ref, capa.comunidad_autonoma?.nombre].filter(Boolean).join(' · ')
                    return (
                      <label
                        key={capa.id}
                        className={`flex min-h-[44px] cursor-pointer items-start gap-3 py-2 pr-4 pl-10 transition-colors hover:bg-[var(--bg-surface-sunken)] ${activa ? 'bg-[var(--bg-surface-sunken)]' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={activa}
                          onChange={() => onToggleCapa(capa.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--musgo)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13px] leading-snug ${activa ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                            {capa.layer_title || capa.nombre_capa}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] leading-snug text-[var(--text-muted)]">
                            <span className={capa.severidad === 'veto' ? 'text-[var(--danger-ink)]' : undefined}>{severidad}</span>
                            {meta && ` · ${meta}`}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
