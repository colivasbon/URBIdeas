// Libro XLSX municipal SOCideas — SOLO SERVIDOR.
// Este módulo importa `exceljs` y NUNCA debe importarse desde un Client Component
// (ni directa ni transitivamente): la dependencia queda fuera del bundle cliente.
//
// Libro municipal comparativo: EXACTAMENTE nueve hojas en orden contractual,
// bloques apilados verticalmente, sin hojas detalladas, sin enlaces internos,
// sin autofilter, sin freeze panes.
//
// MAQUETACIÓN (v2, sin truncado):
//  - Autoajuste consciente de Poppins: el ancho de cada columna se calcula con el
//    contenido real más largo (cabecera + todas las celdas de TODAS las tablas de
//    la hoja), con un factor que sobreestima ligeramente (Poppins ocupa más que
//    Calibri) y tope de 38 caracteres. Nunca se impone un ancho menor al necesario.
//  - Columna A unificada en todo el libro: ancho = máximo necesario entre todas
//    las etiquetas de todas las tablas. Sustituye el antiguo forzado "Año = 10",
//    que truncaba las etiquetas de otras tablas de la misma hoja (la columna es
//    física y compartida). El encabezado "Año" puede por tanto ser más ancho.
//  - Títulos de sección y de bloque fusionados a lo ancho real de su tabla, con
//    altura calculada: nunca se cortan.
//  - Línea de fuente fusionada a todo el ancho del bloque (menos la celda del
//    enlace), con wrap y altura calculados.
//  - Notas metodológicas y criterios fusionados a lo ancho de la tabla, con
//    altura calculada. Ninguna celda de texto largo comparte fila visual con otra
//    celda sin fusión explícita.
//  - wrapText SOLO donde de verdad hace falta (texto que no cabe al ancho final);
//    las etiquetas cortas se ensanchan en su lugar.
// Tipografía: Poppins en todas las celdas (título 14 > header sección 12 >
// cabecera 11 bold > dato 11). NOTA: si el lector no tiene Poppins instalada,
// Excel/LibreOffice la sustituye por la fuente del sistema (limitación del formato).
import ExcelJS from 'exceljs'
import {
  SOCIDEAS_SHEET_IDS,
  type ComparisonMode,
  type ExportCell,
  type ExportTable,
  type SocideasSheetId,
} from './socideas-export'
import {
  AEAT_EDM_IRPF,
  INE_INSTITUTION,
  isAllowedSourceUrl,
  registrySource,
  visibleSourceLabel,
  type SourceReference,
} from './socideas-source-registry'
import { coverageGlossaryEntries } from './socideas-indicator-catalog'
import { isConprelUiEnabled } from './conprel-flag'
import {
  CONPREL_FUENTE_08_OPERACION,
  CONPREL_FUENTE_08_PERIODO,
} from './conprel-textos'
import { CONPREL_PPTO_2025 } from './conprel-contracts'
import {
  buildCentrosEducativosTable,
  buildDemographicDerivedLayerTable,
  buildDensidadTable,
    buildMovilidadMigratoriaTable,
    buildSaldosMigratoriosTables,
  buildNivelEducativoTable,
} from './socideas-ine-layers-export'
import type { MunicipalIneLayersV1 } from './socideas-ine-layers'

export const XLSX_BRAND = 'Ideas Sostenibilidad - SOCideas - Libro municipal comparativo'

/** Texto visible obligatorio del enlace de procedencia. */
export const SOURCE_LINK_LABEL = 'Ver ficha oficial ↗'

/** Paleta SOCideas (rebranding): SOLO estos tokens en el libro.
 *  - Musgo #3E665C: headers de sección (texto Hueso).
 *  - Conífera #86B73D: enlaces (bold + subrayado, nunca como fondo).
 *  - Retama #FBE122: SOLO sobre oscuro, NUNCA sobre claro (no se usa: no hay fondos oscuros salvo Musgo).
 *  - Carbón #3C403E: texto sobre claro.
 *  - Hueso #F1F1F1: fondo de celdas de datos.
 *  - Rupestre #643335: SOLO alertas reales con texto Hueso; un ND jamás es alerta.
 *  - Limo #B0BDB0: bordes finos.
 *  - Crisopa #C2E189: badges ND/missing (texto Carbón) y cabeceras de columna.
 *  CERO gradientes: ExcelJS solo usa `pattern: 'solid'` en este libro. */
const MUSGO = 'FF3E665C'
const CONIFERA = 'FF86B73D'
const HUESO = 'FFF1F1F1'
const CARBON = 'FF3C403E'
const LIMO = 'FFB0BDB0'
const CRISOPA = 'FFC2E189'
/** Tokens reservados y documentados (Retama nunca sobre claro, Rupestre solo
 *  alerta real). Se exportan para evitar usos ad hoc fuera de paleta. */
export const XLSX_PALETTE = {
  musgo: MUSGO,
  conifera: CONIFERA,
  retama: 'FFFBE122',
  carbon: CARBON,
  hueso: HUESO,
  rupestre: 'FF643335',
  limo: LIMO,
  crisopa: CRISOPA,
} as const
const FONT_NAME = 'Poppins'

// ============================================================================
// Métricas de texto y anchos (autoajuste consciente de Poppins)
// ============================================================================

/** Tope de ancho por columna: cotas razonables sin truncar (el texto que no
 *  quepa se envuelve, nunca se recorta). */
const MAX_COL_WIDTH = 38
/** Ancho mínimo de una columna de datos. */
const MIN_COL_WIDTH = 10
/** Ancho mínimo de la columna A unificada (etiquetas legibles aunque el libro
 *  solo tenga etiquetas cortas). */
const MIN_COL_A_WIDTH = 22
/** Hojas sin tabla de datos (bloques pendientes): número de columnas sobre el
 *  que se despliegan título, fuente y nota. Evita que el texto quede comprimido
 *  en una única columna estrecha (el defecto visual detectado). */
const NOTE_SPAN_COLS = 4
/** Ancho de las columnas de relleno en hojas sin tabla (dan aire al texto
 *  fusionado de los bloques pendientes). */
const NOTE_SPAN_COL_WIDTH = 26
/** Poppins es más ancha que Calibri (unidad de ancho de Excel ≈ carácter de la
 *  fuente por defecto). Este factor SOBREESTIMA a propósito: preferimos columnas
 *  un poco anchas antes que texto cortado. */
