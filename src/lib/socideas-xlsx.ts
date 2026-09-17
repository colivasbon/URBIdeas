// Libro XLSX municipal SOCideas — SOLO SERVIDOR.
// Este módulo importa `exceljs` y NUNCA debe importarse desde un Client Component
// (ni directa ni transitivamente): la dependencia queda fuera del bundle cliente.
//
// Libro municipal comparativo: EXACTAMENTE nueve hojas en orden contractual,
// bloques apilados verticalmente, sin hojas detalladas, sin enlaces internos,
// sin autofilter, sin freeze panes, sin mergeCells (fusionar desde A1 anula el
// ancho de la columna 1 en ExcelJS: verificado empíricamente).
// Tipografía: Poppins en todas las celdas (título 14 > header sección 12 >
// cabecera 11 bold > dato 11). NOTA: si el lector no tiene Poppins instalada,
// Excel/LibreOffice la sustituye por la fuente del sistema (limitación del formato).
import ExcelJS from 'exceljs'
import {
  SOCIDEAS_SHEET_IDS,
  type ComparisonMode,
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
import {
  buildCentrosEducativosTable,
  buildDemographicDerivedLayerTable,
  buildDensidadTable,
  buildMovilidadMigratoriaTable,
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
// Utilidades de pintado — sin mergeCells, bandas terminadas en nCols
// ============================================================================

/** Rellena SOLO las celdas 1..nCols: jamás filas enteras ni celdas vacías. */
function band(row: ExcelJS.Row, nCols: number, fill: string): void {
  for (let i = 1; i <= nCols; i += 1) {
    row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  }
}

/** Banda de título (header de sección): fondo Musgo, texto Hueso. */
function paintTitle(ws: ExcelJS.Worksheet, rowN: number, nCols: number, text: string, size = 12): void {
  const row = ws.getRow(rowN)
  row.height = 24
  for (let i = 1; i <= nCols; i += 1) {
    const c = row.getCell(i)
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } }
    c.border = { bottom: { style: 'thin', color: { argb: CONIFERA } } }
    if (i === 1) {
      c.value = text
      c.font = { name: FONT_NAME, size, bold: true, color: { argb: HUESO } }
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    } else {
      // Extensión de banda sin texto: fuente explícita para que TODA celda
      // pintada sea Poppins (nunca la Calibri por defecto del formato).
      c.font = { name: FONT_NAME, size: 11, color: { argb: HUESO } }
    }
  }
}

/** Línea de procedencia: texto gris pequeño en la columna A y, si existe una
 *  fuente pública atribuible, un enlace discreto de botón-editorial en la misma
 *  fila y en la ÚLTIMA columna real del bloque. */
function paintSourceLine(
  ws: ExcelJS.Worksheet,
  rowN: number,
  nCols: number,
  source: SourceReference | null | undefined,
  fuente: string,
  periodo: string,
): void {
  const row = ws.getRow(rowN)
  row.height = 16
  const c = row.getCell(1)
  c.value = visibleSourceLabel(source, fuente, periodo)
  c.font = { name: FONT_NAME, size: 10, color: { argb: CARBON } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const url = source?.publicUrl
  if (nCols < 2 || !url || !isAllowedSourceUrl(url)) return

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

/** Límites estrictos por rol. Ninguna columna temática supera 24. */
export function columnLimitsFor(header: string, isFirst: boolean, tableId?: string): [number, number] {
  if (header === 'Año') return [10, 10]
  if (header.includes('€')) return [15, 17]
  if (header.includes('%')) return [13, 13]
  if (header === 'hab./km²' || header.includes('hab./km²')) return [13, 15]
  if (tableId === 'gini' || tableId === 'p80_p20') return [12, 14]
  if (header === 'Grupo de edad') return [12, 15]
  if (header === 'Concepto' || header === 'Especie' || header === 'Indicador') return [16, 22]
  if (header === 'Nivel educativo' || header === 'Arraigo territorial' || header === 'Nacionalidad') return [18, 22]
  if (header === 'Categoría de país publicada' || header === 'País de nacimiento') return [18, 22]
  if (isFirst) return [18, 22]
  if (['España', 'CCAA', 'Provincia', 'Municipio'].includes(header)) return [12, 15]
  return [11, 12]
}

function cellTextLength(text: string, numeric: number | null, header: string): number {
  if (numeric !== null && Number.isFinite(numeric)) {
    return String(numeric).length + (header.includes('€') || header.includes('%') || header.includes('hab./km²') ? 2 : 0)
  }
  return text.length
}

/** Texto izquierda, año centro, números derecha. Encabezado igual que celdas. */
export function cellAlign(header: string, isFirst: boolean): 'left' | 'center' | 'right' {
  if (header === 'Año') return 'center'
  if (isFirst) return 'left'
  return 'right'
}

/** Cabecera de columna: fondo Crisopa, texto Carbón, bordes finos Limo. */
function paintHeaderRow(row: ExcelJS.Row, nCols: number): void {
  row.height = 20
  const borders = thinLimoBorders()
  for (let i = 1; i <= nCols; i += 1) {
    const c = row.getCell(i)
    c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CRISOPA } }
    c.border = { ...borders }
  }
}

