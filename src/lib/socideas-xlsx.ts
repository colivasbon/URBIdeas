// Libro XLSX municipal SOCideas — SOLO SERVIDOR.
// Este módulo importa `exceljs` y NUNCA debe importarse desde un Client Component
// (ni directa ni transitivamente): la dependencia queda fuera del bundle cliente.
// Libro directo y visual: EXACTAMENTE tres hojas (00_Resumen, 01_Demografía,
// 02_Economía), bloques apilados, sin hojas detalladas, sin enlaces internos,
// sin autofilter, sin freeze panes, sin mergeCells (fusionar desde A1 anula el
// ancho de la columna 1 en ExcelJS: verificado empíricamente).
// Tipografía: Poppins no garantizada en Excel; Calibri como fallback explícito.
import ExcelJS from 'exceljs'
import type { ExportTable } from './socideas-export'

export const XLSX_BRAND = 'Ideas Sostenibilidad · SOCideas'

/** Tokens Ideas: principal #3E665C, acento #86B73D, fondo claro #F1F1F1.
 *  Alerta #FBE122 reservada a alertas reales (sin uso aquí). Sin degradados. */
const MINERAL = 'FF3E665C'
const ACCENT = 'FF86B73D'
const PAPER = 'FFF1F1F1'
const ALT = 'FFEDF3EF'
const WHITE = 'FFFFFFFF'
const INK = 'FF1F2A26'
const MUTED = 'FF5B6B62'

const FONT_NAME = 'Calibri'

export interface MunicipioWorkbookInput {
  municipio: string
  codigoINE: string
  provincia: string
  comunidadAutonoma: string
  fechaGeneracion: string
  demografia: ExportTable[]
  economia: ExportTable[]
  excluidasDemografia: { titulo: string; motivo: string }[]
  excluidasEconomia: { titulo: string; motivo: string }[]
  excluidasSecciones: { titulo: string; motivo: string }[]
}

/** Rellena SOLO las celdas 1..nCols: jamás filas enteras ni celdas vacías. */
function band(row: ExcelJS.Row, nCols: number, fill: string): void {
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  }
}

/** Banda de título: termina exactamente en la última columna del bloque. */
function paintTitle(ws: ExcelJS.Worksheet, rowN: number, nCols: number, text: string, size = 12): void {
  const row = ws.getRow(rowN)
  row.height = 22
  for (let i = 1; i <= nCols; i += 1) {
    const c = row.getCell(i)
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MINERAL } }
    c.border = { bottom: { style: 'thin', color: { argb: ACCENT } } }
    if (i === 1) {
      c.value = text
      c.font = { name: FONT_NAME, size, bold: true, color: { argb: WHITE } }
      c.alignment = { vertical: 'middle' }
    }
  }
}

/** Línea de metadatos: texto gris pequeño sin banda. */
function paintMetaLine(ws: ExcelJS.Worksheet, rowN: number, text: string): void {
  const c = ws.getRow(rowN).getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size: 10, color: { argb: MUTED } }
  c.alignment = { vertical: 'middle' }
}

function numFmtFor(header: string): string | null {
  if (header === 'Año') return '0'
  if (header.includes('€')) return '#,##0 "€"'
  if (header.includes('%')) return '0.0" %"'
  return '#,##0'
}

/** Límites estrictos por rol. Ninguna columna temática supera 24. */
export function columnLimitsFor(header: string, isFirst: boolean, tableId?: string): [number, number] {
  if (header === 'Año') return [10, 10]
  if (header.includes('€')) return [15, 17]
  if (header.includes('%')) return [13, 13]
  if (tableId === 'gini' || tableId === 'p80_p20') return [12, 14]
  if (header === 'Grupo de edad') return [12, 15]
  if (header === 'Concepto' || header === 'Especie') return [16, 20]
  if (header === 'Indicador') return [18, 24]
  if (isFirst) return [18, 24]
  return [11, 12]
}

function cellTextLength(text: string, numeric: number | null, header: string): number {
  if (numeric !== null && Number.isFinite(numeric)) {
    return String(numeric).length + (header.includes('€') || header.includes('%') ? 2 : 0)
  }
  return text.length
}

/** Texto izquierda, año centro, números derecha. Encabezado igual que celdas. */
export function cellAlign(header: string, isFirst: boolean): 'left' | 'center' | 'right' {
  if (header === 'Año') return 'center'
  if (isFirst) return 'left'
  return 'right'
}

function paintHeaderRow(row: ExcelJS.Row, nCols: number): void {
  row.height = 18
  for (let i = 1; i <= nCols; i += 1) {
    const c = row.getCell(i)
    c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MINERAL } }
    c.border = { bottom: { style: 'thin', color: { argb: ACCENT } } }
  }
}

