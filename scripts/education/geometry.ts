// Índice CUSEC de la geometría INE y comparación con la fuente. Funciones puras.
// La descarga (WFS del INE con propertyName=CUSEC, sin geometría) vive en el loader.

export const WFS_BASE = 'https://www.ine.es/geoserver/WMS_INE_SECCIONES_G01/wfs'
export const WFS_ESPACIO = 'WMS_INE_SECCIONES_G01'

/** URL de una página del índice de una provincia (sólo atributos, geometry=null). */
export function urlIndiceProvincia(anio: number, provincia: string, startIndex: number, count: number): string {
  const cql = encodeURIComponent(`CPRO='${provincia}'`)
  return (
    `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(`${WFS_ESPACIO}:Secciones_${anio}`)}` +
    `&outputFormat=application%2Fjson&propertyName=CUSEC,CUMUN,CPRO` +
    `&CQL_FILTER=${cql}&sortBy=CUSEC&count=${count}&startIndex=${startIndex}`
  )
}

export interface IndiceProvincia {
  /** INE municipal → CUSEC de sección (sin agregados de distrito), ordenados. */
  index: Record<string, string[]>
  features: number
  sections: number
  /** Polígonos agregados de distrito (CSEC='000'), excluidos del índice. */
  district_aggregates: number
  /** Features con CUSEC inválido o de otra provincia. */
  invalid: string[]
}

export function indiceDesdeFeatures(
  features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
  provincia: string,
): IndiceProvincia {
  const index: Record<string, string[]> = {}
  const invalid: string[] = []
  let agregados = 0
  const vistos = new Set<string>()
  for (const f of features) {
    const cusec = String(f.properties?.CUSEC ?? '').trim()
    if (!/^\d{10}$/.test(cusec) || !cusec.startsWith(provincia)) {
      invalid.push(cusec || '(vacío)')
      continue
    }
    if (cusec.slice(7) === '000') {
      agregados++
      continue
    }
    if (vistos.has(cusec)) continue
    vistos.add(cusec)
    ;(index[cusec.slice(0, 5)] ??= []).push(cusec)
  }
  for (const k of Object.keys(index)) index[k].sort()
  return { index, features: features.length, sections: vistos.size, district_aggregates: agregados, invalid }
}

export interface CoberturaMunicipio {
  /** Secciones publicadas presentes en la geometría del año. */
  matched: number
  /** Secciones publicadas ausentes de la geometría. */
  unmatched: number
  /** Secciones de la geometría sin fila en la fuente. */
  geometry_only: number
  /** Secciones excluidas por no tener valor en el periodo. */
  excluded: number
  /** De las excluidas, cuántas SÍ tienen geometría (debería ser 0). */
  excluded_with_geometry: number
  unmatched_codes: string[]
  geometry_only_codes: string[]
  excluded_with_geometry_codes: string[]
}

export function coberturaGeometrica(
  publicadas: readonly string[],
  geometria: readonly string[] | undefined,
  excluidas: readonly string[],
): CoberturaMunicipio {
  const g = new Set(geometria ?? [])
  const p = new Set(publicadas)
  const unmatched = publicadas.filter((c) => !g.has(c)).sort()
  const geometryOnly = [...g].filter((c) => !p.has(c)).sort()
  const exGeo = excluidas.filter((c) => g.has(c)).sort()
  return {
    matched: publicadas.length - unmatched.length,
    unmatched: unmatched.length,
    geometry_only: geometryOnly.length,
    excluded: excluidas.length,
    excluded_with_geometry: exGeo.length,
    unmatched_codes: unmatched,
    geometry_only_codes: geometryOnly,
    excluded_with_geometry_codes: exGeo,
  }
}
