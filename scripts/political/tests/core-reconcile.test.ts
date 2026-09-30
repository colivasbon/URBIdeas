// Conciliación municipal (estados) con extractos literales 09/10 y 05/06.
// Uso: npx tsx --test scripts/political/tests/core-reconcile.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateSections, sumTotals } from '../core/aggregate'
import { addTotals, BLOCKING_RECONCILIATION, reconcileMunicipality } from '../core/reconcile'
import { decidePublication } from '../core/publish'
import { correspondence } from '../core/geometry'
import { createInteriorAdapter } from '../adapters/interior/index'
import { fixturePackage } from '../fixtures/interior/load-fixture'
import type { MunicipalTotals } from '../../../src/lib/socideas-secciones-political'

const ctx = { rawDir: 'unused', resume: false, log: () => {} }

async function load(code: '04202305' | '02202307' | '02201911', type: 'municipal' | 'congress', date: string) {
  const a = createInteriorAdapter()
  const f = await fixturePackage(code, type, date)
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const ref = await a.municipalReferenceDetailed([f])
  return { a, rows, ref }
}

test('exact_match: 02007 municipales 2023 (secciones = 05/06)', async () => {
  const { rows, ref } = await load('04202305', 'municipal', '2023-05-28')
  const m = rows.filter((r) => r.municipalityCode === '02007')
  const rep = reconcileMunicipality({
    sectionTotals: sumTotals(aggregateSections(m)),
    reference: ref.get('02007')?.totals ?? null,
    referenceLabel: '05/06',
    resultPollingStations: m.length,
    referencePollingStations: ref.get('02007')?.pollingStations ?? null,
  })
  assert.equal(rep.status, 'exact_match')
  assert.deepEqual(rep.differences, {})
})

test('unresolved: 04045 Fiñana, diferencia real entre mesas (09/10) y total municipal (05/06)', async () => {
  const { rows, ref } = await load('04202305', 'municipal', '2023-05-28')
  const m = rows.filter((r) => r.municipalityCode === '04045')
  const rep = reconcileMunicipality({
    sectionTotals: sumTotals(aggregateSections(m)),
    reference: ref.get('04045')?.totals ?? null,
    referenceLabel: '05/06',
    resultPollingStations: m.length,
    referencePollingStations: ref.get('04045')?.pollingStations ?? null,
  })
  assert.equal(rep.status, 'unresolved')
  assert.equal(rep.differences.candidacyVotes, 1358 - 1390)
  assert.equal(rep.differences.blankVotes, 10 - 9)
  assert.equal(rep.differences.nullVotes, 10 - 7)
  assert.ok(BLOCKING_RECONCILIATION.has(rep.status))
  // Nunca se corrigen secciones: los totales de sección siguen siendo los de las mesas.
  assert.equal(rep.sectionTotals.candidacyVotes, 1358)
})

test('incomplete_coverage: falta una mesa respecto al nº oficial de mesas', async () => {
  const { rows, ref } = await load('04202305', 'municipal', '2023-05-28')
  const m = rows.filter((r) => r.municipalityCode === '02007' && r.table === 'A')
  const rep = reconcileMunicipality({
    sectionTotals: sumTotals(aggregateSections(m)),
    reference: ref.get('02007')?.totals ?? null,
    referenceLabel: '05/06',
    resultPollingStations: 1,
    referencePollingStations: 2,
  })
  assert.equal(rep.status, 'incomplete_coverage')
})

test('candidacy_mapping_error: códigos de candidatura de otra convocatoria', async () => {
  const mun = await load('04202305', 'municipal', '2023-05-28')
  const con = await load('02202307', 'congress', '2023-07-23')
  const m = mun.rows.filter((r) => r.municipalityCode === '02007')
  const rep = reconcileMunicipality({
    sectionTotals: sumTotals(aggregateSections(m)),
    reference: con.ref.get('02007')?.totals ?? null,
    referenceLabel: '05/06 Congreso',
    resultPollingStations: m.length,
    referencePollingStations: 2,
  })
  assert.equal(rep.status, 'candidacy_mapping_error')
})

