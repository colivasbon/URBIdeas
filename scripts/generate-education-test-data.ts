#!/usr/bin/env node
// Generador de datos educativos de prueba para validación inicial.
//
// Genera datasets de educación para Albacete 02003, Cáceres 10037 y Madrid 28079
// con estructura válida pero valores simulados.
//
// USO
//   npx tsx scripts/generate-education-test-data.ts --period=2024

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EDUCATION_INDICATORS,
  EDUCATION_SCHEMA_VERSION,
  EDUCATION_DOMAIN,
  type EducationMunicipalDataset,
  type EducationSectionValue,
} from '../src/lib/socideas-secciones-education'

interface MunicipioTestData {
  ine: string
  nombre: string
  provincia: string
  seccionesTotal: number
}

const MUNICIPIOS_PRUEBA: MunicipioTestData[] = [
  { ine: '02003', nombre: 'Albacete', provincia: 'Albacete', seccionesTotal: 17 },
  { ine: '10037', nombre: 'Cáceres', provincia: 'Cáceres', seccionesTotal: 12 },
  { ine: '28079', nombre: 'Madrid', provincia: 'Madrid', seccionesTotal: 131 },
]

function generarClaveSeccion(municipio: string, distrito: string, seccion: string): string {
  return `${municipio}${distrito.padStart(2, '0')}${seccion.padStart(3, '0')}`
}

function generarValorEducativo(indId: string, seccionNum: number): EducationSectionValue {
  // Simulación determinista basada en hash de indicador + sección
  const hash = (indId + seccionNum).split('').reduce((a, c) => a + c.charCodeAt(0), 0)

  // Simular varianza realista por indicador
  let value: number
  const denominator = 1000 + seccionNum * 50
  let numerator: number

  switch (indId) {
    case 'edu_sin_estudios_pct':
      value = (hash % 15) + 2 // 2-16%
      break
    case 'edu_primaria_pct':
      value = (hash % 10) + 5 // 5-14%
      break
    case 'edu_primer_ciclo_eso_pct':
      value = (hash % 12) + 8 // 8-19%
      break
    case 'edu_segundo_ciclo_eso_pct':
      value = (hash % 15) + 15 // 15-29%
      break
    case 'edu_fp_grado_medio_pct':
      value = (hash % 8) + 5 // 5-12%
      break
    case 'edu_fp_grado_superior_pct':
      value = (hash % 8) + 5 // 5-12%
      break
    case 'edu_universitaria_pct':
      value = (hash % 20) + 15 // 15-34%
      break
    default:
      value = 50
  }

  numerator = Math.floor(denominator * (value / 100))

  // Simular ocasionalmente ND (10% de probabilidad)
  const isNd = seccionNum % 10 === 0 && hash % 3 === 0
  if (isNd) {
    return {
      sectionCode: '',
      indicatorId: indId,
      numerator: null,
      denominator: null,
      value: null,
      status: 'no_difundido',
      note: 'Dato no publicado por el INE',
    }
  }

  return {
    sectionCode: '',
    indicatorId: indId,
    numerator,
    denominator,
    value: Math.round(value * 100) / 100,
    status: 'observado',
  }
}

async function generarDatosEducativos(
  municipio: MunicipioTestData,
  period: number,
): Promise<EducationMunicipalDataset> {
  const values: EducationSectionValue[] = []
  let seccionesConDato = 0

  // Generar valores por sección e indicador
  for (let seccion = 1; seccion <= municipio.seccionesTotal; seccion++) {
    const codigoSeccion = generarClaveSeccion(municipio.ine, '00', String(seccion))
    let tieneAlgunValor = false

    for (const indicador of EDUCATION_INDICATORS) {
      const valor = generarValorEducativo(indicador.id, seccion)
      valor.sectionCode = codigoSeccion
      if (valor.status === 'observado') tieneAlgunValor = true
      values.push(valor)
    }

    if (tieneAlgunValor) seccionesConDato++
  }

  const valoresObservados = values.filter((v) => v.status === 'observado').length
  const valoresNoDifundidos = values.filter((v) => v.status === 'no_difundido').length

  const dataset: EducationMunicipalDataset = {
    schemaVersion: EDUCATION_SCHEMA_VERSION,
    domain: EDUCATION_DOMAIN,
    municipalityCode: municipio.ine,
    municipalityName: municipio.nombre,
    period,
    geometryYear: 2024,
    geometryCollection: 'Secciones_2024',
    geometrySource: 'Instituto Nacional de Estadística',
    totalSections: municipio.seccionesTotal,
    coveredSections: seccionesConDato,
    indicators: EDUCATION_INDICATORS,
    values,
    validation: {
      sectionKeysValid: values.length,
      sectionKeysInvalid: 0,
      valuesObserved: valoresObservados,
      valuesUndisclosed: valoresNoDifundidos,
      valuesMissing: 0,
    },
    source: {
      url: 'https://www.ine.es/dynt3/inebase/index.htm?padre=10608',
      operation: '1254736176992',
      table: 'census_education_2024',
      retrievedAt: new Date().toISOString(),
    },
    generatedAt: new Date().toISOString(),
  }

  return dataset
}

async function main() {
  const args = process.argv.slice(2)
  let period = 2024
  for (const arg of args) {
    if (arg.startsWith('--period=')) {
      period = Number.parseInt(arg.split('=')[1], 10)
    }
  }

  console.log(`[test-data] Generando datos educativos para período ${period}...`)

  const outDir = join(process.cwd(), 'tmp', 'test-education-data')
  await mkdir(outDir, { recursive: true })

  for (const municipio of MUNICIPIOS_PRUEBA) {
    const dataset = await generarDatosEducativos(municipio, period)
    const fileName = `${municipio.ine}-education-${period}.json`
    const filePath = join(outDir, fileName)
    await writeFile(filePath, JSON.stringify(dataset, null, 2))
    console.log(
      `  ✓ ${municipio.nombre} (${municipio.ine}): ${dataset.values.length} valores, ${dataset.coveredSections}/${dataset.totalSections} secciones`,
    )
  }

  console.log(`[test-data] Completado. Archivos en ${outDir}`)
}

main().catch((err) => {
  console.error('[test-data] ERROR:', err.message)
  process.exit(1)
})
