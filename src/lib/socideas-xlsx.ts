// Libro XLSX municipal SOCideas v2 (`socideas-book@2`) — SOLO SERVIDOR.
// Este módulo importa `exceljs` y NUNCA debe importarse desde un Client
// Component: la dependencia queda fuera del bundle cliente.
//
// QUÉ CAMBIA RESPECTO AL LIBRO v1 (auditoría 2026-09-24)
//   v1: 9 hojas apiladas, 0 fórmulas, 0 gráficos, 0 tablas, 0 filtros, 0
//       paneles congelados, 124 fusiones, bloques duplicados.
//   v2: 11 hojas del contrato, Índice con hipervínculos internos y retorno,
//       freeze panes, tablas Excel nativas con filtro, gráficos nativos
//       (inyectados como OOXML: ExcelJS 4.4 no los soporta), fórmulas
//       auditables con resultado cacheado, formatos por unidad, configuración
//       de impresión con encabezados repetidos y pie con fecha/versión.
//
// MAQUETACIÓN
//   - Autoajuste consciente de Poppins (factor 1.2) con tope 42 caracteres.
//   - TÍtulo de hoja (fila 1) y línea de ámbito (fila 2), congeladas.
//   - Bloques apilados: título (Musgo), fuente/período/ámbito/estado (con
//     enlace oficial solo si el host está en la allowlist), cabecera (Crisopa),
//     datos, nota metodológica.
//   - ND = badge Crisopa con texto "ND"; jamás un 0 sustituto.
//
// SINCRONÍA CON LOS DATOS
//   El escritor no decide contenido: recibe `SocideasBookV2` ya ensamblado por
//   `assembleSocideasBookV2` (bloques + indicadores + checks + cobertura) y solo
//   lo maqueta. Los gráficos se resuelven desde la posición real del bloque,
//   por lo que no pueden desincronizarse de la tabla.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { ExportCell, ExportTable } from './socideas-export'
import type { MunicipalIneLayersV1 } from './socideas-ine-layers'
import {
  SOCIDEAS_BOOK_SCHEMA,
  SOCIDEAS_BOOK_SHEETS,
  type BookSheetId,
  type BookSheetV2,
  type BookTableV2,
} from './socideas-book-contract'
import type { SocideasBookV2 } from './socideas-book-blocks'
import { injectNativeCharts, type ChartSpec } from './socideas-xlsx-charts'
import {
  INE_INSTITUTION,
  isAllowedSourceUrl,
  visibleSourceLabel,
} from './socideas-source-registry'

export const XLSX_BRAND = 'Ideas Sostenibilidad - SOCideas - Libro municipal comparativo'

/** Texto visible obligatorio del enlace de procedencia. */
export const SOURCE_LINK_LABEL = 'Ver ficha oficial ↗'
/** Texto visible del enlace de navegación interna. */
export const BACK_TO_INDEX_LABEL = 'Volver al resumen'

/** Paleta SOCideas (solo estos tokens en el libro). */
const MUSGO = 'FF3E665C'
const CONIFERA = 'FF86B73D'
const HUESO = 'FFF1F1F1'
const CARBON = 'FF3C403E'
const LIMO = 'FFB0BDB0'
const CRISOPA = 'FFC2E189'
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
const MAX_COL_WIDTH = 42
const MIN_COL_WIDTH = 10
const MIN_COL_A_WIDTH = 26
const POPPINS_CHAR_FACTOR = 1.2
const CELL_WIDTH_PADDING = 2
const LINE_HEIGHT_BODY = 16
const LINE_HEIGHT_SMALL = 14
const LINE_HEIGHT_TITLE = 20
const LINE_HEIGHT_SECTION = 18
const CHART_COL_WIDTH = 12
const CHART_SPAN_COLS = 9
const MAX_CHARTS_PER_SHEET = 2

// ============================================================================
// Métricas de texto y anchos
// ============================================================================

function naturalTextWidth(text: string): number {
  const longest = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  return longest * POPPINS_CHAR_FACTOR + CELL_WIDTH_PADDING
}

function charsPerLine(width: number): number {
  return Math.max(1, (width - CELL_WIDTH_PADDING) / POPPINS_CHAR_FACTOR)
}

function wrappedLines(text: string, width: number): number {
  if (text.length === 0) return 1
  const per = charsPerLine(width)
  return text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / per)), 0)
}

function clampWidth(needed: number): number {
  return Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, needed)))
}

function sumWidths(widths: number[], from: number, to: number): number {
  let total = 0
  for (let i = from; i < to; i += 1) total += widths[i] ?? MIN_COL_WIDTH
  return total
}

