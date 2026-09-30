// Geometría de referencia del núcleo político: índice de CUSEC por año y
// correspondencia resultado ↔ seccionado.
//
// ÍNDICE
//   Fuente: GeoServer del INE, WFS 2.0 del espacio WMS_INE_SECCIONES_G01,
//   capa `Secciones_{año}`, SÓLO la propiedad CUSEC (propertyName=CUSEC,
//   outputFormat=csv, sortBy=CUSEC, paginado con count/startIndex).
//   Verificado 2026-09-29: responde en ~4 s por página de 20.000 y publica
//   `numberMatched` (resultType=hits). Existen las capas 2018..2025 (el módulo
//   de la app, src/lib/ine-secciones-geometry.ts, sólo declara 2020..2025).
//   Los polígonos con CSEC='000' son AGREGADOS DE DISTRITO: se excluyen.
//   Se guarda en tmp/audit/sections/cusec-index-{año}.json y se reutiliza.
//
// CORRESPONDENCIA (por municipio)
//   exact                         año del seccionado = año de la elección y los
//                                 conjuntos de CUSEC coinciden en ambos sentidos.
//   exact_code_temporal_mismatch  los conjuntos coinciden en ambos sentidos
//                                 pero el seccionado es de otro año.
//   documented_crosswalk          reservado a un crosswalk oficial documentado.
//                                 No existe ninguno implementado: nunca se asigna.
//   unresolved                    cualquier sección sin polígono o polígono sin
//                                 resultados. Bloquea la publicación del municipio.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CorrespondenceStatus, ElectionGeometryReference } from '../../../src/lib/socideas-secciones-political'

export const WFS_BASE = 'https://www.ine.es/geoserver/WMS_INE_SECCIONES_G01/wfs'
export const WFS_WORKSPACE = 'WMS_INE_SECCIONES_G01'
export const GEOMETRY_SOURCE_LABEL = 'INE — Contornos de secciones censales (GeoServer WMS_INE_SECCIONES_G01)'
/** Años con capa verificada en el WFS del INE (2026-09-29). */
export const CUSEC_INDEX_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025] as const
export const CUSEC_INDEX_DIR = 'tmp/audit/sections'

export interface CusecIndexFile {
  schema: 'cusec-index-v1'
  year: number
  collection: string
  source: string
  retrievedAt: string
  numberMatched: number | null
  featuresRead: number
  districtAggregatesExcluded: number
  duplicatesDropped: number
  invalidDropped: string[]
  municipalities: number
  sections: number
  cusec: string[]
}

export interface CusecIndex {
  year: number
  collection: string
  /** ine5 → CUSEC (10 dígitos) del seccionado de ese año. */
  byMunicipality: Map<string, Set<string>>
  sections: number
}

export function cusecIndexPath(year: number): string {
  return `${CUSEC_INDEX_DIR}/cusec-index-${year}.json`
}

const UA = 'URBIdeas/1.0 (+https://urbideas.com)'

async function fetchText(url: string, timeoutMs = 120000): Promise<string> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
    return await r.text()
  } finally {
    clearTimeout(t)
  }
}

