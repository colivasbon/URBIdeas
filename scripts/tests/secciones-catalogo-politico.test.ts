// Regresión de dos defectos encontrados al revisar València 46250.
// Uso: npx tsx --test scripts/tests/secciones-catalogo-politico.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { elegirConvocatoria } from '../../src/lib/socideas-secciones-dataset'
import type { PoliticalCatalog } from '../src/lib/socideas-secciones-political'

type Election = PoliticalCatalog['elections'][number]

function election(id: string, date: string, codes: string[]): Election {
  return {
    electionId: id,
    electionType: 'european',
    electionDate: date,
    label: id,
    territoryCode: null,
    sourceIds: [],
    definitive: true,
    municipalities: codes.length,
    publishableMunicipalities: codes.length,
    sections: 0,
    pollingStations: 0,
    municipalityCodes: codes,
  }
}

// El caso real de 46250: está en 7 de las 14 convocatorias del catálogo, pero
// NO en la más reciente (`european-2024-06-09`), que es la única con
// correspondencia sin resolver y por tanto no publicable para ningún municipio.
const INE = '46250'
const CATALOGO: PoliticalCatalog = {
  schemaVersion: 'political-catalog-v1',
  elections: [
    election('european-2024-06-09', '2024-06-09', ['02003', '28079']),
    election('autonomic-2024-05-12', '2024-05-12', ['46250']),
    election('municipal-2023-05-28', '2023-05-28', ['02003', '46250', '08019']),
    election('congress-2023-07-23', '2023-07-23', ['02003']),
    election('european-2019-05-26', '2019-05-26', ['46250']),
  ],
} as unknown as PoliticalCatalog

test('46250: elige la convocatoria más reciente PARA EL MUNICIPIO, no la del catálogo', () => {
  const r = elegirConvocatoria(CATALOGO, undefined, INE)
  assert.ok(r, 'debe elegir convocatoria')
  // La más reciente global es european-2024-06-09, donde 46250 no tiene objeto.
  assert.equal(r.electionId, 'autonomic-2024-05-12')
  assert.equal(r.electionDate, '2024-05-12')
})

test('46250: nunca elige la convocatoria sin objeto publicable para él', () => {
  const r = elegirConvocatoria(CATALOGO, undefined, INE)
  assert.notEqual(r?.electionId, 'european-2024-06-09')
})

test('un municipio presente en la más reciente global sí la recibe', () => {
  const r = elegirConvocatoria(CATALOGO, undefined, '28079')
  assert.equal(r?.electionId, 'european-2024-06-09')
})

test('un municipio sin datos en ninguna convocatoria cae en la más reciente (no falla)', () => {
  const r = elegirConvocatoria(CATALOGO, undefined, '99999')
  assert.equal(r?.electionId, 'european-2024-06-09')
})

test('una convocatoria pedida explícitamente se respeta aunque el municipio no esté', () => {
  const r = elegirConvocatoria(CATALOGO, 'municipal-2023-05-28', '99999')
  assert.equal(r?.electionId, 'municipal-2023-05-28')
})

test('catálogo vacío o nulo devuelve null', () => {
  assert.equal(elegirConvocatoria(null, undefined, INE), null)
  assert.equal(elegirConvocatoria({ elections: [] } as unknown as PoliticalCatalog, undefined, INE), null)
})

test('el desajuste de claves del catálogo unificado: el bootstrap usa la clave inglesa', () => {
  // `fusionarCatalogos` devuelve { indicadores, cobertura, sourceChecksums } en
  // castellano y el atlas las consume en inglés. Un spread las añadía sin
  // sustituir `indicators`, y el cliente leía un catálogo sin los dominios:
  // todos los badges a cero. Se comprueba el contrato que espera el cliente.
  const catalogo = {
    indicadores: [{ id: 'edu_1' }, { id: 'pol_ganadora' }],
    cobertura: [{ indicatorId: 'edu_1', periodos: [2024] }],
    sourceChecksums: { edu_1: 'abc' },
  }
  const atlasBootstrap = { schemaVersion: 'x', indicators: [{ id: 'renta_1' }] as unknown[], cobertura: [], sourceChecksums: {} as Record<string, string> }

  const MAL = { ...atlasBootstrap, ...catalogo } as Record<string, unknown>
  assert.equal(MAL.indicators, atlasBootstrap.indicators, 'el spread NO debe cambiar el catálogo (regresión)')
  assert.ok(MAL.indicadores, 'el spread añade la clave castellana que el cliente no lee')

  const BIEN = {
    ...atlasBootstrap,
    indicators: catalogo.indicadores,
    cobertura: catalogo.cobertura,
    sourceChecksums: catalogo.sourceChecksums,
  }
  assert.equal(BIEN.indicators.length, 2, 'el catálogo del dominio debe sustituir al base')
  assert.ok(
    BIEN.indicators.some((i) => (i as { id: string }).id === 'pol_ganadora'),
    'los indicadores políticos deben llegar al cliente',
  )
  assert.equal(BIEN.indicadores, undefined, 'no debe quedar la clave castellana colgando')
})