export function colLetter(n: number): string {
  let s = ''
  let x = n
  while (x > 0) {
    const rem = (x - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

// ============================================================================
// Pintado
// ============================================================================

function thinLimoBorders() {
  const side = { style: 'thin' as const, color: { argb: LIMO } }
  return { top: side, left: side, bottom: side, right: side }
}

function band(row: ExcelJS.Row, nCols: number, fill: string): void {
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  }
}

function mergeRow(ws: ExcelJS.Worksheet, rowN: number, nCols: number): void {
  if (nCols > 1) ws.mergeCells(rowN, 1, rowN, nCols)
}

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
  row.height = Math.max(size >= 14 ? 30 : 24, lines * (size >= 14 ? LINE_HEIGHT_TITLE : LINE_HEIGHT_SECTION))
  mergeRow(ws, rowN, nCols)
  const c = row.getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size, bold: true, color: { argb: HUESO } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: lines > 1 }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } }
  c.border = { bottom: { style: 'thin', color: { argb: CONIFERA } } }
  for (let i = 2; i <= nCols; i += 1) {
    const cc = row.getCell(i)
    cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } }
    cc.border = { bottom: { style: 'thin', color: { argb: CONIFERA } } }
    cc.font = { name: FONT_NAME, size: 11, color: { argb: HUESO } }
  }
}

/** LÍnea de procedencia: fuente · período · ámbito · estado + enlace si procede. */
function paintSourceLine(
  ws: ExcelJS.Worksheet,
  rowN: number,
  widths: number[],
  nCols: number,
  block: BookTableV2,
): void {
  const row = ws.getRow(rowN)
  const base = visibleSourceLabel(block.source, block.fuente, block.periodo)
  const text = `${base} · Ámbito: ${block.cobertura} · Estado: ${block.estado}`
  const url = block.source?.publicUrl
  const hasLink = nCols >= 2 && typeof url === 'string' && isAllowedSourceUrl(url)
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
    hyperlink: url as string,
    tooltip: `Abrir fuente oficial: ${block.source?.shortLabel ?? ''}`,
  }
  link.font = { name: FONT_NAME, size: 10, bold: true, underline: true, color: { argb: CONIFERA } }
  link.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HUESO } }
  link.border = thinLimoBorders()
  link.alignment = { vertical: 'middle', horizontal: 'right', wrapText: false }
}

/** Formato numérico por cabecera y valor (años enteros sin separador, % 1
 *  decimal, moneda y hectáreas con separador de miles). */
export function numFmtFor(header: string, value: number): string {
  const dec = Number.isInteger(value) ? 0 : 1
  // Columnas de representación de la pirámide: el signo negativo es solo para
  // el gráfico; al lector se le muestra la magnitud absoluta.
  if (header.toLowerCase().includes('representación')) return '0;0'
  if (header === 'Año' || header === 'Período') return '@'
  if (header.includes('%')) return '0.0" %"'
  if (header.includes('€')) return dec === 0 ? '#,##0 "€"' : '#,##0.00 "€"'
  if (header.includes('hab./km²')) return '#,##0.0" hab./km²"'
  if (header.includes('(ha)')) return dec === 0 ? '#,##0' : '#,##0.00'
  if (header.includes('m²')) return dec === 0 ? '#,##0' : '#,##0.0'
  if (header.includes('(km)')) return '#,##0.0'
  if (header.includes('años')) return dec === 0 ? '#,##0' : '#,##0.0'
  return dec === 0 ? '#,##0' : '#,##0.00'
}

export function cellAlign(header: string, isFirst: boolean): 'left' | 'center' | 'right' {
  if (header === 'Año' || header === 'Período') return 'center'
  if (isFirst) return 'left'
  return 'right'
}

function isTotalLabel(text: string): boolean {
  const t = text.toLowerCase()
  return t.startsWith('total') || t.endsWith('(total)') || t.includes('total de') || t === 'sau total'
}

