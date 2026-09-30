// Tests de las funciones puras del cargador educativo (scripts/education/*).
// Uso: npx tsx --test scripts/tests/education-loader.test.ts
//
// Los extractos CSV son líneas LITERALES de los ficheros oficiales del INE
// descargados en tmp/education-raw/2024/{prov}/{tableId}.csv. No hay datos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  claveTerritorialCoherente,
  normalizarCelda,
  normalizarCodigoMunicipio,
  normalizarCodigoProvincia,
  parsearCusec,
  parsearMunicipioColumna,
} from '../education/cells'
import { filaSinValor, parsearTablaTexto } from '../education/parse'
import {
  construirValoresSeccion,
  definicionesDesdeContrato,
  observacionAbsoluta,
  observacionPorcentaje,
  observacionSinCobertura,
} from '../education/indicators'
import { agruparPorMunicipio } from '../education/sections'
import { canonicalJson, construirMunicipio, huellaSin, validacionSuperada, tieneDatos } from '../education/municipal'
import { construirCatalogo, slug } from '../education/catalog'
import { coberturaGeometrica, indiceDesdeFeatures } from '../education/geometry'
import { conReintentos, mapPool } from '../education/pool'
import {
  EDUCATION_INDICATORS,
  educationIndicatorsWithData,
  isEducationMunicipalObject,
  type EducationMunicipalObject,
} from '../../src/lib/socideas-secciones-education'

// ─── Extractos literales ─────────────────────────────────────────────────────

// Extracto literal de tmp/education-raw/2024/02/66645.csv (INE, jaxiT3). Líneas copiadas sin modificar.
const FORMACION_02_66645 = [
  "﻿Provincias\tMunicipios\tSecciones\tSexo\tNivel de formación alcanzado\tPeriodo\tTotal",
  "02 Albacete\t02001 Abengibre\t\tTotal\tTotal\t2024\t711",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tTotal\t2024\t711",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tTotal\t2023\t713",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tEducación primaria e inferior\t2024\t197",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tPrimera etapa de Educación Secundaria y similar\t2024\t238",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2024\t100",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tEducación superior\t2024\t176",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tHombres\tTotal\t2024\t349",
].join('\r\n')

// Extracto literal de tmp/education-raw/2024/02/66647.csv (INE, jaxiT3). Líneas copiadas sin modificar.
const ACTIVIDAD_02_66647 = [
  "﻿Provincias\tMunicipios\tSecciones\tSexo\tRelación con la actividad\tPeriodo\tTotal",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tTotal\t2024\t709",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tOcupado/a\t2024\t327",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tParado/a\t2024\t25",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2024\t202",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tOtra situación de inactividad\t2024\t128",
  "02 Albacete\t02001 Abengibre\t0200101001 Abengibre sección 01001\tTotal\tEstudiante\t2024\t27",
].join('\r\n')

// Extracto literal de tmp/education-raw/2024/08/66669.csv (INE, jaxiT3). Líneas copiadas sin modificar.
const FORMACION_08_66669 = [
  "﻿Provincias\tMunicipios\tSecciones\tSexo\tNivel de formación alcanzado\tPeriodo\tTotal",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tTotal\t2024\t1.407",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tTotal\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tEducación primaria e inferior\t2024\t141",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tEducación primaria e inferior\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tPrimera etapa de Educación Secundaria y similar\t2024\t415",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tPrimera etapa de Educación Secundaria y similar\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2024\t380",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tEducación superior\t2024\t471",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tEducación superior\t2021\t\"\"",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tTotal\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tTotal\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tEducación primaria e inferior\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tEducación primaria e inferior\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tPrimera etapa de Educación Secundaria y similar\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tPrimera etapa de Educación Secundaria y similar\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tEducación superior\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tEducación superior\t2021\t.",
].join('\r\n')

// Extracto literal de tmp/education-raw/2024/08/66671.csv (INE, jaxiT3). Líneas copiadas sin modificar.
const ACTIVIDAD_08_66671 = [
  "﻿Provincias\tMunicipios\tSecciones\tSexo\tRelación con la actividad\tPeriodo\tTotal",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tTotal\t2024\t1.380",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tTotal\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tOcupado/a\t2024\t852",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tOcupado/a\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tParado/a\t2024\t52",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tParado/a\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2024\t241",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tOtra situación de inactividad\t2024\t151",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tOtra situación de inactividad\t2021\t\"\"",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tEstudiante\t2024\t84",
  "08 Barcelona\t08001 Abrera\t0800101009 Abrera sección 01009\tTotal\tEstudiante\t2021\t\"\"",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tTotal\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tTotal\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tOcupado/a\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tOcupado/a\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tParado/a\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tParado/a\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tOtra situación de inactividad\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tOtra situación de inactividad\t2021\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tEstudiante\t2024\t.",
  "08 Barcelona\t08080 Fígols\t0808001001 Fígols sección 01001\tTotal\tEstudiante\t2021\t.",
].join('\r\n')