const POPPINS_CHAR_FACTOR = 1.2
/** Colchón en caracteres de ancho por columna. */
const CELL_WIDTH_PADDING = 2
/** Altura de línea (puntos) por tamaño: 14 = título de hoja, 12 = título de
 *  sección, 11 = dato/cabecera, 10 = fuente/nota. */
const LINE_HEIGHT_BODY = 16
const LINE_HEIGHT_SMALL = 14
const LINE_HEIGHT_TITLE = 18
const LINE_HEIGHT_SECTION = 16

/** Ancho natural (en unidades Excel) que necesita un texto con Poppins. */
function naturalTextWidth(text: string): number {
  const longest = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  return longest * POPPINS_CHAR_FACTOR + CELL_WIDTH_PADDING
}

/** Caracteres que caben en una línea de ancho `width` (mínimo 1). */
function charsPerLine(width: number): number {
  return Math.max(1, (width - CELL_WIDTH_PADDING) / POPPINS_CHAR_FACTOR)
}

/** Número de líneas que ocupa `text` envuelto en una columna de ancho `width`. */
function wrappedLines(text: string, width: number): number {
  if (text.length === 0) return 1
  const per = charsPerLine(width)
  return text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / per)), 0)
}

/** Ancho final de columna a partir de su contenido natural (con tope). */
function clampWidth(needed: number): number {
  return Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, needed)))
}

/** Suma de anchos de un tramo de columnas [from, to) (0-based, exclusivo). */
function sumWidths(widths: number[], from: number, to: number): number {
  let total = 0
  for (let i = from; i < to; i += 1) total += widths[i] ?? MIN_COL_WIDTH
  return total
}

// ============================================================================
// Utilidades de pintado
// ============================================================================

/** Borde fino Limo (único borde permitido en datos y cabeceras). */
function thinLimoBorders() {
  const side = { style: 'thin' as const, color: { argb: LIMO } }
  return { top: side, left: side, bottom: side, right: side }
}

/** Un ND (texto exacto, sin numérico) es missing: badge Crisopa/Carbón.
 *  Rupestre queda reservado a alertas reales (este libro no genera ninguna). */
function isBadgeText(text: string, numeric: number | null): boolean {
  return numeric === null && text === 'ND'
}

/** Rellena SOLO las celdas 1..nCols: jamás filas enteras ni celdas vacías. */
function band(row: ExcelJS.Row, nCols: number, fill: string): void {
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  }
}

/** Fusiona si hay más de una columna (ExcelJS rechaza/ no aporta con rango 1x1). */
function mergeRow(ws: ExcelJS.Worksheet, rowN: number, nCols: number): void {
  if (nCols > 1) ws.mergeCells(rowN, 1, rowN, nCols)
}

/** Banda de título (header de sección): fondo Musgo, texto Hueso, fusionado a lo
 *  ancho real y con altura calculada para que NUNCA se corte. */
function paintTitle(
  ws: ExcelJS.Worksheet,
  rowN: number,
  widths: number[],
  nCols: number,
  text: string,
  size = 12,
): void {
  const row = ws.getRow(rowN)
  const mergedWidth = sumWidths(widths, 0, nCols)
  const lines = wrappedLines(text, mergedWidth)
  const lineHeight = size >= 14 ? LINE_HEIGHT_TITLE : LINE_HEIGHT_SECTION
  row.height = Math.max(size >= 14 ? 28 : 24, lines * lineHeight)
  mergeRow(ws, rowN, nCols)
  const c = row.getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size, bold: true, color: { argb: HUESO } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: lines > 1 }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } }
  c.border = { bottom: { style: 'thin', color: { argb: CONIFERA } } }
  // Extender formato a celdas fusionadas (ExcelJS requiere aplicar a cada celda)
  for (let i = 2; i <= nCols; i += 1) {
    const cc = row.getCell(i)
    cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } }
    cc.border = { bottom: { style: 'thin', color: { argb: CONIFERA } } }
    cc.font = { name: FONT_NAME, size: 11, color: { argb: HUESO } }
  }
}

/** Línea de procedencia: texto gris pequeño fusionado a todo el ancho del bloque
 *  (menos la última columna) y, si existe fuente pública atribuible, un enlace
 *  discreto en la última columna. Altura calculada: nunca se corta ni invade. */
function paintSourceLine(
  ws: ExcelJS.Worksheet,
  rowN: number,
  widths: number[],
  nCols: number,
  source: SourceReference | null | undefined,
  fuente: string,
  periodo: string,
): void {
  const row = ws.getRow(rowN)
  const text = visibleSourceLabel(source, fuente, periodo)
  const url = source?.publicUrl
  const hasLink = nCols >= 2 && typeof url === 'string' && isAllowedSourceUrl(url)
  // Con enlace, el texto deja la última columna para el enlace; sin enlace, el
  // texto ocupa TODO el ancho del bloque (antes quedaba un hueco sin borde).
  const textCols = hasLink ? Math.max(1, nCols - 1) : nCols
  const textWidth = sumWidths(widths, 0, textCols)
  const lines = wrappedLines(text, textWidth)
  row.height = Math.max(16, lines * LINE_HEIGHT_SMALL)

  if (textCols > 1) mergeRow(ws, rowN, textCols)
  const c = row.getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size: 10, color: { argb: CARBON } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: lines > 1 }
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).border = { bottom: { style: 'thin', color: { argb: LIMO } } }
  }

  if (!hasLink) return

  const link = row.getCell(nCols)
  link.value = {
    text: SOURCE_LINK_LABEL,
    hyperlink: url,
    tooltip: `Abrir fuente oficial: ${source?.shortLabel ?? ''}`,
  }
  link.font = { name: FONT_NAME, size: 10, bold: true, underline: true, color: { argb: CONIFERA } }
  link.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HUESO } }
  link.border = thinLimoBorders()
  link.alignment = { vertical: 'middle', horizontal: 'right', wrapText: false, shrinkToFit: false }
}

function numFmtFor(header: string): string | null {
  if (header === 'Año') return '0'
  if (header.includes('€')) return '#,##0 "€"'
  if (header.includes('%')) return '0.0" %"'
  if (header === 'hab./km²' || header.includes('hab./km²')) return '#,##0.0" hab./km²"'
  return '#,##0'
}

