// Validación de degradación segura: capas opcionales ausentes no rompen el XLSX.
// Prueba cada tipo de fallo opcional individualmente y verifica que el XLSX
// se genera igualmente con las hojas correctas.
//
// Uso: npx tsx scripts/verify-xlsx-optional-fallback.ts
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import { writeFileSync, readFileSync } from 'node:fs'
import { buildDemografiaTables, buildEconomiaTables, SOCIDEAS_SHEET_IDS } from '../src/lib/socideas-export'
import { buildDemographicDimensionTables } from '../src/lib/socideas-demographic-export'
import { buildMunicipioWorkbook, type ComparativeSheetInput } from '../src/lib/socideas-xlsx'
import { buildMovilidadMigratoriaTable, buildNivelEducativoTable, buildDensidadTable, buildDemographicDerivedLayerTable } from '../src/lib/socideas-ine-layers-export'
import type { IndicatorValue } from '../src/lib/socideas'
import type { DemographicPresentationData } from '../src/lib/socideas-demographic-summary'
import type { MunicipalIneLayersV1 } from '../src/lib/socideas-ine-layers'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

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
    source_url: '', source_table_id: tableId, source_series_id: null,
    obtenido_en: '2026-09-11', estado_validacion: 'validado',
    indicator: { id: slug, slug, nombre: slug, grupo: 'test', descripcion: null, unidad: null, metodologia: null, fuente_principal_id: null, periodicidad: null, visualizacion_recomendada: null, activo: true },
    source: { id: 'ine', slug: 'ine_tempus3', organismo: 'INE', nombre: 'Cifras oficiales', descripcion: null, url_base: null, api_table_id: null, licencia: null, frecuencia_actualizacion: null, activo: true },
  } as unknown as IndicatorValue
}

function demoProfile() {
  return {
    municipio: MUNI('02003', 'Albacete'), sincronizado: true, ultima_sincronizacion: null,
    total: indicator('population_total', 2024, 173050),
    hombres: indicator('population_male', 2024, 84300),
    mujeres: indicator('population_female', 2024, 88750),
    evolucion: [2020, 2021, 2022, 2023, 2024].map((a, i) => indicator('population_evolution', a, 170000 + i * 750)),
    comparativas: { provincia: [], ccaa: [], espana: [] },
    piramide: { anio: 2024, grupos: [{ tramo: '0-4', hombres: 4100, mujeres: 3900 }, { tramo: '65-69', hombres: 3900, mujeres: 4100 }] },
    derivados: { cambio_5y: 1.8, cambio_10y: 3.2, indice_envejecimiento: 98.5, indice_dependencia: 52.1 },
    densidad: { valor: null, pendiente: 'x' }, valores: [], disponibles: {}, filtros: {},
  }
}

function ecoProfile() {
  return {
    municipio: MUNI('02003', 'Albacete'), sincronizado: true, ultima_sincronizacion: null,
    valores: [
      indicator('irpf_declaraciones', 2023, 3800),
      indicator('irpf_renta_bruta_media', 2023, 27000),
      indicator('renta_neta_media_persona', 2023, 14000),
      indicator('gini', 2023, 31.2),
      indicator('empresas_total', 2025, 320),
    ],
    ultimoPorIndicador: {}, disponibles: [],
  }
}

