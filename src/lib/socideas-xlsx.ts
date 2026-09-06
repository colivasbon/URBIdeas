// Libro XLSX municipal SOCideas — SOLO SERVIDOR.
// Este módulo importa `exceljs` y NUNCA debe importarse desde un Client Component
// (ni directa ni transitivamente): la dependencia queda fuera del bundle cliente.
// Genera un libro .xlsx REAL con estilos corporativos: no CSV disfrazado ni HTML.
// Tipografía: Poppins no está garantizada en el entorno Excel del destinatario;
// se usa Calibri como fallback explícito y documentado (sin fuentes incrustadas).
import ExcelJS from 'exceljs'
import type { Exclusion, ExportTable } from './socideas-export'

export const XLSX_BRAND = 'Ideas Sostenibilidad · SOCideas'

/** Verde mineral corporativo + auxiliares (misma paleta que el informe imprimible). */
const MINERAL = 'FF1E4D3F'
const MINERAL_LIGHT = 'FFEFF4F1'
const WHITE = 'FFFFFFFF'
const INK = 'FF1F2A26'
const MUTED = 'FF5B6B62'
const HAIRLINE = 'FFCBD5D1'

const FONT_NAME = 'Calibri'

export interface MunicipioWorkbookInput {
  municipio: string
  codigoINE: string
  provincia: string
  comunidadAutonoma: string
  fechaGeneracion: string
  demografia: ExportTable[]
  economia: ExportTable[]
  excluidasDemografia: Exclusion[]
  excluidasEconomia: Exclusion[]
  excluidasSecciones: Exclusion[]
}

function band(row: ExcelJS.Row, fill: string): void {
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
}

function paintTitle(ws: ExcelJS.Worksheet, rowN: number, nCols: number, text: string): void {
  const row = ws.getRow(rowN)
  row.height = 24
  ws.mergeCells(rowN, 1, rowN, nCols)
  const c = row.getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: WHITE } }
  c.alignment = { vertical: 'middle' }
  band(row, MINERAL)
  for (let i = 2; i <= nCols; i += 1) {
    const filler = row.getCell(i)
    filler.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MINERAL } }
  }
}

function paintMeta(ws: ExcelJS.Worksheet, rowN: number, nCols: number, text: string): void {
  const row = ws.getRow(rowN)
  row.height = 16
  ws.mergeCells(rowN, 1, rowN, nCols)
  const c = row.getCell(1)
  c.value = text
  c.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: MUTED } }
  c.alignment = { vertical: 'middle', wrapText: true }
}

/** Formato numérico por semántica de la cabecera. Años como entero. */
function numFmtFor(header: string): string | null {
  if (header === 'Año') return '0'
  if (header.includes('€')) return '#,##0 "€"'
  if (header.includes('%')) return '0.0" %"'
  return '#,##0'
}

function paintHeaderRow(row: ExcelJS.Row): void {
  row.height = 18
  row.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: WHITE } }
  row.alignment = { vertical: 'middle' }
  band(row, MINERAL)
  row.border = { bottom: { style: 'thin', color: { argb: HAIRLINE } } }
}

/**
 * Escribe UNA tabla (título + meta + cabecera + filas). Devuelve la fila de
 * cabecera para filtros/freeze. Regla de integridad: `numeric === null` se
 * escribe como TEXTO (ND/—), jamás como 0.
 */
function writeTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  t: ExportTable,
): { headerRow: number; endRow: number; nCols: number } {
  const nCols = t.columnas.length
  const titleRow = ws.getRow(startRow)
  titleRow.height = 18
  ws.mergeCells(startRow, 1, startRow, nCols)
  const title = titleRow.getCell(1)
  title.value = t.titulo
  title.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: INK } }
  paintMeta(ws, startRow + 1, nCols, `Fuente: ${t.fuente} · Periodo: ${t.periodo} · Cobertura: ${t.cobertura} · Estado: ${t.estado}`)
  const headerRowN = startRow + 2
  const header = ws.getRow(headerRowN)
  t.columnas.forEach((col, i) => {
    const c = header.getCell(i + 1)
    c.value = col
    c.alignment = { vertical: 'middle', horizontal: col === 'Año' ? 'center' : i === 0 ? 'left' : 'right' }
  })
  paintHeaderRow(header)
  let r = headerRowN
  t.filas.forEach((fila, fi) => {
    r += 1
    const row = ws.getRow(r)
    row.height = 15
    fila.forEach((cell, ci) => {
      const c = row.getCell(ci + 1)
      const colName = t.columnas[ci]
      const align = colName === 'Año' ? 'center' : ci === 0 ? 'left' : 'right'
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
      c.alignment = { vertical: 'middle', horizontal: align, wrapText: ci === 0 }
    })
    if (fi % 2 === 1) band(row, MINERAL_LIGHT)
  })
  return { headerRow: headerRowN, endRow: r, nCols }
}