/** Texto izquierda, año centro, números derecha. Encabezado igual que celdas. */
export function cellAlign(header: string, isFirst: boolean): 'left' | 'center' | 'right' {
  if (header === 'Año') return 'center'
  if (isFirst) return 'left'
  return 'right'
}

/** Cabecera de columna: fondo Crisopa, texto Carbón, bordes finos Limo. Altura
 *  calculada por si alguna cabecera necesita envolverse. */
function paintHeaderRow(
  row: ExcelJS.Row,
  widths: number[],
  nCols: number,
  headers: string[],
): void {
  let maxLines = 1
  const borders = thinLimoBorders()
  for (let i = 1; i <= nCols; i += 1) {
    const c = row.getCell(i)
    c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CRISOPA } }
    c.border = { ...borders }
    const header = headers[i - 1] ?? ''
    const lines = wrappedLines(header, widths[i - 1] ?? MAX_COL_WIDTH)
    if (lines > maxLines) maxLines = lines
    c.alignment = { vertical: 'middle', horizontal: cellAlign(header, i === 1), wrapText: lines > 1 }
  }
  row.height = Math.max(20, maxLines * LINE_HEIGHT_BODY)
}

// ============================================================================
// Planificación de anchos
// ============================================================================

/** Anchos naturales (sin tope) que necesita una tabla: cabecera + todas sus celdas. */
function tableColumnNeeds(t: ExportTable): number[] {
  const needs = t.columnas.map((col) => naturalTextWidth(col))
  for (const fila of t.filas) {
    fila.forEach((cell: ExportCell, ci: number) => {
      if (ci >= needs.length) return
      const need = naturalTextWidth(cell.text)
      if (need > needs[ci]) needs[ci] = need
    })
  }
  return needs
}

/** Anchos finales de una hoja temática: máximo por columna física entre TODAS
 *  sus tablas, con tope, columna A unificada y hueco garantizado para el enlace. */
function computeSheetWidths(bloques: ExportTable[], globalColAWidth: number): number[] {
  const needs: number[] = []
  for (const bloque of bloques) {
    const tableNeeds = tableColumnNeeds(bloque)
    tableNeeds.forEach((need, ci) => {
      needs[ci] = Math.max(needs[ci] ?? MIN_COL_WIDTH, need)
    })
  }
  const widths = needs.map(clampWidth)
  if (widths.length === 0) widths.push(globalColAWidth)
  // Columna A unificada en todo el libro (las etiquetas de otras tablas no deben
  // verse truncadas por el ancho de una tabla concreta).
  widths[0] = globalColAWidth
  // El texto del enlace de procedencia debe caber en la última columna del bloque.
  const linkNeed = Math.round(naturalTextWidth(SOURCE_LINK_LABEL))
  for (const bloque of bloques) {
    const n = bloque.columnas.length
    if (n >= 2 && bloque.source?.publicUrl) {
      widths[n - 1] = Math.max(widths[n - 1] ?? MIN_COL_WIDTH, linkNeed)
    }
  }
  return widths
}

/** Textos de columna A de TODO el libro (etiquetas y cabeceras de primera columna). */
function collectAllColATexts(hojas: ComparativeSheetInput[]): string[] {
  const texts: string[] = []
  for (const hoja of hojas) {
    for (const bloque of hoja.bloques) {
      if (bloque.columnas.length > 0) texts.push(bloque.columnas[0])
      for (const fila of bloque.filas) {
        if (fila.length > 0) texts.push(fila[0].text)
      }
    }
  }
  // Hoja 00_PROYECTO (columna A) y 08_CRITERIOS_Y_FUENTES (columna A).
  texts.push(
    'Municipio',
    'Código INE',
    'Provincia',
    'Comunidad autónoma',
    'Fecha de generación',
    'Cobertura territorial comparativa',
  )
  texts.push(...hojas.map((h) => h.id))
  texts.push('Área')
  return texts
}

/** Ancho óptimo de la columna A unificada: máximo real, con cotas razonables. */
function calculateGlobalColAWidth(texts: string[]): number {
  let needed = MIN_COL_A_WIDTH
  for (const t of texts) {
    const w = naturalTextWidth(t)
    if (w > needed) needed = w
  }
  return Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_A_WIDTH, needed)))
}

// ============================================================================
// Bloque: tabla de datos reales (con o sin fuente)
// ============================================================================

function writeDataBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  t: ExportTable,
  widths: number[],
): {
  headerRow: number; endRow: number; nCols: number
} {
  const columnas = t.columnas
  const nCols = columnas.length
  if (nCols === 0) return { headerRow: startRow, endRow: startRow, nCols: 0 }

  paintTitle(ws, startRow, widths, nCols, t.titulo)
  paintSourceLine(ws, startRow + 1, widths, nCols, t.source, t.fuente, t.periodo)
  const headerRowN = startRow + 2
  const header = ws.getRow(headerRowN)
  columnas.forEach((col, i) => {
    const c = header.getCell(i + 1)
    c.value = col
  })
  paintHeaderRow(header, widths, nCols, columnas)

  let r = headerRowN
  t.filas.forEach((fila) => {
    r += 1
    const row = ws.getRow(r)
    let maxLines = 1
    fila.forEach((cell, ci) => {
      const c = row.getCell(ci + 1)
      const colName = columnas[ci] ?? ''
      if (cell.numeric !== null && Number.isFinite(cell.numeric)) {
        c.value = cell.numeric
        const fmt = numFmtFor(colName)
        if (fmt) c.numFmt = fmt
      } else {
        c.value = cell.text
        c.numFmt = '@'
      }
      const badge = isBadgeText(cell.text, cell.numeric)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: badge ? CRISOPA : HUESO } }
      c.border = { ...thinLimoBorders() }
      c.font = { name: FONT_NAME, size: 11, bold: badge, color: { argb: CARBON } }
      const lines = wrappedLines(cell.text, widths[ci] ?? MIN_COL_WIDTH)
      if (lines > maxLines) maxLines = lines
      c.alignment = {
        vertical: 'middle',
        horizontal: cellAlign(colName, ci === 0),
        wrapText: lines > 1,
        indent: ci === 0 ? 1 : undefined,
      }
    })
    row.height = Math.max(18, maxLines * LINE_HEIGHT_BODY)
  })

  if (t.note && r >= headerRowN) {
    r += 1
    const noteRow = ws.getRow(r)
    const mergedWidth = sumWidths(widths, 0, nCols)
    const lines = wrappedLines(t.note, mergedWidth)
    noteRow.height = Math.max(24, lines * LINE_HEIGHT_SMALL)
    mergeRow(ws, r, nCols)
    const nc = noteRow.getCell(1)
    nc.value = t.note
    nc.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
    nc.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
    band(noteRow, nCols, HUESO)
    // Bucle explícito 1..nCols: eachCell(includeEmpty:false) salta las celdas
    // con solo estilo y quedarían con la Calibri por defecto del formato.
    for (let i = 1; i <= nCols; i += 1) {
      const c = noteRow.getCell(i)
      c.border = { ...thinLimoBorders() }
      if (c.value === null || c.value === undefined) {
        c.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
      }
    }
  }

  return { headerRow: headerRowN, endRow: r, nCols }
}

