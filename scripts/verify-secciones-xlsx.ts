// ============================================================================
// VALIDACIÓN DE LA EXPORTACIÓN DE SECCIONES CENSALES AL LIBRO XLSX
// ============================================================================
//
// QUÉ COMPRUEBA
//   Nivel librería, sin red, sin R2, sin Supabase. Construye un atlas sintético
//   con 3 secciones, 2 indicadores, 2 años, un valor observado, un ND
//   (`no_difundido`), un `sin_cobertura` y un polígono agregado de distrito
//   (`CUSEC` con `CSEC = 000`) que NO debe exportarse. Después:
//     1. el fixture pasa `validarSeccionesAtlas` del contrato congelado;
//     2. ND nunca es 0, ni en la fila ni en la celda del XLSX, y un 0 real sí
//        se conserva;
//     3. el agregado de distrito no aparece en ninguna fila ni en el archivo;
//     4. los ceros iniciales del `CUSEC` y del `CSEC` sobreviven a la escritura
//        y a la relectura;
//     5. las filas de "sin cobertura" existen y son explícitas;
//     6. el orden es estable entre dos llamadas;
//     7. se escribe un XLSX real en tmp/audit/ con los estilos IMA de
//        `socideas-xlsx.ts` y se relee para comprobar que la celda ND contiene el
//        texto "ND" y no un 0, que la clave de sección es texto y que ninguna
//        columna se queda en el ancho por defecto ni supera el tope de 42.
//
// GARANTÍAS QUE ESTE SCRIPT NO DEJA PASAR
//   - Un ND serializado como 0.
//   - Un 0 real degradado a ND.
//   - Un polígono agregado de distrito presentado como sección.
//   - Una clave de sección de 10 dígitos escrita como número (Excel borraría los
//     ceros iniciales y la clave dejaría de resolver contra el INE).
//   - Una columna sin ancho explícito (ancho por defecto = texto truncado).
//   - Una salida no determinista entre ejecuciones.
//
// USO
//   npx tsx scripts/verify-secciones-xlsx.ts
//
//   Archivos solo en tmp/audit/ (ignorado por git).
// ============================================================================

import ExcelJS from 'exceljs'
import { mkdirSync, readFileSync } from 'node:fs'
import {
  SECCIONES_ATLAS_SCHEMA,
  etiquetaEstado,
  esPoligonoDistrito,
  validarSeccionesAtlas,
  type SeccionIndicador,
  type SeccionObservacion,
  type SeccionValorStatus,
  type SeccionesAtlasV1,
} from '../src/lib/socideas-secciones'
import {
  SECCIONES_CAMPOS,
  SECCIONES_XLSX_UMBRAL_COMBINACIONES,
  construirTablaSecciones,
  estadoDesdeEtiqueta,
  filasSeccionesDesdeAtlas,
  celdasSecciones,
  filaEsNd,
  lineasProcedenciaSecciones,
  type SeccionFilaExport,
  type SeccionesTablaExport,
} from '../src/lib/socideas-secciones-xlsx'
// Estilos y paleta REALES del libro: este script maqueta lo mismo que
// `socideas-xlsx.ts`, no una imitación.
import { XLSX_PALETTE, colLetter } from '../src/lib/socideas-xlsx'

const OUT_DIR = 'tmp/audit'
const OUT_FILE = `${OUT_DIR}/secciones-xlsx-verificacion.xlsx`
const MUNI = '02007'
const VALOR_MUNICIPAL = 23_400

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

// ============================================================================
// Fixture sintético
// ============================================================================

const CUSEC_A = '0200701001' // distrito 01, sección 001
const CUSEC_B = '0200701002' // distrito 01, sección 002
const CUSEC_C = '0200702001' // distrito 02, sección 001
const CUSEC_DISTRITO = '0200701000' // agregado de distrito: NO es una sección

const RENTA: SeccionIndicador = {
  id: 'renta_neta_media_hogar',
  etiqueta: 'Renta neta media por hogar',
  tema: 'renta',
  operation: '37683',
  operationLabel: 'ADRH · renta neta media por hogar',
  sourceTable: '37683',
  sourceLabel: 'Renta neta por hogar',
  tableFamily: 'renta',
  url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=37683',
  unidad: 'euros',
  universo: 'Hogares de la sección censal',
  denominador: null,
  definicion: 'Renta neta media anual por hogar.',
  publicadoPorSeccion: true,
  etiquetaNoDifundido: 'ND',
}

