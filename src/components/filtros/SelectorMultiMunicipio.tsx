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

  // Load all municipalities from province
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
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <input type="text" value={query}
          onChange={e => { setQuery(e.target.value); if (!isOpen) setIsOpen(true) }}
          onFocus={() => { if (allMunicipios.length > 0) setIsOpen(true) }}
          placeholder={!provinciaId ? "Primero selecciona una provincia" : maxReached ? `Máximo ${MAX_SELECTIONS} alcanzado` : `Buscar municipio... (${selected.length}/${MAX_SELECTIONS})`}
          disabled={!provinciaId || maxReached}
          className="w-full pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 placeholder:text-[var(--color-text-secondary)]"
        />
      </div>

      {maxReached && <p className="text-xs text-[var(--color-accent)] font-medium">Límite de {MAX_SELECTIONS} alcanzado.</p>}

      {isOpen && !loading && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-lg">
          {filtered.slice(0, 50).map(mun => (
            <button key={mun.id} onClick={() => toggle(mun)} disabled={isSelected(mun.id) || maxReached}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-b border-[var(--color-border)] last:border-b-0 ${
                isSelected(mun.id) ? "bg-[var(--color-primary)] text-white cursor-default" : "hover:bg-[var(--color-input-bg)] text-[var(--color-text-primary)] disabled:opacity-50"
              }`}>
              <input type="checkbox" checked={isSelected(mun.id)} readOnly className="accent-[var(--color-secondary)]" />
              <span className="font-medium">{mun.nombre}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && !loading && allMunicipios.length > 0 && filtered.length === 0 && query.trim() && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 p-3 text-sm text-[var(--color-text-secondary)] bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
          No se encontraron municipios
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(mun => (
            <span key={mun.id} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--border-radius)]">
              {mun.nombre}
              <button onClick={() => remove(mun.id)} className="ml-1 p-0.5 rounded-full hover:bg-white/20" aria-label={`Eliminar ${mun.nombre}`}>✕</button>
            </span>
          ))}
        </div>
      )}

      {selected.length > 0 && onCompare && (
        <button onClick={() => onCompare(selected.map(s => s.id))}
          className="self-start px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[#345a50] rounded-[var(--border-radius)] transition-colors">
          Comparar {selected.length} municipio{selected.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  )
}