// ============================================================================
// Bloque: nota breve (sin tabla, sin columnas vacías)
// ============================================================================

/**
 * Bloque "pendiente" o "no disponible": pinta solo título, línea de fuente y
 * una nota breve. El missing es badge Crisopa/Carbón (nunca Rupestre: un ND
 * no es una alerta).
 */
function writeNoteBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  t: ExportTable,
  widths: number[],
  spanCols: number,
): { endRow: number; nCols: number } {
  // Un bloque sin tabla ocupa todo el ancho de la hoja: título, fuente y nota
  // se fusionan para no quedar comprimidos en la columna A.
  const nCols = Math.max(1, spanCols)
  paintTitle(ws, startRow, widths, nCols, t.titulo)
  paintSourceLine(ws, startRow + 1, widths, nCols, t.source, t.fuente, t.periodo)
  const r = startRow + 2
  const row = ws.getRow(r)
  const noteText = t.note ?? t.estado ?? ''
  const mergedWidth = sumWidths(widths, 0, nCols)
  const lines = wrappedLines(noteText, mergedWidth)
  row.height = Math.max(36, lines * LINE_HEIGHT_BODY)
  mergeRow(ws, r, nCols)
  const cell = row.getCell(1)
  cell.value = noteText
  cell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: CARBON } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
  band(row, nCols, CRISOPA)
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).border = { ...thinLimoBorders() }
  }
  return { endRow: r, nCols }
}

// ============================================================================
// Línea de ámbito por hoja
// ============================================================================

function writeScopeLine(
  ws: ExcelJS.Worksheet,
  rowN: number,
  widths: number[],
  nCols: number,
  input: Pick<MunicipioWorkbookInput, 'municipio' | 'codigoINE' | 'provincia' | 'comunidadAutonoma'>,
): void {
  const row = ws.getRow(rowN)
  const text =
    `Municipio: ${input.municipio} (${input.codigoINE}) · ` +
    `Provincia: ${input.provincia} · ` +
    `Comunidad autónoma: ${input.comunidadAutonoma}`
  const mergedWidth = sumWidths(widths, 0, nCols)
  const lines = wrappedLines(text, mergedWidth)
  row.height = Math.max(18, lines * LINE_HEIGHT_BODY)
  mergeRow(ws, rowN, nCols)
  const c = row.getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: lines > 1 }
  band(row, nCols, HUESO)
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).border = { bottom: { style: 'thin', color: { argb: LIMO } } }
  }
}

// ============================================================================
// Entrada
// ============================================================================

export interface ComparativeSheetInput {
  /** Identificador contractual de la hoja (00_PROYECTO, 01_PERFIL_DEMOGRÁFICO, …). */
  id: SocideasSheetId
  /** Título visible en la pestaña y en la primera fila de la hoja. */
  titulo: string
  /** Subtítulo descriptivo (segunda fila) que forma la cabecera de la hoja. */
  subtitulo?: string
  /** Bloques apilados verticalmente en la hoja. */
  bloques: ExportTable[]
}

export interface MunicipioWorkbookInput {
  municipio: string
  codigoINE: string
  provincia: string
  comunidadAutonoma: string
  fechaGeneracion: string
  /** Hojas 01-07 con sus bloques preagrupados. */
  hojas: ComparativeSheetInput[]
  /** Capa INE lateral (opcional, lectura pública). */
  ineLayers?: MunicipalIneLayersV1 | null
}

// ============================================================================
// Hoja 00_PROYECTO
// ============================================================================

interface ProjectBlock {
  label: string
  value: string
}

/** Anchos de la hoja 00 a partir de su contenido real (columna A unificada). */
function computeProjectWidths(
  input: MunicipioWorkbookInput,
  hojas: ComparativeSheetInput[],
  globalColAWidth: number,
): number[] {
  const metaValues = [
    input.municipio,
    input.codigoINE,
    input.provincia,
    input.comunidadAutonoma,
    input.fechaGeneracion,
    'España · Comunidad autónoma · Provincia · Municipio',
  ]
  const notaText = 'Solo se muestran comparativas cuando las fuentes, períodos y definiciones son homogéneos entre ámbitos.'
  const colBNeeds = [
    ...metaValues,
    ...hojas.map((h) => h.titulo),
    ...hojas.map((h) => `${h.bloques.length} bloques`),
    notaText,
  ]
  let colB = MIN_COL_WIDTH
  for (const v of colBNeeds) colB = Math.max(colB, naturalTextWidth(v))
  return [globalColAWidth, clampWidth(colB)]
}

