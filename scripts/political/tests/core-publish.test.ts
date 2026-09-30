// Decisión de publicación, idempotencia por hash, manifiestos y catálogo.
// Uso: npx tsx --test scripts/political/tests/core-publish.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateSections, sumTotals } from '../core/aggregate'
import { contrastRatio, CONTRAST_BACKGROUNDS, COLOR_PALETTE, dedupeColors } from '../core/colors'
import { correspondence } from '../core/geometry'
import { contentSha256 } from '../core/hash'
import { buildMunicipalObject, catalogFromManifests, decidePublication, mergeManifest } from '../core/publish'
import { reconcileMunicipality } from '../core/reconcile'
import { createInteriorAdapter } from '../adapters/interior/index'
import { fixturePackage } from '../fixtures/interior/load-fixture'
import { isPoliticalMunicipalObject, type PoliticalManifestSource } from '../../../src/lib/socideas-secciones-political'

const ctx = { rawDir: 'unused', resume: false, log: () => {} }

async function build02007(geometryYear: number, geometry: string[], retrievedAt = '2026-09-29T10:00:00.000Z') {
  const a = createInteriorAdapter()
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28')
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r)).filter((r) => r.municipalityCode === '02007')
  const ref = (await a.municipalReferenceDetailed([f])).get('02007')
  const cands = await a.normalizeCandidacies([f])
  const sections = aggregateSections(rows, new Set(geometry))
  const totals = sumTotals(sections)
  const geo = correspondence({ electionDate: '2023-05-28', geometryYear, resultSections: sections.map((s) => s.sectionKey), geometrySections: geometry })
  const rec = reconcileMunicipality({ sectionTotals: totals, reference: ref?.totals ?? null, referenceLabel: '05/06', resultPollingStations: rows.length, referencePollingStations: ref?.pollingStations ?? null })
  const pub = decidePublication({ sections, geometry: geo, reconciliation: rec, validationErrors: [], validationWarnings: [] })
  return buildMunicipalObject({
    electionType: 'municipal',
    electionDate: '2023-05-28',
    territoryCode: null,
    municipalityCode: '02007',
    municipalityName: 'Alcalá del Júcar',
    provinceCode: '02',
    sourceId: 'interior-apliextr-mesa',
    parserVersion: 'test',
    source: { authority: 'x', url: f.descriptor.url, fileName: f.descriptor.fileName, sha256: f.sha256, definitive: true, licence: 'x', retrievedAt },
    candidacies: dedupeColors(cands.filter((c) => c.id === '000006' || c.id === '000030')),
    sections,
    totals,
    reconciliation: rec,
    geometry: geo,
    publication: pub,
  })
}

test('objeto publicable cumple el contrato y el hash ignora campos volátiles', async () => {
  const o1 = await build02007(2023, ['0200701001'], '2026-09-29T10:00:00.000Z')
  const o2 = await build02007(2023, ['0200701001'], '2026-09-30T11:11:11.000Z')
  assert.equal(isPoliticalMunicipalObject(o1), true)
  assert.equal(o1.publication.publishable, true)
  assert.notEqual(o1.source.retrievedAt, o2.source.retrievedAt)
  assert.equal(o1.content_sha256, o2.content_sha256)
  assert.equal(contentSha256(o1), o1.content_sha256)
})

test('geometría unresolved ⇒ publishable=false con motivo', async () => {
  const o = await build02007(2023, ['0200701001', '0200701002'])
  assert.equal(o.geometry.correspondenceStatus, 'unresolved')
  assert.equal(o.publication.publishable, false)
  assert.match(o.publication.reason ?? '', /geometría unresolved/)
})

test('manifiesto: fusiona por sourceId sin tocar otras fuentes; catálogo sólo publicables', async () => {
  const o = await build02007(2023, ['0200701001'])
  const entry = (sourceId: string, ine: string, publishable: boolean): PoliticalManifestSource => ({
    sourceId,
    authority: 'x',
    territoryCode: null,
    url: 'u',
    fileName: 'f',
    sha256: 's',
    rawKey: null,
    licence: 'l',
    definitive: true,
    parserVersion: 'p',
    retrievedAt: 'r',
    synced_at: 's',
    municipalities: {
      [ine]: {
        key: publishable ? `k/${ine}` : null,
        content_sha256: o.content_sha256,
        municipalityName: 'n',
        publishable,
        reason: publishable ? null : 'x',
        sections: o.sections.length,
        pollingStations: 2,
        geometryYear: 2023,
        correspondenceStatus: 'exact',
        reconciliationStatus: 'exact_match',
      },
    },
    specialTables: [],
  })
  let m = mergeManifest(null, 'municipal', '2023-05-28', entry('interior-apliextr-mesa', '02007', true))
  m = mergeManifest(m, 'municipal', '2023-05-28', entry('otra-fuente', '46250', true))
  m = mergeManifest(m, 'municipal', '2023-05-28', entry('interior-apliextr-mesa', '04045', false))
  assert.deepEqual(Object.keys(m.sources).sort(), ['interior-apliextr-mesa', 'otra-fuente'])
  assert.deepEqual(Object.keys(m.sources['interior-apliextr-mesa']?.municipalities ?? {}), ['02007', '04045'])
  const cat = catalogFromManifests([m])
  assert.equal(cat.elections[0]?.municipalities, 3)
  assert.equal(cat.elections[0]?.publishableMunicipalities, 2)
  assert.deepEqual(cat.elections[0]?.municipalityCodes, ['02007', '46250'])
})

test('paleta: contraste ≥ 3:1 frente a lienzos claro y oscuro', () => {
  for (const c of COLOR_PALETTE) for (const bg of CONTRAST_BACKGROUNDS) assert.ok(contrastRatio(c, bg) >= 3, `${c} vs ${bg}`)
})
