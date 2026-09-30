// Montaje del objeto publicado, manifiestos, cobertura, fuentes y catálogo.
// Puro salvo checkpoint (disco local). La E/S R2 vive en r2.ts y en el loader.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { contentSha256 } from './hash'
import { BLOCKING_RECONCILIATION, isCensusOnlyDifference } from './reconcile'
import {
  ELECTION_TYPE_LABEL,
  POLITICAL_DOMAIN,
  POLITICAL_R2_PREFIX,
  POLITICAL_SCHEMA_VERSION,
  electionId,
  type Candidacy,
  type ElectionGeometryReference,
  type ElectionSectionResult,
  type ElectionType,
  type MunicipalTotals,
  type PoliticalCatalog,
  type PoliticalCoverageFile,
  type PoliticalManifest,
  type PoliticalManifestSource,
  type PoliticalMunicipalObject,
  type PoliticalSourcesRegistry,
  type ReconciliationReport,
} from '../../../src/lib/socideas-secciones-political'

export const keys = {
  normalized: (t: ElectionType, d: string, ine: string) => `${POLITICAL_R2_PREFIX}/normalized/${t}/${d}/${ine}.json`,
  manifest: (t: ElectionType, d: string) => `${POLITICAL_R2_PREFIX}/manifests/${t}-${d}.json`,
  coverage: (t: ElectionType, d: string) => `${POLITICAL_R2_PREFIX}/coverage/${t}/${d}.json`,
  raw: (t: ElectionType, d: string, sourceId: string, file: string) => `${POLITICAL_R2_PREFIX}/raw/${t}/${d}/${sourceId}/${file}`,
  sources: () => `${POLITICAL_R2_PREFIX}/sources.json`,
  catalog: () => `${POLITICAL_R2_PREFIX}/catalog.json`,
  manifestsPrefix: () => `${POLITICAL_R2_PREFIX}/manifests/`,
}

export interface PublicationDecision {
  publishable: boolean
  reason: string | null
  warnings: string[]
}

/** Regla única de publicación por municipio. */
export function decidePublication(args: {
  sections: ElectionSectionResult[]
  geometry: ElectionGeometryReference
  reconciliation: ReconciliationReport
  validationErrors: string[]
  validationWarnings: string[]
  /** Política opcional (por defecto false): una conciliación unresolved cuya
   *  ÚNICA diferencia es el censo no bloquea; se publica con aviso. */
  allowCensusOnlyDifference?: boolean
}): PublicationDecision {
  const reasons: string[] = []
  const warnings: string[] = [...args.validationWarnings]
  if (args.sections.length === 0) reasons.push('sin secciones con resultados')
  if (args.validationErrors.length) reasons.push(`validación de mesas: ${args.validationErrors.slice(0, 3).join(' | ')}${args.validationErrors.length > 3 ? ` (+${args.validationErrors.length - 3})` : ''}`)
  if (args.geometry.correspondenceStatus === 'unresolved') {
    reasons.push(
      `geometría unresolved (seccionado ${args.geometry.geometryYear ?? 'ND'}: ${args.geometry.unmatchedResultSections.length} secciones sin polígono, ${args.geometry.unmatchedGeometrySections.length} polígonos sin resultados)`,
    )
  }
  const censusOnlyAllowed =
    !!args.allowCensusOnlyDifference &&
    args.reconciliation.status === 'unresolved' &&
    isCensusOnlyDifference(args.reconciliation.differences)
  if (censusOnlyAllowed) {
    warnings.push(
      `conciliación unresolved sólo en censo (${args.reconciliation.differences.census > 0 ? '+' : ''}${args.reconciliation.differences.census}): votos idénticos; participación y abstención usan el censo de las mesas`,
    )
  } else if (BLOCKING_RECONCILIATION.has(args.reconciliation.status)) {
    const d = Object.entries(args.reconciliation.differences)
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
      .join(', ')
    reasons.push(`conciliación ${args.reconciliation.status}${d ? ` (${d})` : ''}`)
  }
  if (args.geometry.correspondenceStatus === 'exact_code_temporal_mismatch') warnings.push(...args.geometry.notes)
  if (args.reconciliation.status !== 'exact_match' && !BLOCKING_RECONCILIATION.has(args.reconciliation.status) && !censusOnlyAllowed) {
    warnings.push(`conciliación ${args.reconciliation.status}`)
  }
  return { publishable: reasons.length === 0, reason: reasons.length ? reasons.join('; ') : null, warnings }
}

