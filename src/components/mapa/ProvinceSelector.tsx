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
    return <p className="text-xs text-[var(--color-text-muted)]">Cargando provincias...</p>
  }

  const selectedCount = selectedProvinces.length
  const totalProvinces = Object.keys(manifest).length

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar provincia..."
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]"
          />
        </div>
        <p className="text-[10px] mt-1 text-[var(--color-text-muted)]">
          {selectedCount} de {totalProvinces} provincias seleccionadas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[300px]">
        {Object.entries(filtered).map(([ccaa, provinces]) => {
          const allSelected = provinces.every(p => selectedProvinces.includes(p.code))
          const someSelected = provinces.some(p => selectedProvinces.includes(p.code))
          const expanded = expandedCCAA[ccaa] !== false

          return (
            <div key={ccaa} className="border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--color-input-bg)] transition-colors">
                <button
                  onClick={() => setExpandedCCAA(prev => ({ ...prev, [ccaa]: !expanded }))}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    provinces.forEach(p => {
                      if (allSelected) {
                        if (selectedProvinces.includes(p.code)) onToggle(p.code)
                      } else {
                        if (!selectedProvinces.includes(p.code)) onToggle(p.code)
                      }
                    })
                  }}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                    allSelected
                      ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)]'
                      : someSelected
                        ? 'bg-[var(--color-secondary)]/30 border-[var(--color-secondary)]'
                        : 'border-[var(--color-border-subtle)]'
                  }`}>
                    {(allSelected || someSelected) && (
                      <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">{ccaa}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
                    {provinces.filter(p => selectedProvinces.includes(p.code)).length}/{provinces.length}
                  </span>
                </button>
              </div>

              {expanded && (
                <div className="pb-1">
                  {provinces.map(({ code, data }) => (
                    <button
                      key={code}
                      onClick={() => onToggle(code)}
                      className="flex items-center gap-2 pl-8 pr-3 py-1 w-full text-left hover:bg-[var(--color-input-bg)] transition-colors"
                    >
                      <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
                        selectedProvinces.includes(code)
                          ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)]'
                          : 'border-[var(--color-border-subtle)]'
                      }`}>
                        {selectedProvinces.includes(code) && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-[var(--color-text-secondary)]">{data.name}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
                        {data.features} polígonos
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
