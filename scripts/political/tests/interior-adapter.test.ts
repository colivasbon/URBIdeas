// Adaptador Interior APLIEXTR de extremo a extremo sobre extractos literales.
// Uso: npx tsx --test scripts/political/tests/interior-adapter.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInteriorAdapter, datName } from '../adapters/interior/index'
import { fixturePackage } from '../fixtures/interior/load-fixture'
import { normalizeCode, normalizeCodeList } from '../core/codes'
import { contrastRatio, CONTRAST_BACKGROUNDS } from '../core/colors'

const ctx = { rawDir: 'unused', resume: false, log: () => {} }

test('nombre de fichero interno nnxxaamm.DAT', () => {
  assert.equal(datName('09', 'municipal', '2023-05-28'), '09042305.DAT')
  assert.equal(datName('10', 'congress', '2019-11-10'), '10021911.DAT')
  assert.equal(datName('03', 'european', '2024-06-09'), '03072406.DAT')
})

test('discover: URL oficial y SHA-256 verificado', async () => {
  const a = createInteriorAdapter()
  const [d] = await a.discover('municipal', '2023-05-28', ctx)
  assert.equal(d?.url, 'https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/04202305_MESA.zip')
  assert.equal(d?.expectedSha256, '20dac696cd2efaa63c9346384ddb682f3da4fda92c6af67447159a60f1ab0de3')
  assert.equal(a.supports('senate', '2023-07-23'), false)
  assert.equal(a.supports('municipal', '2023-05-28', '17'), false)
})

test('mesas: 09 + 10 unidos por la clave de mesa; códigos 2/5/2/3', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28')
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  assert.equal(rows.length, 7)
  const m = rows.find((r) => r.municipalityCode === '02007' && r.table === 'A')
  assert.ok(m)
  assert.equal(m.provinceCode, '02')
  assert.equal(m.districtCode, '01')
  assert.equal(m.sectionCode, '001')
  assert.equal(m.census, 469)
  assert.equal(m.voters, 2 + 7 + 382)
  assert.equal(m.validVotes, 2 + 382)
  assert.deepEqual(m.votes, { '000006': 113, '000030': 269 })
  assert.equal(m.special, null)
  assert.equal(m.municipalityName, 'Alcalá del Júcar')
  const v = a.validateSourceRows(rows)
  assert.equal(v.ok, true, v.errors.join('\n'))
  assert.equal(a.diagnostics?.sectionFourthChar['" "'], 7)
})

test('CERA (municipio 999) → special, fuera de la capa seccional, resumido por provincia', async () => {
  const f = await fixturePackage('02202307', 'congress', '2023-07-23')
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const cera = rows.filter((r) => r.special === 'CERA')
  assert.equal(cera.length, 1)
  assert.equal(cera[0]?.provinceCode, '02')
  assert.equal(cera[0]?.districtCode, '09')
  const s = a.specialTables()
  assert.equal(s.length, 1)
  assert.equal(s[0]?.pollingStations, 1)
  assert.equal(s[0]?.census, 8064)
  assert.equal(s[0]?.voters, 4 + 2 + 854)
  assert.equal(a.getCoverage(rows).pollingStations, 2)
})

test('sección con 4.º carácter no vacío: no se trunca y bloquea el municipio', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28', (file, lines) =>
    file.startsWith('09') || file.startsWith('10')
      ? lines.map((l) => (l.slice(11, 16) === '02007' && l[22] === 'B' ? `${l.slice(0, 21)}A${l.slice(22)}` : l))
      : lines,
  )
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const b = rows.find((r) => r.municipalityCode === '02007' && r.table === 'B')
  assert.equal(b?.sectionCode, '001A')
  const v = a.validateSourceRows(rows)
  assert.ok(v.errors.some((e) => e.startsWith('02007:') && /sección "001A"/.test(e)))
  assert.ok(!v.errors.some((e) => e.startsWith('04045:')))
})

