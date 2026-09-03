"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import UrbideasHeader from "@/components/platform/UrbideasHeader"
import Footer from "@/components/layout/Footer"
import { ControlCapas } from "@/components/mapa/ControlCapas"
import { FileLayerPanel } from "@/components/mapa/FileLayerPanel"
import type { FileLayer } from "@/components/mapa/fileLayerUtils"
import type { ModoDibujo } from "@/components/mapa/DibujoAmbito"
import type { CapaWMS } from "@/lib/types"
import { PRESETS_PERFIL, type PerfilId } from "@/lib/familias"
import {
  nuevoAmbito, tipoDeGeoJSON, validarRecinto, parseCoordenadas,
  listarAmbitos, guardarAmbito, borrarAmbito, mismaCCAA,
  type Ambito, type TerritorioAmbito,
} from "@/lib/ambito"
import { cruzarAmbito, type FilaCruce, type CapaCruce } from "@/lib/cruce"
import { tituloFamilia } from "@/lib/familias"
import { etiquetaEstado, PIE_LEGAL, type DictamenResultado } from "@/lib/dictamen"
import * as turf from "@turf/turf"

const VisorMapa = dynamic(() => import("@/components/mapa/VisorMapa"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[400px] sm:min-h-[500px] items-center justify-center bg-[var(--color-input-bg)] rounded-[var(--border-radius-lg)]">
      <div className="text-center">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full mb-2" />
        <p className="text-xs text-[var(--color-text-muted)]">Cargando mapa...</p>
      </div>
    </div>
  ),
})

const PERFILES: { id: PerfilId; label: string }[] = [
  { id: 'parcela', label: 'Consulta de parcela' },
  { id: 'rustico', label: 'Viabilidad en rústico' },
  { id: 'cribado', label: 'Cribado residencial o industrial' },
  { id: 'afecciones', label: 'Informe de afecciones' },
]

const BADGE_RESULTADO: Record<string, { label: string; bg: string; fg: string }> = {
  solapa: { label: 'Solapa', bg: '#e74c3c22', fg: '#e74c3c' },
  borde: { label: 'Borde (<10 m, criterio interno)', bg: '#e67e2222', fg: '#e67e22' },
  proximo: { label: 'Próximo', bg: '#f1c40f33', fg: '#9a7d0a' },
  limpio: { label: 'Sin intersección', bg: '#2ecc7122', fg: '#27ae60' },
  sin_datos: { label: 'Sin datos', bg: '#95a5a622', fg: '#7f8c8d' },
}

function ResultadoBadge({ resultado }: { resultado: string }) {
  const b = BADGE_RESULTADO[resultado] || BADGE_RESULTADO.sin_datos
  return (
    <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full" style={{ background: b.bg, color: b.fg }}>
      {b.label}
    </span>
  )
}

function SemaforoBadge({ estado, pendiente }: { estado: 'compatible' | 'condicionado' | 'incompatible'; pendiente: boolean }) {
  const cfg = estado === 'compatible'
    ? { label: etiquetaEstado(estado), bg: '#2ecc7122', fg: '#27ae60' }
    : estado === 'condicionado'
      ? { label: etiquetaEstado(estado), bg: '#f1c40f33', fg: '#9a7d0a' }
      : { label: etiquetaEstado(estado), bg: '#e74c3c22', fg: '#e74c3c' }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-block px-2.5 py-1 text-xs font-bold rounded-full" style={{ background: cfg.bg, color: cfg.fg }}>
        {cfg.label}
      </span>
      {pendiente && (
        <span className="text-[10px] font-medium" style={{ color: cfg.fg }}>
          Identificado — afecciones sectoriales pendientes
        </span>
      )}
    </span>
  )
}

function FichaFila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium" style={{ color: 'var(--color-text-muted)' }}>{k}:</dt>
      <dd className="text-[var(--color-text-primary)]">{v}</dd>
    </div>
  )
}

function readUrlParams() {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  const lat = parseFloat(params.get("lat") || "")
  const lng = parseFloat(params.get("lng") || "")
  const zoom = parseInt(params.get("zoom") || "", 10)
  const capas = params.get("capas") || ""
  const base = params.get("base") || ""
  const opacity = params.get("opacity") || ""
  return {
    lat: isNaN(lat) ? 40.0 : lat,
    lng: isNaN(lng) ? -3.7 : lng,
    zoom: isNaN(zoom) ? 6 : zoom,
    capas: capas ? capas.split(",").filter(Boolean) : [],
    base: base || "osm",
    opacity,
    ambito: params.get("ambito") || "",
  }
}

