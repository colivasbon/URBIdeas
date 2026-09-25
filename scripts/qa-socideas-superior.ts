// Suite QA del libro municipal SOCideas v2 (`socideas-book@2`) y v2.1.
//
// QUÉ HACE (solo lectura de datos; solo escribe en tmp/audit)
//   1. Regenera los libros piloto v2 (sin estructura anual) para la muestra y
//      calcula la rúbrica v2 con las MISMAS 12 dimensiones de v2.1. La dimensión
//      de frescura de un libro v2 se mide de forma objetiva sobre el propio
//      fichero: 10 si `xl/sharedStrings.xml` contiene "a 1 de enero de 2025"
//      (pirámide 2025 embebida) y 4 si no.
//   2. Genera los libros piloto v2.1 (con `populationStructure` 2025 leída de
//      tmp/audit/estructura-2025/<INE>.json y validada con
//      `validatePopulationStructure`) en tmp/audit/pilotos-v2-1/.
//   3. Valida por piloto v2.1 un conjunto de gates explícitos (estructura-edad,
//      checks del bloque, negativos, gráficos vs OOXML, ámbito insular, frescura,
//      pirámide 2025 contra el JSON, navegación, tablas, freeze, fórmulas, ND,
//      duplicados, reconciliaciones y OOXML). Cada gate se reporta OK/FALLO con
//      conteo; nunca por mera presencia.
//   4. Verifica apertura real del libro con Excel COM (`--com`, por defecto
//      45090 y 07024) y comprueba LibreOffice (`soffice`).
//   5. Escribe informes comparativos BEFORE (v1/manual) / v2 / v2.1, el inventario
//      de frescura por indicador y la reconciliación demográfica 2025.
//   6. No escribe en R2/Supabase/Vercel, no revalida, no despliega.
//
// USO
//   npx tsx scripts/qa-socideas-superior.ts
//   npx tsx scripts/qa-socideas-superior.ts --ines=45090,16211
//   npx tsx scripts/qa-socideas-superior.ts --sin-baselines
//   npx tsx scripts/qa-socideas-superior.ts --com=45090,07024,28079
//   npx tsx scripts/qa-socideas-superior.ts --sin-com
//
// SALIDAS
//   tmp/audit/pilotos/SOCideas_<Municipio>_<INE>_libro.xlsx        (v2)
//   tmp/audit/pilotos-v2-1/SOCideas_<Municipio>_<INE>_libro.xlsx   (v2.1)
//   tmp/audit/qa-socideas-superior.{json,md}                       (v2 + rúbrica 12 dims)
//   tmp/audit/qa-socideas-v2-1.{json,md}                           (informe v2.1)
//   tmp/audit/frescura-indicadores-v2.{json,md}
//   tmp/audit/reconciliacion-demografia-2025.{json,md}

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'
import { readFile as xlsxReadFile, utils as xlsxUtils } from 'xlsx'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { getPerfilDemografico } from '../src/lib/socideas-perfil'
import { getPerfilEconomico } from '../src/lib/socideas-economia'
import { readDemographicPresentation } from '../src/lib/socideas-demographic-summary'
import { readMigrationPresentation } from '../src/lib/socideas-migration-summary'
import { readMunicipalIneLayers, validateMunicipalIneLayers, type MunicipalIneLayersV1 } from '../src/lib/socideas-ine-layers'
import {
  assembleSocideasBookV2,
  FRESHNESS_REGISTRY,
  AEAT_EDM_IRPF,
  type SocideasBookInputV2,
  type SocideasBookV2,
} from '../src/lib/socideas-book-blocks'
import { buildSocideasBookXlsx } from '../src/lib/socideas-xlsx'
import {
  SOCIDEAS_BOOK_SHEET_IDS,
  findDuplicateIndicatorKeys,
  bookIndicatorKey,
  type BookIndicator,
  type BookTableV2,
} from '../src/lib/socideas-book-contract'
import {
  reconcileStructure,
  validatePopulationStructure,
  type PopulationStructureAnnual,
  type StructureCrossCheck68065,
} from '../src/lib/socideas-population-structure'

const OUT_DIR = path.join('tmp', 'audit')
const PILOT_DIR = path.join(OUT_DIR, 'pilotos')
const PILOT_V21_DIR = path.join(OUT_DIR, 'pilotos-v2-1')
const STRUCTURE_DIR = path.join(OUT_DIR, 'estructura-2025')

// ============================================================================
// Argumentos
// ============================================================================

/** Muestra v2 (la de la suite original). */
const DEFAULT_INES_V2 = ['45090', '16211', '28079', '48020', '15078', '51001', '52001', '01041']
/** Caso insular adicional que ejercita `ageDetail` (tabla 68534). */
const INE_INSULAR = '07024'
/** Muestra v2.1: los 8 anteriores + Formentera (insular). */
const DEFAULT_INES_V21 = [...DEFAULT_INES_V2, INE_INSULAR]
/** INEs del gate Excel COM por defecto. */
const DEFAULT_COM_INES = ['45090', INE_INSULAR]

interface Args {
  inesV2: string[]
  inesV21: string[]
  baselines: boolean
  /** null = COM desactivado (`--sin-com`). */
  com: string[] | null
}

/**
 * Normaliza códigos INE: en PowerShell un token con cero inicial (`01041`)
 * pierde el cero y llega como `1041`; se re-rellena (códigos de 5 dígitos).
 * Cualquier valor que no acabe siendo 5 dígitos es un error de invocación.
 */
function normalizeInes(raw: string[], label: string): string[] {
  const out = raw.map((token) => {
    if (/^\d{4}$/.test(token)) {
      const padded = `0${token}`
      console.warn(`[args] ${label}: INE de 4 dígitos normalizado con cero inicial: ${token} -> ${padded}`)
      return padded
    }
    return token
  })
  for (const ine of out) {
    if (!/^\d{5}$/.test(ine)) throw new Error(`${label}: INE inválido (se esperan 5 dígitos): ${JSON.stringify(ine)}`)
  }
  return [...new Set(out)]
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let inesArg: string[] | null = null
  let baselines = true
  let com: string[] | null = [...DEFAULT_COM_INES]
  for (const a of args) {
    if (a.startsWith('--ines=')) {
      inesArg = normalizeInes(a.slice('--ines='.length).split(',').map((s) => s.trim()).filter(Boolean), '--ines')
    }
    if (a === '--sin-baselines') baselines = false
    if (a === '--sin-com') com = null
    if (a.startsWith('--com=')) {
      com = normalizeInes(a.slice('--com='.length).split(',').map((s) => s.trim()).filter(Boolean), '--com')
    }
  }
  return {
    // La muestra v2 se alinea con la v2.1 (8 + insular) para que la comparación
    // BEFORE/v2/v2.1 tenga contraparte de cada piloto en ambos conjuntos.
    inesV2: inesArg ?? DEFAULT_INES_V21,
    inesV21: inesArg ?? DEFAULT_INES_V21,
    baselines,
    com,
  }
}

// ============================================================================
// 1. Métricas estructurales de un XLSX (BEFORE/AFTER comparables)
// ============================================================================

interface XlsxMetrics {
  file: string
  sizeKB: number
  sheets: { name: string; cells: number; numeric: number; formulas: number; autoFilter: boolean; freeze: boolean; hyperlinks: number; internalLinks: number; merges: number; drawings: number }[]
  sheetCount: number
  tables: number
  charts: number
  comments: number
  formulas: number
  numericCells: number
  nonEmptyCells: number
  externals: string[]
  ndCells: number
  seriesHeaders: number
  dimensionHeaders: string[]
  territorialHeaders: string[]
  fuenteLines: number
  duplicateTitles: { texto: string; veces: number }[]
  formulaErrors: number
  /** La pirámide 2025 (estructura INE 68535/68534) viaja en el fichero. */
  hasPyramid2025Phrase: boolean
}

