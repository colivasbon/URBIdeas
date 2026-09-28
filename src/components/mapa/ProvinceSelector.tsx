"use client"

import { useState, useEffect, useMemo } from 'react'

interface ProvinceData {
  name: string
  ccaa: string
  filename: string
  features: number
  size: number
}

interface ProvinceSelectorProps {
  onToggle: (provinceCode: string) => void
  selectedProvinces: string[]
}

export function ProvinceSelector({ onToggle, selectedProvinces }: ProvinceSelectorProps) {
  const [manifest, setManifest] = useState<Record<string, ProvinceData>>({})
  const [loading, setLoading] = useState(true)
  const [expandedCCAA, setExpandedCCAA] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/data/soil/manifest.json')
      .then(res => res.json())
      .then(data => {
        setManifest(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const groups: Record<string, { code: string; data: ProvinceData }[]> = {}
    for (const [code, data] of Object.entries(manifest)) {
      if (!groups[data.ccaa]) groups[data.ccaa] = []
      groups[data.ccaa].push({ code, data })
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.data.name.localeCompare(b.data.name))
    }
    const sorted: Record<string, { code: string; data: ProvinceData }[]> = {}
    for (const key of Object.keys(groups).sort()) {
      sorted[key] = groups[key]
    }
    return sorted
  }, [manifest])

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped
    const q = search.toLowerCase()
    const result: Record<string, { code: string; data: ProvinceData }[]> = {}
    for (const [ccaa, provinces] of Object.entries(grouped)) {
      const filtered = provinces.filter(p =>
        p.data.name.toLowerCase().includes(q) || ccaa.toLowerCase().includes(q)
      )
      if (filtered.length > 0) result[ccaa] = filtered
    }
    return result
  }, [grouped, search])

  if (loading) {
    return (
      <p className="flex items-center gap-2 px-4 pb-3 text-xs text-[var(--text-muted)]" role="status">
        <span className="spinner" aria-hidden="true" />
        Cargando provincias…
      </p>
    )
  }

  const selectedCount = selectedProvinces.length
  const totalProvinces = Object.keys(manifest).length

  // Casilla con tres estados (vacía, parcial, completa) dibujada con tokens.
  const casilla = (estado: 'no' | 'parcial' | 'si') => (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
        estado === 'si'
          ? 'border-[var(--musgo)] bg-[var(--musgo)] text-[var(--hueso)]'
          : estado === 'parcial'
            ? 'border-[var(--musgo)] bg-[var(--musgo-100)] text-[var(--musgo-700)]'
            : 'border-[var(--border-default)]'
      }`}
    >
      {estado === 'si' && (
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {estado === 'parcial' && <span className="h-0.5 w-2 bg-current" />}
    </span>
  )

  return (
    <div className="flex flex-col">
      <div className="px-4 pb-3">
        <label htmlFor="provincias-busqueda" className="sr-only">Buscar provincia</label>
        <input
          id="provincias-busqueda"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar provincia"
          className="input lg:min-h-[36px]"
        />
        <p className="tnum mt-1.5 text-xs text-[var(--text-muted)]">
          {selectedCount} de {totalProvinces} provincias seleccionadas
        </p>
      </div>

      <div className="max-h-[300px] flex-1 overflow-y-auto border-t border-[var(--border-subtle)]">
        {Object.entries(filtered).map(([ccaa, provinces]) => {
          const allSelected = provinces.every(p => selectedProvinces.includes(p.code))
          const someSelected = provinces.some(p => selectedProvinces.includes(p.code))
          const expanded = expandedCCAA[ccaa] === true

          return (
            <div key={ccaa} className="border-b border-[var(--border-subtle)]">
              <div className="flex min-h-[44px] items-center gap-1 pr-4 pl-1">
                <button
                  type="button"
                  onClick={() => setExpandedCCAA(prev => ({ ...prev, [ccaa]: !expanded }))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                  aria-label={expanded ? `Colapsar ${ccaa}` : `Expandir ${ccaa}`}
                  aria-expanded={expanded}
                >
                  <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    provinces.forEach(p => {
                      if (allSelected) {
                        if (selectedProvinces.includes(p.code)) onToggle(p.code)
                      } else {
                        if (!selectedProvinces.includes(p.code)) onToggle(p.code)
                      }
                    })
                  }}
                  aria-pressed={allSelected ? true : someSelected ? 'mixed' : false}
                  className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2.5 rounded-[6px] text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  {casilla(allSelected ? 'si' : someSelected ? 'parcial' : 'no')}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">{ccaa}</span>
                  <span className="tnum text-xs text-[var(--text-muted)]">
                    {provinces.filter(p => selectedProvinces.includes(p.code)).length}/{provinces.length}
                  </span>
                </button>
              </div>

              {expanded && (
                <div className="pb-1">
                  {provinces.map(({ code, data }) => {
                    const sel = selectedProvinces.includes(code)
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => onToggle(code)}
                        aria-pressed={sel}
                        className="flex min-h-[40px] w-full items-center gap-2.5 pr-4 pl-10 text-left transition-colors hover:bg-[var(--bg-surface-sunken)] focus-visible:bg-[var(--bg-surface-sunken)] focus-visible:outline-none"
                      >
                        {casilla(sel ? 'si' : 'no')}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">{data.name}</span>
                        <span className="tnum text-xs text-[var(--text-muted)]">
                          {data.features.toLocaleString('es-ES')} polígonos
                        </span>
                      </button>
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