// Extracto literal de tmp/education-raw/2024/46/66821.csv (INE, jaxiT3). Líneas copiadas sin modificar.
const FORMACION_46_66821 = [
  "﻿Provincias\tMunicipios\tSecciones\tSexo\tNivel de formación alcanzado\tPeriodo\tTotal",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tTotal\t2024\t3.548",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tEducación primaria e inferior\t2024\t194",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tPrimera etapa de Educación Secundaria y similar\t2024\t360",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2024\t600",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tEducación superior\t2024\t2.394",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tTotal\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tEducación primaria e inferior\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tPrimera etapa de Educación Secundaria y similar\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tSegunda etapa de Educación Secundaria y Educación Postsecundaria no Superior\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tEducación superior\t2024\t.",
].join('\r\n')

// Extracto literal de tmp/education-raw/2024/46/66823.csv (INE, jaxiT3). Líneas copiadas sin modificar.
const ACTIVIDAD_46_66823 = [
  "﻿Provincias\tMunicipios\tSecciones\tSexo\tRelación con la actividad\tPeriodo\tTotal",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tTotal\t2024\t3.480",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tOcupado/a\t2024\t1.891",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tParado/a\t2024\t88",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2024\t525",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tOtra situación de inactividad\t2024\t621",
  "46 Valencia/València\t46135 Godella\t4613504001 Godella sección 04001\tTotal\tEstudiante\t2024\t355",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tTotal\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tOcupado/a\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tParado/a\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tPerceptor/a pensión de incapacidad, jubilación, prejubilación\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tOtra situación de inactividad\t2024\t.",
  "46 Valencia/València\t46135 Godella\t4613504002 Godella sección 04002\tTotal\tEstudiante\t2024\t.",
].join('\r\n')

const SOLO_2024 = new Set([2024])
const SOURCE = {
  url: 'https://www.ine.es/dynt3/inebase/index.htm?padre=10607&capsel=10613',
  operation: '1254736176992',
  education_table: 0,
  activity_table: 0,
  education_sha256: 'x',
  activity_sha256: 'y',
  retrieved_at: '2026-09-29T16:07:00.000Z',
}
const IDS = EDUCATION_INDICATORS.map((i) => i.id)

function municipioDesde(fe: string, fa: string, periodo: number, ine: string): EducationMunicipalObject {
  const tE = parsearTablaTexto(fe, 'formacion', new Set([periodo]), 'fe')
  const tA = parsearTablaTexto(fa, 'actividad', new Set([periodo]), 'fa')
  const g = agruparPorMunicipio(tE.porPeriodo.get(periodo), tA.porPeriodo.get(periodo), new Set([ine])).get(ine)!
  return construirMunicipio({
    period: periodo,
    municipality_code: g.code,
    municipality_name: g.name,
    province_code: ine.slice(0, 2),
    parser_version: 'test',
    mapping_version: 'test',
    source: SOURCE,
    secciones: g.secciones,
    indicadores: IDS,
    excluidas: g.excluidas,
    incidenciasCruce: g.incidencias,
  })
}

// ─── Celdas ──────────────────────────────────────────────────────────────────

test('celda vacía → vacío (ND), nunca 0', () => {
  assert.deepEqual(normalizarCelda(''), { kind: 'vacio', marker: '' })
  assert.deepEqual(normalizarCelda('""'), { kind: 'vacio', marker: '""' })
  const o = observacionAbsoluta(normalizarCelda('')!)
  assert.equal(o.value, null)
  assert.equal(o.nd_flag, true)
  assert.equal(o.status, 'no_difundido')
})

test("celda '.' → ND por secreto estadístico, nunca 0", () => {
  assert.deepEqual(normalizarCelda('.'), { kind: 'nd', marker: '.' })
  const o = observacionAbsoluta(normalizarCelda('.')!)
  assert.equal(o.value, null)
  assert.equal(o.numerator, null)
  assert.equal(o.nd_flag, true)
  assert.equal(o.suppression_flag, true)
  assert.equal(o.reason, 'statistical_confidentiality')
})