const GINI: SeccionIndicador = {
  id: 'gini',
  etiqueta: 'Índice de Gini',
  tema: 'desigualdad',
  operation: '37683',
  operationLabel: 'ADRH · desigualdad',
  sourceTable: '37683',
  sourceLabel: 'Gini',
  tableFamily: 'gini',
  url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=37683',
  unidad: '%',
  universo: 'Hogares de la sección censal',
  denominador: 'Renta neta del hogar',
  definicion: 'Índice de Gini de la distribución de la renta.',
  publicadoPorSeccion: true,
  etiquetaNoDifundido: 'ND',
}

/** Indicador que el INE no difunde por sección: debe quedar excluido, no
 * |publisher| cubierto| de "sin cobertura". */
const NO_PUBLICADO: SeccionIndicador = {
  ...RENTA,
  id: 'poblacion_total_seccion',
  etiqueta: 'Población total por sección censal',
  publicadoPorSeccion: false,
}

function obs(
  sectionKey: string,
  indicatorId: string,
  referencePeriod: number,
  value: number | null,
  status: SeccionValorStatus,
  note: string | null = null,
): SeccionObservacion {
  return {
    sectionKey,
    municipalityIne: MUNI,
    geometryYear: 2025,
    referencePeriod,
    operation: '37683',
    sourceTable: '37683',
    indicatorId,
    dimensions: {},
    value,
    unit: indicatorId === GINI.id ? '%' : 'euros',
    denominator: indicatorId === GINI.id ? 'Renta neta del hogar' : null,
    status,
    sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=37683',
    publishedAt: null,
    retrievedAt: '2026-09-28T00:00:00.000Z',
    checksum: `sha256:${sectionKey}:${indicatorId}:${referencePeriod}`,
    methodologyNote: note,
  }
}

function feature(cusec: string, cdis: string, csec: string) {
  return {
    type: 'Feature' as const,
    properties: {
      CUSEC: cusec,
      CSEC: csec,
      CDIS: cdis,
      CUDIS: cdis,
      CUMUN: MUNI,
      CMUN: '02',
      CPRO: '02',
      NMUN: 'Alcalá del Júcar',
      NPRO: 'Albacete',
      TIPO: null,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    },
  }
}

/** Geometría PUBLICABLE: solo secciones. El contrato congelado rechaza un atlas
 *  que incluya el agregado de distrito, así que el atlas que se publica ya viene
 *  filtrado. */
const SECCIONES_PUBLICADAS = [feature(CUSEC_A, '01', '001'), feature(CUSEC_B, '01', '002'), feature(CUSEC_C, '02', '001')]

/** Geometría CRUDA tal y como la entrega la capa del INE: el agregado de
 *  distrito viaja en la MISMA colección que las secciones. Sirve para comprobar
 *  que la capa de exportación se defiende aunque el atlas no llegue filtrado. */
const SECCIONES_CRUDAS = [...SECCIONES_PUBLICADAS, feature(CUSEC_DISTRITO, '01', '000')]