/** Ancho por rol desde el contenido real de LA tabla (nunca de otras tablas). */
function applyTableWidths(
  ws: ExcelJS.Worksheet,
  tableId: string | undefined,
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
    if (w === 9) w = 10
    const prev = ws.getColumn(ci + 1).width ?? 0
    ws.getColumn(ci + 1).width = Math.max(prev, w)
  })
}

// ============================================================================
// Bloque: tabla de datos reales (con o sin fuente)
// ============================================================================

function writeDataBlock(ws: ExcelJS.Worksheet, startRow: number, t: ExportTable): {
  headerRow: number; endRow: number; nCols: number
} {
  const columnas = t.columnas
  const nCols = columnas.length
  if (nCols === 0) return { headerRow: startRow, endRow: startRow, nCols: 0 }

  paintTitle(ws, startRow, nCols, t.titulo)
  paintSourceLine(ws, startRow + 1, nCols, t.source, t.fuente, t.periodo)
  const headerRowN = startRow + 2
  const header = ws.getRow(headerRowN)
  columnas.forEach((col, i) => {
    const c = header.getCell(i + 1)
    c.value = col
    c.alignment = { vertical: 'middle', horizontal: cellAlign(col, i === 0) }
  })
  paintHeaderRow(header, nCols)

  let r = headerRowN
  t.filas.forEach((fila) => {
    r += 1
    const row = ws.getRow(r)
    row.height = 18
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
      c.alignment = {
        vertical: 'middle',
        horizontal: cellAlign(colName, ci === 0),
        wrapText: ci === 0,
        indent: ci === 0 ? 1 : undefined,
      }
    })
  })

  if (t.note && r >= headerRowN) {
    r += 1
    const noteRow = ws.getRow(r)
    noteRow.height = 28
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

  applyTableWidths(
    ws,
    t.id,
    columnas,
    t.filas.map((f) => f.map((c) => ({ text: c.text, numeric: c.numeric }))),
  )
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
function writeNoteBlock(ws: ExcelJS.Worksheet, startRow: number, t: ExportTable): {
  endRow: number; nCols: number
} {
  const nCols = 1
  paintTitle(ws, startRow, nCols, t.titulo)
  paintSourceLine(ws, startRow + 1, nCols, t.source, t.fuente, t.periodo)
  const r = startRow + 2
  const row = ws.getRow(r)
  row.height = 36
  const cell = row.getCell(1)
  cell.value = t.note ?? t.estado
  cell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: CARBON } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
  band(row, nCols, CRISOPA)
  row.getCell(1).border = { ...thinLimoBorders() }
  // Nota metodológica: ancho máximo 24 (regla contractual), con wrap.
  const minW = 24
  const prev = ws.getColumn(1).width ?? 0
  if (prev < minW) ws.getColumn(1).width = minW
  return { endRow: r, nCols }
}

// ============================================================================
// Línea de ámbito por hoja
// ============================================================================

function writeScopeLine(
  ws: ExcelJS.Worksheet,
  rowN: number,
  nCols: number,
  input: Pick<MunicipioWorkbookInput, 'municipio' | 'codigoINE' | 'provincia' | 'comunidadAutonoma'>,
): void {
  const row = ws.getRow(rowN)
  const c = row.getCell(1)
  c.value =
    `Municipio: ${input.municipio} (${input.codigoINE}) · ` +
    `Provincia: ${input.provincia} · ` +
    `Comunidad autónoma: ${input.comunidadAutonoma}`
  c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  if (nCols > 1) {
    const rest = row.getCell(2)
    rest.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HUESO } }
    rest.border = { bottom: { style: 'thin', color: { argb: LIMO } } }
    rest.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
  }
}

