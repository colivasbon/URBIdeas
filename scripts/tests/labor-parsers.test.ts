// Tests para parseSepeCellLocal y parseTgssCellLocal
// Uso: npx tsx --test scripts/tests/labor-parsers.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSepeCellLocal } from '../../src/lib/sepe-paro'
import { parseTgssCellLocal } from '../../src/lib/tgss-afiliacion'

// ─── parseSepeCellLocal ───────────────────────────────────────────────────────

test('SEPE: string vacío → null', () => {
  assert.equal(parseSepeCellLocal(''), null)
})

test('SEPE: undefined → null', () => {
  assert.equal(parseSepeCellLocal(undefined), null)
})

test('SEPE: null → null', () => {
  assert.equal(parseSepeCellLocal(null), null)
})

test('SEPE: "<5" → null (secreto estadístico)', () => {
  assert.equal(parseSepeCellLocal('<5'), null)
})

test('SEPE: "< 5" (con espacio) → null', () => {
  assert.equal(parseSepeCellLocal('< 5'), null)
})

test('SEPE: "0" → 0 (cero observado válido)', () => {
  assert.equal(parseSepeCellLocal('0'), 0)
})

test('SEPE: "45" → 45', () => {
  assert.equal(parseSepeCellLocal('45'), 45)
})

test('SEPE: "  45  " (con espacios) → 45', () => {
  assert.equal(parseSepeCellLocal('  45  '), 45)
})

test('SEPE: texto inválido "abc" → null', () => {
  assert.equal(parseSepeCellLocal('abc'), null)
})

test('SEPE: número negativo "-5" → null', () => {
  assert.equal(parseSepeCellLocal('-5'), null)
})

test('SEPE: número decimal "45.5" → null', () => {
  assert.equal(parseSepeCellLocal('45.5'), null)
})

test('SEPE: número 0 como number → 0', () => {
  assert.equal(parseSepeCellLocal(0), 0)
})

test('SEPE: número 45 como number → 45', () => {
  assert.equal(parseSepeCellLocal(45), 45)
})

test('SEPE: número negativo como number → null', () => {
  assert.equal(parseSepeCellLocal(-1), null)
})

test('SEPE: NaN → null', () => {
  assert.equal(parseSepeCellLocal(NaN), null)
})

test('SEPE: Infinity → null', () => {
  assert.equal(parseSepeCellLocal(Infinity), null)
})

test('SEPE: ">=10" → null (rango, no exacto)', () => {
  assert.equal(parseSepeCellLocal('>=10'), null)
})

test('SEPE: boolean true → null', () => {
  assert.equal(parseSepeCellLocal(true), null)
})

// ─── parseTgssCellLocal ───────────────────────────────────────────────────────

test('TGSS: string vacío → null', () => {
  assert.equal(parseTgssCellLocal(''), null)
})

test('TGSS: undefined → null', () => {
  assert.equal(parseTgssCellLocal(undefined), null)
})

test('TGSS: null → null', () => {
  assert.equal(parseTgssCellLocal(null), null)
})

test('TGSS: "<5" → null (secreto estadístico)', () => {
  assert.equal(parseTgssCellLocal('<5'), null)
})

test('TGSS: "< 5" (con espacio) → null', () => {
  assert.equal(parseTgssCellLocal('< 5'), null)
})

test('TGSS: "0" → 0 (cero observado válido)', () => {
  assert.equal(parseTgssCellLocal('0'), 0)
})

test('TGSS: "45" → 45', () => {
  assert.equal(parseTgssCellLocal('45'), 45)
})

test('TGSS: "  45  " (con espacios) → 45', () => {
  assert.equal(parseTgssCellLocal('  45  '), 45)
})

test('TGSS: texto inválido "abc" → null', () => {
  assert.equal(parseTgssCellLocal('abc'), null)
})

test('TGSS: número negativo "-5" → null', () => {
  assert.equal(parseTgssCellLocal('-5'), null)
})

test('TGSS: número decimal "45.5" → null', () => {
  assert.equal(parseTgssCellLocal('45.5'), null)
})

test('TGSS: número 0 como number → 0', () => {
  assert.equal(parseTgssCellLocal(0), 0)
})

test('TGSS: número 45 como number → 45', () => {
  assert.equal(parseTgssCellLocal(45), 45)
})

test('TGSS: número negativo como number → null', () => {
  assert.equal(parseTgssCellLocal(-1), null)
})

test('TGSS: NaN → null', () => {
  assert.equal(parseTgssCellLocal(NaN), null)
})

test('TGSS: Infinity → null', () => {
  assert.equal(parseTgssCellLocal(Infinity), null)
})

test('TGSS: ">=10" → null (rango, no exacto)', () => {
  assert.equal(parseTgssCellLocal('>=10'), null)
})

test('TGSS: boolean true → null', () => {
  assert.equal(parseTgssCellLocal(true), null)
})

test('TGSS: "1.234" (punto miles) → 1234', () => {
  assert.equal(parseTgssCellLocal('1.234'), 1234)
})

test('TGSS: "1.234.567" (puntos miles) → 1234567', () => {
  assert.equal(parseTgssCellLocal('1.234.567'), 1234567)
})