/** Ancho por rol desde el contenido real de LA tabla (nunca de otras tablas,
 *  títulos ni metadatos). Sin medida fija universal. */
function applyTableWidths(
  ws: ExcelJS.Worksheet,
  tableId: string,
  columnas: string[],
  filas: { text: string; numeric: number | null }[][],
): void {
  columnas.forEach((col, ci) => {
    const [min, max] = columnLimitsFor(col, ci === 0, tableId)
    let longest = col.length
    for (const fila of filas) {
      const cell = fila[ci]
      if (!cell) continue
      const len = cellTextLength(cell.text, cell.numeric, col)
      if (len > longest) longest = len
    }
    let w = Math.min(max, Math.max(min, longest + 2))
    // Quirk verificado de ExcelJS 4.4.0: el ancho exactamente 9 no se serializa.
    if (w === 9) w = 10
    const prev = ws.getColumn(ci + 1).width ?? 0
    ws.getColumn(ci + 1).width = Math.max(prev, w)
  })
}

/** Etiquetas visibles cortas (solo presentación; los datos no cambian). */
const SHORT_TITLES: Record<string, string> = {
  'poblacion-actual': 'Población por sexo',
  evolucion: 'Evolución anual de la población',
  piramide: 'Estructura por edad y sexo',
  derivados: 'Indicadores demográficos',
  renta: 'Renta anual',
  gini: 'Índice de Gini',
  p80_p20: 'Ratio P80/P20',
  empresas: 'Tejido empresarial',
  agrario: 'Estructura agraria',
  ganaderia: 'Ganadería',
}

const SHORT_COLS: Record<string, string> = {
  'Bruta media/decl. (€)': 'Bruta/decl. (€)',
  'Disponible media/decl. (€)': 'Disp./decl. (€)',
  'Grupo de edad': 'Edad',
}

function shortSource(fuente: string): string {
  if (fuente.includes('AEAT') && fuente.includes('ADRH')) return 'AEAT / ADRH'
  if (fuente.includes('Tempus3')) return 'INE'
  if (fuente.includes('ADRH')) return 'INE · ADRH'
  if (fuente.includes('AEAT')) return 'AEAT'
  if (fuente.includes('DIRCE')) return 'DIRCE'
  if (fuente.includes('Censo Agrario')) return 'Censo Agrario 2020'
  return fuente.split('·')[0]?.trim() || fuente
}

function scopeLabel(id: string): string {
  if (id.startsWith('comparativa-')) {
    const amb = id.slice('comparativa-'.length)
    if (amb === 'ccaa') return 'Comparativa: CCAA'
    if (amb === 'espana') return 'Comparativa: España'
    return `Comparativa: ${amb.charAt(0).toUpperCase()}${amb.slice(1)}`
  }
  return SHORT_TITLES[id] ?? id
}

/**
 * Escribe UN bloque simple: título corto + periodo, línea de fuente, tabla.
 * Solo columnas necesarias; estilos y anchos exactos de ESTA tabla.
 * Regla de integridad: `numeric === null` se escribe como TEXTO (ND), jamás 0.
 */
function writeBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  t: ExportTable,
): { headerRow: number; endRow: number; nCols: number } {
  const columnas = t.columnas.map((c) => SHORT_COLS[c] ?? c)
  const nCols = columnas.length
  paintTitle(ws, startRow, nCols, `${scopeLabel(t.id)} · ${t.periodo}`)
  paintMetaLine(ws, startRow + 1, `Fuente: ${shortSource(t.fuente)} · Período: ${t.periodo}`)
  const headerRowN = startRow + 2
  const header = ws.getRow(headerRowN)
  columnas.forEach((col, i) => {
    const c = header.getCell(i + 1)
    c.value = col
    c.alignment = { vertical: 'middle', horizontal: cellAlign(col, i === 0) }
  })
  paintHeaderRow(header, nCols)
  let r = headerRowN
  t.filas.forEach((fila, fi) => {
    r += 1
    const row = ws.getRow(r)
    fila.forEach((cell, ci) => {
      const c = row.getCell(ci + 1)
      const colName = columnas[ci]
      if (cell.numeric !== null && Number.isFinite(cell.numeric)) {
        c.value = cell.numeric
        const fmt = numFmtFor(colName)
        if (fmt) c.numFmt = fmt
      } else {
        // Ausencia (null/ND/secreto): texto explícito, NUNCA 0.
        c.value = cell.text
        c.numFmt = '@'
      }
      c.font = { name: FONT_NAME, size: 11, color: { argb: INK } }
      // Descriptivas con wrap y sin altura fija (Excel autoajusta la fila);
      // cifras sin wrap. La columna A la domina el Año (10) cuando hay series.
      c.alignment = { vertical: 'middle', horizontal: cellAlign(colName, ci === 0), wrapText: ci === 0 }
    })
    if (fi % 2 === 1) band(row, nCols, ALT)
  })
  applyTableWidths(
    ws,
    t.id,
    columnas,
    t.filas.map((f) => f.map((c) => ({ text: c.text, numeric: c.numeric }))),
  )
  return { headerRow: headerRowN, endRow: r, nCols }
}

