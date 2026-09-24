// Verificación del generador XLSX municipal SOCideas a nivel de librería.
//
// Contrato `socideas-book@2` (11 hojas):
//   - Tres escenarios sintéticos (rico / solo-eco / parcial) por el adaptador
//     v1→v2 (`buildMunicipioWorkbook`): 11 hojas en orden contractual, freeze
//     panes en TODAS, autofilter o tabla nativa en cada hoja, enlaces internos
//     de navegación, ND sin ceros indebidos, sin truncado y anchos ≤42.
//   - Un escenario de pipeline v2 real (`assembleSocideasBookV2` +
//     `buildSocideasBookXlsx`) que exige las prestaciones del contrato completo:
//     tablas Excel nativas (≥10), gráficos nativos (≥3), fórmulas auditables
//     (>0), enlaces internos (≥8) y reconciliaciones sin desviación.
//
// CAMBIO DE CONTRATO (v2): "exactamente nueve hojas", "sin freeze", "sin
// autofilter", "sin enlaces internos", "sin celdas fusionadas", "Año = 10" y el
// resumen "breve sin trazabilidad" quedan SUPERSEDIDOS. El libro v2 exige
// freeze, tablas con filtro, navegación interna, fusiones de título/fuente/nota
// (para no truncar) y columna A unificada con tope de 42 caracteres.
//
// Uso: npx tsx scripts/verify-municipio-xlsx.ts
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { writeFileSync, readFileSync } from 'node:fs'
import { buildDemografiaTables, buildEconomiaTables } from '../src/lib/socideas-export'
import {
  buildMunicipioWorkbook,
  buildSocideasBookXlsx,
  XLSX_BRAND,
  type LegacyComparativeSheetInput,
} from '../src/lib/socideas-xlsx'
import { assembleSocideasBookV2, type SocideasBookInputV2 } from '../src/lib/socideas-book-blocks'
import { SOCIDEAS_BOOK_SHEET_IDS } from '../src/lib/socideas-book-contract'
import { findLayoutProblems, MAX_ALLOWED_COLUMN_WIDTH } from './xlsx-layout-assert'
import type { IndicatorValue } from '../src/lib/socideas'
import type { DemographicPresentationData } from '../src/lib/socideas-demographic-summary'
import type { MunicipalIneLayersV1 } from '../src/lib/socideas-ine-layers'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function v(slug: string, anio: number, valor: number | null, ambito = 'municipio'): IndicatorValue {
  return {
    id: `${slug}-${anio}-${ambito}`,
    municipio_codigo_ine: '99999',
    indicator_id: slug,
    fecha_referencia: `${anio}-01-01`,
    anio_referencia: anio,
    valor_numerico: valor,
    valor_texto: null,
    unidad: 'personas',
    dimensiones: { ambito },
    source_id: 'ine',
    source_url: 'https://www.ine.es/',
    source_table_id: '9999',
    source_series_id: null,
    obtenido_en: '2026-09-06',
    estado_validacion: 'validado',
    indicator: { id: slug, slug, nombre: slug, grupo: 'test', descripcion: null, unidad: null, metodologia: null, fuente_principal_id: null, periodicidad: null, visualizacion_recomendada: null, activo: true },
    source: { id: 'ine', slug: 'ine_tempus3', organismo: 'INE', nombre: 'Cifras oficiales', descripcion: null, url_base: null, api_table_id: null, licencia: null, frecuencia_actualizacion: null, activo: true },
  } as unknown as IndicatorValue
}

const MUNI = { codigo_ine: '99999', nombre: 'Villa Real de Prueba', poblacion: 5000, provincia: 'Provincia Test', provincia_codigo_ine: '99', comunidad_autonoma: 'CCAA Test', centroide_lng: null, centroide_lat: null }

/** Pirámide coherente con el total de 5.000 (incluye un cero real de recuento:
 *  cero legítimo de pirámide que nunca debe confundirse con un suprimido). */
function piramideRica(): { tramo: string; hombres: number; mujeres: number }[] {
  return [
    { tramo: '0-4', hombres: 0, mujeres: 390 },
    { tramo: '15-19', hombres: 200, mujeres: 190 },
    { tramo: '30-34', hombres: 800, mujeres: 750 },
    { tramo: '65-69', hombres: 600, mujeres: 650 },
    { tramo: '85+', hombres: 700, mujeres: 720 },
  ]
}

