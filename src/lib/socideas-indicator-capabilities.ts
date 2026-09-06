// Registro único de capacidades de indicador SOCideas.
// Todo se deriva de VALORES REALES del envelope (isRealValue): ninguna dimensión
// se declara disponible sin filas. Impide selectores ad hoc desconectados.
// Reutilizable por ficha, tablas, gráficos, descargas futuras y coropletas.
import type { IndicatorValue, PerfilDemografico, PerfilEconomico } from './socideas'
import { isRealValue } from './socideas-availability'

export type SocideasDimension =
  | 'scope'
  | 'period'
  | 'sex'
  | 'age_group'
  | 'nationality'
  | 'birth_country'
  | 'birth_residence_relation'
  | 'economic_sector'
  | 'source'
  | 'availability'

export type SocideasUnit = 'personas' | 'euros' | 'porcentaje' | 'ratio' | 'indice' | 'hectareas' | 'empresas'

export interface SocideasScopeOption {
  id: string
  label: string
  periods: number[]
}

export interface SocideasIndicatorCapability {
  id: string
  block: 'demografia' | 'economia'
  label: string
  definition?: string
  unit: SocideasUnit
  source: string
  sourceUrl?: string
  kind: 'series' | 'snapshot'
  scopes: SocideasScopeOption[]
  defaultScope: string
  supportsChart: boolean
  comparisonNote?: string
  availability: 'available' | 'partial' | 'pending' | 'without_coverage'
}

export interface SocideasPoint { anio: number; valor: number }

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
}

/** Puntos reales de un indicador y ámbito, ordenados. Sin estimar ni interpolar. */
export function capabilityPoints(
  valores: IndicatorValue[],
  slug: string,
  scope = 'municipio',
): SocideasPoint[] {
  return valores
    .filter((v) => slugOf(v) === slug && isRealValue(v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === scope)
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
    .filter((p) => p.anio > 0)
    .sort((a, b) => a.anio - b.anio)
}

function periodsOf(points: SocideasPoint[]): number[] {
  return [...new Set(points.map((p) => p.anio))].sort((a, b) => a - b)
}

function ultimoConUrl(valores: IndicatorValue[], slug: string, scope = 'municipio'): IndicatorValue | null {
  const list = valores
    .filter((v) => slugOf(v) === slug && isRealValue(v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === scope)
    .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))
  return list.length > 0 ? list[list.length - 1] : null
}

export const SCOPE_LABEL: Record<string, string> = {
  municipio: 'Municipio',
  provincia: 'Provincia',
  ccaa: 'Comunidad autónoma',
  espana: 'España',
}

/** Colores de serie por ámbito (misma convención que la ficha demográfica). */
export const SCOPE_COLOR: Record<string, string> = {
  municipio: 'var(--color-secondary)',
  provincia: 'var(--color-primary)',
  ccaa: '#b7791f',
  espana: 'var(--color-text-muted)',
}

function rangeNote(scopes: SocideasScopeOption[]): string | undefined {
  const maxes = scopes.map((s) => ({ id: s.label, max: Math.max(...s.periods) }))
  const min = Math.min(...maxes.map((m) => m.max))
  const lag = maxes.filter((m) => m.max > min)
  if (lag.length === 0) return undefined
  return `Último año distinto por ámbito (${maxes.map((m) => `${m.id}: ${m.max}`).join(' · ')}): no deben leerse como contemporáneos sin indicarlo.`
}

// ---------- Demografía ----------

