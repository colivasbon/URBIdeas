// Resultados electorales por sección — CONTRATO COMPARTIDO (puro, sin I/O).
//
// Lo escriben los adaptadores y el loader (`scripts/political/**`,
// `scripts/load-section-elections.ts`) y lo leen la API y el atlas.
//
// FUENTES
//   Nacional: Ministerio del Interior, Infoelectoral, paquetes APLIEXTR por mesa
//     https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/{tt}{aaaa}{mm}_MESA.zip
//     ficheros 09 (datos globales de mesa) y 10 (votos por candidatura y mesa),
//     03 (candidaturas). Cubre municipales, Congreso, Senado y europeas.
//   Autonómicas: una fuente oficial por comunidad, cada una con su adaptador
//     (ver `tmp/audit/political/spain-official-sources-matrix.json`).
//
// REGLAS QUE ESTE CONTRATO HACE CUMPLIR
//   - La clave de agregación es provincia(2) + municipio(3) + distrito(2) +
//     sección(3). Nunca el nombre. `sectionKey` = esa concatenación de 10
//     dígitos, compatible con el CUSEC del INE.
//   - Se suman RECUENTOS de mesa; los porcentajes se calculan DESPUÉS sobre la
//     suma. Nunca se promedian porcentajes.
//   - Un 0 es un dato: una candidatura con 0 votos en una sección se conserva.
//   - No se reparten totales municipales entre secciones, ni diferencias de
//     conciliación.
//   - Denominadores (LOREG y práctica de Interior):
//       participación  = votantes / censo
//       abstención     = (censo − votantes) / censo
//       candidatura %  = votos candidatura / votos válidos (válidos = candidaturas + blancos)
//       blancos %      = blancos / votos válidos
//       nulos %        = nulos / votantes
//       margen         = % ganador − % segundo (puntos, sobre válidos)
//       concentración  = % ganador + % segundo (sobre válidos)

import type { SeccionValorStatus } from './socideas-secciones'

export const POLITICAL_DOMAIN = 'political'
export const POLITICAL_R2_PREFIX = 'socideas/secciones/v1/political'
export const POLITICAL_SCHEMA_VERSION = 'political-v1'

// ─────────────────────────────────────────────────────────────────────────────
// Convocatorias
// ─────────────────────────────────────────────────────────────────────────────

export type ElectionType = 'municipal' | 'autonomic' | 'congress' | 'senate' | 'european'

export const ELECTION_TYPES: readonly ElectionType[] = ['municipal', 'autonomic', 'congress', 'senate', 'european']

export const ELECTION_TYPE_LABEL: Record<ElectionType, string> = {
  municipal: 'Municipales',
  autonomic: 'Autonómicas',
  congress: 'Congreso',
  senate: 'Senado',
  european: 'Europeas',
}

/** Código de tipo de proceso en los ficheros de Interior (xx en nnxxaamm.DAT). */
export const INTERIOR_PROCESS_CODE: Partial<Record<ElectionType, string>> = {
  congress: '02',
  senate: '03',
  municipal: '04',
  autonomic: '05',
  european: '07',
}

