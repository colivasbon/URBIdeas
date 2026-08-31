"use client"

import { useState, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"

interface MunicipioResult {
  id: number
  nombre: string
  codigo_ine: string
  provincia_id: number
  provincias: { nombre: string } | null
}

interface SelectedMunicipio {
  id: number
  nombre: string
  codigo_ine: string
  provincia_nombre: string
}

const MAX_SELECTIONS = 10

interface SelectorMultiMunicipioProps {
  onCompare?: (municipioIds: number[]) => void
}

export default function SelectorMultiMunicipio({ onCompare }: SelectorMultiMunicipioProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MunicipioResult[]>([])
  const [selected, setSelected] = useState<SelectedMunicipio[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 2) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from("municipios")
        .select("id, nombre, codigo_ine, provincia_id, provincias(nombre)")
        .ilike("nombre", `%${query.trim()}%`)
        .limit(20)

      if (!error && data) {
        const mapped = data.map((m) => ({
          ...m,
          provincias: Array.isArray(m.provincias) ? m.provincias[0] : m.provincias,
        })) as MunicipioResult[]
        setResults(mapped)
      }
      setLoading(false)
      setIsOpen(true)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function isSelected(id: number) {
    return selected.some((s) => s.id === id)
  }

  function toggleSelection(mun: MunicipioResult) {
    if (isSelected(mun.id)) {
      setSelected((prev) => prev.filter((s) => s.id !== mun.id))
    } else {
      if (selected.length >= MAX_SELECTIONS) return
      setSelected((prev) => [
        ...prev,
        {
          id: mun.id,
          nombre: mun.nombre,
          codigo_ine: mun.codigo_ine,
          provincia_nombre: mun.provincias?.nombre ?? "—",
        },
      ])
    }
    setQuery("")
    setResults([])
    setIsOpen(false)
  }

  function removeSelection(id: number) {
    setSelected((prev) => prev.filter((s) => s.id !== id))
  }

  function handleCompare() {
    if (selected.length === 0 || !onCompare) return
    onCompare(selected.map((s) => s.id))
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-3 relative">
      {/* Search input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim().length >= 2) setIsOpen(true)
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder={`Buscar municipio... (${selected.length}/${MAX_SELECTIONS})`}
          disabled={selected.length >= MAX_SELECTIONS}
          className="w-full pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 placeholder:text-[var(--color-text-secondary)]"
        />
      </div>

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-lg">
          {results.map((mun) => (
            <button
              key={mun.id}
              onClick={() => toggleSelection(mun)}
              disabled={isSelected(mun.id) || (!isSelected(mun.id) && selected.length >= MAX_SELECTIONS)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors border-b border-[var(--color-border)] last:border-b-0 ${
                isSelected(mun.id)
                  ? "bg-[var(--color-primary)] text-[var(--color-text-primary)] cursor-default"
                  : "hover:bg-[var(--color-input-bg)] text-[var(--color-text-primary)] disabled:opacity-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected(mun.id)}
                readOnly
                className="accent-[var(--color-secondary)]"
              />
              <div className="flex flex-col">
                <span className="font-medium">{mun.nombre}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {mun.provincias?.nombre} · INE: {mun.codigo_ine}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 p-3 text-sm text-[var(--color-text-secondary)] bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
          No se encontraron municipios
        </div>
      )}

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((mun) => (
            <span
              key={mun.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--border-radius)]"
            >
              <span className="flex flex-col leading-tight">
                <span>{mun.nombre}</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {mun.provincia_nombre} · {mun.codigo_ine}
                </span>
              </span>
              <button
                onClick={() => removeSelection(mun.id)}
                className="ml-1 p-0.5 rounded-full hover:bg-white/20 transition-colors"
                aria-label={`Eliminar ${mun.nombre}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Compare button */}
      {selected.length > 0 && onCompare && (
        <button
          onClick={handleCompare}
          className="self-start px-4 py-2 text-sm font-medium text-[var(--color-dark-bg)] bg-[var(--color-secondary)] hover:bg-[#6f9e2e] rounded-[var(--border-radius)] transition-colors"
        >
          Comparar {selected.length} municipio{selected.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  )
}