function paintHeaderRow(row: ExcelJS.Row, widths: number[], nCols: number, headers: string[]): void {
  let maxLines = 1
  const borders = thinLimoBorders()
  for (let i = 1; i <= nCols; i += 1) {
    const c = row.getCell(i)
    c.value = headers[i - 1] ?? ''
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

function collectSheetTexts(bloques: BookTableV2[]): string[][] {
  return bloques.map((b) => {
    const texts: string[] = [...b.columnas]
    for (const fila of b.filas) {
      fila.forEach((cell, i) => {
        const text = `${cell.text}${cell.formula ? '' : ''}`
        if (i < texts.length) {
          texts[i] = texts[i].length >= text.length ? texts[i] : text
        }
      })
    }
    return texts
  })
}

function computeSheetWidths(bloques: BookTableV2[]): number[] {
  const needs: number[] = []
  for (const tableTexts of collectSheetTexts(bloques)) {
    tableTexts.forEach((text, i) => {
      const need = naturalTextWidth(text)
      needs[i] = Math.max(needs[i] ?? MIN_COL_WIDTH, need)
    })
  }
  const widths = needs.map(clampWidth)
  if (widths.length === 0) widths.push(MIN_COL_A_WIDTH)
  widths[0] = Math.max(MIN_COL_A_WIDTH, widths[0])
  const linkNeed = Math.round(naturalTextWidth(SOURCE_LINK_LABEL))
  for (const b of bloques) {
    const n = b.columnas.length
    if (n >= 2 && b.source?.publicUrl) widths[n - 1] = Math.max(widths[n - 1] ?? MIN_COL_WIDTH, linkNeed)
  }
  return widths
}

// ============================================================================
// Tablas Excel nativas y autofiltro
// ============================================================================

function uniqueTableName(base: string, used: Set<string>): string {
  let name = base.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 200)
  if (!/^[A-Za-z_]/.test(name)) name = `t_${name}`
  let candidate = name
  let i = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${name}_${i}`
    i += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((h) => {
    const base = h.trim() || 'Columna'
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
}

function addExcelTable(
  ws: ExcelJS.Worksheet,
  block: BookTableV2,
  headerRow: number,
  lastDataRow: number,
  nCols: number,
  usedTableNames: Set<string>,
): void {
  if (!block.tablaExcel || lastDataRow < headerRow + 1) return
  const ref = `A${headerRow}:${colLetter(nCols)}${lastDataRow}`
  // ExcelJS deriva el `ref` final del número de filas declaradas: si se pasa
  // `rows: []`, la tabla colapsa a solo la cabecera y Excel puede reparar el
  // archivo. Por eso se pasan las filas reales (mismos valores ya escritos; el
  // store interno reescribe el valor y conserva el estilo por celda).
  const rows = block.filas.map((fila) =>
    block.columnas.map((_, ci) => {
      const cell = fila[ci]
      if (!cell) return null
      if (cell.numeric !== null && Number.isFinite(cell.numeric)) {
        return cell.formula
          ? { formula: resolveRowTokens(cell.formula, headerRow + 1, lastDataRow), result: cell.numeric }
          : cell.numeric
      }
      return cell.text
    }),
  )
  try {
    ws.addTable({
      name: uniqueTableName(block.tablaExcel, usedTableNames),
      ref,
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleLight1', showRowStripes: false, showColumnStripes: false },
      columns: uniqueHeaders(block.columnas).map((name) => ({ name, filterButton: true })),
      rows,
    })
  } catch (e) {
    console.error(JSON.stringify({
      tag: 'SOCIDEAS_XLSX_TABLE_SKIP',
      block: block.id,
      ref,
      error: e instanceof Error ? e.message : String(e),
    }))
  }
}

// ============================================================================
// Gráficos (inyección OOXML posterior a writeBuffer)
// ============================================================================

function chartSpecFromBlock(
  block: BookTableV2,
  sheetName: string,
  headerRow: number,
  lastDataRow: number,
  maxNCols: number,
  ordinal: number,
): ChartSpec | null {
  const chart = block.chart
  if (!chart) return null
  if (lastDataRow <= headerRow) return null
  const categorias: string[] = []
  for (let r = headerRow + 1; r <= lastDataRow; r += 1) {
    categorias.push(block.filas[r - headerRow - 1]?.[chart.categoriaColumna - 1]?.text ?? String(r - headerRow))
  }
  const series = chart.series
    .map((s) => {
      const valores: (number | null)[] = []
      for (let r = headerRow + 1; r <= lastDataRow; r += 1) {
        valores.push(block.filas[r - headerRow - 1]?.[s.columna - 1]?.numeric ?? null)
      }
      return {
        nombre: s.nombre,
        categorias,
        valores,
        refs: {
          categorias: `${colLetter(chart.categoriaColumna)}${headerRow + 1}:${colLetter(chart.categoriaColumna)}${lastDataRow}`,
          valores: `${colLetter(s.columna)}${headerRow + 1}:${colLetter(s.columna)}${lastDataRow}`,
        },
      }
    })
    .filter((s) => s.valores.some((v) => v !== null))
  if (series.length === 0) return null
  const fromCol = Math.min(maxNCols + 1, 250 - CHART_SPAN_COLS)
  const rowFrom = Math.max(0, headerRow - 1 + ordinal * 18)
  return {
    sheetName,
    tipo: chart.tipo,
    titulo: chart.titulo,
    subtitulo: `${chart.unidad} · ${chart.periodo} · ${chart.fuente}`.slice(0, 300),
    series,
    refs: series.map((s) => s.refs),
    anchor: [fromCol, rowFrom, fromCol + CHART_SPAN_COLS, rowFrom + 16],
  }
}

// ============================================================================
// Escritura de bloques
// ============================================================================

interface BlockWriteResult {
  endRow: number
  headerRow: number
  lastDataRow: number
  nCols: number
  chart: ChartSpec | null
}

/**
 * Resuelve las referencias relativas al bloque en las fórmulas:
 *   {R1}      → primera fila de datos del bloque
 *   {R2}      → última fila de datos del bloque
 *   {R1+2}    → primera + 2 · {R2-1} → última − 1
 * Los constructores de bloques no conocen la posición absoluta (los bloques se
 * apilan dinámicamente), así que las fórmulas se declaran relativas y aquí se
 * convierten en referencias A1 reales antes de escribir la celda.
 */
export function resolveRowTokens(formula: string, first: number, last: number): string {
  return formula
    .replace(/\{R1\+(\d+)\}/g, (_m, n: string) => String(first + Number(n)))
    .replace(/\{R1-(\d+)\}/g, (_m, n: string) => String(first - Number(n)))
    .replace(/\{R2\+(\d+)\}/g, (_m, n: string) => String(last + Number(n)))
    .replace(/\{R2-(\d+)\}/g, (_m, n: string) => String(last - Number(n)))
    .replace(/\{R1\}/g, String(first))
    .replace(/\{R2\}/g, String(last))
}

function writeBlock(
  ws: ExcelJS.Worksheet,
  sheet: BookSheetV2,
  block: BookTableV2,
  startRow: number,
  widths: number[],
  maxNCols: number,
  usedTableNames: Set<string>,
  chartOrdinal: number,
): BlockWriteResult {
  const nCols = Math.max(1, block.columnas.length)
  paintTitle(ws, startRow, widths, nCols, block.titulo)
  paintSourceLine(ws, startRow + 1, widths, nCols, block)

  const headerRowN = startRow + 2
  const header = ws.getRow(headerRowN)
  paintHeaderRow(header, widths, nCols, block.columnas)

  const firstDataRow = headerRowN + 1
  const lastDataRowExpected = headerRowN + block.filas.length
  let r = headerRowN
  for (const fila of block.filas) {
    r += 1
    const row = ws.getRow(r)
    let maxLines = 1
    for (let ci = 0; ci < nCols; ci += 1) {
      const cell: ExportCell | undefined = fila[ci]
      const c = row.getCell(ci + 1)
      const colName = block.columnas[ci] ?? ''
      if (!cell) {
        c.value = null
      } else if (cell.numeric !== null && Number.isFinite(cell.numeric)) {
        if (cell.formula) {
          c.value = {
            formula: resolveRowTokens(cell.formula, firstDataRow, lastDataRowExpected),
            result: cell.numeric,
          }
          c.numFmt = numFmtFor(colName, cell.numeric)
        } else {
          c.value = cell.numeric
          c.numFmt = numFmtFor(colName, cell.numeric)
        }
      } else {
        c.value = cell.text
        c.numFmt = '@'
      }
      const isNd = cell !== undefined && cell.numeric === null && cell.text === 'ND'
      const isTotal = cell !== undefined && isTotalLabel(cell.text)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isNd ? CRISOPA : HUESO } }
      c.border = { ...thinLimoBorders() }
      c.font = {
        name: FONT_NAME,
        size: 11,
        bold: isNd || isTotal,
        italic: colName === 'Estado' || colName === 'Motivo del bloqueo' || colName === 'Siguiente acción',
        color: { argb: CARBON },
      }
      const lines = wrappedLines(cell?.text ?? '', widths[ci] ?? MIN_COL_WIDTH)
      if (lines > maxLines) maxLines = lines
      c.alignment = {
        vertical: 'middle',
        horizontal: cellAlign(colName, ci === 0),
        wrapText: lines > 1,
        indent: ci === 0 ? 1 : undefined,
      }
    }
    row.height = Math.max(18, maxLines * LINE_HEIGHT_BODY)
    if (block.plegable && r > headerRowN) row.outlineLevel = 1
  }
  const lastDataRow = r

  addExcelTable(ws, block, headerRowN, lastDataRow, nCols, usedTableNames)

  if (block.note) {
    r += 1
    const noteRow = ws.getRow(r)
    const fallos = (block.checks ?? []).filter((c) => !c.ok)
    const noteText = fallos.length > 0
      ? `${block.note} Reconciliación con desviación: ${fallos.map((f) => f.id).join(', ')} (ver 10_METODOLOGÍA_FUENTES).`
      : block.note
    const mergedWidth = sumWidths(widths, 0, nCols)
    const lines = wrappedLines(noteText, mergedWidth)
    noteRow.height = Math.max(24, lines * LINE_HEIGHT_SMALL)
    mergeRow(ws, r, nCols)
    const nc = noteRow.getCell(1)
    nc.value = noteText
    nc.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
    nc.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
    band(noteRow, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      const cc = noteRow.getCell(i)
      cc.border = { ...thinLimoBorders() }
      if (cc.value === null || cc.value === undefined) {
        cc.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
      }
    }
  }

  const chart = chartSpecFromBlock(block, sheet.id, headerRowN, lastDataRow, maxNCols, chartOrdinal)
  return { endRow: r, headerRow: headerRowN, lastDataRow, nCols, chart }
}

function writeSheetHeader(
  ws: ExcelJS.Worksheet,
  sheet: BookSheetV2,
  book: SocideasBookV2,
  widths: number[],
  maxCols: number,
): void {
  paintTitle(ws, 1, widths, maxCols, `SOCideas · ${sheet.titulo}`, 14)
  const row = ws.getRow(2)
  const scope =
    `Municipio: ${book.municipio} (${book.codigoINE}) · Esquema ${SOCIDEAS_BOOK_SCHEMA} · ` +
    `Generado: ${book.fechaGeneracion} · Cobertura global: ${book.coverage.global.toLocaleString('es-ES')} %`
  const textCols = Math.max(1, maxCols - 1)
  const mergedWidth = sumWidths(widths, 0, textCols)
  const lines = wrappedLines(scope, mergedWidth)
  row.height = Math.max(18, lines * LINE_HEIGHT_BODY)
  if (textCols > 1) mergeRow(ws, 2, textCols)
  const c = row.getCell(1)
  c.value = scope
  c.font = { name: FONT_NAME, size: 10, color: { argb: CARBON } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: lines > 1 }
  band(row, maxCols, HUESO)
  for (let i = 1; i <= maxCols; i += 1) {
    row.getCell(i).border = { bottom: { style: 'thin', color: { argb: LIMO } } }
  }
  if (sheet.id !== '00_RESUMEN' && maxCols >= 2) {
    const link = row.getCell(maxCols)
    link.value = {
      text: BACK_TO_INDEX_LABEL,
      hyperlink: `#'00_RESUMEN'!A1`,
      tooltip: 'Volver al resumen ejecutivo',
    }
    link.font = { name: FONT_NAME, size: 10, bold: true, underline: true, color: { argb: CONIFERA } }
    link.alignment = { vertical: 'middle', horizontal: 'right' }
  }
}