test("'1.349' → 1349 (millares es-ES)", () => {
  assert.deepEqual(normalizarCelda('1.349'), { kind: 'numero', value: 1349 })
  assert.deepEqual(normalizarCelda('1.234.567'), { kind: 'numero', value: 1234567 })
  assert.deepEqual(normalizarCelda(' 711 '), { kind: 'numero', value: 711 })
})

test("'0' → 0 observado (cero real, no ND)", () => {
  assert.deepEqual(normalizarCelda('0'), { kind: 'numero', value: 0 })
  const o = observacionAbsoluta(normalizarCelda('0')!)
  assert.equal(o.value, 0)
  assert.equal(o.status, 'observado')
  assert.equal(o.nd_flag, false)
})

test('valores no reconocidos → null (fail-closed)', () => {
  assert.equal(normalizarCelda('12.34'), null)
  assert.equal(normalizarCelda('1,5'), null)
  assert.equal(normalizarCelda('abc'), null)
  assert.equal(normalizarCelda('-3'), null)
})

test('CUSEC con ceros iniciales se conserva como texto de 10 dígitos', () => {
  const c = parsearCusec('0200101001 Abengibre sección 01001')!
  assert.equal(c.cusec, '0200101001')
  assert.equal(c.provincia, '02')
  assert.equal(c.municipio, '02001')
  assert.equal(c.distrito, '01')
  assert.equal(c.seccion, '001')
  assert.equal(c.etiqueta, 'Abengibre sección 01001')
  assert.equal(parsearCusec('200101001 Abengibre'), null)
  assert.deepEqual(parsearMunicipioColumna('08080 Fígols'), { code: '08080', name: 'Fígols' })
})

test('clave territorial: CUSEC 10 ⊃ INE 5 ⊃ provincia 2 (también provincias 10–52)', () => {
  assert.equal(claveTerritorialCoherente('0200101001', '02001', '02'), true)
  assert.equal(claveTerritorialCoherente('4613504001', '46135', '46'), true)
  assert.equal(claveTerritorialCoherente('2807901001', '28079', '28'), true)
  assert.equal(claveTerritorialCoherente('4613504001', '46136', '46'), false)
  assert.equal(claveTerritorialCoherente('200101001', '2001', '2'), false)
})

test("municipio de 5 dígitos desde PowerShell: '8019' → '08019'", () => {
  assert.equal(normalizarCodigoMunicipio('8019'), '08019')
  assert.equal(normalizarCodigoMunicipio('08019'), '08019')
  assert.equal(normalizarCodigoMunicipio('2003'), '02003')
  assert.equal(normalizarCodigoMunicipio(' 46250 '), '46250')
  assert.throws(() => normalizarCodigoMunicipio('99001'))
  assert.throws(() => normalizarCodigoMunicipio('0801a'))
  assert.throws(() => normalizarCodigoMunicipio(''))
  assert.equal(normalizarCodigoProvincia('2'), '02')
  assert.throws(() => normalizarCodigoProvincia('53'))
})

// ─── Parseo ──────────────────────────────────────────────────────────────────

test('parseo: sólo Sexo=Total, sin filas agregadas, periodo filtrado', () => {
  const t = parsearTablaTexto(FORMACION_02_66645, 'formacion', SOLO_2024, '66645.csv')
  assert.deepEqual(t.periodosEnFuente, [2023, 2024])
  const secs = t.porPeriodo.get(2024)!
  assert.deepEqual([...secs.keys()], ['0200101001'])
  const f = secs.get('0200101001')!
  assert.equal(f.nombreMunicipio, 'Abengibre')
  assert.equal(f.celdas.size, 5)
  // Hombres (349) no pisa el Total (711)
  assert.deepEqual(f.celdas.get('Total'), { kind: 'numero', value: 711 })
  assert.equal(t.porPeriodo.has(2023), false)
  const todos = parsearTablaTexto(FORMACION_02_66645, 'formacion', null, '66645.csv')
  assert.deepEqual([...todos.porPeriodo.keys()].sort(), [2023, 2024])
})

test('parseo: tabla de formación leída como actividad → error', () => {
  assert.throws(() => parsearTablaTexto(FORMACION_02_66645, 'actividad', SOLO_2024, '66645.csv'), /columna de actividad/)
})