function demoRica() {
  return {
    municipio: MUNI, sincronizado: true, ultima_sincronizacion: null,
    total: v('population_total', 2024, 5000),
    hombres: v('population_male', 2024, 2480),
    mujeres: v('population_female', 2024, 2520),
    evolucion: [2020, 2021, 2022, 2023, 2024].map((a, i) => v('population_evolution', a, 4800 + i * 50)),
    comparativas: {
      provincia: [2020, 2021, 2022, 2023, 2024].map((a, i) => ({ ...v('population_total', a, 400000 + i * 1000, 'provincia'), dimensiones: { ambito: 'provincia', nombre: 'Provincia Test' } })),
      ccaa: [], espana: [],
    },
    piramide: { anio: 2024, grupos: piramideRica() },
    derivados: { cambio_5y: null, cambio_10y: null, indice_envejecimiento: 98.5, indice_dependencia: 52.1 },
    densidad: { valor: null, pendiente: 'x' }, valores: [], disponibles: {}, filtros: {},
  }
}

function demoParcial() {
  return {
    ...demoRica(),
    hombres: v('population_male', 2024, null),
    mujeres: v('population_female', 2024, null),
    evolucion: [2022, 2023, 2024].map((a, i) => v('population_evolution', a, 4900 + i * 50)),
    comparativas: { provincia: [], ccaa: [], espana: [] },
    piramide: { anio: null, grupos: [] },
    derivados: { cambio_5y: null, cambio_10y: null, indice_envejecimiento: null, indice_dependencia: null },
  }
}

function ecoFull() {
  return {
    municipio: MUNI, sincronizado: true, ultima_sincronizacion: null,
    valores: [
      v('renta_neta_media_persona', 2022, 12100), v('renta_neta_media_persona', 2023, 12500),
      v('renta_neta_media_hogar', 2023, 30200),
      v('gini', 2022, 30.8), v('gini', 2023, 31.2), v('p80_p20', 2023, 5.4),
      v('empresas_total', 2025, 320), v('empresas_industria', 2025, 40),
      v('empresas_servicios', 2025, 200), v('empresas_comercio_hosteleria', 2025, 90),
      v('agr_sau_total', 2020, 1500), v('agr_explotaciones', 2020, 45),
      v('gan_bovino_exp', 2020, 3), v('gan_bovino_cab', 2020, null),
    ],
    ultimoPorIndicador: {}, disponibles: [],
  }
}

/** Capas dimensionales laterales (nacionalidad, nacimiento y arraigo). */
function demoExtraFull(): DemographicPresentationData {
  return {
    nationality: {
      period: '2025', total: 5000, spanish: 4200, foreign: 800,
      spanishPercent: 84, foreignPercent: 16, status: 'observed',
      source: { label: 'INE', tableId: '68535' },
    },
    birthCountry: {
      period: '2025', spain: { label: 'España', value: 4200, status: 'observed' },
      topCountries: [{ label: 'Rumanía', value: 200, status: 'observed' }],
      status: 'observed', source: { label: 'INE', tableId: '66322' }, note: '',
    },
    birthResidenceRelation: {
      period: '2025', total: 5000,
      categories: [
        { key: 'sameMunicipality', label: 'Mismo municipio', value: 3000, percent: 60, status: 'observed' },
        { key: 'bornAbroad', label: 'Extranjero', value: 800, percent: 16, status: 'observed' },
      ],
      status: 'observed', source: { label: 'INE', tableId: '68540' },
    },
  }
}

