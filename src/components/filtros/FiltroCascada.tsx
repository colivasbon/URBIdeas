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
    setLoadingCCAA(true)
    fetch("/api/comunidades")
      .then(r => r.json())
      .then(j => { if (!j.error && j.data) setComunidades(j.data) })
      .catch(() => {})
      .finally(() => setLoadingCCAA(false))
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

  const selectClass = "w-full appearance-none bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] px-3 py-2 pr-8 text-sm text-[var(--color-text-primary)] transition-all duration-[var(--duration-normal)] hover:border-[var(--color-border)] hover:bg-[var(--color-input-bg-hover)] focus:outline-none focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 disabled:opacity-50 disabled:cursor-not-allowed"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Comunidad Autónoma</label>
        <div className="relative">
          <select value={selCCAA} onChange={e => setSelCCAA(e.target.value)} disabled={loadingCCAA} className={selectClass}>
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
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Provincia</label>
        <div className="relative">
          <select value={selProv} onChange={e => setSelProv(e.target.value)} disabled={!selCCAA || loadingProv} className={selectClass}>
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
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Municipio{municipios.length > 0 && <span className="ml-2 text-xs text-[var(--color-text-muted)]">{municipios.length} disponibles</span>}
        </label>
        <div className="relative">
          <select value={selMun} onChange={handleMunicipioChange} disabled={!selProv || loadingMun} className={selectClass}>
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
