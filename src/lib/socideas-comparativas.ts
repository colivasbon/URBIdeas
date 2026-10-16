// Comparativas territoriales ADRH (provincia / CCAA / España) servidas por
// PROVINCIA, para que la ficha muestre renta y desigualdad al ámbito elegido sin
// duplicar filas en los 8.000 envelopes municipales. SOLO SERVIDOR.
//
// Clave R2: `socideas/comparativas/v1/provincia/{prov2}.json`
// Publicada por `scripts/publish-comparativas.ts`. La fuente es el INE (ADRH,
// Tempus3): gini/p80_p20 (53688) y renta media neta/bruta por persona/hogar
// (53689). Sin geometría ni datos municipales.

import type { AmbitoTerritorial, IndicatorValue } from './socideas'

export const COMPARATIVAS_PREFIX = 'socideas/comparativas/v1/provincia'
export const COMPARATIVAS_SCHEMA = 'comparativas-v1'

export type ComparativaSlug =
  | 'gini'
  | 'p80_p20'
  | 'renta_neta_media_persona'
  | 'renta_neta_media_hogar'
  | 'renta_bruta_media_persona'
  | 'renta_bruta_media_hogar'

export const COMPARATIVA_UNIDAD: Record<ComparativaSlug, string> = {
  gini: 'puntos',
  p80_p20: 'ratio',
  renta_neta_media_persona: 'euros',
  renta_neta_media_hogar: 'euros',
  renta_bruta_media_persona: 'euros',
  renta_bruta_media_hogar: 'euros',
}

export interface ComparativaPunto {
  anio: number
  valor: number
}

export interface ComparativasProvincia {
  schema_version: string
  domain: 'adrh_comparativas'
  provincia: { code: string; name: string }
  ccaa: { name: string }
  source: { organism: string; url: string; retrieved_at: string }
  indicators: Partial<Record<ComparativaSlug, { unit: string; provincia: ComparativaPunto[]; ccaa: ComparativaPunto[]; espana: ComparativaPunto[] }>>
}

export function comparativasKey(prov2: string): string {
  return `${COMPARATIVAS_PREFIX}/${prov2}.json`
}

function r2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

async function leerJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function esObjetoComparativas(obj: unknown): obj is ComparativasProvincia {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Partial<ComparativasProvincia>
  return o.schema_version === COMPARATIVAS_SCHEMA && typeof o.domain === 'string' && !!o.provincia && !!o.indicators
}

/** Comparativas de una provincia. `null` si no están publicadas. */
export async function leerComparativas(prov2: string, timeoutMs = 12000): Promise<ComparativasProvincia | null> {
  if (!/^\d{2}$/.test(prov2)) return null
  const obj = await leerJson(`${r2Base()}/${comparativasKey(prov2)}`, timeoutMs)
  return esObjetoComparativas(obj) ? obj : null
}

/**
 * Convierte las comparativas en filas compatibles con el envelope (`IndicatorValue`)
 * para fusionarlas con los valores municipales. Solo se emiten puntos publicados;
 * nunca se inventan años. El nombre del territorio viaja en `dimensiones.nombre`.
 */
export function comparativasComoValores(
  obj: ComparativasProvincia,
  municipioCodigoIne: string,
): IndicatorValue[] {
  const out: IndicatorValue[] = []
  const now = obj.source?.retrieved_at ?? new Date().toISOString()
  for (const [slug, bloque] of Object.entries(obj.indicators) as [ComparativaSlug, NonNullable<ComparativasProvincia['indicators'][ComparativaSlug]>][]) {
    if (!bloque) continue
    const unidad = bloque.unit ?? COMPARATIVA_UNIDAD[slug] ?? null
    for (const [ambito, puntos] of [
      ['provincia', bloque.provincia],
      ['ccaa', bloque.ccaa],
      ['espana', bloque.espana],
    ] as [AmbitoTerritorial, ComparativaPunto[]][]) {
      const nombre = ambito === 'provincia' ? obj.provincia.name : ambito === 'ccaa' ? obj.ccaa.name : 'España'
      for (const p of puntos ?? []) {
        out.push({
          id: `cmp:${slug}:${ambito}:${p.anio}`,
          municipio_codigo_ine: municipioCodigoIne,
          indicator_id: slug,
          fecha_referencia: String(p.anio),
          anio_referencia: p.anio,
          valor_numerico: p.valor,
          valor_texto: null,
          unidad,
          dimensiones: { ambito, nombre },
          source_id: 'ine_adrh',
          source_url: obj.source?.url ?? null,
          source_table_id: null,
          source_series_id: null,
          obtenido_en: now,
          estado_validacion: 'validado',
          indicator: { slug } as unknown as IndicatorValue['indicator'],
          source: { organismo: 'INE · ADRH' } as unknown as IndicatorValue['source'],
        } as unknown as IndicatorValue)
      }
    }
  }
  return out
}

/**
 * Fusiona las filas comparativas con los valores del envelope, sin duplicar.
 * Dedupe por `slug|ambito|anio`: si el envelope ya trae esa fila (p. ej. gini en
 * los envelopes que ya tienen comparativas), NO se duplica. Solo se AÑADEN las
 * nuevas (p. ej. renta por ámbito, que el envelope municipal no incluye).
 */
export function fusionarValoresComparativas(
  base: IndicatorValue[],
  extra: IndicatorValue[],
): IndicatorValue[] {
  const clave = (v: IndicatorValue): string => {
    const slug = (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
    return `${slug}|${v.dimensiones?.ambito ?? 'municipio'}|${v.anio_referencia ?? ''}`
  }
  const vistas = new Set(base.map(clave))
  const nuevas = extra.filter((v) => !vistas.has(clave(v)))
  return nuevas.length > 0 ? [...base, ...nuevas] : base
}
