// Catálogo publicado (contrato EducationCatalog) e indicators.json. Funciones puras.

import {
  EDUCATION_DOMAIN,
  EDUCATION_INDICATORS,
  EDUCATION_SCHEMA_VERSION,
  type EducationCatalog,
  type EducationIndicator,
  type EducationIndicatorAvailability,
} from '../../src/lib/socideas-secciones-education'

export interface ResumenMunicipio {
  code: string
  province: string
  has_data: boolean
  availability: Record<string, EducationIndicatorAvailability>
  sections: number
  observations: number
  nd: number
  suppressed: number
}

export interface ProvinciaCatalogo {
  code: string
  formacion: number
  actividad: number
  ok: boolean
}

export interface EntradaCatalogo {
  period: number
  periods: number[]
  parserVersion: string
  mappingVersion: string
  source: EducationCatalog['source']
  provincias: ProvinciaCatalogo[]
  resumenes: ResumenMunicipio[]
  exclusiones: ReadonlyArray<{ requested: string; reason: string; rule?: string }>
  geometry: EducationCatalog['geometry']
  syncedAt: string
  indicadores?: readonly EducationIndicator[]
}

/** 'Máster, Doctorado' → 'master_doctorado'. Determinista. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function construirCatalogo(e: EntradaCatalogo): EducationCatalog {
  const indicadores = e.indicadores ?? EDUCATION_INDICATORS
  const provincias = [...e.provincias].sort((a, b) => a.code.localeCompare(b.code))
  const resumenes = [...e.resumenes].sort((a, b) => a.code.localeCompare(b.code))
  return {
    schema_version: EDUCATION_SCHEMA_VERSION,
    domain: EDUCATION_DOMAIN,
    parser_version: e.parserVersion,
    mapping_version: e.mappingVersion,
    period: e.period,
    periods: [...new Set(e.periods)].sort((a, b) => a - b),
    source: { ...e.source },
    indicators: indicadores.map((ind) => {
      const availability = { observed_sections: 0, nd_sections: 0, no_coverage_sections: 0, municipalities_with_data: 0 }
      for (const r of resumenes) {
        const a = r.availability[ind.id]
        if (!a) continue
        availability.observed_sections += a.observed_sections
        availability.nd_sections += a.nd_sections
        availability.no_coverage_sections += a.no_coverage_sections
        if (a.observed_sections > 0) availability.municipalities_with_data++
      }
      const tables: Record<string, number> = {}
      for (const p of provincias) tables[p.code] = ind.group === 'formacion' ? p.formacion : p.actividad
      return {
        id: ind.id,
        label: ind.etiqueta,
        group: ind.group,
        unit: ind.unidad,
        population_base: ind.populationBase,
        definition: ind.definicion,
        denominator: ind.denominador,
        calculation_method: ind.calculationMethod ?? null,
        tables,
        availability,
      }
    }),
    exclusions: e.exclusiones.map((x) => ({ id: slug(x.requested), reason: x.reason })),
    totals: {
      provinces: provincias.length,
      provinces_ok: provincias.filter((p) => p.ok).length,
      provinces_failed: provincias.filter((p) => !p.ok).length,
      municipalities: resumenes.length,
      sections: resumenes.reduce((a, r) => a + r.sections, 0),
      observations: resumenes.reduce((a, r) => a + r.observations, 0),
      nd: resumenes.reduce((a, r) => a + r.nd, 0),
      suppressed: resumenes.reduce((a, r) => a + r.suppressed, 0),
    },
    municipalities: resumenes.filter((r) => r.has_data).map((r) => r.code),
    geometry: { ...e.geometry },
    synced_at: e.syncedAt,
  }
}

export function construirIndicatorsJson(mappingVersion: string, indicadores: readonly EducationIndicator[] = EDUCATION_INDICATORS) {
  return { schema_version: EDUCATION_SCHEMA_VERSION, mapping_version: mappingVersion, indicators: indicadores }
}
