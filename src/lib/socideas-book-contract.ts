// Contrato del libro municipal SOCideas v2 (`socideas-book@2`).
//
// QUÉ ES
//   Única fuente de verdad del libro XLSX municipal: hojas y su orden, estados
//   de dato, catálogo tipado de indicadores, claves de unicidad deterministas,
//   rúbrica de cobertura y reglas de hallazgos.
//
// POR QUÉ
//   La auditoría del 2026-09-24 midió el libro v1 (9 hojas, 884 celdas, 0
//   fórmulas, 0 gráficos, 0 tablas, 0 filtros, 0 paneles congelados) contra el
//   libro técnico manual de Torrejoncillo (3 hojas, 959 celdas, 126 fórmulas,
//   13 gráficos, 4 tablas, 2 autofiltros). El v2 nace para superar ese baseline
//   sin romper las reglas de oro ya vigentes: ausencia ≠ cero, series AEAT y
//   ADRH separadas, nada se estima fuera de un cálculo declarado.
//
// REGLAS NORMATIVAS
//   1. ND es SOLO presentación: el estado estructurado vive en el dato.
//   2. Un indicador no puede repetirse: la clave canónica es
//      `area|slug|periodo|ambito|dimensiones`. Duplicarla es un error de build.
//   3. La cobertura se pondera por indicadores publicables, nunca por número de
//      hojas ni por títulos.
//   4. Toda tabla/gráfico expone fuente, período, unidad y ámbito.
//   5. Los hallazgos son descriptivos y trazables: sin causalidad, sin
//      gobernabilidad, sin pactos.
//
// Solo servidor (lo consume el generador XLSX). Sin I/O, sin secretos.

import type { ComparisonMode, ExportCell, ExportTable } from './socideas-export'

/** Versión del esquema del libro. Cambiarla exige actualizar los validadores. */
export const SOCIDEAS_BOOK_SCHEMA = 'socideas-book@2' as const

// ============================================================================
// Hojas del libro (orden contractual v2)
// ============================================================================

export interface BookSheetMeta {
  id: string
  titulo: string
  subtitulo: string
  /** Área de cobertura (rúbrica). */
  area: BookArea
}

export const SOCIDEAS_BOOK_SHEETS = [
  { id: '00_RESUMEN', titulo: 'Resumen ejecutivo', subtitulo: 'Identificación, indicadores clave, hallazgos y semáforo de cobertura', area: 'resumen' },
  { id: '01_DEMOGRAFÍA', titulo: 'Demografía', subtitulo: 'Población, estructura, nacionalidad, arraigo y migraciones', area: 'demografia' },
  { id: '02_POLÍTICA', titulo: 'Política', subtitulo: 'Elecciones municipales, autonómicas y generales (Congreso y Senado separados)', area: 'politica' },
  { id: '03_ECONOMÍA_Y_EMPLEO', titulo: 'Economía y empleo', subtitulo: 'Renta, desigualdad, empresas, afiliación, paro y presupuesto', area: 'economia' },
  { id: '04_AGRARIO', titulo: 'Agrario', subtitulo: 'Explotaciones, usos del suelo, ganadería, titulares y relevo', area: 'agrario' },
  { id: '05_SOCIAL_EDUCACIÓN_SERVICIOS', titulo: 'Social, educación y servicios', subtitulo: 'Nivel educativo, centros docentes y servicios municipales con evidencia', area: 'servicios' },
  { id: '06_VIVIENDA_Y_HOGARES', titulo: 'Vivienda y hogares', subtitulo: 'Uso, tamaño, tenencia, superficie y antigüedad de la vivienda', area: 'vivienda' },
  { id: '07_PATRIMONIO_TURISMO', titulo: 'Patrimonio y turismo', subtitulo: 'Bienes protegidos, museos, alojamientos y recursos turísticos', area: 'patrimonio' },
  { id: '08_INFRAESTRUCTURA_RECURSOS', titulo: 'Infraestructura y recursos', subtitulo: 'Transporte, accesibilidad, agua, saneamiento, residuos y energía', area: 'infraestructura' },
  { id: '09_ASOCIACIONES_GOBERNANZA', titulo: 'Asociaciones y gobernanza', subtitulo: 'Registro asociativo, mancomunidades y sector público local', area: 'asociaciones' },
  { id: '10_METODOLOGÍA_FUENTES', titulo: 'Metodología y fuentes', subtitulo: 'Diccionario de indicadores, estados, fuentes, licencias y limitaciones', area: 'metodologia' },
] as const satisfies readonly BookSheetMeta[]

export type BookSheetId = (typeof SOCIDEAS_BOOK_SHEETS)[number]['id']