/** Capas INE laterales (educación censal y derivados demográficos). */
function ineLayersFull(): MunicipalIneLayersV1 {
  return {
    schemaVersion: 'municipal-ine-layers-v1',
    ineCode: '99999', municipalityName: 'Villa Real de Prueba', generatedAt: '2026-09-24',
    layers: {
      education: {
        period: '2021', censusYear: 2021,
        total: {
          primaryOrBelow: { value: 1500, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          lowerSecondary: { value: 1200, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          upperSecondaryPostSecondary: { value: 1100, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          higher: { value: 900, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          notApplicableUnder15: { value: 600, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
        },
        status: 'observed',
      },
      demographicDerived: {
        density: { value: 23.4, unit: 'hab./km²', status: 'observed', source: 'INE', tableId: '2855', period: '2024', derived: true },
        meanAge: { value: 42.1, unit: 'años', status: 'observed', source: 'INE', tableId: '2855', period: '2024', derived: true },
      },
    },
    quality: { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'passed' },
  }
}

const txt = (val: unknown): string => String((val as { value?: unknown })?.value ?? val ?? '')
const fillOf = (c: ExcelJS.Cell): string | undefined => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
const isGreen = (c: ExcelJS.Cell): boolean => {
  const font = c.font as ExcelJS.Font | undefined
  return fillOf(c) === 'FF3E665C' && font?.bold === true && font?.color?.argb === 'FFFFFFFF'
}
const isHeaderCell = (c: ExcelJS.Cell): boolean => fillOf(c) === 'FFC2E189'

// ============================================================================
// Comprobaciones compartidas del contrato v2
// ============================================================================

interface ZipParts {
  tables: number
  charts: number
  formulas: number
  formulaErrors: number
  /** Hipervínculos internos (`location="…"`), que ExcelJS no expone al releer. */
  internalLinks: number
}

async function countZipParts(buffer: Buffer): Promise<ZipParts> {
  const zip = await JSZip.loadAsync(buffer)
  const tables = Object.keys(zip.files).filter((f) => /^xl\/tables\/table\d+\.xml$/.test(f)).length
  const charts = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f)).length
  let formulas = 0
  let formulaErrors = 0
  let internalLinks = 0
  for (const file of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    const xml = (await zip.file(file)?.async('string')) ?? ''
    formulas += (xml.match(/<f[ >]/g) ?? []).length
    formulaErrors += (xml.match(/#(REF|DIV\/0|VALUE|N\/A|NAME\?|NULL|NUM)!/g) ?? []).length
    internalLinks += (xml.match(/location="/g) ?? []).length
  }
  return { tables, charts, formulas, formulaErrors, internalLinks }
}

function freezeSheetCount(wb: ExcelJS.Workbook): number {
  return wb.worksheets.filter((ws) =>
    (ws.views ?? []).some((view) => view.state === 'frozen' || view.xSplit || view.ySplit),
  ).length
}

function sheetsWithoutFilterOrTable(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets
    .filter((ws) => !ws.autoFilter && ws.getTables().length === 0)
    .map((ws) => ws.name)
}

function widthProblems(wb: ExcelJS.Workbook): string[] {
  const bad: string[] = []
  for (const ws of wb.worksheets) {
    for (let ci = 1; ci <= ws.columnCount; ci += 1) {
      const width = ws.getColumn(ci).width ?? 0
      if (width > MAX_ALLOWED_COLUMN_WIDTH + 0.01) bad.push(`${ws.name} C${ci}=${width}`)
    }
  }
  return bad
}

/** Ceros prohibidos en hojas temáticas de datos (01–09), salvo los recuentos
 *  reales de la pirámide en 01_DEMOGRAFÍA. Un suprimido se presenta como ND. */
function supressedZeroProblems(wb: ExcelJS.Workbook): { bad: string[]; piramideZeros: number } {
  const bad: string[] = []
  let piramideZeros = 0
  for (const ws of wb.worksheets) {
    if (!/^0[1-9]_/.test(ws.name)) continue
    let pirStart = -1
    let pirEnd = -1
    ws.eachRow((row, rn) => {
      const first = txt(row.getCell(1).value)
      if (first.startsWith('Estructura por edad y sexo')) pirStart = rn
      else if (pirStart > 0 && pirEnd < 0 && first === '') pirEnd = rn
    })
    ws.eachRow((row, rn) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'number' && cell.value === 0) {
          if (pirStart > 0 && rn > pirStart && (pirEnd < 0 || rn < pirEnd)) piramideZeros += 1
          else bad.push(`${ws.name} R${rn}`)
        }
      })
    })
  }
  return { bad, piramideZeros }
}

/** Celdas 'ND' con valor numérico: romperían la regla "ausencia ≠ cero". */
function malformedNd(wb: ExcelJS.Workbook): string[] {
  const bad: string[] = []
  for (const ws of wb.worksheets) {
    ws.eachRow((row, rn) => {
      row.eachCell((cell, cn) => {
        if (txt(cell.value) === 'ND' && typeof cell.value === 'number') bad.push(`${ws.name} R${rn}C${cn}`)
      })
    })
  }
  return bad
}

function indexRows(wb: ExcelJS.Workbook): { listed: number; problems: string[] } {
  const ws = wb.getWorksheet('00_RESUMEN')
  const ids = new Set<string>(SOCIDEAS_BOOK_SHEET_IDS)
  let listed = 0
  const problems: string[] = []
  ws?.eachRow((row) => {
    const a = txt(row.getCell(1).value)
    if (!ids.has(a)) return
    listed += 1
    if (txt(row.getCell(2).value).length === 0) problems.push(`${a}: sin título en la misma fila`)
    if (typeof row.getCell(3).value !== 'number') problems.push(`${a}: sin recuento de bloques`)
  })
  return { listed, problems }
}

function brandProblems(wb: ExcelJS.Workbook): string[] {
  const bad: string[] = []
  if (wb.creator !== XLSX_BRAND) bad.push(`creator=${String(wb.creator)}`)
  for (const ws of wb.worksheets) {
    const title = txt(ws.getRow(1).getCell(1).value)
    // La marca completa (XLSX_BRAND) solo puede aparecer en 00 y 10; el resto
    // usa el título corto "SOCideas · <hoja>".
    if (ws.name !== '00_RESUMEN' && ws.name !== '10_METODOLOGÍA_FUENTES' && title.includes(XLSX_BRAND)) {
      bad.push(`${ws.name}: marca completa en el título`)
    }
    if (!title.startsWith('SOCideas ·')) bad.push(`${ws.name}: título sin marca corta "${title.slice(0, 40)}"`)
  }
  return bad
}

function alignmentProblems(wb: ExcelJS.Workbook): string[] {
  const bad: string[] = []
  for (const ws of wb.worksheets) {
    ws.eachRow((row, rn) => {
      let ncols = 0
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        if (isHeaderCell(row.getCell(ci))) ncols = ci
        else break
      }
      if (ncols < 2) return
      for (let ci = ncols + 1; ci <= ws.columnCount; ci += 1) {
        if (isHeaderCell(row.getCell(ci))) bad.push(`${ws.name} R${rn} cabecera verde tras col ${ncols}`)
      }
      for (let r = rn + 1; r <= ws.rowCount; r += 1) {
        const dr = ws.getRow(r)
        if (txt(dr.getCell(1).value) === '') break
        if (isHeaderCell(dr.getCell(1)) || isGreen(dr.getCell(1))) break
        for (let ci = 1; ci <= ncols; ci += 1) {
          const cell = dr.getCell(ci)
          const h = txt(row.getCell(ci).value)
          const exp = h === 'Año' || h === 'Período' ? 'center' : ci === 1 ? 'left' : 'right'
          const got = cell.alignment?.horizontal
          if (typeof cell.value === 'number' && got !== exp) bad.push(`${ws.name} R${r}C${ci} ${got ?? '?'}≠${exp}`)
        }
      }
    })
    // La columna A es unificada; donde exista cabecera "Año" debe conservar el
    // mínimo legible (ya no se fuerza 10: convive con etiquetas largas).
    ws.eachRow((row) => {
      row.eachCell((cell, cn) => {
        if (txt(cell.value) === 'Año') {
          const width = ws.getColumn(cn).width ?? 0
          if (width < 10) bad.push(`${ws.name} Año C${cn}=${width} (mínimo 10)`)
        }
      })
    })
  }
  return bad
}

function colorChecks(wb: ExcelJS.Workbook): { green348: boolean; accent: boolean; oldGreen: boolean } {
  let green348 = false
  let accent = false
  let oldGreen = false
  for (const ws of wb.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const f = fillOf(cell)
        if (f === 'FF3E665C') green348 = true
        if (f === 'FF1E4D3F') oldGreen = true
        const b = cell.border as ExcelJS.Borders | undefined
        for (const side of [b?.top, b?.bottom, b?.left, b?.right]) {
          if ((side as { color?: { argb?: string } } | undefined)?.color?.argb === 'FF86B73D') accent = true
        }
      })
    })
  }
  return { green348, accent, oldGreen }
}