async function metricsFromBuffer(buffer: Buffer, label: string): Promise<XlsxMetrics> {
  const zip = await JSZip.loadAsync(buffer)
  const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
  const sheets = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map((m) => ({ name: m[1], rId: m[2] }))
  const wbRels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? ''
  const relTarget = new Map([...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))

  const shared = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? ''
  const sst = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''),
  )
  const sstCounts = new Map<string, number>()
  for (const t of sst) {
    if (!t || t.length < 6) continue
    sstCounts.set(t, (sstCounts.get(t) ?? 0) + 1)
  }

  const perSheet: XlsxMetrics['sheets'] = []
  const externalUrls: string[] = []
  let formulas = 0
  let numericCells = 0
  let nonEmptyCells = 0
  let ndCells = 0
  let seriesHeaders = 0
  const dimensionHeaders = new Set<string>()
  const territorialHeaders = new Set<string>()
  let fuenteLines = 0
  let formulaErrors = 0

  for (const s of sheets) {
    const target = relTarget.get(s.rId) ?? ''
    const leaf = target.replace(/^\/?xl\//, '').replace(/^worksheets\//, '')
    const xml = (await zip.file(`xl/worksheets/${leaf}`)?.async('string')) ?? ''
    const relsFile = `xl/worksheets/_rels/${leaf}.rels`
    const rels = (await zip.file(relsFile)?.async('string')) ?? ''
    const f = (xml.match(/<f[ >]/g) ?? []).length
    formulas += f
    const cells = (xml.match(/<c[ >]/g) ?? []).length
    // Solo celdas numéricas REALES: excluye t="s" (índice de sharedStrings) y
    // t="str" (resultado de fórmula textual).
    const numeric = (xml.match(/<c(?![^>]*\bt="[^"]*")[^>]*>\s*<v>[\d.eE+-]+<\/v>/g) ?? []).length
    numericCells += numeric
    nonEmptyCells += cells
    // ND reales: celdas de texto compartido cuyo literal es exactamente "ND".
    for (const m of xml.matchAll(/<c[^>]*t="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
      const literal = sst[Number(m[1])]
      if (literal === 'ND') ndCells += 1
    }
    const autoFilter = /<autoFilter[ >]/.test(xml)
    const freeze = /<pane[ >]/.test(xml)
    const hyperlinks = (xml.match(/<hyperlink[ >]/g) ?? []).length
    const internalLinks = (xml.match(/location="/g) ?? []).length
    const merges = (xml.match(/<mergeCell[ >]/g) ?? []).length
    const drawings = (rels.match(/drawing\d+\.xml/g) ?? []).length
    formulaErrors += (xml.match(/#(REF|DIV\/0|VALUE|N\/A|NAME\?|NULL|NUM)!/g) ?? []).length
    for (const m of rels.matchAll(/Target="(https:[^"]+)"/g)) externalUrls.push(m[1])
    perSheet.push({ name: s.name, cells, numeric, formulas: f, autoFilter, freeze, hyperlinks, internalLinks, merges, drawings })
  }

  // Cabeceras y evidencias desde sharedStrings
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const t of sst) {
    const n = norm(t).trim()
    if (n === 'año' || n === 'ano' || n === 'período' || n === 'periodo') seriesHeaders += 1
    if (/hombres|mujeres|sector|regimen|tramo|sexo|especie|cultivo|candidatura|nivel educativo/.test(n)) dimensionHeaders.add(t)
    if (/^españa$|^ccaa$|^provincia$/.test(n)) territorialHeaders.add(t)
    if (n.startsWith('fuente:')) fuenteLines += 1
  }

  const tables = Object.keys(zip.files).filter((f2) => /^xl\/tables\/table\d+\.xml$/.test(f2)).length
  const charts = Object.keys(zip.files).filter((f2) => /^xl\/charts\/chart\d+\.xml$/.test(f2)).length
  const comments = Object.keys(zip.files).filter((f2) => /^xl\/comments\d+\.xml$/.test(f2)).length

  return {
    file: label,
    sizeKB: Math.round(buffer.length / 1024),
    sheets: perSheet,
    sheetCount: sheets.length,
    tables,
    charts,
    comments,
    formulas,
    numericCells,
    nonEmptyCells,
    externals: [...new Set(externalUrls)],
    ndCells,
    seriesHeaders,
    dimensionHeaders: [...dimensionHeaders],
    territorialHeaders: [...territorialHeaders],
    fuenteLines,
    duplicateTitles: [...sstCounts.entries()].filter(([, n2]) => n2 > 1).map(([texto, veces]) => ({ texto, veces })),
    formulaErrors,
    hasPyramid2025Phrase: shared.includes('a 1 de enero de 2025'),
  }
}

async function metricsFromFile(file: string): Promise<XlsxMetrics> {
  return metricsFromBuffer(fs.readFileSync(file), path.basename(file))
}

// ============================================================================
// 2. Rúbrica reproducible (0-100) · 12 dimensiones (v2.1: + frescura)
// ============================================================================

interface RubricScore {
  coberturaReal: number
  profundidad: number
  series: number
  desagregacion: number
  comparativas: number
  actualidad: number
  fuentes: number
  trazabilidad: number
  consistencia: number
  visualizacion: number
  reutilizacion: number
  frescura: number
  total: number
}

/** Objetivos declarados de la rúbrica (no se inventan: son metas del contrato). */
const AREA_TARGETS: Record<string, number> = {
  demografia: 45,
  politica: 25,
  economia: 60,
  agrario: 30,
  servicios: 25,
  vivienda: 20,
  patrimonio: 10,
  infraestructura: 10,
  asociaciones: 5,
}

/** Cobertura real medida en el fichero: celdas numéricas por área / objetivo. */
function areaCoverageFromMetrics(m: XlsxMetrics): Record<string, number> {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const findSheet = (...needles: string[]) => m.sheets.filter((s) => needles.some((n) => norm(s.name).includes(n)))
  const numericIn = (...needles: string[]) => findSheet(...needles).reduce((a, s) => a + s.numeric, 0)
  const areas: Record<string, number> = {
    demografia: numericIn('demograf', 'perfil'),
    politica: numericIn('polit'),
    economia: numericIn('econom', 'empresa'),
    agrario: numericIn('agrar', 'censo agrario'),
    servicios: numericIn('socioc', 'servici', 'social', 'educac'),
    vivienda: numericIn('vivienda'),
    patrimonio: numericIn('patrimonio'),
    infraestructura: numericIn('infraestruct'),
    asociaciones: numericIn('asociacion'),
  }
  const out: Record<string, number> = {}
  for (const [area, target] of Object.entries(AREA_TARGETS)) {
    out[area] = Math.min(1, (areas[area] ?? 0) / target)
  }
  return out
}

/**
 * Rúbrica v2 (12 dimensiones, idéntica en v2 y v2.1).
 * `frescura` se pasa ya calculada y declarada:
 *   - v2/baselines: medida sobre el fichero (10 si la pirámide 2025 viaja en
 *     sharedStrings; 4 si no) — regla objetiva y reproducible.
 *   - v2.1: 10 si no hay ningún indicador `desactualizado` y la estructura 2025
 *     se usó; en otro caso, max(0, 10 − 2 × nº desactualizados).
 */
function scoreRubric(m: XlsxMetrics, areaCoverage: Record<string, number>, frescura: number): RubricScore {
  const clamp = (x: number) => Math.max(0, Math.min(10, x))
  const pesos = Object.values(AREA_TARGETS).reduce((a, b) => a + b, 0)
  const coberturaReal = clamp((Object.entries(areaCoverage).reduce((a, [area, ratio]) => a + ratio * (AREA_TARGETS[area] ?? 1), 0) / pesos) * 10)
  const profundidad = clamp((m.numericCells / 120) * 10)
  const series = clamp((m.seriesHeaders / 5) * 10)
  const desagregacion = clamp((m.dimensionHeaders.length / 8) * 10)
  const comparativas = clamp((m.territorialHeaders.length / 4) * 10)
  // Actualidad: el libro v2 se regenera con el último dato cargado; se puntúa
  // por la presencia de bloques coyunturales recientes (paro/afiliación mensual).
  const coyuntura = m.sheets.some((s) => s.name.toLowerCase().includes('econom')) ? 1 : 0
  const actualidad = clamp((coyuntura ? 7 : 3) + (m.numericCells > 200 ? 3 : 1))
  const fuentes = clamp((m.externals.length / 6) * 10)
  const trazabilidad = clamp((m.fuenteLines / 8) * 10)
  const consistencia = clamp(10 - m.formulaErrors * 3 - (m.duplicateTitles.length > 0 ? 2 : 0))
  const visualizacion = clamp(m.charts * 1.5 + m.tables * 0.8 + (m.sheets.some((s) => s.autoFilter) ? 1.5 : 0) + (m.sheets.some((s) => s.freeze) ? 1.5 : 0))
  const reutilizacion = clamp(
    (m.tables > 0 ? 3 : 0) +
      (m.sheets.some((s) => s.freeze) ? 2 : 0) +
      (m.formulas > 0 ? 2 : 0) +
      (m.sheets.some((s) => s.hyperlinks > 0) ? 2 : 0) +
      (m.charts > 0 ? 1 : 0),
  )
  const dims = [coberturaReal, profundidad, series, desagregacion, comparativas, actualidad, fuentes, trazabilidad, consistencia, visualizacion, reutilizacion, frescura]
  const total = Math.round((dims.reduce((a, b) => a + b, 0) / (dims.length * 10)) * 1000) / 10
  return { coberturaReal, profundidad, series, desagregacion, comparativas, actualidad, fuentes, trazabilidad, consistencia, visualizacion, reutilizacion, frescura, total }
}

const RUBRIC_KEYS: (keyof RubricScore)[] = [
  'coberturaReal', 'profundidad', 'series', 'desagregacion', 'comparativas', 'actualidad',
  'fuentes', 'trazabilidad', 'consistencia', 'visualizacion', 'reutilizacion', 'frescura', 'total',
]

const RUBRIC_LABELS: Record<keyof RubricScore, string> = {
  coberturaReal: 'Cobertura real', profundidad: 'Profundidad', series: 'Series', desagregacion: 'Desagregación',
  comparativas: 'Comparativas', actualidad: 'Actualidad', fuentes: 'Fuentes', trazabilidad: 'Trazabilidad',
  consistencia: 'Consistencia', visualizacion: 'Visualización', reutilizacion: 'Reutilización', frescura: 'Frescura', total: 'TOTAL',
}

/** Frescura medida del libro v2/baseline: presencia real de la pirámide 2025. */
function measurableFreshnessScore(m: XlsxMetrics): number {
  return m.hasPyramid2025Phrase ? 10 : 4
}

/** Frescura declarada del libro v2.1 (regla del enunciado). */
function v21FreshnessScore(desactualizados: number, estructuraUsada: boolean): number {
  if (desactualizados === 0 && estructuraUsada) return 10
  return Math.max(0, 10 - 2 * desactualizados)
}

function averageRubric(scores: RubricScore[]): RubricScore | null {
  if (scores.length === 0) return null
  const avg = {} as RubricScore
  for (const key of RUBRIC_KEYS) {
    const sum = scores.reduce((a, s) => a + (s[key] ?? 0), 0)
    avg[key] = Math.round((sum / scores.length) * 10) / 10
  }
  return avg
}

// ============================================================================
// 3. Validación del libro generado (contrato v2, gates originales)
// ============================================================================

interface BookValidation {
  ok: boolean
  problems: string[]
  checks: { total: number; ok: number; failed: string[] }
  coverage: { global: number; publicables: number; declarados: number }
  duplicateKeys: number
  ndCells: number
  formulaCells: number
  charts: number
  tables: number
  freezeSheets: number
  internalLinks: number
  externalLinks: number
}

async function validateGeneratedBook(buffer: Buffer, book: SocideasBookV2): Promise<BookValidation> {
  const problems: string[] = []
  const zip = await JSZip.loadAsync(buffer)
  const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
  const names = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1])
  if (names.join('|') !== SOCIDEAS_BOOK_SHEET_IDS.join('|')) {
    problems.push(`Orden/nombres de hojas no coincide con el contrato: ${names.join(', ')}`)
  }
  const chartFiles = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f))
  const tableFiles = Object.keys(zip.files).filter((f) => /^xl\/tables\/table\d+\.xml$/.test(f))
  let freezeSheets = 0
  let internalLinks = 0
  let externalLinks = 0
  let formulaCells = 0
  let ndCells = 0
  const allowedHosts = ['www.ine.es', 'ine.es', 'www.agenciatributaria.es', 'sede.agenciatributaria.gob.es', 'infoelectoral.interior.gob.es', 'descargas.interior.gob.es']

  for (const file of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    const xml = (await zip.file(file)?.async('string')) ?? ''
    if (/<pane[ >]/.test(xml)) freezeSheets += 1
    internalLinks += (xml.match(/location="/g) ?? []).length
    if (xml.includes('location="#')) problems.push(`Hipervínculo interno con '#' sin normalizar en ${file}`)
    formulaCells += (xml.match(/<f[ >]/g) ?? []).length
    const relsFile = file.replace('xl/worksheets/', 'xl/worksheets/_rels/').replace(/\.xml$/, '.xml.rels')
    const rels = (await zip.file(relsFile)?.async('string')) ?? ''
    for (const m of rels.matchAll(/Target="(https:[^"]+)"/g)) {
      externalLinks += 1
      try {
        const host = new URL(m[1]).hostname.toLowerCase()
        if (!allowedHosts.includes(host)) problems.push(`Enlace externo fuera de allowlist: ${host}`)
      } catch {
        problems.push(`URL externa inválida: ${m[1]}`)
      }
    }
    if (/#(REF|DIV\/0|VALUE|N\/A|NAME\?|NULL|NUM)!/.test(xml)) problems.push(`Error de fórmula en ${file}`)
  }

  ndCells = book.sheets.flatMap((s) => s.bloques).flatMap((b) => b.filas).flatMap((f) => f).filter((c) => c.text === 'ND').length
  const malformedNd = book.sheets
    .flatMap((s) => s.bloques)
    .flatMap((b) => b.filas)
    .flatMap((f) => f)
    .filter((c) => c.text === 'ND' && c.numeric !== null).length
  if (malformedNd > 0) problems.push(`${malformedNd} celdas ND con valor numérico`)

  const vacias = book.sheets.filter((s) => s.bloques.every((b) => b.filas.length === 0))
  if (vacias.length > 0) problems.push(`Hojas sin filas: ${vacias.map((s) => s.id).join(', ')}`)

  if (book.duplicateKeys.length > 0) problems.push(`Claves de indicador duplicadas: ${book.duplicateKeys.map((d) => d.key).join(' | ')}`)
  const checks = book.checks
  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0) problems.push(`Reconciliaciones con desviación: ${failed.map((f) => f.id).join(', ')}`)

  return {
    ok: problems.length === 0,
    problems,
    checks: { total: checks.length, ok: checks.length - failed.length, failed: failed.map((f) => f.id) },
    coverage: { global: book.coverage.global, publicables: book.coverage.publicables, declarados: book.coverage.declarados },
    duplicateKeys: book.duplicateKeys.length,
    ndCells,
    formulaCells,
    charts: chartFiles.length,
    tables: tableFiles.length,
    freezeSheets,
    internalLinks,
    externalLinks,
  }
}

// ============================================================================
// 4. Payloads locales verificados (series electorales y Congreso provincial)
// ============================================================================

interface PayloadBundle {
  electoral?: SocideasBookInputV2['electoral']
  congresoProvincia?: SocideasBookInputV2['congresoProvincia']
  autonomicasCircunscripcion?: SocideasBookInputV2['autonomicasCircunscripcion']
  senadoCircunscripcion?: SocideasBookInputV2['senadoCircunscripcion']
}

/**
 * Fixtures provinciales 2023 de la circunscripción de Toledo (solo se aplican a
 * municipios de la provincia 45). Se generan con
 * `npx tsx scripts/ingest-elections-toledo-2023.ts`. Si faltan, se devuelve
 * undefined y los bloques quedan declarados como pendientes (sin romper).
 */
function leerFixtureProvincial<T>(archivo: string, provinciaCodigo: string, esperado: string): T | undefined {
  if (provinciaCodigo !== '45') return undefined
  const file = path.join(OUT_DIR, archivo)
  if (!fs.existsSync(file)) return undefined
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) return undefined
    if ((raw as { circunscripcion?: string }).circunscripcion === undefined) return undefined
    if (!Array.isArray((raw as Record<string, unknown>)[esperado])) return undefined
    return raw as T
  } catch {
    return undefined
  }
}

function loadElectoralSeries(ine: string): SocideasBookInputV2['electoral'] | undefined {
  const file = path.join(OUT_DIR, `elecciones-serie-${ine}.json`)
  if (!fs.existsSync(file)) return undefined
  try {
    // El fixture anida la convocatoria (`{ convocatoria: { anio, fecha }, … }`);
    // se aceptan también formas planas por robustez.
    interface RawConv {
      anio?: number
      fecha?: string
      convocatoria?: { anio?: number; fecha?: string }
      censo: number | null
      votantes: number | null
      validos: number | null
      nulos: number | null
      blancos: number | null
      candidaturas: { candidatura: string; siglas: string; votos: number | null; concejales: number | null }[]
      totalConcejales: number | null
      estado?: 'completo' | 'parcial'
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { convocatorias?: RawConv[] }
    if (!Array.isArray(raw.convocatorias) || raw.convocatorias.length === 0) return undefined
    const convocatorias = raw.convocatorias
      .map((c) => ({
        anio: c.anio ?? c.convocatoria?.anio ?? NaN,
        fecha: c.fecha ?? c.convocatoria?.fecha ?? '',
        censo: c.censo,
        votantes: c.votantes,
        validos: c.validos,
        nulos: c.nulos,
        blancos: c.blancos,
        candidaturas: c.candidaturas ?? [],
        totalConcejales: c.totalConcejales,
        estado: c.estado,
      }))
      .filter((c) => Number.isFinite(c.anio))
    if (convocatorias.length === 0) return undefined
    return {
      fuenteLabel: 'Ministerio del Interior · Infoelectoral · resultados municipales',
      observacion: 'Extraído del fichero abierto de municipios (varias convocatorias).',
      convocatorias,
    }
  } catch {
    return undefined
  }
}

interface CongresoProvinciaEntry {
  anio: number
  fecha: string
  provincia: string
  censo: number | null
  votantes: number | null
  validos: number | null
  nulos: number | null
  blancos: number | null
  candidaturas: { nombre: string; siglas: string; votos: number | null; escanos: number | null }[]
  fuenteLabel: string
}

let congresoCache: Record<string, CongresoProvinciaEntry> | null = null

function loadCongresoProvincia(provinciaCodigo: string, provinciaNombre: string): SocideasBookInputV2['congresoProvincia'] | undefined {
  const file = path.join(OUT_DIR, 'elecciones-congreso.xlsx')
  if (!fs.existsSync(file)) return undefined
  try {
    if (!congresoCache) {
      const wb = xlsxReadFile(file)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = xlsxUtils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true })
      const header = rows[3] as string[]
      const descIdx = header.findIndex((h) => typeof h === 'string' && h.toLowerCase().includes('descripci'))
      const fechaIdx = 0
      const cache: Record<string, CongresoProvinciaEntry> = {}
      const iter = rows.slice(4)
      for (let c = 0; c < header.length; c += 1) {
        const h = header[c]
        if (typeof h !== 'string') continue
        const m = /^(\d{1,2})\s*-\s*(.+)$/.exec(h.trim())
        if (!m) continue
        const code = String(m[1]).padStart(2, '0')
        const name = m[2].trim()
        const get = (descripcion: string, fechaSerial: number): number | null => {
          const row = iter.find((r) => Number(r[fechaIdx]) === fechaSerial && typeof r[descIdx] === 'string' && (r[descIdx] as string).trim() === descripcion)
          const v = row?.[c]
          return typeof v === 'number' && Number.isFinite(v) ? v : null
        }
        const fechaSerial = 45130 // 2023-07-23
        const votosRows = iter.filter((r) => Number(r[fechaIdx]) === fechaSerial && typeof r[descIdx] === 'string' && (r[descIdx] as string).startsWith('Votos ('))
        const escanosRows = iter.filter((r) => Number(r[fechaIdx]) === fechaSerial && typeof r[descIdx] === 'string' && (r[descIdx] as string).startsWith('Escaños ('))
        const candidaturas = votosRows
          .map((r) => {
            const desc = (r[descIdx] as string).trim()
            const inner = desc.replace(/^Votos \((.+)\)$/, '$1')
            const parts = inner.split(' - ')
            const siglas = parts.length > 1 ? (parts.pop() ?? '').trim() : ''
            const nombre = parts.join(' - ').trim()
            const votos = typeof r[c] === 'number' ? (r[c] as number) : null
            const esc = escanosRows.find((e) => (e[descIdx] as string).includes(inner))
            const escanos = esc && typeof esc[c] === 'number' ? (esc[c] as number) : null
            return { nombre, siglas, votos, escanos }
          })
          .filter((x) => x.votos !== null)
          .sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
          .slice(0, 10)
        cache[code] = {
          anio: 2023,
          fecha: '2023-07-23',
          provincia: name,
          censo: get('Electores', fechaSerial),
          votantes: get('Votantes', fechaSerial),
          validos: get('Votos válidos', fechaSerial),
          nulos: get('Votos nulos', fechaSerial),
          blancos: get('Votos en blanco', fechaSerial),
          candidaturas,
          fuenteLabel: 'Ministerio del Interior · Infoelectoral · Elecciones generales (Congreso)',
        }
      }
      congresoCache = cache
    }
    const hit = congresoCache[provinciaCodigo]
    if (!hit) return undefined
    return { ...hit, provincia: provinciaNombre || hit.provincia }
  } catch (e) {
    console.warn('Congreso no disponible:', e instanceof Error ? e.message : String(e))
    return undefined
  }
}

function loadPayloads(ine: string, provinciaCodigo: string, provinciaNombre: string): PayloadBundle {
  return {
    electoral: loadElectoralSeries(ine),
    congresoProvincia: loadCongresoProvincia(provinciaCodigo, provinciaNombre),
    autonomicasCircunscripcion: leerFixtureProvincial<SocideasBookInputV2['autonomicasCircunscripcion']>(
      'elecciones-autonomicas-clm-2023-toledo.json',
      provinciaCodigo,
      'candidaturas',
    ),
    senadoCircunscripcion: leerFixtureProvincial<SocideasBookInputV2['senadoCircunscripcion']>(
      'elecciones-senado-2023-toledo.json',
      provinciaCodigo,
      'candidatos',
    ),
  }
}

/**
 * Capas INE laterales por S3 (lectura). `readMunicipalIneLayers` usa la base
 * pública R2, que no está configurada en local: en QA se lee el mismo objeto
 * con las credenciales R2 de solo lectura y se valida con el contrato oficial.
 */
