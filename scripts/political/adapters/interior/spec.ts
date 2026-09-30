// Especificación de registros APLIEXTR (Ministerio del Interior).
//
// Posiciones literales de FICHEROS.doc incluido en cada paquete
// (extraídas a tmp/audit/political/interior/ficheros-posiciones.txt el
// 2026-09-29). 1-based, inclusivas. Nombre de fichero: nnxxaamm.DAT.

import type { RecordSpec } from '../../core/fixed-width'

const H = [
  { name: 'tipo', start: 1, end: 2, type: 'num' },
  { name: 'anio', start: 3, end: 6, type: 'num' },
  { name: 'mes', start: 7, end: 8, type: 'num' },
] as const

/** 03 — Candidaturas. */
export const SPEC_03: RecordSpec = {
  file: '03',
  description: 'Fichero de CANDIDATURAS',
  length: 232,
  fields: [
    ...H,
    { name: 'codigo', start: 9, end: 14, type: 'num' },
    { name: 'siglas', start: 15, end: 64, type: 'alf' },
    { name: 'denominacion', start: 65, end: 214, type: 'alf' },
    { name: 'accProvincial', start: 215, end: 220, type: 'num' },
    { name: 'accAutonomica', start: 221, end: 226, type: 'num' },
    { name: 'accNacional', start: 227, end: 232, type: 'num' },
  ],
}

/** 05 — Datos comunes de municipios (distrito 99 = total municipal). */
export const SPEC_05: RecordSpec = {
  file: '05',
  description: 'Fichero de DATOS COMUNES DE MUNICIPIOS',
  length: 233,
  fields: [
    ...H,
    { name: 'vuelta', start: 9, end: 9, type: 'num' },
    { name: 'ccaa', start: 10, end: 11, type: 'num' },
    { name: 'provincia', start: 12, end: 13, type: 'num' },
    { name: 'municipio', start: 14, end: 16, type: 'num' },
    { name: 'distrito', start: 17, end: 18, type: 'num' },
    { name: 'nombre', start: 19, end: 118, type: 'alf' },
    { name: 'distritoElectoral', start: 119, end: 119, type: 'num' },
    { name: 'partidoJudicial', start: 120, end: 122, type: 'num' },
    { name: 'diputacion', start: 123, end: 125, type: 'num' },
    { name: 'comarca', start: 126, end: 128, type: 'num' },
    { name: 'poblacion', start: 129, end: 136, type: 'num' },
    { name: 'mesas', start: 137, end: 141, type: 'num' },
    { name: 'censoIne', start: 142, end: 149, type: 'num' },
    { name: 'censoEscrutinio', start: 150, end: 157, type: 'num' },
    { name: 'censoCere', start: 158, end: 165, type: 'num' },
    { name: 'votantesCere', start: 166, end: 173, type: 'num' },
    { name: 'avance1', start: 174, end: 181, type: 'num' },
    { name: 'avance2', start: 182, end: 189, type: 'num' },
    { name: 'blancos', start: 190, end: 197, type: 'num' },
    { name: 'nulos', start: 198, end: 205, type: 'num' },
    { name: 'candidaturas', start: 206, end: 213, type: 'num' },
    { name: 'escanos', start: 214, end: 216, type: 'num' },
    { name: 'si', start: 217, end: 224, type: 'num' },
    { name: 'no', start: 225, end: 232, type: 'num' },
    { name: 'oficial', start: 233, end: 233, type: 'alf' },
  ],
}

/** 06 — Datos de candidaturas de municipios. */
export const SPEC_06: RecordSpec = {
  file: '06',
  description: 'Fichero de DATOS DE CANDIDATURAS DE MUNICIPIOS',
  length: 33,
  fields: [
    ...H,
    { name: 'vuelta', start: 9, end: 9, type: 'num' },
    { name: 'provincia', start: 10, end: 11, type: 'num' },
    { name: 'municipio', start: 12, end: 14, type: 'num' },
    { name: 'distrito', start: 15, end: 16, type: 'num' },
    { name: 'candidatura', start: 17, end: 22, type: 'num' },
    { name: 'votos', start: 23, end: 30, type: 'num' },
    { name: 'electos', start: 31, end: 33, type: 'num' },
  ],
}