const DEMO_ORDER = ['poblacion-actual', 'evolucion', 'piramide', 'comparativa-provincia', 'comparativa-ccaa', 'comparativa-espana', 'derivados']
const ECO_ORDER = ['renta', 'gini', 'p80_p20', 'empresas', 'agrario', 'ganaderia']

function orderTables(tablas: ExportTable[], order: string[]): ExportTable[] {
  return [...tablas].sort((a, b) => {
    const ia = order.includes(a.id) ? order.indexOf(a.id) : order.length
    const ib = order.includes(b.id) ? order.indexOf(b.id) : order.length
    return ia - ib
  })
}

function generalPeriod(tablas: ExportTable[]): string {
  const years = tablas.flatMap((t) => t.periodo.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number)
  if (years.length === 0) return '—'
  return `${Math.min(...years)}–${Math.max(...years)}`
}

/** Hoja 00_Resumen: identificación breve + UNA línea legal. Sin trazabilidad. */
function writeResumen(
  wb: ExcelJS.Workbook,
  input: MunicipioWorkbookInput,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('00_Resumen', {
    properties: { tabColor: { argb: MINERAL } },
  })
  const nCols = 2
  paintTitle(ws, 1, nCols, `${XLSX_BRAND} — Libro municipal`, 14)
  const meta: [string, string][] = [
    ['Municipio', input.municipio],
    ['Código INE', input.codigoINE],
    ['Provincia', input.provincia],
    ['Comunidad autónoma', input.comunidadAutonoma],
    ['Generado', input.fechaGeneracion],
    ['Periodo general', generalPeriod([...input.demografia, ...input.economia])],
  ]
  let r = 3
  for (const [k, v] of meta) {
    const row = ws.getRow(r)
    row.getCell(1).value = k
    row.getCell(1).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: INK } }
    const val = row.getCell(2)
    val.value = v
    val.font = { name: FONT_NAME, size: 11, color: { argb: INK } }
    band(row, nCols, PAPER)
    r += 1
  }
  r += 1
  const legal = ws.getRow(r)
  legal.getCell(1).value = 'Fuentes y periodos específicos indicados en cada bloque.'
  legal.getCell(1).font = { name: FONT_NAME, size: 10, italic: true, color: { argb: MUTED } }
  const labels = meta.map(([k]) => k.length)
  const values = meta.map(([, v]) => v.length)
  ws.getColumn(1).width = Math.min(24, Math.max(16, Math.max(...labels) + 2))
  ws.getColumn(2).width = Math.min(24, Math.max(18, Math.max(...values) + 2))
  return ws
}

/** Hoja temática: TODOS los bloques del bloque apilados verticalmente.
 *  La columna A la domina el Año (10) cuando hay tablas anuales: las
 *  descriptivas usan wrap en vez de ensanchar. Sin altura fija en filas. */
function writeTema(
  wb: ExcelJS.Workbook,
  name: string,
  heading: string,
  tablas: ExportTable[],
  order: string[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: MINERAL } },
  })
  const ordered = orderTables(tablas, order)
  const firstCols = ordered.length > 0 ? ordered[0].columnas.length : 2
  paintTitle(ws, 1, firstCols, `${XLSX_BRAND} — ${heading}`, 14)
  let cursor = 3
  for (const t of ordered) {
    const placed = writeBlock(ws, cursor, t)
    cursor = placed.endRow + 2
  }
  // La columna A es del Año (10) cuando la hoja tiene tablas anuales: se impone
  // después de acumular, para que ningún Concepto la ensanche.
  if (ordered.some((t) => t.columnas[0] === 'Año')) {
    ws.getColumn(1).width = 10
  }
  return ws
}

export async function buildMunicipioWorkbook(input: MunicipioWorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = XLSX_BRAND
  wb.created = new Date()
  wb.modified = new Date()
  writeResumen(wb, input)
  writeTema(wb, '01_Demografía', `Demografía — ${input.municipio} (${input.codigoINE})`, input.demografia, DEMO_ORDER)
  writeTema(wb, '02_Economía', `Economía — ${input.municipio} (${input.codigoINE})`, input.economia, ECO_ORDER)
  // 03_Secciones censales: solo cuando existan datos reales (hoy nunca).
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