function writeProyecto(
  wb: ExcelJS.Workbook,
  input: MunicipioWorkbookInput,
  hojas: ComparativeSheetInput[],
  globalColAWidth: number,
): void {
  const ws = wb.addWorksheet('00_PROYECTO', { properties: { tabColor: { argb: MUSGO } } })
  const widths = computeProjectWidths(input, hojas, globalColAWidth)
  const nCols = 2
  paintTitle(ws, 1, widths, nCols, XLSX_BRAND, 14)

  const meta: ProjectBlock[] = [
    { label: 'Municipio', value: input.municipio },
    { label: 'Código INE', value: input.codigoINE },
    { label: 'Provincia', value: input.provincia },
    { label: 'Comunidad autónoma', value: input.comunidadAutonoma },
    { label: 'Fecha de generación', value: input.fechaGeneracion },
    {
      label: 'Cobertura territorial comparativa',
      value: 'España · Comunidad autónoma · Provincia · Municipio',
    },
  ]
  let r = 3
  for (const { label, value } of meta) {
    const row = ws.getRow(r)
    const lines = Math.max(
      wrappedLines(label, widths[0]),
      wrappedLines(value, widths[1]),
    )
    row.height = Math.max(18, lines * LINE_HEIGHT_BODY)
    const lbl = row.getCell(1)
    lbl.value = label
    lbl.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
    lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: wrappedLines(label, widths[0]) > 1 }
    const val = row.getCell(2)
    val.value = value
    val.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    val.alignment = { vertical: 'middle', wrapText: wrappedLines(value, widths[1]) > 1 }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      row.getCell(i).border = { ...thinLimoBorders() }
    }
    r += 1
  }

  r += 1
  ws.getRow(r - 1).height = 20
  paintTitle(ws, r, widths, nCols, 'Hojas del libro', 12)
  r += 2
  for (const hoja of hojas) {
    // Fila 1: ID de la hoja (negrita) en col A, título en col B.
    const row = ws.getRow(r)
    row.height = Math.max(20, wrappedLines(hoja.titulo, widths[1]) * LINE_HEIGHT_BODY)
    const lbl = row.getCell(1)
    lbl.value = hoja.id
    lbl.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
    lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false }
    const val = row.getCell(2)
    val.value = hoja.titulo
    val.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    val.alignment = { vertical: 'middle', wrapText: wrappedLines(hoja.titulo, widths[1]) > 1 }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      row.getCell(i).border = { ...thinLimoBorders() }
    }
    r += 1

    // Fila 2 (si hay subtítulo): descripción en cursiva en col A, "X bloques"
    // en col B. Separado en fila distinta para evitar solapamiento visual.
    if (hoja.subtitulo) {
      const sub = ws.getRow(r)
      const subLines = Math.max(
        wrappedLines(hoja.subtitulo, widths[0]),
        wrappedLines(`${hoja.bloques.length} bloques`, widths[1]),
      )
      sub.height = Math.max(18, subLines * LINE_HEIGHT_BODY)
      const subVal = sub.getCell(1)
      subVal.value = hoja.subtitulo
      subVal.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
      subVal.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: subLines > 1 }
      const subVal2 = sub.getCell(2)
      subVal2.value = `${hoja.bloques.length} bloques`
      subVal2.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
      subVal2.alignment = { vertical: 'middle', horizontal: 'right', wrapText: false }
      band(sub, nCols, HUESO)
      for (let i = 1; i <= nCols; i += 1) {
        sub.getCell(i).border = { ...thinLimoBorders() }
      }
      r += 1
    }
  }

  r += 1
  ws.getRow(r - 1).height = 20
  paintTitle(ws, r, widths, nCols, 'Criterio metodológico', 12)
  r += 2
  const nota = ws.getRow(r)
  const notaText = 'Solo se muestran comparativas cuando las fuentes, períodos y definiciones son homogéneos entre ámbitos.'
  const notaLines = wrappedLines(notaText, sumWidths(widths, 0, nCols))
  nota.height = Math.max(36, notaLines * LINE_HEIGHT_BODY)
  mergeRow(ws, r, nCols)
  const notaCell = nota.getCell(1)
  notaCell.value = notaText
  notaCell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: CARBON } }
  notaCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
  band(nota, nCols, HUESO)
  for (let i = 1; i <= nCols; i += 1) {
    const c = nota.getCell(i)
    c.border = { ...thinLimoBorders() }
    if (c.value === null || c.value === undefined) {
      c.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: CARBON } }
    }
  }
  // Aplicar anchos al final (tras los merges) para que se respeten.
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
}

// ============================================================================
// Hoja temática: apila bloques (data o nota breve)
// ============================================================================

function writeSheet(
  wb: ExcelJS.Workbook,
  input: ComparativeSheetInput,
  ctx: MunicipioWorkbookInput,
  globalColAWidth: number,
): void {
  const ws = wb.addWorksheet(input.id, { properties: { tabColor: { argb: MUSGO } } })
  // Columnas de datos reales de la hoja. Si no hay tabla (hoja de bloques
  // pendientes) se despliega sobre NOTE_SPAN_COLS columnas para que título,
  // fuente y nota no queden comprimidos en una columna estrecha.
  const dataCols = input.bloques.reduce((max, b) => Math.max(max, b.columnas.length), 0)
  const maxCols = dataCols >= 2 ? dataCols : NOTE_SPAN_COLS
  const widths = computeSheetWidths(input.bloques, globalColAWidth)
  while (widths.length < maxCols) widths.push(NOTE_SPAN_COL_WIDTH)
  paintTitle(ws, 1, widths, maxCols, input.titulo, 14)
  writeScopeLine(ws, 2, widths, maxCols, ctx)
  ws.getRow(3).height = 20
  let cursor = 4
  for (const bloque of input.bloques) {
    try {
      const isNote =
        bloque.availability === 'pending_integration' ||
        bloque.availability === 'not_available' ||
        bloque.filas.length === 0
      const endRow = isNote
        ? writeNoteBlock(ws, cursor, bloque, widths, maxCols).endRow
        : writeDataBlock(ws, cursor, bloque, widths).endRow
      // Aire vertical entre bloques: dos filas en blanco, la primera alta.
      ws.getRow(endRow + 1).height = 20
      cursor = endRow + 3
    } catch (blockErr) {
      console.error(JSON.stringify({
        tag: 'SOCIDEAS_XLSX_BLOCK_SKIP',
        sheet: input.id,
        blockId: bloque.id,
        blockTitle: bloque.titulo,
        error: blockErr instanceof Error ? blockErr.message : String(blockErr),
      }))
    }
  }
  // Aplicar anchos al final (tras todos los merges) para que se respeten.
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
}

// ============================================================================
// Hoja 08_CRITERIOS_Y_FUENTES
// ============================================================================

interface FuenteRow {
  area: string
  fuente: string
  operacion: string
  periodo: string
  url?: string | null
}

interface CriteriosFuentesInput {
  bloques: ExportTable[]
  fuentes: FuenteRow[]
}

const CRITERIOS_LECTURA = [
  'Se priorizan datos oficiales y comparables.',
  'Las comparativas solo se muestran cuando comparten definición y período.',
  'Los datos censales no se presentan como anuales.',
  'Los datos no publicados se representan como ND.',
  'Un ND no equivale a cero.',
  'Los indicadores derivados se identifican como cálculos SOCideas.',
  'Los datos provisionales, cuando existen, deben identificarse expresamente.',
]

