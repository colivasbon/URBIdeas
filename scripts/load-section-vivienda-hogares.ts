#!/usr/bin/env node
// Cargador DRY-RUN de vivienda, hogares y actividad 2021 por sección censal.
// No escribe en R2 ni en ningún almacenamiento remoto: sólo genera JSON normalizado local.
//
// FUENTE OFICIAL (verificada en vivo, 2026-09-29)
//   INE · Censos de Población y Viviendas 2021 · "Indicadores para secciones censales"
//   Página:      https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177108&menu=resultados&idp=1254735572981
//   Fichero:     https://www.ine.es/censos2021/C2021_Indicadores.csv   (HTTP 200, 8.049.871 bytes, Last-Modified 30/06/2023)
//   Diccionario: https://www.ine.es/censos2021/indicadores_seccen_c2021.xlsx (hojas "Tablas disponibles" e "indicadores")
//   Geometría:   seccionado a 01/01/2021 (https://www.ine.es/censos2021/Cartografia_secc.zip; geoserver Secciones_2021)
//   Aviso INE:   "Datos provisionales debido a que en ciertas viviendas se está actualizando la sección original".
//
// FORMATO REAL (leído del fichero, no del título)
//   CSV ASCII, separador ',', decimal '.', 41 columnas, 36.333 filas (una por sección, sin agregados):
//   ccaa,cpro,cmun,dist,secc,t1_1 … t22_5
//   CUSEC = cpro(2)+cmun(3)+dist(2)+secc(3). Los porcentajes vienen como PROPORCIÓN 0–1 con 4 decimales.
//   t1_1 y t18_1…t22_5 son recuentos absolutos; t2_1…t17_5 son proporciones sin numerador publicado.
//
// SECRETO ESTADÍSTICO (regla leída del fichero)
//   1.363 secciones traen t1_1 (siempre publicado) y TODAS las demás celdas vacías. Todas tienen
//   t1_1 ≤ 99 y ninguna sección publicada tiene t1_1 < 100 → umbral observado: población < 100.
//   Vacío = ND por secreto estadístico. ND nunca es 0.
//
// USO (sólo dry-run)
//   npx tsx scripts/load-section-vivienda-hogares.ts --municipalities=02003,28079
//   Opciones: --source=<csv local>  --download (fuerza descarga)  --no-geometry
//             --out-dir=tmp/audit/sections/probes/normalized/vivienda-hogares
//
// REGLAS
//   · Sin imputar, interpolar, repartir, promediar porcentajes ni unir por nombre. Unión por CUSEC.
//   · Derivados sólo con numerador y denominador absolutos de la MISMA fila (misma sección y fuente).
//   · Tenencia: denominador = t20_1+t20_2+t20_3 (suma exacta de las tres categorías = universo de la
//     tabla: viviendas principales CONVENCIONALES). Verificado contra la tabla municipal 59529, cuyo
//     "Total (régimen de tenencia)" es esa suma (Albacete 66.328; Madrid 1.322.855). t19_1 incluye además
//     viviendas familiares no convencionales (Albacete: +28 en 3 secciones; 78 secciones en España).
//     La diferencia t19_1 − Σt20 NO se publica (sería recalcular por diferencia); sólo se marca calidad.
//   · Tamaño medio del hogar NO se deriva: la clase "5 o más" es abierta.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PARSER_VERSION = 'ine-c2021-indicadores-seccion/1.0.0'
export const SCHEMA_VERSION = '0.1.0-dryrun'
export const DOMAIN = 'censo2021_vivienda_hogares'
export const SOURCE_URL = 'https://www.ine.es/censos2021/C2021_Indicadores.csv'
export const DICTIONARY_URL = 'https://www.ine.es/censos2021/indicadores_seccen_c2021.xlsx'
export const PAGE_URL =
  'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177108&menu=resultados&idp=1254735572981'
export const ND_TEXT = 'ND — dato no difundido por secreto estadístico.'
const OGC = 'https://www.ine.es/geoserver/ogc/features/v1/collections'
const UA = { 'User-Agent': 'SOCideas/1.0 (+https://urbideas.com)' }

