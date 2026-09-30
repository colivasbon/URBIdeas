// Correspondencia resultados ↔ seccionado INE con extractos literales
// (09 de 02003 municipales 2023; CUSEC de Secciones_2023/2024 del WFS del INE).
// Uso: npx tsx --test scripts/political/tests/core-geometry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { correspondence, geometryYearFor } from '../core/geometry'
import { decodeAnsi, parseRecords } from '../core/fixed-width'
import { SPEC_09 } from '../adapters/interior/spec'
import { FIXTURE_DIR } from '../fixtures/interior/load-fixture'

const cusec = JSON.parse(readFileSync(join(FIXTURE_DIR, 'geometry', 'cusec-02003-02007.json'), 'utf8')) as {
  byYear: Record<string, Record<string, string[]>>
}
const albaceteResults = [
  ...new Set(
    parseRecords(decodeAnsi(readFileSync(join(FIXTURE_DIR, 'geometry', '09042305-02003.DAT'))), SPEC_09).map(
      (r) => `${r.provincia}${r.municipio}${r.distrito}${(r.seccion as string).slice(0, 3)}`,
    ),
  ),
]

test('02003 municipales 2023 vs Secciones_2023: 2 secciones sin polígono → unresolved', () => {
  const g = correspondence({ electionDate: '2023-05-28', geometryYear: 2023, resultSections: albaceteResults, geometrySections: cusec.byYear['2023']?.['02003'] ?? [] })
  assert.equal(g.resultSections, 117)
  assert.equal(g.geometrySections, 115)
  assert.equal(g.matchedSections, 115)
  assert.equal(g.unmatchedResultSections.length, 2)
  assert.equal(g.unmatchedGeometrySections.length, 0)
  assert.equal(g.correspondenceStatus, 'unresolved')
  assert.equal(g.coveragePercentage, Math.round((115 / 117) * 10000) / 100)
})

test('02003 municipales 2023 vs Secciones_2024: mismos códigos → exact_code_temporal_mismatch', () => {
  const g = correspondence({ electionDate: '2023-05-28', geometryYear: 2024, resultSections: albaceteResults, geometrySections: cusec.byYear['2024']?.['02003'] ?? [] })
  assert.equal(g.correspondenceStatus, 'exact_code_temporal_mismatch')
  assert.equal(g.coveragePercentage, 100)
  assert.equal(g.geometryYear, 2024)
})

test('02007 municipales 2023 vs Secciones_2023: exact', () => {
  const g = correspondence({ electionDate: '2023-05-28', geometryYear: 2023, resultSections: ['0200701001'], geometrySections: cusec.byYear['2023']?.['02007'] ?? [] })
  assert.equal(g.correspondenceStatus, 'exact')
})

test('polígonos sin resultados también bloquean (sentido inverso)', () => {
  const g = correspondence({
    electionDate: '2023-05-28',
    geometryYear: 2024,
    resultSections: albaceteResults.slice(1),
    geometrySections: cusec.byYear['2024']?.['02003'] ?? [],
  })
  assert.equal(g.correspondenceStatus, 'unresolved')
  assert.deepEqual(g.unmatchedGeometrySections, [albaceteResults.sort()[0]])
})

test('sin geometría del municipio → unresolved', () => {
  const g = correspondence({ electionDate: '2023-05-28', geometryYear: 2023, resultSections: ['0200701001'], geometrySections: null })
  assert.equal(g.correspondenceStatus, 'unresolved')
  assert.equal(g.coveragePercentage, 0)
})

test('documented_crosswalk nunca se asigna sin crosswalk oficial', () => {
  for (const y of [2023, 2024]) {
    const g = correspondence({ electionDate: '2023-05-28', geometryYear: y, resultSections: albaceteResults, geometrySections: cusec.byYear[String(y)]?.['02003'] ?? [] })
    assert.notEqual(g.correspondenceStatus, 'documented_crosswalk')
  }
})

test('año de seccionado: el de la elección; si no hay capa, el más cercano', () => {
  assert.equal(geometryYearFor('2019-05-26'), 2019)
  assert.equal(geometryYearFor('2024-06-09'), 2024)
  assert.equal(geometryYearFor('2015-05-24'), 2019)
  assert.equal(geometryYearFor('2027-05-23'), 2025)
})