function fitColumns(ws: ExcelJS.Worksheet, nCols: number, maxRows: number): void {
  for (let ci = 1; ci <= nCols; ci += 1) {
    let longest = 10
    for (let r = 1; r <= Math.min(maxRows, ws.rowCount); r += 1) {
      const v = ws.getRow(r).getCell(ci).value
      const len = v === null || v === undefined ? 0 : String(typeof v === 'object' ? '' : v).length
      if (len > longest) longest = len
    }
    ws.getColumn(ci).width = Math.min(46, Math.max(14, longest + 2))
  }
}

/** Hoja de bloque (01/02): título corporativo + tablas apiladas con filtros. */
function writeBlockSheet(
  wb: ExcelJS.Workbook,
  name: string,
  heading: string,
  meta: string,
  tablas: ExportTable[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: MINERAL } },
    views: [{ state: 'frozen', ySplit: 0, xSplit: 0 }],
  })
  const nCols = Math.max(2, ...tablas.map((t) => t.columnas.length))
  paintTitle(ws, 1, nCols, `${XLSX_BRAND} — ${heading}`)
  paintMeta(ws, 2, nCols, meta)
  let cursor = 4
  let firstHeader = 0
  tablas.forEach((t, ti) => {
    const placed = writeTable(ws, cursor, t)
    if (ti === 0) {
      firstHeader = placed.headerRow
      ws.autoFilter = {
        from: { row: placed.headerRow, column: 1 },
        to: { row: placed.endRow, column: placed.nCols },
      }
    }
    cursor = placed.endRow + 2
  })
  if (firstHeader > 0) {
    ws.views = [{ state: 'frozen', ySplit: firstHeader, xSplit: 0 }]
  }
  fitColumns(ws, nCols, cursor)
  return ws
}

