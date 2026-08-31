"use client"

import { useState, useEffect, useRef } from "react"

interface Comunidad { id: string; nombre: string }
interface Provincia { id: string; nombre: string; codigo_ine: string; comunidad_autonoma_id: string }
interface Municipio { id: string; nombre: string; codigo_ine: string; poblacion: number | null; provincia_id: string; lat?: number; lng?: number; provincia?: { nombre: string; comunidad_autonoma?: { nombre: string } } }

function useDebounce<T>(value: T, delay: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

function normalize(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

interface Props {
  onMunicipioSeleccionado?: (municipio: Municipio | null) => void
  onProvinciaSeleccionada?: (provinciaId: string | null) => void
}

export default function FiltroCascada({ onMunicipioSeleccionado, onProvinciaSeleccionada }: Props) {
  const [comunidades, setComunidades] = useState<Comunidad[]>([])
  const [provincias, setProvincias] = useState<Provincia[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [selCCAA, setSelCCAA] = useState("")
  const [selProv, setSelProv] = useState("")
  const [selMun, setSelMun] = useState("")
  const [municipioSearch, setMunicipioSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [loadingCCAA, setLoadingCCAA] = useState(false)
  const [loadingProv, setLoadingProv] = useState(false)
  const [loadingMun, setLoadingMun] = useState(false)

  const debounceSearch = useDebounce(municipioSearch, 200)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const munFetchRef = useRef(0)
  const onMunRef = useRef(onMunicipioSeleccionado)
  onMunRef.current = onMunicipioSeleccionado
  const onProvRef = useRef(onProvinciaSeleccionada)
  onProvRef.current = onProvinciaSeleccionada

  useEffect(() => {
    fetch("/api/comunidades").then(r => r.json()).then(j => { if (!j.error && j.data) setComunidades(j.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selCCAA) { setProvincias([]); return }
    setLoadingProv(true)
    fetch(`/api/provincias?comunidad_autonoma_id=${selCCAA}`)
      .then(r => r.json())
      .then(j => { if (!j.error && j.data) setProvincias(j.data) })
      .catch(() => {})
      .finally(() => setLoadingProv(false))
    setSelProv(""); setMunicipios([]); setSelMun(""); setMunicipioSearch(""); setShowDropdown(false)
    onMunRef.current?.(null)
    onProvRef.current?.(null)
  }, [selCCAA])

  useEffect(() => {
    if (!selProv) { setMunicipios([]); onProvRef.current?.(null); return }
    const fetchId = ++munFetchRef.current
    setLoadingMun(true)
    onProvRef.current?.(selProv)
    fetch(`/api/municipios?provincia_id=${selProv}&limit=500`)
      .then(r => r.json())
      .then(j => { if (fetchId === munFetchRef.current && !j.error && j.data) setMunicipios(j.data) })
      .catch(() => {})
      .finally(() => { if (fetchId === munFetchRef.current) setLoadingMun(false) })
    setSelMun(""); setMunicipioSearch(""); setShowDropdown(false)
    onMunRef.current?.(null)
  }, [selProv])

  const filtered = municipios.filter(m => normalize(m.nombre).includes(normalize(debounceSearch))).slice(0, 50)
  useEffect(() => { setHighlighted(-1) }, [debounceSearch])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && inputRef.current && !inputRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function selectMunicipio(mun: Municipio) {
    setSelMun(mun.id); setMunicipioSearch(mun.nombre); setShowDropdown(false)
    fetch(`/api/municipios/${mun.id}`)
      .then(r => r.json())
      .then(j => { const data = !j.error && j.data ? j.data : mun; onMunRef.current?.(data) })
      .catch(() => { onMunRef.current?.(mun) })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(p => Math.min(p + 1, filtered.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(p => Math.max(p - 1, 0)) }
    else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); selectMunicipio(filtered[highlighted]) }
    else if (e.key === "Escape") setShowDropdown(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Comunidad Autónoma</label>
        <select value={selCCAA} onChange={e => setSelCCAA(e.target.value)} disabled={loadingCCAA} className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50">
          <option value="">{loadingCCAA ? "Cargando..." : "Seleccionar CCAA..."}</option>
          {comunidades.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Provincia</label>
        <select value={selProv} onChange={e => setSelProv(e.target.value)} disabled={!selCCAA || loadingProv} className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50">
          <option value="">{loadingProv ? "Cargando..." : !selCCAA ? "Primero selecciona una CCAA" : "Seleccionar Provincia..."}</option>
          {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Municipio{municipios.length > 0 && <span className="ml-2 text-xs opacity-70">{municipios.length} disponibles</span>}
        </label>
        <div className="relative">
          <input ref={inputRef} type="text" value={municipioSearch}
            onChange={e => { setMunicipioSearch(e.target.value); setShowDropdown(true); if (!e.target.value) { setSelMun(""); onMunRef.current?.(null) } }}
            onFocus={() => { if (municipios.length > 0) setShowDropdown(true) }}
            onKeyDown={handleKeyDown}
            disabled={!selProv || loadingMun}
            placeholder={loadingMun ? "Cargando..." : !selProv ? "Primero selecciona una provincia" : "Buscar municipio..."}
            className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50"
          />
          {showDropdown && selProv && !loadingMun && filtered.length > 0 && (
            <div ref={dropdownRef} className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-lg">
              {filtered.map((m, i) => (
                <button key={m.id} type="button" onClick={() => selectMunicipio(m)}
                  className={`w-full text-left px-3 py-2 text-sm ${i === highlighted ? "bg-[var(--color-secondary)] text-[#1A1A1A]" : "text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"}`}>
                  {m.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