/** Índice con hipervínculos internos que se inserta en 00_RESUMEN.
 *
 *  Reserva ancho para sus CUATRO columnas: el Índice no participa en
 *  `computeSheetWidths` (se inyecta fuera de `sheet.bloques`), y sin reserva los
 *  identificadores largos (`05_SOCIAL_EDUCACIÓN_SERVICIOS`) y los títulos se
 *  recortaban contra el ancho de la tabla de portada. */
function writeIndexBlock(ws: ExcelJS.Worksheet, book: SocideasBookV2, startRow: number, widths: number[]): number {
  const nCols = 4
  const reserve = (col: number, need: number): void => {
    widths[col - 1] = Math.max(widths[col - 1] ?? MIN_COL_WIDTH, clampWidth(need))
  }
  reserve(1, Math.max(...book.sheets.map((s) => naturalTextWidth(s.id))))
  reserve(2, Math.max(...book.sheets.map((s) => naturalTextWidth(s.titulo))))
  reserve(3, naturalTextWidth('Bloques'))
  reserve(4, naturalTextWidth('Indicadores publicables'))
  paintTitle(ws, startRow, widths, nCols, 'Índice de hojas del libro', 12)
  const headerRow = startRow + 1
  const header = ws.getRow(headerRow)
  paintHeaderRow(header, widths, nCols, ['Hoja', 'Contenido', 'Bloques', 'Indicadores publicables'])
  let r = headerRow
  for (const sheet of book.sheets) {
    r += 1
    const row = ws.getRow(r)
    const publicables = sheet.bloques
      .flatMap((b) => b.indicadores)
      .filter((i) => i.availability === 'available' || i.availability === 'partial').length
    const linkCell = row.getCell(1)
    linkCell.value = { text: sheet.id, hyperlink: `#'${sheet.id}'!A1`, tooltip: `Ir a ${sheet.titulo}` }
    linkCell.font = { name: FONT_NAME, size: 11, bold: true, underline: true, color: { argb: CONIFERA } }
    linkCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    row.getCell(2).value = sheet.titulo
    row.getCell(2).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' }
    row.getCell(3).value = sheet.bloques.length
    row.getCell(4).value = publicables
    for (let i = 3; i <= nCols; i += 1) {
      const cc = row.getCell(i)
      cc.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
      cc.alignment = { vertical: 'middle', horizontal: 'right' }
      cc.numFmt = '#,##0'
    }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      row.getCell(i).border = { ...thinLimoBorders() }
    }
    row.height = 18
  }
  return r
}

