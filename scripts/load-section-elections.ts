#!/usr/bin/env node
// Cargador de RESULTADOS ELECTORALES por sección censal (capa Política).
//
// Orquesta, con el núcleo común de scripts/political/core/ y un adaptador por
// fuente oficial (scripts/political/adapter.ts):
//   descubrir → descargar (caché reanudable + SHA-256) → verificar hash →
//   inspeccionar esquema → filas de mesa → normalizar códigos → validar →
//   agregar mesa → sección (sumas; % después) → conciliar con los totales
//   municipales de la misma fuente → correspondencia con el seccionado INE →
//   decidir publicación por municipio → publicar en R2 (idempotente) →
//   manifiesto, cobertura, fuentes → (opcional) catálogo SÓLO desde manifiestos.
//
// SECO POR DEFECTO. Sólo --write escribe en R2 (prefijo
// socideas/secciones/v1/political/). Nunca toca otros prefijos.
//
// USO
//   npx tsx scripts/load-section-elections.ts --source=interior --type=municipal --date=2023-05-28 --municipalities=02003,28079
//   npx tsx scripts/load-section-elections.ts --source=interior --type=congress --date=2023-07-23 --provinces=02 --write --verify
//   npx tsx scripts/load-section-elections.ts --source=interior --type=municipal --date=2023-05-28 --all --write --verify --resume
//   npx tsx scripts/load-section-elections.ts --rebuild-catalog [--write] [--verify]
//
// FLAGS
//   --source=interior|<sourceId>   Fuente (por defecto: la primera que soporte la convocatoria).
//   --type, --date                 Convocatoria (municipal|congress|european; senate no soportado).
//   --municipalities=a,b | --ines  Códigos INE (se normalizan a 5 dígitos: PowerShell pierde ceros).
//   --provinces=02,28              Provincias (2 dígitos).
//   --all                          Todos los municipios (obligatorio si no hay filtro).
//   --write                        Escribe en R2.
//   --verify                       Relee de R2 y comprueba hash y contrato.
//   --resume                       Salta municipios del checkpoint con el mismo content_sha256.
//   --concurrency=N                Escrituras simultáneas (por defecto 8).
//   --manifest=<ruta>              Copia local del manifiesto fusionado de la ejecución.
//   --rebuild-catalog              Reconstruye catalog.json desde manifests/ (con --write lo publica).
//   --refresh-source               Revalida el ZIP contra el servidor aunque esté en caché.
//   --accept-source-change         Acepta un SHA-256 distinto del verificado en INTERIOR_KNOWN.
//   --save-local                   Guarda los objetos normalizados en tmp/audit/political/interior/normalized/.
//   --detail=N                     Imprime conciliación detallada de los N primeros municipios.
//   --allow-census-only-difference Política: conciliación unresolved SÓLO en censo (votos idénticos)
//                                  no bloquea; se publica con aviso. Por defecto bloquea.
//
// CÓDIGOS DE SALIDA: 0 ok · 1 error de ejecución/escritura/verificación · 2 argumentos ·
//   3 hash de la fuente distinto del verificado · 4 esquema inválido.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AdapterContext, DownloadedFile, OfficialElectionSourceAdapter, PollingStationRow } from './political/adapter'
import { REGIONAL_ADAPTERS } from './political/adapters/regional/index'
import {
  INTERIOR_SOURCE_ID,
  InteriorApliextrMesaAdapter,
  SENATE_NOT_SUPPORTED,
  createInteriorAdapter,
  type MunicipalReferenceEntry,
  type MunicipalityOnlyEntry,
} from './political/adapters/interior/index'
import { aggregateSections, sumTotals } from './political/core/aggregate'
import { normalizeCodeList } from './political/core/codes'
import { dedupeColors } from './political/core/colors'
import { correspondence, CUSEC_INDEX_YEARS, ensureCusecIndex, type CusecIndex } from './political/core/geometry'
import { contentSha256 } from './political/core/hash'
import {
  buildMunicipalObject,
  catalogFromManifests,
  decidePublication,
  keys,
  loadCheckpoint,
  mergeCoverage,
  mergeManifest,
  mergeSources,
  saveCheckpoint,
} from './political/core/publish'
import { getText, headContentSha, listKeys, putIfChanged, r2FromEnv, runPool, type R2 } from './political/core/r2'
import { reconcileMunicipality } from './political/core/reconcile'
import {
  ELECTION_TYPES,
  isPoliticalMunicipalObject,
  type Candidacy,
  type ElectionGeometryReference,
  type ElectionType,
  type PoliticalCatalog,
  type PoliticalCoverageFile,
  type PoliticalManifest,
  type PoliticalManifestSource,
  type PoliticalMunicipalObject,
  type PoliticalSourcesRegistry,
} from '../src/lib/socideas-secciones-political'

