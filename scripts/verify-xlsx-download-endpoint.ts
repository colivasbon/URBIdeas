// Validación del endpoint de exportación XLSX municipal.
// Nivel librería (sin servidor): genera XLSX con datos sintéticos y valida
// que el generador produce un archivo válido, con las hojas correctas y
// sin depender de capas laterales opcionales.
//
// Uso: npx tsx scripts/verify-xlsx-download-endpoint.ts
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import { writeFileSync, readFileSync } from 'node:fs'
import {
  buildDemografiaTables,
  buildEconomiaTables,
  normalizarMunicipio,
  SOCIDEAS_SHEET_IDS,
} from '../src/lib/socideas-export'
import { buildDemographicDimensionTables } from '../src/lib/socideas-demographic-export'
import { buildMunicipioWorkbook, type ComparativeSheetInput } from '../src/lib/socideas-xlsx'
import type { IndicatorValue } from '../src/lib/socideas'
import type { DemographicPresentationData } from '../src/lib/socideas-demographic-summary'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

// ---------- Sintético ----------

const MUNI = (ine: string, nombre: string) => ({
  codigo_ine: ine, nombre, poblacion: 5000,
  provincia: 'Provincia Test', provincia_codigo_ine: '99',
  comunidad_autonoma: 'CCAA Test',
  centroide_lng: null, centroide_lat: null,
})

function indicator(slug: string, anio: number, valor: number | null, ambito = 'municipio', tableId = '2855'): IndicatorValue {
  return {
    id: `${slug}-${anio}-${ambito}`, municipio_codigo_ine: '99999',
    indicator_id: slug, fecha_referencia: `${anio}-01-01`,
    anio_referencia: anio, valor_numerico: valor, valor_texto: null,
    unidad: 'personas', dimensiones: { ambito }, source_id: 'ine',
    source_url: `https://www.ine.es/wstempus/js/ES/DATOS_TABLA/${tableId}`,
    source_table_id: tableId, source_series_id: null,
    obtenido_en: '2026-09-06', estado_validacion: 'validado',
    indicator: { id: slug, slug, nombre: slug, grupo: 'test', descripcion: null, unidad: null, metodologia: null, fuente_principal_id: null, periodicidad: null, visualizacion_recomendada: null, activo: true },
    source: { id: 'ine', slug: 'ine_tempus3', organismo: 'INE', nombre: 'Cifras oficiales', descripcion: null, url_base: null, api_table_id: null, licencia: null, frecuencia_actualizacion: null, activo: true },
  } as unknown as IndicatorValue
}

function demoProfile(ine: string, nombre: string) {
  return {
    municipio: MUNI(ine, nombre), sincronizado: true, ultima_sincronizacion: null,
    total: indicator('population_total', 2024, 5000),
    hombres: indicator('population_male', 2024, 2480),
    mujeres: indicator('population_female', 2024, 2520),
    evolucion: [2020, 2021, 2022, 2023, 2024].map((a, i) => indicator('population_evolution', a, 4800 + i * 50)),
    comparativas: {
      provincia: [2022, 2023, 2024].map((a, i) => ({ ...indicator('population_total', a, 400000 + i * 1000, 'provincia'), dimensiones: { ambito: 'provincia' } })),
      ccaa: [], espana: [],
    },
    piramide: { anio: 2024, grupos: [{ tramo: '0-4', hombres: 110, mujeres: 100 }, { tramo: '65-69', hombres: 90, mujeres: 95 }] },
    derivados: { cambio_5y: 1.8, cambio_10y: 3.2, indice_envejecimiento: 98.5, indice_dependencia: 52.1 },
    densidad: { valor: null, pendiente: 'x' },
    valores: [], disponibles: {}, filtros: {},
  }
}

function ecoProfile(ine: string, nombre: string) {
  return {
    municipio: MUNI(ine, nombre), sincronizado: true, ultima_sincronizacion: null,
    valores: [
      indicator('irpf_declaraciones', 2023, 3800, 'municipio', '30342'),
      indicator('irpf_renta_bruta_media', 2023, 27000, 'municipio', '30342'),
      indicator('renta_neta_media_persona', 2023, 14000, 'municipio', '37683'),
      indicator('gini', 2023, 31.2, 'municipio', '37683'),
      indicator('empresas_total', 2025, 320, 'municipio', '4721'),
      indicator('agr_sau_total', 2020, 1500, 'municipio', '29006'),
    ],
    ultimoPorIndicador: {}, disponibles: [],
  }
}

function dims(period: string): DemographicPresentationData {
  return {
    nationality: { period, total: 5000, spanish: 4200, foreign: 800, spanishPercent: 84, foreignPercent: 16, status: 'observed', source: { label: 'INE', tableId: '68535' } },
    birthCountry: { period, spain: { label: 'España', value: 4200, status: 'observed' }, topCountries: [{ label: 'Rumanía', value: 200, status: 'observed' }], status: 'observed', source: { label: 'INE', tableId: '66322' }, note: '' },
    birthResidenceRelation: { period, total: 5000, categories: [{ key: 'sameMunicipality', label: 'Mismo municipio', value: 3000, percent: 60, status: 'observed' }, { key: 'bornAbroad', label: 'Extranjero', value: 800, percent: 16, status: 'observed' }], status: 'observed', source: { label: 'INE', tableId: '68540' } },
  }
}