function fixture(): SeccionesAtlasV1 {
  return {
    schemaVersion: SECCIONES_ATLAS_SCHEMA,
    municipalityIne: MUNI,
    municipalityName: 'Alcalá del Júcar',
    provinceName: 'Albacete',
    geometryYear: 2025,
    geometryCollection: 'Secciones_2025',
    geometrySource: 'OGC API Features del INE',
    geometryCrs: 'EPSG:4326',
    geometryRetrievedAt: '2026-09-20T00:00:00.000Z',
    statsRetrievedAt: '2026-09-21T00:00:00.000Z',
    indicators: [RENTA, GINI, NO_PUBLICADO],
    cobertura: [
      { indicatorId: RENTA.id, periodos: [2022, 2023], periodoPorDefecto: 2023, seccionesConDato: 1, seccionesSinDifundir: 1, seccionesSinCobertura: 1 },
      { indicatorId: GINI.id, periodos: [2023], periodoPorDefecto: 2023, seccionesConDato: 1, seccionesSinDifundir: 0, seccionesSinCobertura: 2 },
    ],
    sections: SECCIONES_PUBLICADAS,
    observations: {
      // A / renta: observado en 2022 y 2023.
      [CUSEC_A]: {
        [RENTA.id]: {
          '2022': obs(CUSEC_A, RENTA.id, 2022, 24_105.5, 'observado'),
          '2023': obs(CUSEC_A, RENTA.id, 2023, 25_980.25, 'observado', 'Dato observado en la tabla 37683.'),
        },
        [GINI.id]: { '2023': obs(CUSEC_A, GINI.id, 2023, 31.4, 'observado') },
      },
      // B / renta: la fuente oculta la celda (secreto estadístico) -> ND, no 0.
      [CUSEC_B]: {
        [RENTA.id]: { '2023': obs(CUSEC_B, RENTA.id, 2023, null, 'no_difundido') },
        [GINI.id]: { '2023': obs(CUSEC_B, GINI.id, 2023, 29.8, 'observado') },
      },
      // C no tiene ninguna fila: es la sección "sin cobertura".
    },
    municipalReference: { [RENTA.id]: VALOR_MUNICIPAL, gini: 30.1 },
    quality: {
      territoryMatch: 'exact',
      seccionesSinFila: [CUSEC_C],
      filasSinPoligono: [],
      poligonosInvalidos: [],
      poligonosVacios: [],
      poligonosMulti: [],
      clavesDuplicadas: [],
      hayDesfaseTemporal: false,
      notas: ['Fixture sintético para verificación; ningún dato real del INE.'],
      status: 'passed',
    },
    sourceChecksums: { '37683': 'sha256:fixture' },
    generatedAt: '2026-09-28T00:00:00.000Z',
    schemaChecksum: 'sha256:fixture-schema',
  }
}

// ============================================================================
// Maquetación mínima con los estilos IMA reales (espejo de `writeBlock`)
// ============================================================================

const FONT_NAME = 'Poppins'
const MAX_COL_WIDTH = 42
const MIN_COL_WIDTH = 10
const POPPINS_CHAR_FACTOR = 1.2
const CELL_WIDTH_PADDING = 2
const LINE_HEIGHT_BODY = 18
const ANCHO_POR_DEFECTO_EXCEL = 8.43

function anchoNecesario(text: string): number {
  const longest = text.split('\n').reduce((max, l) => Math.max(max, l.length), 0)
  return longest * POPPINS_CHAR_FACTOR + CELL_WIDTH_PADDING
}
function clamp(needed: number): number {
  return Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, needed)))
}
function lineas(texto: string, width: number): number {
  if (texto.length === 0) return 1
  const per = Math.max(1, (width - CELL_WIDTH_PADDING) / POPPINS_CHAR_FACTOR)
  return texto.split('\n').reduce((t, l) => t + Math.max(1, Math.ceil(l.length / per)), 0)
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}
const bordes = {
  top: { style: 'thin' as const, color: { argb: XLSX_PALETTE.limo } },
  left: { style: 'thin' as const, color: { argb: XLSX_PALETTE.limo } },
  bottom: { style: 'thin' as const, color: { argb: XLSX_PALETTE.limo } },
  right: { style: 'thin' as const, color: { argb: XLSX_PALETTE.limo } },
}

function formatoNumero(unidad: string): string {
  return unidad === '%' ? '0.00" %"' : '#,##0.00'
}

/** Escribe el bloque replicando las reglas de `socideas-xlsx.ts`:
 *  ND → celda Crisopa con texto "ND" y `numFmt = '@'`; el resto de texto → texto;
 *  números → numFmt por unidad; wrapText y altura calculada; anchos acotados a
 *  [10, 42]. */
