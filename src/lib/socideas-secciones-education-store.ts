// Lectura de datos educativos y de actividad por sección censal desde R2.
// SOLO SERVIDOR.
//
// La fuente es `socideas/secciones/v1/education/normalized/{period}/{ine}.json`
// (objeto `EducationMunicipalObject`) y el catálogo
// `socideas/secciones/v1/education/catalog.json`, que es la ÚNICA fuente de
// verdad sobre qué periodos están publicados y qué indicadores existen.
//
// El objeto educativo NO lleva geometría: se une por CUSEC de 10 dígitos con
// la del atlas (o con la del INE cuando el municipio no tiene atlas base).

import {
  EDUCATION_DOMAIN,
  EDUCATION_R2_PREFIX,
  isEducationMunicipalObject,
  type EducationCatalog,
  type EducationMunicipalObject,
} from './socideas-secciones-education'

export const EDUCATION_CATALOG_KEY = `${EDUCATION_R2_PREFIX}/catalog.json`

export function educationR2Key(codigoIne: string, period: number): string {
  return `${EDUCATION_R2_PREFIX}/normalized/${period}/${codigoIne}.json`
}

export function educationRawKey(edition: number, provinceCode: string, table: number): string {
  return `${EDUCATION_R2_PREFIX}/raw/${edition}/${provinceCode}/${table}.csv`
}

export function educationR2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

export function educationPublicUrl(key: string): string {
  return `${educationR2Base()}/${key}`
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

/** Catálogo educativo: periodos realmente publicados y disponibilidad global. */
export async function leerCatalogoEducativo(timeoutMs = 10000): Promise<EducationCatalog | null> {
  const obj = await leerJson(`${educationR2Base()}/${EDUCATION_CATALOG_KEY}`, timeoutMs)
  if (!obj || typeof obj !== 'object') return null
  const c = obj as Partial<EducationCatalog>
  if (c.domain !== EDUCATION_DOMAIN || !Array.isArray(c.periods) || !Array.isArray(c.indicators)) return null
  return c as EducationCatalog
}

/** Objeto educativo de UN municipio y UN periodo. `null` si no está publicado. */
export async function leerObjetoEducativo(
  codigoIne: string,
  period: number,
  timeoutMs = 15000,
): Promise<EducationMunicipalObject | null> {
  const obj = await leerJson(`${educationR2Base()}/${educationR2Key(codigoIne, period)}`, timeoutMs)
  return isEducationMunicipalObject(obj) ? obj : null
}

/** Periodos con objeto publicado para este municipio (de mayor a menor). */
export async function leerPeriodosEducativos(
  codigoIne: string,
  timeoutMs = 15000,
): Promise<number[]> {
  const cat = await leerCatalogoEducativo(timeoutMs)
  if (!cat) return []
  const out: number[] = []
  for (const p of [...cat.periods].sort((a, b) => b - a)) {
    const obj = await leerObjetoEducativo(codigoIne, p, timeoutMs)
    if (obj) out.push(p)
  }
  return out
}