export const SOCIDEAS_BOOK_SHEET_IDS: readonly BookSheetId[] = SOCIDEAS_BOOK_SHEETS.map((s) => s.id)

export function bookSheetMeta(id: BookSheetId): BookSheetMeta {
  const meta = SOCIDEAS_BOOK_SHEETS.find((s) => s.id === id)
  if (!meta) throw new Error(`Hoja desconocida en el contrato v2: ${id}`)
  return meta
}

/** Áreas de la rúbrica de cobertura. */
export type BookArea =
  | 'resumen'
  | 'demografia'
  | 'politica'
  | 'economia'
  | 'agrario'
  | 'servicios'
  | 'vivienda'
  | 'patrimonio'
  | 'infraestructura'
  | 'asociaciones'
  | 'metodologia'

/** Pesos de la rúbrica de cobertura (suman 1). La cobertura del libro es la
 *  media ponderada de los indicadores publicables por área. Se documenta para
 *  que la comparación BEFORE/AFTER sea reproducible y no adjetiva. */
export const COVERAGE_WEIGHTS: Readonly<Record<Exclude<BookArea, 'resumen' | 'metodologia'>, number>> = {
  demografia: 0.2,
  politica: 0.12,
  economia: 0.22,
  agrario: 0.09,
  servicios: 0.14,
  vivienda: 0.1,
  patrimonio: 0.04,
  infraestructura: 0.06,
  asociaciones: 0.03,
}

// ============================================================================
// Estados de dato
// ============================================================================

export type BookState =
  | 'available'
  | 'partial'
  | 'not_applicable'
  | 'statistical_secrecy'
  | 'blocked_source'
  | 'pending_integration'
  | 'temporary_error'
  | 'missing_by_design'

/** Texto de presentación cuando no hay valor publicable. NUNCA un 0. */
export const ND_TEXT = 'ND'

export interface BookStateInfo {
  estado: BookState
  etiqueta: string
  texto: string
}

export const BOOK_STATE_GLOSSARY: readonly BookStateInfo[] = [
  { estado: 'available', etiqueta: 'Disponible', texto: 'Dato observado y publicado por la fuente oficial para este ámbito y período.' },
  { estado: 'partial', etiqueta: 'Parcial', texto: 'Dato publicado con cobertura incompleta (territorio, período o desagregación). Se indica el alcance real en la nota del bloque.' },
  { estado: 'not_applicable', etiqueta: 'No aplicable', texto: 'El indicador no procede para este municipio (por ejemplo, régimen electoral o figura administrativa inexistente).' },
  { estado: 'statistical_secrecy', etiqueta: 'Secreto estadístico', texto: 'La fuente suprime el valor para proteger el secreto estadístico (habitualmente <5 casos). Se presenta como ND, nunca como 0.' },
  { estado: 'blocked_source', etiqueta: 'Fuente bloqueada', texto: 'La fuente oficial existe pero no ofrece una descarga estructurada y legalmente reutilizable verificada. No se hace scraping masivo ni estimación.' },
  { estado: 'pending_integration', etiqueta: 'Pendiente de integración', texto: 'Fuente oficial verificada y descargable, aún no incorporada al pipeline. Documentada con operación y tabla candidata.' },
  { estado: 'temporary_error', etiqueta: 'Error temporal', texto: 'Fallo puntual de obtención; no altera el histórico ni se sustituye por valores de otra fuente.' },
  { estado: 'missing_by_design', etiqueta: 'Sin dato por diseño', texto: 'La propia fuente no cubre este ámbito o colectivo por diseño (por ejemplo, AEAT estatal en territorio foral).' },
]

/** ¿Este estado se presenta como ND? ND es solo presentación; la causa
 *  estructurada viaja en el catálogo de indicadores. */
export function isNdState(state: BookState): boolean {
  return state !== 'available' && state !== 'partial'
}

/** Valor numérico publicable: no nulo, finito y estado no suprimido. */
export function isPublishableBookValue(value: number | null, state: BookState): boolean {
  if (value === null || !Number.isFinite(value)) return false
  return state === 'available' || state === 'partial'
}

// ============================================================================
// Indicadores y clave de unicidad
// ============================================================================

export type BookIndicatorTipo =
  | 'entero'
  | 'decimal'
  | 'porcentaje'
  | 'moneda'
  | 'ratio'
  | 'texto'
  | 'fecha'

export type BookCapability =
  | 'nacional'
  | 'nacional_sin_forales'
  | 'nacional_sin_ceuta_melilla'
  | 'autonomica'
  | 'provincial'
  | 'municipal'

