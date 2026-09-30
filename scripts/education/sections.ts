// Cruce de las tablas de formación y actividad de un periodo y agrupación por
// municipio. Función pura. La unión es SIEMPRE por CUSEC, nunca por nombre.

import type { EducationSection } from '../../src/lib/socideas-secciones-education'
import { construirValoresSeccion } from './indicators'
import { filaSinValor, type FilaSeccion } from './parse'

export interface MunicipioAgrupado {
  code: string
  name: string
  province: string
  secciones: EducationSection[]
  /** Secciones sin valor en ninguna tabla: no vigentes en el seccionado del periodo. */
  excluidas: string[]
  /** Incidencias del cruce (sección en una sola tabla, denominaciones distintas…). */
  incidencias: string[]
}

export function agruparPorMunicipio(
  formacion: ReadonlyMap<string, FilaSeccion> | undefined,
  actividad: ReadonlyMap<string, FilaSeccion> | undefined,
  filtro: ReadonlySet<string> | null,
  activos: ReadonlySet<string> | null = null,
): Map<string, MunicipioAgrupado> {
  const claves = [...new Set([...(formacion?.keys() ?? []), ...(actividad?.keys() ?? [])])].sort()
  const out = new Map<string, MunicipioAgrupado>()

  for (const cusec of claves) {
    const muni = cusec.slice(0, 5)
    if (filtro && !filtro.has(muni)) continue
    const fe = formacion?.get(cusec)
    const fa = actividad?.get(cusec)
    const base = (fe ?? fa)!
    let m = out.get(muni)
    if (!m) {
      m = { code: muni, name: base.nombreMunicipio, province: base.provincia, secciones: [], excluidas: [], incidencias: [] }
      out.set(muni, m)
    }
    if (filaSinValor(fe) && filaSinValor(fa)) {
      m.excluidas.push(cusec)
      continue
    }
    if (!fe) m.incidencias.push(`${cusec}: sección presente sólo en la tabla de actividad`)
    if (!fa) m.incidencias.push(`${cusec}: sección presente sólo en la tabla de formación`)
    if (fe && fa && filaSinValor(fe) !== filaSinValor(fa)) {
      m.incidencias.push(`${cusec}: sección sin valor en una sola de las dos tablas`)
    }
    for (const f of [fe, fa]) {
      if (f && f.nombreMunicipio !== m.name) {
        m.incidencias.push(`${cusec}: denominación del municipio distinta ("${f.nombreMunicipio}" ≠ "${m.name}")`)
      }
    }
    if (fe && fa && fe.etiqueta !== fa.etiqueta) {
      m.incidencias.push(`${cusec}: denominación de la sección distinta entre tablas`)
    }
    m.secciones.push({
      sectionCode: cusec,
      municipalityCode: muni,
      provinceCode: base.provincia,
      sourceLabel: fe?.etiqueta ?? fa!.etiqueta,
      values: construirValoresSeccion(fe?.celdas, fa?.celdas, activos),
    })
  }
  return out
}