export function buildMunicipalObject(args: {
  electionType: ElectionType
  electionDate: string
  territoryCode: string | null
  municipalityCode: string
  municipalityName: string
  provinceCode: string
  sourceId: string
  parserVersion: string
  source: PoliticalMunicipalObject['source']
  candidacies: Candidacy[]
  sections: ElectionSectionResult[]
  totals: MunicipalTotals
  reconciliation: ReconciliationReport
  geometry: ElectionGeometryReference
  publication: PublicationDecision
}): PoliticalMunicipalObject {
  const obj: Omit<PoliticalMunicipalObject, 'content_sha256'> & { content_sha256: string } = {
    schema_version: POLITICAL_SCHEMA_VERSION,
    domain: POLITICAL_DOMAIN,
    electionId: electionId(args.electionType, args.electionDate),
    electionType: args.electionType,
    electionDate: args.electionDate,
    territoryCode: args.territoryCode,
    municipalityCode: args.municipalityCode,
    municipalityName: args.municipalityName,
    provinceCode: args.provinceCode,
    sourceId: args.sourceId,
    parserVersion: args.parserVersion,
    source: args.source,
    candidacies: args.candidacies,
    sections: args.sections,
    totals: args.totals,
    reconciliation: args.reconciliation,
    geometry: args.geometry,
    publication: args.publication,
    content_sha256: '',
  }
  obj.content_sha256 = contentSha256(obj)
  return obj
}

// ── Manifiesto ───────────────────────────────────────────────────────────────

export function emptyManifest(t: ElectionType, d: string, territoryCode: string | null): PoliticalManifest {
  return {
    schema_version: POLITICAL_SCHEMA_VERSION,
    domain: POLITICAL_DOMAIN,
    electionId: electionId(t, d),
    electionType: t,
    electionDate: d,
    label: `${ELECTION_TYPE_LABEL[t]} ${d}`,
    territoryCode,
    synced_at: new Date().toISOString(),
    sources: {},
  }
}

/** Fusiona la entrada de UNA fuente en el manifiesto (municipio a municipio). */
export function mergeManifest(existing: PoliticalManifest | null, t: ElectionType, d: string, entry: PoliticalManifestSource): PoliticalManifest {
  const base = existing && existing.electionId === electionId(t, d) ? existing : emptyManifest(t, d, entry.territoryCode)
  const prev = base.sources[entry.sourceId]
  const municipalities = { ...(prev && prev.sha256 === entry.sha256 ? prev.municipalities : {}), ...entry.municipalities }
  const specialByKey = new Map<string, PoliticalManifestSource['specialTables'][number]>()
  for (const s of [...(prev && prev.sha256 === entry.sha256 ? prev.specialTables : []), ...entry.specialTables]) {
    specialByKey.set(`${s.kind}-${s.communityCode}-${s.provinceCode}-${s.districtCode}`, s)
  }
  const sortedMun: PoliticalManifestSource['municipalities'] = {}
  for (const k of Object.keys(municipalities).sort()) sortedMun[k] = municipalities[k] as PoliticalManifestSource['municipalities'][string]
  return {
    ...base,
    synced_at: new Date().toISOString(),
    sources: {
      ...base.sources,
      [entry.sourceId]: {
        ...entry,
        municipalities: sortedMun,
        specialTables: [...specialByKey.values()].sort((a, b) =>
          `${a.communityCode}${a.provinceCode}${a.districtCode}` < `${b.communityCode}${b.provinceCode}${b.districtCode}` ? -1 : 1,
        ),
      },
    },
  }
}

// ── Cobertura ────────────────────────────────────────────────────────────────

