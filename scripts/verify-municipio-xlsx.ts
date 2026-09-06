// Verificación REAL del libro XLSX municipal (sin tocar infraestructura).
// Genera un .xlsx con datos sintéticos (incluye null/secreto) en tmp/,
// lo relee con ExcelJS y afirma: hojas, estilos corporativos, filtros,
// freeze panes, formato numérico, cero ceros fabricados y trazabilidad.
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

const OUT = 'tmp/municipio-test.xlsx'
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

async function main(): Promise<void> {
  const total = v('population_total', 2024, 5000)
  const hombres = v('population_male', 2024, 2480)
  const mujeres = v('population_female', 2024, null) // secreto: debe salir ND, nunca 0
  const evolucion = [2020, 2021, 2022, 2023, 2024].map((a, i) => v('population_evolution', a, 4800 + i * 50))
  const provincia = [2020, 2021, 2022, 2023, 2024].map((a, i) => ({ ...v('population_total', a, 400000 + i * 1000, 'provincia'), dimensiones: { ambito: 'provincia', nombre: 'Provincia Test' } }))
  const perfilDemo = {
    municipio: { codigo_ine: '99999', nombre: 'Villa Real de Prueba', poblacion: 5000, provincia: 'Provincia Test', provincia_codigo_ine: '99', comunidad_autonoma: 'CCAA Test', centroide_lng: null, centroide_lat: null },
    sincronizado: true, ultima_sincronizacion: null, total, hombres, mujeres, evolucion,
    comparativas: { provincia, ccaa: [], espana: [] },
    piramide: { anio: 2024, grupos: [{ tramo: '0-4', hombres: 120, mujeres: 110 }, { tramo: '65-69', hombres: 90, mujeres: 95 }] },
    derivados: { cambio_5y: null, cambio_10y: null, indice_envejecimiento: 98.5, indice_dependencia: 52.1 },
    densidad: { valor: null, pendiente: 'x' }, valores: [], disponibles: {}, filtros: {},
  }
  const ecoVals = [
    v('renta_neta_media_persona', 2022, 12100), v('renta_neta_media_persona', 2023, 12500),
    v('renta_neta_media_hogar', 2023, 30200),
    v('gini', 2022, 30.8), v('gini', 2023, 31.2),
    v('empresas_total', 2025, 320), v('empresas_industria', 2025, 40),
    v('empresas_servicios', 2025, 200), v('empresas_comercio_hosteleria', 2025, 90),
    v('agr_sau_total', 2020, 1500), v('agr_explotaciones', 2020, 45),
    v('gan_bovino_exp', 2020, 3), v('gan_bovino_cab', 2020, null), // ND, nunca 0
  ]
  const perfilEco = {
    municipio: perfilDemo.municipio, sincronizado: true, ultima_sincronizacion: null,
    valores: ecoVals, ultimoPorIndicador: {}, disponibles: [],
  }
  const demografia = buildDemografiaTables(perfilDemo as never)
  const economia = buildEconomiaTables(perfilEco as never)
  check('tablas demografía con filas reales', demografia.length === 5, `${demografia.length}`)
  check('tablas economía con filas reales', economia.length === 5, `${economia.length}`)

  const buffer = await buildMunicipioWorkbook({
    municipio: 'Villa Real de Prueba', codigoINE: '99999', fechaGeneracion: '2026-09-06',
    demografia, economia,
    excluidasDemografia: demografiaExcluidas(),
    excluidasEconomia: economiaExcluidas(economia.some((t) => t.id === 'renta')),
    excluidasSecciones: seccionesExcluidas(),
  })
  check('buffer no vacío y firma ZIP (PK)', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${buffer.length} B`)
  writeFileSync(OUT, buffer)
  console.log(`Archivo escrito en ${OUT}`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(OUT))
  const names = wb.worksheets.map((w) => w.name)
  check('hojas exactas 00/01/02', JSON.stringify(names) === JSON.stringify(['00_Resumen', '01_Demografía', '02_Economía']), names.join(','))
  check('sin hoja 03 sin datos reales', !names.includes('03_Secciones censales'))

  for (const n of names) {
    const ws = wb.getWorksheet(n)
    if (!ws) { check(`hoja ${n} legible`, false); continue }
    const frozen = ws.views.some((x) => x.state === 'frozen')
    check(`${n}: freeze panes`, frozen)
  }
  const demo = wb.getWorksheet('01_Demografía')
  const eco = wb.getWorksheet('02_Economía')
  const resumen = wb.getWorksheet('00_Resumen')
  check('01: autoFilter', !!(demo?.autoFilter), String(demo?.autoFilter))
  check('02: autoFilter', !!(eco?.autoFilter), String(eco?.autoFilter))
  check('00: autoFilter', !!(resumen?.autoFilter), String(resumen?.autoFilter))

  // Estilo corporativo: localizar cabecera "Año" y comprobar fill + fuente.
  let headerOk = false
  demo?.eachRow((row) => {
    row.eachCell((c) => {
      if (c.value === 'Año') {
        const fill = (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
        const font = c.font as ExcelJS.Font
        if (fill === 'FF1E4D3F' && font.bold && font.color?.argb === 'FFFFFFFF') headerOk = true
      }
    })
  })
  check('01: cabecera verde mineral + texto blanco negrita', headerOk)

  // Formatos numéricos: €, %, Año (% vive en derivados → hoja 01).
  let euroFmt = false; let pctFmt = false; let yearFmt = false
  for (const ws of [demo, eco]) {
    ws?.eachRow((row) => {
      row.eachCell((c) => {
        if (typeof c.value === 'number' && typeof c.numFmt === 'string') {
          if (c.numFmt.includes('€')) euroFmt = true
          if (c.numFmt.includes('%')) pctFmt = true
          if (c.numFmt === '0' && c.value >= 1900 && c.value <= 2100) yearFmt = true
        }
      })
    })
  }
  check('formato euros (#,##0 "€")', euroFmt)
  check('formato porcentaje (0.0" %")', pctFmt)
  check('formato año (0)', yearFmt)

  // Integridad: ND como texto y CERO ceros numéricos fabricados en hojas de bloque.
  let ndCount = 0; let zeroCount = 0
  for (const ws of [demo, eco]) {
    ws?.eachRow((row) => {
      row.eachCell((c) => {
        if (c.value === 'ND') ndCount += 1
        if (typeof c.value === 'number' && c.value === 0) zeroCount += 1
      })
    })
  }
  check('ausencias como texto ND (≥2 casos)', ndCount >= 2, `${ndCount}`)
  check('cero ceros numéricos en bloques', zeroCount === 0, `${zeroCount}`)

  // Trazabilidad en 00_Resumen.
  let muni = false; let ine = false; let sec = false; let cero = false
  resumen?.eachRow((row) => {
    row.eachCell((c) => {
      const s = String(c.value ?? '')
      if (s.includes('Villa Real de Prueba')) muni = true
      if (s.includes('99999')) ine = true
      if (s.includes('03_Secciones censales')) sec = true
      if (s.includes('nunca equivale a 0')) cero = true
    })
  })
  check('00: municipio + INE + exclusión 03 + regla del cero', muni && ine && sec && cero)

  if (failures > 0) { console.error(`${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('XLSX municipal verificado: estilos, filtros, freeze, formatos y trazabilidad OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