const FUENTES_COLS = ['Área', 'Fuente principal', 'Operación / tabla', 'Último período']

/** Anchos de la hoja 08 a partir de su contenido real (columna A unificada). */
function computeCriteriosWidths(fuentes: FuenteRow[], globalColAWidth: number): number[] {
  const cols: (keyof FuenteRow)[][] = [['area'], ['fuente'], ['operacion'], ['periodo']]
  const widths = FUENTES_COLS.map((header, ci) => {
    let needed = naturalTextWidth(header)
    for (const f of fuentes) {
      const value = String(f[cols[ci][0]] ?? '')
      needed = Math.max(needed, naturalTextWidth(value))
    }
    return clampWidth(needed)
  })
  widths[0] = globalColAWidth
  return widths
}

function writeCriteriosFuentes(
  wb: ExcelJS.Workbook,
  input: CriteriosFuentesInput,
  globalColAWidth: number,
): void {
  const ws = wb.addWorksheet('08_CRITERIOS_Y_FUENTES', { properties: { tabColor: { argb: MUSGO } } })
  const nCols = 4
  const widths = computeCriteriosWidths(input.fuentes, globalColAWidth)
  paintTitle(ws, 1, widths, nCols, XLSX_BRAND, 14)
  writeScopeLine(ws, 2, widths, nCols, {
    municipio: 'Criterios y fuentes',
    codigoINE: '—',
    provincia: '—',
    comunidadAutonoma: '—',
  })

  paintTitle(ws, 4, widths, nCols, 'Criterios de lectura', 12)
  ws.getRow(5).height = 20
  let r = 6
  for (const c of CRITERIOS_LECTURA) {
    const row = ws.getRow(r)
    const text = `• ${c}`
    const lines = wrappedLines(text, sumWidths(widths, 0, nCols))
    row.height = Math.max(18, lines * LINE_HEIGHT_BODY)
    mergeRow(ws, r, nCols)
    const cell = row.getCell(1)
    cell.value = text
    cell.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: lines > 1, indent: 1 }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      const cc = row.getCell(i)
      cc.border = { ...thinLimoBorders() }
      if ((cc.value === null || cc.value === undefined) && nCols > 1) {
        cc.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
      }
    }
    r += 1
  }
  r += 1
  ws.getRow(r - 1).height = 20

  // Estados de cobertura usados en la exportación (glosario del catálogo único).
  // Con NEXT_PUBLIC_CONPREL_UI=true se añade la fila CONPREL (§4c); sin flag,
  // el glosario es idéntico al actual (no-regresión).
  paintTitle(ws, r, widths, nCols, 'Estados de cobertura', 12)
  ws.getRow(r + 1).height = 20
  r += 2
  for (const g of coverageGlossaryEntries()) {
    const row = ws.getRow(r)
    const text = `• ${g.estado}: ${g.texto}`
    const lines = wrappedLines(text, sumWidths(widths, 0, nCols))
    row.height = Math.max(18, lines * LINE_HEIGHT_BODY)
    mergeRow(ws, r, nCols)
    const cell = row.getCell(1)
    cell.value = text
    cell.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: lines > 1, indent: 1 }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      const cc = row.getCell(i)
      cc.border = { ...thinLimoBorders() }
      if ((cc.value === null || cc.value === undefined) && nCols > 1) {
        cc.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
      }
    }
    r += 1
  }
  r += 1
  ws.getRow(r - 1).height = 20

  paintTitle(ws, r, widths, nCols, 'Fuentes oficiales utilizadas', 12)
  r += 2
  const headerRowN = r
  const header = ws.getRow(headerRowN)
  FUENTES_COLS.forEach((col, i) => {
    header.getCell(i + 1).value = col
  })
  paintHeaderRow(header, widths, nCols, FUENTES_COLS)
  let fr = headerRowN
  for (const f of input.fuentes) {
    fr += 1
    const row = ws.getRow(fr)
    row.getCell(1).value = f.area
    row.getCell(3).value = f.operacion
    row.getCell(4).value = f.periodo
    const fuenteCell = row.getCell(2)
    if (f.url && isAllowedSourceUrl(f.url)) {
      fuenteCell.value = { text: f.fuente, hyperlink: f.url, tooltip: 'Abrir ficha oficial' }
      fuenteCell.font = { name: FONT_NAME, size: 11, color: { argb: CONIFERA }, underline: true, bold: true }
    } else {
      fuenteCell.value = f.fuente
      fuenteCell.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    }
    row.getCell(1).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    row.getCell(3).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    row.getCell(4).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    let maxLines = 1
    for (let i = 1; i <= nCols; i += 1) {
      const text = i === 2 ? f.fuente : i === 1 ? f.area : i === 3 ? f.operacion : f.periodo
      const lines = wrappedLines(text, widths[i - 1] ?? MIN_COL_WIDTH)
      if (lines > maxLines) maxLines = lines
      row.getCell(i).alignment = {
        vertical: 'middle',
        horizontal: cellAlign(FUENTES_COLS[i - 1] ?? '', i === 1),
        wrapText: lines > 1,
        indent: i === 1 ? 1 : undefined,
      }
      row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HUESO } }
      row.getCell(i).border = { ...thinLimoBorders() }
    }
    row.height = Math.max(18, maxLines * LINE_HEIGHT_BODY)
  }
  // Aplicar anchos al final (tras los merges) para que se respeten.
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
}

// ============================================================================
// Bloques pendientes fijos (hojas 02, 05, 06, 07)
// ============================================================================

function bloquePoliticoPendiente(): ExportTable {
  return {
    id: 'contexto-politico',
    titulo: 'Contexto político',
    hoja: '02_CONTEXTO_POLÍTICO',
    columnas: ['Indicador'],
    filas: [],
    fuente: 'Pendiente de integración desde fuente oficial con cobertura territorial homogénea',
    periodo: '—',
    cobertura: 'Municipio',
    estado: 'Pendiente de integración',
    availability: 'pending_integration',
    comparisonMode: 'municipal_only',
    note: 'La información electoral e institucional se incorporará únicamente desde fuentes oficiales y con validación territorial.',
  }
}

