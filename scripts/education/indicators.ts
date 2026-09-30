// Construcción de indicadores por sección. Funciones puras.
//
// Recuentos: valor literal de la categoría oficial.
// Porcentajes: 100 * numerador / denominador, con numerador y denominador de la
// MISMA tabla, sección, periodo y Sexo=Total. Si cualquiera de los dos es ND,
// el porcentaje es ND. Nada se estima, recorta, imputa ni rellena.

import {
  EDUCATION_CATEGORIES,
  EDUCATION_INDICATORS,
  type EducationIndicator,
  type EducationObservation,
} from '../../src/lib/socideas-secciones-education'
import type { Celda } from './cells'
import type { Grupo } from './parse'

/** sourceCategoryKey → categoría literal del INE, por grupo. */
export const CATEGORIA_POR_CLAVE: Record<Grupo, Record<string, string>> = {
  formacion: {
    total: 'Total',
    primaria_inferior: 'Educación primaria e inferior',
    primera_etapa_secundaria: 'Primera etapa de Educación Secundaria y similar',
    segunda_etapa_postsecundaria: 'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
    educacion_superior: 'Educación superior',
  },
  actividad: {
    total_16: 'Total',
    ocupado: 'Ocupado/a',
    parado: 'Parado/a',
    perceptor_pension: 'Perceptor/a pensión de incapacidad, jubilación, prejubilación',
    otra_inactividad: 'Otra situación de inactividad',
    estudiante: 'Estudiante',
  },
}

export interface DefAbsoluto {
  id: string
  grupo: Grupo
  categoria: string
}

export interface DefPorcentaje {
  id: string
  numeradorId: string
  denominadorId: string
}

const RE_FORMULA = /^100 \* ([a-z0-9_]+) \/ ([a-z0-9_]+)$/

/** Deriva las definiciones del contrato (EDUCATION_INDICATORS). Lanza si no casan. */
export function definicionesDesdeContrato(indicadores: readonly EducationIndicator[] = EDUCATION_INDICATORS): {
  absolutos: DefAbsoluto[]
  porcentajes: DefPorcentaje[]
} {
  const absolutos: DefAbsoluto[] = []
  const porcentajes: DefPorcentaje[] = []
  const ids = new Set(indicadores.map((i) => i.id))
  for (const ind of indicadores) {
    if (ind.unidad === 'personas') {
      const categoria = CATEGORIA_POR_CLAVE[ind.group][ind.sourceCategoryKey]
      if (!categoria) throw new Error(`indicador ${ind.id}: clave de categoría sin mapear "${ind.sourceCategoryKey}"`)
      if (!(EDUCATION_CATEGORIES[ind.group] as readonly string[]).includes(categoria)) {
        throw new Error(`indicador ${ind.id}: categoría "${categoria}" no está en EDUCATION_CATEGORIES`)
      }
      absolutos.push({ id: ind.id, grupo: ind.group, categoria })
    } else if (ind.unidad === '%') {
      const m = RE_FORMULA.exec(ind.calculationMethod ?? '')
      if (!m) throw new Error(`indicador ${ind.id}: fórmula no reconocida "${ind.calculationMethod}"`)
      if (!ids.has(m[1]) || !ids.has(m[2])) throw new Error(`indicador ${ind.id}: componentes ausentes del catálogo`)
      porcentajes.push({ id: ind.id, numeradorId: m[1], denominadorId: m[2] })
    } else {
      throw new Error(`indicador ${ind.id}: unidad no soportada "${ind.unidad}"`)
    }
  }
  return { absolutos, porcentajes }
}

export const REASON = {
  secreto: 'statistical_confidentiality',
  vacia: 'celda_vacia_en_origen',
  denominadorCero: 'denominador_cero',
  componente: 'componente_no_disponible',
  categoriaAusente: 'categoria_ausente_en_origen',
} as const

