"use client"

import { useState, useRef, useEffect } from "react"

interface MunicipioResult {
  id: string
  nombre: string
  codigo_ine: string
  provincia_id: string
  provincia_nombre: string
}

interface SelectedMunicipio {
  id: string
  nombre: string
  codigo_ine: string
  provincia_nombre: string
}

const MAX_SELECTIONS = 10

interface SelectorMultiMunicipioProps {
  onCompare?: (municipioIds: string[]) => void
}

export default function SelectorMultiMunicipio({ onCompare }: SelectorMultiMunicipioProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MunicipioResult[]>([])
  const [selected, setSelected] = useState<SelectedMunicipio[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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
    abortRef.current?.abort()

    if (query.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/busqueda?q=${encodeURIComponent(query.trim())}&limit=20`, {
          signal: controller.signal,
        })
        const json = await res.json()

        if (controller.signal.aborted) return

        if (json.error) {
          setError(json.error)
          setResults([])
        } else if (json.data) {
          const municipios = json.data
            .filter((item: { tipo?: string }) => item.tipo === "municipio")
            .map((m: {
              id: string
              nombre: string
              codigo_ine: string
              provincia_id?: string
              provincia?: { id?: string; nombre?: string }
            }) => ({
              id: String(m.id),
              nombre: m.nombre,
              codigo_ine: m.codigo_ine,
              provincia_id: m.provincia?.id ?? m.provincia_id ?? "",
              provincia_nombre: m.provincia?.nombre ?? "—",
            })) as MunicipioResult[]
          setResults(municipios)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Error al buscar municipios")
        setResults([])
      }
      setLoading(false)
      setIsOpen(true)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
    }
  }, [query])

  function isSelected(id: string): boolean {
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
          provincia_nombre: mun.provincia_nombre,
        },
      ])
    }
    setQuery("")
    setResults([])
    setIsOpen(false)
  }

  function removeSelection(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id))
  }

  function handleCompare() {
    if (selected.length === 0 || !onCompare) return
    onCompare(selected.map((s) => s.id))
  }

  const maxReached = selected.length >= MAX_SELECTIONS

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
          placeholder={maxReached ? `Máximo ${MAX_SELECTIONS} alcanzado` : `Buscar municipio... (${selected.length}/${MAX_SELECTIONS})`}
          disabled={maxReached}
          className="w-full pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 placeholder:text-[var(--color-text-secondary)]"
        />
      </div>

      {/* Max reached message */}
      {maxReached && (
        <p className="text-xs text-[var(--color-accent)] font-medium">
          Límite de {MAX_SELECTIONS} municipios alcanzado. Retira alguno para añadir más.
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-400 font-medium">{error}</p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
          <span className="text-xs text-[var(--color-text-secondary)]">Buscando...</span>
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && results.length > 0 && !loading && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-lg">
          {results.map((mun) => (
            <button
              key={mun.id}
              onClick={() => toggleSelection(mun)}
              disabled={isSelected(mun.id) || (!isSelected(mun.id) && maxReached)}
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
                  {mun.provincia_nombre} · INE: {mun.codigo_ine}
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