/** Estado de frescura de un indicador respecto a la última edición oficial. */
export type FreshnessStatus =
  | 'actualizado'
  | 'ultimo_oficial'
  | 'estructural'
  | 'desactualizado'
  | 'serie_parcial'
  | 'pendiente_integracion'
  | 'no_disponible'

export interface BookIndicator {
  /** Identificador estable dentro del libro (no cambia entre generaciones). */
  slug: string
  nombre: string
  descripcion: string
  area: Exclude<BookArea, 'resumen'>
  unidad: string
  tipo_valor: BookIndicatorTipo
  source_slug: string
  organismo: string
  operacion: string
  table_id: string | null
  series_id: string | null
  source_url: string | null
  license: string
  /** Período realmente empleado por el dato del libro. */
  periodo: string
  fecha_extraccion: string | null
  ambito: string
  granularidad: string
  dimensiones: string[]
  availability: BookState
  estado_validacion: 'consolidado' | 'provisional' | 'derivado' | 'no_publicado' | 'bloqueado'
  es_derivado: boolean
  /** Fórmula legible cuando `es_derivado` (nunca lógica oculta). */
  formula: string | null
  metodo: string | null
  comparabilidad: string
  freshness: string
  capability: BookCapability
  // --- Frescura (Fase 5 v2.1) -------------------------------------------------
  /** Período cargado/publicado que usa el indicador (normalmente = `periodo`). */
  source_period: string
  /** Última edición oficial verificada de la operación (null si no verificada). */
  latest_available_period: string | null
  /** Fecha ISO de consulta/extracción del dato. */
  retrieved_at: string | null
  /** Fecha de publicación oficial de la edición, solo si está verificada. */
  release_date: string | null
  freshness_status: FreshnessStatus
  /** Desfase respecto a la última edición (null si no comparable). */
  lag_years: number | null
  lag_months: number | null
  freshness_reason: string
}

/** Clave canónica: si dos indicadores comparten clave, el libro está corrupto. */
export function bookIndicatorKey(i: Pick<BookIndicator, 'area' | 'slug' | 'periodo' | 'ambito' | 'dimensiones'>): string {
  return [i.area, i.slug, i.periodo, i.ambito, [...i.dimensiones].sort().join('+')].join('|')
}

export interface DuplicateKeyReport {
  key: string
  count: number
  slugs: string[]
}

/** Detector de duplicados de clave: se ejecuta en build y en QA. */
export function findDuplicateIndicatorKeys(indicadores: readonly BookIndicator[]): DuplicateKeyReport[] {
  const map = new Map<string, { count: number; slugs: Set<string> }>()
  for (const ind of indicadores) {
    const key = bookIndicatorKey(ind)
    const entry = map.get(key) ?? { count: 0, slugs: new Set<string>() }
    entry.count += 1
    entry.slugs.add(ind.slug)
    map.set(key, entry)
  }
  return [...map.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([key, v]) => ({ key, count: v.count, slugs: [...v.slugs] }))
}

// ============================================================================
// Bloques v2, gráficos y reconciliaciones
// ============================================================================

export interface BookChartSeries {
  /** Nombre visible de la serie (título de leyenda). */
  nombre: string
  /** Columna física (1-based) de los valores dentro de la tabla del bloque. */
  columna: number
}

/**
 * Gráfico nativo. Las referencias de rango NO se hardcodean: el escritor las
 * resuelve desde la posición real del bloque (categorías = filas de datos de
 * `categoriaColumna`; valores = filas de datos de cada serie). Así el gráfico
 * no puede desincronizarse de la tabla.
 */
export interface BookChartSpec {
  id: string
  tipo: 'line' | 'bar' | 'column' | 'pie'
  titulo: string
  /** Unidad visible en el subtítulo del gráfico. OBLIGATORIA. */
  unidad: string
  /** Período visible en el subtítulo. OBLIGATORIO. */
  periodo: string
  /** Fuente visible en el subtítulo. OBLIGATORIA. */
  fuente: string
  /** Columna (1-based) de las categorías (p. ej. año o concepto). */
  categoriaColumna: number
  series: BookChartSeries[]
}

export interface BookReconciliation {
  id: string
  descripcion: string
  izquierda: number | null
  derecha: number | null
  tolerancia: number
  /** `igual`: |izquierda − derecha| ≤ tolerancia. `menor_igual`: izquierda ≤
   *  derecha + tolerancia (para magnitudes que no se suman, p. ej. sectores
   *  DIRCE solapados con el total). */
  modo?: 'igual' | 'menor_igual'
  ok: boolean
}

/** Extensión v2 de ExportCell: fórmula auditables y estado por celda. */
export interface BookCell extends ExportCell {
  /** Fórmula Excel; `numeric` conserva el resultado cacheado (paridad QA). */
  formula?: string
  /** Estado estructurado de la celda cuando no es `available`. */
  estado?: BookState
}