export function observacionSinCobertura(reason: string): EducationObservation {
  return {
    value: null,
    numerator: null,
    denominator: null,
    status: 'sin_cobertura',
    nd_flag: false,
    suppression_flag: false,
    reason,
  }
}

/** Observación de un recuento absoluto a partir de su celda. */
export function observacionAbsoluta(celda: Celda | undefined, razonAusencia: string = REASON.categoriaAusente): EducationObservation {
  if (!celda) return observacionSinCobertura(razonAusencia)
  if (celda.kind === 'nd') {
    return { value: null, numerator: null, denominator: null, status: 'no_difundido', nd_flag: true, suppression_flag: true, reason: REASON.secreto }
  }
  if (celda.kind === 'vacio') {
    return { value: null, numerator: null, denominator: null, status: 'no_difundido', nd_flag: true, suppression_flag: false, reason: REASON.vacia }
  }
  return { value: celda.value, numerator: celda.value, denominator: null, status: 'observado', nd_flag: false, suppression_flag: false, reason: null }
}

const esValor = (o: EducationObservation) =>
  (o.status === 'observado' || o.status === 'derivado_verificable') && o.value !== null

/** Porcentaje con numerador y denominador explícitos. ND se propaga. */
export function observacionPorcentaje(num: EducationObservation | undefined, den: EducationObservation | undefined): EducationObservation {
  if (!num || !den || num.status === 'sin_cobertura' || den.status === 'sin_cobertura' ||
      num.status === 'error_ingesta' || den.status === 'error_ingesta') {
    return observacionSinCobertura(REASON.componente)
  }
  if (!esValor(num) || !esValor(den)) {
    const causa = !esValor(den) ? den : num
    return {
      value: null,
      numerator: null,
      denominator: null,
      status: 'no_difundido',
      nd_flag: true,
      suppression_flag: num.suppression_flag || den.suppression_flag,
      reason: causa.reason ?? REASON.secreto,
    }
  }
  const n = num.value as number
  const d = den.value as number
  if (d === 0) {
    return { value: null, numerator: n, denominator: 0, status: 'no_difundido', nd_flag: true, suppression_flag: false, reason: REASON.denominadorCero }
  }
  return {
    value: (n / d) * 100,
    numerator: n,
    denominator: d,
    status: 'derivado_verificable',
    nd_flag: false,
    suppression_flag: false,
    reason: null,
  }
}

const cacheDefs = new WeakMap<readonly EducationIndicator[], ReturnType<typeof definicionesDesdeContrato>>()

/**
 * Valores de una sección, en el orden de EDUCATION_INDICATORS.
 * `formacion`/`actividad` = celdas de la sección en cada tabla (undefined si la
 * sección no aparece en esa tabla para el periodo).
 */
export function construirValoresSeccion(
  formacion: Map<string, Celda> | undefined,
  actividad: Map<string, Celda> | undefined,
  activos: ReadonlySet<string> | null = null,
  indicadores: readonly EducationIndicator[] = EDUCATION_INDICATORS,
): Record<string, EducationObservation> {
  let defs = cacheDefs.get(indicadores)
  if (!defs) cacheDefs.set(indicadores, (defs = definicionesDesdeContrato(indicadores)))
  const { absolutos, porcentajes } = defs
  const calc = new Map<string, EducationObservation>()
  for (const a of absolutos) {
    const tabla = a.grupo === 'formacion' ? formacion : actividad
    const razon = tabla ? REASON.categoriaAusente : `seccion_ausente_en_tabla_${a.grupo}`
    calc.set(a.id, observacionAbsoluta(tabla?.get(a.categoria), razon))
  }
  for (const p of porcentajes) {
    calc.set(p.id, observacionPorcentaje(calc.get(p.numeradorId), calc.get(p.denominadorId)))
  }
  const out: Record<string, EducationObservation> = {}
  for (const ind of indicadores) {
    if (activos && !activos.has(ind.id)) continue
    out[ind.id] = calc.get(ind.id)!
  }
  return out
}
