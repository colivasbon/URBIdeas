"use client"

import { useState, useRef, useEffect } from "react"

interface MunicipioResult { id: string; nombre: string; codigo_ine: string; provincia_id: string; provincia_nombre: string }
interface SelectedMunicipio { id: string; nombre: string; codigo_ine: string; provincia_nombre: string }

const MAX_SELECTIONS = 10

interface SelectorMultiMunicipioProps {
  onCompare?: (municipioIds: string[]) => void
  provinciaId?: string | null
}

export default function SelectorMultiMunicipio({ onCompare, provinciaId }: SelectorMultiMunicipioProps) {
  const [allMunicipios, setAllMunicipios] = useState<MunicipioResult[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<SelectedMunicipio[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!provinciaId) { setAllMunicipios([]); return }
    setLoading(true)
    fetch(`/api/municipios?provincia_id=${provinciaId}&limit=500`)
      .then(r => r.json())
      .then(j => {
        if (!j.error && j.data) {
          setAllMunicipios(j.data.map((m: { id: string; nombre: string; codigo_ine: string }) => ({
            id: m.id, nombre: m.nombre, codigo_ine: m.codigo_ine,
            provincia_id: provinciaId, provincia_nombre: "",
          })))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    setSelected([]); setQuery(""); setIsOpen(false)
  }, [provinciaId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = query.trim()
    ? allMunicipios.filter(m => m.nombre.toLowerCase().includes(query.toLowerCase()))
    : allMunicipios

  const isSelected = (id: string) => selected.some(s => s.id === id)
  const maxReached = selected.length >= MAX_SELECTIONS

  function toggle(mun: MunicipioResult) {
    if (isSelected(mun.id)) {
      setSelected(prev => prev.filter(s => s.id !== mun.id))
    } else {
      if (maxReached) return
      setSelected(prev => [...prev, { id: mun.id, nombre: mun.nombre, codigo_ine: mun.codigo_ine, provincia_nombre: mun.provincia_nombre }])
    }
  }

  function remove(id: string) { setSelected(prev => prev.filter(s => s.id !== id)) }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-3 relative">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input type="text" value={query}
          onChange={e => { setQuery(e.target.value); if (!isOpen) setIsOpen(true) }}
          onFocus={() => { if (allMunicipios.length > 0) setIsOpen(true) }}
          placeholder={!provinciaId ? "Primero selecciona una provincia" : maxReached ? `Máximo ${MAX_SELECTIONS} alcanzado` : `Buscar municipio... (${selected.length}/${MAX_SELECTIONS})`}
          disabled={!provinciaId || maxReached}
          className="w-full pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] transition-all duration-[var(--duration-normal)] hover:border-[var(--color-border)] hover:bg-[var(--color-input-bg-hover)] focus:outline-none focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-50 placeholder:text-[var(--color-text-muted)]"
        />
      </div>

      {maxReached && <p className="text-xs text-[var(--color-accent)] font-medium">Límite de {MAX_SELECTIONS} alcanzado.</p>}

      {isOpen && !loading && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-[var(--color-card-bg-solid)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-[var(--shadow-lg)]">
          {filtered.slice(0, 50).map(mun => (
            <button key={mun.id} onClick={() => toggle(mun)} disabled={isSelected(mun.id) || maxReached}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 border-b border-[var(--color-border-subtle)] last:border-b-0 transition-colors duration-[var(--duration-fast)] ${
                isSelected(mun.id) ? "bg-[var(--color-primary)] text-white cursor-default" : "hover:bg-[var(--color-input-bg)] text-[var(--color-text-primary)] disabled:opacity-50"
              }`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                isSelected(mun.id) ? "bg-white border-white" : "border-[var(--color-border)]"
              }`}>
                {isSelected(mun.id) && (
                  <svg className="h-3 w-3 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </span>
              <span className="font-medium">{mun.nombre}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && !loading && allMunicipios.length > 0 && filtered.length === 0 && query.trim() && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 p-3 text-sm text-[var(--color-text-muted)] bg-[var(--color-card-bg-solid)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-[var(--shadow-md)]">
          No se encontraron municipios
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(mun => (
            <span key={mun.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-[var(--crisopa)] text-[var(--carbon)] border border-[var(--conifera)] rounded-[6px]">
              {mun.nombre}
              <button onClick={() => remove(mun.id)} className="rounded-[6px] p-0.5 hover:bg-[var(--conifera)]/40 transition-colors" aria-label={`Eliminar ${mun.nombre}`}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {selected.length > 0 && onCompare && (
        <button onClick={() => onCompare(selected.map(s => s.id))}
          className="self-start inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--border-radius)] transition-all duration-[var(--duration-normal)] hover:bg-[var(--color-primary-light)] hover:shadow-[var(--shadow-glow-primary)] active:scale-[0.98]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          Comparar {selected.length} municipio{selected.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  )
}