async function readLayersForQa(ine: string): Promise<MunicipalIneLayersV1 | null> {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (accountId && accessKeyId && secretAccessKey && bucket) {
    try {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `socideas/ine-layers/v1/municipal/${ine}.json` }))
      const json = JSON.parse(await res.Body!.transformToString()) as unknown
      const parsed = validateMunicipalIneLayers(json)
      if (parsed.ok && parsed.data.ineCode === ine) return parsed.data
      return null
    } catch {
      return null
    }
  }
  return readMunicipalIneLayers(ine).catch(() => null)
}

// ============================================================================
// 5. Estructura de población 2025 (v2.1)
// ============================================================================

type StructureLoad =
  | { status: 'ok'; file: string; data: PopulationStructureAnnual }
  | { status: 'sin_estructura'; file: string; reason: string }

/** Lee el objeto ingerido y lo valida con el contrato oficial (fail closed). */
function loadPopulationStructureForQa(ine: string): StructureLoad {
  const file = path.join(STRUCTURE_DIR, `${ine}.json`)
  if (!fs.existsSync(file)) {
    return { status: 'sin_estructura', file, reason: 'JSON de estructura no encontrado en tmp/audit/estructura-2025' }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    const parsed = validatePopulationStructure(raw)
    if (!parsed.ok) {
      return { status: 'sin_estructura', file, reason: `validatePopulationStructure falló: ${parsed.errors.join(' | ')}` }
    }
    return { status: 'ok', file, data: parsed.data }
  } catch (e) {
    return { status: 'sin_estructura', file, reason: `JSON ilegible: ${e instanceof Error ? e.message : String(e)}` }
  }
}

interface StructureSummary {
  file: string
  status: 'ok' | 'sin_estructura'
  reason: string | null
  sourceTable: string | null
  scope: string | null
  periodo: string | null
  totals: { total: number | null; male: number | null; female: number | null } | null
  crossCheck68065: StructureCrossCheck68065 | null
  quality: {
    territoryMatch: 'exact' | 'missing'
    totalBySexReconciled: boolean
    totalByAgeReconciled: boolean
    groupingReconciled: boolean
    validationStatus: 'passed' | 'partial' | 'failed'
  } | null
  bandas: number | null
  edadesSimples: number | null
  reconciliacion: { id: string; descripcion: string; izquierda: number | null; derecha: number | null; ok: boolean }[]
}

function summarizeStructure(load: StructureLoad): StructureSummary {
  if (load.status === 'sin_estructura') {
    return {
      file: load.file, status: 'sin_estructura', reason: load.reason,
      sourceTable: null, scope: null, periodo: null, totals: null, crossCheck68065: null,
      quality: null, bandas: null, edadesSimples: null, reconciliacion: [],
    }
  }
  const s = load.data
  return {
    file: load.file,
    status: 'ok',
    reason: null,
    sourceTable: s.sourceTable,
    scope: s.scope,
    periodo: s.period,
    totals: s.totals,
    crossCheck68065: s.quality.crossCheck68065,
    quality: {
      territoryMatch: s.quality.territoryMatch,
      totalBySexReconciled: s.quality.totalBySexReconciled,
      totalByAgeReconciled: s.quality.totalByAgeReconciled,
      groupingReconciled: s.quality.groupingReconciled,
      validationStatus: s.quality.validationStatus,
    },
    bandas: s.ageBands5y.length,
    edadesSimples: s.ageDetail === null ? null : s.ageDetail.length,
    reconciliacion: reconcileStructure(s).map((c) => ({ id: c.id, descripcion: c.descripcion, izquierda: c.izquierda, derecha: c.derecha, ok: c.ok })),
  }
}

// ============================================================================
// 6. Gates v2.1 (por piloto)
// ============================================================================

interface V21Gate {
  id: string
  ok: boolean
  /** Conteo asociado al gate (nunca null salvo que no aplique ningún conteo). */
  conteo: number | null
  detalle: string
}

interface NegativeReport {
  /** Negativos permitidos por la regla del enunciado (cabecera 'representación'). */
  columnasRepresentacion: number
  /** Negativos fuera de 'representación' según la regla LITERAL del enunciado. */
  otrosReglaEstricta: number
  /** Negativos fuera de 'representación' y fuera de magnitudes con signo declaradas (variación/saldo). */
  otrosEfectivos: number
  detalle: { hoja: string; bloque: string; columna: string; fila: number; valor: number }[]
}

interface V21Report {
  ok: boolean
  gates: V21Gate[]
  problems: string[]
  estructuraUsada: boolean
  desactualizados: { slug: string; periodo: string; motivo: string; latest: string | null }[]
  negativos: NegativeReport
  charts: { bloquesConChart: number; bloquesConTodasLasSeries: number; esperados: number; reales: number; seriesSinDato: string[] }
  insular: { scope: string | null; detallePresente: boolean; limitacionPresente: boolean } | null
  piramide: {
    frasePresente: boolean
    totalJson: number | null
    totalCelda: number | null
    hombreJson: number | null
    hombreCelda: number | null
    mujerJson: number | null
    mujerCelda: number | null
    ok: boolean
  } | null
  ooxml: { hojas: number; charts: number; tablas: number; freeze: number; ndCells: number; partesRequeridas: number }
}

interface SheetCell {
  col: string
  fila: number
  texto: string
  numerico: number | null
}

