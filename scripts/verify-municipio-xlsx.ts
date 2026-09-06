// Verificación REAL del libro XLSX municipal (sin tocar infraestructura).
// Genera 3 archivos en tmp/ (ignorado por git) con datos sintéticos:
//  1. tmp/municipio-rico.xlsx ..... Demografía rica + Economía disponible.
//  2. tmp/municipio-economia.xlsx  Solo Economía (01 con mensaje, 02 con tablas).
//  3. tmp/municipio-parcial.xlsx .. Demografía parcial pequeña (02 con mensaje).
// Cada archivo se relee con ExcelJS y se afirma: hojas, estilo mineral,
// freeze panes, autofilter, formato numérico, alineación, ND sin ceros,
// trazabilidad con exclusiones y ausencia de secretos/URLs privadas.
// Uso: npx tsx scripts/verify-municipio-xlsx.ts
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
    mujeres: v('population_female', 2024, null), // secreto → ND, nunca 0
    evolucion: [2020, 2021, 2022, 2023, 2024].map((a, i) => v('population_evolution', a, 4800 + i * 50)),
    comparativas: {
      provincia: [2020, 2021, 2022, 2023, 2024].map((a, i) => ({ ...v('population_total', a, 400000 + i * 1000, 'provincia'), dimensiones: { ambito: 'provincia', nombre: 'Provincia Test' } })),
      ccaa: [], espana: [],
    },
    piramide: { anio: 2024, grupos: [{ tramo: '0-4', hombres: 120, mujeres: 110 }, { tramo: '65-69', hombres: 90, mujeres: 95 }] },
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
      v('gan_bovino_exp', 2020, 3), v('gan_bovino_cab', 2020, null), // ND, nunca 0
    ],
    ultimoPorIndicador: {}, disponibles: [],
  }
}

const FORBIDDEN = [/token/i, /supabase/i, /localhost/i, /x-sync/i, /bearer/i, /password/i, /api[_-]?key/i, /\br2\b/i, /BEGIN PRIVATE/i]

interface Scenario {
  file: string
  label: string
  demo: ReturnType<typeof demoRica> | null
  eco: ReturnType<typeof ecoFull> | null
  messageSheets: string[]
  expectPct: boolean
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
  check('hojas 00/01/02', JSON.stringify(names) === JSON.stringify(['00_Resumen', '01_Demografía', '02_Economía']), names.join(','))
  check('sin hoja 03 sin datos reales', !names.includes('03_Secciones censales'))

  for (const n of names) {
    const ws = wb.getWorksheet(n)
    if (!ws) { check(`hoja ${n} legible`, false); continue }
    check(`${n}: freeze panes`, ws.views.some((x) => x.state === 'frozen'))
  }
  const resumen = wb.getWorksheet('00_Resumen')
  check('00: autoFilter', !!resumen?.autoFilter, String(resumen?.autoFilter))
  const titleFill = (resumen?.getRow(1).getCell(1).fill as ExcelJS.FillPattern)?.fgColor?.argb
  check('00: fila título verde mineral', titleFill === 'FF1E4D3F', titleFill)

  let cols8 = false; let prov = false; let ccaa = false; let sec = false; let cero = false; let muni = false
  resumen?.eachRow((row) => {
    const texts = row.values as unknown[]
    const joined = texts.map((x) => String((x as { value?: unknown })?.value ?? x ?? '')).join('|')
    if (joined.includes('Bloque') && joined.includes('Observación') && joined.includes('Incluida')) cols8 = true
    if (joined.includes('Provincia Test')) prov = true
    if (joined.includes('CCAA Test')) ccaa = true
    if (joined.includes('03_Secciones censales')) sec = true
    if (joined.includes('nunca equivale a 0')) cero = true
    if (joined.includes('Villa Real de Prueba')) muni = true
  })
  check('00: columnas Bloque…Observación', cols8)
  check('00: municipio + provincia + CCAA + exclusión 03 + regla del cero', muni && prov && ccaa && sec && cero)

  for (const n of ['01_Demografía', '02_Economía']) {
    const ws = wb.getWorksheet(n)
    if (!ws) { check(`${n} legible`, false); continue }
    if (s.messageSheets.includes(n)) {
      let found = false
      ws.eachRow((row) => {
        row.eachCell((c) => {
          if (String(c.value ?? '').includes('00_Resumen')) found = true
        })
      })
      check(`${n}: mensaje no numérico + referencia 00_Resumen`, found)
      continue
    }
    check(`${n}: autoFilter`, !!ws.autoFilter, String(ws.autoFilter))
    let headerOk = false; let euroFmt = false; let pctFmt = false; let yearFmt = false
    let yearCenter = false; let numRight = false; let nd = 0; let zeros = 0
    ws.eachRow((row) => {
      row.eachCell((c) => {
        if (c.value === 'Año') {
          const fill = (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
          const font = c.font as ExcelJS.Font
          if (fill === 'FF1E4D3F' && font.bold && font.color?.argb === 'FFFFFFFF') headerOk = true
        }
        if (typeof c.value === 'number' && typeof c.numFmt === 'string') {
          if (c.numFmt.includes('€')) euroFmt = true
          if (c.numFmt.includes('%')) pctFmt = true
          if (c.numFmt === '0' && c.value >= 1900 && c.value <= 2100) {
            yearFmt = true
            if (c.alignment?.horizontal === 'center') yearCenter = true
          } else if (c.alignment?.horizontal === 'right') {
            numRight = true
          }
        }
        if (c.value === 'ND') nd += 1
        if (typeof c.value === 'number' && c.value === 0) zeros += 1
      })
    })
    check(`${n}: cabecera mineral + blanco negrita`, headerOk)
    check(`${n}: Año centrado`, yearCenter)
    check(`${n}: numéricas a derecha`, numRight)
    check(`${n}: cero ceros numéricos`, zeros === 0, `${zeros}`)
    check(`${n}: formato año`, yearFmt)
    if (n === '02_Economía') {
      check(`${n}: formato euros`, euroFmt)
      check(`${n}: ND como texto`, nd >= 1, `${nd}`)
    }
    if (n === '01_Demografía' && s.expectPct) check(`${n}: formato porcentaje`, pctFmt)
  }

  const hits: string[] = []
  for (const ws of wb.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((c) => {
        const str = String(c.value ?? '')
        for (const re of FORBIDDEN) {
          if (re.test(str)) hits.push(`${ws.name}: ${str.slice(0, 60)}`)
        }
      })
    })
  }
  check('sin secretos ni URLs privadas', hits.length === 0, hits.slice(0, 3).join(' | '))
}

async function main(): Promise<void> {
  await scenario({ file: 'tmp/municipio-rico.xlsx', label: 'Rica (demo + eco)', demo: demoRica(), eco: ecoFull(), messageSheets: [], expectPct: true })
  await scenario({ file: 'tmp/municipio-economia.xlsx', label: 'Economía (01 con mensaje)', demo: null, eco: ecoFull(), messageSheets: ['01_Demografía'], expectPct: false })
  await scenario({ file: 'tmp/municipio-parcial.xlsx', label: 'Parcial pequeña (02 con mensaje)', demo: demoParcial(), eco: null, messageSheets: ['02_Economía'], expectPct: false })
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nXLSX municipal verificado en 3 escenarios: estilos, filtros, freeze, formatos y trazabilidad OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
