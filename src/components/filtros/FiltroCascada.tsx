"use client"

import { useState, useEffect } from "react"

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

export default function FiltroCascada() {
  const [comunidades, setComunidades] = useState<Comunidad[]>([])
  const [provincias, setProvincias] = useState<Provincia[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])

  const [selectedCCAA, setSelectedCCAA] = useState<string>("")
  const [selectedProvincia, setSelectedProvincia] = useState<string>("")
  const [selectedMunicipio, setSelectedMunicipio] = useState<string>("")

  const [loadingCCAA, setLoadingCCAA] = useState(false)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingMunicipios, setLoadingMunicipios] = useState(false)

  const [municipioSeleccionado, setMunicipioSeleccionado] = useState<Municipio | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [loadingPlaneamiento, setLoadingPlaneamiento] = useState(false)

  useEffect(() => {
    async function fetchComunidades() {
      setLoadingCCAA(true)
      try {
        const res = await fetch("/api/comunidades")
        const json = await res.json()
        if (!json.error && json.data) setComunidades(json.data)
      } catch {
        // silently ignore
      }
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
      } catch {
        // silently ignore
      }
      setLoadingProvincias(false)
    }
    fetchProvincias()
    setSelectedProvincia("")
    setMunicipios([])
    setSelectedMunicipio("")
    setMunicipioSeleccionado(null)
    setInstrumentos([])
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
        const res = await fetch(`/api/municipios?provincia_id=${selectedProvincia}`)
        const json = await res.json()
        if (!json.error && json.data) setMunicipios(json.data)
      } catch {
        // silently ignore
      }
      setLoadingMunicipios(false)
    }
    fetchMunicipios()
    setSelectedMunicipio("")
    setMunicipioSeleccionado(null)
    setInstrumentos([])
  }, [selectedProvincia])

  useEffect(() => {
    if (!selectedMunicipio) {
      setMunicipioSeleccionado(null)
      setInstrumentos([])
      return
    }
    const mun = municipios.find((m) => m.id === selectedMunicipio)
    setMunicipioSeleccionado(mun || null)

    async function fetchPlaneamiento() {
      setLoadingPlaneamiento(true)
      try {
        const res = await fetch(`/api/planeamiento?municipio_ids=${selectedMunicipio}`)
        const json = await res.json()
        if (!json.error && json.data) setInstrumentos(json.data)
      } catch {
        // silently ignore
      }
      setLoadingPlaneamiento(false)
    }
    fetchPlaneamiento()
  }, [selectedMunicipio, municipios])

  function getEstadoBadge(estado: string) {
    const base = "inline-block px-2 py-0.5 rounded-full text-xs font-medium"
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
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Comunidad Autónoma
        </label>
        <select
          value={selectedCCAA}
          onChange={(e) => setSelectedCCAA(e.target.value)}
          disabled={loadingCCAA}
          className="w-full px-3 py-2 text-sm text-white bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50"
        >
          <option value="">
            {loadingCCAA ? "Cargando..." : "Seleccionar CCAA..."}
          </option>
          {comunidades.map((ccaa) => (
            <option key={ccaa.id} value={ccaa.id}>
              {ccaa.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Provincia
        </label>
        <select
          value={selectedProvincia}
          onChange={(e) => setSelectedProvincia(e.target.value)}
          disabled={!selectedCCAA || loadingProvincias}
          className="w-full px-3 py-2 text-sm text-white bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50"
        >
          <option value="">
            {loadingProvincias
              ? "Cargando..."
              : !selectedCCAA
                ? "Primero selecciona una CCAA"
                : "Seleccionar Provincia..."}
          </option>
          {provincias.map((prov) => (
            <option key={prov.id} value={prov.id}>
              {prov.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Municipio
        </label>
        <select
          value={selectedMunicipio}
          onChange={(e) => setSelectedMunicipio(e.target.value)}
          disabled={!selectedProvincia || loadingMunicipios}
          className="w-full px-3 py-2 text-sm text-white bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50"
        >
          <option value="">
            {loadingMunicipios
              ? "Cargando..."
              : !selectedProvincia
                ? "Primero selecciona una provincia"
                : "Seleccionar Municipio..."}
          </option>
          {municipios.map((mun) => (
            <option key={mun.id} value={mun.id}>
              {mun.nombre}
            </option>
          ))}
        </select>
      </div>

      {municipioSeleccionado && (
        <div className="mt-2 p-4 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
          <h4 className="text-base font-semibold text-[var(--color-accent)] mb-2">
            {municipioSeleccionado.nombre}
          </h4>
          <div className="flex flex-col gap-1 text-sm text-[var(--color-text-secondary)]">
            {municipioSeleccionado.provincia?.comunidad_autonoma?.nombre && (
              <p>
                <span className="font-medium text-white">CCAA:</span>{" "}
                {municipioSeleccionado.provincia.comunidad_autonoma.nombre}
              </p>
            )}
            {municipioSeleccionado.provincia?.nombre && (
              <p>
                <span className="font-medium text-white">Provincia:</span>{" "}
                {municipioSeleccionado.provincia.nombre}
              </p>
            )}
            <p>
              <span className="font-medium text-white">Código INE:</span>{" "}
              {municipioSeleccionado.codigo_ine}
            </p>
            {municipioSeleccionado.poblacion != null && (
              <p>
                <span className="font-medium text-white">Población:</span>{" "}
                {municipioSeleccionado.poblacion.toLocaleString("es-ES")} habitantes
              </p>
            )}
          </div>

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
                        <span className="text-sm font-medium text-white">{inst.tipo}</span>
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
                            className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)]"
                          >
                            Documento oficial
                          </a>
                        )}
                        {inst.enlace_geoportal && (
                          <a
                            href={inst.enlace_geoportal}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)]"
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
        </div>
      )}
    </div>
  )
}
