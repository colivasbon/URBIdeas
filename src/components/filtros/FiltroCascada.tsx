"use client"

import { useState, useEffect, useRef } from "react"

interface Comunidad { id: string; nombre: string }
interface Provincia { id: string; nombre: string; codigo_ine: string; comunidad_autonoma_id: string }
interface Municipio { id: string; nombre: string; codigo_ine: string; poblacion: number | null; provincia_id: string; lat?: number; lng?: number; provincia?: { nombre: string; comunidad_autonoma?: { nombre: string } } }

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
  const [loadingCCAA, setLoadingCCAA] = useState(false)
  const [loadingProv, setLoadingProv] = useState(false)
  const [loadingMun, setLoadingMun] = useState(false)

  const onMunRef = useRef(onMunicipioSeleccionado)
  const onProvRef = useRef(onProvinciaSeleccionada)
  useEffect(() => {
    onMunRef.current = onMunicipioSeleccionado
  }, [onMunicipioSeleccionado])
  useEffect(() => {
    onProvRef.current = onProvinciaSeleccionada
  }, [onProvinciaSeleccionada])

  useEffect(() => {
    // Necesario para reflejar el inicio de la carga asíncrona de comunidades al montar el componente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCCAA(true)
    fetch("/api/comunidades")
      .then(r => r.json())
      .then(j => { if (!j.error && j.data) setComunidades(j.data) })
      .catch(() => {})
      .finally(() => setLoadingCCAA(false))
  }, [])

  useEffect(() => {
    // Necesario para limpiar provincias cuando se deselecciona la comunidad autónoma y evitar mostrar datos obsoletos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selCCAA) { setProvincias([]); return }
    setLoadingProv(true)
    fetch(`/api/provincias?comunidad_autonoma_id=${selCCAA}`)
      .then(r => r.json())
      .then(j => { if (!j.error && j.data) setProvincias(j.data) })
      .catch(() => {})
      .finally(() => setLoadingProv(false))
    setSelProv(""); setMunicipios([]); setSelMun("")
    onMunRef.current?.(null)
    onProvRef.current?.(null)
  }, [selCCAA])

  useEffect(() => {
    // Necesario para limpiar municipios cuando se deselecciona la provincia y evitar mostrar datos obsoletos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selProv) { setMunicipios([]); onProvRef.current?.(null); return }
    setLoadingMun(true)
    onProvRef.current?.(selProv)
    fetch(`/api/municipios?provincia_id=${selProv}&limit=500`)
      .then(r => r.json())
      .then(j => { if (!j.error && j.data) setMunicipios(j.data) })
      .catch(() => {})
      .finally(() => setLoadingMun(false))
    setSelMun("")
    onMunRef.current?.(null)
  }, [selProv])

  function handleMunicipioChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setSelMun(id)
    if (!id) { onMunRef.current?.(null); return }
    const mun = municipios.find(m => m.id === id)
    if (!mun) return
    fetch(`/api/municipios/${mun.id}`)
      .then(r => r.json())
      .then(j => { onMunRef.current?.(!j.error && j.data ? j.data : mun) })
      .catch(() => { onMunRef.current?.(mun) })
  }

  const selectClass = "input appearance-none pr-8 disabled:opacity-45"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filtro-ccaa" className="field-label">Comunidad Autónoma</label>
        <div className="relative">
          <select id="filtro-ccaa" value={selCCAA} onChange={e => setSelCCAA(e.target.value)} disabled={loadingCCAA} className={selectClass}>
            <option value="">{loadingCCAA ? "Cargando..." : "Seleccionar CCAA..."}</option>
            {comunidades.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filtro-provincia" className="field-label">Provincia</label>
        <div className="relative">
          <select id="filtro-provincia" value={selProv} onChange={e => setSelProv(e.target.value)} disabled={!selCCAA || loadingProv} className={selectClass}>
            <option value="">{loadingProv ? "Cargando..." : !selCCAA ? "Primero selecciona una CCAA" : "Seleccionar Provincia..."}</option>
            {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filtro-municipio" className="field-label">
          Municipio{municipios.length > 0 && <span className="ml-2 text-xs text-[var(--text-muted)]">{municipios.length} disponibles</span>}
        </label>
        <div className="relative">
          <select id="filtro-municipio" value={selMun} onChange={handleMunicipioChange} disabled={!selProv || loadingMun} className={selectClass}>
            <option value="">{loadingMun ? "Cargando..." : !selProv ? "Primero selecciona una provincia" : "Seleccionar Municipio..."}</option>
            {municipios.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
