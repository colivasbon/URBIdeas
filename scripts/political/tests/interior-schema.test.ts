// Esquema de los .DAT de Interior con extractos LITERALES de los paquetes oficiales.
// Uso: npx tsx --test scripts/political/tests/interior-schema.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FixedWidthError, assertSpec, decodeAnsi, int, parseLine, parseRecords, splitRecords } from '../core/fixed-width'
import { ALL_SPECS, SPEC_03, SPEC_05, SPEC_06, SPEC_09, SPEC_10, SPEC_11 } from '../adapters/interior/spec'
import { FIXTURE_DIR, fixtureLines } from '../fixtures/interior/load-fixture'

const text = (code: string, f: string) => decodeAnsi(readFileSync(join(FIXTURE_DIR, code, f)))

test('especificaciones: campos contiguos y longitud = FICHEROS.doc', () => {
  for (const s of ALL_SPECS) assertSpec(s)
  assert.equal(SPEC_09.length, 101)
  assert.equal(SPEC_10.length, 36)
  assert.equal(SPEC_03.length, 232)
  assert.equal(SPEC_05.length, 233)
  assert.equal(SPEC_06.length, 33)
  assert.equal(SPEC_11.length, 160)
})

test('09: mesa A de Alcalá del Júcar (02007), municipales 2023', () => {
  const l = fixtureLines('04202305', '09042305.DAT').find((x) => x.startsWith('042023051070200701001 A')) as string
  const r = parseLine(l, SPEC_09, 1)
  assert.equal(r.tipo, '04')
  assert.equal(r.anio, '2023')
  assert.equal(r.ccaa, '07')
  assert.equal(r.provincia, '02')
  assert.equal(r.municipio, '007')
  assert.equal(r.distrito, '01')
  assert.equal(r.seccion, '001 ')
  assert.equal(r.mesa, 'A')
  assert.equal(int(r.censoEscrutinio as string), 469)
  assert.equal(int(r.blancos as string), 2)
  assert.equal(int(r.nulos as string), 7)
  assert.equal(int(r.candidaturas as string), 382)
  assert.equal(r.oficial, 'S')
})

test('09: códigos conservan ceros a la izquierda (texto, nunca número)', () => {
  const r = parseLine(fixtureLines('04202305', '09042305.DAT')[3] as string, SPEC_09, 4)
  assert.equal(typeof r.provincia, 'string')
  assert.equal(`${r.provincia}${r.municipio}`, '02007')
})

test('09: CERA en Congreso 2023 = municipio 999, distrito 09, sección 0000, mesa U', () => {
  const l = fixtureLines('02202307', '09022307.DAT').find((x) => x.slice(13, 16) === '999') as string
  const r = parseLine(l, SPEC_09, 1)
  assert.equal(r.provincia, '02')
  assert.equal(r.municipio, '999')
  assert.equal(r.distrito, '09')
  assert.equal(r.seccion, '0000')
  assert.equal(r.mesa, 'U')
  assert.equal(int(r.censoEscrutinio as string), 8064)
  // La especificación dice que el CERA lleva censo INE 000000; en Congreso 2023
  // el fichero real trae el mismo valor que el censo de escrutinio.
  assert.equal(int(r.censoIne as string), 8064)
})

test('10: votos por candidatura y mesa', () => {
  const rows = parseRecords(text('04202305', '10042305.DAT'), SPEC_10)
  const a = rows.filter((r) => r.provincia === '02' && r.municipio === '007' && r.mesa === 'A')
  assert.deepEqual(
    a.map((r) => [r.candidatura, int(r.votos as string)]),
    [
      ['000006', 113],
      ['000030', 269],
    ],
  )
})

test('10: los ceros se publican explícitamente (Congreso 2023, 02007)', () => {
  const rows = parseRecords(text('02202307', '10022307.DAT'), SPEC_10).filter((r) => r.municipio === '007')
  assert.ok(rows.some((r) => r.candidatura === '000001' && int(r.votos as string) === 0))
})

test('03: siglas, denominación y códigos de acumulación; ANSI (Í) decodificado', () => {
  const rows = parseRecords(text('04202305', '03042305.DAT'), SPEC_03)
  const pp = rows.find((r) => r.codigo === '000006')
  assert.equal((pp?.siglas as string).trim(), 'PP')
  assert.equal((pp?.denominacion as string).trim(), 'PARTIDO POPULAR')
  assert.equal(pp?.accNacional, '000006')
  const ca = rows.find((r) => r.codigo === '000286')
  assert.equal((ca?.siglas as string).trim(), 'CON ANDALUCÍA')
})

test('05/06: total municipal (distrito 99) de 02007', () => {
  const r5 = parseRecords(text('04202305', '05042305.DAT'), SPEC_05).find((r) => r.municipio === '007' && r.distrito === '99')
  assert.ok(r5)
  assert.equal(int(r5.mesas as string), 2)
  assert.equal(int(r5.censoEscrutinio as string), 979)
  assert.equal(int(r5.blancos as string), 11)
  assert.equal(int(r5.nulos as string), 10)
  assert.equal(int(r5.candidaturas as string), 791)
  assert.equal((r5.nombre as string).trim(), 'Alcalá del Júcar')
  const r6 = parseRecords(text('04202305', '06042305.DAT'), SPEC_06).filter((r) => r.municipio === '007' && r.distrito === '99')
  assert.deepEqual(r6.map((r) => [r.candidatura, int(r.votos as string)]), [['000006', 209], ['000030', 582]])
})

test('11: municipio < 250 hab. (02013 Balsa de Ves), sin mesa', () => {
  const r = parseRecords(text('04202305', '11042305.DAT'), SPEC_11)[0]
  assert.equal(r?.tipoMunicipio, '08')
  assert.equal(`${r?.provincia}${r?.municipio}`, '02013')
  assert.equal((r?.nombre as string).trim(), 'Balsa de Ves')
})

test('error: línea truncada → FixedWidthError con nº de línea', () => {
  const lines = fixtureLines('04202305', '09042305.DAT')
  const broken = [lines[0], (lines[1] as string).slice(0, 80), lines[2]].join('\n')
  assert.throws(() => parseRecords(broken, SPEC_09, '09042305.DAT'), (e: unknown) => e instanceof FixedWidthError && e.lineNumber === 2)
})

test('error: campo numérico no numérico', () => {
  const l = fixtureLines('04202305', '09042305.DAT')[0] as string
  const bad = `${l.slice(0, 30)}X${l.slice(31)}`
  assert.throws(() => parseLine(bad, SPEC_09, 1), /no numérico/)
})

test('separadores LF y CR+LF', () => {
  const lines = fixtureLines('04202305', '09042305.DAT')
  assert.equal(splitRecords(lines.join('\n') + '\n').length, lines.length)
  assert.equal(splitRecords(lines.join('\r\n') + '\r\n').length, lines.length)
})