const AUDIT_DIR = 'tmp/audit/political/interior'
const RAW_ROOT = 'tmp/political-raw'

interface Opts {
  source: string | null
  type: ElectionType | null
  date: string | null
  municipalities: Set<string> | null
  provinces: Set<string> | null
  all: boolean
  write: boolean
  verify: boolean
  resume: boolean
  concurrency: number
  manifest: string | null
  rebuildCatalog: boolean
  refreshSource: boolean
  acceptSourceChange: boolean
  saveLocal: boolean
  detail: number
  allowCensusOnly: boolean
}

function fail(code: number, msg: string): never {
  console.error(`[elections] ERROR: ${msg}`)
  process.exit(code)
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    source: null,
    type: null,
    date: null,
    municipalities: null,
    provinces: null,
    all: false,
    write: false,
    verify: false,
    resume: false,
    concurrency: 8,
    manifest: null,
    rebuildCatalog: false,
    refreshSource: false,
    acceptSourceChange: false,
    saveLocal: false,
    detail: 0,
    allowCensusOnly: false,
  }
  const list = (v: string, pad: number) => {
    try {
      return normalizeCodeList(v, pad)
    } catch (e) {
      return fail(2, e instanceof Error ? e.message : String(e))
    }
  }
  for (const a of argv) {
    const [k, ...rest] = a.split('=')
    const v = rest.join('=')
    switch (k) {
      case '--source': o.source = v; break
      case '--type':
        if (!ELECTION_TYPES.includes(v as ElectionType)) fail(2, `--type inválido: ${v}`)
        o.type = v as ElectionType
        break
      case '--date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(2, `--date inválida: ${v}`)
        o.date = v
        break
      case '--municipalities':
      case '--ines': o.municipalities = list(v, 5); break
      case '--provinces': o.provinces = list(v, 2); break
      case '--all': o.all = true; break
      case '--write': o.write = true; break
      case '--verify': o.verify = true; break
      case '--resume': o.resume = true; break
      case '--concurrency': o.concurrency = Math.max(1, Math.min(32, Number.parseInt(v, 10) || 8)); break
      case '--manifest': o.manifest = v || `${AUDIT_DIR}/manifests/local.json`; break
      case '--rebuild-catalog': o.rebuildCatalog = true; break
      case '--refresh-source': o.refreshSource = true; break
      case '--accept-source-change': o.acceptSourceChange = true; break
      case '--save-local': o.saveLocal = true; break
      case '--detail': o.detail = Number.parseInt(v, 10) || 0; break
      case '--allow-census-only-difference': o.allowCensusOnly = true; break
      case '--confirm-r2-write': break // compatibilidad con el stub anterior
      default: fail(2, `flag desconocido: ${a}`)
    }
  }
  return o
}

function writeLocal(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 1))
}