function writeSheet(
  wb: ExcelJS.Workbook,
  sheet: BookSheetV2,
  book: SocideasBookV2,
  usedTableNames: Set<string>,
): { charts: ChartSpec[] } {
  const ws = wb.addWorksheet(sheet.id, { properties: { tabColor: { argb: MUSGO } } })
  const maxNCols = sheet.bloques.reduce((max, b) => Math.max(max, b.columnas.length), 2)
  const widths = computeSheetWidths(sheet.bloques)
  while (widths.length < maxNCols) widths.push(18)
  // El enlace de retorno al Índice vive en la última columna del encabezado
  // (fila 2): la columna debe poder mostrarlo entero o Excel lo recorta por la
  // izquierda (alineación derecha). Contrato v2: navegación interna siempre.
  if (sheet.id !== '00_RESUMEN') {
    widths[maxNCols - 1] = Math.max(widths[maxNCols - 1] ?? MIN_COL_WIDTH, Math.round(naturalTextWidth(BACK_TO_INDEX_LABEL)))
  }
  const charts: ChartSpec[] = []
  let chartOrdinal = 0

  writeSheetHeader(ws, sheet, book, widths, maxNCols)

  let cursor = 4
  let indexWritten = sheet.id !== '00_RESUMEN'
  for (const block of sheet.bloques) {
    try {
      const res = writeBlock(ws, sheet, block, cursor, widths, maxNCols, usedTableNames, chartOrdinal)
      if (res.chart && charts.length < MAX_CHARTS_PER_SHEET) {
        charts.push(res.chart)
        chartOrdinal += 1
      }
      cursor = res.endRow + 3
      if (sheet.id === '00_RESUMEN' && !indexWritten) {
        cursor = writeIndexBlock(ws, book, cursor, widths) + 3
        indexWritten = true
      }
    } catch (blockErr) {
      console.error(JSON.stringify({
        tag: 'SOCIDEAS_XLSX_BLOCK_SKIP',
        sheet: sheet.id,
        blockId: block.id,
        error: blockErr instanceof Error ? blockErr.message : String(blockErr),
      }))
      cursor += 1
    }
  }

  // Autofiltro manual solo si ninguna tabla nativa lo aportó ya.
  if (ws.getTables().length === 0) {
    const firstData = sheet.bloques.find((b) => b.filas.length > 0 && b.columnas.length >= 2)
    if (firstData) {
      // Recalcular la posición real del primer bloque con datos: se almacena en
      // la primera pasada; simplificamos localizando la fila de su cabecera por
      // búsqueda de su título en la columna A.
      for (let r = 4; r <= cursor; r += 1) {
        const v = ws.getRow(r).getCell(1).value
        if (typeof v === 'string' && v === firstData.titulo) {
          const headerRow = r + 2
          const lastRow = headerRow + firstData.filas.length
          ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: firstData.columnas.length } }
          break
        }
      }
    }
  }

  // Espacio para gráficos: columnas a la derecha del contenido.
  for (let i = maxNCols + 1; i <= maxNCols + CHART_SPAN_COLS; i += 1) {
    if (!widths[i - 1]) ws.getColumn(i).width = CHART_COL_WIDTH
  }

  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  // Navegación y presentación
  ws.views = [
    { state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3', activeCell: 'A3', showRuler: false, showGridLines: false },
  ]
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:2',
    showGridLines: false,
    horizontalCentered: false,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.25 },
  }
  ws.headerFooter = {
    oddFooter: `&L SOCideas · ${book.municipio} (${book.codigoINE}) &C ${SOCIDEAS_BOOK_SCHEMA} &R &P/&N · ${book.fechaGeneracion}`,
  }
  ws.pageSetup.printArea = `A1:${colLetter(Math.max(maxNCols, 4))}${Math.max(cursor - 1, 4)}`

  return { charts }
}