export function demoCapabilities(perfil: PerfilDemografico): SocideasIndicatorCapability[] {
  const caps: SocideasIndicatorCapability[] = []
  const evo = (perfil.evolucion ?? [])
    .filter((v) => isRealValue(v.valor_numerico))
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
    .filter((p) => p.anio > 0)
    .sort((a, b) => a.anio - b.anio)
  const comp = (lista: IndicatorValue[] | undefined): SocideasPoint[] =>
    (lista ?? [])
      .filter((v) => isRealValue(v.valor_numerico))
      .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
      .filter((p) => p.anio > 0)
      .sort((a, b) => a.anio - b.anio)
  const scopes: SocideasScopeOption[] = []
  if (evo.length > 0) scopes.push({ id: 'municipio', label: 'Municipio', periods: periodsOf(evo) })
  for (const [id, lista] of [['provincia', perfil.comparativas?.provincia], ['ccaa', perfil.comparativas?.ccaa], ['espana', perfil.comparativas?.espana]] as const) {
    const pts = comp(lista)
    if (pts.length > 0) scopes.push({ id, label: SCOPE_LABEL[id], periods: periodsOf(pts) })
  }
  if (scopes.length > 0) {
    caps.push({
      id: 'poblacion_total', block: 'demografia', label: 'Población total',
      definition: 'Cifras oficiales de población por ámbito territorial.',
      unit: 'personas', source: 'INE · Tempus3', sourceUrl: perfil.evolucion?.[0]?.source_url ?? undefined,
      kind: 'series', scopes, defaultScope: 'municipio',
      supportsChart: scopes.some((s) => s.periods.length >= 2),
      comparisonNote: rangeNote(scopes), availability: 'available',
    })
  }
  const corte = (iv: IndicatorValue | null, id: string, label: string): void => {
    if (!iv || !isRealValue(iv.valor_numerico) || iv.anio_referencia == null) return
    caps.push({
      id, block: 'demografia', label,
      definition: `${label} del año de referencia (dato de corte, sin serie publicada).`,
      unit: 'personas', source: 'INE · Tempus3', sourceUrl: iv.source_url ?? undefined,
      kind: 'snapshot',
      scopes: [{ id: 'municipio', label: 'Municipio', periods: [iv.anio_referencia] }],
      defaultScope: 'municipio', supportsChart: false, availability: 'available',
    })
  }
  corte(perfil.hombres, 'poblacion_hombres', 'Hombres')
  corte(perfil.mujeres, 'poblacion_mujeres', 'Mujeres')
  return caps
}

// ---------- Economía ----------

interface EcoDef {
  slug: string
  label: string
  definition: string
  unit: SocideasUnit
  source: string
  withScopes: boolean
}

const ECO_DEFS: EcoDef[] = [
  { slug: 'renta_neta_media_persona', label: 'Renta neta media por persona', definition: 'Atlas de Distribución de Renta de los Hogares (hogares, por persona).', unit: 'euros', source: 'INE · ADRH', withScopes: false },
  { slug: 'renta_neta_media_hogar', label: 'Renta neta media por hogar', definition: 'Atlas de Distribución de Renta de los Hogares (por hogar).', unit: 'euros', source: 'INE · ADRH', withScopes: false },
  { slug: 'renta_bruta_media_persona', label: 'Renta bruta media por persona', definition: 'Atlas de Distribución de Renta de los Hogares (por persona).', unit: 'euros', source: 'INE · ADRH', withScopes: false },
  { slug: 'renta_bruta_media_hogar', label: 'Renta bruta media por hogar', definition: 'Atlas de Distribución de Renta de los Hogares (por hogar).', unit: 'euros', source: 'INE · ADRH', withScopes: false },
  { slug: 'irpf_declaraciones', label: 'Declaraciones de IRPF (por declaración)', definition: 'Número de declaraciones; importes por declaración, no por habitante.', unit: 'personas', source: 'AEAT · EDM', withScopes: false },
  { slug: 'irpf_renta_bruta_media', label: 'Renta bruta media por declaración', definition: 'Media por declaración (tributación individual o conjunta).', unit: 'euros', source: 'AEAT · EDM', withScopes: false },
  { slug: 'irpf_renta_disponible_media', label: 'Renta disponible media por declaración', definition: 'Media por declaración (tributación individual o conjunta).', unit: 'euros', source: 'AEAT · EDM', withScopes: false },
  { slug: 'gini', label: 'Índice de Gini', definition: 'Desigualdad de la renta por unidad de consumo (0–100).', unit: 'indice', source: 'INE · ADRH', withScopes: true },
  { slug: 'p80_p20', label: 'Ratio P80/P20', definition: 'Percentil 80 frente al percentil 20.', unit: 'ratio', source: 'INE · ADRH', withScopes: true },
  { slug: 'empresas_total', label: 'Empresas activas', definition: 'Empresas con sede en el municipio (no equivale a ocupados).', unit: 'empresas', source: 'INE · DIRCE', withScopes: false },
]

