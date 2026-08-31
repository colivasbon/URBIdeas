"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

interface ComunidadAutonoma {
  id: number
  nombre: string
  codigo: string
}

interface Provincia {
  id: number
  nombre: string
  codigo: string
  comunidad_autonoma_id: number
}

interface Municipio {
  id: number
  nombre: string
  codigo_ine: string
  poblacion: number | null
  provincia_id: number
  instrumento_planeamiento_vigente: string | null
}

interface PlaneamientoInfo {
  instrumento_planeamiento_vigente: string | null
}

export default function FiltroCascada() {
  const [comunidades, setComunidades] = useState<ComunidadAutonoma[]>([])
  const [provincias, setProvincias] = useState<Provincia[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])

  const [selectedCCAA, setSelectedCCAA] = useState<string>("")
  const [selectedProvincia, setSelectedProvincia] = useState<string>("")
  const [selectedMunicipio, setSelectedMunicipio] = useState<string>("")

  const [loadingCCAA, setLoadingCCAA] = useState(false)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingMunicipios, setLoadingMunicipios] = useState(false)

  const [municipioSeleccionado, setMunicipioSeleccionado] = useState<Municipio | null>(null)

  useEffect(() => {
    async function fetchComunidades() {
      setLoadingCCAA(true)
      const { data, error } = await supabase
        .from("comunidades_autonomas")
        .select("id, nombre, codigo")
        .order("nombre")
      if (!error && data) setComunidades(data)
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
      const { data, error } = await supabase
        .from("provincias")
        .select("id, nombre, codigo, comunidad_autonoma_id")
        .eq("comunidad_autonoma_id", selectedCCAA)
        .order("nombre")
      if (!error && data) setProvincias(data)
      setLoadingProvincias(false)
    }
    fetchProvincias()
    setSelectedProvincia("")
    setMunicipios([])
    setSelectedMunicipio("")
    setMunicipioSeleccionado(null)
  }, [selectedCCAA])

  useEffect(() => {
    if (!selectedProvincia) {
      setMunicipios([])
      setSelectedMunicipio("")
      return
    }
    async function fetchMunicipios() {
      setLoadingMunicipios(true)
      const { data, error } = await supabase
        .from("municipios")
        .select("id, nombre, codigo_ine, poblacion, provincia_id, instrumento_planeamiento_vigente")
        .eq("provincia_id", selectedProvincia)
        .order("nombre")
      if (!error && data) setMunicipios(data)
      setLoadingMunicipios(false)
    }
    fetchMunicipios()
    setSelectedMunicipio("")
    setMunicipioSeleccionado(null)
  }, [selectedProvincia])

  useEffect(() => {
    if (!selectedMunicipio) {
      setMunicipioSeleccionado(null)
      return
    }
    const mun = municipios.find((m) => String(m.id) === selectedMunicipio)
    setMunicipioSeleccionado(mun || null)
  }, [selectedMunicipio, municipios])

  return (
    <div className="flex flex-col gap-4">
      {/* Comunidad Autónoma */}
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

      {/* Provincia */}
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

      {/* Municipio */}
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

      {/* Resultado: info del municipio seleccionado */}
      {municipioSeleccionado && (
        <div className="mt-2 p-4 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
          <h4 className="text-base font-semibold text-[var(--color-accent)] mb-2">
            {municipioSeleccionado.nombre}
          </h4>
          <div className="flex flex-col gap-1 text-sm text-[var(--color-text-secondary)]">
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

          {municipioSeleccionado.instrumento_planeamiento_vigente && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-1">
                Instrumento de Planeamiento Vigente
              </p>
              <p className="text-sm text-white">
                {municipioSeleccionado.instrumento_planeamiento_vigente}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