// ============================================================================
// Hoja 00_PROYECTO
// ============================================================================

interface ProjectBlock {
  label: string
  value: string
}

function writeProyecto(wb: ExcelJS.Workbook, input: MunicipioWorkbookInput, hojas: ComparativeSheetInput[]): void {
  const ws = wb.addWorksheet('00_PROYECTO', { properties: { tabColor: { argb: MUSGO } } })
  const nCols = 2
  paintTitle(ws, 1, nCols, XLSX_BRAND, 14)

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
    row.height = 18
    const lbl = row.getCell(1)
    lbl.value = label
    lbl.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
    lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    const val = row.getCell(2)
    val.value = value
    val.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    val.alignment = { vertical: 'middle', wrapText: true }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      row.getCell(i).border = { ...thinLimoBorders() }
    }
    r += 1
  }

  r += 1
  ws.getRow(r - 1).height = 20
  paintTitle(ws, r, nCols, 'Hojas del libro', 12)
  r += 2
  for (const hoja of hojas) {
    const row = ws.getRow(r)
    row.height = 18
    const lbl = row.getCell(1)
    lbl.value = hoja.id
    lbl.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: CARBON } }
    lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    const val = row.getCell(2)
    val.value = hoja.titulo
    val.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    val.alignment = { vertical: 'middle' }
    band(row, nCols, HUESO)
    for (let i = 1; i <= nCols; i += 1) {
      row.getCell(i).border = { ...thinLimoBorders() }
    }
    if (hoja.subtitulo) {
      r += 1
      const sub = ws.getRow(r)
      const subVal = sub.getCell(1)
      subVal.value = hoja.subtitulo
      subVal.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
      subVal.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      const subVal2 = sub.getCell(2)
      subVal2.value = hoja.bloques.length + ' bloques'
      subVal2.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: CARBON } }
      subVal2.alignment = { vertical: 'middle', horizontal: 'right' }
      band(sub, nCols, HUESO)
    }
    r += 1
  }

  r += 1
  ws.getRow(r - 1).height = 20
  paintTitle(ws, r, nCols, 'Criterio metodológico', 12)
  r += 2
  const nota = ws.getRow(r)
  nota.height = 36
  const notaCell = nota.getCell(1)
  notaCell.value =
    'Solo se muestran comparativas cuando las fuentes, períodos y definiciones son homogéneos entre ámbitos.'
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
  ws.getColumn(1).width = Math.min(24, Math.max(20, 22))
  ws.getColumn(2).width = Math.min(24, Math.max(20, 24))
}

// ============================================================================
// Hoja temática: apila bloques (data o nota breve)
// ============================================================================