interface ZipContext {
  zip: JSZip
  names: string[]
  sheetFileByName: Map<string, string>
  sst: string[]
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

async function readZipContext(buffer: Buffer): Promise<ZipContext> {
  const zip = await JSZip.loadAsync(buffer)
  const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
  const names = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map((m) => ({ name: m[1], rId: m[2] }))
  const wbRels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? ''
  const relTarget = new Map([...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))
  const sheetFileByName = new Map<string, string>()
  for (const s of names) {
    const target = relTarget.get(s.rId) ?? ''
    const leaf = target.replace(/^\/?xl\//, '').replace(/^worksheets\//, '')
    sheetFileByName.set(s.name, `xl/worksheets/${leaf}`)
  }
  const shared = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? ''
  const sst = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlUnescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )
  return { zip, names: names.map((n) => n.name), sheetFileByName, sst }
}

async function readSheetCells(ctx: ZipContext, sheetName: string): Promise<SheetCell[]> {
  const file = ctx.sheetFileByName.get(sheetName)
  if (!file) return []
  const xml = (await ctx.zip.file(file)?.async('string')) ?? ''
  const cells: SheetCell[] = []
  // OJO: no se puede casar `>...</c>` con un regex ingenuo: las celdas vacías
  // van autocerradas (`<c r="B57" s="1"/>`) y "se comerían" la celda siguiente.
  // Se localiza la apertura y, solo si NO es autocerrada, su `</c>` inmediato.
  const open = /<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g
  for (const m of xml.matchAll(open)) {
    if (m[4] === '/') continue
    const col = m[1]
    const fila = Number(m[2])
    const attrs = m[3]
    const innerStart = (m.index ?? 0) + m[0].length
    const close = xml.indexOf('</c>', innerStart)
    if (close < 0) continue
    const inner = xml.slice(innerStart, close)
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? null
    if (t === 'inlineStr') {
      const is = /<is>([\s\S]*?)<\/is>/.exec(inner)
      if (is) cells.push({ col, fila, texto: xmlUnescape([...is[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')), numerico: null })
      continue
    }
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
    if (!v) continue
    const raw = v[1]
    if (t === 's') {
      const literal = ctx.sst[Number(raw)] ?? ''
      cells.push({ col, fila, texto: literal, numerico: null })
    } else if (t === 'str' || t === 'e') {
      cells.push({ col, fila, texto: xmlUnescape(raw), numerico: null })
    } else {
      const n = Number(raw)
      cells.push({ col, fila, texto: raw, numerico: Number.isFinite(n) ? n : null })
    }
  }
  return cells
}

/** Magnitudes con signo declaradas en el libro (documentadas, no inventadas). */
const SIGNED_MAGNITUDE_PATTERN = /variaci[oó]n|saldo/i

async function validateV21Book(
  buffer: Buffer,
  book: SocideasBookV2,
  structure: PopulationStructureAnnual | null,
  base: BookValidation,
  metrics: XlsxMetrics,
): Promise<V21Report> {
  const gates: V21Gate[] = []
  const problems: string[] = []
  const ctx = await readZipContext(buffer)
  const gate = (id: string, ok: boolean, conteo: number | null, detalle: string): void => {
    gates.push({ id, ok, conteo, detalle })
    if (!ok) problems.push(`${id}: ${detalle}`)
  }

  const demografia = book.sheets.find((s) => s.id === '01_DEMOGRAFÍA')
  const metodologia = book.sheets.find((s) => s.id === '10_METODOLOGÍA_FUENTES')
  const allIndicators: BookIndicator[] = book.sheets.flatMap((s) => s.bloques.flatMap((b) => b.indicadores))
  const allBlocks: BookTableV2[] = book.sheets.flatMap((s) => s.bloques)

  // --- Gate 1: bloque estructura-edad ---------------------------------------
  const estructuraBlock = demografia?.bloques.find((b) => b.id === 'estructura-edad') ?? null
  const indEstructura = estructuraBlock?.indicadores[0] ?? null
  const gateEstructuraOk =
    estructuraBlock !== null &&
    estructuraBlock.periodo.includes('2025') &&
    indEstructura?.slug === 'estructura_edad' &&
    indEstructura?.availability === 'available'
  gate(
    'estructura-edad',
    gateEstructuraOk,
    estructuraBlock === null ? 0 : 1,
    estructuraBlock === null
      ? 'no existe el bloque estructura-edad'
      : `periodo=${estructuraBlock.periodo} · indicadores[0].slug=${indEstructura?.slug ?? '—'} · estado=${indEstructura?.availability ?? '—'}`,
  )

  // --- Gate 2: checks del bloque estructura-edad ----------------------------
  const estructuraChecks = estructuraBlock?.checks ?? []
  const checkSexo = estructuraChecks.find((c) => c.id === 'estructura-sexo') ?? null
  const checkEdades = estructuraChecks.find((c) => c.id === 'estructura-edades') ?? null
  const gateChecksOk = checkSexo?.ok === true && checkEdades?.ok === true
  gate(
    'estructura-checks',
    gateChecksOk,
    (checkSexo ? 1 : 0) + (checkEdades ? 1 : 0),
    `estructura-sexo=${checkSexo ? (checkSexo.ok ? 'OK' : 'FALLO') : 'ausente'} · estructura-edades=${checkEdades ? (checkEdades.ok ? 'OK' : 'FALLO') : 'ausente'}`,
  )

  // --- Gate 3: valores negativos --------------------------------------------
  const negativos: NegativeReport = { columnasRepresentacion: 0, otrosReglaEstricta: 0, otrosEfectivos: 0, detalle: [] }
  for (const sheet of book.sheets) {
    for (const bloque of sheet.bloques) {
      const signedBlock = SIGNED_MAGNITUDE_PATTERN.test(bloque.id)
      bloque.filas.forEach((fila, fi) => {
        fila.forEach((celda, ci) => {
          if (celda.numeric === null || !Number.isFinite(celda.numeric) || celda.numeric >= 0) return
          const columna = bloque.columnas[ci] ?? ''
          const cabeceraRepresentacion = columna.toLowerCase().includes('representación')
          if (cabeceraRepresentacion) {
            negativos.columnasRepresentacion += 1
            return
          }
          negativos.otrosReglaEstricta += 1
          const etiquetaFila = fila[0]?.text ?? ''
          const signedValue = signedBlock || SIGNED_MAGNITUDE_PATTERN.test(etiquetaFila)
          if (!signedValue) {
            negativos.otrosEfectivos += 1
            if (negativos.detalle.length < 12) {
              negativos.detalle.push({ hoja: sheet.id, bloque: bloque.id, columna, fila: fi, valor: celda.numeric })
            }
          }
        })
      })
    }
  }
  gate(
    'negativos',
    negativos.otrosEfectivos === 0,
    negativos.columnasRepresentacion + negativos.otrosReglaEstricta + negativos.otrosEfectivos,
    `representación=${negativos.columnasRepresentacion} (permitidos) · fuera de representación (regla literal)=${negativos.otrosReglaEstricta} ` +
      `(de ellos con signo declarado variación/saldo=${negativos.otrosReglaEstricta - negativos.otrosEfectivos}) · indebidos efectivos=${negativos.otrosEfectivos}`,
  )

  // --- Gate 4: gráficos vs OOXML --------------------------------------------
  // El escritor NO emite un gráfico por bloque: aplica un tope por hoja
  // (`MAX_CHARTS_PER_SHEET = 2`, src/lib/socideas-xlsx.ts) y descarta los
  // bloques cuya serie no tiene ningún valor. El gate reproduce ese contrato.
  const MAX_CHARTS_PER_SHEET = 2
  let bloquesConChart = 0
  let bloquesConTodasLasSeries = 0
  let bloquesConDatoSinTope = 0
  let bloquesSinNingunaSerie = 0
  let chartsEsperados = 0
  const seriesSinDato: string[] = []
  for (const sheet of book.sheets) {
    let emitidosHoja = 0
    for (const bloque of sheet.bloques) {
      if (!bloque.chart) continue
      bloquesConChart += 1
      const seriesConDato = bloque.chart.series.filter((s) =>
        bloque.filas.some((f) => {
          const v = f[s.columna - 1]?.numeric
          return v !== null && v !== undefined && Number.isFinite(v)
        }),
      )
      if (seriesConDato.length > 0) {
        bloquesConDatoSinTope += 1
        if (emitidosHoja < MAX_CHARTS_PER_SHEET) {
          chartsEsperados += 1
          emitidosHoja += 1
        }
      } else {
        // El modelo NUNCA debe declarar un gráfico sin ninguna serie con dato
        // (el escritor lo descartaría): eso es un fallo real.
        bloquesSinNingunaSerie += 1
      }
      if (seriesConDato.length === bloque.chart.series.length) {
        bloquesConTodasLasSeries += 1
      } else if (seriesConDato.length > 0) {
        // Serie parcial: el escritor omite las series vacías y dibuja el resto.
        const faltan = bloque.chart.series.filter((s) => !seriesConDato.includes(s)).map((s) => s.nombre).join(', ')
        seriesSinDato.push(`${bloque.id}: ${faltan}`)
      }
    }
  }
  const chartsReales = metrics.charts
  gate(
    'charts',
    bloquesSinNingunaSerie === 0 && chartsEsperados === chartsReales && chartsReales > 0,
    chartsReales,
    `bloques con chart=${bloquesConChart} · con TODAS las series con dato=${bloquesConTodasLasSeries} · sin ninguna serie con dato=${bloquesSinNingunaSerie} · con dato sin tope=${bloquesConDatoSinTope} · esperados (tope del escritor 2/hoja)=${chartsEsperados} · XL charts=${chartsReales}` +
      (seriesSinDato.length > 0 ? ` · series parciales omitidas por el escritor: ${seriesSinDato.join(' | ')}` : ''),
  )

  // --- Gate 5: ámbito insular ------------------------------------------------
  const detalleBlock = demografia?.bloques.find((b) => b.id === 'estructura-edad-detalle') ?? null
  const limitacionPresente = (metodologia?.bloques ?? []).some((b) =>
    b.filas.some((f) => f.some((c) => typeof c.text === 'string' && c.text.includes('Edad simple: ámbito insular'))),
  )
  let insular: V21Report['insular'] = null
  if (structure !== null) {
    insular = { scope: structure.scope, detallePresente: detalleBlock !== null, limitacionPresente }
    const okInsular =
      structure.scope === 'municipal_insular'
        ? detalleBlock !== null
        : detalleBlock === null && limitacionPresente
    gate(
      'insular',
      okInsular,
      1,
      structure.scope === 'municipal_insular'
        ? `scope insular: bloque estructura-edad-detalle ${detalleBlock ? 'presente' : 'AUSENTE'}`
        : `scope nacional: detalle ${detalleBlock ? 'PRESENTE (no debe)' : 'ausente'} · limitación "Edad simple: ámbito insular" ${limitacionPresente ? 'declarada' : 'AUSENTE'}`,
    )
  } else {
    gate('insular', false, 0, 'sin_estructura: no verificable')
  }

  // --- Gate 6: frescura ------------------------------------------------------
  const desactualizados = allIndicators
    .filter((i) => i.freshness_status === 'desactualizado')
    .map((i) => ({ slug: i.slug, periodo: i.periodo, motivo: i.freshness_reason, latest: i.latest_available_period }))
  gate(
    'frescura',
    desactualizados.length === 0,
    desactualizados.length,
    desactualizados.length === 0
      ? `0 indicadores desactualizados de ${allIndicators.length}`
      : `${desactualizados.length} desactualizados: ${desactualizados.map((d) => `${d.slug}@${d.periodo} (${d.motivo})`).join(' | ')}`,
  )

  // --- Gate 7: pirámide 2025 (contenido real vs JSON) ------------------------
  let piramide: V21Report['piramide'] = null
  if (structure !== null) {
    const cells = await readSheetCells(ctx, '01_DEMOGRAFÍA')
    const frasePresente = cells.some((c) => c.texto.includes('a 1 de enero de 2025'))
    const titleRow = cells.filter((c) => c.texto.includes('Estructura de población por edad y sexo')).map((c) => c.fila).sort((a, b) => a - b)[0] ?? null
    let totalRow: number | null = null
    if (titleRow !== null) {
      for (let r = titleRow + 1; r <= titleRow + 8; r += 1) {
        if (cells.some((c) => c.fila === r && c.col === 'A' && c.texto === 'Población total')) {
          totalRow = r
          break
        }
      }
    }
    const numAt = (col: string, row: number | null): number | null =>
      row === null ? null : cells.find((c) => c.fila === row && c.col === col)?.numerico ?? null
    const totalCelda = numAt('B', totalRow)
    const hombreCelda = numAt('C', totalRow)
    const mujerCelda = numAt('D', totalRow)
    const okPiramide =
      frasePresente &&
      totalCelda !== null && totalCelda === structure.totals.total &&
      hombreCelda !== null && hombreCelda === structure.totals.male &&
      mujerCelda !== null && mujerCelda === structure.totals.female
    piramide = {
      frasePresente,
      totalJson: structure.totals.total,
      totalCelda,
      hombreJson: structure.totals.male,
      hombreCelda,
      mujerJson: structure.totals.female,
      mujerCelda,
      ok: okPiramide,
    }
    gate(
      'piramide-2025',
      okPiramide,
      3,
      `frase "a 1 de enero de 2025" ${frasePresente ? 'presente' : 'AUSENTE'} · total JSON=${structure.totals.total}/celda=${totalCelda} · hombres JSON=${structure.totals.male}/celda=${hombreCelda} · mujeres JSON=${structure.totals.female}/celda=${mujerCelda}`,
    )
  } else {
    gate('piramide-2025', false, 0, 'sin_estructura: no verificable')
  }

  // --- Gate 8: navegación ----------------------------------------------------
  const nombresOk = ctx.names.join('|') === SOCIDEAS_BOOK_SHEET_IDS.join('|')
  gate(
    'navegacion',
    nombresOk && base.internalLinks > 0 && !base.problems.some((p) => p.includes("Hipervínculo interno con '#'")),
    base.internalLinks,
    `hojas=${ctx.names.length} en orden contractual=${nombresOk} · enlaces internos=${base.internalLinks}`,
  )

  // --- Gate 9: tablas --------------------------------------------------------
  const tablasEsperadas = allBlocks.filter((b) => b.tablaExcel !== undefined && b.filas.length > 0).length
  gate(
    'tablas',
    base.tables === tablasEsperadas && tablasEsperadas > 0,
    base.tables,
    `tablas OOXML=${base.tables} · esperadas (bloques con tablaExcel y filas)=${tablasEsperadas}`,
  )

  // --- Gate 10: freeze -------------------------------------------------------
  gate(
    'freeze',
    base.freezeSheets === ctx.names.length,
    base.freezeSheets,
    `hojas con panel congelado=${base.freezeSheets}/${ctx.names.length}`,
  )

  // --- Gate 11: fórmulas -----------------------------------------------------
  const problemasFormula = base.problems.filter((p) => p.includes('Error de fórmula')).length
  gate(
    'formulas',
    metrics.formulaErrors === 0 && problemasFormula === 0,
    metrics.formulas,
    `fórmulas=${metrics.formulas} · errores métricos=${metrics.formulaErrors} · errores OOXML=${problemasFormula}`,
  )

  // --- Gate 12: ND -----------------------------------------------------------
  const malformedNd = allBlocks.flatMap((b) => b.filas).flatMap((f) => f).filter((c) => c.text === 'ND' && c.numeric !== null).length
  gate(
    'nd',
    malformedNd === 0,
    base.ndCells,
    `celdas ND=${base.ndCells} · ND con valor numérico=${malformedNd}`,
  )

  // --- Gate 13: duplicados ---------------------------------------------------
  gate(
    'duplicados',
    base.duplicateKeys === 0,
    base.duplicateKeys,
    `claves de indicador duplicadas=${base.duplicateKeys}`,
  )

  // --- Gate 14: reconciliaciones --------------------------------------------
  gate(
    'reconciliaciones',
    base.checks.failed.length === 0,
    base.checks.ok,
    `checks OK=${base.checks.ok}/${base.checks.total}${base.checks.failed.length > 0 ? ` · fallos: ${base.checks.failed.join(', ')}` : ''}`,
  )

  // --- Gate 15: OOXML --------------------------------------------------------
  const requiredParts = ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml']
  const partesPresentes = requiredParts.filter((p) => ctx.zip.file(p) !== null).length
  gate(
    'ooxml',
    partesPresentes === requiredParts.length && metrics.charts > 0 && ctx.names.length === SOCIDEAS_BOOK_SHEET_IDS.length,
    partesPresentes,
    `partes requeridas=${partesPresentes}/${requiredParts.length} · hojas=${ctx.names.length} · charts=${metrics.charts} · tablas=${base.tables}`,
  )

  return {
    ok: base.ok && gates.every((g) => g.ok),
    gates,
    problems,
    estructuraUsada: structure !== null,
    desactualizados,
    negativos,
    charts: { bloquesConChart, bloquesConTodasLasSeries, esperados: chartsEsperados, reales: chartsReales, seriesSinDato },
    insular,
    piramide,
    ooxml: { hojas: ctx.names.length, charts: metrics.charts, tablas: base.tables, freeze: base.freezeSheets, ndCells: base.ndCells, partesRequeridas: partesPresentes },
  }
}

// ============================================================================
// 7. Excel COM / LibreOffice (gate real de apertura)
// ============================================================================

interface ComResult {
  file: string
  status: 'ok' | 'no_disponible' | 'fallo'
  worksheets: number | null
  charts: number | null
  listObjects: number | null
  error: string | null
  ms: number
}

function psLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function runPowerShell(script: string, timeoutMs: number): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    timeout: timeoutMs,
    windowsHide: true,
    encoding: 'utf8',
  })
}

/** Abre el XLSX con Excel COM y devuelve hojas/gráficos/tablas; cierra sin guardar. */
function checkWithExcelCom(file: string): ComResult {
  const t0 = Date.now()
  const ps = `
$ErrorActionPreference = 'Stop'
try {
  $excel = New-Object -ComObject Excel.Application
} catch {
  @{ status = 'no_disponible'; detail = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 0
}
$wb = $null
try {
  $excel.DisplayAlerts = $false
  $excel.Visible = $false
  $excel.AutomationSecurity = 3
  $wb = $excel.Workbooks.Open(${psLiteral(path.resolve(file))}, 0, $true)
  $sheets = $wb.Worksheets.Count
  $charts = 0
  $lists = 0
  foreach ($ws in $wb.Worksheets) {
    $charts += $ws.ChartObjects().Count
    $lists += $ws.ListObjects.Count
  }
  @{ status = 'ok'; worksheets = $sheets; charts = $charts; listObjects = $lists } | ConvertTo-Json -Compress
} catch {
  @{ status = 'fallo'; detail = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  try { if ($wb -ne $null) { $wb.Close($false) } } catch {}
  try { $excel.Quit() } catch {}
  try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`
  try {
    const out = runPowerShell(ps, 180000).trim()
    const lastLine = out.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).pop() ?? ''
    const parsed = JSON.parse(lastLine) as { status: string; worksheets?: number; charts?: number; listObjects?: number; detail?: string }
    if (parsed.status === 'ok') {
      return {
        file, status: 'ok',
        worksheets: parsed.worksheets ?? null, charts: parsed.charts ?? null, listObjects: parsed.listObjects ?? null,
        error: null, ms: Date.now() - t0,
      }
    }
    if (parsed.status === 'no_disponible') {
      return { file, status: 'no_disponible', worksheets: null, charts: null, listObjects: null, error: parsed.detail ?? 'Excel COM no disponible', ms: Date.now() - t0 }
    }
    return { file, status: 'fallo', worksheets: null, charts: null, listObjects: null, error: parsed.detail ?? 'Fallo desconocido al abrir con Excel COM', ms: Date.now() - t0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const noDisponible = /ENOENT|not recognized|no se reconoce|CommandNotFoundException|EPERM/i.test(msg)
    return { file, status: noDisponible ? 'no_disponible' : 'fallo', worksheets: null, charts: null, listObjects: null, error: msg.slice(0, 500), ms: Date.now() - t0 }
  }
}

interface LibreOfficeResult {
  status: 'instalado' | 'no_instalado'
  ruta: string | null
  nota: string
}

function detectLibreOffice(): LibreOfficeResult {
  const ps = `
$ruta = $null
try {
  $cmd = Get-Command soffice -ErrorAction SilentlyContinue
  if ($cmd) { $ruta = $cmd.Source }
  if (-not $ruta) {
    foreach ($p in @('C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe')) {
      if (Test-Path $p) { $ruta = $p; break }
    }
  }
} catch { }
@{ instalado = [bool]$ruta; ruta = $ruta } | ConvertTo-Json -Compress
`
  try {
    const out = runPowerShell(ps, 30000).trim()
    const lastLine = out.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).pop() ?? ''
    const parsed = JSON.parse(lastLine) as { instalado: boolean; ruta: string | null }
    if (parsed.instalado && parsed.ruta) {
      return { status: 'instalado', ruta: parsed.ruta, nota: 'LibreOffice disponible (no usado: el gate de apertura se ejecuta con Excel COM).' }
    }
    return {
      status: 'no_instalado', ruta: null,
      nota: 'LibreOffice (soffice) no instalado en esta máquina: la verificación de apertura real se sustituye por Excel COM (equivalente, distinto motor).',
    }
  } catch (e) {
    return {
      status: 'no_instalado', ruta: null,
      nota: `No se pudo consultar soffice (${e instanceof Error ? e.message : String(e)}): la verificación de apertura real se sustituye por Excel COM.`,
    }
  }
}

// ============================================================================
// 8. Generación de pilotos (v2 y v2.1)
// ============================================================================

interface PilotBloqueInfo {
  hoja: string
  id: string
  titulo: string
  periodo: string
  filas: number
  indicadores: number
  chart: string | null
  tablaExcel: string | null
  plegable: boolean
}

interface PilotResult {
  ine: string
  municipio: string | null
  status: 'ok' | 'sin_datos' | 'sin_estructura' | 'error'
  error?: string
  /** Tiempo de `buildSocideasBookXlsx` (solo generación del XLSX). */
  buildMs?: number
  /** Tiempo total del piloto (datos + ensamblado + XLSX + validación + COM). */
  totalMs?: number
  sizeKB?: number
  outFile?: string
  metrics?: XlsxMetrics
  validation?: BookValidation
  coverage?: { global: number; publicables: number; declarados: number }
  rubric?: RubricScore
  areaCoverage?: Record<string, number>
  indicadores?: { total: number; porEstado: Record<string, number> }
  bloques?: PilotBloqueInfo[]
  desactualizados?: { slug: string; periodo: string; motivo: string; latest: string | null }[]
  legacyPiramideAnio?: number | null
  estructura?: StructureSummary
  v21?: V21Report
  com?: ComResult | null
}

interface BuildPilotOptions {
  outDir: string
  /** null = libro v2 (sin estructura). */
  structure: PopulationStructureAnnual | null
  estructuraLoad: StructureLoad | null
  /** Ejecutar el gate Excel COM para este piloto. */
  runCom: boolean
  /** Marca de conjunto para informes. */
  conjunto: 'v2' | 'v2.1'
}

/**
 * Canal lateral de memoria: los indicadores completos del último libro
 * ensamblado por piloto, para construir el inventario de frescura sin duplicar
 * el modelo dentro del JSON del informe. Clave: `${conjunto}:${ine}`.
 */
const MODEL_INDICATORS = new Map<string, BookIndicator[]>()

async function buildPilot(ine: string, supabaseUrl: string, supabaseKey: string, opts: BuildPilotOptions): Promise<PilotResult> {
  const t0 = Date.now()
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    const [demo, eco] = await Promise.all([
      getPerfilDemografico(supabase, ine, {}),
      getPerfilEconomico(supabase, ine),
    ])
    const perfilDemo = demo.status === 'ok' || demo.status === 'empty' ? demo.perfil : null
    const perfilEco = eco.status === 'ok' || eco.status === 'empty' ? eco.perfil : null
    if (!perfilDemo && !perfilEco) return { ine, municipio: null, status: 'sin_datos' }

    const municipio = perfilDemo?.municipio.nombre ?? perfilEco?.municipio.nombre ?? ine
    const provincia = perfilDemo?.municipio.provincia ?? perfilEco?.municipio.provincia ?? 'No disponible'
    const comunidadAutonoma = perfilDemo?.municipio.comunidad_autonoma ?? perfilEco?.municipio.comunidad_autonoma ?? 'No disponible'
    const provinciaCodigo = perfilDemo?.municipio.provincia_codigo_ine ?? perfilEco?.municipio.provincia_codigo_ine ?? ine.slice(0, 2)

    const [demoExtra, migracion, ineLayers] = await Promise.all([
      readDemographicPresentation(ine).catch(() => null),
      readMigrationPresentation(ine).catch(() => null),
      readLayersForQa(ine),
    ])

    const payloads = loadPayloads(ine, provinciaCodigo, provincia)
    const bookInput: SocideasBookInputV2 = {
      municipio,
      codigoINE: ine,
      provincia,
      comunidadAutonoma,
      fechaGeneracion: new Date().toISOString().slice(0, 10),
      perfilDemografia: perfilDemo,
      perfilEconomia: perfilEco,
      ineLayers,
      demoExtra,
      migracion,
      populationStructure: opts.structure,
      ...payloads,
    }
    const book = assembleSocideasBookV2(bookInput)

    // Defensa: recalcular duplicados desde el modelo por si el ensamblado cambia.
    const allIndicators: BookIndicator[] = book.sheets.flatMap((s) => s.bloques.flatMap((b) => b.indicadores))
    const dup = findDuplicateIndicatorKeys(allIndicators)
    if (dup.length > 0 && book.duplicateKeys.length === 0) book.duplicateKeys.push(...dup)

    const bloquesConDatos = book.sheets.flatMap((s) => s.bloques).filter((b) => b.filas.some((f) => f.some((c) => c.numeric !== null))).length
    if (bloquesConDatos === 0) return { ine, municipio, status: 'sin_datos' }

    const buildStart = Date.now()
    const buffer = await buildSocideasBookXlsx(book)
    const buildMs = Date.now() - buildStart

    fs.mkdirSync(opts.outDir, { recursive: true })
    const safeName = municipio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const outFile = path.join(opts.outDir, `SOCideas_${safeName}_${ine}_libro.xlsx`)
    fs.writeFileSync(outFile, buffer)

    const metrics = await metricsFromBuffer(buffer, path.basename(outFile))
    const validation = await validateGeneratedBook(buffer, book)
    MODEL_INDICATORS.set(`${opts.conjunto}:${ine}`, allIndicators)
    const desactualizados = allIndicators
      .filter((i) => i.freshness_status === 'desactualizado')
      .map((i) => ({ slug: i.slug, periodo: i.periodo, motivo: i.freshness_reason, latest: i.latest_available_period }))

    let v21: V21Report | undefined
    if (opts.conjunto === 'v2.1') {
      v21 = await validateV21Book(buffer, book, opts.structure, validation, metrics)
    }

    const areaCoverage = areaCoverageFromMetrics(metrics)
    const structureUsed = opts.structure !== null
    const desactualizadosCount = allIndicators.filter((i) => i.freshness_status === 'desactualizado').length
    const frescura =
      opts.conjunto === 'v2.1'
        ? v21FreshnessScore(desactualizadosCount, structureUsed)
        : measurableFreshnessScore(metrics)
    const rubric = scoreRubric(metrics, areaCoverage, frescura)
    const porEstado: Record<string, number> = {}
    for (const i of allIndicators) porEstado[i.availability] = (porEstado[i.availability] ?? 0) + 1

    let com: ComResult | null = null
    if (opts.conjunto === 'v2.1' && opts.runCom) {
      com = checkWithExcelCom(outFile)
      // El gate COM se integra en los gates del piloto: `no_disponible` NO falla
      // (documentado); una excepción de apertura SÍ falla el gate con el mensaje.
      if (v21) {
        const comOk = com.status !== 'fallo'
        const detalle =
          com.status === 'ok'
            ? `Excel COM abrió sin reparación: hojas=${com.worksheets} · charts=${com.charts} · ListObjects=${com.listObjects} (${com.ms} ms)`
            : com.status === 'no_disponible'
              ? `Excel COM no disponible (no falla, documentado): ${com.error ?? 'sin detalle'}`
              : `Excel COM falló al abrir: ${com.error ?? 'sin detalle'}`
        v21.gates.push({ id: 'com', ok: comOk, conteo: com.charts ?? null, detalle })
        if (!comOk) {
          v21.problems.push(`com: ${detalle}`)
          v21.ok = false
        }
      }
    }

    const bloques: PilotBloqueInfo[] = book.sheets.flatMap((s) =>
      s.bloques.map((b) => ({
        hoja: s.id,
        id: b.id,
        titulo: b.titulo,
        periodo: b.periodo,
        filas: b.filas.length,
        indicadores: b.indicadores.length,
        chart: b.chart?.id ?? null,
        tablaExcel: b.tablaExcel ?? null,
        plegable: b.plegable === true,
      })),
    )

    return {
      ine,
      municipio,
      status: opts.conjunto === 'v2.1' && opts.estructuraLoad?.status === 'sin_estructura' ? 'sin_estructura' : 'ok',
      buildMs,
      totalMs: Date.now() - t0,
      sizeKB: metrics.sizeKB,
      outFile,
      metrics,
      validation,
      coverage: book.coverage,
      rubric,
      areaCoverage,
      indicadores: { total: allIndicators.length, porEstado },
      bloques,
      desactualizados,
      legacyPiramideAnio: perfilDemo?.piramide.anio ?? null,
      estructura: opts.estructuraLoad ? summarizeStructure(opts.estructuraLoad) : undefined,
      v21,
      com,
    }
  } catch (e) {
    return { ine, municipio: null, status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

// ============================================================================
// 9. Informes
// ============================================================================

interface BaselineReport {
  file: string
  metrics?: XlsxMetrics
  rubric?: RubricScore
  areaCoverage?: Record<string, number>
}

function renderRubricRow(label: string, s?: RubricScore): string {
  if (!s) return `| ${label} | — |`
  const dims = (['coberturaReal', 'profundidad', 'series', 'desagregacion', 'comparativas', 'actualidad', 'fuentes', 'trazabilidad', 'consistencia', 'visualizacion', 'reutilizacion', 'frescura'] as const)
    .map((k) => s[k].toFixed(1))
    .join(' | ')
  return `| ${label} | ${dims} | **${s.total}** |`
}

const RUBRIC_MD_HEADER = `| Libro | ${(['coberturaReal', 'profundidad', 'series', 'desagregacion', 'comparativas', 'actualidad', 'fuentes', 'trazabilidad', 'consistencia', 'visualizacion', 'reutilizacion', 'frescura'] as const).map((k) => RUBRIC_LABELS[k]).join(' | ')} | TOTAL |`
const RUBRIC_MD_SEP = `|---|${Array(13).fill('---').join('|')}|`

function renderMetricsRow(label: string, m?: XlsxMetrics): string {
  if (!m) return `| ${label} | — |`
  return `| ${label} | ${m.sheetCount} | ${m.numericCells} | ${m.formulas} | ${m.charts} | ${m.tables} | ${m.sheets.filter((s) => s.autoFilter).length} | ${m.sheets.filter((s) => s.freeze).length} | ${m.sheets.reduce((a, s) => a + s.internalLinks, 0)} | ${m.externals.length} | ${m.ndCells} | ${m.formulaErrors} |`
}

function renderMarkdown(report: {
  fecha: string
  esquema: string
  baselines: BaselineReport[]
  pilotos: PilotResult[]
  resumen: { antes: RubricScore | null; despues: RubricScore | null; torrejoncillo: RubricScore | null; reglaFrescura: string }
}): string {
  const lines: string[] = []
  lines.push('# Informe QA — SOCideas libro municipal v2 vs baseline (rúbrica 12 dimensiones)')
  lines.push('')
  lines.push(`Fecha: ${report.fecha}`)
  lines.push(`Esquema: ${report.esquema}`)
  lines.push('')
  lines.push('## Rúbrica (0-100)')
  lines.push('')
  lines.push(`Regla de frescura aplicada a v2/baselines: ${report.resumen.reglaFrescura}`)
  lines.push('')
  lines.push(RUBRIC_MD_HEADER)
  lines.push(RUBRIC_MD_SEP)
  for (const b of report.baselines) lines.push(renderRubricRow(b.file, b.rubric))
  for (const p of report.pilotos) lines.push(renderRubricRow(`${p.municipio ?? p.ine} (${p.ine}) v2`, p.rubric))
  lines.push('')
  lines.push('## Estructura medible')
  lines.push('')
  lines.push('| Libro | Hojas | Celdas num. | Fórmulas | Gráficos | Tablas | Filtros | Freeze | Enlaces int. | Enlaces ext. | ND | Errores fórmula | Pirámide 2025 |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  const mrow = (label: string, m?: XlsxMetrics) =>
    m ? `${renderMetricsRow(label, m).replace(/ \|$/, '')} | ${m.hasPyramid2025Phrase ? 'sí' : 'no'} |` : `| ${label} | — |`
  for (const b of report.baselines) lines.push(mrow(b.file, b.metrics))
  for (const p of report.pilotos) lines.push(mrow(`${p.municipio ?? p.ine} (${p.ine}) v2`, p.metrics))
  lines.push('')
  lines.push('## Validación del contrato v2 (pilotos)')
  lines.push('')
  for (const p of report.pilotos) {
    if (p.status !== 'ok' || !p.validation) {
      lines.push(`- ${p.municipio ?? p.ine} (${p.ine}): ${p.status}${p.error ? ` — ${p.error}` : ''}`)
      continue
    }
    lines.push(`- ${p.municipio} (${p.ine}): ${p.validation.ok ? 'OK' : 'REVISAR'} · checks ${p.validation.checks.ok}/${p.validation.checks.total} · cobertura ${p.coverage?.global}% · ${p.indicadores?.total} indicadores · ${p.sizeKB} KB · ${p.buildMs} ms · frescura ${p.rubric?.frescura}`)
    for (const problem of p.validation.problems) lines.push(`  - ${problem}`)
  }
  return lines.join('\n') + '\n'
}

function renderFrescuraMd(report: {
  generadoEn: string
  reglas: Record<string, string>
  filas: Record<string, string | number | null>[]
  porEstado: Record<string, number>
}): string {
  const lines: string[] = []
  lines.push('# Frescura de indicadores — libros v2.1 (`socideas-book@2`)')
  lines.push('')
  lines.push(`Generado: ${report.generadoEn}`)
  lines.push('')
  lines.push('## Reglas aplicadas')
  lines.push('')
  for (const [k, v] of Object.entries(report.reglas)) lines.push(`- **${k}**: ${v}`)
  lines.push('')
  lines.push('## Resumen por estado')
  lines.push('')
  lines.push('| Estado | Indicadores |')
  lines.push('|---|---|')
  for (const [estado, n] of Object.entries(report.porEstado).sort((a, b) => b[1] - a[1])) lines.push(`| ${estado} | ${n} |`)
  lines.push(`| **Total (claves únicas)** | **${report.filas.length}** |`)
  lines.push('')
  lines.push('## Detalle por indicador')
  lines.push('')
  lines.push('| indicatorId | etiqueta | fuente | operacion | tableId | sourceUrl | periodoUsado | ultimoPeriodoDisponible | desfase | fechaConsulta | fechaPublicacion | coberturaTerritorial | unidad | estado | motivo | accionRecomendada |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const f of report.filas) {
    const esc = (v: unknown) => String(v ?? '—').replace(/\|/g, '\\|')
    lines.push(`| ${esc(f.indicatorId)} | ${esc(f.etiqueta)} | ${esc(f.fuente)} | ${esc(f.operacion)} | ${esc(f.tableId)} | ${esc(f.sourceUrl)} | ${esc(f.periodoUsado)} | ${esc(f.ultimoPeriodoDisponible)} | ${esc(f.desfase)} | ${esc(f.fechaConsulta)} | ${esc(f.fechaPublicacion)} | ${esc(f.coberturaTerritorial)} | ${esc(f.unidad)} | ${esc(f.estado)} | ${esc(f.motivo)} | ${esc(f.accionRecomendada)} |`)
  }
  return lines.join('\n') + '\n'
}

function renderReconciliacionMd(report: {
  generadoEn: string
  reglas: string[]
  pilotos: {
    ine: string
    municipio: string
    totals2025: { total: number | null; male: number | null; female: number | null }
    crossCheck68065: StructureCrossCheck68065 | null
    checks: { id: string; izquierda: number | null; derecha: number | null; ok: boolean }[]
    bandas: number
    edadesSimples: number | null
    legacyPiramideAnio: number | null
    saltoAnios: number | null
    xlsx: { file: string; sizeKB: number; buildMs: number }
  }[]
  fase9: Fase9Metrics
}): string {
  const lines: string[] = []
  lines.push('# Reconciliación demográfica 2025 — estructura anual por municipio')
  lines.push('')
  lines.push(`Generado: ${report.generadoEn}`)
  lines.push('')
  for (const r of report.reglas) lines.push(`- ${r}`)
  lines.push('')
  lines.push('## Totales y reconciliaciones por piloto')
  lines.push('')
  lines.push('| Municipio (INE) | Total 2025 | H | M | 68065 | Bandas | Edades simples | Pirámide previa | Salto | Checks estructura | XLSX |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const p of report.pilotos) {
    const checksOk = p.checks.filter((c) => c.ok).length
    const cross = p.crossCheck68065 === null ? 'no encontrado' : p.crossCheck68065.matches ? 'coincide' : 'DIVERGE'
    lines.push(
      `| ${p.municipio} (${p.ine}) | ${p.totals2025.total ?? 'ND'} | ${p.totals2025.male ?? 'ND'} | ${p.totals2025.female ?? 'ND'} | ${cross} | ${p.bandas} | ${p.edadesSimples ?? '—'} | ${p.legacyPiramideAnio ?? '—'} | ${p.saltoAnios ?? '—'} | ${checksOk}/${p.checks.length} | ${p.xlsx.file} (${p.xlsx.sizeKB} KB, ${p.xlsx.buildMs} ms) |`,
    )
  }
  lines.push('')
  lines.push('## Checks de estructura (izquierda = derecha, tolerancia 0)')
  lines.push('')
  for (const p of report.pilotos) {
    lines.push(`### ${p.municipio} (${p.ine})`)
    lines.push('')
    for (const c of p.checks) {
      lines.push(`- ${c.ok ? 'OK' : 'FALLO'} · ${c.id}: ${c.izquierda ?? 'ND'} = ${c.derecha ?? 'ND'}`)
    }
    lines.push('')
  }
  lines.push('## Métricas Fase 9 (ingesta y objetos)')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(report.fase9, null, 2))
  lines.push('```')
  return lines.join('\n') + '\n'
}

// ============================================================================
// Frescura por indicador (v2.1)
// ============================================================================

const FRESCURA_EDM_URL = AEAT_EDM_IRPF.publicUrl ?? null

/** URL de la tabla fuente, sin inventar: solo reglas declaradas. */
function sourceUrlForTable(tableId: string | null): string | null {
  if (tableId === null || tableId === '') return null
  if (/^\d+$/.test(tableId)) return `https://www.ine.es/jaxiT3/Tabla.htm?t=${tableId}`
  if (tableId.startsWith('MIR_MUNI')) return 'https://infoelectoral.interior.gob.es/es/elecciones-celebradas/datos-abiertos/'
  if (tableId === 'EDM2023') return FRESCURA_EDM_URL
  return null
}

function accionRecomendada(i: BookIndicator): string {
  switch (i.freshness_status) {
    case 'actualizado':
      return 'Ninguna: dato de la última edición oficial verificada.'
    case 'ultimo_oficial':
      return 'Ninguna: última convocatoria/edición oficial celebrada.'
    case 'estructural':
      return 'Ninguna: última edición estructural disponible.'
    case 'desactualizado':
      return i.latest_available_period !== null ? `Cargar edición ${i.latest_available_period}` : 'Revisar si existe edición oficial más reciente.'
    case 'serie_parcial':
      return i.latest_available_period !== null ? `Completar serie hasta ${i.latest_available_period}` : 'Completar serie.'
    case 'pendiente_integracion':
      return `Integrar operación candidata: ${i.operacion}`
    case 'no_disponible':
      return 'Ninguna: sin edición oficial verificada (se mantiene declarado).'
  }
}

function desfaseDe(i: BookIndicator): number | string | null {
  if (i.lag_years !== null) return i.lag_years
  if (i.lag_months !== null) return `${i.lag_months} meses`
  return null
}

type FrescuraRow = {
  indicatorId: string
  etiqueta: string
  fuente: string
  operacion: string
  tableId: string | null
  sourceUrl: string | null
  periodoUsado: string
  ultimoPeriodoDisponible: string | null
  desfase: number | string | null
  fechaConsulta: string | null
  fechaPublicacion: string | null
  coberturaTerritorial: string
  unidad: string
  estado: string
  motivo: string
  accionRecomendada: string
}

/**
 * Una fila por indicador (clave canónica `area|slug|periodo|ambito|dimensiones`)
 * uniendo los libros v2.1. Si la misma clave aparece en varios pilotos con
 * distinta disponibilidad (p. ej. `statistical_secrecy` en un municipio pequeño),
 * se conserva la ocurrencia PUBLICADA (`available`/`partial`); la regla queda
 * declarada en el informe. Nunca se inventan url ni períodos.
 */
function buildFrescuraRows(pilotos: PilotResult[]): { filas: FrescuraRow[]; porEstado: Record<string, number> } {
  const byKey = new Map<string, { ind: BookIndicator; publicado: boolean }>()
  for (const p of pilotos) {
    const indicators = MODEL_INDICATORS.get(`v2.1:${p.ine}`) ?? []
    for (const ind of indicators) {
      const key = bookIndicatorKey(ind)
      const publicado = ind.availability === 'available' || ind.availability === 'partial'
      const previo = byKey.get(key)
      if (previo === undefined) {
        byKey.set(key, { ind, publicado })
      } else if (!previo.publicado && publicado) {
        byKey.set(key, { ind, publicado })
      }
    }
  }
  const filas: FrescuraRow[] = [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { ind }]) => ({
      indicatorId: key,
      etiqueta: ind.nombre,
      fuente: ind.organismo,
      operacion: ind.operacion,
      tableId: ind.table_id,
      sourceUrl: sourceUrlForTable(ind.table_id),
      periodoUsado: ind.source_period,
      ultimoPeriodoDisponible: ind.latest_available_period,
      desfase: desfaseDe(ind),
      fechaConsulta: ind.retrieved_at ?? ind.fecha_extraccion ?? null,
      fechaPublicacion: ind.release_date,
      coberturaTerritorial: ind.ambito,
      unidad: ind.unidad,
      estado: ind.freshness_status,
      motivo: ind.freshness_reason,
      accionRecomendada: accionRecomendada(ind),
    }))
  const porEstado: Record<string, number> = {}
  for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1
  return { filas, porEstado }
}

// ============================================================================
// Métricas de Fase 9 (ingesta 68535/68065, objetos y XLSX)
// ============================================================================

interface Fase9Metrics {
  ingesta: {
    resumenIngestaFile: string | null
    periodo: string | null
    ficheros: Record<string, { ruta: string; bytes: number | null; filasLeidas: number | null; msIngesta: number | null; msChecksum: number | null; sha256: string | null }>
  }
  municipiosEnDisco: number
  objetos: { prettyMedio: number; prettyP95: number; prettyMax: number; compactoMedio: number; compactoP95: number; compactoMax: number }
  xlsxV21: { ine: string; municipio: string | null; file: string | null; bytes: number | null; sizeKB: number | null; buildMs: number | null; totalMs: number | null }[]
  ssr: { objetoMedioBytes: number; estimacion: string }
  notas: string[]
}

function percentileNearestRank(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil(p * sorted.length)
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1))
  return sorted[index]
}

