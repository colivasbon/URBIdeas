// Verificación del generador XLSX SIMPLE a nivel de librería (sin servidor).
// Tres escenarios sintéticos (rica / solo-eco / parcial) con casos null/secreto.
// Afirma: exactamente 3 hojas, sin detalle, sin freeze, sin autofilter,
// sin enlaces, colores Ideas, anchos (Año 10, resto ≤24), alineación,
// ND sin ceros indebidos y trazabilidad mínima en 00.
// Uso: npx tsx scripts/verify-municipio-xlsx.ts
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import { writeFileSync, readFileSync } from 'node:fs'
import {
  buildDemografiaTables,
  buildEconomiaTables,
  demografiaExcluidas,
  economiaExcluidas,
  seccionesExcluidas,
} from '../src/lib/socideas-export'
import { buildMunicipioWorkbook } from '../src/lib/socideas-xlsx'
import type { IndicatorValue } from '../src/lib/socideas'

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

function demoRica() {
  return {
    municipio: MUNI, sincronizado: true, ultima_sincronizacion: null,
    total: v('population_total', 2024, 5000),
    hombres: v('population_male', 2024, 2480),
    mujeres: v('population_female', 2024, null),
    evolucion: [2020, 2021, 2022, 2023, 2024].map((a, i) => v('population_evolution', a, 4800 + i * 50)),
    comparativas: {
      provincia: [2020, 2021, 2022, 2023, 2024].map((a, i) => ({ ...v('population_total', a, 400000 + i * 1000, 'provincia'), dimensiones: { ambito: 'provincia', nombre: 'Provincia Test' } })),
      ccaa: [], espana: [],
    },
    piramide: { anio: 2024, grupos: [{ tramo: '0-4', hombres: 0, mujeres: 110 }, { tramo: '65-69', hombres: 90, mujeres: 95 }] },
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
      v('gini', 2022, 30.8), v('gini', 2023, 31.2),
      v('empresas_total', 2025, 320), v('empresas_industria', 2025, 40),
      v('empresas_servicios', 2025, 200), v('empresas_comercio_hosteleria', 2025, 90),
      v('agr_sau_total', 2020, 1500), v('agr_explotaciones', 2020, 45),
      v('gan_bovino_exp', 2020, 3), v('gan_bovino_cab', 2020, null),
    ],
    ultimoPorIndicador: {}, disponibles: [],
  }
}

