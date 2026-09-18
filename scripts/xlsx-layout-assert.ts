// Comprobador de maquetación XLSX (nivel librería) compartido por los scripts de
// verificación. Relee un libro con ExcelJS y detecta truncado real:
//  - celdas de texto sin wrap que no caben en el ancho final de su columna (o de
//    su rango fusionado);
//  - celdas con wrap cuya altura de fila es insuficiente para las líneas que
//    Excel necesita dibujar (texto cortado verticalmente);
//  - columnas por encima del tope contractual de autoajuste (38);
//  - notas metodológicas largas (cursiva) sin fusionar en hojas temáticas, que
//    quedarían comprimidas en una sola columna.
//
// El modelo de ancho replica el del generador (Poppins sobreestima 1.2×, colchón
// de 2) para que la comprobación sea conservadora: si aquí pasa, no se corta.
import type ExcelJS from 'exceljs'

export const MAX_ALLOWED_COLUMN_WIDTH = 38
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
    const o = v as { text?: unknown; richText?: { text: string }[] }
    if (typeof o.text === 'string') return o.text
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('')
    if (v instanceof Date) return v.toISOString()
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

    const merges = (ws.model.merges ?? []) as unknown as MergeRange[]
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

    // Notas metodológicas largas (cursiva) en hojas temáticas: deben ir fusionadas
    // a lo ancho de la tabla; si no, quedan comprimidas en la columna A.
    if (/^0[1-7]_/.test(ws.name) && ws.columnCount > 1) {
      ws.eachRow((row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const text = cellText(cell)
          if (text.length <= 40) return
          if (!cell.font?.italic) return
          stats.notesChecked += 1
          if (!cell.isMerged) {
            problems.push({
              sheet: ws.name,
              row: rn,
              col: cn,
              kind: 'note-not-merged',
              detail: `nota larga sin fusionar: "${text.slice(0, 42)}…"`,
            })
          }
        })
      })
    }
  }

  return { problems, stats }
}