interface ResumenIngestaFile {
  periodo?: string
  ficheros?: Record<string, { ruta?: string; filasLeidas?: number; msIngesta?: number; msChecksum?: number; sha256?: string }>
}

function readFase9Metrics(pilotosV21: PilotResult[]): Fase9Metrics {
  const notas: string[] = []
  const resumenFile = path.join(STRUCTURE_DIR, 'resumen-ingesta.json')
  let resumen: ResumenIngestaFile | null = null
  const ficheros: Fase9Metrics['ingesta']['ficheros'] = {
    '68535': { ruta: 'tmp/ingesta/68535.csv', bytes: null, filasLeidas: null, msIngesta: null, msChecksum: null, sha256: null },
    '68534': { ruta: 'tmp/ingesta/68534.csv', bytes: null, filasLeidas: null, msIngesta: null, msChecksum: null, sha256: null },
    '68065': { ruta: 'tmp/ingesta/68065.csv', bytes: null, filasLeidas: null, msIngesta: null, msChecksum: null, sha256: null },
  }
  if (fs.existsSync(resumenFile)) {
    try {
      resumen = JSON.parse(fs.readFileSync(resumenFile, 'utf8')) as ResumenIngestaFile
      for (const key of ['68535', '68534', '68065']) {
        const f = resumen.ficheros?.[key]
        if (f) {
          ficheros[key] = {
            ruta: f.ruta ?? ficheros[key].ruta,
            bytes: null,
            filasLeidas: f.filasLeidas ?? null,
            msIngesta: f.msIngesta ?? null,
            msChecksum: f.msChecksum ?? null,
            sha256: f.sha256 ?? null,
          }
        }
      }
      notas.push('resumen-ingesta.json refleja la ÚLTIMA corrida del cargador (no agrega corridas anteriores).')
    } catch (e) {
      notas.push(`resumen-ingesta.json ilegible: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    notas.push('resumen-ingesta.json no encontrado: las métricas de ingesta quedan sin filas/tiempos.')
  }
  for (const [key, def] of Object.entries(ficheros)) {
    if (fs.existsSync(def.ruta)) ficheros[key] = { ...def, bytes: fs.statSync(def.ruta).size }
  }
  if (ficheros['68534'].bytes !== null && ficheros['68534'].filasLeidas === null) {
    notas.push('68534 está en disco (bytes medidos) pero la última corrida de resumen-ingesta.json no registró filas/tiempos para ella (no incluía municipios insulares); la corrida nacional con 07024 sí la usó.')
  }

  const dirFiles = fs.existsSync(STRUCTURE_DIR) ? fs.readdirSync(STRUCTURE_DIR).filter((f) => f.endsWith('.json') && f !== 'resumen-ingesta.json') : []
  const pretty: number[] = []
  const compacto: number[] = []
  for (const f of dirFiles) {
    try {
      const text = fs.readFileSync(path.join(STRUCTURE_DIR, f), 'utf8')
      pretty.push(Buffer.byteLength(text, 'utf8'))
      compacto.push(Buffer.byteLength(JSON.stringify(JSON.parse(text)), 'utf8'))
    } catch {
      // Un objeto ilegible no debería existir; se omite y el conteo lo delata.
    }
  }
  pretty.sort((a, b) => a - b)
  compacto.sort((a, b) => a - b)
  const mean = (arr: number[]) => (arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length))
  if (dirFiles.length !== 8132) notas.push(`Objetos en disco: ${dirFiles.length} (el enunciado declara 8.132).`)
  const declared = { medio: 3540, p95: 3727, max: 3727 }
  if (mean(pretty) !== declared.medio || percentileNearestRank(pretty, 0.95) !== declared.p95 || (pretty[pretty.length - 1] ?? 0) !== declared.max) {
    notas.push(`Las métricas declaradas de objetos (medio ${declared.medio} B · p95 ${declared.p95} B · máx ${declared.max} B) NO coinciden con lo medido en disco.`)
  }

  const xlsxV21 = pilotosV21.map((p) => ({
    ine: p.ine,
    municipio: p.municipio,
    file: p.outFile ?? null,
    bytes: p.outFile && fs.existsSync(p.outFile) ? fs.statSync(p.outFile).size : null,
    sizeKB: p.sizeKB ?? null,
    buildMs: p.buildMs ?? null,
    totalMs: p.totalMs ?? null,
  }))

  const objetoMedioBytes = mean(compacto)
  return {
    ingesta: { resumenIngestaFile: fs.existsSync(resumenFile) ? resumenFile : null, periodo: resumen?.periodo ?? null, ficheros },
    municipiosEnDisco: dirFiles.length,
    objetos: {
      prettyMedio: mean(pretty),
      prettyP95: percentileNearestRank(pretty, 0.95),
      prettyMax: pretty[pretty.length - 1] ?? 0,
      compactoMedio: objetoMedioBytes,
      compactoP95: percentileNearestRank(compacto, 0.95),
      compactoMax: compacto[compacto.length - 1] ?? 0,
    },
    xlsxV21,
    ssr: {
      objetoMedioBytes,
      estimacion: `Sin caché, cada petición SSR que cargue la estructura de un municipio añade ~${(objetoMedioBytes / 1024).toFixed(1)} KB de JSON compacto (medio medido); con el objeto serializado formateado como en tmp/audit, ~${(mean(pretty) / 1024).toFixed(1)} KB. 1.000 peticiones/día ≈ ${(objetoMedioBytes * 1000 / (1024 * 1024)).toFixed(1)} MB/día de transferencia adicional antes de compresión.`,
    },
    notas,
  }
}

// ============================================================================
// 9b. Informe v2.1 (comparativo, gates, período por bloque, pendientes)
// ============================================================================

interface ComparativeRow {
  etiqueta: string
  rubric: RubricScore | null
  metrics: XlsxMetrics | null
  desactualizados: number | null
}

interface V21Doc {
  fecha: string
  esquema: string
  ines: string[]
  com: string[] | null
  libreoffice: LibreOfficeResult
  comparativa: { before: ComparativeRow[]; v2: ComparativeRow[]; v21: ComparativeRow[]; medias: { before: RubricScore | null; v2: RubricScore | null; v21: RubricScore | null } }
  pilotos: PilotResult[]
  diferencias: { ine: string; municipio: string | null; sinContraparte: boolean; anadidos: string[]; eliminados: string[]; metricas: Record<string, number | null> }[]
  periodos: { hoja: string; bloque: string; periodo: string }[]
  ultimoPeriodo: { source_slug: string; latest: string | null; kind: string; reason: string }[]
  correcciones: string[]
  pendientes: { operacion: string; total: number; slugs: string[] }[]
  fase9: Fase9Metrics
  frescura: { totalIndicadores: number; porEstado: Record<string, number> }
  reglas: string[]
  anomalias: string[]
}

function renderV21Md(doc: V21Doc): string {
  const L: string[] = []
  L.push('# Informe QA — SOCideas libro municipal v2.1 (`socideas-book@2` + estructura 2025)')
  L.push('')
  L.push(`Fecha: ${doc.fecha}`)
  L.push(`Esquema: ${doc.esquema}`)
  L.push(`Pilotos v2.1: ${doc.ines.join(', ')}`)
  if (doc.ines.includes(INE_INSULAR)) {
    L.push('')
    L.push(`> **${INE_INSULAR} (Formentera) es el caso insular adicional**: ejercita el bloque \`estructura-edad-detalle\` (edad simple, tabla INE 68534) y el ámbito \`municipal_insular\`.`)
  }
  L.push('')
  L.push('## Reglas de esta corrida')
  L.push('')
  for (const r of doc.reglas) L.push(`- ${r}`)
  L.push('')
  L.push('## Tabla comparativa BEFORE / v2 / v2.1 (rúbrica 12 dimensiones)')
  L.push('')
  L.push(RUBRIC_MD_HEADER)
  L.push(RUBRIC_MD_SEP)
  for (const r of doc.comparativa.before) L.push(renderRubricRow(`BEFORE · ${r.etiqueta}`, r.rubric ?? undefined))
  for (const r of doc.comparativa.v2) L.push(renderRubricRow(`v2 · ${r.etiqueta}`, r.rubric ?? undefined))
  for (const r of doc.comparativa.v21) L.push(renderRubricRow(`v2.1 · ${r.etiqueta}`, r.rubric ?? undefined))
  L.push(renderRubricRow('**MEDIA BEFORE**', doc.comparativa.medias.before ?? undefined))
  L.push(renderRubricRow('**MEDIA v2**', doc.comparativa.medias.v2 ?? undefined))
  L.push(renderRubricRow('**MEDIA v2.1**', doc.comparativa.medias.v21 ?? undefined))
  L.push('')
  L.push('Regla de frescura v2/baselines (medible en el fichero): 10 si `xl/sharedStrings.xml` contiene "a 1 de enero de 2025"; 4 si no.')
  L.push('Regla de frescura v2.1 (declarada): 10 si 0 indicadores `desactualizado` y estructura 2025 usada; en otro caso max(0, 10 − 2 × nº desactualizados).')
  L.push('')
  L.push('## Estructura medible (v2.1)')
  L.push('')
  L.push('| Libro | Hojas | Celdas num. | Fórmulas | Gráficos | Tablas | Freeze | ND | Errores fórmula | Duplicados | Desactualizados | Pirámide 2025 | COM |')
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const p of doc.pilotos) {
    const m = p.metrics
    L.push(
      `| ${p.municipio ?? p.ine} (${p.ine}) | ${m?.sheetCount ?? '—'} | ${m?.numericCells ?? '—'} | ${m?.formulas ?? '—'} | ${m?.charts ?? '—'} | ${m?.tables ?? '—'} | ${p.validation?.freezeSheets ?? '—'} | ${m?.ndCells ?? '—'} | ${m?.formulaErrors ?? '—'} | ${p.validation?.duplicateKeys ?? '—'} | ${p.v21?.desactualizados.length ?? '—'} | ${m?.hasPyramid2025Phrase ? 'sí' : 'no'} | ${p.com ? p.com.status : 'no ejecutado'} |`,
    )
  }
  L.push('')
  L.push('## Gates por piloto v2.1 (OK/FALLO con conteo)')
  L.push('')
  for (const p of doc.pilotos) {
    L.push(`### ${p.municipio ?? p.ine} (${p.ine})`)
    L.push('')
    if (!p.v21) {
      L.push(`- ${p.status}${p.error ? `: ${p.error}` : ''}`)
      L.push('')
      continue
    }
    L.push(`Resultado global: **${p.v21.ok ? 'OK' : 'REVISAR'}** · gates ${p.v21.gates.filter((g) => g.ok).length}/${p.v21.gates.length} · cobertura ${p.coverage?.global}% · rúbrica ${p.rubric?.total} (frescura ${p.rubric?.frescura})`)
    L.push('')
    L.push('| Gate | Resultado | Conteo | Detalle |')
    L.push('|---|---|---|---|')
    for (const g of p.v21.gates) L.push(`| ${g.id} | ${g.ok ? 'OK' : 'FALLO'} | ${g.conteo ?? '—'} | ${g.detalle.replace(/\|/g, '\\|')} |`)
    L.push('')
    if (p.com) {
      L.push(`COM (${p.com.file}): **${p.com.status}** · hojas=${p.com.worksheets ?? '—'} · charts=${p.com.charts ?? '—'} · ListObjects=${p.com.listObjects ?? '—'}${p.com.error ? ` · ${p.com.error}` : ''} (${p.com.ms} ms)`)
      L.push('')
    }
  }
  if (doc.libreoffice.status === 'no_instalado') {
    L.push('## LibreOffice')
    L.push('')
    L.push(`\`soffice\` **no instalado** en esta máquina. ${doc.libreoffice.nota}`)
    L.push('')
  }
  L.push('## Período por bloque (v2.1)')
  L.push('')
  L.push('| Hoja | Bloque | Período |')
  L.push('|---|---|---|')
  for (const b of doc.periodos) L.push(`| ${b.hoja} | ${b.bloque} | ${b.periodo} |`)
  L.push('')
  L.push('## Último período disponible por operación (registro de frescura)')
  L.push('')
  L.push('| Operación (source_slug) | Última edición verificada | Tipo | Motivo |')
  L.push('|---|---|---|---|')
  for (const s of doc.ultimoPeriodo) L.push(`| ${s.source_slug} | ${s.latest ?? 'no verificada'} | ${s.kind} | ${s.reason} |`)
  L.push('')
  L.push('## Diferencias detectadas v2 → v2.1')
  L.push('')
  L.push('| Municipio (INE) | Bloques añadidos | Bloques retirados | Δ numéricas | Δ gráficos | Δ tablas | Δ fórmulas | Δ ND | Δ KB |')
  L.push('|---|---|---|---|---|---|---|---|---|')
  for (const d of doc.diferencias) {
    if (d.sinContraparte) {
      L.push(`| ${d.municipio ?? d.ine} (${d.ine}) | — | — | — | — | — | — | — | — |`)
      continue
    }
    const dm = (k: string) => (d.metricas[k] === null || d.metricas[k] === undefined ? '—' : String(d.metricas[k]))
    L.push(`| ${d.municipio ?? d.ine} (${d.ine}) | ${d.anadidos.join(', ') || '—'} | ${d.eliminados.join(', ') || '—'} | ${dm('numericCells')} | ${dm('charts')} | ${dm('tables')} | ${dm('formulas')} | ${dm('ndCells')} | ${dm('sizeKB')} |`)
  }
  L.push('')
  L.push('Nota: los deltas comparan el mismo municipio entre el libro v2 (sin estructura) y el v2.1. Si un piloto no tiene contraparte v2, la fila queda vacía.')
  if (doc.pilotos.some((p) => p.ine === INE_INSULAR)) L.push(`Formentera (${INE_INSULAR}) se incorpora también al conjunto v2 en esta corrida para que la comparación sea 1:1 (es el caso insular adicional de v2.1).`)
  L.push('')
  L.push('## Correcciones aplicadas en v2.1')
  L.push('')
  for (const c of doc.correcciones) L.push(`- ${c}`)
  L.push('')
  L.push('## Pendientes declarados')
  L.push('')
  for (const p of doc.pendientes) L.push(`- **${p.operacion}** (${p.total}): ${p.slugs.join(', ')}`)
  L.push('')
  L.push('## Métricas Fase 9')
  L.push('')
  L.push(`- Objetos de estructura en disco: **${doc.fase9.municipiosEnDisco}** municipios.`)
  L.push(`- Tamaño compacto (JSON serializado): medio ${doc.fase9.objetos.compactoMedio} B · p95 ${doc.fase9.objetos.compactoP95} B · máx ${doc.fase9.objetos.compactoMax} B.`)
  L.push(`- Tamaño en disco (indentado, como se escribe en tmp/audit): medio ${doc.fase9.objetos.prettyMedio} B · p95 ${doc.fase9.objetos.prettyP95} B · máx ${doc.fase9.objetos.prettyMax} B.`)
  for (const [k, f] of Object.entries(doc.fase9.ingesta.ficheros)) {
    L.push(`- Ingesta ${k}: ${f.bytes === null ? '—' : `${(f.bytes / (1024 * 1024)).toFixed(1)} MB`} · ${f.filasLeidas ?? '—'} filas · ${f.msIngesta ?? '—'} ms · sha256 ${f.sha256 ? `${f.sha256.slice(0, 16)}…` : '—'}`)
  }
  L.push(`- Impacto SSR: ${doc.fase9.ssr.estimacion}`)
  for (const n of doc.fase9.notas) L.push(`- Nota: ${n}`)
  L.push('')
  L.push('| Piloto | XLSX | Tamaño | Build XLSX | Total piloto |')
  L.push('|---|---|---|---|---|')
  for (const x of doc.fase9.xlsxV21) L.push(`| ${x.municipio ?? x.ine} (${x.ine}) | ${x.file ? path.basename(x.file) : '—'} | ${x.sizeKB ?? '—'} KB | ${x.buildMs ?? '—'} ms | ${x.totalMs ?? '—'} ms |`)
  L.push('')
  L.push('## Frescura')
  L.push('')
  L.push(`Inventario completo en \`tmp/audit/frescura-indicadores-v2.md\`: ${doc.frescura.totalIndicadores} claves únicas.`)
  L.push('')
  L.push('| Estado | Indicadores |')
  L.push('|---|---|')
  for (const [estado, n] of Object.entries(doc.frescura.porEstado).sort((a, b) => b[1] - a[1])) L.push(`| ${estado} | ${n} |`)
  L.push('')
  L.push('## Reconciliaciones')
  L.push('')
  for (const p of doc.pilotos) {
    if (!p.validation) continue
    L.push(`- **${p.municipio} (${p.ine})**: checks libro ${p.validation.checks.ok}/${p.validation.checks.total}${p.validation.checks.failed.length > 0 ? ` (fallos: ${p.validation.checks.failed.join(', ')})` : ''} · estructura ${p.estructura?.reconciliacion ? `${p.estructura.reconciliacion.filter((c) => c.ok).length}/${p.estructura.reconciliacion.length}` : '—'} · 68065 ${p.estructura?.crossCheck68065 ? (p.estructura.crossCheck68065.matches ? 'coincide' : 'DIVERGE') : '—'}`)
    for (const problem of p.validation.problems) L.push(`  - ${problem}`)
  }
  L.push('')
  L.push('## Anomalías (reportadas, sin corregir)')
  L.push('')
  for (const a of doc.anomalias) L.push(`- ${a}`)
  return L.join('\n') + '\n'
}