async function escribirXlsxReal(tabla: SeccionesTablaExport): Promise<string> {
  const celdas = celdasSecciones(tabla.filas)
  const anchos = tabla.columnas.map((nombre, i) => {
    let max = anchoNecesario(nombre)
    for (const fila of celdas) max = Math.max(max, anchoNecesario(fila[i].text))
    return clamp(max)
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'SOCideas · verificación de secciones censales'
  wb.created = new Date('2026-09-28T00:00:00.000Z')
  wb.modified = new Date('2026-09-28T00:00:00.000Z')
  const ws = wb.addWorksheet('Secciones censales', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
  })

  // Fila 1: título. Fila 2: línea de fuente.
  const t = ws.getRow(1)
  t.getCell(1).value = tabla.titulo
  t.getCell(1).font = { name: FONT_NAME, size: 14, bold: true, color: { argb: XLSX_PALETTE.musgo } }
  t.height = 22
  const f = ws.getRow(2)
  f.getCell(1).value = `Fuente: ${tabla.fuente.organismo} · Geometría: seccionado ${tabla.fuente.anioGeometria} · Periodo: ${tabla.fuente.aniosEstadisticos.join(', ')}`
  f.getCell(1).font = { name: FONT_NAME, size: 10, color: { argb: XLSX_PALETTE.carbon } }
  f.height = 16

  // Fila 3: cabecera Crisopa.
  const header = ws.getRow(3)
  tabla.columnas.forEach((nombre, i) => {
    const c = header.getCell(i + 1)
    c.value = nombre
    c.fill = fill(XLSX_PALETTE.crisopa)
    c.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: XLSX_PALETTE.carbon } }
    c.border = { ...bordes }
    c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
  })
  header.height = 20

  // Datos.
  celdas.forEach((fila, r) => {
    const row = ws.getRow(4 + r)
    let maxLines = 1
    fila.forEach((celda, i) => {
      const campo = SECCIONES_CAMPOS[i]
      const c = row.getCell(i + 1)
      if (celda.nd || celda.texto) {
        c.value = celda.text
        c.numFmt = '@'
      } else {
        c.value = celda.numeric
        c.numFmt = campo === 'anio' ? '0' : formatoNumero(tabla.filas[r].unidad)
      }
      c.fill = fill(celda.nd ? XLSX_PALETTE.crisopa : XLSX_PALETTE.hueso)
      c.border = { ...bordes }
      c.font = {
        name: FONT_NAME,
        size: 11,
        bold: celda.nd,
        italic: campo === 'estado',
        color: { argb: XLSX_PALETTE.carbon },
      }
      c.alignment = { vertical: 'top', horizontal: campo === 'anio' ? 'right' : 'left', wrapText: true }
      maxLines = Math.max(maxLines, lineas(celda.text, anchos[i]))
    })
    row.height = Math.max(LINE_HEIGHT_BODY, maxLines * LINE_HEIGHT_BODY)
  })

  // Anchos explícitos: sin esto Excel usa 8.43 y el texto queda truncado.
  anchos.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  // Pie de procedencia.
  const pie = ws.getRow(4 + celdas.length + 1)
  pie.getCell(1).value = lineasProcedenciaSecciones(tabla.fuente).join(' · ')
  pie.getCell(1).font = { name: FONT_NAME, size: 10, italic: true, color: { argb: XLSX_PALETTE.carbon } }
  pie.getCell(1).alignment = { vertical: 'top', wrapText: true }

  await wb.xlsx.writeFile(OUT_FILE)
  return OUT_FILE
}

// ============================================================================
// Comprobaciones
// ============================================================================

function verificarContrato(atlas: SeccionesAtlasV1, tabla: SeccionesTablaExport): void {
  console.log('=== Contrato y contrato de datos ===')

  const val = validarSeccionesAtlas(atlas)
  check('el fixture pasa validarSeccionesAtlas', val.ok, val.errores.slice(0, 2).join(' | '))

  check('el polígono agregado de distrito es reconocido por el contrato', esPoligonoDistrito(CUSEC_DISTRITO), CUSEC_DISTRITO)

  const etiquetas = [etiquetaEstado('observado'), etiquetaEstado('no_difundido'), etiquetaEstado('sin_cobertura')]
  check(
    'las etiquetas de estado esperadas son las del contrato',
    etiquetas[0] === 'Observado' && etiquetas[1] === 'No difundido (ND / secreto estadístico)' && etiquetas[2] === 'Sin cobertura a nivel de sección',
    etiquetas.join(' / '),
  )

  check(
    'el indicador no publicado por sección queda excluido con motivo',
    tabla.indicadoresExcluidos.some((e) => e.indicadorId === NO_PUBLICADO.id && e.motivo.length > 0),
    tabla.indicadoresExcluidos.map((e) => e.indicadorId).join(', ') || 'sin exclusiones',
  )

  check(
    `umbral de volumen documentado y expuesto (${SECCIONES_XLSX_UMBRAL_COMBINACIONES})`,
    SECCIONES_XLSX_UMBRAL_COMBINACIONES === 25_000 && tabla.umbralCombinaciones === SECCIONES_XLSX_UMBRAL_COMBINACIONES,
  )

  check(
    'recuento de combinaciones coherente con las filas emitidas',
    tabla.combinacionesTotales === tabla.filasEmitidas && !tabla.truncado,
    `${tabla.combinacionesTotales} combinaciones, ${tabla.filasEmitidas} filas, truncado=${tabla.truncado}`,
  )
}