function writeUrlParams(lat: number, lng: number, zoom: number, capas: string[], base: string, opacity: number, ambitoId: string) {
  const params = new URLSearchParams()
  params.set("lat", lat.toFixed(4))
  params.set("lng", lng.toFixed(4))
  params.set("zoom", String(zoom))
  if (capas.length > 0) params.set("capas", capas.join(","))
  if (base && base !== "osm") params.set("base", base)
  if (opacity < 100) params.set("opacity", String(opacity))
  if (ambitoId) params.set("ambito", ambitoId)
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`)
}

interface ServicioEstado { nombre: string; estado: 'ok' | 'caido'; fuente: string; ms: number }

export default function MapaPage() {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [activeCapas, setActiveCapas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
    const params = readUrlParams()
    return params ? [params.lat, params.lng] : [40.0, -3.7]
  })
  const [mapZoom, setMapZoom] = useState(() => readUrlParams()?.zoom ?? 6)
  const [baseLayer, setBaseLayer] = useState(() => readUrlParams()?.base ?? "osm")
  const [baseOpacity, setBaseOpacity] = useState(() => {
    const o = parseInt(readUrlParams()?.opacity || "", 10)
    return isNaN(o) ? 100 : Math.min(100, Math.max(0, o))
  })
  const [fileLayers, setFileLayers] = useState<FileLayer[]>([])
  const [zoomToLayerId, setZoomToLayerId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<'capas' | 'archivo' | 'ambitos'>('capas')
  const [soilGeoJSON, setSoilGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)

  // --- Ámbito de trabajo (Fase 1) ---
  const [modoDibujo, setModoDibujo] = useState<ModoDibujo>(null)
  const [ambito, setAmbito] = useState<Ambito | null>(null)
  const [nombreAmbito, setNombreAmbito] = useState("")
  const [perfil, setPerfil] = useState<PerfilId>('parcela')
  const [presetModificado, setPresetModificado] = useState(false)
  const [encuadrarKey, setEncuadrarKey] = useState(0)
  const [volarA, setVolarA] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null)
  const [misAmbitos, setMisAmbitos] = useState<Ambito[]>(() => listarAmbitos())
  const [busqueda, setBusqueda] = useState("")
  const [msgBusqueda, setMsgBusqueda] = useState<string | null>(null)
  const [servicios, setServicios] = useState<ServicioEstado[] | null>(null)
  // --- Cruce automático (Fase 2) ---
  const [filasCruce, setFilasCruce] = useState<FilaCruce[] | null>(null)
  const [cruceCorriendo, setCruceCorriendo] = useState(false)
  const [progresoCruce, setProgresoCruce] = useState({ hechas: 0, total: 0, capaActual: "" })
  const abortCruceRef = useRef<AbortController | null>(null)
  const capasRef = useRef<CapaWMS[]>([])
  useEffect(() => { capasRef.current = capas }, [capas])
  // Refs para el cierre de ejecutarCruce (evitar stale state en el debounce)
  const nombreAmbitoRef = useRef("")
  const perfilRef = useRef<PerfilId>('parcela')
  const presetModificadoRef = useRef(false)
  const catastroRef = useRef<{ ref: string; municipio: string } | null>(null)
  useEffect(() => { nombreAmbitoRef.current = nombreAmbito }, [nombreAmbito])
  useEffect(() => { perfilRef.current = perfil }, [perfil])
  useEffect(() => { presetModificadoRef.current = presetModificado }, [presetModificado])
  // --- Dictamen por perfil (Fase 3) ---
  const [dictamen, setDictamen] = useState<DictamenResultado | null>(null)
  const [dictamenCargando, setDictamenCargando] = useState(false)
  const [dictamenError, setDictamenError] = useState<string | null>(null)
  const [fechaDictamen, setFechaDictamen] = useState("")
  const [catastroInfo, setCatastroInfo] = useState<{ ref: string; municipio: string } | null>(null)
  useEffect(() => { catastroRef.current = catastroInfo }, [catastroInfo])
  // --- Alcance territorial (CCAA del recinto; el cruce nunca sale de aquí) ---
  const [territorio, setTerritorio] = useState<TerritorioAmbito | null>(null)
  const [filtroCA, setFiltroCA] = useState<string>('todas')
  const territorioRef = useRef<TerritorioAmbito | null>(null)
  useEffect(() => { territorioRef.current = territorio }, [territorio])
  const filtroCARef = useRef('todas')
  useEffect(() => { filtroCARef.current = filtroCA }, [filtroCA])

  /** CCAA que manda en el cruce: el filtro elegido, o la resuelta si es "todas". */
  const ccaaAlcance = filtroCA === 'todas' ? territorio?.ccaa : filtroCA

  /** Estatales siempre; autonómicas solo si son del alcance. Municipales, si existieran, igual. */
  function enAlcance(capa: { estatal?: boolean; comunidad_autonoma?: { nombre?: string } | null }): boolean {
    if (capa.estatal) return true
    const ca = capa.comunidad_autonoma?.nombre || ''
    if (!ccaaAlcance) return ca === 'Estatal'
    return mismaCCAA(ca, ccaaAlcance)
  }
  // --- Documentación de salida (Fase 4) ---
  const [descargando, setDescargando] = useState<'pdf' | 'word' | 'paquete' | null>(null)
  const [msgDescarga, setMsgDescarga] = useState<string | null>(null)

  const descargar = useCallback(async (tipo: 'pdf' | 'word' | 'paquete') => {
    if (!dictamen || !ambito) return
    setDescargando(tipo)
    setMsgDescarga(null)
    try {
      const res = await fetch(`/api/dictamen/${tipo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: ambito.nombre,
          perfilLabel: PERFILES.find(p => p.id === ambito.perfil_id)?.label || ambito.perfil_id,
          dictamen,
          geojson: ambito.geojson,
          fecha: fechaDictamen,
          codigo: '',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') || ''
      const m = cd.match(/filename="([^"]+)"/)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = m ? m[1] : `dictamen.${tipo === 'paquete' ? 'zip' : tipo}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setMsgDescarga('Archivo generado con la misma plantilla de la pantalla.')
    } catch (e) {
      setMsgDescarga(e instanceof Error ? `No se pudo generar: ${e.message}` : 'No se pudo generar el archivo.')
    } finally {
      setDescargando(null)
    }
  }, [dictamen, ambito, fechaDictamen])
  const initializedRef = useRef(false)
  const initialCapasRef = useRef<string[]>([])
  const initialAmbitoRef = useRef<string>("")

  useEffect(() => {
    const params = readUrlParams()
    if (params) {
      if (params.capas.length > 0) initialCapasRef.current = params.capas
      if (params.ambito) initialAmbitoRef.current = params.ambito
    }
    fetch("/api/estado-servicios").then(r => r.json()).then(j => {
      if (!j.error) setServicios(j.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    async function fetchCapas() {
      try {
        const res = await fetch("/api/capas-wms")
        const json = await res.json()
        if (!json.error && json.data) {
          setCapas(json.data)
          const initialCapas = initialCapasRef.current
          if (initialCapas.length > 0) {
            const validIds = json.data.map((c: CapaWMS) => c.id)
            setActiveCapas(initialCapas.filter((id: string) => validIds.includes(id)))
          }
          initializedRef.current = true
        }
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    fetchCapas()
  }, [])

  // Restaurar ámbito guardado vía ?ambito=<id>
  useEffect(() => {
    if (!initialAmbitoRef.current) return
    const found = listarAmbitos().find(a => a.id === initialAmbitoRef.current)
    if (found) {
      setAmbito(found)
      setNombreAmbito(found.nombre)
      setPerfil(found.perfil_id)
      setEncuadrarKey(k => k + 1)
    }
    initialAmbitoRef.current = ""
  }, [])

  useEffect(() => {
    if (!initializedRef.current) return
    writeUrlParams(mapCenter[0], mapCenter[1], mapZoom, activeCapas, baseLayer, baseOpacity, ambito?.id || "")
  }, [mapCenter, mapZoom, activeCapas, baseLayer, baseOpacity, ambito])

  const handleMapMove = useCallback((lat: number, lng: number, zoom: number) => {
    setMapCenter([lat, lng])
    setMapZoom(zoom)
  }, [])

  const activarAmbito = useCallback((geojson: GeoJSON.FeatureCollection, nombre?: string) => {
    const tipo = tipoDeGeoJSON(geojson)
    const a = nuevoAmbito(nombre || nombreAmbito || "Ámbito sin nombre", perfil, geojson, tipo)
    setAmbito(a)
    setModoDibujo(null)
    setEncuadrarKey(k => k + 1)
    // Resolución territorial inmediata: centroide → CCAA/municipio (PostGIS),
    // con Nominatim como respaldo. Autoselecciona "Limitar a".
    void (async () => {
      let t: TerritorioAmbito | null = null
      try {
        const c = turf.centroid(geojson)
        const [lng, lat] = c.geometry.coordinates
        const res = await fetch(`/api/territorio?lat=${lat}&lng=${lng}`)
        const json = await res.json()
        if (!json.error && json.data) {
          t = {
            municipio: json.data.municipio, ine: json.data.codigo_ine,
            provincia: json.data.provincia, ccaa: json.data.ccaa, exacto: !!json.data.exacto,
          }
        }
      } catch { /* respaldo abajo */ }
      if (!t) {
        try {
          const c = turf.centroid(geojson)
          const [lng, lat] = c.geometry.coordinates
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=es`, { headers: { Accept: 'application/json' } })
          const j = await res.json()
          const estado = j?.address?.state || ''
          const mun = j?.address?.city || j?.address?.town || j?.address?.village || j?.address?.municipality || ''
          if (estado) t = { municipio: mun, ine: '', provincia: '', ccaa: estado, exacto: false }
        } catch { /* sin territorio: el cruce queda solo con estatales */ }
      }
      if (t) {
        const terr = t
        setTerritorio(terr)
        setAmbito(cur => (cur && cur.id === a.id ? { ...cur, territorio: terr } : cur))
        // Autoseleccionar la opción del desplegable que corresponda a la CCAA
        const opciones = [...new Set(capasRef.current.map(c => c.comunidad_autonoma?.nombre).filter(Boolean) as string[])]
        const exacta = opciones.find(o => o === terr.ccaa)
          || opciones.find(o => mismaCCAA(o, terr.ccaa))
        if (exacta) setFiltroCA(exacta)
      }
    })()
  }, [nombreAmbito, perfil])

  const onDibujarPoligono = useCallback((g: GeoJSON.FeatureCollection) => activarAmbito(g), [activarAmbito])
  const onDibujarLinea = useCallback((g: GeoJSON.FeatureCollection) => activarAmbito(g), [activarAmbito])
  const onDibujarPunto = useCallback((lat: number, lng: number) => {
    activarAmbito({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } }] })
  }, [activarAmbito])

  const addFileLayer = useCallback((layer: FileLayer) => {
    setFileLayers(prev => [...prev, layer])
    // El archivo se convierte en ámbito activo (con validación de recinto)
    const v = validarRecinto(layer.geojson)
    if (v.ok) {
      activarAmbito(layer.geojson, layer.nombre)
    }
  }, [activarAmbito])

  const guardar = useCallback(() => {
    if (!ambito) return
    const a: Ambito = {
      ...ambito,
      nombre: nombreAmbito.trim() || ambito.nombre,
      perfil_id: perfil,
      dictamen: dictamen ? {
        estado: dictamen.estado,
        confianza: dictamen.confianza,
        subtitulo_pendiente: dictamen.subtitulo_pendiente,
        fecha: fechaDictamen,
      } : ambito.dictamen || null,
      updated_at: new Date().toISOString(),
    }
    setAmbito(a)
    setMisAmbitos(guardarAmbito(a))
  }, [ambito, nombreAmbito, perfil, dictamen, fechaDictamen])

  const cargarAmbito = useCallback((a: Ambito) => {
    setAmbito(a)
    setNombreAmbito(a.nombre)
    setPerfil(a.perfil_id)
    if (a.territorio) {
      setTerritorio(a.territorio)
      const opciones = [...new Set(capasRef.current.map(c => c.comunidad_autonoma?.nombre).filter(Boolean) as string[])]
      const exacta = opciones.find(o => o === a.territorio?.ccaa)
        || opciones.find(o => a.territorio && mismaCCAA(o, a.territorio.ccaa))
      if (exacta) setFiltroCA(exacta)
    }
    setEncuadrarKey(k => k + 1)
  }, [])

  const eliminarAmbito = useCallback((id: string) => {
    setMisAmbitos(borrarAmbito(id))
    setAmbito(cur => (cur?.id === id ? null : cur))
    setFilasCruce(null)
    setDictamen(null)
  }, [])

  const toggleCapa = useCallback((id: string) => {
    setActiveCapas(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      return next
    })
    setPresetModificado(true)
  }, [])

  const toggleFamilia = useCallback((fam: string, activar: boolean, ids: string[]) => {
    setActiveCapas(prev => activar ? [...new Set([...prev, ...ids])] : prev.filter(x => !ids.includes(x)))
    setPresetModificado(true)
  }, [])

  const aplicarPreset = useCallback((p: PerfilId) => {
    setPerfil(p)
    setPresetModificado(false)
    // Solo capas en alcance: estatales + CCAA del recinto (o filtro elegido).
    const filtro = filtroCARef.current
    const terr = territorioRef.current
    const alcance = filtro === 'todas' ? terr?.ccaa : filtro
    const idsPorFamilia: Record<string, string[]> = {}
    for (const c of capas) {
      const esEstatal = !!c.estatal
      const ca = c.comunidad_autonoma?.nombre || ''
      if (!esEstatal && !(alcance && mismaCCAA(ca, alcance))) continue
      const f = (c.familia as string) || 'usos'
      if (!idsPorFamilia[f]) idsPorFamilia[f] = []
      idsPorFamilia[f].push(c.id)
    }
    const preset = PRESETS_PERFIL[p]
    setActiveCapas(preset.flatMap(f => idsPorFamilia[f] || []))
  }, [capas])

  // --- Buscador unificado: lugar | coordenadas | referencia catastral ---
  const buscar = useCallback(async () => {
    const q = busqueda.trim()
    if (!q) return
    setMsgBusqueda(null)
    // 1. Coordenadas
    const coords = parseCoordenadas(q)
    if (coords) {
      setVolarA({ ...coords, zoom: 15, key: Date.now() })
      setMsgBusqueda(`Coordenadas ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
      return
    }
    // 2. Referencia catastral (14–20 alfanuméricos)
    const rc = q.replace(/[^0-9A-Za-z]/g, '')
    if (rc.length >= 14 && rc.length <= 20 && /^[0-9]{7}[A-Z]{2}[0-9]{4}[0-9A-Z]{1,5}$/i.test(rc)) {
      setMsgBusqueda("Consultando Catastro…")
      try {
        const res = await fetch(`/api/catastro?rc=${encodeURIComponent(rc)}`)
        const json = await res.json()
        if (json.error || !json.data) {
          setMsgBusqueda(json.error || "Catastro sin respuesta. Puedes dibujar el ámbito a mano.")
          return
        }
        setCatastroInfo({ ref: rc.toUpperCase(), municipio: json.data.municipio || '' })
        // OVC devuelve UTM (ETRS89 huso 30 por defecto en península); informar sin volar a ciegas
        setMsgBusqueda(`Catastro: ${json.data.municipio || ''} ${json.data.direccion || ''} (coord. UTM ${json.data.x}, ${json.data.y} — dibuja o ajusta el ámbito sobre la zona)`)
      } catch {
        setMsgBusqueda("Catastro sin respuesta. Puedes dibujar el ámbito a mano.")
      }
      return
    }
    // 3. Lugar / municipio
    setMsgBusqueda("Buscando lugar…")
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
      })
      const arr = await res.json()
      if (Array.isArray(arr) && arr.length > 0) {
        const lat = parseFloat(arr[0].lat), lng = parseFloat(arr[0].lon)
        setVolarA({ lat, lng, zoom: 13, key: Date.now() })
        setMsgBusqueda(arr[0].display_name?.split(',').slice(0, 3).join(',') || "")
      } else {
        // Fallback: municipio en BD propia
        const r2 = await fetch(`/api/municipios?search=${encodeURIComponent(q)}&limit=5`)
        const j2 = await r2.json()
        if (j2.data?.length > 0) setMsgBusqueda(`Municipio en registro: ${j2.data.map((m: { nombre: string }) => m.nombre).join(', ')}. Centra el mapa y dibuja el ámbito.`)
        else setMsgBusqueda("Sin resultados. Prueba con municipio, coordenadas o referencia catastral.")
      }
    } catch {
      setMsgBusqueda("Buscador sin respuesta. Prueba con coordenadas.")
    }
  }, [busqueda])

  // --- Cruce automático: al cerrar el recinto (Fase 2) ---
  const ejecutarCruce = useCallback(async (
    ambitoGeo: GeoJSON.FeatureCollection,
    listaCapas: CapaWMS[],
    activas: string[],
    suelo: GeoJSON.FeatureCollection | null,
  ) => {
    abortCruceRef.current?.abort()
    const ctrl = new AbortController()
    abortCruceRef.current = ctrl
    // Alcance: estatales siempre + CCAA del recinto (o filtro elegido).
    // Ninguna capa de otra comunidad entra en la consulta ni en la tabla.
    const filtro = filtroCARef.current
    const terr = territorioRef.current
    const alcance = filtro === 'todas' ? terr?.ccaa : filtro
    const capasCruce: CapaCruce[] = listaCapas
      .filter(c => activas.includes(c.id))
      .filter(c => {
        if (c.estatal) return true
        return !!alcance && mismaCCAA(c.comunidad_autonoma?.nombre || '', alcance)
      })
      .map(c => ({
        id: c.id,
        nombre: c.nombre_capa,
        titulo: c.layer_title || undefined,
        familia: c.familia || 'usos',
        severidad: c.severidad || 'informativo',
        norma_ref: c.norma_ref || '',
        url_servicio: c.url_servicio,
        nombre_capa: c.nombre_capa,
        fecha_verificacion: c.fecha_verificacion,
      }))
    if (suelo && suelo.features.length > 0) {
      capasCruce.push({
        id: 'soil-local', nombre: 'Clasificación de suelo (provincias cargadas)',
        familia: 'planeamiento', severidad: 'condicionante',
        norma_ref: 'Clasificación de suelo por provincia (apoyo)',
        url_servicio: '', nombre_capa: '', fecha_verificacion: 's.f.',
        local: suelo,
        etiquetaLocal: (p) => String(p.ClaseSuelo || p.CLASE || 'suelo clasificado'),
      })
    }
    if (capasCruce.length === 0) { setFilasCruce([]); return }
    setCruceCorriendo(true)
    setDictamen(null)
    setDictamenError(null)
    setProgresoCruce({ hechas: 0, total: capasCruce.length, capaActual: "" })
    try {
      const filas = await cruzarAmbito(ambitoGeo, capasCruce, {
        signal: ctrl.signal,
        onProgreso: (p) => setProgresoCruce(p),
      })
      if (ctrl.signal.aborted) return
      setFilasCruce(filas)
      // Dictamen: mismo objeto que consumirán PDF y expediente
      setDictamenCargando(true)
      try {
        let superficie_m2 = 0
        try { superficie_m2 = turf.area(ambitoGeo) } catch { superficie_m2 = 0 }
        const res = await fetch('/api/dictamen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ambito: { nombre: nombreAmbitoRef.current || 'Ámbito sin nombre', perfil_id: perfilRef.current, geojson: ambitoGeo, preset_modificado: presetModificadoRef.current },
            filas,
            ficha: {
              superficie_m2,
              ref_catastral: catastroRef.current?.ref || '—',
              uso: 'no disponible',
            },
            municipio: (() => {
              const t = territorioRef.current
              if (t?.municipio) return { nombre: t.municipio, ine: t.ine || undefined }
              if (catastroRef.current?.municipio) return { nombre: catastroRef.current.municipio }
              return undefined
            })(),
          }),
        })
        const json = await res.json()
        if (json.error || !json.data) setDictamenError(json.error || 'Dictamen sin respuesta.')
        else {
          setDictamen(json.data.resultado)
          setFechaDictamen(new Date(json.data.fecha || Date.now()).toLocaleString('es-ES'))
        }
      } catch {
        setDictamenError('Dictamen sin respuesta. El cruce queda visible arriba.')
      } finally {
        setDictamenCargando(false)
      }
    } catch { /* abortado */ } finally {
      if (!ctrl.signal.aborted) setCruceCorriendo(false)
    }
  }, [])

  // Auto-cruce al cerrar/cambiar el ámbito o el alcance (debounce 1 s, abortable)
  useEffect(() => {
    if (!ambito || !validarRecinto(ambito.geojson).ok || activeCapas.length === 0) return
    const t = setTimeout(() => {
      ejecutarCruce(ambito.geojson, capas, activeCapas, soilGeoJSON)
    }, 1000)
    return () => clearTimeout(t)
  }, [ambito, activeCapas, capas, soilGeoJSON, filtroCA, territorio, ejecutarCruce])

  const medidaAmbito = (() => {    if (!ambito) return null
    try {
      if (ambito.tipo === 'poligono') {
        const m2 = turf.area(ambito.geojson as GeoJSON.FeatureCollection)
        return `${m2 < 10000 ? `${Math.round(m2)} m²` : `${(m2 / 10000).toFixed(2)} ha`}`
      }
      if (ambito.tipo === 'linea') {
        const km = turf.length(ambito.geojson as GeoJSON.FeatureCollection, { units: 'kilometers' })
        return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`
      }
      return "punto (no acredita superficie)"
    } catch { return null }
  })()
  const validacion = ambito ? validarRecinto(ambito.geojson) : null

  const selectedCapas = capas
    .filter(c => activeCapas.includes(c.id))
    .map(c => ({ id: c.id, nombre_capa: c.nombre_capa, url_servicio: c.url_servicio, formato_soportado: c.formato_soportado || "image/png" }))

  const caidos = servicios?.filter(s => s.estado === 'caido') || []

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />
      <main className="flex-1">
        {/* Aviso móvil */}
        <p className="lg:hidden px-4 py-2 text-[11px] text-center" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-muted)' }}>
          Estás en móvil: el mapa funciona, pero la experiencia completa de dictamen es de escritorio.
        </p>

        <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4">
          {/* Barra superior: buscador + estado servicios */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center mb-3">
            <div className="flex flex-1 gap-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
                placeholder="Lugar, coordenadas o referencia catastral…"
                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]"
              />
              <button onClick={buscar} className="px-4 py-2 text-sm font-medium rounded-[var(--border-radius)] bg-[var(--color-primary)] text-white hover:opacity-90">
                Buscar
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }} title="Estado de servicios externos">
              {servicios === null && <span>Comprobando servicios…</span>}
              {servicios !== null && servicios.map(s => (
                <span key={s.nombre} className="inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.estado === 'ok' ? '#2ecc71' : '#e74c3c' }} />
                  {s.nombre}
                </span>
              ))}
            </div>
          </div>
          {(msgBusqueda || caidos.length > 0) && (
            <div className="mb-3 flex flex-col gap-1">
              {msgBusqueda && <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{msgBusqueda}</p>}
              {caidos.map(s => (
                <p key={s.nombre} className="text-[11px]" style={{ color: 'var(--color-error-light)' }}>
                  {s.nombre} sin respuesta — el dictamen lo marcará como «sin datos», nunca como verde.
                </p>
              ))}
            </div>
          )}

          {/* Barra de ámbito: dibujo + nombre + perfil + dictamen */}
          <div className="mb-3 flex flex-wrap items-center gap-2 p-2 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]">
            <div className="flex items-center gap-1" role="toolbar" aria-label="Herramientas de dibujo">
              {([['poligono', 'Polígono'], ['punto', 'Punto'], ['linea', 'Línea']] as [ModoDibujo, string][]).map(([m, label]) => (
                <button key={m} onClick={() => setModoDibujo(cur => (cur === m ? null : m))}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border transition-colors ${modoDibujo === m ? 'bg-[var(--color-secondary)] text-white border-[var(--color-secondary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}>
                  {label}
                </button>
              ))}
              <button onClick={() => { setTab('archivo'); setSidebarOpen(true) }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                Subir archivo
              </button>
              <button onClick={() => { setAmbito(null); setModoDibujo(null); setFilasCruce(null); setDictamen(null); setDictamenError(null); setTerritorio(null) }} disabled={!ambito && !modoDibujo}
                className="px-2.5 py-1.5 text-xs rounded-[var(--border-radius)] border border-[var(--color-border)] text-[var(--color-text-secondary)] disabled:opacity-40">
                Borrar
              </button>
            </div>
            <input
              value={nombreAmbito}
              onChange={(e) => setNombreAmbito(e.target.value)}
              placeholder="Nombra el ámbito antes de dictaminar…"
              className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-secondary)]"
            />
            <select value={perfil} onChange={(e) => aplicarPreset(e.target.value as PerfilId)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border border-[var(--color-secondary)] bg-[var(--color-card-bg)] text-[var(--color-text-primary)]"
              title="Perfil de consulta (cambia preset de familias y texto del dictamen, no el motor de cruce)">
              {PERFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button onClick={guardar} disabled={!ambito}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border border-[var(--color-border)] text-[var(--color-text-secondary)] disabled:opacity-40">
              Guardar
            </button>
            <button onClick={() => { if (ambito) ejecutarCruce(ambito.geojson, capas, activeCapas, soilGeoJSON) }} disabled={!ambito || !validacion?.ok || cruceCorriendo} title={!ambito ? 'Dibuja o sube un ámbito primero' : 'Cruzar de nuevo contra las capas activas'}
              className="px-3 py-1.5 text-xs font-semibold rounded-[var(--border-radius)] bg-[var(--color-secondary)] text-white disabled:opacity-40">
              {cruceCorriendo ? 'Cruzando…' : 'Dictaminar'}
            </button>
          </div>
          {modoDibujo && (
            <p className="mb-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              {modoDibujo === 'poligono' && 'Clic para añadir vértices · doble clic o Intro para cerrar el recinto · Esc para cancelar.'}
              {modoDibujo === 'linea' && 'Clic para añadir puntos · doble clic o Intro para terminar · Esc para cancelar.'}
              {modoDibujo === 'punto' && 'Clic en el mapa para situar el punto. El punto no acredita superficie.'}
            </p>
          )}

          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Mapa casi completo */}
            <div className="flex-1 min-h-[55vh] lg:min-h-[72vh]">
              <div className="h-full min-h-[55vh] lg:min-h-[72vh] rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden" style={{ position: 'relative', zIndex: 0 }}>
                <VisorMapa
                  capasActivas={selectedCapas}
                  fileLayers={fileLayers}
                  soilGeoJSON={soilGeoJSON}
                  center={mapCenter}
                  zoom={mapZoom}
                  baseLayer={baseLayer}
                  baseOpacity={baseOpacity}
                  onMapMove={handleMapMove}
                  onBaseLayerChange={setBaseLayer}
                  onBaseOpacityChange={setBaseOpacity}
                  zoomToLayerId={zoomToLayerId}
                  onZoomToDone={() => setZoomToLayerId(null)}
                  modoDibujo={modoDibujo}
                  ambitoGeoJSON={ambito?.geojson || null}
                  encuadrarAmbitoKey={encuadrarKey}
                  volarA={volarA}
                  onDibujarPoligono={onDibujarPoligono}
                  onDibujarPunto={onDibujarPunto}
                  onDibujarLinea={onDibujarLinea}
                />
              </div>
              {/* Resumen de ámbito */}
              {ambito && (
                <div className="mt-2 px-3 py-2 text-xs rounded-[var(--border-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)]" style={{ color: 'var(--color-text-secondary)' }}>
                  <strong className="text-[var(--color-text-primary)]">{ambito.nombre}</strong>
                  {' · '}{ambito.tipo}{medidaAmbito ? ` · ${medidaAmbito}` : ''}
                  {ambito.tipo !== 'poligono' && ' · no acredita superficie'}
                  {!validacion?.ok && <span style={{ color: 'var(--color-error-light)' }}> · {validacion?.motivo}</span>}
                  {presetModificado && ' · preset modificado por el usuario'}
                  {(territorio || ccaaAlcance) && (
                    <span className="block mt-0.5">
                      Territorio: {territorio ? `${territorio.municipio || 'municipio s.d.'}${territorio.provincia ? ` (${territorio.provincia})` : ''} · ${territorio.ccaa}${territorio.exacto ? '' : ' (aprox.)'}` : ccaaAlcance}
                      {' · '}cruce acotado a {capas.filter(c => activeCapas.includes(c.id) && enAlcance(c)).length} capas (estatales + {ccaaAlcance || 'sin CCAA'})
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Toggle móvil */}
            <div className="lg:hidden">
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                className="w-full px-4 py-2 text-xs font-medium bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)]">
                Panel{activeCapas.length > 0 && ` (${activeCapas.length} capas)`} · {ambito ? '1 ámbito' : 'sin ámbito'}
              </button>
            </div>

            {/* Lateral */}
            <div className={`w-full shrink-0 lg:w-80 ${sidebarOpen ? 'block' : 'hidden'} lg:block`}>
              <div className="lg:sticky lg:top-16 border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] bg-[var(--color-card-bg)] overflow-hidden" style={{ maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
                <div className="flex border-b border-[var(--color-border)]">
                  {([['capas', 'Capas'], ['archivo', 'Archivo'], ['ambitos', `Ámbitos (${misAmbitos.length})`]] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 px-2 py-2 text-xs font-medium ${tab === t ? 'text-[var(--color-secondary)] border-b-2 border-[var(--color-secondary)]' : 'text-[var(--color-text-secondary)]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto" style={{ minHeight: 200 }}>
                  {tab === 'capas' && (
                    loading ? <p className="p-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>Cargando capas…</p>
                      : <ControlCapas capasSeleccionadas={activeCapas} onToggleCapa={toggleCapa} onToggleFamilia={toggleFamilia} filtroCA={filtroCA} onFiltroCAChange={setFiltroCA} />
                  )}
                  {tab === 'archivo' && (
                    <FileLayerPanel
                      fileLayers={fileLayers}
                      onAdd={addFileLayer}
                      onRemove={(id) => setFileLayers(prev => prev.filter(l => l.id !== id))}
                      onToggle={(id) => setFileLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))}
                      onColorChange={(id, color) => setFileLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l))}
                      onFillOpacityChange={(id, v) => setFileLayers(prev => prev.map(l => l.id === id ? { ...l, fillOpacity: v } : l))}
                      onWeightChange={(id, v) => setFileLayers(prev => prev.map(l => l.id === id ? { ...l, weight: v } : l))}
                      onBorderColorChange={(id, v) => setFileLayers(prev => prev.map(l => l.id === id ? { ...l, borderColor: v } : l))}
                      onZoomTo={setZoomToLayerId}
                      onSoilToggle={setSoilGeoJSON}
                    />
                  )}
                  {tab === 'ambitos' && (
                    <div className="p-3 flex flex-col gap-2">
                      {misAmbitos.length === 0 && (
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Sin ámbitos guardados. Dibuja o sube un recinto, nómbralo y pulsa Guardar. El archivo de sesión se mantiene como apoyo; el trabajo real es el ámbito guardado.
                        </p>
                      )}
                      {misAmbitos.map(a => (
                        <div key={a.id} className="p-2 rounded-[var(--border-radius)] border border-[var(--color-border-subtle)]">
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{a.nombre}</p>
                          <p className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                            {a.dictamen ? (
                              <>
                                <span className="inline-block w-2 h-2 rounded-full" style={{
                                  background: a.dictamen.estado === 'compatible' ? '#27ae60' : a.dictamen.estado === 'condicionado' ? '#d4a017' : '#e74c3c',
                                }} />
                                {a.dictamen.estado === 'compatible' ? 'Compatible' : a.dictamen.estado === 'condicionado' ? 'Condicionado' : 'Incompatible'}
                                {' · '}{a.dictamen.fecha || new Date(a.updated_at).toLocaleDateString('es-ES')}
                              </>
                            ) : (
                              <>{a.tipo} · {PERFILES.find(p => p.id === a.perfil_id)?.label} · {new Date(a.updated_at).toLocaleDateString('es-ES')}</>
                            )}
                          </p>
                          <div className="mt-1 flex gap-2">
                            <button onClick={() => cargarAmbito(a)} className="text-[11px] font-medium text-[var(--color-secondary)]">Abrir</button>
                            <button onClick={() => eliminarAmbito(a.id)} className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Borrar</button>
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Radar de boletines: pendiente hasta que exista dictamen (Fase 5).</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Ficha de dictamen: seis bloques, títulos fijos (Fase 3) */}
          <section className="mt-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Dictamen del ámbito</h2>
              {dictamen && <SemaforoBadge estado={dictamen.estado} pendiente={dictamen.subtitulo_pendiente} />}
              {dictamen && (
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  confianza {dictamen.confianza}{fechaDictamen ? ` · ${fechaDictamen}` : ''}
                </span>
              )}
            </div>
            {!ambito && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Dibuja o sube un ámbito para empezar. La ficha con los seis bloques aparecerá aquí.
              </p>
            )}
            {ambito && (cruceCorriendo || dictamenCargando) && (
              <div className="mt-2">
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {cruceCorriendo
                    ? `Cruzando ${progresoCruce.hechas}/${progresoCruce.total}${progresoCruce.capaActual ? ` · ${progresoCruce.capaActual}` : ''}…`
                    : 'Redactando dictamen…'}
                </p>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--color-input-bg)] overflow-hidden">
                  <div className="h-full bg-[var(--color-secondary)] transition-all"
                    style={{ width: progresoCruce.total ? `${Math.round((progresoCruce.hechas / progresoCruce.total) * 100)}%` : '0%' }} />
                </div>
              </div>
            )}
            {ambito && !cruceCorriendo && !dictamenCargando && filasCruce && filasCruce.length === 0 && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Activa capas por familia para cruzar el ámbito. Sin capas no hay cruce.
              </p>
            )}
            {dictamenError && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-error-light)' }}>{dictamenError}</p>
            )}
            {dictamen && ambito && (
              <div className="mt-3 flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Identificación del ámbito</h3>
                  <dl className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <FichaFila k="Ámbito" v={ambito.nombre} />
                    <FichaFila k="Perfil" v={PERFILES.find(p => p.id === ambito.perfil_id)?.label || ambito.perfil_id} />
                    <FichaFila k="Municipio" v={dictamen.ficha.municipio} />
                    <FichaFila k="Código INE" v={dictamen.ficha.ine} />
                    <FichaFila k="Referencia catastral" v={dictamen.ficha.ref_catastral} />
                    <FichaFila k="Superficie" v={dictamen.ficha.superficie_m2 > 0 ? `${dictamen.ficha.superficie_m2.toLocaleString('es-ES')} m²` : 'no acreditada (punto o línea)'} />
                    <FichaFila k="Uso" v={dictamen.ficha.uso} />
                    <FichaFila k="Clasificación" v={dictamen.ficha.clasificacion} />
                    <FichaFila k="Calificación" v={dictamen.ficha.calificacion} />
                  </dl>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Dictamen del ámbito</h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-primary)]">{dictamen.parrafo}</p>
                  <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {dictamen.motivos.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Afecciones que condicionan</h3>
                  {dictamen.afecciones.length === 0 ? (
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Sin solapes ni condicionantes en las fuentes consultadas.</p>
                  ) : (
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                            <th className="py-1 pr-2 font-medium">Familia / capa</th>
                            <th className="py-1 pr-2 font-medium">Resultado</th>
                            <th className="py-1 pr-2 font-medium">Sentido práctico</th>
                            <th className="py-1 pr-2 font-medium">Fuente y fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dictamen.afecciones.map(f => (
                            <tr key={f.capa} className="border-t border-[var(--color-border-subtle)] align-top">
                              <td className="py-1.5 pr-2">
                                <span className="block font-medium text-[var(--color-text-primary)]">{f.capa}</span>
                                <span className="block text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{tituloFamilia(f.familia)}</span>
                              </td>
                              <td className="py-1.5 pr-2 whitespace-nowrap"><ResultadoBadge resultado={f.resultado} /></td>
                              <td className="py-1.5 pr-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{f.frase}</td>
                              <td className="py-1.5 pr-2 text-[10px] whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                                {f.fuente} · {f.fecha_fuente}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Planeamiento de referencia</h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{dictamen.planeamiento.siu_figura}</p>
                  {dictamen.planeamiento.instrumentos.length > 0 && (
                    <ul className="mt-1 text-xs list-disc pl-5" style={{ color: 'var(--color-text-secondary)' }}>
                      {(dictamen.planeamiento.instrumentos as { tipo: string; estado: string }[]).map((ins, i) => (
                        <li key={i}>{ins.tipo} — {ins.estado}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>{dictamen.planeamiento.nota_siu}</p>
                </div>
                {(ambito.perfil_id === 'cribado' || ambito.perfil_id === 'afecciones') && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Distancias de contexto</h3>
                    {(() => {
                      const dists = dictamen.afecciones.filter(f => f.distancia_m !== null)
                      return dists.length === 0
                        ? <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Sin proximidades medidas en las fuentes consultadas.</p>
                        : <ul className="mt-1 text-xs list-disc pl-5" style={{ color: 'var(--color-text-secondary)' }}>
                          {dists.map((f, i) => <li key={i}>{f.capa}: a {f.distancia_m} m.</li>)}
                        </ul>
                    })()}
                  </div>
                )}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Documentación de salida</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => descargar('pdf')} disabled={descargando !== null}
                      className="px-3 py-1.5 text-xs font-medium rounded-[var(--border-radius)] bg-[var(--color-primary)] text-white disabled:opacity-50">
                      {descargando === 'pdf' ? 'Generando…' : 'Descargar PDF'}
                    </button>
                    <button onClick={() => descargar('word')} disabled={descargando !== null}
                      className="px-3 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border border-[var(--color-border)] disabled:opacity-50">
                      {descargando === 'word' ? 'Generando…' : 'Descargar Word'}
                    </button>
                    <button onClick={() => descargar('paquete')} disabled={descargando !== null}
                      className="px-3 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border border-[var(--color-border)] disabled:opacity-50">
                      {descargando === 'paquete' ? 'Generando…' : 'Paquete QGIS / AutoCAD / Google Earth'}
                    </button>
                  </div>
                  {msgDescarga && <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{msgDescarga}</p>}
                  <details className="mt-1">
                    <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Validez jurídica</summary>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{PIE_LEGAL}</p>
                  </details>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