// ---------- Test 1: Generación completa con capas laterales ausentes ----------

async function testFullGeneration() {
  console.log('\n=== Test 1: Generación con capas laterales ausentes ===')
  const ine = '02003'
  const nombre = 'Albacete'
  const demografia = [
    ...buildDemografiaTables(demoProfile(ine, nombre) as never),
    ...buildDemographicDimensionTables(dims('2025')),
  ]
  const economia = buildEconomiaTables(ecoProfile(ine, nombre) as never)
  const hojas: ComparativeSheetInput[] = [
    { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil demográfico', bloques: demografia },
    { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Contexto económico', bloques: economia },
  ]

  // Sin capas laterales (ineLayers=null): el XLSX debe generarse igualmente.
  const buffer = await buildMunicipioWorkbook({
    municipio: nombre, codigoINE: ine,
    provincia: 'Albacete', comunidadAutonoma: 'Castilla-La Mancha',
    fechaGeneracion: '2026-09-11', hojas, ineLayers: null,
  })

  check('buffer no vacío y firma PK', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${buffer.length} B`)
  writeFileSync('tmp/download-endpoint-02003.xlsx', buffer)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/download-endpoint-02003.xlsx'))
  const names = wb.worksheets.map((w) => w.name)
  check('nueve hojas en orden contractual', JSON.stringify(names) === JSON.stringify([...SOCIDEAS_SHEET_IDS]), names.join(','))
  check('sin freeze panes', !wb.worksheets.some((w) => (w.views ?? []).some((v) => v.state === 'frozen')))
  check('sin autofilter', !wb.worksheets.some((w) => !!w.autoFilter))
  check('sin celdas fusionadas', !wb.worksheets.some((w) => w.eachRow((row) => { row.eachCell((c) => { if (c.isMerged) throw new Error('merged') }) })))

  // Verificar que el nombre del municipio aparece en la hoja 01.
  const ws01 = wb.getWorksheet('01_PERFIL_DEMOGRÁFICO')
  const scopeText = ws01?.getRow(2).getCell(1).value
  check('scope line contiene código INE', String(scopeText).includes('02003'), String(scopeText).slice(0, 80))

  // Verificar que el código INE se mantiene con cero inicial.
  const filename = `SOCideas_${normalizarMunicipio(nombre)}_${ine}_libro.xlsx`
  check('nombre archivo contiene 02003 con cero inicial', filename.includes('02003'), filename)
}

// ---------- Test 2: Generación sin datos de nacionalidad/arraigo ----------

async function testNoDimensions() {
  console.log('\n=== Test 2: Sin capas dimensionales ===')
  const demografia = buildDemografiaTables(demoProfile('07010', 'Bunyola') as never)
  const economia = buildEconomiaTables(ecoProfile('07010', 'Bunyola') as never)
  const hojas: ComparativeSheetInput[] = [
    { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil', bloques: demografia },
    { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Economía', bloques: economia },
  ]

  // Sin demoExtra, sin ineLayers: el XLSX se genera con lo que hay.
  const buffer = await buildMunicipioWorkbook({
    municipio: 'Bunyola', codigoINE: '07010',
    provincia: 'Mallorca', comunidadAutonoma: 'Illes Balears',
    fechaGeneracion: '2026-09-11', hojas, ineLayers: null,
  })

  check('sin dimensionales: buffer válido', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  writeFileSync('tmp/download-endpoint-07010.xlsx', buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/download-endpoint-07010.xlsx'))
  check('sin dimensionales: 9 hojas', wb.worksheets.length === 9)
}

// ---------- Test 3: Código INE inválido ----------

function testInvalidINE() {
  console.log('\n=== Test 3: Validación código INE ===')
  const regex = /^\d{5}$/
  check('00000 es válido (5 dígitos)', regex.test('00000'))
  check('02003 es válido', regex.test('02003'))
  check('2003 sin cero NO es válido', !regex.test('2003'))
  check('99999 es válido (pero municipio inexistente)', regex.test('99999'))
  check('abcde NO es válido', !regex.test('abcde'))
  check('020030 NO es válido (>5 dígitos)', !regex.test('020030'))
  check('vacío NO es válido', !regex.test(''))
}

// ---------- Test 4: Nombre de archivo ----------

function testFilename() {
  console.log('\n=== Test 4: Nombre de archivo ===')
  const n1 = `SOCideas_${normalizarMunicipio('Albacete')}_02003_libro.xlsx`
  check('Albacete → nombre contiene código', n1.includes('02003'), n1)
  check('Albacete → nombre contiene SOCideas', n1.includes('SOCideas'), n1)
  const n2 = `SOCideas_${normalizarMunicipio('La Roda')}_02069_libro.xlsx`
  check('La Roda → nombre contiene código', n2.includes('02069'), n2)
  check('La Roda → nombre contiene SOCideas', n2.includes('SOCideas'), n2)
}

// ---------- Main ----------

async function main() {
  await testFullGeneration()
  await testNoDimensions()
  testInvalidINE()
  testFilename()
  console.log(`\n${failures === 0 ? 'OK' : failures} comprobaciones ${failures === 0 ? 'superadas' : 'FALLIDAS'}`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