function verificarFilas(tabla: SeccionesTablaExport): void {
  console.log('\n=== Filas del bloque ===')
  const filas: SeccionFilaExport[] = tabla.filas

  check('el bloque trae filas', filas.length > 0, `${filas.length} filas`)

  // ND nunca es 0.
  const ndComoNumero = filas.filter((f) => filaEsNd(f) && typeof f.valor === 'number')
  check('ningún ND se emite con un número en la fila', ndComoNumero.length === 0, `${ndComoNumero.length} filas`)

  const nd = filas.find((f) => f.claveSeccion === CUSEC_B && f.indicadorId === RENTA.id)
  check(
    'la celda suprimida se exporta como ND con estado "no difundido"',
    !!nd && nd.valor === null && nd.estado === etiquetaEstado('no_difundido'),
    nd ? `${nd.claveSeccion}/${nd.indicadorId}: valor=${String(nd.valor)} estado="${nd.estado}"` : 'fila no encontrada',
  )

  // Un 0 real se conserva: la simetría de la regla.
  const conCero = fixture()
  conCero.observations[CUSEC_B][RENTA.id]['2023'] = obs(CUSEC_B, RENTA.id, 2023, 0, 'observado')
  const filaCero = filasSeccionesDesdeAtlas(conCero).find((f) => f.claveSeccion === CUSEC_B && f.indicadorId === RENTA.id)
  check(
    'un 0 publicado por la fuente se conserva como 0 (no se degrada a ND)',
    !!filaCero && filaCero.valor === 0 && filaCero.estado === etiquetaEstado('observado'),
    filaCero ? `valor=${String(filaCero.valor)} estado="${filaCero.estado}"` : 'fila no encontrada',
  )

  // Agregado de distrito fuera.
  check('el agregado de distrito no aparece como sección', filas.every((f) => !esPoligonoDistrito(f.claveSeccion)), `${filas.length} filas`)
  check(
    'el diagnóstico de la geometría publicable no registra agregados',
    tabla.diagnostico.agregadosDistritoExcluidos.length === 0 && tabla.diagnostico.seccionesPublicadas === 3,
    `${tabla.diagnostico.seccionesPublicadas} secciones publicadas`,
  )

  // Cobertura explícita.
  const sinCobertura = filas.filter((f) => f.estado === etiquetaEstado('sin_cobertura'))
  check(
    'las secciones sin estadística se exportan como "Sin cobertura a nivel de sección"',
    sinCobertura.length > 0,
    `${sinCobertura.length} filas (${sinCobertura.map((f) => f.claveSeccion).join(', ')})`,
  )
  check('sin cobertura nunca lleva un valor numérico', sinCobertura.every((f) => f.valor === null))
  check(
    'la sección sin fila en la capa aparece en el diagnóstico',
    tabla.diagnostico.seccionesSinFila.includes(CUSEC_C),
    tabla.diagnostico.seccionesSinFila.join(', ') || 'ninguna',
  )

  // Ceros iniciales.
  check(
    'el CUSEC conserva sus 10 dígitos y sus ceros iniciales',
    filas.every((f) => /^\d{10}$/.test(f.claveSeccion)) && filas.some((f) => f.claveSeccion === '0200701001'),
    filas[0]?.claveSeccion ?? 'sin filas',
  )
  check('la clave de sección se emite como string, nunca como número', filas.every((f) => typeof f.claveSeccion === 'string'))
  check('el CSEC conserva 3 dígitos con ceros iniciales', filas.every((f) => /^\d{3}$/.test(f.seccion)), [...new Set(filas.map((f) => f.seccion))].join(', '))

  // Determinismo.
  const segunda = filasSeccionesDesdeAtlas(fixture())
  check('dos llamadas sobre el mismo atlas devuelven filas idénticas', JSON.stringify(segunda) === JSON.stringify(filas), `${segunda.length} filas`)
  const porAnio = () => filasSeccionesDesdeAtlas(fixture(), { anio: 2023 })
  check('el filtro por año no altera el determinismo', JSON.stringify(porAnio()) === JSON.stringify(porAnio()), `${porAnio().length} filas`)

  const solo2022 = filasSeccionesDesdeAtlas(fixture(), { anio: 2022 })
  check(
    'un año sin dato NO se rellena con otro año (se marca sin cobertura)',
    solo2022.every((f) => f.anio === 2022) && solo2022.some((f) => f.claveSeccion === CUSEC_B && f.estado === etiquetaEstado('sin_cobertura')),
    `${solo2022.length} filas para 2022`,
  )

  check(
    'sin año pedido se usa el periodoPorDefecto del atlas',
    tabla.periodosPorIndicador[RENTA.id] === 2023 && tabla.periodosPorIndicador[GINI.id] === 2023,
    JSON.stringify(tabla.periodosPorIndicador),
  )

  check(
    'estadoDesdeEtiqueta hace round-trip con el contrato y es fail-closed',
    estadoDesdeEtiqueta(etiquetaEstado('sin_cobertura')) === 'sin_cobertura' && estadoDesdeEtiqueta('etiqueta inventada') === 'no_difundido',
  )

  // Nunca se reparte el valor municipal.
  check('el valor municipal no aparece como valor de sección', !filas.some((f) => f.valor === VALOR_MUNICIPAL), `municipal=${VALOR_MUNICIPAL}`)

  // Procedencia.
  check(
    'el bloque declara operación, tabla, geometría, periodo, universo, licencia, atribución y ND',
    tabla.fuente.operaciones.includes('37683') &&
      tabla.fuente.tablas.includes('37683') &&
      tabla.fuente.anioGeometria === 2025 &&
      tabla.fuente.aniosEstadisticos.join(',') === '2023' &&
      tabla.fuente.universo.length > 0 &&
      tabla.fuente.notaLicencia.length > 0 &&
      tabla.fuente.atribucionSeccionado.includes('Instituto Nacional de Estadística') &&
      tabla.fuente.semanticaNd.includes('nunca es 0'),
    tabla.fuente.atribucionSeccionado,
  )
  check('el pie de procedencia expone todas las claves de fuente', lineasProcedenciaSecciones(tabla.fuente).length >= 12)
}

