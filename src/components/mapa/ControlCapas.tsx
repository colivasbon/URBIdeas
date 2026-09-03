"use client"
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import type { CapaWMS } from '@/lib/types'
import { FAMILIAS, clasificarCapa } from '@/lib/familias'

interface ControlCapasProps {
  capasSeleccionadas: string[]
  onToggleCapa: (capaId: string) => void
  onToggleFamilia?: (familiaId: string, activar: boolean, capaIds: string[]) => void
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

export function ControlCapas({ capasSeleccionadas, onToggleCapa, onToggleFamilia }: ControlCapasProps) {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const f of FAMILIAS) init[f.id] = true
    return init
  })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCA, setFiltroCA] = useState<string>('todas')

  useEffect(() => {
    async function cargarCapas() {
      try {
        const res = await fetch('/api/capas-wms')
        const json = await res.json()
        if (json.error) { setError(json.error); setCargando(false); return }
        setCapas((json.data || []).map(conFamilia))
      } catch {
        setError('Error al cargar capas')
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
      if (filtroCA !== 'todas' && capa.comunidad_autonoma?.nombre !== filtroCA) continue
      if (q && !normalizeText(`${capa.layer_title || ''} ${capa.nombre_capa} ${capa.comunidad_autonoma?.nombre || ''}`).includes(q)) continue
      const fam = capa.familia || 'usos'
      if (!result[fam]) result[fam] = []
      result[fam].push(capa)
    }
    return result
  }, [capas, busqueda, filtroCA])

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
      <div className="p-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        <div className="animate-spin inline-block w-5 h-5 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full mb-2" />
        <p className="text-xs">Cargando capas por familias…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs" style={{ color: 'var(--color-error-light)' }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Capas por familia</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {capasSeleccionadas.length} de {capas.length} activas · 9 familias de veto
        </p>
      </div>

      <div className="px-3 py-2 border-b border-[var(--color-border)] flex flex-col gap-2">
        <div className="relative">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar capa…"
            className="w-full pl-3 pr-7 py-1.5 text-xs rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" aria-label="Limpiar búsqueda">✕</button>
          )}
        </div>
        <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="shrink-0">Limitar a:</span>
          <select
            value={filtroCA}
            onChange={(e) => setFiltroCA(e.target.value)}
            className="flex-1 min-w-0 text-xs rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] px-2 py-1"
          >
            <option value="todas">Toda España</option>
            {comunidades.map(ca => <option key={ca} value={ca}>{ca}</option>)}
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {FAMILIAS.map(fam => {
          const grupo = agrupadas[fam.id] || []
          const activas = grupo.filter(c => capasSeleccionadas.includes(c.id)).length
          const todasActivas = grupo.length > 0 && activas === grupo.length
          const colapsado = busqueda ? false : (colapsadas[fam.id] ?? true)
          return (
            <div key={fam.id} className="border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-input-bg)] transition-colors">
                <button onClick={() => toggleGrupo(fam.id)} className="text-[var(--color-text-secondary)]" aria-label={colapsado ? 'Expandir' : 'Colapsar'}>
                  <svg className={`w-3 h-3 transition-transform ${colapsado ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={() => toggleFamiliaCompleta(fam.id)} className="flex items-center gap-2 flex-1 text-left min-w-0" title={todasActivas ? 'Desactivar familia' : 'Activar familia'}>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] tabular-nums w-5">{fam.orden}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-[var(--color-text-primary)] truncate">{fam.titulo}</span>
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{activas}/{grupo.length}</span>
                  <span className={`relative inline-flex w-7 h-4 rounded-full transition-colors ${todasActivas ? 'bg-[var(--color-secondary)]' : activas > 0 ? 'bg-[var(--color-secondary)]/40' : 'bg-[var(--color-border)]'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${todasActivas ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                </button>
              </div>
              {!colapsado && (
                <div className="pb-1">
                  {grupo.length === 0 && (
                    <p className="px-8 py-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Sin capas en esta familia para el filtro actual.</p>
                  )}
                  {grupo.map(capa => {
                    const activa = capasSeleccionadas.includes(capa.id)
                    return (
                      <div key={capa.id} onClick={() => onToggleCapa(capa.id)}
                        className={`flex items-start gap-2 pl-8 pr-3 py-1.5 cursor-pointer ${activa ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-input-bg)]'}`}>
                        <div className={`w-3 h-3 mt-0.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${activa ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)]' : 'border-[var(--color-border)]'}`}>
                          {activa && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-tight truncate ${activa ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
                            {capa.layer_title || capa.nombre_capa}
                          </p>
                          <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {capa.severidad === 'veto' ? '● veto' : capa.severidad === 'condicionante' ? '● condicionante' : '● informativo'}
                            {' · '}{capa.norma_ref || ''} · {capa.comunidad_autonoma?.nombre || ''}
                          </p>
                        </div>
                      </div>
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