test("parseo: sección con '\"\"' en todo el periodo → fila sin valor", () => {
  const t = parsearTablaTexto(FORMACION_08_66669, 'formacion', null, '66669.csv')
  assert.equal(filaSinValor(t.porPeriodo.get(2021)!.get('0800101009')), true)
  assert.equal(filaSinValor(t.porPeriodo.get(2024)!.get('0800101009')), false)
  // '.' es ND, no "sin valor": la sección existe pero está suprimida
  assert.equal(filaSinValor(t.porPeriodo.get(2024)!.get('0808001001')), false)
})

// ─── Indicadores ─────────────────────────────────────────────────────────────

test('definiciones derivadas del contrato: 11 recuentos y 9 porcentajes', () => {
  const d = definicionesDesdeContrato()
  assert.equal(d.absolutos.length, 11)
  assert.equal(d.porcentajes.length, 9)
  assert.deepEqual(d.porcentajes.find((p) => p.id === 'act_pct_parados'), {
    id: 'act_pct_parados',
    numeradorId: 'act_personas_parados',
    denominadorId: 'act_personas_total_16',
  })
})

test('% con denominador explícito', () => {
  const o = observacionPorcentaje(observacionAbsoluta({ kind: 'numero', value: 176 }), observacionAbsoluta({ kind: 'numero', value: 711 }))
  assert.equal(o.status, 'derivado_verificable')
  assert.equal(o.numerator, 176)
  assert.equal(o.denominator, 711)
  assert.equal(o.value, (176 / 711) * 100)
})

test('ND propagado a %', () => {
  const nd = observacionAbsoluta({ kind: 'nd', marker: '.' })
  const ok = observacionAbsoluta({ kind: 'numero', value: 50 })
  for (const o of [observacionPorcentaje(nd, ok), observacionPorcentaje(ok, nd), observacionPorcentaje(nd, nd)]) {
    assert.equal(o.value, null)
    assert.equal(o.status, 'no_difundido')
    assert.equal(o.nd_flag, true)
    assert.equal(o.suppression_flag, true)
  }
  const vac = observacionPorcentaje(ok, observacionAbsoluta({ kind: 'vacio', marker: '""' }))
  assert.equal(vac.nd_flag, true)
  assert.equal(vac.suppression_flag, false)
  assert.equal(vac.reason, 'celda_vacia_en_origen')
})

test('denominador 0 → ND con motivo, nunca división ni 0', () => {
  const o = observacionPorcentaje(observacionAbsoluta({ kind: 'numero', value: 0 }), observacionAbsoluta({ kind: 'numero', value: 0 }))
  assert.equal(o.value, null)
  assert.equal(o.status, 'no_difundido')
  assert.equal(o.reason, 'denominador_cero')
  assert.equal(o.numerator, 0)
  assert.equal(o.denominator, 0)
})

test('componente sin cobertura → % sin cobertura', () => {
  const o = observacionPorcentaje(observacionSinCobertura('x'), observacionAbsoluta({ kind: 'numero', value: 10 }))
  assert.equal(o.status, 'sin_cobertura')
  assert.equal(o.nd_flag, false)
})

test('sección sin tabla de actividad → indicadores de actividad sin cobertura', () => {
  const t = parsearTablaTexto(FORMACION_02_66645, 'formacion', SOLO_2024, 'fe')
  const v = construirValoresSeccion(t.porPeriodo.get(2024)!.get('0200101001')!.celdas, undefined)
  assert.equal(v.edu_personas_total.value, 711)
  assert.equal(v.act_personas_total_16.status, 'sin_cobertura')
  assert.equal(v.act_personas_total_16.reason, 'seccion_ausente_en_tabla_actividad')
  assert.equal(v.act_pct_ocupados.status, 'sin_cobertura')
})

// ─── Objeto municipal ────────────────────────────────────────────────────────

test('Abengibre 2024: valores literales del CSV y contrato completo', () => {
  const o = municipioDesde(FORMACION_02_66645, ACTIVIDAD_02_66647, 2024, '02001')
  assert.equal(isEducationMunicipalObject(o), true)
  assert.equal(o.municipality_code, '02001')
  assert.equal(o.province_code, '02')
  assert.equal(o.sections.length, 1)
  const v = o.sections[0].values
  assert.equal(v.edu_personas_total.value, 711)
  assert.equal(v.edu_personas_educacion_superior.value, 176)
  assert.equal(v.act_personas_total_16.value, 709)
  assert.equal(v.act_personas_parados.value, 25)
  assert.equal(v.edu_pct_educacion_superior.value, (176 / 711) * 100)
  assert.equal(v.act_pct_ocupados.numerator, 327)
  assert.equal(v.act_pct_ocupados.denominator, 709)
  assert.deepEqual(Object.keys(v), IDS)
  assert.deepEqual(o.coverage, {
    result_sections: 1, sections_with_data: 1, sections_suppressed: 0, indicators: 20, observations: 20, nd: 0, suppressed: 0,
  })
  assert.deepEqual(o.indicator_availability.edu_pct_educacion_superior, { observed_sections: 1, nd_sections: 0, no_coverage_sections: 0 })
  assert.equal(validacionSuperada(o), true)
  assert.deepEqual(o.validation.issues, [])
  assert.deepEqual(o.quality_flags, [])
  assert.equal(educationIndicatorsWithData(o).length, 20)
})