function adaptersFor(opts: Opts): OfficialElectionSourceAdapter[] {
  const interior = createInteriorAdapter({ scope: { municipalities: opts.municipalities, provinces: opts.provinces } })
  const all: OfficialElectionSourceAdapter[] = [interior, ...REGIONAL_ADAPTERS]
  if (opts.source) {
    const want = opts.source === 'interior' ? INTERIOR_SOURCE_ID : opts.source
    return all.filter((a) => a.sourceId === want)
  }
  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría: seccionado del año de la elección; si no casa, año siguiente y
// anterior (estado exact_code_temporal_mismatch). Nunca se reasignan secciones.
// ─────────────────────────────────────────────────────────────────────────────

async function geometryFor(
  ine: string,
  electionDate: string,
  resultKeys: string[],
  indexes: Map<number, CusecIndex>,
  log: (m: string) => void,
): Promise<ElectionGeometryReference> {
  const y = Number.parseInt(electionDate.slice(0, 4), 10)
  const years = [y, y + 1, y - 1].filter((x) => (CUSEC_INDEX_YEARS as readonly number[]).includes(x))
  let first: ElectionGeometryReference | null = null
  for (const gy of years) {
    let idx = indexes.get(gy)
    if (!idx) {
      idx = await ensureCusecIndex(gy, log)
      indexes.set(gy, idx)
    }
    const geo = idx.byMunicipality.get(ine) ?? null
    const ref = correspondence({ electionDate, geometryYear: gy, resultSections: resultKeys, geometrySections: geo ? [...geo] : null })
    if (!first) first = ref
    if (ref.correspondenceStatus !== 'unresolved') {
      if (gy !== y) {
        ref.notes.unshift(
          `El seccionado ${y} no casa (${first.unmatchedResultSections.length} secciones sin polígono, ${first.unmatchedGeometrySections.length} polígonos sin resultados); se usa ${gy}, con los mismos códigos.`,
        )
      }
      return ref
    }
  }
  if (!first) throw new Error(`Sin seccionado INE disponible para ${electionDate}`)
  if (years.length > 1) first.notes.push(`Probados los seccionados ${years.join(', ')}: ninguno casa en ambos sentidos.`)
  return first
}

// ─────────────────────────────────────────────────────────────────────────────

interface MunicipalityResult {
  ine: string
  name: string
  object: PoliticalMunicipalObject | null
  coverage: PoliticalCoverageFile['municipalities'][string]
  manifest: PoliticalManifestSource['municipalities'][string]
}

async function rebuildCatalog(opts: Opts): Promise<number> {
  const r2 = r2FromEnv()
  const manifestKeys = (await listKeys(r2, keys.manifestsPrefix())).filter((k) => k.endsWith('.json'))
  const manifests: PoliticalManifest[] = []
  for (const k of manifestKeys) {
    const t = await getText(r2, k)
    if (!t) continue
    const m = JSON.parse(t) as PoliticalManifest
    if (m.schema_version !== 'political-v1' || !m.sources) {
      console.warn(`[catalog] ${k}: no es un manifiesto political-v1, se ignora`)
      continue
    }
    manifests.push(m)
  }
  const catalog = catalogFromManifests(manifests)
  console.log(`[catalog] ${manifests.length} manifiestos → ${catalog.elections.length} convocatorias`)
  for (const e of catalog.elections) {
    console.log(`  ${e.electionId}: fuentes ${e.sourceIds.join('+')} · municipios ${e.municipalities} · publicables ${e.publishableMunicipalities} · secciones ${e.sections} · mesas ${e.pollingStations}`)
  }
  writeLocal(`${AUDIT_DIR}/catalog.local.json`, catalog)
  if (!opts.write) {
    console.log('[catalog] seco: no se escribe (usa --write)')
    return 0
  }
  const sha = contentSha256(catalog)
  const out = await putIfChanged(r2, keys.catalog(), JSON.stringify(catalog), sha, 'application/json; charset=utf-8')
  console.log(`[catalog] ${keys.catalog()}: ${out}`)
  if (opts.verify) {
    const back = await getText(r2, keys.catalog())
    const parsed = back ? (JSON.parse(back) as PoliticalCatalog) : null
    if (!parsed || contentSha256(parsed) !== sha) {
      console.error('[catalog] verificación FALLIDA')
      return 1
    }
    console.log('[catalog] verificación ok')
  }
  return 0
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.rebuildCatalog && !opts.type) return rebuildCatalog(opts)
  if (!opts.type || !opts.date) fail(2, 'se requieren --type y --date (o sólo --rebuild-catalog)')
  if (opts.type === 'senate') fail(2, SENATE_NOT_SUPPORTED)
  if (!opts.municipalities && !opts.provinces && !opts.all) fail(2, 'indica --municipalities, --provinces o --all')
  const type = opts.type
  const date = opts.date
  const t0 = Date.now()
  const log = (m: string) => console.log(m)

  const adapter = adaptersFor(opts).find((a) => a.supports(type, date, null))
  if (!adapter) fail(2, `ninguna fuente soporta ${type} ${date}${opts.source ? ` (--source=${opts.source})` : ''}`)
  console.log(`[elections] ${type} ${date} · fuente ${adapter.sourceId} · ${opts.write ? 'ESCRITURA R2' : 'seco'}${opts.verify ? ' + verificación' : ''}`)
  const ctx: AdapterContext = { rawDir: `${RAW_ROOT}/${adapter.sourceId}`, resume: opts.refreshSource, log }

  // 1. Descubrir, descargar, verificar.
  const descriptors = await adapter.discover(type, date, ctx)
  const files: DownloadedFile[] = []
  for (const d of descriptors) {
    const f = await adapter.download(d, ctx)
    if (!adapter.verifyHash(f)) {
      if (d.expectedSha256 && d.expectedSha256 !== f.sha256 && opts.acceptSourceChange) {
        console.warn(`[elections] AVISO: SHA-256 ${f.sha256} ≠ verificado ${d.expectedSha256}; aceptado por --accept-source-change`)
      } else {
        fail(3, `${d.fileName}: SHA-256 ${f.sha256} ≠ esperado ${d.expectedSha256 ?? '(fichero alterado en disco)'}`)
      }
    }
    console.log(`[elections] ${d.fileName}: ${f.bytes} B · sha256 ${f.sha256} · ${f.state} · HTTP ${f.httpStatus} ${f.contentType}`)
    files.push(f)
  }

  // 2. Esquema.
  const schema = await adapter.inspectSchema(files)
  writeLocal(`${AUDIT_DIR}/schema-report-${type}-${date}.json`, schema)
  for (const n of schema.notes) console.log(`  ${n}`)
  if (!schema.ok) fail(4, `esquema inválido: ${schema.missing.join('; ')}`)

  // 3. Mesas, normalización y validación.
  const raw = await adapter.parsePollingStations(files, ctx)
  const rows = raw.map((r) => adapter.normalizeTerritorialCodes(r))
  const territorial = rows.filter((r) => !r.special)
  const validation = adapter.validateSourceRows(rows)
  const coverage = adapter.getCoverage(rows)
  console.log(
    `[elections] mesas en ámbito: ${coverage.pollingStations} territoriales + ${rows.length - territorial.length} especiales · ${coverage.sections} secciones · ${coverage.municipalities} municipios · ${coverage.provinces} provincias`,
  )
  const globalErrors = validation.errors.filter((e) => !/^\d{5}: /.test(e))
  if (globalErrors.length) {
    for (const e of globalErrors) console.error(`  ERROR global: ${e}`)
    return 1
  }
  const interior = adapter instanceof InteriorApliextrMesaAdapter ? adapter : null
  const detailedValidation = interior?.lastValidation ?? null

  // 4. Candidaturas y referencias.
  const candidacies = await adapter.normalizeCandidacies(files)
  const candById = new Map(candidacies.map((c) => [c.id, c]))
  const refDetailed: Map<string, MunicipalReferenceEntry> = interior
    ? await interior.municipalReferenceDetailed(files)
    : new Map(
        [...((await adapter.municipalReference?.(files)) ?? new Map()).entries()].map(([k, v]) => [
          k,
          { municipalityCode: k, name: k, communityCode: '', pollingStations: 0, totals: v, definitive: true } as MunicipalReferenceEntry,
        ]),
      )
  const onlyMunicipal: MunicipalityOnlyEntry[] = interior ? await interior.municipalityOnly(files) : []
  const special = interior?.specialTables() ?? []
  const meta = adapter.getMetadata()
  const file = files[0] as DownloadedFile
  const rawKey = keys.raw(type, date, adapter.sourceId, file.descriptor.fileName)

  // 5. Municipios objetivo.
  const inScope = (ine: string) =>
    (!opts.municipalities || opts.municipalities.has(ine)) && (!opts.provinces || opts.provinces.has(ine.slice(0, 2)))
  const byMun = new Map<string, PollingStationRow[]>()
  for (const r of territorial) {
    if (!inScope(r.municipalityCode)) continue
    let l = byMun.get(r.municipalityCode)
    if (!l) byMun.set(r.municipalityCode, (l = []))
    l.push(r)
  }
  const onlyMap = new Map(onlyMunicipal.filter((m) => inScope(m.municipalityCode)).map((m) => [m.municipalityCode, m]))
  const requested = opts.municipalities ? [...opts.municipalities] : []
  const targets = new Set<string>([...byMun.keys(), ...onlyMap.keys(), ...requested])
  for (const ine of refDetailed.keys()) if (inScope(ine) && (opts.provinces || opts.all)) targets.add(ine)
  const sorted = [...targets].sort()
  console.log(`[elections] municipios objetivo: ${sorted.length} (con mesas ${byMun.size}; sólo municipal ${onlyMap.size})`)

  // 6. Construcción por municipio.
  const indexes = new Map<number, CusecIndex>()
  const electionYear = Number.parseInt(date.slice(0, 4), 10)
  if ((CUSEC_INDEX_YEARS as readonly number[]).includes(electionYear)) indexes.set(electionYear, await ensureCusecIndex(electionYear, log))
  const results: MunicipalityResult[] = []
  for (const ine of sorted) {
    const mrows = byMun.get(ine) ?? []
    const ref = refDetailed.get(ine) ?? null
    const only = onlyMap.get(ine) ?? null
    const name = ref?.name ?? only?.name ?? mrows.find((r) => r.municipalityName)?.municipalityName ?? ine
    if (!mrows.length) {
      const reason = only
        ? only.reason
        : ref
          ? 'sin mesas en los ficheros 09/10 aunque hay total municipal en el 05'
          : 'municipio sin datos en esta convocatoria de la fuente'
      const geoIdx = indexes.get(electionYear) ?? null
      results.push({
        ine,
        name,
        object: null,
        coverage: {
          resultSections: 0,
          geometrySections: geoIdx?.byMunicipality.get(ine)?.size ?? 0,
          matchedSections: 0,
          coveragePercentage: 0,
          correspondenceStatus: 'unresolved',
          reconciliationStatus: 'not_checked',
          publishable: false,
          reason,
        },
        manifest: {
          key: null,
          content_sha256: null,
          municipalityName: name,
          publishable: false,
          reason,
          sections: 0,
          pollingStations: only?.pollingStations ?? 0,
          geometryYear: null,
          correspondenceStatus: 'unresolved',
          reconciliationStatus: 'not_checked',
        },
      })
      continue
    }
    const provisional = aggregateSections(mrows, null)
    const geometry = await geometryFor(ine, date, provisional.map((s) => s.sectionKey), indexes, log)
    const geoSet = new Set(
      (indexes.get(geometry.geometryYear as number)?.byMunicipality.get(ine) as Set<string> | undefined) ?? [],
    )
    const sections = aggregateSections(mrows, geoSet)
    const totals = sumTotals(sections)
    const reconciliation = reconcileMunicipality({
      sectionTotals: totals,
      reference: ref?.totals ?? null,
      referenceLabel: ref ? `${adapter.sourceId}:05/06 (total municipal, distrito 99) ${file.descriptor.fileName}` : null,
      resultPollingStations: mrows.length,
      referencePollingStations: ref?.pollingStations ?? null,
      municipalSpecial: null,
      supraMunicipalSpecial: special.length
        ? { kind: 'CERA', pollingStations: special.filter((s) => s.provinceCode === ine.slice(0, 2)).reduce((a, s) => a + s.pollingStations, 0) }
        : null,
    })
    const issues = detailedValidation?.byMunicipality.get(ine) ?? { errors: [], warnings: [] }
    const publication = decidePublication({
      sections,
      geometry,
      reconciliation,
      validationErrors: issues.errors,
      validationWarnings: issues.warnings,
      allowCensusOnlyDifference: opts.allowCensusOnly,
    })
    const usedIds = new Set(sections.flatMap((s) => Object.keys(s.votes)))
    const cands: Candidacy[] = dedupeColors(
      [...usedIds].sort().map((id) => {
        const c = candById.get(id)
        if (!c) throw new Error(`${ine}: candidatura ${id} sin registro en el 03`)
        return c
      }),
    )
    const nonDef = interior?.diagnostics?.nonDefinitiveMunicipalities.includes(ine) ?? false
    const object = buildMunicipalObject({
      electionType: type,
      electionDate: date,
      territoryCode: null,
      municipalityCode: ine,
      municipalityName: name,
      provinceCode: ine.slice(0, 2),
      sourceId: adapter.sourceId,
      parserVersion: meta.parserVersion,
      source: {
        authority: file.descriptor.authority,
        url: file.descriptor.url,
        fileName: file.descriptor.fileName,
        sha256: file.sha256,
        definitive: file.descriptor.definitive && !nonDef && (ref?.definitive ?? true),
        licence: file.descriptor.licence,
        retrievedAt: file.retrievedAt,
        rawKey,
      },
      candidacies: cands,
      sections,
      totals,
      reconciliation,
      geometry,
      publication,
    })
    results.push({
      ine,
      name,
      object,
      coverage: {
        resultSections: geometry.resultSections,
        geometrySections: geometry.geometrySections,
        matchedSections: geometry.matchedSections,
        coveragePercentage: geometry.coveragePercentage,
        correspondenceStatus: geometry.correspondenceStatus,
        reconciliationStatus: reconciliation.status,
        publishable: publication.publishable,
        reason: publication.reason,
      },
      manifest: {
        key: publication.publishable ? keys.normalized(type, date, ine) : null,
        content_sha256: object.content_sha256,
        municipalityName: name,
        publishable: publication.publishable,
        reason: publication.reason,
        sections: sections.length,
        pollingStations: mrows.length,
        geometryYear: geometry.geometryYear,
        correspondenceStatus: geometry.correspondenceStatus,
        reconciliationStatus: reconciliation.status,
      },
    })
    if (opts.saveLocal || opts.municipalities) writeLocal(`${AUDIT_DIR}/normalized/${type}/${date}/${ine}.json`, object)
  }

  // 7. Resumen.
  const pub = results.filter((r) => r.coverage.publishable)
  const tally = (f: (r: MunicipalityResult) => string) => {
    const t: Record<string, number> = {}
    for (const r of results) t[f(r)] = (t[f(r)] ?? 0) + 1
    return t
  }
  console.log(`[elections] publicables ${pub.length}/${results.length}`)
  console.log(`  geometría: ${JSON.stringify(tally((r) => `${r.coverage.correspondenceStatus}@${r.manifest.geometryYear ?? 'ND'}`))}`)
  console.log(`  conciliación: ${JSON.stringify(tally((r) => r.coverage.reconciliationStatus))}`)
  for (const r of results.slice(0, Math.max(opts.detail, opts.municipalities ? results.length : 0))) {
    const o = r.object
    const tot = o?.totals
    const rt = o?.reconciliation.referenceTotals
    console.log(
      `  ${r.ine} ${r.name}: ${r.coverage.publishable ? 'PUBLICABLE' : 'NO publicable'} · secciones ${r.coverage.resultSections} (geo ${r.coverage.geometrySections}, casan ${r.coverage.matchedSections}, ${r.coverage.coveragePercentage}%) · ${r.coverage.correspondenceStatus}@${r.manifest.geometryYear ?? 'ND'} · conciliación ${r.coverage.reconciliationStatus}${r.coverage.reason ? ` · motivo: ${r.coverage.reason}` : ''}`,
    )
    if (tot && rt) {
      console.log(
        `      secciones: censo ${tot.census} votantes ${tot.voters} válidos ${tot.validVotes} blancos ${tot.blankVotes} nulos ${tot.nullVotes} candidaturas ${tot.candidacyVotes} | oficial 05/06: censo ${rt.census} votantes ${rt.voters} válidos ${rt.validVotes} blancos ${rt.blankVotes} nulos ${rt.nullVotes} candidaturas ${rt.candidacyVotes} | dif ${JSON.stringify(o?.reconciliation.differences)}`,
      )
    }
  }

  const manifestEntry: PoliticalManifestSource = {
    sourceId: adapter.sourceId,
    authority: meta.authority,
    territoryCode: null,
    url: file.descriptor.url,
    fileName: file.descriptor.fileName,
    sha256: file.sha256,
    rawKey,
    licence: file.descriptor.licence,
    definitive: file.descriptor.definitive && !(interior?.diagnostics?.nonDefinitiveMunicipalities.length ?? 0),
    parserVersion: meta.parserVersion,
    retrievedAt: file.retrievedAt,
    synced_at: new Date().toISOString(),
    municipalities: Object.fromEntries(results.map((r) => [r.ine, r.manifest])),
    specialTables: special.map((s) => ({ ...s })),
  }
  const coverageEntries: PoliticalCoverageFile['municipalities'] = Object.fromEntries(results.map((r) => [r.ine, r.coverage]))
  const runReport = {
    electionId: `${type}-${date}`,
    sourceId: adapter.sourceId,
    file: { name: file.descriptor.fileName, sha256: file.sha256, bytes: file.bytes, url: file.descriptor.url },
    scope: { municipalities: opts.municipalities ? [...opts.municipalities] : null, provinces: opts.provinces ? [...opts.provinces] : null, all: opts.all },
    diagnostics: interior?.diagnostics ? { ...interior.diagnostics, orphans10: interior.diagnostics.orphans10.slice(0, 50) } : null,
    validation: { errors: validation.errors.slice(0, 200), warnings: validation.warnings.slice(0, 200) },
    specialTables: special,
    municipalities: results.map((r) => ({ ine: r.ine, name: r.name, ...r.coverage, geometryYear: r.manifest.geometryYear, pollingStations: r.manifest.pollingStations, content_sha256: r.manifest.content_sha256 })),
    write: opts.write,
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeLocal(`${AUDIT_DIR}/runs/${type}-${date}-${stamp}.json`, runReport)

  if (!opts.write) {
    if (opts.manifest) writeLocal(opts.manifest, mergeManifest(null, type, date, manifestEntry))
    console.log(`[elections] seco: nada escrito en R2 (${((Date.now() - t0) / 1000).toFixed(1)} s). Informe: ${AUDIT_DIR}/runs/${type}-${date}-${stamp}.json`)
    return 0
  }

  // 8. Escritura R2.
  const r2 = r2FromEnv()
  let failures = 0
  // 8a. Original.
  const zipBytes = readFileSync(file.path)
  const rawOut = await putIfChanged(r2, rawKey, zipBytes, file.sha256, 'application/zip')
  console.log(`[r2] ${rawKey}: ${rawOut}`)
  // 8b. Objetos normalizados publicables.
  const cp = loadCheckpoint(adapter.sourceId, type, date, file.sha256)
  const toWrite = pub.filter((r) => !(opts.resume && cp.done[r.ine] === r.object?.content_sha256))
  const skippedByCheckpoint = pub.length - toWrite.length
  const counts = { written: 0, unchanged: 0, verified: 0 }
  let sinceSave = 0
  const poolFailures = await runPool(toWrite, opts.concurrency, async (r) => {
    const o = r.object as PoliticalMunicipalObject
    const key = keys.normalized(type, date, r.ine)
    if (!o.sections.length) throw new Error(`${r.ine}: objeto sin secciones (no se publica)`)
    const out = await putIfChanged(r2, key, JSON.stringify(o), o.content_sha256, 'application/json; charset=utf-8')
    counts[out]++
    if (opts.verify) {
      const back = await getText(r2, key)
      const parsed = back ? (JSON.parse(back) as unknown) : null
      if (!isPoliticalMunicipalObject(parsed) || contentSha256(parsed) !== o.content_sha256 || parsed.content_sha256 !== o.content_sha256) {
        throw new Error(`${r.ine}: verificación de lectura fallida`)
      }
      counts.verified++
    }
    cp.done[r.ine] = o.content_sha256
    if (++sinceSave >= 50) {
      saveCheckpoint(cp, type, date)
      sinceSave = 0
    }
  })
  saveCheckpoint(cp, type, date)
  for (const f of poolFailures) {
    failures++
    console.error(`[r2] FALLO ${f.item.ine}: ${f.error}`)
    delete manifestEntry.municipalities[f.item.ine]
    delete coverageEntries[f.item.ine]
  }
  console.log(`[r2] normalized: escritos ${counts.written} · sin cambios ${counts.unchanged} · verificados ${counts.verified} · saltados por checkpoint ${skippedByCheckpoint} · fallos ${poolFailures.length}`)
  // 8c. Objetos previos de municipios ahora no publicables: se avisa (no se borran).
  const blocked = results.filter((r) => !r.coverage.publishable)
  const stale: string[] = []
  await runPool(blocked, opts.concurrency, async (r) => {
    const h = await headContentSha(r2, keys.normalized(type, date, r.ine))
    if (h.exists) stale.push(r.ine)
  })
  if (stale.length) {
    failures++
    console.error(`[r2] ${stale.length} objetos publicados antes y ahora NO publicables (revisar/retirar): ${stale.sort().join(', ')}`)
  }
  // 8d. Manifiesto, cobertura, fuentes.
  const prevManifest = await getText(r2, keys.manifest(type, date))
  const manifest = mergeManifest(prevManifest ? (JSON.parse(prevManifest) as PoliticalManifest) : null, type, date, manifestEntry)
  const prevCoverage = await getText(r2, keys.coverage(type, date))
  const cov = mergeCoverage(prevCoverage ? (JSON.parse(prevCoverage) as PoliticalCoverageFile) : null, type, date, coverageEntries)
  const prevSources = await getText(r2, keys.sources())
  const sources = mergeSources(prevSources ? (JSON.parse(prevSources) as PoliticalSourcesRegistry) : null, {
    sourceId: adapter.sourceId,
    authority: meta.authority,
    territoryCode: null,
    electionTypes: ['municipal', 'congress', 'european'],
    level: 'polling_station',
    url: meta.portal,
    licence: meta.licence,
    implementation_status: 'implemented',
    notes: meta.notes,
  })
  const small: Array<[string, unknown]> = [
    [keys.manifest(type, date), manifest],
    [keys.coverage(type, date), cov],
    [keys.sources(), sources],
  ]
  for (const [k, v] of small) {
    const sha = contentSha256(v)
    const out = await putIfChanged(r2, k, JSON.stringify(v), sha, 'application/json; charset=utf-8')
    console.log(`[r2] ${k}: ${out}`)
    if (opts.verify) {
      const back = await getText(r2, k)
      if (!back || contentSha256(JSON.parse(back)) !== sha) {
        failures++
        console.error(`[r2] verificación fallida: ${k}`)
      }
    }
  }
  if (opts.verify) {
    const h = await headContentSha(r2, rawKey)
    if (!h.exists || h.sha !== file.sha256 || h.size !== file.bytes) {
      failures++
      console.error(`[r2] verificación fallida del original ${rawKey}`)
    } else console.log(`[r2] original verificado (${h.size} B, sha256 ${h.sha?.slice(0, 12)}…)`)
  }
  if (opts.manifest) writeLocal(opts.manifest, manifest)
  writeLocal(`${AUDIT_DIR}/manifests/${type}-${date}.json`, manifest)
  if (opts.rebuildCatalog) failures += await rebuildCatalog(opts)
  console.log(`[elections] fin en ${((Date.now() - t0) / 1000).toFixed(1)} s · fallos ${failures}`)
  return failures ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[elections] ERROR:', err instanceof Error ? err.stack ?? err.message : String(err))
    process.exit(1)
  })