const txt = (val: unknown): string => String((val as { value?: unknown })?.value ?? val ?? '')
const fillOf = (c: ExcelJS.Cell): string | undefined => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
const isGreen = (c: ExcelJS.Cell): boolean => {
  const font = c.font as ExcelJS.Font | undefined
  return fillOf(c) === 'FF3E665C' && font?.bold === true && font?.color?.argb === 'FFFFFFFF'
}

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
  const buffer = await buildMunicipioWorkbook({
    municipio: 'Villa Real de Prueba', codigoINE: '99999',
    provincia: 'Provincia Test', comunidadAutonoma: 'CCAA Test',
    fechaGeneracion: '2026-09-06',
    demografia, economia: ecoTables,
    excluidasDemografia: demografiaExcluidas(),
    excluidasEconomia: economiaExcluidas(ecoTables.some((t) => t.id === 'renta')),
    excluidasSecciones: seccionesExcluidas(),
  })
  check('buffer no vacío y firma ZIP (PK)', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${buffer.length} B`)
  writeFileSync(s.file, buffer)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(s.file))
  const names = wb.worksheets.map((w) => w.name)
  check('exactamente 00/01/02', JSON.stringify(names) === JSON.stringify(['00_Resumen', '01_Demografía', '02_Economía']), names.join(','))
  check('sin hojas detalladas', !names.some((n) => /^(01|02)[A-E]_/.test(n)))

  let frozen = false
  let filtered = false
  let links = 0
  let green348 = false
  let accent = false
  let oldGreen = false
  for (const ws of wb.worksheets) {
    for (const vv of ws.views ?? []) {
      if (vv.state === 'frozen' || vv.xSplit || vv.ySplit) frozen = true
    }
    if (ws.autoFilter) filtered = true
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const f = fillOf(cell)
        if (f === 'FF3E665C') green348 = true
        if (f === 'FF1E4D3F') oldGreen = true
        const link = (cell.value as { hyperlink?: unknown } | null)?.hyperlink ?? (cell as { hyperlink?: unknown }).hyperlink
        if (typeof link === 'string' && link.length > 0) links += 1
        const b = cell.border as ExcelJS.Borders | undefined
        for (const side of [b?.top, b?.bottom, b?.left, b?.right]) {
          if ((side as { color?: { argb?: string } } | undefined)?.color?.argb === 'FF86B73D') accent = true
        }
      })
    })
  }
  check('sin freeze panes ni splits', !frozen)
  check('sin autofilter', !filtered)
  check('sin enlaces internos', links === 0, `${links}`)
  check('principal #3E665C presente', green348)
  check('acento #86B73D presente', accent)
  check('sin #1E4D3F', !oldGreen)

  // Cabeceras exactas, anchos (Año 10, resto ≤24) y alineación por rol.
  const headerBad: string[] = []
  const widthBad: string[] = []
  const alignBad: string[] = []
  for (const ws of wb.worksheets) {
    if (ws.name === '00_Resumen') continue
    ws.eachRow((row, rn) => {
      let ncols = 0
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        if (isGreen(row.getCell(ci))) ncols = ci
        else break
      }
      if (ncols < 2) return
      for (let ci = ncols + 1; ci <= ws.columnCount; ci += 1) {
        if (fillOf(row.getCell(ci)) === 'FF3E665C') headerBad.push(`${ws.name} R${rn} verde tras col ${ncols}`)
      }
      for (let r = rn + 1; r <= ws.rowCount; r += 1) {
        const dr = ws.getRow(r)
        if (txt(dr.getCell(1).value) === '') break
        if (isGreen(dr.getCell(1))) break
        for (let ci = 1; ci <= ncols; ci += 1) {
          const cell = dr.getCell(ci)
          const h = txt(ws.getRow(rn).getCell(ci).value)
          const exp = h === 'Año' ? 'center' : ci === 1 ? 'left' : 'right'
          const got = cell.alignment?.horizontal
          if ((typeof cell.value === 'number' || h === 'Año') && got !== exp) {
            alignBad.push(`${ws.name} R${r}C${ci} ${got ?? '?'}≠${exp}`)
          }
        }
      }
    })
    for (let ci = 1; ci <= ws.columnCount; ci += 1) {
      const w = ws.getColumn(ci).width ?? 0
      if (w > 24) widthBad.push(`${ws.name} C${ci}=${w}`)
    }
    ws.eachRow((row) => {
      row.eachCell((cell, cn) => {
        if (txt(cell.value) === 'Año') {
          const w = ws.getColumn(cn).width ?? 0
          if (w !== 10) widthBad.push(`${ws.name} Año C${cn}=${w} (esperado 10)`)
        }
      })
    })
  }
  check('cabeceras exactas', headerBad.length === 0, headerBad.slice(0, 3).join(' | '))
  check('anchos ≤24 y Año=10', widthBad.length === 0, widthBad.slice(0, 4).join(' | '))
  check('alineación por rol', alignBad.length === 0, alignBad.slice(0, 3).join(' | '))

  // Ceros: prohibidos salvo bloque pirámide (recuentos reales).
  const badZeros: string[] = []
  let piramideZeros = 0
  for (const ws of wb.worksheets) {
    if (ws.name === '00_Resumen') continue
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
          else badZeros.push(`${ws.name} R${rn}`)
        }
      })
    })
  }
  check('cero suprimidos como cero', badZeros.length === 0, badZeros.slice(0, 3).join(' | '))
  console.log(`INFO — ceros genuinos de pirámide: ${piramideZeros}`)

  // 00 breve: identificación + línea legal, sin trazabilidad ni filtros.
  const resumen = wb.getWorksheet('00_Resumen')
  let muni = false
  let legal = false
  let trace = false
  resumen?.eachRow((row) => {
    row.eachCell((c) => {
      const t = txt(c.value)
      if (t === '99999') muni = true
      if (t.startsWith('Fuentes y periodos específicos')) legal = true
      if (t === 'Observación' || t === 'Incluida') trace = true
    })
  })
  check('00 breve con INE y línea legal, sin trazabilidad', muni && legal && !trace)
}

async function main(): Promise<void> {
  await scenario({ file: 'tmp/municipio-rico.xlsx', label: 'Rica (demo + eco)', demo: demoRica(), eco: ecoFull() })
  await scenario({ file: 'tmp/municipio-economia.xlsx', label: 'Solo economía', demo: null, eco: ecoFull() })
  await scenario({ file: 'tmp/municipio-parcial.xlsx', label: 'Parcial pequeña', demo: demoParcial(), eco: null })
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nXLSX simple verificado: 3 hojas, rangos exactos y formato Ideas OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