test('Fígols 2024: todo ND por supresión → all_nd, sin ceros', () => {
  const o = municipioDesde(FORMACION_08_66669, ACTIVIDAD_08_66671, 2024, '08080')
  assert.deepEqual(o.quality_flags, ['all_nd'])
  assert.equal(tieneDatos(o), false)
  assert.equal(o.coverage.nd, 20)
  assert.equal(o.coverage.suppressed, 20)
  assert.equal(o.coverage.sections_with_data, 0)
  assert.equal(o.coverage.sections_suppressed, 1)
  for (const x of Object.values(o.sections[0].values)) assert.equal(x.value, null)
  assert.equal(o.indicator_availability.edu_personas_total.nd_sections, 1)
  assert.equal(validacionSuperada(o), true)
  assert.deepEqual(educationIndicatorsWithData(o), [])
})

test('Abrera 2021: sección "" en ambas tablas → excluida, no ND', () => {
  const tE = parsearTablaTexto(FORMACION_08_66669, 'formacion', new Set([2021]), 'fe')
  const tA = parsearTablaTexto(ACTIVIDAD_08_66671, 'actividad', new Set([2021]), 'fa')
  const g = agruparPorMunicipio(tE.porPeriodo.get(2021), tA.porPeriodo.get(2021), null)
  assert.deepEqual(g.get('08001')!.excluidas, ['0800101009'])
  assert.equal(g.get('08001')!.secciones.length, 0)
  assert.equal(g.get('08080')!.secciones.length, 1)
})

test('Abrera 2024: millares "1.407" y porcentaje verificable', () => {
  const o = municipioDesde(FORMACION_08_66669, ACTIVIDAD_08_66671, 2024, '08001')
  const v = o.sections[0].values
  assert.equal(v.edu_personas_total.value, 1407)
  assert.equal(v.act_personas_total_16.value, 1380)
  assert.equal(v.edu_pct_educacion_superior.value, (471 / 1407) * 100)
  assert.equal(o.validation.percentages_in_range, true)
})

test('Godella 2024 (provincia 46): ND parcial y claves con prefijo ≥ 10', () => {
  const o = municipioDesde(FORMACION_46_66821, ACTIVIDAD_46_66823, 2024, '46135')
  assert.equal(o.validation.leading_zeros_preserved, true)
  assert.deepEqual(o.quality_flags, ['partial_nd'])
  assert.equal(o.coverage.result_sections, 2)
  assert.equal(o.coverage.sections_with_data, 1)
  assert.equal(o.coverage.sections_suppressed, 1)
  assert.deepEqual(o.indicator_availability.edu_pct_educacion_superior, { observed_sections: 1, nd_sections: 1, no_coverage_sections: 0 })
  assert.equal(o.sections[0].values.edu_personas_educacion_superior.value, 2394)
  assert.equal(o.sections[1].values.edu_personas_total.value, null)
  assert.equal(validacionSuperada(o), true)
})

test('idempotencia: mismo CSV → mismo content_sha256; JSON ida y vuelta conserva la huella', () => {
  const a = municipioDesde(FORMACION_46_66821, ACTIVIDAD_46_66823, 2024, '46135')
  const b = municipioDesde(FORMACION_46_66821, ACTIVIDAD_46_66823, 2024, '46135')
  assert.equal(a.content_sha256, b.content_sha256)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.equal(huellaSin(a, 'content_sha256'), a.content_sha256)
  const vuelta = JSON.parse(JSON.stringify(a)) as EducationMunicipalObject
  assert.equal(huellaSin(vuelta, 'content_sha256'), a.content_sha256)
  assert.equal('generated_at' in a, false)
})

