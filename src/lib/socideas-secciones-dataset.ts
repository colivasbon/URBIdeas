// Contrato BAJO DEMANDA de los datos seccionales — PURO (sin I/O).
//
// El endpoint de secciones pasó de 304,5 MB a menos de 3 MB partiéndose en dos:
//
//   1. BOOTSTRAP (`GET /api/socideas/secciones/{ine}`): quién es el municipio,
//      su geometría UNA vez, los catálogos, la cobertura, la validación del
//      servidor y la configuración inicial. SIN `observations`.
//   2. DATASET (`GET /api/socideas/secciones-dataset/{ine}`): los valores de
//      UN indicador y UN periodo, en la forma columnar `{p,v,s}` que ya está
//      publicada en R2.
//
// Tamaños medidos (Madrid, 2 462 secciones, 127 indicadores, 521 944
// observaciones):
//
//   ANTES (un solo endpoint)
//     data.atlas.observations  298,0 MB  97,9 %   ~530 B por observación
//     data.atlas.sections         2,4 MB   0,8 %   geometría duplicada
//     data.geojson                2,4 MB   0,8 %   la MISMA geometría
//     dominios.politica.ganadoras 0,9 MB   0,3 %   votos ya presentes en
//                                                     `observations`
//     ───────────────────────────────────────────
//     total                     304,5 MB
//
//   AHORA
//     bootstrap                ~2,6 MB    geometría 2,4 MB + catálogos ~0,2 MB
//     dataset (1 ind × 1 per)   ~0,15 MB  2 462 celdas × ~40 B + claves
//
// Por qué el contrato antiguo no escala, y por qué no basta con «mandar menos
// años»: el 74 % de cada observación expandida es metadato idéntico por sección
// e indicador (municipalityIne, geometryYear, operation, sourceTable,
// sourceUrl, retrievedAt, checksum, unit, denominator, dimensions). Compactarlo
// es lo que ya hace R2; aquí la ruta lo deshacía entero para re-serializarlo,
// y el grafo de 521 944 objetos × 20 propiedades ocupaba 1,5–2,5 GB en una
// lambda de 1 GB — de ahí el HTTP 500 intermitente (~30 %, según cuándo colecte
// el GC). Además el navegador NUNCA lee más de un indicador y un periodo a la
// vez (`SeccionesAtlas.tsx:1023`, `SeccionesPoliticaExtension.tsx:340`): los
// ~212 combinaciones indicador×periodo por sección que se enviaban eran ~99,5 %
// datos que nadie miraba.
//
// Formato del bloque: `series[sectionKey] = [{p, v, s, n?}]`. El cliente
// rehidrata contra `indicadores[]` del bootstrap (que ya trae `unidad`,
// `denominador`, `url`, `sourceTable` y `operation`) con
// `expandirIndicadorCompacto`, que produce exactamente el mismo
// `SeccionObservacion` que habría producido `expandirObservaciones`.

import {
  SECCIONES_ATLAS_SCHEMA,
  esEstadoValido,
  expandirSerieIndicador,
  validarValorCompacto,
  type ContextoObservacion,
  type GeoJsonFeatureCollection,
  type ResultadoValidacion,
  type SeccionIndicador,
  type SeccionIndicadorCobertura,
  type SeccionIndicadorObservaciones,
  type SeccionObservacion,
  type SeccionPorPeriodo,
  type SeccionesAtlasR2V1,
  type SeccionesCalidad,
  type SeccionesSeriesCompactas,
  type SeccionesSeriesDeIndicador,
  type SeccionValorCompacto,
  type SeccionFeature,
} from './socideas-secciones'
import type { Candidacy, ElectionType, PoliticalCatalog } from './socideas-secciones-political'
import type { MetadatosDominio } from './socideas-secciones-extension'

export const SECCIONES_BOOTSTRAP_SCHEMA = 'secciones-bootstrap-v1'
export const SECCIONES_DATASET_SCHEMA = 'secciones-dataset-v1'

/** Ruta del bloque. El bootstrap la publica en `data.dataset.endpoint` para que
 *  el cliente no la tenga que construir a mano ni adivinarla. */
export const SECCIONES_DATASET_PATH = '/api/socideas/secciones-dataset'

