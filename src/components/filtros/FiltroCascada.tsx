"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Comunidad {
  id: string
  nombre: string
}

interface Provincia {
  id: string
  nombre: string
  codigo_ine: string
  comunidad_autonoma_id: string
}

interface Municipio {
  id: string
  nombre: string
  codigo_ine: string
  poblacion: number | null
  provincia_id: string
  lat?: number
  lng?: number
  provincia?: {
    nombre: string
    comunidad_autonoma?: {
      nombre: string
    }
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

interface FiltroCascadaProps {
  onMunicipioSeleccionado?: (municipio: Municipio | null) => void
}

export default function FiltroCascada({ onMunicipioSeleccionado }: FiltroCascadaProps) {
  const [comunidades, setComunidades] = useState<Comunidad[]>([])
  const [provincias, setProvincias] = useState<Provincia[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])

  const [selectedCCAA, setSelectedCCAA] = useState("")
  const [selectedProvincia, setSelectedProvincia] = useState("")
  const [selectedMunicipio, setSelectedMunicipio] = useState("")

  const [loadingCCAA, setLoadingCCAA] = useState(false)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingMunicipios, setLoadingMunicipios] = useState(false)

  const [municipioSearch, setMunicipioSearch] = useState("")
  const [showMunicipioDropdown, setShowMunicipioDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const municipioInputRef = useRef<HTMLInputElement>(null)
  const municipioDropdownRef = useRef<HTMLDivElement>(null)
  const debounceSearch = useDebounce(municipioSearch, 200)

  const fetchIdRef = useRef(0)
  const abortCcaaRef = useRef<AbortController | null>(null)
  const abortProvinciaRef = useRef<AbortController | null>(null)
  const abortMunicipioRef = useRef<AbortController | null>(null)
  const abortPlaneamientoRef = useRef<AbortController | null>(null)

  useEffect(() => {
    async function fetchComunidades() {
      abortCcaaRef.current?.abort()
      const controller = new AbortController()
      abortCcaaRef.current = controller

      setLoadingCCAA(true)
      try {
        const res = await fetch("/api/comunidades", { signal: controller.signal })
        const json = await res.json()
        if (!json.error && json.data) setComunidades(json.data)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
      if (!controller.signal.aborted) setLoadingCCAA(false)
    }
    fetchComunidades()
  }, [])

  useEffect(() => {
    if (!selectedCCAA) {
      setProvincias([])
      return
    }

    abortProvinciaRef.current?.abort()
    const controller = new AbortController()
    abortProvinciaRef.current = controller

    async function fetchProvincias() {
      setLoadingProvincias(true)
      try {
        const res = await fetch(`/api/provincias?comunidad_autonoma_id=${selectedCCAA}`, { signal: controller.signal })
        const json = await res.json()
        if (!json.error && json.data) setProvincias(json.data)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
      if (!controller.signal.aborted) setLoadingProvincias(false)
    }
    fetchProvincias()

    setSelectedProvincia("")
    setMunicipios([])
    setSelectedMunicipio("")
    setMunicipioSearch("")
    setShowMunicipioDropdown(false)
    setHighlightedIndex(-1)
    onMunicipioSeleccionado?.(null)
  }, [selectedCCAA, onMunicipioSeleccionado])

  useEffect(() => {
    if (!selectedProvincia) {
      setMunicipios([])
      return
    }

    const myFetchId = ++fetchIdRef.current

    abortMunicipioRef.current?.abort()
    const controller = new AbortController()
    abortMunicipioRef.current = controller

    async function fetchMunicipios() {
      setLoadingMunicipios(true)
      try {
        const res = await fetch(`/api/municipios?provincia_id=${selectedProvincia}&limit=500`, { signal: controller.signal })
        const json = await res.json()
        if (fetchIdRef.current === myFetchId && !json.error && json.data) {
          setMunicipios(json.data)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
      if (fetchIdRef.current === myFetchId) setLoadingMunicipios(false)
    }
    fetchMunicipios()

    setSelectedMunicipio("")
    setMunicipioSearch("")
    setShowMunicipioDropdown(false)
    setHighlightedIndex(-1)
    onMunicipioSeleccionado?.(null)
  }, [selectedProvincia, onMunicipioSeleccionado])

  const filteredMunicipios = municipios.filter((m) =>
    normalize(m.nombre).includes(normalize(debounceSearch))
  ).slice(0, 50)

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [debounceSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        municipioDropdownRef.current &&
        !municipioDropdownRef.current.contains(e.target as Node) &&
        municipioInputRef.current &&
        !municipioInputRef.current.contains(e.target as Node)
      ) {
        setShowMunicipioDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleMunicipioSelect(mun: Municipio) {
    setSelectedMunicipio(mun.id)
    setMunicipioSearch(mun.nombre)
    setShowMunicipioDropdown(false)
    onMunicipioSeleccionado?.(mun)
  }

  function handleMunicipioKeyDown(e: React.KeyboardEvent) {
    if (!showMunicipioDropdown) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredMunicipios.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault()
      handleMunicipioSelect(filteredMunicipios[highlightedIndex])
    } else if (e.key === "Escape") {
      setShowMunicipioDropdown(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* CCAA */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Comunidad Autónoma
        </label>
        <select
          value={selectedCCAA}
          onChange={(e) => setSelectedCCAA(e.target.value)}
          disabled={loadingCCAA}
          className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 transition-colors duration-200"
        >
          <option value="">{loadingCCAA ? "Cargando..." : "Seleccionar CCAA..."}</option>
          {comunidades.map((ccaa) => (
            <option key={ccaa.id} value={ccaa.id}>{ccaa.nombre}</option>
          ))}
        </select>
      </div>

      {/* Provincia */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Provincia
        </label>
        <select
          value={selectedProvincia}
          onChange={(e) => setSelectedProvincia(e.target.value)}
          disabled={!selectedCCAA || loadingProvincias}
          className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 transition-colors duration-200"
        >
          <option value="">
            {loadingProvincias ? "Cargando..." : !selectedCCAA ? "Primero selecciona una CCAA" : "Seleccionar Provincia..."}
          </option>
          {provincias.map((prov) => (
            <option key={prov.id} value={prov.id}>{prov.nombre}</option>
          ))}
        </select>
      </div>

      {/* Municipio Combobox */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Municipio
          {municipios.length > 0 && (
            <span className="ml-2 text-xs text-[var(--color-text-secondary)] opacity-70">
              {municipios.length} municipios disponibles
            </span>
          )}
        </label>
        <div className="relative">
          <input
            ref={municipioInputRef}
            type="text"
            value={municipioSearch}
            onChange={(e) => {
              setMunicipioSearch(e.target.value)
              setShowMunicipioDropdown(true)
              if (!e.target.value) {
                setSelectedMunicipio("")
                onMunicipioSeleccionado?.(null)
              }
            }}
            onFocus={() => setShowMunicipioDropdown(true)}
            onKeyDown={handleMunicipioKeyDown}
            disabled={!selectedProvincia || loadingMunicipios}
            placeholder={
              loadingMunicipios
                ? "Cargando..."
                : !selectedProvincia
                  ? "Primero selecciona una provincia"
                  : "Buscar municipio..."
            }
            className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 transition-colors duration-200"
          />
          {showMunicipioDropdown && selectedProvincia && !loadingMunicipios && filteredMunicipios.length > 0 && (
            <div
              ref={municipioDropdownRef}
              className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] shadow-lg"
            >
              {filteredMunicipios.map((mun, index) => (
                <button
                  key={mun.id}
                  type="button"
                  onClick={() => handleMunicipioSelect(mun)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors duration-200 ${
                    index === highlightedIndex
                      ? "bg-[var(--color-secondary)] text-[#1A1A1A]"
                      : "text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {mun.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
