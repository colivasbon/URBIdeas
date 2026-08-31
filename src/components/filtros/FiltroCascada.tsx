"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Comunidad { id: string; nombre: string }
interface Provincia { id: string; nombre: string; codigo_ine: string; comunidad_autonoma_id: string }
interface Municipio { id: string; nombre: string; codigo_ine: string; poblacion: number | null; provincia_id: string; lat?: number; lng?: number; provincia?: { nombre: string; comunidad_autonoma?: { nombre: string } } }
interface Instrumento { id: string; tipo: string; estado: string; fecha_aprobacion_inicial: string | null; fecha_aprobacion_definitiva: string | null; enlace_documento_oficial: string | null; enlace_geoportal: string | null; fuente: string | null }
interface Normativa { id: string; ambito: string; titulo: string; referencia_legal: string; fecha_publicacion: string | null; enlace_boe_boletin: string | null; estado_vigencia: string; fuente_oficial: string | null; administracion_emisora: string | null }
interface CapaAplicable { id: string; nombre_capa: string; tipo_servicio: string; categoria: string; url_servicio: string }

function useDebounce<T>(value: T, delay: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

function normalize(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

interface Props { onMunicipioSeleccionado?: (municipio: Municipio | null) => void }

export default function FiltroCascada({ onMunicipioSeleccionado }: Props) {
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

  const [municipioInfo, setMunicipioInfo] = useState<Municipio | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [loadingInst, setLoadingInst] = useState(false)
  const [normativa, setNormativa] = useState<Normativa[]>([])
  const [loadingNorm, setLoadingNorm] = useState(false)
  const [openNorm, setOpenNorm] = useState("municipal")
  const [capas, setCapas] = useState<CapaAplicable[]>([])
  const [loadingCapas, setLoadingCapas] = useState(false)
  const [openCapas, setOpenCapas] = useState<string[]>([])

  const debounceSearch = useDebounce(municipioSearch, 200)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const munFetchRef = useRef(0)
  const onMunRef = useRef(onMunicipioSeleccionado)
  onMunRef.current = onMunicipioSeleccionado

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
    setSelProv(""); setMunicipios([]); setSelMun(""); setMunicipioSearch(""); setShowDropdown(false); setMunicipioInfo(null); setInstrumentos([]); setNormativa([]); setCapas([])
    onMunRef.current?.(null)
  }, [selCCAA])

  useEffect(() => {
    if (!selProv) { setMunicipios([]); return }
    const fetchId = ++munFetchRef.current
    setLoadingMun(true)
    fetch(`/api/municipios?provincia_id=${selProv}&limit=500`)
      .then(r => r.json())
      .then(j => { if (fetchId === munFetchRef.current && !j.error && j.data) setMunicipios(j.data) })
      .catch(() => {})
      .finally(() => { if (fetchId === munFetchRef.current) setLoadingMun(false) })
    setSelMun(""); setMunicipioSearch(""); setShowDropdown(false); setMunicipioInfo(null); setInstrumentos([]); setNormativa([]); setCapas([])
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
    setSelMun(mun.id); setMunicipioSearch(mun.nombre); setShowDropdown(false); setMunicipioInfo(mun)
    onMunRef.current?.(mun)

    setLoadingInst(true); setLoadingNorm(true); setLoadingCapas(true)
    Promise.all([
      fetch(`/api/planeamiento?municipio_ids=${mun.id}`).then(r => r.json()),
      fetch(`/api/legislacion-aplicable?municipio_id=${mun.id}`).then(r => r.json()),
      fetch(`/api/capas-aplicables?municipio_id=${mun.id}`).then(r => r.json()),
    ]).then(([inst, norm, cap]) => {
      setInstrumentos(!inst.error && inst.data ? inst.data : [])
      if (!norm.error && norm.data) {
        setNormativa([...(norm.data.estatal || []), ...(norm.data.autonomico || []), ...(norm.data.municipal || [])])
      }
      if (!cap.error && cap.data) setCapas(Object.values(cap.data).flat() as CapaAplicable[])
    }).catch(() => {}).finally(() => { setLoadingInst(false); setLoadingNorm(false); setLoadingCapas(false) })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(p => Math.min(p + 1, filtered.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(p => Math.max(p - 1, 0)) }
    else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); selectMunicipio(filtered[highlighted]) }
    else if (e.key === "Escape") setShowDropdown(false)
  }

  const groupedCapas = capas.reduce<Record<string, CapaAplicable[]>>((a, c) => { (a[c.categoria] = a[c.categoria] || []).push(c); return a }, {})

  function badge(estado: string) {
    const b = "inline-block px-2 py-0.5 rounded-full text-xs font-medium"
    const s = estado.toLowerCase()
    if (s === "vigente" || s === "aprobado") return `${b} bg-green-900/50 text-green-300 border border-green-700/50`
    if (s.includes("tramite") || s === "pendiente") return `${b} bg-yellow-900/50 text-yellow-300 border border-yellow-700/50`
    if (s === "derogado" || s === "caducado") return `${b} bg-red-900/50 text-red-300 border border-red-700/50`
    return `${b} bg-gray-900/50 text-gray-300 border border-gray-700/50`
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
            onChange={e => { setMunicipioSearch(e.target.value); setShowDropdown(true); if (!e.target.value) { setSelMun(""); setMunicipioInfo(null); onMunRef.current?.(null) } }}
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

      {municipioInfo && (
        <div className="mt-2 p-4 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
          <h4 className="text-base font-semibold text-[var(--color-accent)] mb-2">{municipioInfo.nombre}</h4>
          <div className="flex flex-col gap-1 text-sm text-[var(--color-text-secondary)]">
            {municipioInfo.provincia?.comunidad_autonoma?.nombre && <p><span className="font-medium text-[var(--color-text-primary)]">CCAA:</span> {municipioInfo.provincia.comunidad_autonoma.nombre}</p>}
            {municipioInfo.provincia?.nombre && <p><span className="font-medium text-[var(--color-text-primary)]">Provincia:</span> {municipioInfo.provincia.nombre}</p>}
            <p><span className="font-medium text-[var(--color-text-primary)]">Código INE:</span> {municipioInfo.codigo_ine}</p>
            {municipioInfo.poblacion != null && <p><span className="font-medium text-[var(--color-text-primary)]">Población:</span> {municipioInfo.poblacion.toLocaleString("es-ES")} hab.</p>}
          </div>

          {(loadingInst || instrumentos.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">Instrumentos de Planeamiento</p>
              {loadingInst ? <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p> : instrumentos.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">Sin datos de planeamiento verificados para este municipio</p> : (
                <div className="flex flex-col gap-2">
                  {instrumentos.map(inst => (
                    <div key={inst.id} className="p-3 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{inst.tipo}</span>
                        <span className={badge(inst.estado)}>{inst.estado}</span>
                      </div>
                      {inst.fecha_aprobacion_definitiva && <p className="text-xs text-[var(--color-text-secondary)]">Aprobación definitiva: {inst.fecha_aprobacion_definitiva}</p>}
                      {inst.fuente && <p className="text-xs text-[var(--color-text-secondary)] mt-1">Fuente: {inst.fuente}</p>}
                      <div className="flex gap-3 mt-2">
                        {inst.enlace_documento_oficial && <a href={inst.enlace_documento_oficial} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-primary)]">Documento oficial</a>}
                        {inst.enlace_geoportal && <a href={inst.enlace_geoportal} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-primary)]">Geoportal</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(loadingNorm || normativa.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">Legislación Aplicable</p>
              {loadingNorm ? <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p> : normativa.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No se han localizado disposiciones verificadas para este ámbito</p> : (
                <div className="flex flex-col gap-2">
                  {(["estatal", "autonomico", "municipal"] as const).map(amb => {
                    const items = normativa.filter(n => n.ambito === amb)
                    if (!items.length) return null
                    const isOpen = openNorm === amb
                    const labels: Record<string, string> = { estatal: "Normativa Estatal", autonomico: "Normativa Autonómica", municipal: "Normativa Municipal" }
                    return (
                      <div key={amb} className="bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
                        <button type="button" onClick={() => setOpenNorm(isOpen ? "" : amb)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] rounded-[var(--border-radius)]">
                          <span>{labels[amb]}</span>
                          <span className="text-[var(--color-text-secondary)] text-xs">{items.length} {items.length === 1 ? "norma" : "normas"}</span>
                          <svg className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {isOpen && <div className="px-3 pb-3 flex flex-col gap-2">{items.map(n => (
                          <div key={n.id} className="p-2 border-t border-[var(--color-border)]">
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">{n.titulo}</p>
                            {n.referencia_legal && <p className="text-xs text-[var(--color-text-secondary)]">Ref: {n.referencia_legal}</p>}
                            {n.fecha_publicacion && <p className="text-xs text-[var(--color-text-secondary)]">Publicación: {n.fecha_publicacion}</p>}
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${n.estado_vigencia === "vigente" ? "bg-green-900/50 text-green-300" : n.estado_vigencia === "derogada" ? "bg-red-900/50 text-red-300" : "bg-gray-900/50 text-gray-300"}`}>{n.estado_vigencia}</span>
                              {n.enlace_boe_boletin && <a href={n.enlace_boe_boletin} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-primary)]">Ver boletín</a>}
                            </div>
                          </div>
                        ))}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {(loadingCapas || capas.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">Capas disponibles para informe</p>
              {loadingCapas ? <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p> : capas.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No hay capas WMS disponibles para esta comunidad</p> : (
                <div className="flex flex-col gap-2">
                  {Object.entries(groupedCapas).map(([cat, items]) => {
                    const isOpen = openCapas.includes(cat)
                    return (
                      <div key={cat} className="bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]">
                        <button type="button" onClick={() => setOpenCapas(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat])} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] rounded-[var(--border-radius)]">
                          <span>{cat}</span>
                          <span className="text-[var(--color-text-secondary)] text-xs">{items.length} {items.length === 1 ? "capa" : "capas"}</span>
                          <svg className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {isOpen && <div className="px-3 pb-3 flex flex-col gap-2">{items.map(c => (
                          <div key={c.id} className="flex items-center justify-between p-2 border-t border-[var(--color-border)]">
                            <div className="flex flex-col">
                              <span className="text-sm text-[var(--color-text-primary)]">{c.nombre_capa}</span>
                              <span className="text-xs text-[var(--color-text-secondary)]">{c.tipo_servicio}</span>
                            </div>
                            <a href={`/mapa?layers=${c.id}&zoom=12`} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 bg-[var(--color-secondary)] text-[#1A1A1A] rounded-[var(--border-radius)] hover:opacity-80">Ver en mapa</a>
                          </div>
                        ))}</div>}
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
