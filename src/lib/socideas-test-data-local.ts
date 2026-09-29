// Helper para servir datos de prueba localmente durante desarrollo.
// SOLO se ejecuta en development, nunca en producción.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EducationMunicipalDataset } from './socideas-secciones-education'

let cacheTestData: Map<string, EducationMunicipalDataset> | null = null

export async function leerDatosEducativosLocalDev(
  codigoIne: string,
  period: number,
): Promise<EducationMunicipalDataset | null> {
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  if (!cacheTestData) {
    cacheTestData = new Map()
  }

  const cacheKey = `${codigoIne}-${period}`
  if (cacheTestData.has(cacheKey)) {
    return cacheTestData.get(cacheKey) ?? null
  }

  try {
    const testDataPath = join(
      process.cwd(),
      'tmp',
      'test-education-data',
      `${codigoIne}-education-${period}.json`,
    )
    const contenido = await readFile(testDataPath, 'utf-8')
    const datos = JSON.parse(contenido) as EducationMunicipalDataset
    cacheTestData.set(cacheKey, datos)
    return datos
  } catch {
    return null
  }
}