export interface BookTableV2 extends Omit<ExportTable, 'hoja' | 'filas'> {
  schema: typeof SOCIDEAS_BOOK_SCHEMA
  hoja: BookSheetId
  filas: BookCell[][]
  /** Indicadores declarados por esta tabla (clave de unicidad global). */
  indicadores: BookIndicator[]
  /** Gráfico nativo asociado (máximo 1 por tabla). */
  chart?: BookChartSpec
  /** Reconciliaciones verificadas en build (población H+M, válidos, sectores…). */
  checks?: BookReconciliation[]
  /** Nombre de tabla Excel nativa cuando el bloque es tabular filtrable. */
  tablaExcel?: string
  /** Unidad de la primera columna numérica (cabecera y formatos). */
  comparisonMode?: ComparisonMode
  /** Filas de datos plegables (outline level 1) para bloques de detalle. */
  plegable?: boolean
}

export interface BookSheetV2 {
  id: BookSheetId
  titulo: string
  subtitulo: string
  bloques: BookTableV2[]
}

// ============================================================================
// Cobertura e indicadores clave
// ============================================================================

export interface AreaCoverage {
  area: Exclude<BookArea, 'resumen' | 'metodologia'>
  publicables: number
  total: number
  ratio: number
  peso: number
}

export interface BookCoverage {
  areas: AreaCoverage[]
  /** Cobertura global 0–100 (media ponderada por indicadores). */
  global: number
  /** Indicadores publicables / declarados. */
  publicables: number
  declarados: number
}

/** Cobertura ponderada por indicadores (nunca por número de hojas). */
export function computeBookCoverage(indicadores: readonly BookIndicator[]): BookCoverage {
  const areas: AreaCoverage[] = []
  let weighted = 0
  let declared = 0
  let publicablesTotal = 0
  for (const [area, peso] of Object.entries(COVERAGE_WEIGHTS) as [AreaCoverage['area'], number][]) {
    const delArea = indicadores.filter((i) => i.area === area)
    if (delArea.length === 0) {
      areas.push({ area, publicables: 0, total: 0, ratio: 0, peso })
      continue
    }
    const publicables = delArea.filter(
      (i) => i.availability === 'available' || i.availability === 'partial',
    ).length
    const ratio = publicables / delArea.length
    areas.push({ area, publicables, total: delArea.length, ratio, peso })
    weighted += ratio * peso
    declared += delArea.length
    publicablesTotal += publicables
  }
  return {
    areas,
    global: Math.round(weighted * 1000) / 10,
    publicables: publicablesTotal,
    declarados: declared,
  }
}

// ============================================================================
// Hallazgos descriptivos
// ============================================================================

export interface BookFinding {
  id: string
  texto: string
  /** Trazabilidad: bloque + indicador(es) que sostienen el hallazgo. */
  traza: string[]
}

export interface FindingInput {
  id: string
  /** Valor y comparador ya calculados por el orquestador (nada de estadística aquí). */
  valor: number | null
  comparador?: number | null
  anio?: number | null
  unidad: string
  /** Texto descriptivo base. */
  plantilla: string
  traza: string[]
}

function fmtNum(n: number, unidad: string): string {
  const abs = Math.abs(n)
  const dec = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${unidad ? ` ${unidad}` : ''}`
}

/**
 * Construye hallazgos ESTRICTAMENTE descriptivos (máximo 5). Sin causalidad,
 * sin atribuciones políticas, sin predicciones. Solo se emite un hallazgo si el
 * valor existe; los ausentes se documentan en metodología, no como hallazgo.
 */
export function buildFindings(inputs: readonly FindingInput[], max = 5): BookFinding[] {
  const out: BookFinding[] = []
  for (const i of inputs) {
    if (i.valor === null || !Number.isFinite(i.valor)) continue
    const partes: string[] = [i.plantilla]
    if (i.comparador !== undefined && i.comparador !== null && Number.isFinite(i.comparador)) {
      const delta = i.valor - i.comparador
      const signo = delta > 0 ? 'por encima' : delta < 0 ? 'por debajo' : 'igual'
      partes.push(
        `El dato se sitúa ${signo} del comparador en ${fmtNum(Math.abs(delta), i.unidad)} (${fmtNum(i.comparador, i.unidad)}).`,
      )
    }
    partes.push(`Valor: ${fmtNum(i.valor, i.unidad)}${i.anio ? ` (${i.anio})` : ''}.`)
    out.push({ id: i.id, texto: partes.join(' '), traza: i.traza })
    if (out.length >= max) break
  }
  return out
}