/** Hoja 00_Resumen: trazabilidad completa + exclusiones. Sin números inventados. */
function writeResumenSheet(wb: ExcelJS.Workbook, input: MunicipioWorkbookInput): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('00_Resumen', {
    properties: { tabColor: { argb: MINERAL } },
    views: [{ state: 'frozen', ySplit: 3, xSplit: 0 }],
  })
  const nCols = 8
  paintTitle(ws, 1, nCols, `${XLSX_BRAND} — Libro municipal`)
  paintMeta(ws, 2, nCols, `Municipio: ${input.municipio} (${input.codigoINE}) · Generado: ${input.fechaGeneracion}`)
  const metaRows: [string, string][] = [
    ['Municipio', input.municipio],
    ['Código INE', input.codigoINE],
    ['Provincia', input.provincia],
    ['Comunidad autónoma', input.comunidadAutonoma],
    ['Fecha de generación', input.fechaGeneracion],
    ['Bloques incluidos', ['00_Resumen', input.demografia.length > 0 ? '01_Demografía' : null, input.economia.length > 0 ? '02_Economía' : null].filter(Boolean).join(', ')],
  ]
  let r = 4
  for (const [k, v] of metaRows) {
    const row = ws.getRow(r)
    row.getCell(1).value = k
    row.getCell(1).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: INK } }
    ws.mergeCells(r, 2, r, nCols)
    const val = row.getCell(2)
    val.value = v
    val.font = { name: FONT_NAME, size: 11, color: { argb: INK } }
    if (r % 2 === 0) band(row, MINERAL_LIGHT)
    r += 1
  }
  r += 1
  const section = (text: string): void => {
    ws.mergeCells(r, 1, r, nCols)
    const row = ws.getRow(r)
    row.height = 18
    const c = row.getCell(1)
    c.value = text
    c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: WHITE } }
    band(row, MINERAL)
    r += 1
  }
  const head = (cols: string[]): void => {
    const row = ws.getRow(r)
    cols.forEach((col, i) => {
      const c = row.getCell(i + 1)
      c.value = col
      c.alignment = { horizontal: 'left', vertical: 'middle' }
    })
    paintHeaderRow(row)
    r += 1
  }
  const body = (cells: (string | number)[]): void => {
    const row = ws.getRow(r)
    cells.forEach((val, i) => {
      const c = row.getCell(i + 1)
      c.value = val
      c.font = { name: FONT_NAME, size: 11, color: { argb: INK } }
      c.alignment = { vertical: 'middle', wrapText: true }
    })
    if (r % 2 === 1) band(row, MINERAL_LIGHT)
    r += 1
  }
  section('Tablas incluidas (solo datos reales)')
  const incluidasHeaderRow = r
  head(['Bloque', 'Tabla', 'Fuente', 'Período', 'Cobertura', 'Estado', 'Incluida', 'Observación'])
  for (const t of input.demografia) {
    body(['Demografía', t.titulo, t.fuente, t.periodo, t.cobertura, t.estado, 'Sí', `${t.filas.length} filas`])
  }
  for (const t of input.economia) {
    body(['Economía', t.titulo, t.fuente, t.periodo, t.cobertura, t.estado, 'Sí', `${t.filas.length} filas`])
  }
  r += 1
  section('Tablas no incluidas por falta de cobertura (no se rellenan con valores)')
  head(['Bloque', 'Tabla / hoja', 'Fuente', 'Período', 'Cobertura', 'Estado', 'Incluida', 'Observación'])
  const noAplica = 'No aplica'
  for (const e of input.excluidasDemografia) {
    body(['Demografía', e.titulo, noAplica, noAplica, noAplica, noAplica, 'No', e.motivo])
  }
  for (const e of input.excluidasEconomia) {
    body(['Economía', e.titulo, noAplica, noAplica, noAplica, noAplica, 'No', e.motivo])
  }
  for (const e of input.excluidasSecciones) {
    body(['Secciones censales', e.titulo, noAplica, noAplica, noAplica, noAplica, 'No', e.motivo])
  }
  r += 1
  section('Limitaciones')
  const lim = ws.getRow(r)
  ws.mergeCells(r, 1, r, nCols)
  lim.getCell(1).value = 'La ausencia de dato nunca equivale a 0. Cada tabla conserva su fuente y periodo de referencia. Los periodos de distintos bloques no deben leerse como contemporáneos sin indicarlo.'
  lim.getCell(1).font = { name: FONT_NAME, size: 10, italic: true, color: { argb: MUTED } }
  lim.getCell(1).alignment = { wrapText: true, vertical: 'middle' }
  lim.height = 30
  ws.autoFilter = { from: { row: incluidasHeaderRow, column: 1 }, to: { row: incluidasHeaderRow, column: 8 } }
  fitColumns(ws, nCols, r)
  ws.getColumn(3).width = Math.min(60, Math.max(ws.getColumn(3).width ?? 14, 30))
  ws.getColumn(8).width = Math.min(60, Math.max(ws.getColumn(8).width ?? 14, 30))
  return ws
}

/** Hoja de bloque sin tablas exportables: mensaje claro no numérico + referencia a 00. */
function writeEmptyBlockSheet(
  wb: ExcelJS.Workbook,
  name: string,
  heading: string,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: MINERAL } },
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
  })
  paintTitle(ws, 1, 2, `${XLSX_BRAND} — ${heading}`)
  const row = ws.getRow(3)
  ws.mergeCells(3, 1, 3, 2)
  const c = row.getCell(1)
  c.value = 'Sin tablas exportables en este bloque para el municipio. Ver hoja 00_Resumen (trazabilidad y exclusiones). Ningún valor se rellena con ceros.'
  c.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: MUTED } }
  c.alignment = { wrapText: true, vertical: 'middle' }
  row.height = 30
  ws.getColumn(1).width = 60
  ws.getColumn(2).width = 30
  return ws
}

export async function buildMunicipioWorkbook(input: MunicipioWorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = XLSX_BRAND
  wb.created = new Date()
  wb.modified = new Date()
  writeResumenSheet(wb, input)
  if (input.demografia.length > 0) {
    writeBlockSheet(
      wb, '01_Demografía', `Tablas de Demografía — ${input.municipio} (${input.codigoINE})`,
      `Fuentes y periodos por tabla · Generado: ${input.fechaGeneracion}`,
      input.demografia,
    )
  } else {
    writeEmptyBlockSheet(wb, '01_Demografía', `Tablas de Demografía — ${input.municipio} (${input.codigoINE})`)
  }
  if (input.economia.length > 0) {
    writeBlockSheet(
      wb, '02_Economía', `Tablas de Economía — ${input.municipio} (${input.codigoINE})`,
      `Fuentes y periodos por tabla · Generado: ${input.fechaGeneracion}`,
      input.economia,
    )
  } else {
    writeEmptyBlockSheet(wb, '02_Economía', `Tablas de Economía — ${input.municipio} (${input.codigoINE})`)
  }
  // 03_Secciones censales: solo cuando existan datos reales (hoy nunca: va a exclusiones).
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