/** Defensa ante la geometría CRUDA de la capa del INE.
 *
 *  El contrato congelado RECHAZA (`validarSeccionesAtlas` → error) un atlas que
 *  publique el agregado de distrito, es decir: el atlas que llega a la aplicación
 *  ya viene filtrado. Pero la capa WFS/OGC del INE sí entrega ese polígono en la
 *  misma colección que las secciones, así que la capa de exportación no puede
 *  confiar ciegamente: se comprueba que lo descarta y lo deja anotado. */
function verificarDefensaAgregadoDeDistrito(): void {
  console.log('\n=== Defensa ante el agregado de distrito ===')
  const crudo = fixture()
  crudo.sections = SECCIONES_CRUDAS

  const val = validarSeccionesAtlas(crudo)
  check(
    'el contrato rechaza un atlas que publique el agregado de distrito (filtro obligatorio en la ingesta)',
    !val.ok && val.errores.some((e) => e.includes(CUSEC_DISTRITO)),
    val.errores[0] ?? 'sin errores',
  )

  const tabla = construirTablaSecciones(crudo, {})
  check(
    'la exportación lo descarta aunque el atlas no llegue filtrado',
    tabla.filas.every((f) => !esPoligonoDistrito(f.claveSeccion)) && tabla.diagnostico.seccionesPublicadas === 3,
    `${tabla.filasEmitidas} filas de ${tabla.diagnostico.seccionesGeometria} polígonos`,
  )
  check(
    'el agregado descartado queda anotado en el diagnóstico',
    tabla.diagnostico.agregadosDistritoExcluidos.join(',') === CUSEC_DISTRITO,
    tabla.diagnostico.agregadosDistritoExcluidos.join(', ') || 'no anotado',
  )
  check(
    'descartarlo no cambia los datos de las secciones reales',
    JSON.stringify(tabla.filas) === JSON.stringify(construirTablaSecciones(fixture(), {}).filas),
    `${tabla.filasEmitidas} filas`,
  )
}