/** `municipal-2023-05-28`. Estable: se usa en rutas R2 y en la URL. */
export function electionId(type: ElectionType, date: string): string {
  return `${type}-${date}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidaturas
// ─────────────────────────────────────────────────────────────────────────────

export interface Candidacy {
  /** Id estable dentro de la convocatoria (código de candidatura de la fuente). */
  id: string
  /** Siglas tal como las publica la fuente. */
  acronym: string
  /** Denominación oficial. */
  name: string
  type: 'party' | 'coalition' | 'local' | 'unknown'
  /** Código de la fuente (Interior: código de candidatura del fichero 03). */
  sourceCode: string
  /** Código de acumulación provincial / autonómica / nacional si la fuente lo da. */
  aggregationCode?: string | null
  /** (Aditivo) Los tres códigos de candidatura cabecera de acumulación del
   *  fichero 03 de Interior. `aggregationCode` = el nacional. */
  aggregationCodes?: { provincial: string | null; autonomic: string | null; national: string | null }
  /** Color para el mapa categórico. Lo asigna el loader, no la interfaz. */
  color: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección agregada
// ─────────────────────────────────────────────────────────────────────────────

export interface ElectionSectionResult {
  /** prov(2)+mun(3)+dist(2)+sec(3). Compatible con CUSEC. */
  sectionKey: string
  provinceCode: string
  municipalityCode: string
  districtCode: string
  sectionCode: string
  /** Mesas agregadas (letra o código de mesa de la fuente). */
  pollingStations: string[]
  census: number | null
  voters: number | null
  abstentions: number | null
  validVotes: number | null
  blankVotes: number | null
  nullVotes: number | null
  /** Suma de votos a candidaturas (válidos − blancos). */
  candidacyVotes: number | null
  /** candidacyId → votos. Incluye ceros. */
  votes: Record<string, number>
  participationPct: number | null
  abstentionPct: number | null
  blankPct: number | null
  nullPct: number | null
  winnerId: string | null
  runnerUpId: string | null
  winnerPct: number | null
  runnerUpPct: number | null
  marginPoints: number | null
  top2ConcentrationPct: number | null
  tie: boolean
  status: SeccionValorStatus
  /** true si la sección tiene polígono en la geometría de referencia. */
  geometryMatch: boolean
  notes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría y conciliación
// ─────────────────────────────────────────────────────────────────────────────

export type CorrespondenceStatus = 'exact' | 'exact_code_temporal_mismatch' | 'documented_crosswalk' | 'unresolved'

export interface ElectionGeometryReference {
  /** Año del seccionado usado para dibujar (el del atlas base). */
  geometryYear: number | null
  geometrySource: string
  electionDate: string
  correspondenceStatus: CorrespondenceStatus
  resultSections: number
  geometrySections: number
  matchedSections: number
  unmatchedResultSections: string[]
  unmatchedGeometrySections: string[]
  coveragePercentage: number
  notes: string[]
}

export type ReconciliationStatus =
  | 'exact_match'
  | 'expected_special_tables_difference'
  | 'confirmed_CERA_difference'
  | 'source_scope_difference'
  | 'incomplete_coverage'
  | 'candidacy_mapping_error'
  | 'unresolved'
  | 'not_checked'

export interface MunicipalTotals {
  census: number | null
  voters: number | null
  validVotes: number | null
  blankVotes: number | null
  nullVotes: number | null
  candidacyVotes: number | null
  votes: Record<string, number>
}

export interface ReconciliationReport {
  status: ReconciliationStatus
  /** Qué referencia se usó: 'interior-05-06' (datos municipales Interior), objeto R2 municipal, etc. */
  reference: string | null
  sectionTotals: MunicipalTotals
  referenceTotals: MunicipalTotals | null
  /** campo → sección − referencia. */
  differences: Record<string, number>
  notes: string[]
  /** (Aditivo) Mesas no territoriales (CERA, etc.) presentes en el fichero y
   *  excluidas de la capa seccional. `scope` indica a qué ámbito las atribuye
   *  la fuente: Interior publica el CERA por provincia/distrito electoral
   *  (municipio 999), nunca por municipio. */
  specialTables?: {
    kind: 'CERA' | 'special_table'
    scope: 'municipality' | 'province' | 'none'
    pollingStations: number
    totals: MunicipalTotals | null
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Objeto publicado en R2 (uno por convocatoria y municipio)
//   socideas/secciones/v1/political/normalized/{electionType}/{electionDate}/{codigoINE}.json
// ─────────────────────────────────────────────────────────────────────────────

export interface PoliticalMunicipalObject {
  schema_version: typeof POLITICAL_SCHEMA_VERSION
  domain: typeof POLITICAL_DOMAIN
  electionId: string
  electionType: ElectionType
  electionDate: string
  /** Ámbito de la convocatoria autonómica (código CCAA), si aplica. */
  territoryCode: string | null
  municipalityCode: string
  municipalityName: string
  provinceCode: string
  sourceId: string
  parserVersion: string
  source: {
    authority: string
    url: string
    fileName: string
    sha256: string
    definitive: boolean
    licence: string
    retrievedAt: string
    /** (Aditivo) Clave R2 del original: raw/{type}/{date}/{sourceId}/{file}. */
    rawKey?: string | null
  }
  candidacies: Candidacy[]
  sections: ElectionSectionResult[]
  totals: MunicipalTotals
  reconciliation: ReconciliationReport
  geometry: ElectionGeometryReference
  /** `unresolved` bloquea la publicación del municipio (no la de los demás). */
  publication: { publishable: boolean; reason: string | null; warnings: string[] }
  /** SHA-256 del contenido sin campos volátiles. Base de la idempotencia. */
  content_sha256: string
}

export function isPoliticalMunicipalObject(obj: unknown): obj is PoliticalMunicipalObject {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Partial<PoliticalMunicipalObject>
  return (
    o.schema_version === POLITICAL_SCHEMA_VERSION &&
    o.domain === POLITICAL_DOMAIN &&
    typeof o.electionType === 'string' &&
    typeof o.electionDate === 'string' &&
    typeof o.municipalityCode === 'string' &&
    /^\d{5}$/.test(o.municipalityCode) &&
    Array.isArray(o.sections) &&
    Array.isArray(o.candidacies)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo, fuentes y cobertura
// ─────────────────────────────────────────────────────────────────────────────

/** `socideas/secciones/v1/political/catalog.json` */
export interface PoliticalCatalog {
  schema_version: typeof POLITICAL_SCHEMA_VERSION
  domain: typeof POLITICAL_DOMAIN
  synced_at: string
  elections: Array<{
    electionId: string
    electionType: ElectionType
    electionDate: string
    label: string
    territoryCode: string | null
    sourceIds: string[]
    definitive: boolean
    municipalities: number
    publishableMunicipalities: number
    sections: number
    pollingStations: number
    /** Códigos INE con objeto publicable para esta convocatoria. */
    municipalityCodes: string[]
  }>
}

/** (Aditivo) `socideas/secciones/v1/political/manifests/{electionType}-{electionDate}.json`
 *  Una entrada por fuente (`sourceId`); el catálogo se reconstruye SÓLO desde
 *  los manifiestos. Cada ejecución del loader fusiona sus municipios en la
 *  entrada de su fuente sin tocar las de otras fuentes. */
export interface PoliticalManifest {
  schema_version: typeof POLITICAL_SCHEMA_VERSION
  domain: typeof POLITICAL_DOMAIN
  electionId: string
  electionType: ElectionType
  electionDate: string
  label: string
  territoryCode: string | null
  synced_at: string
  sources: Record<string, PoliticalManifestSource>
}

export interface PoliticalManifestSource {
  sourceId: string
  authority: string
  territoryCode: string | null
  url: string
  fileName: string
  sha256: string
  rawKey: string | null
  licence: string
  definitive: boolean
  parserVersion: string
  retrievedAt: string
  synced_at: string
  municipalities: Record<
    string,
    {
      key: string | null
      content_sha256: string | null
      municipalityName: string
      publishable: boolean
      reason: string | null
      sections: number
      pollingStations: number
      geometryYear: number | null
      correspondenceStatus: CorrespondenceStatus
      reconciliationStatus: ReconciliationStatus
    }
  >
  /** Mesas no territoriales documentadas (CERA por provincia/distrito). */
  specialTables: Array<{
    kind: 'CERA' | 'special_table'
    provinceCode: string
    districtCode: string
    communityCode: string
    pollingStations: number
    census: number | null
    voters: number | null
    validVotes: number | null
  }>
}

/** (Aditivo) URL oficial del paquete APLIEXTR por mesa de Interior. */
export const INTERIOR_APLIEXTR_BASE = 'https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr'

export function interiorApliextrFileName(type: ElectionType, date: string): string | null {
  const tt = INTERIOR_PROCESS_CODE[type]
  if (!tt || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return `${tt}${date.slice(0, 4)}${date.slice(5, 7)}_MESA.zip`
}

/** `socideas/secciones/v1/political/sources.json` */
export interface PoliticalSourcesRegistry {
  schema_version: typeof POLITICAL_SCHEMA_VERSION
  synced_at: string
  sources: Array<{
    sourceId: string
    authority: string
    territoryCode: string | null
    electionTypes: ElectionType[]
    level: 'polling_station' | 'section' | 'municipality'
    url: string
    licence: string
    implementation_status:
      | 'implemented'
      | 'source_verified'
      | 'parser_pending'
      | 'municipality_only'
      | 'viewer_endpoint_verified'
      | 'unavailable_after_verified_search'
      | 'geometry_blocked'
    notes: string
  }>
}

/** `socideas/secciones/v1/political/coverage/{electionType}/{electionDate}.json` */
export interface PoliticalCoverageFile {
  schema_version: typeof POLITICAL_SCHEMA_VERSION
  electionId: string
  synced_at: string
  municipalities: Record<
    string,
    {
      resultSections: number
      geometrySections: number
      matchedSections: number
      coveragePercentage: number
      correspondenceStatus: CorrespondenceStatus
      reconciliationStatus: ReconciliationStatus
      publishable: boolean
      reason: string | null
    }
  >
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores que ofrece la interfaz
// ─────────────────────────────────────────────────────────────────────────────

export type PoliticalIndicatorType =
  | 'winner'
  | 'participation'
  | 'abstention'
  | 'margin'
  | 'blank_votes'
  | 'null_votes'
  | 'candidacy_percentage'
  | 'concentration_top2'

export const POLITICAL_INDICATORS: ReadonlyArray<{
  type: PoliticalIndicatorType
  label: string
  unit: string
  valueType: 'categorical' | 'continuous'
  denominator: string | null
}> = [
  { type: 'winner', label: 'Candidatura ganadora', unit: '', valueType: 'categorical', denominator: null },
  { type: 'participation', label: 'Participación', unit: '%', valueType: 'continuous', denominator: 'Censo electoral' },
  { type: 'abstention', label: 'Abstención', unit: '%', valueType: 'continuous', denominator: 'Censo electoral' },
  { type: 'margin', label: 'Margen ganador − segundo', unit: 'p. p.', valueType: 'continuous', denominator: 'Votos válidos' },
  { type: 'blank_votes', label: 'Votos en blanco', unit: '%', valueType: 'continuous', denominator: 'Votos válidos' },
  { type: 'null_votes', label: 'Votos nulos', unit: '%', valueType: 'continuous', denominator: 'Votantes' },
  { type: 'candidacy_percentage', label: 'Voto a candidatura', unit: '%', valueType: 'continuous', denominator: 'Votos válidos' },
  { type: 'concentration_top2', label: 'Concentración dos primeras', unit: '%', valueType: 'continuous', denominator: 'Votos válidos' },
]

/** Porcentaje con denominador explícito. null si el denominador es 0 o nulo. */
export function pct(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null
  return (num / den) * 100
}
