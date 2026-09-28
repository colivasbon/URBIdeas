import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { leerAtlasParaApi } from '@/lib/socideas-secciones-store'
import {
  construirTablaSecciones,
  lineasProcedenciaSecciones,
  celdasSecciones,
  filaEsNd,
  SECCIONES_XLSX_UMBRAL_COMBINACIONES,
  type SeccionCeldaExport,
} from '@/lib/socideas-secciones-xlsx'

export const dynamic = 'force-dynamic'

const Workbook = ExcelJS.Workbook

/** Paleta IMA (mismos valores que `socideas-xlsx.ts`). */
const MUSGO = 'FF3E665C'
const CONIFERA = 'FF86B73D'
const HUESO = 'FFF1F1F1'
const CARBON = 'FF3C403E'
const LIMO = 'FFB0BDB0'
const CRISOPA = 'FFC2E189'
const FONT = 'Poppins'

function logStage(stage: string, extra: Record<string, unknown> = {}): void {
  console.info(
    JSON.stringify({ tag: 'SOCIDEAS_SECCIONES_XLSX', stage, ts: new Date().toISOString(), ...extra }),
  )
}

function toAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 90)
}

/** Escribe el bloque de datos como tabla de Excel con anchos y wrap calculados. */
function escribirHojaSecciones(
  wb: ExcelJS.Workbook,
  titulo: string,
  filas: ReturnType<typeof celdasSecciones>,
  columnas: string[],
  procedencia: string[],
  truncado: boolean,
  combinacionesTotales: number,
): { filasEscritas: number; anchoTotal: number } {
  const ws = wb.addWorksheet(titulo, { properties: { tabColor: { argb: MUSGO } } })

  ws.mergeCells(1, 1, 1, Math.max(1, columnas.length))
  const t1 = ws.getCell(1, 1)
  t1.value = titulo
  t1.font = { name: FONT, size: 14, bold: true, color: { argb: MUSGO } }
  t1.alignment = { vertical: 'middle' }

  ws.mergeCells(2, 1, 2, Math.max(1, columnas.length))
  const t2 = ws.getCell(2, 1)
  t2.value = procedencia.join(' · ')
  t2.font = { name: FONT, size: 9, color: { argb: CARBON } }
  t2.alignment = { vertical: 'top', wrapText: true }
  ws.getRow(2).height = 46

  // Cabecera
  const headerRow = 4
  columnas.forEach((col, i) => {
    const c = ws.getCell(headerRow, i + 1)
    c.value = col
    c.font = { name: FONT, size: 10, bold: true, color: { argb: HUESO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUSGO } }
    c.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' }
    c.border = { top: { style: 'thin', color: { argb: LIMO } } }
  })
  ws.getRow(headerRow).height = 30

  // Datos
  let maxLines = 1
  filas.forEach((fila, r) => {
    const excelRow = headerRow + 1 + r
    let alto = 18
    fila.forEach((celda: SeccionCeldaExport, i) => {
      const c = ws.getCell(excelRow, i + 1)
      if (celda.numeric !== null && celda.numeric !== undefined) {
        c.value = celda.numeric
        c.numFmt = '#,##0.00'
      } else {
        c.value = celda.text
        // Las claves (CUSEC/CSEC) son TEXTO: con numFmt '@' conservan los ceros.
        if (celda.texto) c.numFmt = '@'
      }
      c.font = { name: FONT, size: 10, color: { argb: CARBON } }
      c.alignment = { vertical: 'top', wrapText: true }
      c.border = { bottom: { style: 'hair', color: { argb: LIMO } } }
      if (celda.nd) {
        // ND: relleno Crisopa y texto explícito. JAMÁS un 0.
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CRISOPA } }
        c.font = { name: FONT, size: 10, bold: true, color: { argb: MUSGO } }
      }
      const len = (celda.text ?? '').length
      if (len > 40) maxLines = Math.max(maxLines, Math.ceil(len / 40))
    })
    alto = Math.max(18, maxLines * 14)
    ws.getRow(excelRow).height = alto
  })

  // Anchos calculados a partir del contenido, con tope y mínimo (mismo criterio
  // que `socideas-xlsx.ts`): ninguna columna se queda en el ancho por defecto.
  columnas.forEach((col, i) => {
    let max = col.length
    for (const fila of filas) {
      const v = fila[i]?.text ?? ''
      if (v.length > max) max = v.length
    }
    const w = Math.round(Math.min(46, Math.max(12, max * 0.9 + 2)))
    ws.getColumn(i + 1).width = w
  })

  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }]
  if (filas.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + filas.length, column: columnas.length },
    }
  }
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    printTitlesRow: `${headerRow}:${headerRow}`,
  }

  if (truncado) {
    const r = headerRow + filas.length + 2
    ws.mergeCells(r, 1, r, Math.max(1, columnas.length))
    const c = ws.getCell(r, 1)
    c.value =
      `Aviso: ${combinacionesTotales.toLocaleString('es-ES')} combinaciones superan el umbral de ` +
      `${SECCIONES_XLSX_UMBRAL_COMBINACIONES.toLocaleString('es-ES')}. Se exportan TODAS las filas, ` +
      'pero para un uso cómodo conviene filtrar por indicador y año.'
    c.font = { name: FONT, size: 9, italic: true, color: { argb: CONIFERA } }
    c.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = 30
  }

  return { filasEscritas: filas.length, anchoTotal: columnas.length }
}