function verificarMarcadorTruncado(): void {
  console.log('\n=== Umbral de volumen ===')
  // 13.000 secciones × 2 indicadores = 26.000 combinaciones (> 25.000). El CSEC
  // va de 001 a 999 para que ningún polígono generado acabe en `000`, que es
  // exactamente la forma del agregado de distrito que hay que excluir.
  const grande = fixture()
  const secciones = 13_000
  const porDistrito = 999
  grande.sections = Array.from({ length: secciones }, (_, i) => {
    const distrito = String(1 + Math.floor(i / porDistrito)).padStart(2, '0')
    const csec = String(1 + (i % porDistrito)).padStart(3, '0')
    return feature(`${MUNI}${distrito}${csec}`, distrito, csec)
  })
  const tabla = construirTablaSecciones(grande, {})
  check(
    'el municipio sintético supera el umbral sin falsos agregados',
    tabla.diagnostico.seccionesPublicadas === secciones && tabla.diagnostico.agregadosDistritoExcluidos.length === 0,
    `${tabla.diagnostico.seccionesPublicadas}/${secciones} secciones`,
  )
  check(
    'un municipio que supera el umbral queda marcado como truncado, con recuento exacto',
    tabla.truncado && tabla.combinacionesTotales === secciones * 2,
    `${tabla.combinacionesTotales} combinaciones (${tabla.filasEmitidas} filas emitidas)`,
  )
  check('el truncado nunca descarta datos', tabla.filasEmitidas === tabla.combinacionesTotales, `${tabla.filasEmitidas}/${tabla.combinacionesTotales}`)
  check(
    'la nota de la hoja avisa del umbral y propone CSV',
    tabla.nota.includes('Volumen por encima del umbral') && tabla.nota.includes('CSV'),
  )
}

// ============================================================================
// Relectura del XLSX real
// ============================================================================

function textoCelda(c: ExcelJS.Cell): string {
  const v = c.value as unknown
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as { text?: unknown; result?: unknown }
    if (typeof o.text === 'string') return o.text
    if (typeof o.result === 'string') return o.result
    return ''
  }
  return v === null || v === undefined ? '' : String(v)
}