export function mergeCoverage(
  existing: PoliticalCoverageFile | null,
  t: ElectionType,
  d: string,
  entries: PoliticalCoverageFile['municipalities'],
): PoliticalCoverageFile {
  const id = electionId(t, d)
  const base = existing && existing.electionId === id ? existing.municipalities : {}
  const merged = { ...base, ...entries }
  const sorted: PoliticalCoverageFile['municipalities'] = {}
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k] as PoliticalCoverageFile['municipalities'][string]
  return { schema_version: POLITICAL_SCHEMA_VERSION, electionId: id, synced_at: new Date().toISOString(), municipalities: sorted }
}

// ── Fuentes ──────────────────────────────────────────────────────────────────

export function mergeSources(
  existing: PoliticalSourcesRegistry | null,
  entry: PoliticalSourcesRegistry['sources'][number],
): PoliticalSourcesRegistry {
  const others = (existing?.sources ?? []).filter((s) => s.sourceId !== entry.sourceId)
  return {
    schema_version: POLITICAL_SCHEMA_VERSION,
    synced_at: new Date().toISOString(),
    sources: [...others, entry].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1)),
  }
}

// ── Catálogo (sólo desde manifiestos) ────────────────────────────────────────

export function catalogFromManifests(manifests: PoliticalManifest[]): PoliticalCatalog {
  const elections: PoliticalCatalog['elections'] = []
  for (const m of [...manifests].sort((a, b) => (a.electionDate < b.electionDate ? 1 : a.electionDate > b.electionDate ? -1 : a.electionType < b.electionType ? -1 : 1))) {
    const all = new Map<string, { publishable: boolean; sections: number; pollingStations: number }>()
    const sources = Object.values(m.sources)
    for (const s of sources) {
      for (const [ine, e] of Object.entries(s.municipalities)) {
        const prev = all.get(ine)
        // Si dos fuentes cubren el mismo municipio, cuenta la publicable.
        if (!prev || (!prev.publishable && e.publishable)) {
          all.set(ine, { publishable: e.publishable && !!e.key, sections: e.sections, pollingStations: e.pollingStations })
        }
      }
    }
    const pub = [...all.entries()].filter(([, e]) => e.publishable)
    elections.push({
      electionId: m.electionId,
      electionType: m.electionType,
      electionDate: m.electionDate,
      label: m.label,
      territoryCode: m.territoryCode,
      sourceIds: sources.map((s) => s.sourceId).sort(),
      definitive: sources.length > 0 && sources.every((s) => s.definitive),
      municipalities: all.size,
      publishableMunicipalities: pub.length,
      sections: pub.reduce((s, [, e]) => s + e.sections, 0),
      pollingStations: pub.reduce((s, [, e]) => s + e.pollingStations, 0),
      municipalityCodes: pub.map(([k]) => k).sort(),
    })
  }
  return { schema_version: POLITICAL_SCHEMA_VERSION, domain: POLITICAL_DOMAIN, synced_at: new Date().toISOString(), elections }
}

// ── Checkpoint ───────────────────────────────────────────────────────────────

export const CHECKPOINT_DIR = 'tmp/audit/political/checkpoints'

export interface Checkpoint {
  sourceId: string
  electionId: string
  sourceSha256: string
  /** ine → content_sha256 publicado y verificado. */
  done: Record<string, string>
  updatedAt: string
}

export function checkpointPath(sourceId: string, t: ElectionType, d: string): string {
  return `${CHECKPOINT_DIR}/${sourceId}__${t}-${d}.json`
}

export function loadCheckpoint(sourceId: string, t: ElectionType, d: string, sourceSha256: string): Checkpoint {
  const p = checkpointPath(sourceId, t, d)
  if (existsSync(p)) {
    const c = JSON.parse(readFileSync(p, 'utf8')) as Checkpoint
    if (c.sourceSha256 === sourceSha256) return c
  }
  return { sourceId, electionId: electionId(t, d), sourceSha256, done: {}, updatedAt: new Date().toISOString() }
}

export function saveCheckpoint(c: Checkpoint, t: ElectionType, d: string): void {
  const p = checkpointPath(c.sourceId, t, d)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ ...c, updatedAt: new Date().toISOString() }, null, 1))
}
