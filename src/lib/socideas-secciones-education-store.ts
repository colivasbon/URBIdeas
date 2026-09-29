// Lectura de datos educativos desde R2 — SOLO SERVIDOR.
//
// Complementa al atlas base de secciones. Se obtiene bajo demanda cuando
// el usuario selecciona la pestaña Educación.

import {
  EDUCATION_DOMAIN,
  EDUCATION_R2_PREFIX,
  EDUCATION_SCHEMA_VERSION,
  isValidEducationDataset,
  type EducationMunicipalDataset,
} from './socideas-secciones-education'

export function educationR2Key(codigoIne: string, period: number): string {
  return `${EDUCATION_R2_PREFIX}/normalized/${period}/${codigoIne}.json`
}

export function educationR2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

class EducationDatasetInvalid extends Error {
  readonly invalid = true as const
}

export async function leerDatosEducativos(
  codigoIne: string,
  period: number,
  timeoutMs = 10000,
): Promise<EducationMunicipalDataset | null> {
  const url = `${educationR2Base()}/${educationR2Key(codigoIne, period)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const obj = await res.json()
    if (!isValidEducationDataset(obj)) {
      throw new EducationDatasetInvalid('Schema inválido')
    }
    return obj
  } catch (err) {
    if (err instanceof EducationDatasetInvalid) return null
    return null
  } finally {
    clearTimeout(timer)
  }
}
