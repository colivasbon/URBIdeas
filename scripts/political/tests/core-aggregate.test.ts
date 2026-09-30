// Agregación mesa → sección e indicadores, sobre mesas LITERALES de Interior.
// Uso: npx tsx --test scripts/political/tests/core-aggregate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PollingStationRow } from '../adapter'
import { aggregateSections, rankCandidacies, round4, sumTotals } from '../core/aggregate'
import { createInteriorAdapter } from '../adapters/interior/index'
import { fixturePackage } from '../fixtures/interior/load-fixture'

const ctx = { rawDir: 'unused', resume: false, log: () => {} }

async function rowsOf(code: '04202305' | '02202307', type: 'municipal' | 'congress', date: string): Promise<PollingStationRow[]> {
  const a = createInteriorAdapter()
  const f = await fixturePackage(code, type, date)
  return (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r)).filter((r) => !r.special)
}

test('dos mesas (A, B) → una sección: se suman recuentos y se conserva la lista de mesas', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '02007')
  const [s] = aggregateSections(rows, new Set(['0200701001']))
  assert.ok(s)
  assert.equal(s.sectionKey, '0200701001')
  assert.deepEqual(s.pollingStations, ['A', 'B'])
  assert.equal(s.census, 469 + 510)
  assert.equal(s.voters, 391 + 421)
  assert.equal(s.abstentions, 979 - 812)
  assert.equal(s.validVotes, 802)
  assert.equal(s.blankVotes, 11)
  assert.equal(s.nullVotes, 10)
  assert.equal(s.candidacyVotes, 791)
  assert.deepEqual(s.votes, { '000006': 209, '000030': 582 })
  assert.equal(s.geometryMatch, true)
  assert.equal(s.status, 'observado')
})

test('porcentajes sobre la suma, NUNCA promedio de porcentajes de mesa', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '02007')
  const [s] = aggregateSections(rows)
  const expected = round4((812 / 979) * 100)
  const mean = round4((((391 / 469) + (421 / 510)) / 2) * 100)
  assert.equal(s?.participationPct, expected)
  assert.notEqual(s?.participationPct, mean)
  assert.equal(s?.abstentionPct, round4((167 / 979) * 100))
  assert.equal(s?.blankPct, round4((11 / 802) * 100)) // blancos / válidos
  assert.equal(s?.nullPct, round4((10 / 812) * 100)) // nulos / votantes
})

test('ganador, segundo, margen y concentración sobre votos válidos', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '02007')
  const [s] = aggregateSections(rows)
  assert.equal(s?.winnerId, '000030')
  assert.equal(s?.runnerUpId, '000006')
  assert.equal(s?.winnerPct, round4((582 / 802) * 100))
  assert.equal(s?.runnerUpPct, round4((209 / 802) * 100))
  assert.equal(s?.marginPoints, round4((582 / 802) * 100 - (209 / 802) * 100))
  assert.equal(s?.top2ConcentrationPct, round4((582 / 802) * 100 + (209 / 802) * 100))
  assert.equal(s?.tie, false)
})

test('empate real (16246, PP 192 = PSOE 192): tie, sin ganador único, margen 0', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '16246')
  const [s] = aggregateSections(rows)
  assert.equal(s?.tie, true)
  assert.equal(s?.winnerId, null)
  assert.equal(s?.runnerUpId, null)
  assert.equal(s?.marginPoints, 0)
  assert.equal(s?.winnerPct, s?.runnerUpPct)
  assert.ok(s?.notes.some((n) => /Empate a 192 votos entre 000006, 000030/.test(n)))
})

test('una sola candidatura (08002): sin segundo, margen y concentración no aplicables (null, no 0)', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '08002')
  const [s] = aggregateSections(rows)
  assert.equal(s?.winnerId, '000526')
  assert.equal(s?.runnerUpId, null)
  assert.equal(s?.runnerUpPct, null)
  assert.equal(s?.marginPoints, null)
  assert.equal(s?.top2ConcentrationPct, null)
})

test('ceros conservados (Congreso 2023, 02007: candidaturas con 0 votos)', async () => {
  const rows = (await rowsOf('02202307', 'congress', '2023-07-23')).filter((r) => r.municipalityCode === '02007')
  const [s] = aggregateSections(rows)
  assert.equal(s?.votes['000001'], 0)
  assert.equal(s?.votes['000009'], 0)
  assert.equal(Object.keys(s?.votes ?? {}).length, 8)
})

test('ND nunca es 0: un recuento null en una mesa deja null la sección y sus %', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '02007')
  const mutated = rows.map((r, i) => (i === 0 ? { ...r, census: null } : r))
  const [s] = aggregateSections(mutated)
  assert.equal(s?.census, null)
  assert.equal(s?.participationPct, null)
  assert.equal(s?.abstentions, null)
  assert.equal(s?.status, 'no_difundido')
})

test('totales municipales = suma de secciones (no de porcentajes)', async () => {
  const rows = (await rowsOf('04202305', 'municipal', '2023-05-28')).filter((r) => r.municipalityCode === '04045')
  const sections = aggregateSections(rows)
  assert.equal(sections.length, 2)
  const t = sumTotals(sections)
  assert.equal(t.census, sections.reduce((a, s) => a + (s.census as number), 0))
  assert.equal(t.candidacyVotes, 1358)
})

test('mesas especiales no admitidas en la agregación', async () => {
  const a = createInteriorAdapter()
  const f = await fixturePackage('02202307', 'congress', '2023-07-23')
  const cera = (await a.parsePollingStations([f], ctx)).filter((r) => r.special)
  assert.throws(() => aggregateSections(cera), /mesa especial/)
})

test('rankCandidacies: sin votos a candidaturas → sin ganador', () => {
  const r = rankCandidacies({ '000001': 0, '000002': 0 }, 3)
  assert.equal(r.winnerId, null)
  assert.equal(r.tie, false)
})
