// Comprobador de maquetación XLSX (nivel librería) compartido por los scripts de
// verificación. Relee un libro con ExcelJS y detecta truncado real:
//  - celdas de texto sin wrap que no caben en el ancho final de su columna (o de
//    su rango fusionado);
//  - celdas con wrap cuya altura de fila es insuficiente para las líneas que
//    Excel necesita dibujar (texto cortado verticalmente);
//  - columnas por encima del tope contractual de autoajuste (42 en el contrato
//    `socideas-book@2`; constante espejo de `MAX_COL_WIDTH` del escritor);
//  - notas metodológicas largas (cursiva) de un bloque MULTICOLUMNA sin fusionar,
//    que quedarían comprimidas en una sola columna. Las notas de bloques de una
//    sola columna no exigen fusión: ya ocupan todo el ancho de su bloque.
//
// El modelo de ancho replica el del generador (Poppins sobreestima 1.2×, colchón
// de 2) para que la comprobación sea conservadora: si aquí pasa, no se corta.
//
// Contrato v2: las celdas pueden llevar fórmula con resultado cacheado
// (`{ formula, result }`); `cellText` lee ese resultado para no omitirlas del
// chequeo de truncado.
import type ExcelJS from 'exceljs'

export const MAX_ALLOWED_COLUMN_WIDTH = 42
const POPPINS_CHAR_FACTOR = 1.2
const CELL_WIDTH_PADDING = 2
/** Altura mínima por línea envelopada (puntos). Conservador (< generador). */
const MIN_WRAP_LINE_HEIGHT = 12

export interface LayoutProblem {
  sheet: string
  row: number
  col: number
  kind: string
  detail: string
}

export interface LayoutStats {
  cellsChecked: number
  mergedMasters: number
  wrappedCells: number
  notesChecked: number
}

function naturalWidth(text: string): number {
  const longest = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  return longest * POPPINS_CHAR_FACTOR + CELL_WIDTH_PADDING
}

function charsPerLine(width: number): number {
  return Math.max(1, (width - CELL_WIDTH_PADDING) / POPPINS_CHAR_FACTOR)
}

function linesFor(text: string, width: number): number {
  if (text.length === 0) return 1
  const per = charsPerLine(width)
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / per)), 0)
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown
  if (v && typeof v === 'object') {
    const o = v as { text?: unknown; richText?: { text: string }[]; result?: unknown }
    if (typeof o.text === 'string') return o.text
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('')
    if (v instanceof Date) return v.toISOString()
    // Celda de fórmula (contrato v2): el texto visible es el resultado cacheado.
    if (typeof o.result === 'number') return String(o.result)
    if (typeof o.result === 'string') return o.result
    return ''
  }
  return v === null || v === undefined ? '' : String(v)
}

interface MergeRange {
  top: number
  left: number
  bottom: number
  right: number
}

/** Letra de columna A1 → índice 1-based (A=1, Z=26, AA=27…). */
function colFromLetters(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

/** Convierte "A1:B1" en un rango; null si no es un rango válido. */
function parseMergeRef(ref: string): MergeRange | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return null
  return {
    left: colFromLetters(m[1]),
    top: parseInt(m[2], 10),
    right: colFromLetters(m[3]),
    bottom: parseInt(m[4], 10),
  }
}

/** ExcelJS devuelve `model.merges` como cadenas A1:B1 (según versión puede ser
 *  un objeto de rango). Se normalizan ambos casos: si no, las celdas fusionadas
 *  se omitían y el truncado en títulos/notas pasaba desapercibido. */
function readMerges(ws: ExcelJS.Worksheet): MergeRange[] {
  const raw = (ws.model.merges ?? []) as unknown[]
  const out: MergeRange[] = []
  for (const r of raw) {
    if (typeof r === 'string') {
      const parsed = parseMergeRef(r)
      if (parsed) out.push(parsed)
    } else if (r && typeof r === 'object') {
      const o = r as Partial<MergeRange>
      if (
        typeof o.top === 'number' &&
        typeof o.left === 'number' &&
        typeof o.bottom === 'number' &&
        typeof o.right === 'number'
      ) {
        out.push({ top: o.top, left: o.left, bottom: o.bottom, right: o.right })
      }
    }
  }
  return out
}

/** ¿La fila anterior a `rn` tiene contenido más allá de la columna A? Si no,
 *  la nota pertenece a un bloque de una sola columna y no procede fusionarla. */
