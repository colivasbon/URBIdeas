// Lectura de resultados electorales por sección desde R2 — SOLO SERVIDOR.
//
// Complementa al atlas base de secciones. Se obtiene bajo demanda cuando
// el usuario selecciona la pestaña Política.

import {
  POLITICAL_R2_PREFIX,
  isPoliticalMunicipalObject,
  type ElectionType,
  type PoliticalCatalog,
  type PoliticalCoverageFile,
  type PoliticalMunicipalObject,
} from './socideas-secciones-political'

export function politicalR2Key(codigoIne: string, electionType: ElectionType, electionDate: string): string {
  return `${POLITICAL_R2_PREFIX}/normalized/${electionType}/${electionDate}/${codigoIne}.json`
}

export const POLITICAL_CATALOG_KEY = `${POLITICAL_R2_PREFIX}/catalog.json`

export function politicalR2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

async function leerJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function leerCatalogoPolitico(timeoutMs = 10000): Promise<PoliticalCatalog | null> {
  const obj = await leerJson(`${politicalR2Base()}/${POLITICAL_CATALOG_KEY}`, timeoutMs)
  if (!obj || typeof obj !== 'object' || !Array.isArray((obj as PoliticalCatalog).elections)) return null
  return obj as PoliticalCatalog
}

export async function leerResultadosElectorales(
  codigoIne: string,
  electionType: ElectionType,
  electionDate: string,
  timeoutMs = 10000,
): Promise<PoliticalMunicipalObject | null> {
  const obj = await leerJson(`${politicalR2Base()}/${politicalR2Key(codigoIne, electionType, electionDate)}`, timeoutMs)
  return isPoliticalMunicipalObject(obj) ? obj : null
}

// ─────────────────────────────────────────────────────────────────────────────
// (Aditivo) Claves de manifiestos, cobertura, fuentes y originales, y lectura
// de la cobertura por convocatoria (explica por qué un municipio no se publica).
// ─────────────────────────────────────────────────────────────────────────────

export const POLITICAL_SOURCES_KEY = `${POLITICAL_R2_PREFIX}/sources.json`

export function politicalManifestKey(electionType: ElectionType, electionDate: string): string {
  return `${POLITICAL_R2_PREFIX}/manifests/${electionType}-${electionDate}.json`
}

export function politicalCoverageKey(electionType: ElectionType, electionDate: string): string {
  return `${POLITICAL_R2_PREFIX}/coverage/${electionType}/${electionDate}.json`
}

export function politicalRawKey(electionType: ElectionType, electionDate: string, sourceId: string, fileName: string): string {
  return `${POLITICAL_R2_PREFIX}/raw/${electionType}/${electionDate}/${sourceId}/${fileName}`
}

export async function leerCoberturaPolitica(
  electionType: ElectionType,
  electionDate: string,
  timeoutMs = 10000,
): Promise<PoliticalCoverageFile | null> {
  const obj = await leerJson(`${politicalR2Base()}/${politicalCoverageKey(electionType, electionDate)}`, timeoutMs)
  if (!obj || typeof obj !== 'object' || typeof (obj as PoliticalCoverageFile).municipalities !== 'object') return null
  return obj as PoliticalCoverageFile
}