async function contractChecks(wb: ExcelJS.Workbook, buffer: Buffer, label: string): Promise<void> {
  const parts = await countZipParts(buffer)
  const names = wb.worksheets.map((w) => w.name)
  check(`${label}: 11 hojas en orden contractual v2`, JSON.stringify(names) === JSON.stringify([...SOCIDEAS_BOOK_SHEET_IDS]), names.join(','))
  check(`${label}: freeze panes en TODAS las hojas`, freezeSheetCount(wb) === SOCIDEAS_BOOK_SHEET_IDS.length, `${freezeSheetCount(wb)}/${SOCIDEAS_BOOK_SHEET_IDS.length}`)
  const noFilter = sheetsWithoutFilterOrTable(wb)
  check(`${label}: autofilter o tabla nativa en cada hoja`, noFilter.length === 0, noFilter.join(','))
  check(`${label}: enlaces internos de navegación ≥8`, parts.internalLinks >= 8, `${parts.internalLinks}`)
  const widths = widthProblems(wb)
  check(`${label}: anchos ≤${MAX_ALLOWED_COLUMN_WIDTH}`, widths.length === 0, widths.slice(0, 4).join(' | '))
  const { problems: layout, stats } = findLayoutProblems(wb)
  check(
    `${label}: sin texto truncado`,
    layout.length === 0,
    layout.slice(0, 4).map((p) => `${p.sheet} R${p.row}C${p.col} [${p.kind}] ${p.detail}`).join(' | ') +
      ` (${stats.cellsChecked} celdas, ${stats.wrappedCells} con wrap)`,
  )
  const nd = malformedNd(wb)
  check(`${label}: ND nunca con valor numérico`, nd.length === 0, nd.slice(0, 3).join(' | '))
  const { bad: zeros, piramideZeros } = supressedZeroProblems(wb)
  check(`${label}: suprimidos nunca como 0 en hojas de datos`, zeros.length === 0, zeros.slice(0, 3).join(' | '))
  console.log(`INFO — ${label}: ceros genuinos de pirámide: ${piramideZeros}`)
  const brand = brandProblems(wb)
  check(`${label}: marca completa solo en 00/10 y corta en el resto`, brand.length === 0, brand.slice(0, 3).join(' | '))
  const index = indexRows(wb)
  check(`${label}: índice de 00 con las 11 hojas`, index.listed === SOCIDEAS_BOOK_SHEET_IDS.length && index.problems.length === 0, `listadas ${index.listed}/11 ${index.problems.slice(0, 2).join(' | ')}`)
  const align = alignmentProblems(wb)
  check(`${label}: alineación por rol`, align.length === 0, align.slice(0, 3).join(' | '))
  const colors = colorChecks(wb)
  check(`${label}: principal #3E665C presente`, colors.green348)
  check(`${label}: acento #86B73D presente`, colors.accent)
  check(`${label}: sin #1E4D3F`, !colors.oldGreen)
  check(`${label}: sin errores de fórmula`, parts.formulaErrors === 0, `${parts.formulaErrors}`)
}