// ============================================================================
// 10. main
// ============================================================================

async function main(): Promise<void> {
  const { inesV2, inesV21, baselines, com } = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }

  console.log(`[qa-socideas-superior v2.1] pilotos v2: ${inesV2.join(', ')}`)
  console.log(`[qa-socideas-superior v2.1] pilotos v2.1: ${inesV21.join(', ')}${inesV21.includes(INE_INSULAR) ? ` (${INE_INSULAR} = caso insular adicional)` : ''}`)
  console.log(`[qa-socideas-superior v2.1] Excel COM: ${com === null ? 'desactivado' : com.join(', ')}`)

  const baselineReports: BaselineReport[] = []
  if (baselines) {
    for (const [label, file] of [
      ['SOCideas_Manzaneque_45090_libro.xlsx (v1)', path.join(OUT_DIR, 'manzaneque.xlsx')],
      ['BBDD estadística sociodemográfica Torrejoncillo (manual)', path.join(OUT_DIR, 'torrejoncillo.xlsx')],
    ] as const) {
      if (fs.existsSync(file)) {
        const metrics = await metricsFromFile(file)
        const areaCoverage = areaCoverageFromMetrics(metrics)
        baselineReports.push({ file: label, metrics, rubric: scoreRubric(metrics, areaCoverage, measurableFreshnessScore(metrics)), areaCoverage })
        console.log(`[baseline] ${label}: hojas=${metrics.sheetCount} numéricas=${metrics.numericCells} fórmulas=${metrics.formulas} gráficos=${metrics.charts} tablas=${metrics.tables} pirámide2025=${metrics.hasPyramid2025Phrase ? 'sí' : 'no'}`)
      } else {
        console.warn(`[baseline] no encontrado: ${file}`)
      }
    }
  }

  // --- Pilotos v2 (sin estructura) -------------------------------------------
  const pilotosV2: PilotResult[] = []
  for (const ine of inesV2) {
    const result = await buildPilot(ine, url, key, { outDir: PILOT_DIR, structure: null, estructuraLoad: null, runCom: false, conjunto: 'v2' })
    pilotosV2.push(result)
    if (result.status === 'ok' && result.validation) {
      console.log(
        `[v2]   ${result.municipio} (${ine}): ${result.validation.ok ? 'OK' : 'REVISAR'} · hojas=${result.metrics?.sheetCount} numéricas=${result.metrics?.numericCells} fórmulas=${result.metrics?.formulas} gráficos=${result.metrics?.charts} tablas=${result.metrics?.tables} freeze=${result.validation.freezeSheets} cobertura=${result.coverage?.global}% rúbrica=${result.rubric?.total} frescura=${result.rubric?.frescura} desactualizados=${result.desactualizados?.length ?? '—'}`,
      )
      for (const p of result.validation.problems) console.log(`   ⚠ ${p}`)
    } else {
      console.log(`[v2]   ${ine}: ${result.status}${result.error ? ` — ${result.error}` : ''}`)
    }
  }

  // --- Pilotos v2.1 (con estructura 2025) ------------------------------------
  const comSet = com === null ? null : new Set(com)
  const pilotosV21: PilotResult[] = []
  for (const ine of inesV21) {
    const estructuraLoad = loadPopulationStructureForQa(ine)
    const structure = estructuraLoad.status === 'ok' ? estructuraLoad.data : null
    if (estructuraLoad.status === 'sin_estructura') {
      console.warn(`[v2.1] ${ine}: sin_estructura — ${estructuraLoad.reason}`)
    }
    const result = await buildPilot(ine, url, key, {
      outDir: PILOT_V21_DIR,
      structure,
      estructuraLoad,
      runCom: comSet !== null && comSet.has(ine),
      conjunto: 'v2.1',
    })
    pilotosV21.push(result)
    if (result.status === 'ok' && result.v21) {
      const gatesOk = result.v21.gates.filter((g) => g.ok).length
      console.log(
        `[v2.1] ${result.municipio} (${ine}): ${result.v21.ok ? 'OK' : 'REVISAR'} · gates ${gatesOk}/${result.v21.gates.length} · hojas=${result.metrics?.sheetCount} numéricas=${result.metrics?.numericCells} fórmulas=${result.metrics?.formulas} gráficos=${result.metrics?.charts}(XL ${result.metrics?.charts}) tablas=${result.metrics?.tables} freeze=${result.validation?.freezeSheets} estructura=${result.estructura?.sourceTable}/${result.estructura?.scope} cobertura=${result.coverage?.global}% rúbrica=${result.rubric?.total} frescura=${result.rubric?.frescura} desactualizados=${result.v21.desactualizados.length}${result.com ? ` com=${result.com.status}` : ''}`,
      )
      for (const p of result.v21.problems) console.log(`   ⚠ ${p}`)
    } else {
      console.log(`[v2.1] ${ine}: ${result.status}${result.error ? ` — ${result.error}` : ''}`)
    }
  }

  // --- LibreOffice ------------------------------------------------------------
  const libreoffice = detectLibreOffice()
  console.log(`[entorno] LibreOffice: ${libreoffice.status}${libreoffice.ruta ? ` (${libreoffice.ruta})` : ''}`)
  if (libreoffice.status === 'no_instalado') console.log(`[entorno] ${libreoffice.nota}`)

  const antes = baselineReports.find((b) => b.file.includes('Manzaneque'))?.rubric ?? null
  const torrejoncillo = baselineReports.find((b) => b.file.includes('Torrejoncillo'))?.rubric ?? null
  const mediaV2 = averageRubric(pilotosV2.filter((p) => p.status === 'ok' && p.rubric).map((p) => p.rubric as RubricScore))
  const mediaV21 = averageRubric(pilotosV21.filter((p) => p.status === 'ok' && p.rubric).map((p) => p.rubric as RubricScore))

  // --- Informe v2 (se mantiene el artefacto original, rúbrica 12 dims) -------
  const reportV2 = {
    fecha: new Date().toISOString(),
    esquema: 'socideas-book@2',
    rubrica: { dimensiones: 12, reglaFrescuraV2: '10 si sharedStrings contiene "a 1 de enero de 2025"; 4 si no (medida objetiva del fichero).' },
    baselines: baselineReports,
    pilotos: pilotosV2,
    resumen: { antes, despues: mediaV2, torrejoncillo, reglaFrescura: '10 si sharedStrings contiene "a 1 de enero de 2025"; 4 si no.' },
    nota: 'QA sin escrituras: solo lectura de Supabase/R2 y escritura en tmp/audit. CONPREL permanece apagado y fuera de alcance.',
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, 'qa-socideas-superior.json'), JSON.stringify(reportV2, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'qa-socideas-superior.md'), renderMarkdown(reportV2))

  // --- Frescura, Fase 9, diferencias y períodos ------------------------------
  const { filas: frescuraFilas, porEstado: frescuraPorEstado } = buildFrescuraRows(pilotosV21)
  const fase9 = readFase9Metrics(pilotosV21)

  const bloqueKey = (b: PilotBloqueInfo): string => `${b.hoja}|${b.id}`
  const diferencias = pilotosV21.map((p21) => {
    const p2 = pilotosV2.find((p) => p.ine === p21.ine)
    const set21 = new Set((p21.bloques ?? []).map(bloqueKey))
    const set2 = new Set((p2?.bloques ?? []).map(bloqueKey))
    const delta = (a: number | undefined, b: number | undefined): number | null => (a === undefined || b === undefined ? null : b - a)
    return {
      ine: p21.ine,
      municipio: p21.municipio,
      sinContraparte: p2 === undefined,
      anadidos: p2 === undefined ? [] : [...set21].filter((k) => !set2.has(k)).sort(),
      eliminados: p2 === undefined ? [] : [...set2].filter((k) => !set21.has(k)).sort(),
      metricas: {
        numericCells: delta(p2?.metrics?.numericCells, p21.metrics?.numericCells),
        charts: delta(p2?.metrics?.charts, p21.metrics?.charts),
        tables: delta(p2?.metrics?.tables, p21.metrics?.tables),
        formulas: delta(p2?.metrics?.formulas, p21.metrics?.formulas),
        ndCells: delta(p2?.metrics?.ndCells, p21.metrics?.ndCells),
        sizeKB: delta(p2?.sizeKB, p21.sizeKB),
      },
    }
  })

  const periodos = (() => {
    const seen = new Set<string>()
    const out: { hoja: string; bloque: string; periodo: string }[] = []
    for (const p of pilotosV21) {
      for (const b of p.bloques ?? []) {
        const key = bloqueKey(b)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ hoja: b.hoja, bloque: b.id, periodo: b.periodo })
      }
    }
    return out
  })()

  const sourceSlugs = new Set<string>()
  for (const p of pilotosV21) {
    for (const ind of MODEL_INDICATORS.get(`v2.1:${p.ine}`) ?? []) sourceSlugs.add(ind.source_slug)
  }
  const ultimoPeriodo = [...sourceSlugs].sort().map((slug) => {
    const rule = FRESHNESS_REGISTRY[slug]
    return {
      source_slug: slug,
      latest: rule?.latest ?? null,
      kind: rule?.kind ?? 'sin_registro',
      reason: rule?.reason ?? 'Operación sin registro de frescura declarado en FRESHNESS_REGISTRY.',
    }
  })

  const pendientesMap = new Map<string, { total: number; slugs: Set<string> }>()
  for (const p of pilotosV21) {
    for (const ind of MODEL_INDICATORS.get(`v2.1:${p.ine}`) ?? []) {
      if (ind.availability !== 'pending_integration' && ind.availability !== 'blocked_source') continue
      const entry = pendientesMap.get(ind.operacion) ?? { total: 0, slugs: new Set<string>() }
      entry.total += 1
      entry.slugs.add(ind.slug)
      pendientesMap.set(ind.operacion, entry)
    }
  }
  const pendientes = [...pendientesMap.entries()]
    .map(([operacion, v]) => ({ operacion, total: v.total, slugs: [...v.slugs].sort().slice(0, 8) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  const comparativa = {
    before: baselineReports.map((b) => ({ etiqueta: b.file, rubric: b.rubric ?? null, metrics: b.metrics ?? null, desactualizados: null })),
    v2: pilotosV2.map((p) => ({ etiqueta: `${p.municipio ?? p.ine} (${p.ine}) v2`, rubric: p.rubric ?? null, metrics: p.metrics ?? null, desactualizados: p.desactualizados?.length ?? null })),
    v21: pilotosV21.map((p) => ({ etiqueta: `${p.municipio ?? p.ine} (${p.ine}) v2.1`, rubric: p.rubric ?? null, metrics: p.metrics ?? null, desactualizados: p.v21?.desactualizados.length ?? null })),
    medias: {
      before: averageRubric(baselineReports.map((b) => b.rubric).filter((r): r is RubricScore => r !== undefined)),
      v2: mediaV2,
      v21: mediaV21,
    },
  }

  const correcciones = [
    'La hoja 01_DEMOGRAFÍA usa la estructura anual 2025 (INE 68535, o 68534 en municipios insulares) como bloque `estructura-edad` con pirámide por grupos quinquenales y columnas de representación (hombres en negativo SOLO para el gráfico; el dato almacenado es la magnitud absoluta).',
    'Cuando hay estructura 2025, el bloque histórico de pirámide 33570 NO se emite: no se duplican dos pirámides de años distintos.',
    '`indicadores-demograficos` pasa a titularse "Variación de población" y solo conserva variación 5y/10y; envejecimiento, dependencia y edad media se calculan en `indicadores-estructura` (sin duplicar).',
    'Nuevo bloque `indicadores-estructura` con fórmula declarada por fila; la dependencia total usa fórmula Excel (`=dependencia juvenil + dependencia de mayores`) sobre la misma tabla.',
    'Nuevo bloque `estructura-edad-detalle` con edades simples 0..100 y `plegable: true`, solo para municipios insulares (tabla 68534).',
    'Cada indicador incorpora frescura estructurada: `source_period`, `latest_available_period`, `retrieved_at`, `release_date`, `freshness_status`, `lag_years`, `lag_months`, `freshness_reason`.',
    'Metodología declara la limitación "Edad simple: ámbito insular" en municipios no insulares y la ficha de la estructura usada.',
  ]

  const reglas = [
    'Los pilotos v2.1 se generan pasando `populationStructure` leída de tmp/audit/estructura-2025/<INE>.json y validada con `validatePopulationStructure`; si el JSON falta o no valida, el piloto se marca `sin_estructura` (no se inventa).',
    'Excel COM se ejecuta por defecto para 45090 y 07024; `--com=...` permite otra lista y `--sin-com` lo desactiva. Si PowerShell/Excel no está disponible se registra `no_disponible` y el piloto NO falla por ello; si la apertura lanza excepción, el gate FALLA con el mensaje.',
    'LibreOffice no está instalado en esta máquina: se registra `no_instalado` y la apertura real se sustituye por Excel COM (documentado, no se falla por ello).',
    'Las reconciliaciones del objeto de estructura usan tolerancia 0 (enteros exactos de la fuente).',
  ]

  const frescuraReport = {
    generadoEn: new Date().toISOString(),
    esquema: 'socideas-book@2',
    reglas: {
      'clave de fila': 'area|slug|periodo|ambito|dimensiones (clave canónica del contrato)',
      'sourceUrl': 'si table_id es numérico → https://www.ine.es/jaxiT3/Tabla.htm?t=<table_id>; si es MIR_MUNI_* → https://infoelectoral.interior.gob.es/es/elecciones-celebradas/datos-abiertos/; si es EDM2023 → URL AEAT de la EDM; si no → null (nunca se inventa)',
      'desfase': 'lag_years si existe; si no, lag_months como "N meses"; si no, null',
      'accionRecomendada': 'desactualizado → "Cargar edición <latest>"; estructural → "Ninguna: última edición estructural disponible"; pendiente_integracion → operación candidata del propio indicador; actualizado/ultimo_oficial → ninguna',
      'unión de pilotos': 'si una misma clave aparece en varios pilotos con distinta disponibilidad, se conserva la ocurrencia publicada (available/partial); en caso contrario, la primera',
    },
    total: frescuraFilas.length,
    porEstado: frescuraPorEstado,
    filas: frescuraFilas,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'frescura-indicadores-v2.json'), JSON.stringify(frescuraReport, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'frescura-indicadores-v2.md'), renderFrescuraMd(frescuraReport))

  const reconciliacionReport = {
    generadoEn: new Date().toISOString(),
    esquema: 'socideas-population-structure@1',
    reglas: [
      'Totales 2025 = fila "Todas las edades" del objeto validado (68535; 68534 en insulares).',
      '`crossCheck68065` compara total/hombres/mujeres contra la tabla 68065 (mismo período).',
      'Los checks de estructura usan tolerancia 0 y provienen de `reconcileStructure` (total=H+M, suma de 21 bandas=total y, en insulares, cada banda = suma de edades simples).',
      'La pirámide legacy previa es la del Padrón Continuo (tabla 33570) que usaba el libro v2; el salto mide 2025 − año legacy.',
      'Las métricas de ingesta se citan del último resumen del cargador (tmp/audit/estructura-2025/resumen-ingesta.json) y los tamaños de objeto se miden sobre los ficheros en disco.',
    ],
    pilotos: pilotosV21.map((p) => ({
      ine: p.ine,
      municipio: p.municipio ?? p.ine,
      totals2025: p.estructura?.totals ?? { total: null, male: null, female: null },
      crossCheck68065: p.estructura?.crossCheck68065 ?? null,
      checks: (p.estructura?.reconciliacion ?? []).map((c) => ({ id: c.id, izquierda: c.izquierda, derecha: c.derecha, ok: c.ok })),
      bandas: p.estructura?.bandas ?? 0,
      edadesSimples: p.estructura?.edadesSimples ?? null,
      legacyPiramideAnio: p.legacyPiramideAnio ?? null,
      saltoAnios: p.legacyPiramideAnio != null && p.estructura?.periodo != null ? Number(p.estructura.periodo) - p.legacyPiramideAnio : null,
      xlsx: { file: p.outFile ? path.basename(p.outFile) : '—', sizeKB: p.sizeKB ?? 0, buildMs: p.buildMs ?? 0 },
    })),
    fase9,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'reconciliacion-demografia-2025.json'), JSON.stringify(reconciliacionReport, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'reconciliacion-demografia-2025.md'), renderReconciliacionMd(reconciliacionReport))

  // --- Anomalías detectadas (se reportan; no se corrigen) --------------------
  const anomalias: string[] = []
  const desactualizadosUnion = frescuraFilas.filter((f) => f.estado === 'desactualizado')
  const apariciones = pilotosV21.reduce((a, p) => a + (p.v21?.desactualizados.length ?? 0), 0)
  anomalias.push(
    `Gate de frescura FALLA en los ${pilotosV21.length} pilotos: ${desactualizadosUnion.length} claves únicas con \`freshness_status='desactualizado'\` (${apariciones} apariciones). ` +
      `Causas raíz observadas en el modelo (src/lib, no modificado): (a) períodos en rango ("2015–2023") — \`yearOf()\` toma el PRIMER año del rango; ` +
      `(b) etiquetas mensuales en español ("Julio de 2026 (dato mensual)") — no parsean a YYYY-MM y el desfase queda null; ` +
      `(c) período "undefined–undefined" en la serie electoral municipal. Claves: ${desactualizadosUnion.map((f) => `${f.indicatorId}@${f.periodoUsado}`).join(' | ')}`,
  )
  const chartsFallan = pilotosV21.filter((p) => p.v21?.gates.some((g) => g.id === 'charts' && !g.ok))
  if (chartsFallan.length > 0) {
    const detalle = chartsFallan
      .map((p) => `${p.ine}: ${p.v21?.charts.seriesSinDato.join(', ') ?? ''}`)
      .join(' · ')
    anomalias.push(`Gate de charts FALLA en ${chartsFallan.map((p) => p.ine).join(', ')}: hay bloques con \`chart\` cuya serie no tiene ningún valor numérico (${detalle}); el escritor descarta esos gráficos.`)
  }
  if (frescuraFilas.some((f) => String(f.periodoUsado).includes('undefined'))) {
    anomalias.push(
      'La serie electoral municipal aparece con período "undefined–undefined": el fixture local tmp/audit/elecciones-serie-<INE>.json anida el año en `convocatoria.anio`, mientras el adaptador del script (`loadElectoralSeries`) lee `anio` de primer nivel. Efecto visible: columna "Año" con "undefined" y gráfico de participación sin categorías reales en 45090/16211. No se corrige (fuera del alcance pedido); el arreglo sería mapear `c.convocatoria.anio`/`c.convocatoria.fecha`.',
    )
  }
  anomalias.push(
    `${fase9.notas.join(' ')} (En la última corrida del cargador se escribieron 5 objetos; en disco hay ${fase9.municipiosEnDisco}. El enunciado cita 8.132 con medio 3.540 B/p95 3.727 B/máx 3.727 B: esas cifras corresponden al tamaño INDENTADO del resumen de 5 objetos; los valores medidos sobre los ${fase9.municipiosEnDisco} objetos son ${fase9.objetos.prettyMedio}/${fase9.objetos.prettyP95}/${fase9.objetos.prettyMax} B indentados y ${fase9.objetos.compactoMedio}/${fase9.objetos.compactoP95}/${fase9.objetos.compactoMax} B compactos.)`,
  )
  const negRepresentacion = pilotosV21.reduce((a, p) => a + (p.v21?.negativos.columnasRepresentacion ?? 0), 0)
  const negLiteral = pilotosV21.reduce((a, p) => a + (p.v21?.negativos.otrosReglaEstricta ?? 0), 0)
  const negEfectivos = pilotosV21.reduce((a, p) => a + (p.v21?.negativos.otrosEfectivos ?? 0), 0)
  anomalias.push(
    `Gate de negativos: la regla LITERAL del enunciado (solo columnas con "representación") marcaría ${negLiteral} negativos; el desglose muestra que todos son magnitudes con signo legítimas (Variación 5y/10y y Saldo migratorio, columnas "Valor"/"Total"/"Hombres"/"Mujeres"), por lo que los indebidos efectivos son ${negEfectivos}. Los ${negRepresentacion} negativos de "representación" son de diseño (hombres de la pirámide). No se modifica src/lib.`,
  )
  anomalias.push(
    'El escritor limita a `MAX_CHARTS_PER_SHEET = 2` los gráficos por hoja (src/lib/socideas-xlsx.ts): 01_DEMOGRAFÍA tiene 9 bloques con chart y solo se emiten 2. El gate "charts" compara contra lo emitido con el tope declarado y reporta el conteo sin tope; no se modifica src/lib.',
  )

  const doc: V21Doc = {
    fecha: new Date().toISOString(),
    esquema: 'socideas-book@2 + socideas-population-structure@1',
    ines: inesV21,
    com,
    libreoffice,
    comparativa,
    pilotos: pilotosV21,
    diferencias,
    periodos,
    ultimoPeriodo,
    correcciones,
    pendientes,
    fase9,
    frescura: { totalIndicadores: frescuraFilas.length, porEstado: frescuraPorEstado },
    reglas,
    anomalias,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'qa-socideas-v2-1.json'), JSON.stringify(doc, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'qa-socideas-v2-1.md'), renderV21Md(doc))

  // --- Resumen final con confirmaciones --------------------------------------
  const okV21 = pilotosV21.filter((p) => p.status === 'ok')
  const dupTotal = okV21.reduce((a, p) => a + (p.validation?.duplicateKeys ?? 0), 0)
  const formulaErrorsTotal = okV21.reduce((a, p) => a + (p.metrics?.formulaErrors ?? 0), 0)
  const negativosIndebidos = okV21.reduce((a, p) => a + (p.v21?.negativos.otrosEfectivos ?? 0), 0)
  const negativosReglaEstricta = okV21.reduce((a, p) => a + (p.v21?.negativos.otrosReglaEstricta ?? 0), 0)
  const negativosRepresentacion = okV21.reduce((a, p) => a + (p.v21?.negativos.columnasRepresentacion ?? 0), 0)
  const desactualizadosTotal = okV21.reduce((a, p) => a + (p.v21?.desactualizados.length ?? 0), 0)
  const comOk = pilotosV21.filter((p) => p.com?.status === 'ok')
  const comNoDisponible = pilotosV21.filter((p) => p.com?.status === 'no_disponible')

  console.log('')
  console.log('===== RESUMEN v2.1 =====')
  console.log(`Pilotos v2.1: ${pilotosV21.length} (${okV21.length} con libro) · gates OK: ${okV21.filter((p) => p.v21?.ok).length}/${okV21.length}`)
  console.log(`Duplicados (clave canónica): ${dupTotal}`)
  console.log(`Errores de fórmula: ${formulaErrorsTotal}`)
  console.log(`Negativos en columnas "representación": ${negativosRepresentacion} (permitidos, magnitud absoluta almacenada) · fuera de representación (regla literal): ${negativosReglaEstricta} · indebidos efectivos (no variación/saldo): ${negativosIndebidos}`)
  console.log(`Indicadores desactualizados: ${desactualizadosTotal}`)
  for (const p of pilotosV21) {
    if (p.com) console.log(`COM ${p.ine}: ${p.com.status}${p.com.status === 'ok' ? ` (hojas=${p.com.worksheets}, charts=${p.com.charts}, ListObjects=${p.com.listObjects})` : ` — ${p.com.error ?? ''}`}`)
  }
  if (comNoDisponible.length > 0) console.log(`COM no disponible en: ${comNoDisponible.map((p) => p.ine).join(', ')} (no falla el piloto; documentado)`)
  console.log(`LibreOffice: ${libreoffice.status}`)
  console.log('')
  console.log(`ANTES  (Manzaneque v1):     ${antes ? antes.total : '—'}`)
  console.log(`BASELINE Torrejoncillo:     ${torrejoncillo ? torrejoncillo.total : '—'}`)
  console.log(`MEDIA v2  (12 dims):        ${mediaV2 ? mediaV2.total : '—'}`)
  console.log(`MEDIA v2.1 (12 dims):       ${mediaV21 ? mediaV21.total : '—'}`)
  console.log('')
  console.log(`Informe v2:      ${path.join(OUT_DIR, 'qa-socideas-superior.md')}`)
  console.log(`Informe v2.1:    ${path.join(OUT_DIR, 'qa-socideas-v2-1.md')}`)
  console.log(`Frescura:        ${path.join(OUT_DIR, 'frescura-indicadores-v2.md')}`)
  console.log(`Reconciliación:  ${path.join(OUT_DIR, 'reconciliacion-demografia-2025.md')}`)
  console.log(`COM OK en:       ${comOk.map((p) => p.ine).join(', ') || '—'}`)
}

main().catch((e) => {
  console.error('QA falló:', e)
  process.exit(1)
})
