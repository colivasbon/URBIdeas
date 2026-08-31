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

interface Instrumento {
  id: string
  tipo: string
  estado: string
  fecha_aprobacion_inicial: string | null
  fecha_aprobacion_definitiva: string | null
  enlace_documento_oficial: string | null
  enlace_geoportal: string | null
  fuente: string | null
}

interface Normativa {
  id: string
  ambito: string
  titulo: string
  referencia_legal: string
  fecha_publicacion: string | null
  enlace_boe_boletin: string | null
  estado_vigencia: string
}

interface CapaAplicable {
  id: string
  nombre_capa: string
  tipo_servicio: string
  categoria: string
  url_servicio: string
  comunidad_autonoma?: { nombre: string }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export default function FiltroCascada() {
  const [comunidades, setComunidades] = useState<Comunidad[]>([])
  const [provincias, setProvincias] = useState<Provincia[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])

  const [selectedCCAA, setSelectedCCAA] = useState("")
  const [selectedProvincia, setSelectedProvincia] = useState("")
  const [selectedMunicipio, setSelectedMunicipio] = useState("")

  const [loadingCCAA, setLoadingCCAA] = useState(false)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingMunicipios, setLoadingMunicipios] = useState(false)

  const [municipioSeleccionado, setMunicipioSeleccionado] = useState<Municipio | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [loadingPlaneamiento, setLoadingPlaneamiento] = useState(false)

  const [municipioSearch, setMunicipioSearch] = useState("")
  const [showMunicipioDropdown, setShowMunicipioDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const municipioInputRef = useRef<HTMLInputElement>(null)
  const municipioDropdownRef = useRef<HTMLDivElement>(null)
  const debounceSearch = useDebounce(municipioSearch, 200)

  const [normativa, setNormativa] = useState<Normativa[]>([])
  const [loadingNormativa, setLoadingNormativa] = useState(false)
  const [openNormativa, setOpenNormativa] = useState<string>("municipal")

  const [capas, setCapas] = useState<CapaAplicable[]>([])
  const [loadingCapas, setLoadingCapas] = useState(false)
  const [openCapaCategoria, setOpenCapaCategoria] = useState<string[]>([])

  useEffect(() => {
    async function fetchComunidades() {
      setLoadingCCAA(true)
      try {
        const res = await fetch("/api/comunidades")
        const json = await res.json()
        if (!json.error && json.data) setComunidades(json.data)
      } catch { /* silently ignore */ }
      setLoadingCCAA(false)
    }
    fetchComunidades()
  }, [])

  useEffect(() => {
    if (!selectedCCAA) {
      setProvincias([])
      setSelectedProvincia("")
      return
    }
    async function fetchProvincias() {
      setLoadingProvincias(true)
      try {
        const res = await fetch(`/api/provincias?comunidad_autonoma_id=${selectedCCAA}`)
        const json = await res.json()
        if (!json.error && json.data) setProvincias(json.data)
      } catch { /* silently ignore */ }
      setLoadingProvincias(false)
    }
    fetchProvincias()
    setSelectedProvincia("")
    setMunicipios([])
    setSelectedMunicipio("")
    setMunicipioSeleccionado(null)
    setInstrumentos([])
    setNormativa([])
    setCapas([])
  }, [selectedCCAA])

  useEffect(() => {
    if (!selectedProvincia) {
      setMunicipios([])
      setSelectedMunicipio("")
      return
    }
    async function fetchMunicipios() {
      setLoadingMunicipios(true)
      try {
        const res = await fetch(`/api/municipios?provincia_id=${selectedProvincia}&limit=500`)
        const json = await res.json()
        if (!json.error && json.data) setMunicipios(json.data)
      } catch { /* silently ignore */ }
      setLoadingMunicipios(false)
    }
    fetchMunicipios()
    setSelectedMunicipio("")
    setMunicipioSeleccionado(null)
    setInstrumentos([])
    setNormativa([])
    setCapas([])
    setMunicipioSearch("")
  }, [selectedProvincia])

  const filteredMunicipios = municipios.filter((m) =>
    m.nombre.toLowerCase().includes(debounceSearch.toLowerCase())
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
    setMunicipioSeleccionado(mun)
    setMunicipioSearch(mun.nombre)
    setShowMunicipioDropdown(false)
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

  useEffect(() => {
    if (!selectedMunicipio) {
      setInstrumentos([])
      setNormativa([])
      setCapas([])
      return
    }

    async function fetchPlaneamiento() {
      setLoadingPlaneamiento(true)
      try {
        const res = await fetch(`/api/planeamiento?municipio_ids=${selectedMunicipio}`)
        const json = await res.json()
        if (!json.error && json.data) setInstrumentos(json.data)
      } catch { /* silently ignore */ }
      setLoadingPlaneamiento(false)
    }

    async function fetchNormativa() {
      setLoadingNormativa(true)
      try {
        const res = await fetch(`/api/legislacion-aplicable?municipio_id=${selectedMunicipio}`)
        const json = await res.json()
        if (!json.error && json.data) {
          const all = [
            ...(json.data.estatal || []),
            ...(json.data.autonomico || []),
            ...(json.data.municipal || []),
          ]
          setNormativa(all)
        }
      } catch { /* silently ignore */ }
      setLoadingNormativa(false)
    }

    async function fetchCapas() {
      setLoadingCapas(true)
      try {
        const res = await fetch(`/api/capas-aplicables?municipio_id=${selectedMunicipio}`)
        const json = await res.json()
        if (!json.error && json.data) {
          const all = Object.values(json.data).flat() as CapaAplicable[]
          setCapas(all)
        }
      } catch { /* silently ignore */ }
      setLoadingCapas(false)
    }

    fetchPlaneamiento()
    fetchNormativa()
    fetchCapas()
  }, [selectedMunicipio])

  const groupedCapas = capas.reduce<Record<string, CapaAplicable[]>>((acc, capa) => {
    if (!acc[capa.categoria]) acc[capa.categoria] = []
    acc[capa.categoria].push(capa)
    return acc
  }, {})

  const toggleCapaCategoria = useCallback((cat: string) => {
    setOpenCapaCategoria((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }, [])

  function getEstadoBadge(estado: string) {
    const base = "inline-block px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200"
    switch (estado.toLowerCase()) {
      case "aprobado":
      case "vigente":
        return `${base} bg-green-900/50 text-green-300 border border-green-700/50`
      case "en tramite":
      case "en trámite":
      case "pendiente":
        return `${base} bg-yellow-900/50 text-yellow-300 border border-yellow-700/50`
      case "borrador":
      case "avance":
        return `${base} bg-blue-900/50 text-blue-300 border border-blue-700/50`
      case "derogado":
      case "caducado":
        return `${base} bg-red-900/50 text-red-300 border border-red-700/50`
      default:
        return `${base} bg-gray-900/50 text-gray-300 border border-gray-700/50`
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
                setMunicipioSeleccionado(null)
                setInstrumentos([])
                setNormativa([])
                setCapas([])
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
                      ? "bg-[var(--color-secondary)] text-[var(--color-text-primary)]"
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

      {/* Municipio Info Card */}
      {municipioSeleccionado && (
        <div className="mt-2 p-4 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
          <h4 className="text-base font-semibold text-[var(--color-accent)] mb-2">
            {municipioSeleccionado.nombre}
          </h4>
          <div className="flex flex-col gap-1 text-sm text-[var(--color-text-secondary)]">
            {municipioSeleccionado.provincia?.comunidad_autonoma?.nombre && (
              <p>
                <span className="font-medium text-[var(--color-text-primary)]">CCAA:</span>{" "}
                {municipioSeleccionado.provincia.comunidad_autonoma.nombre}
              </p>
            )}
            {municipioSeleccionado.provincia?.nombre && (
              <p>
                <span className="font-medium text-[var(--color-text-primary)]">Provincia:</span>{" "}
                {municipioSeleccionado.provincia.nombre}
              </p>
            )}
            <p>
              <span className="font-medium text-[var(--color-text-primary)]">Código INE:</span>{" "}
              {municipioSeleccionado.codigo_ine}
            </p>
            {municipioSeleccionado.poblacion != null && (
              <p>
                <span className="font-medium text-[var(--color-text-primary)]">Población:</span>{" "}
                {municipioSeleccionado.poblacion.toLocaleString("es-ES")} habitantes
              </p>
            )}
          </div>

          {/* Instrumentos de Planeamiento */}
          {(loadingPlaneamiento || instrumentos.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">
                Instrumentos de Planeamiento
              </p>
              {loadingPlaneamiento ? (
                <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {instrumentos.map((inst) => (
                    <div
                      key={inst.id}
                      className="p-3 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{inst.tipo}</span>
                        <span className={getEstadoBadge(inst.estado)}>{inst.estado}</span>
                      </div>
                      {inst.fecha_aprobacion_definitiva && (
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          Aprobación definitiva: {inst.fecha_aprobacion_definitiva}
                        </p>
                      )}
                      {inst.fecha_aprobacion_inicial && !inst.fecha_aprobacion_definitiva && (
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          Aprobación inicial: {inst.fecha_aprobacion_inicial}
                        </p>
                      )}
                      {inst.fuente && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          Fuente: {inst.fuente}
                        </p>
                      )}
                      <div className="flex gap-3 mt-2">
                        {inst.enlace_documento_oficial && (
                          <a
                            href={inst.enlace_documento_oficial}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)] transition-colors duration-200"
                          >
                            Documento oficial
                          </a>
                        )}
                        {inst.enlace_geoportal && (
                          <a
                            href={inst.enlace_geoportal}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)] transition-colors duration-200"
                          >
                            Geoportal
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legislación Aplicable Accordion */}
          {(loadingNormativa || normativa.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">
                Legislación Aplicable
              </p>
              {loadingNormativa ? (
                <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(["estatal", "autonomica", "municipal"] as const).map((ambito) => {
                    const items = normativa.filter((n) => n.ambito === ambito)
                    if (items.length === 0) return null
                    const isOpen = openNormativa === ambito
                    const labels: Record<string, string> = {
                      estatal: "Normativa Estatal",
                      autonomica: "Normativa Autonómica",
                      municipal: "Instrumento Municipal",
                    }
                    return (
                      <div
                        key={ambito}
                        className="bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenNormativa(isOpen ? "" : ambito)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] rounded-[var(--border-radius)] transition-colors duration-200"
                        >
                          <span>{labels[ambito]}</span>
                          <span className="text-[var(--color-text-secondary)] text-xs">
                            {items.length} {items.length === 1 ? "norma" : "normas"}
                          </span>
                          <svg
                            className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 flex flex-col gap-2">
                            {items.map((norm) => (
                              <div
                                key={norm.id}
                                className="p-2 border-t border-[var(--color-border)]"
                              >
                                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                                  {norm.titulo}
                                </p>
                                {norm.referencia_legal && (
                                  <p className="text-xs text-[var(--color-text-secondary)]">
                                    Ref: {norm.referencia_legal}
                                  </p>
                                )}
                                {norm.fecha_publicacion && (
                                  <p className="text-xs text-[var(--color-text-secondary)]">
                                    Publicación: {norm.fecha_publicacion}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-1">
                                  <span className={`text-xs px-1.5 py-0.5 rounded transition-colors duration-200 ${
                                    norm.estado_vigencia === "vigente"
                                      ? "bg-green-900/50 text-green-300"
                                      : norm.estado_vigencia === "derogada"
                                        ? "bg-red-900/50 text-red-300"
                                        : "bg-gray-900/50 text-gray-300"
                                  }`}>
                                    {norm.estado_vigencia}
                                  </span>
                                  {norm.enlace_boe_boletin && (
                                    <a
                                      href={norm.enlace_boe_boletin}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)] transition-colors duration-200"
                                    >
                                      Ver boletín
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Capas Aplicables */}
          {(loadingCapas || capas.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">
                Capas disponibles para informe
              </p>
              {loadingCapas ? (
                <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.entries(groupedCapas).map(([categoria, capasGrupo]) => {
                    const isOpen = openCapaCategoria.includes(categoria)
                    return (
                      <div
                        key={categoria}
                        className="bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCapaCategoria(categoria)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] rounded-[var(--border-radius)] transition-colors duration-200"
                        >
                          <span>{categoria}</span>
                          <span className="text-[var(--color-text-secondary)] text-xs">
                            {capasGrupo.length} {capasGrupo.length === 1 ? "capa" : "capas"}
                          </span>
                          <svg
                            className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 flex flex-col gap-2">
                            {capasGrupo.map((capa) => (
                              <div
                                key={capa.id}
                                className="flex items-center justify-between p-2 border-t border-[var(--color-border)]"
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm text-[var(--color-text-primary)]">
                                    {capa.nombre_capa}
                                  </span>
                                  <span className="text-xs text-[var(--color-text-secondary)]">
                                    {capa.tipo_servicio}
                                  </span>
                                </div>
                                <a
                                  href={`/mapa?layers=${capa.id}&center=${municipioSeleccionado?.lng || 0},${municipioSeleccionado?.lat || 0}&zoom=12`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 bg-[var(--color-secondary)] text-[var(--color-text-primary)] rounded-[var(--border-radius)] hover:opacity-80 transition-colors duration-200"
                                >
                                  Ver en mapa
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