test('mesa duplicada en el 09 → error del municipio', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28', (file, lines) =>
    file.startsWith('09') ? [...lines, lines.find((l) => l.startsWith('042023051070200701001 A')) as string] : lines,
  )
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const v = a.validateSourceRows(rows)
  assert.ok(v.errors.some((e) => e.startsWith('02007:') && /mesa duplicada/.test(e)))
})

test('suma del 10 ≠ candidaturas del 09 → error del municipio', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28', (file, lines) =>
    file.startsWith('10') ? lines.filter((l) => !(l.startsWith('042023051070200701001 A') && l.slice(23, 29) === '000006')) : lines,
  )
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const v = a.validateSourceRows(rows)
  assert.ok(v.errors.some((e) => e.startsWith('02007:') && /suma por candidatura 269 ≠ votos a candidaturas 382/.test(e)))
})

test('registro del 10 sin mesa en el 09 → error global', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28', (file, lines) =>
    file.startsWith('09') ? lines.filter((l) => !l.startsWith('042023051070200701001 B')) : lines,
  )
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const v = a.validateSourceRows(rows)
  assert.equal(v.ok, false)
  assert.ok(v.errors[0]?.startsWith('10: 2 registros sin mesa'))
})

test('municipio inexistente en el 05 → error del municipio', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28', (file, lines) =>
    file.startsWith('05') ? lines.filter((l) => l.slice(11, 16) !== '16246') : file.startsWith('06') ? lines.filter((l) => l.slice(9, 14) !== '16246') : lines,
  )
  const a = createInteriorAdapter()
  const rows = (await a.parsePollingStations([f], ctx)).map((r) => a.normalizeTerritorialCodes(r))
  const v = a.validateSourceRows(rows)
  assert.ok(v.errors.some((e) => e.startsWith('16246:') && /inexistente/.test(e)))
})

test('referencia municipal 05/06 y municipios < 250 hab. (11)', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28')
  const a = createInteriorAdapter()
  const ref = await a.municipalReferenceDetailed([f])
  const r = ref.get('02007')
  assert.equal(r?.pollingStations, 2)
  assert.deepEqual(r?.totals, { census: 979, voters: 812, validVotes: 802, blankVotes: 11, nullVotes: 10, candidacyVotes: 791, votes: { '000006': 209, '000030': 582 } })
  const only = await a.municipalityOnly([f])
  assert.equal(only.length, 1)
  assert.equal(only[0]?.municipalityCode, '02013')
  assert.match(only[0]?.reason ?? '', /^municipality_only/)
})

test('candidaturas: id = código de la fuente, acumulación y color con contraste', async () => {
  const f = await fixturePackage('04202305', 'municipal', '2023-05-28')
  const a = createInteriorAdapter()
  const c1 = await a.normalizeCandidacies([f])
  const c2 = await a.normalizeCandidacies([f])
  assert.deepEqual(c1, c2)
  const psoe = c1.find((c) => c.id === '000030')
  assert.equal(psoe?.acronym, 'PSOE')
  assert.equal(psoe?.aggregationCodes?.national, '000030')
  for (const c of c1) {
    assert.match(c.color ?? '', /^#[0-9A-F]{6}$/)
    for (const bg of CONTRAST_BACKGROUNDS) assert.ok(contrastRatio(c.color as string, bg) >= 3, `${c.acronym} ${c.color} vs ${bg}`)
  }
})

test('códigos de la CLI: PowerShell pierde ceros → se rellenan', () => {
  assert.equal(normalizeCode('2003', 5), '02003')
  assert.equal(normalizeCode('8019', 5), '08019')
  assert.equal(normalizeCode('2', 2), '02')
  assert.deepEqual([...normalizeCodeList('2003, 28079;8019', 5)], ['02003', '28079', '08019'])
  assert.throws(() => normalizeCode('280790', 5))
  assert.throws(() => normalizeCode('2A003', 5))
})