function bloquePatrimonioTurismo(): ExportTable {
  return {
    id: 'patrimonio-turismo',
    titulo: 'Patrimonio y turismo',
    hoja: '05_PATRIMONIO_Y_TURISMO',
    columnas: ['Indicador'],
    filas: [],
    fuente: 'Pendiente de integración desde inventarios culturales y registros turísticos oficiales',
    periodo: '—',
    cobertura: 'Municipio',
    estado: 'Pendiente de integración',
    availability: 'pending_integration',
    comparisonMode: 'municipal_only',
    note: 'Patrimonio y turismo: pendientes de integración desde inventarios culturales y registros turísticos oficiales con cobertura territorial y licencia verificadas.',
  }
}

function bloqueInfraestructura(): ExportTable {
  return {
    id: 'infraestructura',
    titulo: 'Infraestructura, transporte, conectividad y transición energética',
    hoja: '06_INFRAESTRUCTURA_Y_RECURSOS',
    columnas: ['Indicador'],
    filas: [],
    fuente: 'Pendiente de integración desde fuentes geográficas y administrativas oficiales',
    periodo: '—',
    cobertura: 'Municipio',
    estado: 'Pendiente de integración',
    availability: 'pending_integration',
    comparisonMode: 'municipal_only',
    note: 'Infraestructura, transporte, conectividad y transición energética: pendientes de integración desde fuentes geográficas y administrativas oficiales.',
  }
}

function bloqueAsociaciones(): ExportTable {
  return {
    id: 'asociaciones',
    titulo: 'Directorio asociativo',
    hoja: '07_ASOCIACIONES',
    columnas: ['Indicador'],
    filas: [],
    fuente: 'Pendiente de integración desde registros oficiales con política de privacidad aplicable',
    periodo: '—',
    cobertura: 'Municipio',
    estado: 'Pendiente de integración',
    availability: 'pending_integration',
    comparisonMode: 'municipal_only',
    note: 'Directorio asociativo: pendiente de integración desde registros oficiales, licencias verificadas y política de privacidad aplicable.',
  }
}

// ============================================================================
// Catálogo centralizado de hojas (orden contractual)
// ============================================================================