// ============================================================================
// Escenarios con el adaptador v1→v2 (tres perfiles sintéticos)
// ============================================================================

interface Scenario {
  file: string
  label: string
  demo: ReturnType<typeof demoRica> | null
  eco: ReturnType<typeof ecoFull> | null
}

async function scenario(s: Scenario): Promise<void> {
  console.log(`\n=== ${s.label} → ${s.file} ===`)
  const demografia = s.demo ? buildDemografiaTables(s.demo as never) : []
  const ecoTables = s.eco ? buildEconomiaTables(s.eco as never) : []
  if (s.demo) check('tablas demografía con filas reales', demografia.length > 0, `${demografia.length}`)
  if (s.eco) check('tablas economía con filas reales', ecoTables.length > 0, `${ecoTables.length}`)
  const hojas: LegacyComparativeSheetInput[] = [
    { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil demográfico', bloques: demografia },
    { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Contexto económico', bloques: ecoTables },
  ]
  const buffer = await buildMunicipioWorkbook({
    municipio: 'Villa Real de Prueba', codigoINE: '99999',
    provincia: 'Provincia Test', comunidadAutonoma: 'CCAA Test',
    fechaGeneracion: '2026-09-24',
    hojas,
    ineLayers: null,
  })
  check('buffer no vacío y firma ZIP (PK)', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${buffer.length} B`)
  writeFileSync(s.file, buffer)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(s.file))
  const names = wb.worksheets.map((w) => w.name)
  check('sin hojas detalladas', !names.some((n) => /^(01|02)[A-E]_/.test(n)))
  await contractChecks(wb, buffer, s.label)

  // La portada conserva identificación y esquema (00 ya no incluye la nota
  // metodológica v1 "Solo se muestran comparativas…": vive en 10_METODOLOGÍA).
  const resumen = wb.getWorksheet('00_RESUMEN')
  let identificacion = false
  let esquema = false
  resumen?.eachRow((row) => {
    row.eachCell((c) => {
      const t = txt(c.value)
      if (t === '99999' || t === 'Villa Real de Prueba') identificacion = true
      if (t === 'socideas-book@2') esquema = true
    })
  })
  check('00 con identificación y esquema del contrato', identificacion && esquema)
}

// ============================================================================
// Escenario de pipeline v2 completo (assembleSocideasBookV2 + escritor)
// ============================================================================

async function pipelineScenario(): Promise<void> {
  console.log('\n=== Pipeline v2 completo → tmp/municipio-pipeline-v2.xlsx ===')
  const input: SocideasBookInputV2 = {
    municipio: 'Villa Real de Prueba', codigoINE: '99999',
    provincia: 'Provincia Test', comunidadAutonoma: 'CCAA Test',
    fechaGeneracion: '2026-09-24',
    perfilDemografia: demoRica() as never,
    perfilEconomia: ecoFull() as never,
    ineLayers: ineLayersFull(),
    demoExtra: demoExtraFull(),
    migracion: null,
  }
  const book = assembleSocideasBookV2(input)
  check('pipeline: sin claves de indicador duplicadas', book.duplicateKeys.length === 0, book.duplicateKeys.map((d) => d.key).join(' | '))
  const failedChecks = book.checks.filter((c) => !c.ok)
  check('pipeline: reconciliaciones sin desviación', failedChecks.length === 0, failedChecks.map((c) => c.id).join(' | '))
  const ndConValor = book.sheets
    .flatMap((s) => s.bloques)
    .flatMap((b) => b.filas)
    .flatMap((f) => f)
    .filter((c) => c.text === 'ND' && c.numeric !== null).length
  check('pipeline: ND del modelo nunca con valor numérico', ndConValor === 0, `${ndConValor}`)

  const buffer = await buildSocideasBookXlsx(book)
  check('pipeline: buffer no vacío y firma ZIP (PK)', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${buffer.length} B`)
  writeFileSync('tmp/municipio-pipeline-v2.xlsx', buffer)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/municipio-pipeline-v2.xlsx'))
  const names = wb.worksheets.map((w) => w.name)
  check('pipeline: sin hojas detalladas', !names.some((n) => /^(01|02)[A-E]_/.test(n)))

  const parts = await countZipParts(buffer)
  check('pipeline: tablas Excel nativas ≥10', parts.tables >= 10, `${parts.tables}`)
  check('pipeline: gráficos nativos ≥3', parts.charts >= 3, `${parts.charts}`)
  check('pipeline: fórmulas auditables >0', parts.formulas > 0, `${parts.formulas}`)

  await contractChecks(wb, buffer, 'pipeline')
}

async function main(): Promise<void> {
  await scenario({ file: 'tmp/municipio-rico.xlsx', label: 'rica', demo: demoRica(), eco: ecoFull() })
  await scenario({ file: 'tmp/municipio-economia.xlsx', label: 'solo-economía', demo: null, eco: ecoFull() })
  await scenario({ file: 'tmp/municipio-parcial.xlsx', label: 'parcial', demo: demoParcial(), eco: null })
  await pipelineScenario()
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nLibro municipal verificado: contrato socideas-book@2 (11 hojas, freeze, filtros, navegación, ND y layout).')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