async function buildWithLayers(
  demoExtra: DemographicPresentationData | null,
  ineLayers: MunicipalIneLayersV1 | null,
): Promise<Buffer> {
  const demografia = [
    ...buildDemografiaTables(demoProfile() as never),
    ...buildDemographicDimensionTables(demoExtra),
  ]
  const economia = buildEconomiaTables(ecoProfile() as never)
  const hojas: ComparativeSheetInput[] = [
    { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil', bloques: demografia },
    { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Economía', bloques: economia },
  ]
  return buildMunicipioWorkbook({
    municipio: 'Albacete', codigoINE: '02003',
    provincia: 'Albacete', comunidadAutonoma: 'Castilla-La Mancha',
    fechaGeneracion: '2026-09-11', hojas, ineLayers,
  })
}

async function testBaseCase() {
  console.log('\n=== Test 1: Caso base (sin capas laterales) ===')
  const buffer = await buildWithLayers(null, null)
  check('XLSX válido', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b, `${buffer.length} B`)
  writeFileSync('tmp/fallback-base.xlsx', buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/fallback-base.xlsx'))
  check('9 hojas', wb.worksheets.length === 9)
  check('Sin freeze', !wb.worksheets.some((w) => (w.views ?? []).some((v) => v.state === 'frozen')))
}

async function testWithNationality() {
  console.log('\n=== Test 2: Con nacionalidad (demoExtra presente) ===')
  const demoExtra: DemographicPresentationData = {
    nationality: {
      period: '2025', total: 173050, spanish: 146450, foreign: 26600,
      spanishPercent: 84.6, foreignPercent: 15.4, status: 'observed',
      source: { label: 'INE', tableId: '68535' },
    },
  }
  const buffer = await buildWithLayers(demoExtra, null)
  check('XLSX válido con nacionalidad', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  writeFileSync('tmp/fallback-nationality.xlsx', buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/fallback-nationality.xlsx'))
  check('9 hojas con nacionalidad', wb.worksheets.length === 9)
  // Verificar que el bloque de nacionalidad está en la hoja 01
  const ws01 = wb.getWorksheet('01_PERFIL_DEMOGRÁFICO')
  let hasNacionalidad = false
  ws01?.eachRow((row) => {
    const v = row.getCell(1).value
    if (typeof v === 'string' && v.includes('Nacionalidad')) hasNacionalidad = true
  })
  check('Bloque nacionalidad presente', hasNacionalidad)
}

async function testWithArraigo() {
  console.log('\n=== Test 3: Con arraigo territorial ===')
  const demoExtra: DemographicPresentationData = {
    birthResidenceRelation: {
      period: '2025', total: 173050,
      categories: [
        { key: 'sameMunicipality', label: 'Mismo municipio', value: 92000, percent: 53.2, status: 'observed' },
        { key: 'bornAbroad', label: 'Extranjero', value: 16050, percent: 9.3, status: 'observed' },
      ],
      status: 'observed',
      source: { label: 'INE', tableId: '68540' },
    },
  }
  const buffer = await buildWithLayers(demoExtra, null)
  check('XLSX válido con arraigo', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  writeFileSync('tmp/fallback-arraigo.xlsx', buffer)
}

async function testWithEducation() {
  console.log('\n=== Test 4: Con educación (INE layers) ===')
  const ineLayers: MunicipalIneLayersV1 = {
    schemaVersion: 'municipal-ine-layers-v1',
    ineCode: '02003', municipalityName: 'Albacete',
    generatedAt: '2026-09-11',
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
    },
    quality: { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'passed' },
  }
  const buffer = await buildWithLayers(null, ineLayers)
  check('XLSX válido con educación', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  writeFileSync('tmp/fallback-education.xlsx', buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/fallback-education.xlsx'))
  const ws04 = wb.getWorksheet('04_CONTEXTO_SOCIOCULTURAL')
  let hasEdu = false
  ws04?.eachRow((row) => {
    const v = row.getCell(1).value
    if (typeof v === 'string' && v.includes('Nivel educativo')) hasEdu = true
  })
  check('Bloque educación presente', hasEdu)
}

async function testWithMigration() {
  console.log('\n=== Test 5: Con migración (INE layers) ===')
  const ineLayers: MunicipalIneLayersV1 = {
    schemaVersion: 'municipal-ine-layers-v1',
    ineCode: '02003', municipalityName: 'Albacete',
    generatedAt: '2026-09-11',
    layers: {
      migration: {
        period: '2021',
        annualSeries: [
          { period: '2020', total: { value: 12, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false }, interior: { value: -4, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false }, exterior: { value: 16, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false } },
        ],
        latest: { period: '2020', total: { value: 12, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false }, interior: { value: -4, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false }, exterior: { value: 16, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false } },
        status: 'observed',
      },
    },
    quality: { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'passed' },
  }
  const buffer = await buildWithLayers(null, ineLayers)
  check('XLSX válido con migración', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  writeFileSync('tmp/fallback-migration.xlsx', buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/fallback-migration.xlsx'))
  const ws01 = wb.getWorksheet('01_PERFIL_DEMOGRÁFICO')
  let hasMig = false
  ws01?.eachRow((row) => {
    const v = row.getCell(1).value
    if (typeof v === 'string' && v.includes('Movilidad')) hasMig = true
  })
  check('Bloque movilidad presente', hasMig)
}

async function testWithDensity() {
  console.log('\n=== Test 6: Con densidad (INE layers) ===')
  const ineLayers: MunicipalIneLayersV1 = {
    schemaVersion: 'municipal-ine-layers-v1',
    ineCode: '02003', municipalityName: 'Albacete',
    generatedAt: '2026-09-11',
    layers: {
      demographicDerived: {
        density: { value: 23.4, unit: 'hab./km²', status: 'observed', source: 'INE', tableId: '2855', period: '2024', derived: true },
        meanAge: { value: 42.1, unit: 'años', status: 'observed', source: 'INE', tableId: '2855', period: '2024', derived: true },
      },
    },
    quality: { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'passed' },
  }
  const buffer = await buildWithLayers(null, ineLayers)
  check('XLSX válido con densidad', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  writeFileSync('tmp/fallback-density.xlsx', buffer)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync('tmp/fallback-density.xlsx'))
  const ws01 = wb.getWorksheet('01_PERFIL_DEMOGRÁFICO')
  let hasDensity = false
  ws01?.eachRow((row) => {
    const v = row.getCell(1).value
    if (typeof v === 'string' && v.includes('Densidad')) hasDensity = true
  })
  check('Bloque densidad presente', hasDensity)
}

async function testAllLayersFailGracefully() {
  console.log('\n=== Test 7: Todas las capas laterales fallan ===')
  // Simular: demoExtra null, ineLayers null, pero datos base OK
  const buffer = await buildWithLayers(null, null)
  check('XLSX válido sin ninguna capa lateral', buffer.length > 0 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  check('9 hojas presentes', wb.worksheets.length === 9)
  check('Hoja 01 existe', !!wb.getWorksheet('01_PERFIL_DEMOGRÁFICO'))
  check('Hoja 03 existe', !!wb.getWorksheet('03_CONTEXTO_ECONÓMICO'))
  check('Hoja 04 existe', !!wb.getWorksheet('04_CONTEXTO_SOCIOCULTURAL'))
  check('Hoja 08 existe', !!wb.getWorksheet('08_CRITERIOS_Y_FUENTES'))
}

// ---------- Main ----------

async function main() {
  await testBaseCase()
  await testWithNationality()
  await testWithArraigo()
  await testWithEducation()
  await testWithMigration()
  await testWithDensity()
  await testAllLayersFailGracefully()
  console.log(`\n${failures === 0 ? 'OK' : failures} comprobaciones ${failures === 0 ? 'superadas' : 'FALLIDAS'}`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
