// Parseo de una tabla provincial del INE (formación o actividad). Función pura
// sobre el texto ya leído: no toca disco ni red.
//
// Cabecera real: Provincias | Municipios | Secciones | Sexo | <dimensión> | Periodo | Total
// Sólo se conserva Sexo=Total (Hombres+Mujeres duplicarían la población).

import { EDUCATION_CATEGORIES } from '../../src/lib/socideas-secciones-education'
import {
  normalizarCelda,
  parsearCusec,
  parsearMunicipioColumna,
  parsearProvinciaColumna,
  type Celda,
} from './cells'

export type Grupo = 'formacion' | 'actividad'

export interface FilaSeccion {
  cusec: string
  provincia: string
  municipio: string
  /** Nombre literal del municipio en la columna "Municipios". */
  nombreMunicipio: string
  /** Denominación literal de la sección. */
  etiqueta: string
  /** Categoría literal de la dimensión → celda normalizada. */
  celdas: Map<string, Celda>
}

export interface TablaParseada {
  grupo: Grupo
  /** Nombre literal de la columna de la dimensión. */
  columnaDimension: string
  /** Todos los periodos que aparecen en la columna Periodo (cualquier fila). */
  periodosEnFuente: number[]
  /** periodo → CUSEC → fila (sólo periodos pedidos). */
  porPeriodo: Map<number, Map<string, FilaSeccion>>
  /** Filas de datos leídas (todas las de sección, cualquier sexo y periodo). */
  filasSeccion: number
}

const SEXOS = new Set(['Total', 'Hombres', 'Mujeres'])
const COLUMNAS_FIJAS = ['Provincias', 'Municipios', 'Secciones', 'Sexo', 'Periodo', 'Total'] as const

/**
 * @param periodos periodos a conservar; null = todos los presentes.
 * @param origen   nombre del fichero, sólo para los mensajes de error.
 * Lanza ante cualquier forma no esperada (fail-closed).
 */
export function parsearTablaTexto(
  texto: string,
  grupo: Grupo,
  periodos: ReadonlySet<number> | null,
  origen: string,
): TablaParseada {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/)
  while (lineas.length && lineas[lineas.length - 1].trim() === '') lineas.pop()
  if (lineas.length < 2) throw new Error(`${origen}: fichero sin filas de datos`)

  const cab = lineas[0].split('\t').map((c) => c.trim())
  const idx = Object.fromEntries(COLUMNAS_FIJAS.map((c) => [c, cab.indexOf(c)])) as Record<
    (typeof COLUMNAS_FIJAS)[number],
    number
  >
  for (const c of COLUMNAS_FIJAS) {
    if (idx[c] < 0) throw new Error(`${origen}: falta la columna "${c}"`)
  }
  const reDim = grupo === 'formacion' ? /^nivel de formaci[oó]n alcanzado$/i : /^relaci[oó]n con la actividad$/i
  const iDim = cab.findIndex((c) => reDim.test(c))
  if (iDim < 0) throw new Error(`${origen}: no se encontró la columna de ${grupo}`)
  if (cab.length !== 7) throw new Error(`${origen}: cabecera con ${cab.length} columnas (se esperaban 7)`)

  const categoriasValidas = new Set<string>(EDUCATION_CATEGORIES[grupo])
  const periodosVistos = new Set<number>()
  const porPeriodo = new Map<number, Map<string, FilaSeccion>>()
  let filasSeccion = 0

  for (let n = 1; n < lineas.length; n++) {
    const linea = lineas[n]
    if (linea.trim() === '') throw new Error(`${origen}: línea ${n + 1} vacía en mitad del fichero`)
    const c = linea.split('\t')
    if (c.length !== cab.length) {
      throw new Error(`${origen}: línea ${n + 1} con ${c.length} columnas (se esperaban ${cab.length})`)
    }
    const sexo = c[idx.Sexo].trim()
    if (!SEXOS.has(sexo)) throw new Error(`${origen}: línea ${n + 1}: Sexo desconocido "${sexo}"`)
    const perTxt = c[idx.Periodo].trim()
    if (!/^\d{4}$/.test(perTxt)) throw new Error(`${origen}: línea ${n + 1}: Periodo inválido "${perTxt}"`)
    const periodo = Number(perTxt)
    periodosVistos.add(periodo)

    const secTxt = c[idx.Secciones].trim()
    if (secTxt === '') continue // fila agregada de provincia o municipio
    filasSeccion++

    const sec = parsearCusec(secTxt)
    if (!sec) throw new Error(`${origen}: línea ${n + 1}: no se pudo extraer el CUSEC de "${secTxt}"`)
    if (sec.seccion === '000') throw new Error(`${origen}: línea ${n + 1}: CUSEC de agregado de distrito ${sec.cusec}`)
    const mun = parsearMunicipioColumna(c[idx.Municipios])
    if (!mun) throw new Error(`${origen}: línea ${n + 1}: municipio ilegible "${c[idx.Municipios]}"`)
    if (mun.code !== sec.municipio) {
      throw new Error(`${origen}: línea ${n + 1}: el CUSEC ${sec.cusec} no empieza por el municipio ${mun.code}`)
    }
    const prov = parsearProvinciaColumna(c[idx.Provincias])
    if (!prov || prov.code !== sec.provincia) {
      throw new Error(`${origen}: línea ${n + 1}: provincia "${c[idx.Provincias]}" no coincide con el CUSEC ${sec.cusec}`)
    }
    const categoria = c[iDim].trim()
    if (!categoriasValidas.has(categoria)) {
      throw new Error(`${origen}: línea ${n + 1}: categoría no prevista "${categoria}"`)
    }
    const celda = normalizarCelda(c[idx.Total])
    if (!celda) throw new Error(`${origen}: línea ${n + 1}: valor no reconocido "${c[idx.Total]}"`)

    if (sexo !== 'Total') continue
    if (periodos && !periodos.has(periodo)) continue

    let mapa = porPeriodo.get(periodo)
    if (!mapa) porPeriodo.set(periodo, (mapa = new Map()))
    let fila = mapa.get(sec.cusec)
    if (!fila) {
      fila = {
        cusec: sec.cusec,
        provincia: sec.provincia,
        municipio: sec.municipio,
        nombreMunicipio: mun.name,
        etiqueta: sec.etiqueta,
        celdas: new Map(),
      }
      mapa.set(sec.cusec, fila)
    } else if (fila.nombreMunicipio !== mun.name || fila.etiqueta !== sec.etiqueta) {
      throw new Error(`${origen}: línea ${n + 1}: denominación distinta para ${sec.cusec} en el mismo periodo`)
    }
    if (fila.celdas.has(categoria)) {
      throw new Error(`${origen}: línea ${n + 1}: fila duplicada ${sec.cusec} · ${categoria} · ${periodo}`)
    }
    fila.celdas.set(categoria, celda)
  }

  return {
    grupo,
    columnaDimension: cab[iDim],
    periodosEnFuente: [...periodosVistos].sort((a, b) => a - b),
    porPeriodo,
    filasSeccion,
  }
}

/** true si todas las celdas de la fila son 'vacio' (la sección no existe en ese periodo). */
export function filaSinValor(fila: FilaSeccion | undefined): boolean {
  if (!fila || fila.celdas.size === 0) return true
  for (const c of fila.celdas.values()) if (c.kind !== 'vacio') return false
  return true
}
