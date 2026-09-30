// Construcción del objeto municipal (contrato EducationMunicipalObject),
// validación, disponibilidad por indicador y huella determinista. Funciones puras.

import { createHash } from 'node:crypto'
import {
  EDUCATION_DOMAIN,
  EDUCATION_INDICATORS,
  EDUCATION_SCHEMA_VERSION,
  type EducationIndicatorAvailability,
  type EducationMunicipalObject,
  type EducationObservation,
  type EducationSection,
} from '../../src/lib/socideas-secciones-education'
import { claveTerritorialCoherente } from './cells'
import { REASON } from './indicators'

// ─── Huella determinista ─────────────────────────────────────────────────────

/** JSON con claves ordenadas en todos los niveles. Rechaza números no finitos. */
export function canonicalJson(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`número no finito en el objeto: ${v}`)
    return JSON.stringify(v)
  }
  if (typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')

/** SHA-256 del JSON canónico del objeto sin la clave indicada. */
export function huellaSin<T extends object>(obj: T, clave: keyof T): string {
  const copia: Record<string, unknown> = { ...(obj as Record<string, unknown>) }
  delete copia[clave as string]
  return sha256(canonicalJson(copia))
}

// ─── Disponibilidad ──────────────────────────────────────────────────────────

const esObservado = (o: EducationObservation) =>
  (o.status === 'observado' || o.status === 'derivado_verificable') && o.value !== null

export function disponibilidad(
  secciones: readonly EducationSection[],
  indicadores: readonly string[],
): Record<string, EducationIndicatorAvailability> {
  const out: Record<string, EducationIndicatorAvailability> = {}
  for (const id of indicadores) out[id] = { observed_sections: 0, nd_sections: 0, no_coverage_sections: 0 }
  for (const s of secciones) {
    for (const id of indicadores) {
      const o = s.values[id]
      if (!o) continue
      if (esObservado(o)) out[id].observed_sections++
      else if (o.status === 'no_difundido') out[id].nd_sections++
      else if (o.status === 'sin_cobertura') out[id].no_coverage_sections++
    }
  }
  return out
}

// ─── Comprobaciones de coherencia interna (informativas) ─────────────────────

const FORMACION_CATS = [
  'edu_personas_primaria_inferior',
  'edu_personas_primera_etapa_secundaria',
  'edu_personas_segunda_etapa_postsecundaria',
  'edu_personas_educacion_superior',
]
const ACTIVIDAD_CATS = [
  'act_personas_ocupados',
  'act_personas_parados',
  'act_personas_perceptores_pension',
  'act_personas_otra_inactividad',
  'act_personas_estudiantes',
]

/** Suma de categorías = Total, y base 16+ ≤ población total. Sólo con todo observado. */
export function incidenciasCoherencia(s: EducationSection): string[] {
  const out: string[] = []
  const v = (id: string) => {
    const o = s.values[id]
    return o && o.status === 'observado' ? (o.value as number) : null
  }
  const suma = (ids: string[]) => {
    let t = 0
    for (const id of ids) {
      const x = v(id)
      if (x === null) return null
      t += x
    }
    return t
  }
  const tE = v('edu_personas_total')
  const sE = suma(FORMACION_CATS)
  if (tE !== null && sE !== null && sE !== tE) out.push(`${s.sectionCode}: suma de niveles de formación ${sE} ≠ total ${tE}`)
  const tA = v('act_personas_total_16')
  const sA = suma(ACTIVIDAD_CATS)
  if (tA !== null && sA !== null && sA !== tA) out.push(`${s.sectionCode}: suma de situaciones de actividad ${sA} ≠ total 16+ ${tA}`)
  if (tE !== null && tA !== null && tA > tE) out.push(`${s.sectionCode}: población 16+ ${tA} > población total ${tE}`)
  return out
}

// ─── Objeto municipal ────────────────────────────────────────────────────────

export interface EntradaMunicipio {
  period: number
  municipality_code: string
  municipality_name: string
  province_code: string
  parser_version: string
  mapping_version: string
  source: EducationMunicipalObject['source']
  /** Secciones vigentes, ya construidas. Se ordenan por CUSEC. */
  secciones: EducationSection[]
  /** Ids de indicadores activos, en el orden del contrato. */
  indicadores: readonly string[]
  /** Secciones sin ningún valor en ninguna tabla: no vigentes en el periodo. */
  excluidas: readonly string[]
  /** Incidencias del cruce formación × actividad (secciones en una sola tabla, nombres distintos…). */
  incidenciasCruce: readonly string[]
}

const PCT_IDS = new Set(EDUCATION_INDICATORS.filter((i) => i.unidad === '%').map((i) => i.id))
const RAZONES_ND = new Set<string>(Object.values(REASON))

export function construirMunicipio(e: EntradaMunicipio): EducationMunicipalObject {
  const secciones = [...e.secciones].sort((a, b) => (a.sectionCode < b.sectionCode ? -1 : a.sectionCode > b.sectionCode ? 1 : 0))
  const issues: string[] = []

  // leading_zeros_preserved: CUSEC 10 dígitos ⊃ INE 5 dígitos ⊃ provincia 2 dígitos.
  let clavesOk =
    /^\d{5}$/.test(e.municipality_code) && /^\d{2}$/.test(e.province_code) && e.municipality_code.startsWith(e.province_code)
  for (const s of secciones) {
    if (
      !claveTerritorialCoherente(s.sectionCode, s.municipalityCode, s.provinceCode) ||
      s.municipalityCode !== e.municipality_code ||
      s.provinceCode !== e.province_code
    ) {
      clavesOk = false
      issues.push(`${s.sectionCode}: clave territorial incoherente con ${e.municipality_code}/${e.province_code}`)
    }
  }

  // municipalities_matched: mismas secciones y mismo municipio en ambas tablas.
  const municipiosOk = e.incidenciasCruce.length === 0 && secciones.length > 0
  issues.push(...e.incidenciasCruce)
  if (secciones.length === 0) issues.push('municipio sin secciones vigentes en el periodo')

  // percentages_in_range y denominators_resolved: se comprueban celda a celda.
  let rangoOk = true
  let denominadoresOk = true
  for (const s of secciones) {
    for (const [id, o] of Object.entries(s.values)) {
      if (!PCT_IDS.has(id)) continue
      if (o.status === 'derivado_verificable') {
        const ok =
          typeof o.numerator === 'number' &&
          typeof o.denominator === 'number' &&
          o.denominator > 0 &&
          o.value === (o.numerator / o.denominator) * 100
        if (!ok) {
          denominadoresOk = false
          issues.push(`${s.sectionCode} ${id}: porcentaje sin numerador/denominador verificable`)
        }
        if (o.value === null || o.value < 0 || o.value > 100) {
          rangoOk = false
          issues.push(`${s.sectionCode} ${id}: porcentaje fuera de [0,100] (${o.value})`)
        }
      } else if (o.status === 'no_difundido') {
        if (!o.nd_flag || o.value !== null || !o.reason || !RAZONES_ND.has(o.reason)) {
          denominadoresOk = false
          issues.push(`${s.sectionCode} ${id}: ND sin motivo reconocido`)
        }
      } else {
        denominadoresOk = false
        issues.push(`${s.sectionCode} ${id}: denominador no resuelto (${o.status}, ${o.reason})`)
      }
    }
    issues.push(...incidenciasCoherencia(s))
  }

  if (e.excluidas.length) {
    issues.push(`secciones sin valor en ${e.period} (no vigentes en el seccionado del periodo), excluidas: ${[...e.excluidas].sort().join(',')}`)
  }

  const indicator_availability = disponibilidad(secciones, e.indicadores)
  let observations = 0
  let nd = 0
  let suppressed = 0
  let conDato = 0
  let conSupresion = 0
  for (const s of secciones) {
    let dato = false
    let sup = false
    for (const o of Object.values(s.values)) {
      observations++
      if (o.nd_flag) nd++
      if (o.suppression_flag) {
        suppressed++
        sup = true
      }
      if (esObservado(o)) dato = true
    }
    if (dato) conDato++
    if (sup) conSupresion++
  }

  const quality_flags: string[] = []
  if (conDato === 0) quality_flags.push('all_nd')
  else if (nd > 0) quality_flags.push('partial_nd')
  if (e.excluidas.length) quality_flags.push('sections_not_in_period_excluded')

  const sinHuella: Omit<EducationMunicipalObject, 'content_sha256'> = {
    schema_version: EDUCATION_SCHEMA_VERSION,
    domain: EDUCATION_DOMAIN,
    period: e.period,
    municipality_code: e.municipality_code,
    municipality_name: e.municipality_name,
    province_code: e.province_code,
    parser_version: e.parser_version,
    mapping_version: e.mapping_version,
    source: { ...e.source },
    sections: secciones,
    coverage: {
      result_sections: secciones.length,
      sections_with_data: conDato,
      sections_suppressed: conSupresion,
      indicators: e.indicadores.length,
      observations,
      nd,
      suppressed,
    },
    indicator_availability,
    validation: {
      leading_zeros_preserved: clavesOk,
      municipalities_matched: municipiosOk,
      percentages_in_range: rangoOk,
      denominators_resolved: denominadoresOk,
      issues,
    },
    quality_flags,
  }
  const content_sha256 = sha256(canonicalJson(sinHuella))
  return { ...sinHuella, content_sha256 }
}

/** true si las cuatro comprobaciones del objeto son verdaderas. */
export function validacionSuperada(o: EducationMunicipalObject): boolean {
  const v = o.validation
  return v.leading_zeros_preserved && v.municipalities_matched && v.percentages_in_range && v.denominators_resolved
}

/** true si el municipio tiene al menos un indicador observado. */
export function tieneDatos(o: EducationMunicipalObject): boolean {
  return Object.values(o.indicator_availability).some((a) => a.observed_sections > 0)
}