function buildSheetCatalog(input: MunicipioWorkbookInput): {
  hojas: ComparativeSheetInput[]
  fuentes: FuenteRow[]
} {
  const sheetsById = new Map<SocideasSheetId, ExportTable[]>()
  for (const id of SOCIDEAS_SHEET_IDS) sheetsById.set(id, [])

  // 01. Perfil demográfico
  const hoja01: ExportTable[] = []
  for (const b of input.hojas.find((h) => h.id === '01_PERFIL_DEMOGRÁFICO')?.bloques ?? []) hoja01.push(b)
  // Densidad: si la capa INE lateral la publica, reemplaza al placeholder.
  try {
    const densidad = buildDensidadTable(input.ineLayers)
    if (densidad) {
      const idx = hoja01.findIndex((b) => b.id === 'densidad')
      if (idx >= 0) hoja01[idx] = densidad
    }
  } catch (e) {
    console.error(JSON.stringify({ tag: 'SOCIDEAS_XLSX_LAYER_SKIP', layer: 'densidad', error: e instanceof Error ? e.message : String(e) }))
  }
  try {
    const derivados = buildDemographicDerivedLayerTable(input.ineLayers)
    if (derivados) {
      const idx = hoja01.findIndex((b) => b.id === 'derivados')
      if (idx >= 0) hoja01[idx] = derivados
    }
  } catch (e) {
    console.error(JSON.stringify({ tag: 'SOCIDEAS_XLSX_LAYER_SKIP', layer: 'derivados', error: e instanceof Error ? e.message : String(e) }))
  }
  // Movilidad: si la capa INE lateral la publica, se añade al final.
  try {
    const movilidad = buildMovilidadMigratoriaTable(input.ineLayers)
    if (movilidad && movilidad.length > 0) hoja01.push(...movilidad)
  } catch (e) {
    console.error(JSON.stringify({ tag: 'SOCIDEAS_XLSX_LAYER_SKIP', layer: 'movilidad', error: e instanceof Error ? e.message : String(e) }))
  }
  // Saldos migratorios netos (INE 69767): total, exterior e interior.
  try {
    const saldos = buildSaldosMigratoriosTables(input.ineLayers)
    if (saldos && saldos.length > 0) hoja01.push(...saldos)
  } catch (e) {
    console.error(JSON.stringify({ tag: 'SOCIDEAS_XLSX_LAYER_SKIP', layer: 'saldos_migratorios', error: e instanceof Error ? e.message : String(e) }))
  }
  sheetsById.set('01_PERFIL_DEMOGRÁFICO', hoja01)

  // 02. Contexto político: tablas electorales reales cuando la entrada las
  // trae (hoja 02_CONTEXTO_POLÍTICO); si no, bloque pendiente de integración.
  const bloques02 = input.hojas.find((h) => h.id === '02_CONTEXTO_POLÍTICO')?.bloques ?? []
  const has02Real = bloques02.some((b) => b.availability === 'available')
  sheetsById.set('02_CONTEXTO_POLÍTICO', has02Real ? bloques02 : [bloquePoliticoPendiente()])

  // 03. Contexto económico
  sheetsById.set(
    '03_CONTEXTO_ECONÓMICO',
    input.hojas.find((h) => h.id === '03_CONTEXTO_ECONÓMICO')?.bloques ?? [],
  )

  // 04. Contexto sociocultural
  const hoja04: ExportTable[] = []
  try {
    const nivelEduc = buildNivelEducativoTable(input.ineLayers)
    if (nivelEduc) hoja04.push(nivelEduc)
  } catch (e) {
    console.error(JSON.stringify({ tag: 'SOCIDEAS_XLSX_LAYER_SKIP', layer: 'nivel_educativo', error: e instanceof Error ? e.message : String(e) }))
  }
  hoja04.push(buildCentrosEducativosTable())
  sheetsById.set('04_CONTEXTO_SOCIOCULTURAL', hoja04)

  // 05/06/07
  sheetsById.set('05_PATRIMONIO_Y_TURISMO', [bloquePatrimonioTurismo()])
  sheetsById.set('06_INFRAESTRUCTURA_Y_RECURSOS', [bloqueInfraestructura()])
  sheetsById.set('07_ASOCIACIONES', [bloqueAsociaciones()])

  // Catálogo de hojas
  const titulos: Record<SocideasSheetId, { titulo: string; subtitulo: string }> = {
    '00_PROYECTO': { titulo: 'Proyecto y portada', subtitulo: 'Identificación, hojas del libro y criterio metodológico' },
    '01_PERFIL_DEMOGRÁFICO': {
      titulo: 'Perfil demográfico',
      subtitulo: 'Población, composición, evolución, estructura, nacionalidad y arraigo',
    },
    '02_CONTEXTO_POLÍTICO': {
      titulo: 'Contexto político',
      subtitulo: has02Real
        ? 'Elecciones municipales 2023 · Ministerio del Interior (Infoelectoral)'
        : 'Bloque pendiente de integración desde fuente oficial',
    },
    '03_CONTEXTO_ECONÓMICO': {
      titulo: 'Contexto económico',
      subtitulo: 'Renta, desigualdad, tejido empresarial, sector agrario',
    },
    '04_CONTEXTO_SOCIOCULTURAL': {
      titulo: 'Contexto sociocultural',
      subtitulo: 'Nivel educativo (Censo 2021) y servicios municipales',
    },
    '05_PATRIMONIO_Y_TURISMO': { titulo: 'Patrimonio y turismo', subtitulo: 'Bloque pendiente de integración' },
    '06_INFRAESTRUCTURA_Y_RECURSOS': {
      titulo: 'Infraestructura y recursos',
      subtitulo: 'Bloque pendiente de integración',
    },
    '07_ASOCIACIONES': { titulo: 'Asociaciones', subtitulo: 'Bloque pendiente de integración' },
    '08_CRITERIOS_Y_FUENTES': { titulo: 'Criterios y fuentes', subtitulo: 'Criterios de lectura y registro central de fuentes' },
  }

  const hojas: ComparativeSheetInput[] = []
  for (const id of SOCIDEAS_SHEET_IDS) {
    if (id === '00_PROYECTO' || id === '08_CRITERIOS_Y_FUENTES') continue
    const info = titulos[id]
    hojas.push({
      id,
      // La marca completa se reserva a 00_PROYECTO: en las hojas temáticas el
      // título visible debe caber sin cortarse.
      titulo: info.titulo,
      subtitulo: info.subtitulo,
      bloques: sheetsById.get(id) ?? [],
    })
  }

  // Fuentes centralizadas
  const fuentes: FuenteRow[] = []
  const seen = new Set<string>()
  const pushFuente = (
    area: string,
    fuente: string,
    operacion: string,
    periodo: string,
    url?: string | null,
  ): void => {
    const key = `${area}|${fuente}|${operacion}|${periodo}`
    if (seen.has(key)) return
    seen.add(key)
    fuentes.push({ area, fuente, operacion, periodo, url })
  }
  for (const hoja of hojas) {
    for (const b of hoja.bloques) {
      if (!b.source) continue
      const url = b.source.publicUrl ?? null
      pushFuente(
        b.hoja.replace(/^\d+_/, '').replace(/_/g, ' ').toLowerCase(),
        b.source.institution,
        b.source.operation,
        b.periodo,
        url,
      )
    }
  }
  // Fuentes garantizadas por contrato (hojas pendientes). Con datos electorales
  // reales, la fuente la aporta la propia tabla (Ministerio del Interior).
  if (!has02Real) pushFuente('Contexto político', 'Pendiente', 'Fuente oficial pendiente', '—')
  pushFuente('Patrimonio y turismo', 'Pendiente', 'Inventarios culturales pendientes', '—')
  pushFuente('Infraestructura y recursos', 'Pendiente', 'Fuentes geográficas pendientes', '—')
  pushFuente('Asociaciones', 'Pendiente', 'Registros oficiales pendientes', '—')
  // AEAT y ADRH SIEMPRE como filas separadas con su estado de cobertura
  // (nunca en la misma columna comparativa): partial / missing_by_design /
  // blocked_source explicados en la sección "Estados de cobertura".
  pushFuente(
    'Contexto económico',
    'Agencia Estatal de Administración Tributaria',
    'Estadística de declarantes del IRPF por municipios (EDM) · irpf_declaraciones: partial; irpf_renta_bruta_media e irpf_renta_disponible_media: blocked_source',
    '2023',
    AEAT_EDM_IRPF.publicUrl ?? null,
  )
  pushFuente(
    'Contexto económico',
    INE_INSTITUTION,
    'Atlas de Distribución de Renta de los Hogares (ADRH) · renta por persona/hogar: serie separada de AEAT (sin mezcla)',
    'ADRH (varía por tabla)',
    'https://www.ine.es/daco/daco42/renta/adrh_municipios.htm',
  )
  // CONPREL: fila propia con cobertura parcial y URL oficial. Solo con el flag
  // ON (sin flag la hoja 08 es idéntica a la actual). Nunca se mezcla con
  // AEAT ni ADRH en la misma fila.
  if (isConprelUiEnabled()) {
    pushFuente(
      'Contexto económico',
      'Ministerio de Hacienda (CONPREL)',
      CONPREL_FUENTE_08_OPERACION,
      CONPREL_FUENTE_08_PERIODO,
      CONPREL_PPTO_2025.url,
    )
  }

  return { hojas, fuentes }
}

// ============================================================================
// Punto de entrada
// ============================================================================

export async function buildMunicipioWorkbook(input: MunicipioWorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = XLSX_BRAND
  wb.created = new Date()
  wb.modified = new Date()

  const { hojas, fuentes } = buildSheetCatalog(input)

  // Ancho de la columna A unificada en TODO el libro ANTES de escribir hojas.
  const globalColAWidth = calculateGlobalColAWidth(collectAllColATexts(hojas))

  writeProyecto(wb, input, hojas, globalColAWidth)
  for (const hoja of hojas) {
    try {
      writeSheet(wb, hoja, input, globalColAWidth)
    } catch (sheetErr) {
      console.error(JSON.stringify({
        tag: 'SOCIDEAS_XLSX_SHEET_SKIP',
        sheetId: hoja.id,
        error: sheetErr instanceof Error ? sheetErr.message : String(sheetErr),
      }))
    }
  }
  writeCriteriosFuentes(wb, { bloques: [], fuentes }, globalColAWidth)

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// Re-exports para compat con tests previos
export { registrySource, INE_INSTITUTION, AEAT_EDM_IRPF }
export type { ComparisonMode }