/** 09 — Datos comunes de mesas y del CERA. */
export const SPEC_09: RecordSpec = {
  file: '09',
  description: 'Fichero de DATOS COMUNES DE MESAS y del C.E.R.A.',
  length: 101,
  fields: [
    ...H,
    { name: 'vuelta', start: 9, end: 9, type: 'num' },
    { name: 'ccaa', start: 10, end: 11, type: 'num' },
    { name: 'provincia', start: 12, end: 13, type: 'num' },
    { name: 'municipio', start: 14, end: 16, type: 'num' },
    { name: 'distrito', start: 17, end: 18, type: 'num' },
    { name: 'seccion', start: 19, end: 22, type: 'alf' },
    { name: 'mesa', start: 23, end: 23, type: 'alf' },
    { name: 'censoIne', start: 24, end: 30, type: 'num' },
    { name: 'censoEscrutinio', start: 31, end: 37, type: 'num' },
    { name: 'censoCere', start: 38, end: 44, type: 'num' },
    { name: 'votantesCere', start: 45, end: 51, type: 'num' },
    { name: 'avance1', start: 52, end: 58, type: 'num' },
    { name: 'avance2', start: 59, end: 65, type: 'num' },
    { name: 'blancos', start: 66, end: 72, type: 'num' },
    { name: 'nulos', start: 73, end: 79, type: 'num' },
    { name: 'candidaturas', start: 80, end: 86, type: 'num' },
    { name: 'si', start: 87, end: 93, type: 'num' },
    { name: 'no', start: 94, end: 100, type: 'num' },
    { name: 'oficial', start: 101, end: 101, type: 'alf' },
  ],
}

/** 10 — Datos de candidaturas de mesas y del CERA. */
export const SPEC_10: RecordSpec = {
  file: '10',
  description: 'Fichero de DATOS DE CANDIDATURAS DE MESAS y del C.E.R.A.',
  length: 36,
  fields: [
    ...H,
    { name: 'vuelta', start: 9, end: 9, type: 'num' },
    { name: 'ccaa', start: 10, end: 11, type: 'num' },
    { name: 'provincia', start: 12, end: 13, type: 'num' },
    { name: 'municipio', start: 14, end: 16, type: 'num' },
    { name: 'distrito', start: 17, end: 18, type: 'num' },
    { name: 'seccion', start: 19, end: 22, type: 'alf' },
    { name: 'mesa', start: 23, end: 23, type: 'alf' },
    { name: 'candidatura', start: 24, end: 29, type: 'num' },
    { name: 'votos', start: 30, end: 36, type: 'num' },
  ],
}

/** 11 — Datos comunes de municipios < 250 hab. (sólo municipales). */
export const SPEC_11: RecordSpec = {
  file: '11',
  description: 'Fichero de DATOS COMUNES DE MUNICIPIOS menores de 250 habitantes',
  length: 160,
  fields: [
    { name: 'tipoMunicipio', start: 1, end: 2, type: 'num' },
    { name: 'anio', start: 3, end: 6, type: 'num' },
    { name: 'mes', start: 7, end: 8, type: 'num' },
    { name: 'vuelta', start: 9, end: 9, type: 'num' },
    { name: 'ccaa', start: 10, end: 11, type: 'num' },
    { name: 'provincia', start: 12, end: 13, type: 'num' },
    { name: 'municipio', start: 14, end: 16, type: 'num' },
    { name: 'nombre', start: 17, end: 116, type: 'alf' },
    { name: 'partidoJudicial', start: 117, end: 119, type: 'num' },
    { name: 'diputacion', start: 120, end: 122, type: 'num' },
    { name: 'comarca', start: 123, end: 125, type: 'num' },
    { name: 'poblacion', start: 126, end: 128, type: 'num' },
    { name: 'mesas', start: 129, end: 130, type: 'num' },
    { name: 'censoIne', start: 131, end: 133, type: 'num' },
    { name: 'censoEscrutinio', start: 134, end: 136, type: 'num' },
    { name: 'censoCere', start: 137, end: 139, type: 'num' },
    { name: 'votantesCere', start: 140, end: 142, type: 'num' },
    { name: 'avance1', start: 143, end: 145, type: 'num' },
    { name: 'avance2', start: 146, end: 148, type: 'num' },
    { name: 'blancos', start: 149, end: 151, type: 'num' },
    { name: 'nulos', start: 152, end: 154, type: 'num' },
    { name: 'candidaturas', start: 155, end: 157, type: 'num' },
    { name: 'escanos', start: 158, end: 159, type: 'num' },
    { name: 'oficial', start: 160, end: 160, type: 'alf' },
  ],
}

export const ALL_SPECS = [SPEC_03, SPEC_05, SPEC_06, SPEC_09, SPEC_10, SPEC_11]

/** Municipio 999 = CERA (09/10). */
export const CERA_MUNICIPALITY = '999'
