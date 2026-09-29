// Lectura de resultados electorales desde R2 — SOLO SERVIDOR.
//
// Complementa al atlas base de secciones. Se obtiene bajo demanda cuando
// el usuario selecciona la pestaña Política.

import {
  POLITICAL_DOMAIN,
  POLITICAL_R2_PREFIX,
  POLITICAL_SCHEMA_VERSION,
  isValidPoliticalDataset,
  type PoliticalMunicipalDataset,
  type ElectionType,
} from './socideas-secciones-political'

export function politicalR2Key(codigoIne: string, electionType: ElectionType, electionDate: string): string {
  return `${POLITICAL_R2_PREFIX}/normalized/${electionType}/${electionDate}/${codigoIne}.json`
}

export function politicalR2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

class PoliticalDatasetInvalid extends Error {
  readonly invalid = true as const
}

export async function leerResultadosElectorales(
  codigoIne: string,
  electionType: ElectionType,
  electionDate: string,
  timeoutMs = 10000,
): Promise<PoliticalMunicipalDataset | null> {
  const url = `${politicalR2Base()}/${politicalR2Key(codigoIne, electionType, electionDate)}`
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
    if (!isValidPoliticalDataset(obj)) {
      throw new PoliticalDatasetInvalid('Schema inválido')
    }
    return obj
  } catch (err) {
    if (err instanceof PoliticalDatasetInvalid) return null
    return null
  } finally {
    clearTimeout(timer)
  }
}
