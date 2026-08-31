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
    setSelProv(""); setMunicipios([]); setSelMun("")
    onMunRef.current?.(null)
    onProvRef.current?.(null)
  }, [selCCAA])

  useEffect(() => {
    if (!selProv) { setMunicipios([]); onProvRef.current?.(null); return }
    const fetchId = Date.now()
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Comunidad Autónoma</label>
        <select value={selCCAA} onChange={e => setSelCCAA(e.target.value)} disabled={loadingCCAA}
          className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50">
          <option value="">{loadingCCAA ? "Cargando..." : "Seleccionar CCAA..."}</option>
          {comunidades.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Provincia</label>
        <select value={selProv} onChange={e => setSelProv(e.target.value)} disabled={!selCCAA || loadingProv}
          className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50">
          <option value="">{loadingProv ? "Cargando..." : !selCCAA ? "Primero selecciona una CCAA" : "Seleccionar Provincia..."}</option>
          {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Municipio{municipios.length > 0 && <span className="ml-2 text-xs opacity-70">{municipios.length} disponibles</span>}
        </label>
        <select value={selMun} onChange={handleMunicipioChange} disabled={!selProv || loadingMun}
          className="w-full px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50">
          <option value="">{loadingMun ? "Cargando..." : !selProv ? "Primero selecciona una provincia" : "Seleccionar Municipio..."}</option>
          {municipios.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </div>
    </div>
  )
}
