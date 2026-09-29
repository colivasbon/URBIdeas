// Indicadores políticos por sección electoral — CONTRATO COMPARTIDO.
//
// Fuente: Ministerio del Interior (Infoelectoral), resultados electorales
// por mesa y sección. Incluye municipales, autonómicas, Congreso, Senado,
// Parlamento Europeo.
//
// Estructura: objeto independiente por electionType + electionDate + municipio,
// referenciando la geometría electoral aplicable pero con resultados propios.

import type { SeccionValorStatus } from './socideas-secciones'

export const POLITICAL_DOMAIN = 'political'
export const POLITICAL_R2_PREFIX = 'socideas/secciones/v1/political'
export const POLITICAL_SCHEMA_VERSION = 'political-v1'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos electorales y candidaturas
// ─────────────────────────────────────────────────────────────────────────────

export type ElectionType = 'municipal' | 'autonomic' | 'congress' | 'senate' | 'european'

export interface Candidacy {
  /** ID único dentro de la elección. */
  id: string
  /** Nombre oficial de la candidatura. */
  name: string
  /** Siglas. */
  acronym: string
  /** Candidatura en sección o partido político. */
  type: 'party' | 'local' | 'coalition'
  /** Color primario para visualización. */
  color?: string | null
  /** Familias políticas opcionales (para comparación histórica). */
  politicalFamily?: string | null
}

/** Resultado de una candidatura en una sección. */
export interface CandidacyResult {
  candidacyId: string
  votes: number | null
  /** Porcentaje sobre votos válidos. */
  percentage: number | null
  position: number
  status: SeccionValorStatus
  note?: string | null
}

/** Resultados agregados de una sección electoral. */
export interface ElectionSectionResult {
  sectionCode: string
  districtCode: string
  /** Mesas electorales que componen esta sección. */
  pollingStations: string[]
  /** Censo electoral. */
  census: number | null
  /** Votantes. */
  voters: number | null
  /** Votos válidos. */
  validVotes: number | null
  blankVotes: number | null
  nullVotes: number | null
  /** Participación. */
  participationPercentage: number | null
  abstentionPercentage: number | null
  /** ID de candidatura ganadora. */
  winnerCandidacyId: string | null
  /** Votos del ganador. */
  winnerVotes: number | null
  winnerPercentage: number | null
  /** ID de segunda candidatura. */
  runnerUpCandidacyId: string | null
  runnerUpVotes: number | null
  runnerUpPercentage: number | null
  /** Margen en puntos porcentuales. */
  marginPoints: number | null
  /** Empate entre candidaturas. */
  tie: boolean
  /** Resultados por candidatura (ordenados por votos). */
  results: CandidacyResult[]
  /** Integridad del dato. */
  status: SeccionValorStatus
  note?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores políticos dinámicos
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

export interface PoliticalIndicator {
  id: string
  type: PoliticalIndicatorType
  label: string
  unit: string
  valueType: 'categorical' | 'continuous' | 'diverging'
  /** Solo para candidacy_percentage: candidacy ID. */
  candidacyId?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Objeto por municipio + convocatoria
// ─────────────────────────────────────────────────────────────────────────────

export interface ElectionGeometryReference {
  /** Año de delimitación del seccionado electoral. */
  year: number
  source: string
  /** Correspondencia con geometría. */
  correspondenceStatus: 'exact' | 'exact_code_temporal_mismatch' | 'documented_crosswalk' | 'unresolved'
  /** Secciones en geometría. */
  totalGeometrySections: number
  /** Secciones con resultados. */
  totalResultSections: number
  /** Secciones con coincidencia exacta. */
  matchedSections: number
  /** Secciones sin geometría. */
  unmatchedResults: number
  /** Geometrías sin resultado. */
  unmatchedGeometries: number
  coveragePercentage: number
  notes?: string[]
}

export interface PoliticalMunicipalDataset {
  schemaVersion: typeof POLITICAL_SCHEMA_VERSION
  domain: typeof POLITICAL_DOMAIN
  electionType: ElectionType
  /** Fecha de convocatoria (YYYY-MM-DD). */
  electionDate: string
  municipalityCode: string
  municipalityName: string
  provinceName: string
  /** Año de delimitación electoral (puede diferir de electionDate). */
  geometryYear: number
  geometryCollection: string
  geometrySource: string
  /** Estado de la geometría. */
  geometry: ElectionGeometryReference
  /** Candidaturas participantes. */
  candidacies: Candidacy[]
  /** Resultados agregados por sección. */
  sections: ElectionSectionResult[]
  /** Indicadores derivados. */
  indicators: PoliticalIndicator[]
  /** Validación de integridad. */
  validation: {
    sectionsProcessed: number
    pollingStationsAggregated: number
    censusTotal: number | null
    votersTotal: number | null
    validVotesTotal: number | null
    candidaciesProcessed: number
    tiesDetected: number
    geometryMatchRate: number
  }
  source: {
    url: string
    authority: string
    fileName: string
    state: 'provisional' | 'definitive'
    retrievedAt: string
  }
  generatedAt: string
}

export function isValidPoliticalDataset(obj: unknown): obj is PoliticalMunicipalDataset {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Partial<PoliticalMunicipalDataset>
  return (
    o.schemaVersion === POLITICAL_SCHEMA_VERSION &&
    o.domain === POLITICAL_DOMAIN &&
    typeof o.electionType === 'string' &&
    typeof o.electionDate === 'string' &&
    typeof o.municipalityCode === 'string' &&
    Array.isArray(o.sections)
  )
}