/** Origen de los valores: atlas base de R2, Censo Anual o resultados electorales. */
export type DominioSecciones = 'base' | 'educacion' | 'politica'

export const DOMINIOS_SECCIONES: readonly DominioSecciones[] = ['base', 'educacion', 'politica']

export function esDominioSecciones(value: unknown): value is DominioSecciones {
  return typeof value === 'string' && (DOMINIOS_SECCIONES as readonly string[]).includes(value)
}

/** Bloques independientes del dominio político. Las ganadoras (0,9 MB en Madrid:
 *  2 462 filas con votos que YA están en `series`) salen del bootstrap para que
 *  solo se paguen cuando se abre la pestaña que las pinta. */
export const BLOQUES_POLITICA = ['ganadoras'] as const
export type BloquePolitica = (typeof BLOQUES_POLITICA)[number]

export function esBloquePolitica(value: unknown): value is BloquePolitica {
  return typeof value === 'string' && (BLOQUES_POLITICA as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

/** Atlas del bootstrap: la cabecera del atlas publicado, sin geometría (se
 *  sirve una vez en `data.geojson`) y sin observaciones (van en el dataset). */
export interface SeccionesAtlasBootstrap {
  schemaVersion: typeof SECCIONES_ATLAS_SCHEMA
  municipalityIne: string
  municipalityName: string
  provinceName: string
  geometryYear: number
  geometryCollection: string
  geometrySource: string
  geometryCrs: string
  geometryRetrievedAt: string
  statsRetrievedAt: string
  generatedAt: string
  indicators: SeccionIndicador[]
  cobertura: SeccionIndicadorCobertura[]
  municipalReference: Record<string, number | null>
  quality: SeccionesCalidad
  sourceChecksums: Record<string, string>
  schemaChecksum?: string
  /** Vacío POR CONSTRUCCIÓN: así el cliente ve, sin adivinar, que no hay
   *  valores aquí. `observations` ausente daría por error de red. */
  observations: Record<string, SeccionIndicadorObservaciones>
}

export interface SeccionesBootstrapMunicipio {
  codigo_ine: string
  nombre: string
  provincia: string | null
  comunidad_autonoma: string | null
}

/** Bloque educativo del bootstrap. `observaciones` es un RECUENTO, no el mapa:
 *  el mapa eran decenas de MB y ningún componente lo leía entero; `n` es el
 *  número de celdas que el dominio tiene publicadas para este municipio. */
export interface SeccionesBootstrapEducacion {
  periodos: number[]
  indicadores: number
  /** Indicadores del atlas base, para que el cliente sepa qué NO es educativo. */
  indicadores_base: number
  observaciones: number
  nd: number
  supresiones: number
  secciones_all_nd: number
  secciones_con_dato: number
  periodos_catalogo: number[]
  claves: {
    catalogo: string
    normalizado: string | null
  }
}

export interface SeccionesBootstrapPolitica {
  catalog: Array<{
    electionId: string
    electionType: string
    electionDate: string
    label: string
    territoryCode: string | null
    municipalities: number
    publishableMunicipalities: number
    sections: number
    pollingStations: number
  }>
  electionId: string
  electionType: string
  electionDate: string
  status: string
  mesas_agregadas: number
  indicadores: number
  candidaturas: Candidacy[]
  /** Las ganadoras NO van en el bootstrap (0,9 MB en Madrid, con votos que ya
   *  están en el bloque del dataset). Aquí está el endpoint que las sirve. */
  ganadoras_endpoint: string
  totales: {
    censo: number | null
    votantes: number | null
    validos: number | null
    blancos: number | null
    nulos: number | null
    candidaturas: number | null
  } | null
  conciliacion: {
    status: string
    reference: string | null
    differences: Record<string, number>
    notes: string[]
  } | null
  geometria: {
    year: number | null
    correspondenceStatus: string
    resultSections: number
    geometrySections: number
    matchedSections: number
    coveragePercentage: number
    notes: string[]
  } | null
  publicacion: { publishable: boolean; reason: string | null; warnings: string[] } | null
  notas: string[]
  claves: { objeto: string | null }
}

export interface SeccionesBootstrapDominios {
  educacion: SeccionesBootstrapEducacion
  actividad: { periodos: number[]; indicadores: number }
  politica: SeccionesBootstrapPolitica
}

export interface SeccionesBootstrap {
  schemaVersion: typeof SECCIONES_BOOTSTRAP_SCHEMA
  codigo_ine: string
  anio_delimitacion: number
  fuente: string
  n_secciones: number
  via: 'R2' | 'R2+dominios' | 'INE+dominios' | 'INE' | 'ninguno'
  municipio: SeccionesBootstrapMunicipio
  /** Geometría, UNA sola vez. Antes venía dos veces (`geojson` y
   *  `atlas.sections` eran el mismo array). */
  geojson: GeoJsonFeatureCollection
  atlas: SeccionesAtlasBootstrap | null
  dominios: SeccionesBootstrapDominios
  metadatos: MetadatosDominio[]
  avisos: string[]
  /** Configuración inicial: lo mínimo para pintar mapa y selectores sin pedir
   *  ningún valor. */
  config: {
    dominios: DominioSecciones[]
    periodos: number[]
    periodo_por_defecto: number | null
    n_indicadores: number
    /** Cómo se leyó el atlas base. Si el objeto no cabía en el Data Cache se
     *  dice, en vez de dejar que parezca una respuesta cacheada. */
    cache: { via: 'data-cache' | 'servidor' | 'ninguno'; motivo: string | null }
  }
  /** Veredicto de la validación fail-closed ejecutada EN EL SERVIDOR. El cliente
   *  ya no puede validarla por su cuenta: no recibe `observations`. */
  validacion: ResultadoValidacion
  /** Cómo pedir los valores. */
  dataset: {
    endpoint: string
    params: {
      dominio: DominioSecciones
      indicador: string
      periodo?: string
      convocatoria?: string
      bloque?: BloquePolitica
    }
    nota: string
  }
}

/** Proyecta el objeto compacto al atlas del bootstrap. NO toca `series`: la
 *  cabecera que se necesita (catálogo, cobertura, calidad, checksums) es la
 *  misma, y `observations` queda vacío porque los valores son otro bloque. */
export function atlasBootstrapDe(compacto: SeccionesAtlasR2V1): SeccionesAtlasBootstrap {
  return {
    schemaVersion: SECCIONES_ATLAS_SCHEMA,
    municipalityIne: compacto.municipalityIne,
    municipalityName: compacto.municipalityName,
    provinceName: compacto.provinceName,
    geometryYear: compacto.geometryYear,
    geometryCollection: compacto.geometryCollection,
    geometrySource: compacto.geometrySource,
    geometryCrs: compacto.geometryCrs,
    geometryRetrievedAt: compacto.geometryRetrievedAt,
    statsRetrievedAt: compacto.statsRetrievedAt,
    generatedAt: compacto.generatedAt,
    indicators: compacto.indicators,
    cobertura: compacto.cobertura,
    municipalReference: compacto.municipalReference,
    quality: compacto.quality,
    sourceChecksums: compacto.sourceChecksums,
    schemaChecksum: compacto.schemaChecksum,
    observations: {},
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque de dataset
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccionesDatasetBloque {
  schemaVersion: typeof SECCIONES_DATASET_SCHEMA
  codigo_ine: string
  dominio: DominioSecciones
  /** Id del indicador del bloque. `null` solo en bloques sin indicador
   *  (ganadoras políticas). */
  indicador: string | null
  /** Año estadístico del dato. `p` de cada celda lo repite porque el cliente
   *  puede recibir celdas de más de un periodo si se pide. */
  periodo: number | null
  /** Clave con la que el cliente debe indexar en `observations`: el año
   *  (`"2023"`) o, en política, la convocatoria (`"2023-05-28"`). El dataset
   *  guarda el año en `p` —que es lo que declara `referencePeriod`— y aquí la
   *  fecha completa, que es como se indexan los resultados electorales. */
  periodo_clave: string | null
  convocatoria: string | null
  /** Ficha del indicador: unidad, denominador, `sourceTable`, `operation` y
   *  `url`. Con esto el cliente rehidrata sin volver a pedir nada. */
  indicador_meta: SeccionIndicador | null
  n_secciones: number
  n_valores: number
  /** Tope de bytes que debería ocupar este bloque (`nValores × 96 + nSecciones ×
   *  16`). Se publica para que se pueda contrastar el peso real de lo recibido
   *  con el presupuesto y detectar un bloque que se esté yendo de las manos. */
  bytes_estimados: number
  /** Columnar y de UN indicador: series[sectionKey] = `{p,v,s,n?}`. El id del
   *  indicador no se repite en cada sección (2462 × ~25 B = ~60 KB de los ~150 KB
   *  del bloque) porque ya está en `indicador` y en `indicador_meta`. */
  series: SeccionesSeriesDeIndicador
}

/** Extrae un indicador (y un periodo) de las series compactas SIN rehidratar y
 *  sin copiar celdas: cuando no hay filtro de periodo se reutilizan las
 *  listas tal cual. */
export function extraerSerieIndicador(
  series: SeccionesSeriesCompactas | undefined,
  indicadorId: string,
  opciones: { periodo?: number | null } = {},
): { series: SeccionesSeriesDeIndicador; nValores: number } {
  const salida: SeccionesSeriesDeIndicador = {}
  let nValores = 0
  for (const [seccion, porIndicador] of Object.entries(series ?? {})) {
    const valores = porIndicador?.[indicadorId]
    if (!Array.isArray(valores) || valores.length === 0) continue
    const filtrados = opciones.periodo == null ? valores : valores.filter((v) => v.p === opciones.periodo)
    if (filtrados.length === 0) continue
    salida[seccion] = filtrados
    nValores += filtrados.length
  }
  return { series: salida, nValores }
}

/** Proyecta observaciones YA expandidas (Educación, Política) a la misma forma
 *  columnar que R2. Es lainverse de `expandirIndicadorCompacto`.
 *
 *  Un bloque es de UN indicador y UN periodo, y por eso el filtro es por año
 *  (`periodo`) más, opcionalmente, por clave exacta (`periodoClave`): política
 *  indexa por convocatoria y dos convocatorias pueden compartir año. */
export function compactarObservacionesIndicador(
  observaciones: Record<string, SeccionIndicadorObservaciones> | undefined,
  opciones: { indicadorId: string; periodo: number; periodoClave?: string },
): { series: SeccionesSeriesDeIndicador; periodoClave: string; nValores: number } {
  const clave = opciones.periodoClave ?? String(opciones.periodo)
  const salida: SeccionesSeriesDeIndicador = {}
  let nValores = 0
  for (const [seccion, porIndicador] of Object.entries(observaciones ?? {})) {
    const porPeriodo = porIndicador?.[opciones.indicadorId]
    if (!porPeriodo || typeof porPeriodo !== 'object') continue
    for (const [periodo, obs] of Object.entries(porPeriodo)) {
      const o = obs as SeccionObservacion
      // La clave manda: es lo que el cliente usa para indexar. Sin
      // `periodoClave` explícito, el año decide.
      if (opciones.periodoClave ? periodo !== clave : o.referencePeriod !== opciones.periodo) continue
      const valor: SeccionValorCompacto = { p: o.referencePeriod, v: o.value, s: o.status }
      if (o.methodologyNote) valor.n = o.methodologyNote
      ;(salida[seccion] ??= []).push(valor)
      nValores++
    }
  }
  return { series: salida, periodoClave: clave, nValores }
}

/** Ensambla el bloque servido. `n_sections` se calcula sobre las secciones CON
 *  valor: una sección sin celda no aporta nada al cliente. */
export function construirBloqueDataset(args: {
  codigoIne: string
  dominio: DominioSecciones
  indicador: string | null
  periodo: number | null
  periodoClave: string | null
  convocatoria?: string | null
  indicadorMeta?: SeccionIndicador | null
  series: SeccionesSeriesDeIndicador
  nValores: number
}): SeccionesDatasetBloque {
  return {
    schemaVersion: SECCIONES_DATASET_SCHEMA,
    codigo_ine: args.codigoIne,
    dominio: args.dominio,
    indicador: args.indicador,
    periodo: args.periodo,
    periodo_clave: args.periodoClave,
    convocatoria: args.convocatoria ?? null,
    indicador_meta: args.indicadorMeta ?? null,
    n_secciones: Object.keys(args.series).length,
    n_valores: args.nValores,
    bytes_estimados: estimarBytesBloque(Object.keys(args.series).length, args.nValores),
    series: args.series,
  }
}

/**
 * Rehidratación del cliente. Devuelve EXACTAMENTE lo que
 * `expandirObservaciones` habría producido para ese indicador, para que el
 * cliente pueda pegar el resultado en `atlas.observations` y seguir usando el
 * motor de coropleta, la tabla y el PNG sin cambios.
 */
export function expandirIndicadorCompacto(
  serie: SeccionesSeriesDeIndicador,
  args: {
    indicador: SeccionIndicador
    municipalityIne: string
    geometryYear: number
    periodoClave: string
    retrievedAt?: string
    checksum?: string
    publishedAt?: string | null
  },
): Record<string, SeccionPorPeriodo> {
  const ctx: ContextoObservacion = {
    municipalityIne: args.municipalityIne,
    geometryYear: args.geometryYear,
    operation: args.indicador.operation,
    sourceTable: args.indicador.sourceTable,
    unit: args.indicador.unidad,
    denominator: args.indicador.denominador,
    sourceUrl: args.indicador.url,
    publishedAt: args.publishedAt ?? null,
    retrievedAt: args.retrievedAt ?? '',
    checksum: args.checksum ?? '',
  }
  return expandirSerieIndicador(serie, ctx, {
    indicatorId: args.indicador.id,
    clavePeriodo: args.periodoClave,
  })
}

/** Valida el BLOQUE servido (un solo indicador): mismas reglas de celda que el
 *  objeto publicado, más que la clave de sección sea del municipio. */
export function validarSerieBloque(
  serie: SeccionesSeriesDeIndicador | undefined,
  opciones: { municipalityIne: string; indicatorId: string },
): ResultadoValidacion {
  const errores: string[] = []
  for (const [seccion, valores] of Object.entries(serie ?? {})) {
    if (!/^\d{10}$/.test(seccion)) {
      errores.push(`CUSEC inválido en el bloque: "${seccion}"`)
      continue
    }
    if (seccion.slice(0, 5) !== opciones.municipalityIne) {
      errores.push(`Observación ${seccion}/${opciones.indicatorId} de otro municipio`)
    }
    if (!Array.isArray(valores)) {
      errores.push(`Valores no lista para ${seccion}/${opciones.indicatorId}`)
      continue
    }
    for (const v of valores) {
      validarValorCompacto(v, `${seccion}/${opciones.indicatorId}`, errores)
    }
  }
  return { ok: errores.length === 0, errores, avisos: [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tamaño del bloque (para decidir la caché antes de construir)
// ─────────────────────────────────────────────────────────────────────────────

/** Cota alta por celda. Lo normal es `{"p":2023,"v":12345.67,"s":"observado"}`
 *  = 39 B; con nota metodológica larga se dispara. 96 B cubre el caso peor
 *  observed en el bloque sin castigar la estimación ordinaria. */
export const BYTES_POR_CELDA_ESTIMADOS = 96
/** `"2807901001":` más la coma = 15 B. */
export const BYTES_POR_CLAVE_ESTIMADOS = 16

/** Estimación en bytes del bloque serializado. Se usa como cota ANTES de
 *  construir: si supera el límite del Data Cache, el bloque se sirve sin
 *  cachear y se dice por qué, en lugar de tumbar la respuesta. */
export function estimarBytesBloque(nSecciones: number, nValores: number): number {
  return nValores * BYTES_POR_CELDA_ESTIMADOS + nSecciones * BYTES_POR_CLAVE_ESTIMADOS
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de arranque compartidas
// ─────────────────────────────────────────────────────────────────────────────

/** Periodo por defecto de un indicador: el que declara la cobertura, y si no,
 *  el año más reciente que aparece en sus propias celdas. Nunca se inventa un
 *  año que la fuente no publica. */
export function periodoPorDefectoDe(
  indicadorId: string,
  cobertura: SeccionIndicadorCobertura[] | undefined,
  series: SeccionesSeriesCompactas | undefined,
): number | null {
  const entrada = (cobertura ?? []).find((c) => c.indicatorId === indicadorId)
  if (entrada?.periodoPorDefecto !== null && entrada?.periodoPorDefecto !== undefined) {
    return entrada.periodoPorDefecto
  }
  if (entrada && entrada.periodos.length > 0) return [...entrada.periodos].sort((a, b) => b - a)[0] ?? null
  let max: number | null = null
  for (const porIndicador of Object.values(series ?? {})) {
    for (const v of porIndicador?.[indicadorId] ?? []) {
      if (max === null || v.p > max) max = v.p
    }
  }
  return max
}

/** Periodos que un bloque trae de verdad, ordenados de más reciente a menos. */
export function periodosDeSerie(serie: SeccionesSeriesDeIndicador): number[] {
  const vistos = new Set<number>()
  for (const valores of Object.values(serie ?? {})) {
    for (const v of valores) vistos.add(v.p)
  }
  return [...vistos].sort((a, b) => b - a)
}

/** Valida el bloque de ganadoras por sección (el que sale del bootstrap).
 *  Mismo criterio fail-closed: cada fila debe ser una sección real del
 *  municipio y su estado debe estar en el vocabulario. */
export function validarGanadoras(
  ganadoras: Record<string, { estado?: unknown }>,
  municipalityIne: string,
): ResultadoValidacion {
  const errores: string[] = []
  for (const [seccion, fila] of Object.entries(ganadoras ?? {})) {
    if (!/^\d{10}$/.test(seccion)) {
      errores.push(`Ganadora con clave de sección inválida: "${seccion}"`)
      continue
    }
    if (seccion.slice(0, 5) !== municipalityIne) {
      errores.push(`Ganadora de ${seccion}, que no pertenece al municipio ${municipalityIne}`)
    }
    if (fila && fila.estado !== undefined && !esEstadoValido(fila.estado)) {
      errores.push(`Estado "${String(fila.estado)}" desconocido en la ganadora de ${seccion}`)
    }
  }
  return { ok: errores.length === 0, errores, avisos: [] }
}

/** Geometría utilizable como `geojson` del bootstrap. Filtra lo que no es
 *  sección (CUSEC inválido, polígono agregado de distrito) para que la única
 *  copia que viaja sea la que el cliente puede dibujar. */
export function featuresComoGeoJson(
  features: SeccionFeature[],
  filtrar: (f: SeccionFeature) => boolean,
): GeoJsonFeatureCollection {
  return { type: 'FeatureCollection', features: features.filter(filtrar) }
}
/**
 * Elige la convocatoria electoral que se sirve por defecto para un municipio.
 *
 * Regla: la más reciente PARA ESE MUNICIPIO, no la más reciente del catálogo.
 * `municipalityCodes` son los INE con objeto publicable en esa convocatoria. Sin
 * este filtro, un municipio cuyo objeto de la convocatoria más reciente no es
 * publicable se quedaba sin ningún indicador político aunque tuviera
 * resultados publicados en otras varias convocatorias (caso real de 46250
 * València: la más reciente, `european-2024-06-09`, es la única de las catorce
 * con `correspondenceStatus: unresolved`).
 *
 * Si el municipio no aparece en ninguna convocatoria con datos, se conserva el
 * comportamiento anterior (la más reciente del catálogo) en lugar de fallar:
 * que el consumidor decida y pueda mostrar la causa.
 */
export function elegirConvocatoria(
  cat: PoliticalCatalog | null,
  pedido: string | undefined,
  ines: string,
): { electionId: string; electionType: ElectionType; electionDate: string } | null {
  const lista = cat?.elections ?? []
  if (lista.length === 0) return null
  if (pedido) {
    const enc = lista.find((e) => e.electionId === pedido)
    if (enc) return { electionId: enc.electionId, electionType: enc.electionType, electionDate: enc.electionDate }
  }
  const conDatos = lista.filter((e) => e.municipalityCodes.includes(ines))
  const orden = (a: (typeof lista)[number], b: (typeof lista)[number]) =>
    a.electionDate < b.electionDate ? 1 : a.electionDate > b.electionDate ? -1 : 0
  const copia = [...(conDatos.length > 0 ? conDatos : lista)].sort(orden)
  const elegida = copia[0] as (typeof lista)[number]
  return { electionId: elegida.electionId, electionType: elegida.electionType, electionDate: elegida.electionDate }
}