test('canonicalJson ordena claves y rechaza no finitos', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}')
  assert.throws(() => canonicalJson({ a: Number.NaN }))
})

// ─── Catálogo y geometría ────────────────────────────────────────────────────

test('catálogo: municipalities sólo con ≥1 indicador observado; disponibilidad agregada', () => {
  const ab = municipioDesde(FORMACION_02_66645, ACTIVIDAD_02_66647, 2024, '02001')
  const fi = municipioDesde(FORMACION_08_66669, ACTIVIDAD_08_66671, 2024, '08080')
  const res = [ab, fi].map((o) => ({
    code: o.municipality_code, province: o.province_code, has_data: tieneDatos(o), availability: o.indicator_availability,
    sections: o.coverage.result_sections, observations: o.coverage.observations, nd: o.coverage.nd, suppressed: o.coverage.suppressed,
  }))
  const cat = construirCatalogo({
    period: 2024, periods: [2024, 2024], parserVersion: 'p', mappingVersion: 'm',
    source: { url: 'u', index_url: 'i', operation: 'o', label: 'l', organism: 'INE', licence: 'lic' },
    provincias: [{ code: '08', formacion: 66669, actividad: 66671, ok: true }, { code: '02', formacion: 66645, actividad: 66647, ok: true }],
    resumenes: res,
    exclusiones: [{ requested: 'Máster, Doctorado', reason: 'r' }],
    geometry: { join_key: 'CUSEC', source: 's', note: 'n' },
    syncedAt: '2026-09-29T00:00:00.000Z',
  })
  assert.deepEqual(cat.municipalities, ['02001'])
  assert.deepEqual(cat.periods, [2024])
  assert.equal(cat.totals.municipalities, 2)
  assert.equal(cat.totals.nd, 20)
  const sup = cat.indicators.find((i) => i.id === 'edu_pct_educacion_superior')!
  assert.deepEqual(sup.availability, { observed_sections: 1, nd_sections: 1, no_coverage_sections: 0, municipalities_with_data: 1 })
  assert.deepEqual(sup.tables, { '02': 66645, '08': 66669 })
  assert.deepEqual(cat.indicators.find((i) => i.id === 'act_pct_parados')!.tables, { '02': 66647, '08': 66671 })
  assert.deepEqual(cat.exclusions, [{ id: 'master_doctorado', reason: 'r' }])
  assert.equal(slug('Bachillerato, FP de grado medio'), 'bachillerato_fp_de_grado_medio')
})

test('índice de geometría: excluye agregados de distrito y otras provincias', () => {
  const r = indiceDesdeFeatures(
    [{ properties: { CUSEC: '0200301000' } }, { properties: { CUSEC: '0200301001' } }, { properties: { CUSEC: '0200101001' } }, { properties: { CUSEC: '2807901001' } }],
    '02',
  )
  assert.deepEqual(r.index, { '02003': ['0200301001'], '02001': ['0200101001'] })
  assert.equal(r.district_aggregates, 1)
  assert.deepEqual(r.invalid, ['2807901001'])
  const c = coberturaGeometrica(['0200301001', '0200301002'], ['0200301001', '0200301003'], ['0200301004'])
  assert.equal(c.matched, 1)
  assert.equal(c.unmatched, 1)
  assert.equal(c.geometry_only, 1)
  assert.equal(c.excluded, 1)
  assert.equal(c.excluded_with_geometry, 0)
})

// ─── Pool y reintentos ───────────────────────────────────────────────────────

test('mapPool conserva el orden y no supera la concurrencia', async () => {
  let activos = 0
  let pico = 0
  const out = await mapPool([5, 1, 4, 2, 3], 2, async (x) => {
    activos++
    pico = Math.max(pico, activos)
    await new Promise((r) => setTimeout(r, x))
    activos--
    return x * 10
  })
  assert.deepEqual(out, [50, 10, 40, 20, 30])
  assert.equal(pico, 2)
})

test('conReintentos reintenta 5xx y no reintenta 404', async () => {
  let n = 0
  const v = await conReintentos(async () => {
    n++
    if (n < 3) throw Object.assign(new Error('x'), { $metadata: { httpStatusCode: 503 } })
    return 'ok'
  }, { baseMs: 1 })
  assert.equal(v, 'ok')
  assert.equal(n, 3)
  let m = 0
  await assert.rejects(conReintentos(async () => {
    m++
    throw Object.assign(new Error('no'), { $metadata: { httpStatusCode: 404 } })
  }, { baseMs: 1 }))
  assert.equal(m, 1)
})