export const EXPECTED_HEADER = [
  'ccaa', 'cpro', 'cmun', 'dist', 'secc',
  't1_1', 't2_1', 't2_2', 't3_1', 't4_1', 't4_2', 't4_3', 't5_1', 't6_1', 't7_1', 't8_1', 't9_1',
  't10_1', 't11_1', 't12_1', 't13_1', 't14_1', 't15_1', 't16_1',
  't17_1', 't17_2', 't17_3', 't17_4', 't17_5',
  't18_1', 't19_1', 't19_2', 't20_1', 't20_2', 't20_3', 't21_1',
  't22_1', 't22_2', 't22_3', 't22_4', 't22_5',
] as const
type Col = (typeof EXPECTED_HEADER)[number]

/** Etiquetas literales del diccionario oficial (hoja "indicadores"). Se contrastan en cada ejecución. */
export const DICTIONARY: Partial<Record<Col, string>> = {
  t1_1: 'Total Personas',
  t10_1: 'Porcentaje de población parada sobre población activa= Parados /Activos',
  t11_1: 'Porcentaje de población ocupada sobre población de 16 y más =Ocupados/ Pob 16 y +',
  t12_1: 'Porcentaje de población activa sobre población de 16 y más= Activos / Pob 16 y +',
  t18_1: 'Total Viviendas',
  t19_1: 'Viviendas Principales',
  t19_2: 'Viviendas No principales',
  t20_1: 'Viviendas en propiedad',
  t20_2: 'Viviendas en alquiler',
  t20_3: 'Viviendas en otro tipo de régimen de tenencia',
  t21_1: 'Total Hogares',
  t22_1: 'Hogares de 1 persona',
  t22_2: 'Hogares de 2 personas',
  t22_3: 'Hogares de 3 personas',
  t22_4: 'Hogares de 4 personas',
  t22_5: 'Hogares de 5 o más personas',
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores
// ─────────────────────────────────────────────────────────────────────────────

type Group = 'vivienda' | 'hogares' | 'actividad_2021' | 'poblacion'
type Kind = 'absoluto' | 'ratio_oficial' | 'derivado'

export interface IndicatorDef {
  id: string
  label: string
  group: Group
  unit: 'personas' | 'viviendas' | 'hogares' | '%'
  kind: Kind
  /** Columna oficial (absoluto / ratio oficial) o numerador (derivado). */
  column: Col
  /** Denominador (sólo derivados): una columna o la suma exacta de varias de la misma fila. */
  denominatorColumn?: Col | Col[]
  denominatorLabel: string | null
  definition: string
}

const abs = (id: string, label: string, group: Group, unit: IndicatorDef['unit'], column: Col, definition: string): IndicatorDef => ({
  id, label, group, unit, kind: 'absoluto', column, denominatorLabel: null, definition,
})
const der = (id: string, label: string, group: Group, column: Col, den: Col | Col[], denominatorLabel: string, definition: string): IndicatorDef => ({
  id, label, group, unit: '%', kind: 'derivado', column, denominatorColumn: den, denominatorLabel, definition,
})
const rat = (id: string, label: string, column: Col, denominatorLabel: string, definition: string): IndicatorDef => ({
  id, label, group: 'actividad_2021', unit: '%', kind: 'ratio_oficial', column, denominatorLabel, definition,
})

export const INDICATORS: IndicatorDef[] = [
  abs('c21_poblacion_total', 'Población total (Censo 2021)', 'poblacion', 'personas', 't1_1', 'Total Personas de la sección a 01/01/2021 (t1_1). Siempre publicado.'),
  // Vivienda
  abs('c21_viviendas_total', 'Viviendas (total)', 'vivienda', 'viviendas', 't18_1', 'Total Viviendas (t18_1).'),
  abs('c21_viviendas_principales', 'Viviendas principales', 'vivienda', 'viviendas', 't19_1', 'Viviendas Principales (t19_1).'),
  abs('c21_viviendas_no_principales', 'Viviendas no principales', 'vivienda', 'viviendas', 't19_2', 'Viviendas No principales (t19_2). El fichero no separa secundarias y vacías.'),
  der('c21_pct_viviendas_no_principales', '% Viviendas no principales', 'vivienda', 't19_2', 't18_1', 'Total Viviendas (t18_1), misma sección', 't19_2 / t18_1 × 100.'),
  abs('c21_viviendas_propiedad', 'Viviendas principales en propiedad', 'vivienda', 'viviendas', 't20_1', 'Viviendas en propiedad (t20_1).'),
  abs('c21_viviendas_alquiler', 'Viviendas principales en alquiler', 'vivienda', 'viviendas', 't20_2', 'Viviendas en alquiler (t20_2).'),
  abs('c21_viviendas_otro_regimen', 'Viviendas principales en otro régimen', 'vivienda', 'viviendas', 't20_3', 'Viviendas en otro tipo de régimen de tenencia (t20_3).'),
  der('c21_pct_propiedad', '% Viviendas principales en propiedad', 'vivienda', 't20_1', ['t20_1', 't20_2', 't20_3'], 'Viviendas principales convencionales con régimen de tenencia (t20_1+t20_2+t20_3), misma sección', 't20_1 / (t20_1+t20_2+t20_3) × 100.'),
  der('c21_pct_alquiler', '% Viviendas principales en alquiler', 'vivienda', 't20_2', ['t20_1', 't20_2', 't20_3'], 'Viviendas principales convencionales con régimen de tenencia (t20_1+t20_2+t20_3), misma sección', 't20_2 / (t20_1+t20_2+t20_3) × 100.'),
  der('c21_pct_otro_regimen', '% Viviendas principales en otro régimen', 'vivienda', 't20_3', ['t20_1', 't20_2', 't20_3'], 'Viviendas principales convencionales con régimen de tenencia (t20_1+t20_2+t20_3), misma sección', 't20_3 / (t20_1+t20_2+t20_3) × 100.'),
  // Hogares
  abs('c21_hogares_total', 'Hogares (total)', 'hogares', 'hogares', 't21_1', 'Total Hogares (t21_1).'),
  abs('c21_hogares_1', 'Hogares de 1 persona', 'hogares', 'hogares', 't22_1', 'Hogares de 1 persona (t22_1).'),
  abs('c21_hogares_2', 'Hogares de 2 personas', 'hogares', 'hogares', 't22_2', 'Hogares de 2 personas (t22_2).'),
  abs('c21_hogares_3', 'Hogares de 3 personas', 'hogares', 'hogares', 't22_3', 'Hogares de 3 personas (t22_3).'),
  abs('c21_hogares_4', 'Hogares de 4 personas', 'hogares', 'hogares', 't22_4', 'Hogares de 4 personas (t22_4).'),
  abs('c21_hogares_5_mas', 'Hogares de 5 o más personas', 'hogares', 'hogares', 't22_5', 'Hogares de 5 o más personas (t22_5).'),
  der('c21_pct_hogares_1', '% Hogares unipersonales', 'hogares', 't22_1', 't21_1', 'Total Hogares (t21_1), misma sección', 't22_1 / t21_1 × 100.'),
  der('c21_pct_hogares_2', '% Hogares de 2 personas', 'hogares', 't22_2', 't21_1', 'Total Hogares (t21_1), misma sección', 't22_2 / t21_1 × 100.'),
  der('c21_pct_hogares_3', '% Hogares de 3 personas', 'hogares', 't22_3', 't21_1', 'Total Hogares (t21_1), misma sección', 't22_3 / t21_1 × 100.'),
  der('c21_pct_hogares_4', '% Hogares de 4 personas', 'hogares', 't22_4', 't21_1', 'Total Hogares (t21_1), misma sección', 't22_4 / t21_1 × 100.'),
  der('c21_pct_hogares_5_mas', '% Hogares de 5 o más personas', 'hogares', 't22_5', 't21_1', 'Total Hogares (t21_1), misma sección', 't22_5 / t21_1 × 100.'),
  // Actividad (ratios oficiales; el fichero no publica numeradores ni la población activa)
  rat('c21_tasa_paro', 'Tasa de paro censal 2021', 't10_1', 'Población activa (no publicada)', 'Parados / Activos (t10_1). No equivale al paro registrado (SEPE).'),
  rat('c21_tasa_empleo', 'Tasa de empleo censal 2021', 't11_1', 'Población de 16 y más años (no publicada)', 'Ocupados / Población de 16 y más (t11_1).'),
  rat('c21_tasa_actividad', 'Tasa de actividad censal 2021', 't12_1', 'Población de 16 y más años (no publicada)', 'Activos / Población de 16 y más (t12_1).'),
]

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

export type ObsStatus = 'observado' | 'derivado_verificable' | 'no_difundido' | 'sin_cobertura' | 'error_ingesta'

export interface Observation {
  value: number | null
  numerator: number | null
  denominator: number | null
  status: ObsStatus
  nd_flag: boolean
  suppression_flag: boolean
  reason: string | null
}

export interface ParsedRow {
  cusec: string
  municipalityCode: string
  cells: Record<Col, number | null>
  /** true si todas las celdas salvo t1_1 vienen vacías (patrón de secreto estadístico). */
  suppressed: boolean
}

export interface ParseResult {
  header: string[]
  rows: ParsedRow[]
  issues: string[]
}

const NUM = /^-?\d+(\.\d+)?$/

export function parseIndicadoresCsv(text: string): ParseResult {
  const issues: string[] = []
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) throw new Error('CSV vacío')
  const header = lines[0].split(',')
  if (header.length !== EXPECTED_HEADER.length || header.some((h, i) => h !== EXPECTED_HEADER[i])) {
    throw new Error(`Cabecera inesperada: ${header.join(',')}`)
  }
  const rows: ParsedRow[] = []
  const seen = new Set<string>()
  for (let li = 1; li < lines.length; li++) {
    const c = lines[li].split(',')
    if (c.length !== header.length) {
      issues.push(`línea ${li + 1}: ${c.length} columnas`)
      continue
    }
    const [, cpro, cmun, dist, secc] = c
    if (!/^\d{2}$/.test(cpro) || !/^\d{3}$/.test(cmun) || !/^\d{2}$/.test(dist) || !/^\d{3}$/.test(secc)) {
      issues.push(`línea ${li + 1}: código territorial inválido`)
      continue
    }
    const cusec = cpro + cmun + dist + secc
    if (seen.has(cusec)) issues.push(`CUSEC duplicado ${cusec}`)
    seen.add(cusec)
    const cells = {} as Record<Col, number | null>
    let bad = false
    for (let i = 5; i < header.length; i++) {
      const raw = c[i]
      const col = header[i] as Col
      if (raw === '') cells[col] = null
      else if (NUM.test(raw)) cells[col] = Number(raw)
      else { cells[col] = null; bad = true; issues.push(`${cusec} ${col}: valor no numérico "${raw}"`) }
    }
    const rest = EXPECTED_HEADER.slice(6) as readonly Col[]
    const suppressed = rest.every((k) => cells[k] === null)
    const partial = !suppressed && rest.some((k) => cells[k] === null)
    if (partial) issues.push(`${cusec}: ND parcial (patrón no observado en la fuente)`)
    if (bad) continue
    rows.push({ cusec, municipalityCode: cpro + cmun, cells, suppressed })
  }
  return { header, rows, issues }
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d

export function observe(def: IndicatorDef, row: ParsedRow): Observation {
  const nd = (reason: string): Observation => ({
    value: null, numerator: null, denominator: null, status: 'no_difundido', nd_flag: true, suppression_flag: true, reason,
  })
  if (row.suppressed && def.column !== 't1_1') return nd('statistical_confidentiality_pob_lt_100')
  const v = row.cells[def.column]
  if (def.kind === 'absoluto') {
    if (v === null) return nd('celda_vacia')
    return { value: v, numerator: v, denominator: null, status: 'observado', nd_flag: false, suppression_flag: false, reason: null }
  }
  if (def.kind === 'ratio_oficial') {
    if (v === null) return nd('celda_vacia')
    // Proporción 0–1 con 4 decimales → % con 2 decimales, sin pérdida.
    return { value: round(v * 100, 2), numerator: null, denominator: null, status: 'observado', nd_flag: false, suppression_flag: false, reason: 'ratio_oficial_sin_numerador_publicado' }
  }
  const dcols = Array.isArray(def.denominatorColumn) ? def.denominatorColumn : [def.denominatorColumn!]
  const parts = dcols.map((k) => row.cells[k])
  const den = parts.some((x) => x === null) ? null : (parts as number[]).reduce((a, b) => a + b, 0)
  if (v === null || den === null) return nd('componente_no_disponible')
  if (den === 0) {
    return { value: null, numerator: v, denominator: 0, status: 'no_difundido', nd_flag: true, suppression_flag: false, reason: 'denominador_cero' }
  }
  return { value: round((v / den) * 100, 4), numerator: v, denominator: den, status: 'derivado_verificable', nd_flag: false, suppression_flag: false, reason: null }
}

export interface CoherenceFlags {
  viviendas_no_suman: boolean
  tenencia_no_suma_principales: boolean
  hogares_distinto_de_principales: boolean
  tamanos_no_suman_hogares: boolean
  proporcion_fuera_de_rango: string[]
}

export function coherence(row: ParsedRow): CoherenceFlags {
  const c = row.cells
  const sum = (ks: Col[]) => (ks.every((k) => c[k] !== null) ? ks.reduce((a, k) => a + (c[k] as number), 0) : null)
  const v19 = sum(['t19_1', 't19_2'])
  const t20 = sum(['t20_1', 't20_2', 't20_3'])
  const t22 = sum(['t22_1', 't22_2', 't22_3', 't22_4', 't22_5'])
  const props: Col[] = ['t2_1', 't2_2', 't4_1', 't4_2', 't4_3', 't5_1', 't6_1', 't7_1', 't8_1', 't9_1', 't10_1', 't11_1', 't12_1', 't13_1', 't14_1', 't15_1', 't16_1', 't17_1', 't17_2', 't17_3', 't17_4', 't17_5']
  return {
    viviendas_no_suman: v19 !== null && c.t18_1 !== null && v19 !== c.t18_1,
    tenencia_no_suma_principales: t20 !== null && c.t19_1 !== null && t20 !== c.t19_1,
    hogares_distinto_de_principales: c.t21_1 !== null && c.t19_1 !== null && c.t21_1 !== c.t19_1,
    tamanos_no_suman_hogares: t22 !== null && c.t21_1 !== null && t22 !== c.t21_1,
    proporcion_fuera_de_rango: props.filter((k) => c[k] !== null && ((c[k] as number) < 0 || (c[k] as number) > 1)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Objeto normalizado por municipio
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceMeta {
  url: string
  bytes: number
  sha256: string
  last_modified: string | null
  dictionary_url: string
  dictionary_sha256: string | null
  dictionary_verified: boolean
}

export function buildMunicipalObject(ine5: string, rows: ParsedRow[], source: SourceMeta, geometryCodes: string[] | null) {
  const mine = rows.filter((r) => r.municipalityCode === ine5).sort((a, b) => a.cusec.localeCompare(b.cusec))
  const availability: Record<string, { observed_sections: number; nd_sections: number; no_coverage_sections: number }> = {}
  for (const d of INDICATORS) availability[d.id] = { observed_sections: 0, nd_sections: 0, no_coverage_sections: 0 }
  const qualityFlags = new Set<string>()
  const coherenceBySection: Record<string, string[]> = {}
  const sections = mine.map((r) => {
    const values: Record<string, Observation> = {}
    for (const d of INDICATORS) {
      const o = observe(d, r)
      values[d.id] = o
      if (o.status === 'observado' || o.status === 'derivado_verificable') availability[d.id].observed_sections++
      else if (o.status === 'no_difundido') availability[d.id].nd_sections++
      else availability[d.id].no_coverage_sections++
    }
    const f = coherence(r)
    const flags = Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v)).map(([k]) => k)
    if (flags.length) { coherenceBySection[r.cusec] = flags; flags.forEach((x) => qualityFlags.add(x)) }
    return { sectionCode: r.cusec, municipalityCode: ine5, provinceCode: ine5.slice(0, 2), suppressed: r.suppressed, values }
  })
  const csvCodes = new Set(mine.map((r) => r.cusec))
  const geometry = geometryCodes
    ? {
        collection: 'Secciones_2021',
        sections_in_geometry: geometryCodes.length,
        csv_not_in_geometry: [...csvCodes].filter((c) => !geometryCodes.includes(c)),
        geometry_not_in_csv: geometryCodes.filter((c) => !csvCodes.has(c)),
      }
    : null
  if (geometry && (geometry.csv_not_in_geometry.length || geometry.geometry_not_in_csv.length)) qualityFlags.add('claves_distintas_de_secciones_2021')
  const body = {
    schema_version: SCHEMA_VERSION,
    domain: DOMAIN,
    mode: 'dry-run',
    period: 2021,
    reference_date: '2021-01-01',
    municipality_code: ine5,
    province_code: ine5.slice(0, 2),
    parser_version: PARSER_VERSION,
    source: {
      operation: 'Censos de Población y Viviendas 2021 — Indicadores para secciones censales',
      organism: 'INE',
      page_url: PAGE_URL,
      ...source,
      provisional_note: 'Datos provisionales debido a que en ciertas viviendas se está actualizando la sección original en la que se encontraban (aviso INE).',
    },
    nd_text: ND_TEXT,
    suppression_rule: 'Secciones con población (t1_1) < 100: el INE deja vacías todas las celdas salvo t1_1.',
    indicators: INDICATORS.map((d) => ({
      id: d.id, label: d.label, group: d.group, unit: d.unit, kind: d.kind, column: d.column,
      official_label: DICTIONARY[d.column] ?? null,
      denominator_columns: d.denominatorColumn === undefined ? null : ([] as Col[]).concat(d.denominatorColumn), denominator: d.denominatorLabel, definition: d.definition,
    })),
    sections,
    coverage: {
      result_sections: sections.length,
      sections_suppressed: sections.filter((s) => s.suppressed).length,
      sections_with_data: sections.filter((s) => !s.suppressed).length,
    },
    indicator_availability: availability,
    geometry,
    coherence_by_section: coherenceBySection,
    quality_flags: [...qualityFlags].sort(),
  }
  const content_sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  return { ...body, content_sha256 }
}

// ─────────────────────────────────────────────────────────────────────────────
// E/S
// ─────────────────────────────────────────────────────────────────────────────

async function download(url: string): Promise<{ buf: Buffer; lastModified: string | null; status: number }> {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  return { buf: Buffer.from(await r.arrayBuffer()), lastModified: r.headers.get('last-modified'), status: r.status }
}

async function verifyDictionary(): Promise<{ sha256: string | null; verified: boolean; issues: string[] }> {
  const issues: string[] = []
  try {
    const { buf } = await download(DICTIONARY_URL)
    const sha256 = createHash('sha256').update(buf).digest('hex')
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets['indicadores']
    if (!ws) return { sha256, verified: false, issues: ['diccionario sin hoja "indicadores"'] }
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
    const map = new Map(rows.map((r) => [String(r[0]).trim(), String(r[1]).replace(/\s+/g, ' ').trim()]))
    for (const [col, label] of Object.entries(DICTIONARY)) {
      if (map.get(col) !== label) issues.push(`diccionario: ${col} = "${map.get(col)}" ≠ "${label}"`)
    }
    return { sha256, verified: issues.length === 0, issues }
  } catch (e) {
    return { sha256: null, verified: false, issues: [`diccionario no verificado: ${(e as Error).message}`] }
  }
}

async function geometryCodes2021(ine5: string): Promise<string[]> {
  const coll = encodeURIComponent('WMS_INE_SECCIONES_G01:Secciones_2021')
  const filter = encodeURIComponent(`CUMUN='${ine5}'`)
  const codes: string[] = []
  for (let start = 0; start < 20000; start += 1000) {
    const url = `${OGC}/${coll}/items?f=json&limit=1000&startIndex=${start}&filter-lang=cql-text&filter=${filter}`
    const r = await fetch(url, { headers: { ...UA, Accept: 'application/geo+json' } })
    if (!r.ok) throw new Error(`geometría HTTP ${r.status}`)
    const j = (await r.json()) as { features?: Array<{ properties?: { CUSEC?: string } }> }
    const feats = j.features ?? []
    for (const f of feats) {
      const c = String(f.properties?.CUSEC ?? '')
      if (/^\d{10}$/.test(c) && !c.endsWith('000')) codes.push(c) // '…000' = polígono agregado de distrito
    }
    if (feats.length < 1000) break
  }
  return [...new Set(codes)].sort()
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  if (flag('write') || flag('publish') || flag('upload')) {
    console.error('Este cargador es SÓLO dry-run: no escribe en R2. Opción rechazada.')
    process.exit(2)
  }
  const municipalities = (arg('municipalities') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!municipalities.length || municipalities.some((m) => !/^\d{5}$/.test(m))) {
    console.error('Uso: --municipalities=02003,28079 (códigos INE de 5 dígitos)')
    process.exit(2)
  }
  const outDir = resolve(arg('out-dir') ?? 'tmp/audit/sections/probes/normalized/vivienda-hogares')
  const localDefault = resolve('tmp/audit/sections/probes/downloads/censos2021/C2021_Indicadores.csv')
  const sourcePath = arg('source') ? resolve(arg('source')!) : localDefault

  let buf: Buffer
  let lastModified: string | null = null
  let origin: string
  if (!flag('download') && existsSync(sourcePath)) {
    buf = readFileSync(sourcePath)
    origin = `local:${sourcePath}`
  } else {
    const d = await download(SOURCE_URL)
    buf = d.buf
    lastModified = d.lastModified
    origin = SOURCE_URL
    mkdirSync(dirname(localDefault), { recursive: true })
    writeFileSync(localDefault, buf)
  }
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const dict = await verifyDictionary()
  const parsed = parseIndicadoresCsv(buf.toString('utf8'))
  const source: SourceMeta = {
    url: SOURCE_URL, bytes: buf.length, sha256, last_modified: lastModified,
    dictionary_url: DICTIONARY_URL, dictionary_sha256: dict.sha256, dictionary_verified: dict.verified,
  }

  mkdirSync(outDir, { recursive: true })
  const manifest: Record<string, unknown> = {
    mode: 'dry-run', parser_version: PARSER_VERSION, generated_at: new Date().toISOString(), origin, source,
    national: {
      rows: parsed.rows.length,
      suppressed_rows: parsed.rows.filter((r) => r.suppressed).length,
      max_t1_1_suppressed: Math.max(...parsed.rows.filter((r) => r.suppressed).map((r) => r.cells.t1_1 ?? 0)),
      min_t1_1_published: Math.min(...parsed.rows.filter((r) => !r.suppressed).map((r) => r.cells.t1_1 ?? Infinity)),
      coherence: {
        viviendas_no_suman: parsed.rows.filter((r) => coherence(r).viviendas_no_suman).length,
        tenencia_no_suma_principales: parsed.rows.filter((r) => coherence(r).tenencia_no_suma_principales).length,
        hogares_distinto_de_principales: parsed.rows.filter((r) => coherence(r).hogares_distinto_de_principales).length,
        tamanos_no_suman_hogares: parsed.rows.filter((r) => coherence(r).tamanos_no_suman_hogares).length,
      },
      parse_issues: parsed.issues.slice(0, 50),
      parse_issue_count: parsed.issues.length,
    },
    dictionary_issues: dict.issues,
    municipalities: {} as Record<string, unknown>,
  }
  for (const ine5 of municipalities) {
    let geo: string[] | null = null
    if (!flag('no-geometry')) {
      try { geo = await geometryCodes2021(ine5) } catch (e) { console.error(`${ine5}: geometría no verificada (${(e as Error).message})`) }
    }
    const obj = buildMunicipalObject(ine5, parsed.rows, source, geo)
    const file = join(outDir, `${ine5}.json`)
    writeFileSync(file, JSON.stringify(obj, null, 1))
    ;(manifest.municipalities as Record<string, unknown>)[ine5] = {
      file: file.replace(/\\/g, '/'),
      sections: obj.coverage.result_sections,
      suppressed: obj.coverage.sections_suppressed,
      geometry: obj.geometry && { in_geometry: obj.geometry.sections_in_geometry, csv_not_in_geometry: obj.geometry.csv_not_in_geometry.length, geometry_not_in_csv: obj.geometry.geometry_not_in_csv.length },
      quality_flags: obj.quality_flags,
      content_sha256: obj.content_sha256,
    }
    console.log(`${ine5}: ${obj.coverage.result_sections} secciones (${obj.coverage.sections_suppressed} ND) → ${file}`)
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log(`manifest → ${join(outDir, 'manifest.json')}`)
  if (!dict.verified) console.error(`AVISO diccionario: ${dict.issues.join(' | ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