/** GET /api/socideas/secciones-descarga/[codigoINE]: XLSX de datos seccionales.
 *
 *  Es una DESCARGA DE DATOS, no una captura. El PNG es una imagen; este
 *  fichero es la tabla verificable con una fila por sección, indicador y año.
 *  Un ND viaja como texto "ND"/"Sin cobertura" con relleno Crisopa, nunca como 0.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  if (!/^\d{5}$/.test((codigoINE ?? '').trim())) {
    return NextResponse.json({ error: 'Código INE inválido' }, { status: 400 })
  }
  const ine = codigoINE.trim()

  const anioParam = request.nextUrl.searchParams.get('anio')
  const anioCrudo = anioParam ? Number.parseInt(anioParam, 10) : null
  const opciones = {
    anio:
      anioCrudo !== null && Number.isInteger(anioCrudo) && anioCrudo >= 1900 && anioCrudo <= 2100
        ? anioCrudo
        : undefined,
    indicadorId: request.nextUrl.searchParams.get('ind') ?? undefined,
  }

  const atlas = await leerAtlasParaApi(ine, { anio: opciones.anio }).catch(() => null)
  if (!atlas) {
    return NextResponse.json(
      { error: `No hay datos seccionales publicados para ${ine}` },
      { status: 404 },
    )
  }
  logStage('atlas_leido', { ine, secciones: atlas.sections.length, anio: opciones.anio ?? null })

  const tabla = construirTablaSecciones(atlas, opciones)
  // `construirTablaSecciones` ya entrega la procedencia completa y validada
  // (organismo, operaciones, tablas, geometría, periodos, universo, ND,
  // granularidad, licencia y atribución). No se reconstruye aquí para no
  // divergir de lo que el módulo garantiza.
  const procedencia = lineasProcedenciaSecciones(tabla.fuente)

  const celdas = celdasSecciones(tabla.filas)
  const wb = new Workbook()
  wb.creator = 'SOCideas'
  wb.created = new Date()

  const titulo = `Secciones censales ${atlas.municipalityName} (${ine})`
  escribirHojaSecciones(
    wb,
    titulo.slice(0, 31),
    celdas,
    tabla.columnas,
    procedencia,
    tabla.truncado,
    tabla.combinacionesTotales,
  )

  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  if (buffer.byteLength < 1000) {
    logStage('buffer_sospechoso', { bytes: buffer.byteLength })
    return NextResponse.json({ error: 'No se pudo generar el fichero' }, { status: 500 })
  }

  const raw = `SOCideas_Secciones_${ine}_${opciones.indicadorId ?? 'todos'}_${opciones.anio ?? 'defecto'}`
  const filename = `${toAscii(raw)}.xlsx`
  const disposition = `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  logStage('escrito', {
    ine,
    bytes: buffer.byteLength,
    filas: tabla.filas.length,
    nd: tabla.filas.filter(filaEsNd).length,
    truncado: tabla.truncado,
  })

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