function previousRowIsWider(ws: ExcelJS.Worksheet, rn: number): boolean {
  if (rn <= 1) return false
  const prev = ws.getRow(rn - 1)
  for (let ci = 2; ci <= ws.columnCount; ci += 1) {
    if (cellText(prev.getCell(ci)).length > 0) return true
  }
  return false
}

export function findLayoutProblems(wb: ExcelJS.Workbook): {
  problems: LayoutProblem[]
  stats: LayoutStats
} {
  const problems: LayoutProblem[] = []
  const stats: LayoutStats = { cellsChecked: 0, mergedMasters: 0, wrappedCells: 0, notesChecked: 0 }

  for (const ws of wb.worksheets) {
    const widths: number[] = []
    for (let ci = 1; ci <= ws.columnCount; ci += 1) {
      widths[ci - 1] = ws.getColumn(ci).width ?? 8.43
      if (widths[ci - 1] > MAX_ALLOWED_COLUMN_WIDTH + 0.01) {
        problems.push({
          sheet: ws.name,
          row: 0,
          col: ci,
          kind: 'column-too-wide',
          detail: `C${ci}=${widths[ci - 1]} > ${MAX_ALLOWED_COLUMN_WIDTH}`,
        })
      }
    }

    const merges = readMerges(ws)
    const masterByTopLeft = new Map<string, MergeRange>()
    for (const m of merges) masterByTopLeft.set(`${m.top}:${m.left}`, m)

    ws.eachRow((row, rn) => {
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const text = cellText(cell)
        if (text.length === 0) return
        const master = masterByTopLeft.get(`${rn}:${cn}`)
        if (cell.isMerged && !master) return // celda hija de una fusión: la valida el master
        stats.cellsChecked += 1
        if (master) stats.mergedMasters += 1
        let capacity = widths[cn - 1] ?? 8.43
        if (master) {
          capacity = 0
          for (let c = master.left; c <= master.right; c += 1) capacity += widths[c - 1] ?? 8.43
        }
        const wrap = cell.alignment?.wrapText === true
        const need = naturalWidth(text)
        if (!wrap && need > capacity + 0.5) {
          problems.push({
            sheet: ws.name,
            row: rn,
            col: cn,
            kind: 'overflow',
            detail: `sin wrap no cabe ("${text.slice(0, 42)}…": ${need.toFixed(1)} > ${capacity.toFixed(1)})`,
          })
        }
        if (wrap) {
          stats.wrappedCells += 1
          const lines = linesFor(text, capacity)
          const height = row.height ?? 15
          const minHeight = lines * MIN_WRAP_LINE_HEIGHT
          if (height + 0.5 < minHeight) {
            problems.push({
              sheet: ws.name,
              row: rn,
              col: cn,
              kind: 'row-height',
              detail: `altura ${height} < ${minHeight} (${lines} líneas): "${text.slice(0, 42)}…"`,
            })
          }
        }
      })
    })

    // Notas metodológicas largas (cursiva) en hojas temáticas: en un bloque
    // multicolumna deben ir fusionadas a lo ancho de la tabla; si no, quedan
    // comprimidas en una sola columna. Una nota de un bloque de UNA columna ya
    // ocupa todo el ancho del bloque: no se exige fusión (contrato v2: las
    // columnas "Estado"/"Motivo"/"Siguiente acción" también son cursivas y no
    // son notas).
    if (/^(0[1-9]|10)_/.test(ws.name) && ws.columnCount > 1) {
      ws.eachRow((row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const text = cellText(cell)
          if (text.length <= 40) return
          if (!cell.font?.italic) return
          stats.notesChecked += 1
          if (cell.isMerged) return
          let aloneInRow = true
          row.eachCell({ includeEmpty: false }, (other, otherCn) => {
            if (otherCn !== cn && cellText(other).length > 0) aloneInRow = false
          })
          if (!aloneInRow) return
          // Bloque de una sola columna (fila anterior solo en la columna A): la
          // nota ocupa el ancho completo de su bloque.
          if (!previousRowIsWider(ws, rn)) return
          problems.push({
            sheet: ws.name,
            row: rn,
            col: cn,
            kind: 'note-not-merged',
            detail: `nota larga sin fusionar: "${text.slice(0, 42)}…"`,
          })
        })
      })
    }
  }

  return { problems, stats }
}