// ============================================================================
// Normalización de hipervínculos internos (ExcelJS deja '#' en location)
// ============================================================================

/** Excel escribe los enlaces internos como `<hyperlink location="Hoja!A1">`
 *  sin relación externa. ExcelJS añade `location="#Hoja!A1"` y una relación
 *  externa espuria: se corrigen ambos para que Excel no avise. */
export async function normalizeInternalHyperlinks(xlsxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsxBuffer)
  const sheetFiles = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
  for (const file of sheetFiles) {
    const xml = await zip.file(file)?.async('string')
    if (!xml || !xml.includes('location="#')) continue
    const dropped = new Set<string>()
    const fixed = xml.replace(/<hyperlink ([^>]*?)location="#([^"]+)"([^>]*?)\/>/g, (_m, pre: string, target: string, post: string) => {
      const rIdMatch = /r:id="([^"]+)"/.exec(`${pre} ${post}`)
      if (rIdMatch) dropped.add(rIdMatch[1])
      const cleanedPre = pre.replace(/\s*r:id="[^"]+"/, '')
      const cleanedPost = post.replace(/\s*r:id="[^"]+"/, '')
      return `<hyperlink ${cleanedPre}location="${target}"${cleanedPost}/>`
    })
    if (dropped.size === 0) continue
    await zip.file(file, fixed)
    const relsFile = file.replace('xl/worksheets/', 'xl/worksheets/_rels/').replace(/\.xml$/, '.xml.rels')
    const rels = await zip.file(relsFile)?.async('string')
    if (rels) {
      let fixedRels = rels
      for (const rId of dropped) {
        fixedRels = fixedRels.replace(
          new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*/>`, 'g'),
          '',
        )
      }
      await zip.file(relsFile, fixedRels)
    }
  }
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
}

// ============================================================================
// Entrada principal
// ============================================================================

export interface LegacyComparativeSheetInput {
  id: string
  titulo: string
  subtitulo?: string
  bloques: ExportTable[]
}

export interface MunicipioWorkbookInput {
  municipio: string
  codigoINE: string
  provincia: string
  comunidadAutonoma: string
  fechaGeneracion: string
  hojas: LegacyComparativeSheetInput[]
  ineLayers?: MunicipalIneLayersV1 | null
}

/** Construye el libro v2 completo desde el contrato `socideas-book@2`. */
export async function buildSocideasBookXlsx(book: SocideasBookV2): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = XLSX_BRAND
  wb.created = new Date()
  wb.modified = new Date()

  const usedTableNames = new Set<string>()
  const allCharts: ChartSpec[] = []
  const bySheet: BookSheetV2[] = SOCIDEAS_BOOK_SHEETS.map((meta) => {
    const found = book.sheets.find((s) => s.id === meta.id)
    if (!found) throw new Error(`El libro no contiene la hoja contractual ${meta.id}`)
    return found
  }).map((s) => s)

  for (const sheet of bySheet) {
    try {
      const { charts } = writeSheet(wb, sheet, book, usedTableNames)
      allCharts.push(...charts)
    } catch (sheetErr) {
      console.error(JSON.stringify({
        tag: 'SOCIDEAS_XLSX_SHEET_SKIP',
        sheetId: sheet.id,
        error: sheetErr instanceof Error ? sheetErr.message : String(sheetErr),
      }))
    }
  }

  let buffer: Uint8Array = new Uint8Array(await wb.xlsx.writeBuffer())
  if (allCharts.length > 0) {
    buffer = await injectNativeCharts(Buffer.from(buffer), allCharts)
  }
  buffer = await normalizeInternalHyperlinks(Buffer.from(buffer))
  return Buffer.from(buffer)
}

/** Compatibilidad con llamadas v1 (diagnóstico y validadores): adapta los
 *  bloques recibidos al contrato v2 sin inventar datos y garantiza que ninguna
 *  hoja quede vacía. La ruta de producción usa `buildSocideasBookXlsx`. */
export async function buildMunicipioWorkbook(input: MunicipioWorkbookInput): Promise<Buffer> {
  const v1ToV2: Record<string, BookSheetId> = {
    '01_PERFIL_DEMOGRÁFICO': '01_DEMOGRAFÍA',
    '02_CONTEXTO_POLÍTICO': '02_POLÍTICA',
    '03_CONTEXTO_ECONÓMICO': '03_ECONOMÍA_Y_EMPLEO',
    '04_CONTEXTO_SOCIOCULTURAL': '05_SOCIAL_EDUCACIÓN_SERVICIOS',
    '05_PATRIMONIO_Y_TURISMO': '07_PATRIMONIO_TURISMO',
    '06_INFRAESTRUCTURA_Y_RECURSOS': '08_INFRAESTRUCTURA_RECURSOS',
    '07_ASOCIACIONES': '09_ASOCIACIONES_GOBERNANZA',
  }
  const bloquesPorHoja = new Map<BookSheetId, BookTableV2[]>()
  for (const hoja of input.hojas) {
    const target = v1ToV2[hoja.id]
    if (!target) continue
    // Una hoja v1 declarada sin bloques NO debe registrar el destino: si se
    // registra con [], el fallback `?? pending(...)` no se activa y la hoja v2
    // quedaría vacía, rompiendo la garantía "ninguna hoja vacía".
    if (hoja.bloques.length === 0) continue
    const existing = bloquesPorHoja.get(target) ?? []
    for (const b of hoja.bloques) {
      existing.push({
        schema: SOCIDEAS_BOOK_SCHEMA,
        id: b.id,
        titulo: b.titulo,
        hoja: target,
        columnas: b.columnas,
        filas: b.filas as BookTableV2['filas'],
        fuente: b.fuente,
        periodo: b.periodo,
        cobertura: b.cobertura,
        estado: b.estado,
        availability: b.availability ?? 'available',
        note: b.note,
        source: b.source,
        comparisonMode: b.comparisonMode,
        indicadores: [],
      })
    }
    bloquesPorHoja.set(target, existing)
  }

  const pending = (hoja: BookSheetId, titulo: string): BookTableV2[] => [
    {
      schema: SOCIDEAS_BOOK_SCHEMA,
      id: `${hoja.toLowerCase()}-declarada`,
      titulo,
      hoja,
      columnas: ['Indicador', 'Estado', 'Fuente candidata', 'Motivo', 'Siguiente acción'],
      filas: [[
        { text: titulo, numeric: null },
        { text: 'Pendiente de integración con operación candidata', numeric: null },
        { text: '—', numeric: null },
        { text: 'Bloque no alimentado en esta llamada (adaptación v1→v2).', numeric: null },
        { text: 'Usar la ruta de producción con el pipeline v2.', numeric: null },
      ]],
      fuente: 'SOCideas · adaptador v1→v2',
      periodo: '—',
      cobertura: 'Municipio',
      estado: 'Pendiente de integración',
      availability: 'pending_integration',
      indicadores: [],
    },
  ]

  const sheets: BookSheetV2[] = []
  const metaTitulos: Record<string, string> = {
    '01_DEMOGRAFÍA': 'Demografía',
    '02_POLÍTICA': 'Política',
    '03_ECONOMÍA_Y_EMPLEO': 'Economía y empleo',
    '04_AGRARIO': 'Agrario',
    '05_SOCIAL_EDUCACIÓN_SERVICIOS': 'Social, educación y servicios',
    '06_VIVIENDA_Y_HOGARES': 'Vivienda y hogares',
    '07_PATRIMONIO_TURISMO': 'Patrimonio y turismo',
    '08_INFRAESTRUCTURA_RECURSOS': 'Infraestructura y recursos',
    '09_ASOCIACIONES_GOBERNANZA': 'Asociaciones y gobernanza',
  }
  const bloques00: BookTableV2[] = [
    {
      schema: SOCIDEAS_BOOK_SCHEMA,
      id: 'portada-v1',
      titulo: 'Identificación del libro',
      hoja: '00_RESUMEN',
      columnas: ['Campo', 'Valor'],
      filas: [
        { text: 'Municipio', numeric: null },
        { text: input.municipio, numeric: null },
      ].map((c) => [c]),
      fuente: 'SOCideas',
      periodo: input.fechaGeneracion,
      cobertura: `${input.municipio} (${input.codigoINE}) · ${input.provincia} · ${input.comunidadAutonoma}`,
      estado: 'Disponible',
      indicadores: [],
    },
  ]
  // Reconstruir la portada con filas Campo/Valor correctas
  bloques00[0].filas = [
    [{ text: 'Municipio', numeric: null }, { text: input.municipio, numeric: null }],
    [{ text: 'Código INE', numeric: null }, { text: input.codigoINE, numeric: null }],
    [{ text: 'Provincia', numeric: null }, { text: input.provincia, numeric: null }],
    [{ text: 'Comunidad autónoma', numeric: null }, { text: input.comunidadAutonoma, numeric: null }],
    [{ text: 'Fecha de generación', numeric: null }, { text: input.fechaGeneracion, numeric: null }],
    [{ text: 'Esquema', numeric: null }, { text: SOCIDEAS_BOOK_SCHEMA, numeric: null }],
  ]
  sheets.push({ id: '00_RESUMEN', titulo: 'Resumen ejecutivo', subtitulo: 'Adaptación v1→v2', bloques: bloques00 })
  for (const meta of SOCIDEAS_BOOK_SHEETS) {
    if (meta.id === '00_RESUMEN' || meta.id === '10_METODOLOGÍA_FUENTES') continue
    sheets.push({
      id: meta.id,
      titulo: meta.titulo,
      subtitulo: meta.subtitulo,
      bloques: bloquesPorHoja.get(meta.id) ?? pending(meta.id, metaTituloFallback(metaTitulos, meta.id)),
    })
  }
  sheets.push({
    id: '10_METODOLOGÍA_FUENTES',
    titulo: 'Metodología y fuentes',
    subtitulo: 'Adaptación v1→v2',
    bloques: [{
      schema: SOCIDEAS_BOOK_SCHEMA,
      id: 'metodologia-v1',
      titulo: 'Trazabilidad de las tablas incluidas',
      hoja: '10_METODOLOGÍA_FUENTES',
      columnas: ['Bloque', 'Fuente', 'Período', 'Estado'],
      filas: input.hojas.flatMap((h) => h.bloques.map((b) => [
        { text: `${h.id} · ${b.titulo}`, numeric: null },
        { text: b.fuente, numeric: null },
        { text: b.periodo, numeric: null },
        { text: b.estado, numeric: null },
      ])),
      fuente: 'SOCideas · adaptador v1→v2',
      periodo: input.fechaGeneracion,
      cobertura: 'Todas las hojas',
      estado: 'Disponible',
      indicadores: [],
    }],
  })

  const book: SocideasBookV2 = {
    schemaVersion: SOCIDEAS_BOOK_SCHEMA,
    municipio: input.municipio,
    codigoINE: input.codigoINE,
    fechaGeneracion: input.fechaGeneracion,
    sheets,
    indicadores: [],
    coverage: { areas: [], global: 0, publicables: 0, declarados: 0 },
    findings: [],
    checks: [],
    duplicateKeys: [],
  }
  return buildSocideasBookXlsx(book)
}

function metaTituloFallback(map: Record<string, string>, id: string): string {
  return map[id] ?? id
}

// Re-exports de compatibilidad con consumidores existentes.
export { INE_INSTITUTION }