async function verificarXlsxReal(tabla: SeccionesTablaExport): Promise<void> {
  console.log('\n=== XLSX real (lectura de vuelta) ===')
  mkdirSync(OUT_DIR, { recursive: true })
  const archivo = await escribirXlsxReal(tabla)
  const buffer = readFileSync(archivo)
  check('el archivo se ha escrito y tiene firma ZIP', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${archivo} · ${buffer.length} B`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  check('la hoja existe y tiene filas', !!ws && ws.rowCount > 3, `${ws?.rowCount ?? 0} filas`)

  const header = ws.getRow(3)
  check(
    'la cabecera coincide con las columnas del bloque',
    header.getCell(1).text === tabla.columnas[0] && header.getCell(tabla.columnas.length).text === tabla.columnas[tabla.columnas.length - 1],
    `${tabla.columnas[0]} … ${tabla.columnas[tabla.columnas.length - 1]}`,
  )

  const colClave = tabla.columnas.indexOf('Clave de sección (CUSEC)') + 1
  const colSeccion = tabla.columnas.indexOf('Sección (CSEC)') + 1
  const colValor = tabla.columnas.indexOf('Valor') + 1
  const colEstado = tabla.columnas.indexOf('Estado') + 1
  const colAnio = tabla.columnas.indexOf('Año de referencia') + 1

  const primera = 4
  const ultima = 3 + tabla.filas.length
  let ndTextuales = 0
  let incidencias = 0
  let cerosIniciales = 0
  let clavesComoTexto = 0

  for (let r = primera; r <= ultima; r += 1) {
    const fila = tabla.filas[r - primera]
    const clave = ws.getRow(r).getCell(colClave)
    const csec = ws.getRow(r).getCell(colSeccion)
    const anio = ws.getRow(r).getCell(colAnio)
    const valor = ws.getRow(r).getCell(colValor)

    if (/^\d{10}$/.test(textoCelda(clave)) && textoCelda(clave).startsWith('0')) cerosIniciales += 1
    if (clave.numFmt === '@' && typeof clave.value === 'string') clavesComoTexto += 1
    if (/^\d{3}$/.test(textoCelda(csec)) && textoCelda(csec).startsWith('0')) cerosIniciales += 1
    if (anio.numFmt === '0' && anio.value === fila.anio) cerosIniciales += 1

    if (filaEsNd(fila)) {
      const texto = textoCelda(valor)
      if (texto === 'ND' || texto === 'Sin cobertura') ndTextuales += 1
      if (typeof valor.value === 'number') incidencias += 1
      if (valor.numFmt !== '@') incidencias += 1
    } else if (valor.value !== fila.valor) {
      incidencias += 1
    }
    // El estado viaja siempre junto al valor: sin él, ND y 0 serían indistinguibles.
    if (textoCelda(ws.getRow(r).getCell(colEstado)) !== fila.estado) incidencias += 1
  }

  check('ningún ND se ha serializado como 0 en el XLSX', incidencias === 0, `${incidencias} incidencias`)
  check('las celdas ND se han escrito como texto "ND"/"Sin cobertura"', ndTextuales > 0, `${ndTextuales} celdas ND`)
  check('los ceros iniciales sobreviven a la escritura y a la relectura', cerosIniciales >= tabla.filas.length, `${cerosIniciales} comprobaciones`)
  check('la clave de sección está escrita como celda de texto', clavesComoTexto === tabla.filas.length, `${clavesComoTexto}/${tabla.filas.length}`)

  const indiceNd = tabla.filas.findIndex((f) => f.claveSeccion === CUSEC_B && f.indicadorId === RENTA.id)
  const celdaNd = ws.getRow(primera + indiceNd).getCell(colValor)
  check(
    'la celda concreta del ND contiene el texto "ND" y no un número',
    indiceNd >= 0 && celdaNd.numFmt === '@' && typeof celdaNd.value !== 'number' && textoCelda(celdaNd) === 'ND',
    `valor releído=${JSON.stringify(celdaNd.value)} numFmt=${String(celdaNd.numFmt)} fill=${String((celdaNd.fill as ExcelJS.FillPattern)?.fgColor?.argb)}`,
  )
  check('la celda ND va pintada con Crisopa', (celdaNd.fill as ExcelJS.FillPattern)?.fgColor?.argb === XLSX_PALETTE.crisopa, XLSX_PALETTE.crisopa)

  // Anchos: ninguno por defecto (texto truncado) ni por encima del tope.
  const porDefecto: string[] = []
  const porEncima: string[] = []
  for (let c = 1; c <= tabla.columnas.length; c += 1) {
    const w = ws.getColumn(c).width ?? 0
    if (w <= ANCHO_POR_DEFECTO_EXCEL + 0.01) porDefecto.push(`${colLetter(c)}=${w}`)
    if (w > MAX_COL_WIDTH + 0.01) porEncima.push(`${colLetter(c)}=${w}`)
  }
  check('ninguna columna se queda en el ancho por defecto de Excel', porDefecto.length === 0, porDefecto.join(' ') || `${tabla.columnas.length} columnas con ancho explícito`)
  check(`ninguna columna supera el tope de ${MAX_COL_WIDTH} caracteres`, porEncima.length === 0, porEncima.join(' ') || 'ok')

  let alturasCortas = 0
  for (let r = primera; r <= ultima; r += 1) {
    if ((ws.getRow(r).height ?? 0) < LINE_HEIGHT_BODY) alturasCortas += 1
  }
  check('ninguna fila de datos se queda sin altura legible', alturasCortas === 0, `${alturasCortas} filas`)

  let agregadoEnArchivo = 0
  for (let r = primera; r <= ultima; r += 1) {
    if (esPoligonoDistrito(textoCelda(ws.getRow(r).getCell(colClave)))) agregadoEnArchivo += 1
  }
  check('el agregado de distrito no está escrito en el XLSX', agregadoEnArchivo === 0, `${agregadoEnArchivo} filas`)
}

// ============================================================================

async function main(): Promise<void> {
  const atlas = fixture()
  const tabla = construirTablaSecciones(atlas, {})

  console.log('=== Exportación de secciones censales al XLSX ===')
  verificarContrato(atlas, tabla)
  verificarFilas(tabla)
  verificarDefensaAgregadoDeDistrito()
  verificarMarcadorTruncado()
  await verificarXlsxReal(tabla)

  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — exportación de secciones censales`)
  if (failures > 0) process.exit(1)
  console.log(`Bloque verificado: ${tabla.filasEmitidas} filas, ${tabla.columnas.length} columnas (última ${colLetter(tabla.columnas.length)}).`)
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
