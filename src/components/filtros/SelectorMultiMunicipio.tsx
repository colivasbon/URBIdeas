"use client"

import { useState, useRef, useEffect, useId } from "react"

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
  const inputId = useId()

  useEffect(() => {
    // Limpia la lista al deseleccionar la provincia para no mostrar municipios obsoletos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div ref={wrapperRef} className="relative flex flex-col gap-4">
      <div className="relative">
        <label htmlFor={inputId} className="field-label">
          Municipios a comparar
          <span className="tnum ml-2 font-normal text-[var(--text-muted)]">
            {selected.length} de {MAX_SELECTIONS}
          </span>
        </label>
        <input id={inputId} type="text" value={query}
          onChange={e => { setQuery(e.target.value); if (!isOpen) setIsOpen(true) }}
          onFocus={() => { if (allMunicipios.length > 0) setIsOpen(true) }}
          placeholder={!provinciaId ? "Seleccione antes una provincia" : maxReached ? "Límite alcanzado" : "Escriba el nombre del municipio"}
          disabled={!provinciaId || maxReached}
          className="input disabled:cursor-not-allowed disabled:opacity-45"
        />

        {isOpen && !loading && filtered.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-2)]">
            {filtered.slice(0, 50).map(mun => (
              <button key={mun.id} type="button" onClick={() => toggle(mun)} disabled={isSelected(mun.id) || maxReached}
                className={`flex min-h-11 w-full items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-2 text-left text-sm transition-colors last:border-b-0 ${
                  isSelected(mun.id)
                    ? "cursor-default bg-[var(--status-info-bg)] text-[var(--text-primary)]"
                    : "text-[var(--text-primary)] hover:bg-[var(--action-secondary-hover-bg)] disabled:opacity-45"
                }`}>
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border ${
                  isSelected(mun.id) ? "border-[var(--moss-ink)] bg-[var(--moss-ink)] text-[var(--bg-surface)]" : "border-[var(--border-default)]"
                }`}>
                  {isSelected(mun.id) && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </span>
                <span>{mun.nombre}</span>
              </button>
            ))}
          </div>
        )}

        {isOpen && !loading && allMunicipios.length > 0 && filtered.length === 0 && query.trim() && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-muted)] shadow-[var(--shadow-2)]">
            Ningún municipio de la provincia coincide con «{query.trim()}».
          </div>
        )}
      </div>

      {maxReached && (
        <p className="text-xs text-[var(--text-secondary)]">
          Ha alcanzado el límite de {MAX_SELECTIONS} municipios. Quite alguno para añadir otro.
        </p>
      )}

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Municipios seleccionados">
          {selected.map(mun => (
            <li key={mun.id} className="inline-flex items-center rounded-[6px] border border-[var(--crisopa-400)] bg-[var(--crisopa-200)] pl-2.5 text-xs font-medium text-[var(--carbon-900)]">
              {mun.nombre}
              <button type="button" onClick={() => remove(mun.id)}
                className="ml-0.5 inline-flex h-11 w-11 items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--crisopa-400)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:h-7 sm:w-7"
                aria-label={`Eliminar ${mun.nombre}`}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && onCompare && (
        <button type="button" onClick={() => onCompare(selected.map(s => s.id))} className="btn btn-primary self-start">
          Comparar {selected.length} municipio{selected.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  )
}