/** Descarga el índice de CUSEC de un año desde el WFS del INE (sólo propiedades). */
export async function downloadCusecIndex(year: number, log: (m: string) => void = () => {}): Promise<CusecIndexFile> {
  const typeName = `${WFS_WORKSPACE}:Secciones_${year}`
  const tn = encodeURIComponent(typeName)
  const hits = await fetchText(`${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}&resultType=hits`)
  const m = hits.match(/numberMatched="(\d+)"/)
  const numberMatched = m ? Number.parseInt(m[1] as string, 10) : null
  const page = 20000
  const raw: string[] = []
  for (let start = 0; start < 200000; start += page) {
    const url =
      `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}` +
      `&outputFormat=csv&propertyName=CUSEC&sortBy=CUSEC&count=${page}&startIndex=${start}`
    let text = ''
    for (let intento = 1; intento <= 3; intento++) {
      try {
        text = await fetchText(url)
        break
      } catch (e) {
        if (intento === 3) throw e
        log(`  reintento ${intento} página ${start}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const lines = text.trim().split(/\r?\n/)
    if (lines[0]?.trim() !== 'FID,CUSEC') throw new Error(`Cabecera CSV inesperada del WFS (${year}): ${lines[0]}`)
    const rows = lines.slice(1)
    for (const l of rows) raw.push((l.split(',')[1] ?? '').trim())
    log(`  Secciones_${year}: página ${start} → ${rows.length}`)
    if (rows.length < page) break
  }
  if (numberMatched !== null && raw.length !== numberMatched) {
    throw new Error(`Índice CUSEC ${year}: leídas ${raw.length} ≠ numberMatched ${numberMatched}`)
  }
  const invalid: string[] = []
  let aggregates = 0
  const set = new Set<string>()
  let dups = 0
  for (const c of raw) {
    if (!/^\d{10}$/.test(c)) {
      invalid.push(c)
      continue
    }
    if (c.slice(7) === '000') {
      aggregates++
      continue
    }
    if (set.has(c)) dups++
    set.add(c)
  }
  const cusec = [...set].sort()
  const muns = new Set(cusec.map((c) => c.slice(0, 5)))
  return {
    schema: 'cusec-index-v1',
    year,
    collection: typeName,
    source:
      `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeName}` +
      '&outputFormat=csv&propertyName=CUSEC&sortBy=CUSEC (paginado count/startIndex)',
    retrievedAt: new Date().toISOString(),
    numberMatched,
    featuresRead: raw.length,
    districtAggregatesExcluded: aggregates,
    duplicatesDropped: dups,
    invalidDropped: invalid.slice(0, 50),
    municipalities: muns.size,
    sections: cusec.length,
    cusec,
  }
}

/** Lee un índice en disco. Tolera formatos alternativos (lista simple, objeto
 *  con `cusec`/`sections`/`codes`, o mapa municipio → lista), por si otro
 *  agente (A1) generó el fichero antes. Devuelve null si no existe. */
export function loadCusecIndexFile(year: number): CusecIndex | null {
  const p = cusecIndexPath(year)
  if (!existsSync(p)) return null
  const j = JSON.parse(readFileSync(p, 'utf8')) as unknown
  let codes: string[] = []
  if (Array.isArray(j)) codes = j.map(String)
  else if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>
    const arr = (o.cusec ?? o.sections ?? o.codes ?? o.CUSEC) as unknown
    if (Array.isArray(arr)) codes = arr.map((x) => (typeof x === 'string' ? x : String((x as { CUSEC?: string }).CUSEC ?? '')))
    else if (o.byMunicipality && typeof o.byMunicipality === 'object') {
      for (const v of Object.values(o.byMunicipality as Record<string, unknown>)) if (Array.isArray(v)) codes.push(...v.map(String))
    }
  }
  const by = new Map<string, Set<string>>()
  let n = 0
  for (const c of codes) {
    if (!/^\d{10}$/.test(c) || c.slice(7) === '000') continue
    const mun = c.slice(0, 5)
    let s = by.get(mun)
    if (!s) by.set(mun, (s = new Set()))
    if (!s.has(c)) n++
    s.add(c)
  }
  if (n === 0) throw new Error(`Índice CUSEC ${p} sin códigos válidos (formato no reconocido)`)
  return { year, collection: `${WFS_WORKSPACE}:Secciones_${year}`, byMunicipality: by, sections: n }
}

/** Devuelve el índice del año (lo descarga y guarda si no existe). */
export async function ensureCusecIndex(year: number, log: (m: string) => void = () => {}): Promise<CusecIndex> {
  const cached = loadCusecIndexFile(year)
  if (cached) return cached
  log(`[geometría] descargando índice CUSEC ${year} del INE…`)
  const file = await downloadCusecIndex(year, log)
  mkdirSync(dirname(cusecIndexPath(year)), { recursive: true })
  writeFileSync(cusecIndexPath(year), JSON.stringify(file))
  log(`[geometría] índice ${year}: ${file.sections} secciones, ${file.municipalities} municipios, ${file.districtAggregatesExcluded} agregados de distrito excluidos`)
  const idx = loadCusecIndexFile(year)
  if (!idx) throw new Error(`No se pudo releer ${cusecIndexPath(year)}`)
  return idx
}

/** Año de seccionado para una fecha de elección: el mismo año si hay capa;
 *  si no, el más cercano disponible (se anota en notes). */
export function geometryYearFor(electionDate: string, available: readonly number[] = CUSEC_INDEX_YEARS): number {
  const y = Number.parseInt(electionDate.slice(0, 4), 10)
  if (available.includes(y)) return y
  const sorted = [...available].sort((a, b) => Math.abs(a - y) - Math.abs(b - y) || a - b)
  return sorted[0] as number
}

/** Correspondencia de un municipio. Pura: recibe los dos conjuntos. */
export function correspondence(args: {
  electionDate: string
  geometryYear: number | null
  resultSections: Iterable<string>
  geometrySections: Iterable<string> | null
  geometrySource?: string
}): ElectionGeometryReference {
  const res = new Set(args.resultSections)
  const geo = new Set(args.geometrySections ?? [])
  const unmatchedResult = [...res].filter((c) => !geo.has(c)).sort()
  const unmatchedGeometry = [...geo].filter((c) => !res.has(c)).sort()
  const matched = [...res].filter((c) => geo.has(c)).length
  const electionYear = Number.parseInt(args.electionDate.slice(0, 4), 10)
  const notes: string[] = []
  let status: CorrespondenceStatus
  if (args.geometrySections === null || geo.size === 0) {
    status = 'unresolved'
    notes.push(`Sin secciones del municipio en el seccionado ${args.geometryYear ?? 'ND'} del INE.`)
  } else if (unmatchedResult.length === 0 && unmatchedGeometry.length === 0 && res.size > 0) {
    status = args.geometryYear === electionYear ? 'exact' : 'exact_code_temporal_mismatch'
    if (status === 'exact_code_temporal_mismatch') {
      notes.push(
        `Códigos idénticos, pero el seccionado es de ${args.geometryYear} y la elección de ${electionYear}: los límites pueden diferir.`,
      )
    }
  } else {
    status = 'unresolved'
    if (unmatchedResult.length) notes.push(`${unmatchedResult.length} secciones con resultados sin polígono en ${args.geometryYear}.`)
    if (unmatchedGeometry.length) notes.push(`${unmatchedGeometry.length} polígonos de ${args.geometryYear} sin resultados.`)
    notes.push('No existe crosswalk oficial documentado: no se reasignan resultados entre secciones.')
  }
  return {
    geometryYear: args.geometryYear,
    geometrySource: args.geometrySource ?? GEOMETRY_SOURCE_LABEL,
    electionDate: args.electionDate,
    correspondenceStatus: status,
    resultSections: res.size,
    geometrySections: geo.size,
    matchedSections: matched,
    unmatchedResultSections: unmatchedResult,
    unmatchedGeometrySections: unmatchedGeometry,
    coveragePercentage: res.size ? Math.round((matched / res.size) * 10000) / 100 : 0,
    notes,
  }
}