function writeSheet(wb: ExcelJS.Workbook, input: ComparativeSheetInput, ctx: MunicipioWorkbookInput): void {
  const ws = wb.addWorksheet(input.id, { properties: { tabColor: { argb: MUSGO } } })
  const maxCols = Math.max(1, ...input.bloques.map((b) => b.columnas.length || 1))
  paintTitle(ws, 1, maxCols, input.titulo, 14)
  writeScopeLine(ws, 2, maxCols, ctx)
  ws.getRow(3).height = 20
  let cursor = 4
  for (const bloque of input.bloques) {
    try {
      const isNote =
        bloque.availability === 'pending_integration' ||
        bloque.availability === 'not_available' ||
        bloque.filas.length === 0
      const endRow = isNote
        ? writeNoteBlock(ws, cursor, bloque).endRow
        : writeDataBlock(ws, cursor, bloque).endRow
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
  // Año compacto si la hoja contiene series anuales.
  const hayAnyo = input.bloques.some(
    (b) => b.filas.length > 0 && b.columnas[0] === 'Año',
  )
  if (hayAnyo) {
    ws.getColumn(1).width = Math.min(ws.getColumn(1).width ?? 10, 10)
  }
}

// ============================================================================
// Hoja 08_CRITERIOS_Y_FUENTES
// ============================================================================

interface CriteriosFuentesInput {
  bloques: ExportTable[]
  fuentes: { area: string; fuente: string; operacion: string; periodo: string; url?: string | null }[]
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

function writeCriteriosFuentes(wb: ExcelJS.Workbook, input: CriteriosFuentesInput): void {
  const ws = wb.addWorksheet('08_CRITERIOS_Y_FUENTES', { properties: { tabColor: { argb: MUSGO } } })
  const nCols = 2
  paintTitle(ws, 1, nCols, XLSX_BRAND, 14)
  writeScopeLine(ws, 2, nCols, {
    municipio: 'Criterios y fuentes',
    codigoINE: '—',
    provincia: '—',
    comunidadAutonoma: '—',
  })

  paintTitle(ws, 4, nCols, 'Criterios de lectura', 12)
  ws.getRow(5).height = 20
  let r = 6
  for (const c of CRITERIOS_LECTURA) {
    const row = ws.getRow(r)
    row.height = 18
    const cell = row.getCell(1)
    cell.value = `• ${c}`
    cell.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
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

  paintTitle(ws, r, nCols, 'Fuentes oficiales utilizadas', 12)
  r += 2
  const headerRowN = r
  const header = ws.getRow(headerRowN)
  const fuentesCols = ['Área', 'Fuente principal', 'Operación / tabla', 'Último período']
  fuentesCols.forEach((col, i) => {
    const c = header.getCell(i + 1)
    c.value = col
    c.alignment = { vertical: 'middle', horizontal: cellAlign(col, i === 0) }
  })
  paintHeaderRow(header, fuentesCols.length)
  let fr = headerRowN
  for (const f of input.fuentes) {
    fr += 1
    const row = ws.getRow(fr)
    row.height = 18
    row.getCell(1).value = f.area
    row.getCell(3).value = f.operacion
    row.getCell(4).value = f.periodo
    const fuenteCell = row.getCell(2)
    if (f.url && isAllowedSourceUrl(f.url)) {
      fuenteCell.value = { text: f.fuente, hyperlink: f.url, tooltip: 'Abrir ficha oficial' }
      fuenteCell.font = {
        name: FONT_NAME,
        size: 11,
        color: { argb: CONIFERA },
        underline: true,
        bold: true,
      }
    } else {
      fuenteCell.value = f.fuente
      fuenteCell.font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    }
    row.getCell(1).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    row.getCell(3).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    row.getCell(4).font = { name: FONT_NAME, size: 11, color: { argb: CARBON } }
    for (let i = 1; i <= 4; i += 1) {
      row.getCell(i).alignment = {
        vertical: 'middle',
        horizontal: cellAlign(fuentesCols[i - 1] ?? '', i === 1),
        wrapText: i === 1,
        indent: i === 1 ? 1 : undefined,
      }
      row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HUESO } }
      row.getCell(i).border = { ...thinLimoBorders() }
    }
  }
  applyTableWidths(
    ws,
    'criterios-fuentes',
    fuentesCols,
    input.fuentes.map((f) => [
      { text: f.area, numeric: null },
      { text: f.fuente, numeric: null },
      { text: f.operacion, numeric: null },
      { text: f.periodo, numeric: null },
    ]),
  )
  ws.getColumn(1).width = Math.min(22, Math.max(18, ws.getColumn(1).width ?? 0))
  ws.getColumn(2).width = Math.min(22, Math.max(18, ws.getColumn(2).width ?? 0))
  ws.getColumn(3).width = Math.min(22, Math.max(20, ws.getColumn(3).width ?? 0))
  ws.getColumn(4).width = 12
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
  fuentes: { area: string; fuente: string; operacion: string; periodo: string; url?: string | null }[]
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
      titulo: `${XLSX_BRAND} — ${info.titulo}`,
      subtitulo: info.subtitulo,
      bloques: sheetsById.get(id) ?? [],
    })
  }

  // Fuentes centralizadas
  const fuentes: { area: string; fuente: string; operacion: string; periodo: string; url?: string | null }[] = []
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
  writeProyecto(wb, input, hojas)
  for (const hoja of hojas) {
    try {
      writeSheet(wb, hoja, input)
    } catch (sheetErr) {
      console.error(JSON.stringify({
        tag: 'SOCIDEAS_XLSX_SHEET_SKIP',
        sheetId: hoja.id,
        error: sheetErr instanceof Error ? sheetErr.message : String(sheetErr),
      }))
    }
  }
  writeCriteriosFuentes(wb, { bloques: [], fuentes })

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// Re-exports para compat con tests previos
export { registrySource, INE_INSTITUTION, AEAT_EDM_IRPF }
export type { ComparisonMode }