test('not_checked: sin referencia', async () => {
  const { rows } = await load('04202305', 'municipal', '2023-05-28')
  const m = rows.filter((r) => r.municipalityCode === '02007')
  const rep = reconcileMunicipality({ sectionTotals: sumTotals(aggregateSections(m)), reference: null, referenceLabel: null, resultPollingStations: 2 })
  assert.equal(rep.status, 'not_checked')
})

test('Congreso 2023, 02007: CERA provincial documentado, municipio exact_match', async () => {
  const { a, rows, ref } = await load('02202307', 'congress', '2023-07-23')
  const m = rows.filter((r) => r.municipalityCode === '02007')
  const cera = a.specialTables().filter((s) => s.provinceCode === '02')
  const rep = reconcileMunicipality({
    sectionTotals: sumTotals(aggregateSections(m)),
    reference: ref.get('02007')?.totals ?? null,
    referenceLabel: '05/06',
    resultPollingStations: m.length,
    referencePollingStations: ref.get('02007')?.pollingStations ?? null,
    supraMunicipalSpecial: { kind: 'CERA', pollingStations: cera.reduce((s, x) => s + x.pollingStations, 0) },
  })
  assert.equal(rep.status, 'exact_match')
  assert.equal(rep.specialTables?.scope, 'province')
  assert.equal(rep.specialTables?.pollingStations, 1)
})

test('confirmed_CERA_difference SÓLO con mesas CERA atribuidas al municipio (evidencia)', async () => {
  // Prueba de la regla de decisión: la referencia se forma sumando a las
  // secciones de 02007 la mesa CERA literal de la provincia 02 (Congreso 2023).
  const { rows } = await load('02202307', 'congress', '2023-07-23')
  const m = rows.filter((r) => r.municipalityCode === '02007')
  const ceraRow = rows.find((r) => r.special === 'CERA')
  assert.ok(ceraRow)
  const ceraTotals: MunicipalTotals = sumTotals(aggregateSections([{ ...ceraRow, special: null }]))
  const sections = sumTotals(aggregateSections(m))
  const reference = addTotals(sections, ceraTotals)
  const withEvidence = reconcileMunicipality({
    sectionTotals: sections,
    reference,
    referenceLabel: 'prueba',
    resultPollingStations: m.length,
    municipalSpecial: { kind: 'CERA', pollingStations: 1, totals: ceraTotals },
  })
  assert.equal(withEvidence.status, 'confirmed_CERA_difference')
  const withoutEvidence = reconcileMunicipality({ sectionTotals: sections, reference, referenceLabel: 'prueba', resultPollingStations: m.length })
  assert.equal(withoutEvidence.status, 'unresolved')
})

test('Congreso 2019-11, 04083: sólo difiere el censo (mesas 1727 vs 05 1728); votos idénticos', async () => {
  const { rows, ref } = await load('02201911', 'congress', '2019-11-10')
  const m = rows.filter((r) => r.municipalityCode === '04083')
  const sections = aggregateSections(m)
  const rep = reconcileMunicipality({
    sectionTotals: sumTotals(sections),
    reference: ref.get('04083')?.totals ?? null,
    referenceLabel: '05/06',
    resultPollingStations: m.length,
    referencePollingStations: ref.get('04083')?.pollingStations ?? null,
  })
  assert.equal(rep.status, 'unresolved')
  assert.deepEqual(rep.differences, { census: -1 })
  assert.ok(rep.notes.some((n) => /Sólo difiere el censo \(-1\)/.test(n)))
  const geometry = correspondence({ electionDate: '2019-11-10', geometryYear: 2019, resultSections: sections.map((s) => s.sectionKey), geometrySections: sections.map((s) => s.sectionKey) })
  const strict = decidePublication({ sections, geometry, reconciliation: rep, validationErrors: [], validationWarnings: [] })
  assert.equal(strict.publishable, false)
  const policy = decidePublication({ sections, geometry, reconciliation: rep, validationErrors: [], validationWarnings: [], allowCensusOnlyDifference: true })
  assert.equal(policy.publishable, true)
  assert.ok(policy.warnings.some((w) => /sólo en censo \(-1\)/.test(w)))
})
