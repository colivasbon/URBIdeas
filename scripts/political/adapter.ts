// Contrato común de adaptadores de fuentes electorales oficiales.
//
// Un adaptador = una fuente oficial (Interior nacional, GVA, Generalitat, …).
// No hay un parser monolítico con condicionales por comunidad: cada fuente
// implementa esta interfaz y el loader (`scripts/load-section-elections.ts`)
// orquesta descarga → esquema → filas de mesa → normalización → agregación →
// conciliación → geometría → publicación con el núcleo común de
// `scripts/political/core/`.
//
// Las filas que devuelve un adaptador son RECUENTOS por mesa. Los porcentajes
// los calcula el núcleo tras sumar mesas por sección.

import type { Candidacy, ElectionType, MunicipalTotals } from '../../src/lib/socideas-secciones-political'

/** Un fichero oficial concreto de una convocatoria. */
export interface SourceDescriptor {
  sourceId: string
  electionType: ElectionType
  electionDate: string
  /** Código CCAA (INE, 2 dígitos) si la fuente es autonómica. */
  territoryCode: string | null
  url: string
  fileName: string
  /** SHA-256 esperado si ya se verificó (matriz). */
  expectedSha256?: string | null
  format: string
  licence: string
  authority: string
  definitive: boolean
}

export interface DownloadedFile {
  descriptor: SourceDescriptor
  /** Ruta local del original (caché reanudable). */
  path: string
  sha256: string
  bytes: number
  httpStatus: number
  contentType: string
  state: 'downloaded' | 'unchanged'
  retrievedAt: string
}

export interface SchemaReport {
  ok: boolean
  /** Hojas / ficheros internos / tablas leídos. */
  parts: Array<{ name: string; columns: string[]; rows: number }>
  missing: string[]
  notes: string[]
}

/** Una mesa, con códigos TODAVÍA en bruto de la fuente. */
export interface PollingStationRow {
  electionType: ElectionType
  electionDate: string
  /** Códigos tal como vienen; `normalizeTerritorialCodes` los deja en 2/5/2/3. */
  provinceCode: string
  municipalityCode: string
  districtCode: string
  sectionCode: string
  /** Letra o código de mesa. */
  table: string
  census: number | null
  voters: number | null
  abstentions: number | null
  validVotes: number | null
  blankVotes: number | null
  nullVotes: number | null
  candidacyVotes: number | null
  /** sourceCandidacyCode → votos. Incluye ceros. */
  votes: Record<string, number>
  /** Mesas no territoriales (CERA, mesa de voto accesible…): se excluyen de la
   *  capa seccional y se documentan en la conciliación. */
  special: 'CERA' | 'special_table' | null
  municipalityName?: string | null
}

export interface RowValidationReport {
  ok: boolean
  rows: number
  errors: string[]
  warnings: string[]
}

export interface AdapterCoverage {
  electionType: ElectionType
  electionDate: string
  territoryCode: string | null
  provinces: number
  municipalities: number
  pollingStations: number
  sections: number
}

export interface AdapterMetadata {
  sourceId: string
  authority: string
  territoryCode: string | null
  level: 'polling_station' | 'section'
  licence: string
  portal: string
  parserVersion: string
  notes: string
}

export interface AdapterContext {
  /** Directorio de caché de originales: tmp/political-raw/{sourceId}/… */
  rawDir: string
  /** Revalidar contra el servidor aunque exista el fichero local. */
  resume: boolean
  log: (msg: string) => void
}

export interface OfficialElectionSourceAdapter {
  readonly sourceId: string
  supports(electionType: ElectionType, electionDate: string, territory?: string | null): boolean
  /** Ficheros oficiales de una convocatoria. Sin red si ya están en la matriz. */
  discover(electionType: ElectionType, electionDate: string, ctx: AdapterContext): Promise<SourceDescriptor[]>
  download(descriptor: SourceDescriptor, ctx: AdapterContext): Promise<DownloadedFile>
  verifyHash(file: DownloadedFile): boolean
  inspectSchema(files: DownloadedFile[]): Promise<SchemaReport>
  parsePollingStations(files: DownloadedFile[], ctx: AdapterContext): Promise<PollingStationRow[]>
  /** Deja provincia(2), municipio(5 = prov+mun), distrito(2), sección(3). */
  normalizeTerritorialCodes(row: PollingStationRow): PollingStationRow
  /** Candidaturas de la convocatoria, con id estable = código de la fuente. */
  normalizeCandidacies(files: DownloadedFile[]): Promise<Candidacy[]>
  validateSourceRows(rows: PollingStationRow[]): RowValidationReport
  getCoverage(rows: PollingStationRow[]): AdapterCoverage
  getMetadata(): AdapterMetadata
  /** Totales municipales oficiales de la misma fuente para conciliar, si existen. */
  municipalReference?(files: DownloadedFile[]): Promise<Map<string, MunicipalTotals>>
}