export function ecoCapabilities(perfil: PerfilEconomico): SocideasIndicatorCapability[] {
  const { valores } = perfil
  const caps: SocideasIndicatorCapability[] = []
  for (const def of ECO_DEFS) {
    const muni = capabilityPoints(valores, def.slug, 'municipio')
    if (muni.length === 0) continue // sin filas válidas: sin selector
    const scopes: SocideasScopeOption[] = [{ id: 'municipio', label: 'Municipio', periods: periodsOf(muni) }]
    if (def.withScopes) {
      for (const id of ['provincia', 'ccaa', 'espana']) {
        const pts = capabilityPoints(valores, def.slug, id)
        if (pts.length > 0) scopes.push({ id, label: SCOPE_LABEL[id], periods: periodsOf(pts) })
      }
    }
    caps.push({
      id: def.slug, block: 'economia', label: def.label, definition: def.definition,
      unit: def.unit, source: def.source, sourceUrl: ultimoConUrl(valores, def.slug)?.source_url ?? undefined,
      kind: muni.length > 1 ? 'series' : 'snapshot',
      scopes, defaultScope: 'municipio',
      supportsChart: scopes.some((s) => s.periods.length >= 2),
      comparisonNote: rangeNote(scopes), availability: 'available',
    })
  }
  return caps
}

// ---------- Estado URL (solo filtros no sensibles, validados) ----------

export interface ExplorerQuery {
  ind: string | null
  desde: number | null
  hasta: number | null
  anio: number | null
  ambitos: string[]
}

export interface ExplorerState {
  indId: string
  desde: number | null
  hasta: number | null
  anio: number | null
  scopes: string[]
}

/** Valida query contra capacidades; lo inválido se ignora hacia estado seguro. */
export function validateExplorerQuery(
  q: Record<string, string>,
  caps: SocideasIndicatorCapability[],
): ExplorerState | null {
  if (caps.length === 0) return null
  const cap = caps.find((c) => c.id === q.x_ind) ?? caps[0]
  const num = (v: string | undefined): number | null =>
    v !== undefined && /^\d{4}$/.test(v) ? parseInt(v, 10) : null
  const allPeriods = [...new Set(cap.scopes.flatMap((s) => s.periods))].sort((a, b) => a - b)
  if (cap.kind === 'series') {
    let desde = num(q.x_desde)
    let hasta = num(q.x_hasta)
    if (desde !== null && !allPeriods.includes(desde)) desde = null
    if (hasta !== null && !allPeriods.includes(hasta)) hasta = null
    if (desde !== null && hasta !== null && desde > hasta) { desde = null; hasta = null }
    const validScopes = cap.scopes.map((s) => s.id)
    const asked = (q.x_ambitos ?? '').split(',').map((s) => s.trim()).filter((s) => validScopes.includes(s))
    return { indId: cap.id, desde, hasta, anio: null, scopes: asked.length > 0 ? asked : [cap.defaultScope] }
  }
  const muniPeriods = cap.scopes[0]?.periods ?? []
  let anio = num(q.x_anio)
  if (anio !== null && !muniPeriods.includes(anio)) anio = null
  return { indId: cap.id, desde: null, hasta: null, anio: anio ?? (muniPeriods.length > 0 ? muniPeriods[muniPeriods.length - 1] : null), scopes: [cap.defaultScope] }
}

export function explorerQueryString(s: ExplorerState): string {
  const p = new URLSearchParams()
  p.set('x_ind', s.indId)
  if (s.desde !== null) p.set('x_desde', String(s.desde))
  if (s.hasta !== null) p.set('x_hasta', String(s.hasta))
  if (s.anio !== null) p.set('x_anio', String(s.anio))
  if (s.scopes.length > 0) p.set('x_ambitos', s.scopes.join(','))
  return p.toString()
}
