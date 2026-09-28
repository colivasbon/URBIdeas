// Atlas de secciones censales — CONTRATO COMPARTIDO (puro, sin I/O).
//
// Lo importan el servidor (ingesta, API, XLSX) y el cliente (mapa, leyenda,
// tabla, PNG). Por eso NO hace fetch, NO lee env y NO importa nada de Node.
//
// Reglas que este módulo hace cumplir por construcción:
//  - Un valor no publicado NUNCA es 0: es `no_difundido` con `value: null`.
//  - Un ND no se deduce por resta ni se rellena con el valor municipal.
//  - La clave territorial es `CUSEC` (10 dígitos) tal y como la publica el INE,
//    nunca una concatenación inventada en SOCideas.
//  - `geometryYear` (delimitación del seccionado) y `referencePeriod` (año
//    estadístico) son campos DISTINTOS y se exponen por separado. No se
//    proyecta un año sobre perímetros de otro sin advertencia visible.
//  - Solo se publica un indicador si la fuente lo difunde a ese grano.

export const SECCIONES_ATLAS_SCHEMA = 'secciones-atlas-v1'
export const SECCIONES_R2_PREFIX = 'socideas/secciones/v1/municipal'
export const SECCIONES_MANIFESTS_PREFIX = 'socideas/secciones/v1/manifests'

/** Atribución obligatoria de la cartografía del seccionado (la exige el INE). */
export const SECCIONES_ATRIBUCION =
  'Seccionado cedido por el Instituto Nacional de Estadística'

// ─────────────────────────────────────────────────────────────────────────────
// Estados de dato
// ─────────────────────────────────────────────────────────────────────────────

/** Vocabulario de estado de cada observación. `no_difundido` cubre ND, secreto
 *  estadístico y celda vacía; `sin_cobertura` cubre "la fuente no publica este
 *  indicador a nivel de sección". Nunca se colapsan entre sí. */
export type SeccionValorStatus =
  | 'observado'
  | 'derivado_verificable'
  | 'no_difundido'
  | 'no_aplicable'
  | 'sin_cobertura'
  | 'error_ingesta'

/** `no_difundido` es el único estado que admite `value: null` como resultado de
 *  una fuente que sí publica el indicador pero oculta la celda. */
export const ESTADOS_SIN_NUMERO: ReadonlySet<SeccionValorStatus> = new Set<SeccionValorStatus>([
  'no_difundido',
  'sin_cobertura',
  'no_aplicable',
  'error_ingesta',
])

export function admiteValor(status: SeccionValorStatus): boolean {
  return !ESTADOS_SIN_NUMERO.has(status)
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de indicadores
// ─────────────────────────────────────────────────────────────────────────────

export type SeccionTema = 'renta' | 'desigualdad'

export interface SeccionIndicador {
  /** Identificador estable en SOCideas. */
  id: string
  etiqueta: string
  tema: SeccionTema
  /** Operación statistical en el INE (número de operación de INEbase). */
  operation: string
  operationLabel: string
  /** ID exacto de tabla jaxiT3, resuelto desde el catálogo provincial. */
  sourceTable: string
  /** Etiqueta literal de la columna "Indicador…" en el CSV del INE. */
  sourceLabel: string
  /** Familia de tabla provincial: renta o gini. */
  tableFamily: 'renta' | 'gini'
  url: string
  unidad: string
  /** Universo sobre el que se calcula el indicador, si la fuente lo define. */
  universo: string
  /** Denominador de los porcentajes derivados. `null` si el indicador es un
   *  promedio, no un porcentaje. */
  denominador: string | null
  definicion: string
  /** `false` si el INE no difunde este indicador por sección censal. */
  publicadoPorSeccion: boolean
  /** Etiqueta del estado que la fuente da a las celdas no difundidas. */
  etiquetaNoDifundido: string
}

export interface SeccionIndicadorCobertura {
  indicatorId: string
  /** Periodos con al menos una sección observada. */
  periodos: number[]
  /** Periodo por defecto: último COMPLETO publicado. */
  periodoPorDefecto: number | null
  seccionesConDato: number
  seccionesSinDifundir: number
  seccionesSinCobertura: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Observación por sección
// ─────────────────────────────────────────────────────────────────────────────

/** Contrato tipado de UNA observación sección×indicador×periodo. */
export interface SeccionObservacion {
  /** `CUSEC` oficial del INE, 10 dígitos, con ceros iniciales. */
  sectionKey: string
  /** `CUMUN` del INE, 5 dígitos (= `municipios.codigo_ine`). */
  municipalityIne: string
  /** Año de la colección de seccionado used (geometría), p. ej. 2025. */
  geometryYear: number
  /** Año estadístico de referencia del dato. Distinto de `geometryYear`. */
  referencePeriod: number
  operation: string
  sourceTable: string
  indicatorId: string
  dimensions: Record<string, string>
  /** `null` salvo que `status` sea un estado con número. */
  value: number | null
  unit: string
  denominator: string | null
  status: SeccionValorStatus
  sourceUrl: string
  publishedAt: string | null
  retrievedAt: string
  checksum: string
  methodologyNote: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría
// ─────────────────────────────────────────────────────────────────────────────

/** Atributos del seccionado que el INE expone en el OGC/WFS. Se conserva el
 *  nombre original del INE para poder auditar contra la fuente. */
export interface SeccionAtributosIne {
  CUSEC: string
  CSEC: string
  CDIS: string
  CUDIS: string
  CUMUN: string
  CMUN: string
  CPRO: string
  NMUN: string
  NPRO: string
  TIPO: string | null
}

export interface SeccionFeature {
  type: 'Feature'
  properties: SeccionAtributosIne
  geometry: unknown
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: SeccionFeature[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Objeto publicado en R2 (uno por municipio)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccionesCalidad {
  /** `exact` solo si el 100 % de los polígonos son del municipio solicitado. */
  territoryMatch: 'exact' | 'missing' | 'invalid'
  /** Secciones de la geometría sin ninguna fila en la tabla estadística. */
  seccionesSinFila: string[]
  /** Filas estadísticas sin polígono en la geometría del año. */
  filasSinPoligono: string[]
  poligonosInvalidos: string[]
  poligonosVacios: string[]
  poligonosMulti: string[]
  clavesDuplicadas: string[]
  /** `true` si `geometryYear` !== año del seccionado de referencia. */
  hayDesfaseTemporal: boolean
  notas: string[]
  status: 'passed' | 'partial' | 'failed'
}

export interface SeccionesAtlasV1 {
  schemaVersion: typeof SECCIONES_ATLAS_SCHEMA
  municipalityIne: string
  municipalityName: string
  provinceName: string
  /** Año de la colección de seccionado (geometría). */
  geometryYear: number
  geometryCollection: string
  geometrySource: string
  geometryCrs: string
  /** Fecha de delimitación con la que se construyó la geometría. */
  geometryRetrievedAt: string
  /** Fecha de descarga de la estadística. NUNCA se presenta como periodo. */
  statsRetrievedAt: string
  indicators: SeccionIndicador[]
  cobertura: SeccionIndicadorCobertura[]
  sections: SeccionFeature[]
  /** Valores por sección: sectionKey → indicatorId → period → observación. */
  observations: Record<string, SeccionIndicadorObservaciones>
  /** Valor municipal oficial, para comparación SOLO si es metodológicamente
   *  válida (misma operación, mismo periodo). */
  municipalReference: Record<string, number | null>
  quality: SeccionesCalidad
  sourceChecksums: Record<string, string>
  generatedAt: string
  /** Checksum del contenido. En la forma R2 compacta se calcula sobre el
   *  cuerpo sin la propia marca; en la expandida se conserva el original. */
  schemaChecksum?: string
}

/** Un indicador en una sección, indexado por periodo: "2023" → observación. */
export type SeccionPorPeriodo = Record<string, SeccionObservacion>

/** Los indicadores de una sección, indexados por id de indicador. */
export type SeccionIndicadorObservaciones = Record<string, SeccionPorPeriodo>

// ─────────────────────────────────────────────────────────────────────────────
// Forma COMPACTA de almacenamiento (lo que se publica en R2)
//
// Una `SeccionObservacion` serializada ocupa ~485 bytes, pero solo ~30 son
// únicos: `sectionKey`, `municipalityIne`, `operation`, `sourceTable`, `unit`,
// `denominator`, `sourceUrl`, `retrievedAt` y `checksum` se repiten en las
// 131 922 observaciones de Madrid. Repetirlos convierte un objeto de 75 MB.
//
// Aquí se guarda SOLO lo que varía, y el resto se reconstruye al leer, contra el
// catálogo de indicadores y los metadatos del municipio. El resultado expandido
// cumple el contrato completo `SeccionObservacion` para API, mapa, PNG y XLSX:
// el almacenamiento nunca pierde información, solo deja de duplicarla.
// ─────────────────────────────────────────────────────────────────────────────

/** Un valor dentro de una serie compacta. */
export interface SeccionValorCompacto {
  /** Periodo de referencia. */
  p: number
  /** Valor, o `null` si la fuente no lo difundió. */
  v: number | null
  /** Estado (misma vocabulario que `SeccionValorStatus`). */
  s: SeccionValorStatus
  /** Nota metodológica puntual (p. ej. cota superior por secreto). */
  n?: string | null
}

/** series[sectionKey][indicatorId] = lista de valores por periodo. */
export type SeccionesSeriesCompactas = Record<
  string,
  Record<string, SeccionValorCompacto[]>
>

export interface SeccionesAtlasR2V1
  extends Omit<SeccionesAtlasV1, 'observations' | 'schemaVersion' | 'schemaChecksum'> {
  schemaVersion: 'secciones-atlas-r2-v1'
  series: SeccionesSeriesCompactas
  /** Checksum del cuerpo compacto publicado. */
  schemaChecksum: string
}

/** Metadatos compartidos por TODAS las observaciones de un indicador. */
export interface ContextoObservacion {
  municipalityIne: string
  geometryYear: number
  operation: string
  sourceTable: string
  unit: string
  denominator: string | null
  sourceUrl: string
  publishedAt: string | null
  retrievedAt: string
  checksum: string
}

/** Expande la forma compacta a observaciones completas del contrato.
 *
 *  `anio` filtra por periodo: la interfaz solo necesita un año a la vez, y así
 *  la respuesta no viaja con nueve años que el usuario no está viendo. */
export function expandirObservaciones(
  series: SeccionesSeriesCompactas,
  ctx: ContextoObservacion,
  opciones: { anio?: number; indicadores?: string[] } = {},
): Record<string, SeccionIndicadorObservaciones> {
  const salida: Record<string, SeccionIndicadorObservaciones> = {}
  const filtrarIndicadores = opciones.indicadores?.length
    ? new Set(opciones.indicadores)
    : null
  for (const [sectionKey, porIndicador] of Object.entries(series)) {
    const destino: SeccionIndicadorObservaciones = {}
    for (const [indicatorId, valores] of Object.entries(porIndicador)) {
      if (filtrarIndicadores && !filtrarIndicadores.has(indicatorId)) continue
      const porPeriodo: SeccionPorPeriodo = {}
      for (const val of valores) {
        if (opciones.anio !== undefined && val.p !== opciones.anio) continue
        const obs: SeccionObservacion = {
          sectionKey,
          municipalityIne: ctx.municipalityIne,
          geometryYear: ctx.geometryYear,
          referencePeriod: val.p,
          operation: ctx.operation,
          sourceTable: ctx.sourceTable,
          indicatorId,
          dimensions: { ambito: 'seccion_censal' },
          value: val.v,
          unit: ctx.unit,
          denominator: ctx.denominator,
          status: val.s,
          sourceUrl: ctx.sourceUrl,
          publishedAt: ctx.publishedAt,
          retrievedAt: ctx.retrievedAt,
          checksum: ctx.checksum,
          methodologyNote: val.n ?? null,
        }
        porPeriodo[String(val.p)] = obs
      }
      if (Object.keys(porPeriodo).length) destino[indicatorId] = porPeriodo
    }
    if (Object.keys(destino).length) salida[sectionKey] = destino
  }
  return salida
}

// ─────────────────────────────────────────────────────────────────────────────
// Claves territoriales
// ─────────────────────────────────────────────────────────────────────────────

export function isValidIne5(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5}$/.test(value)
}

/** `CUSEC` es siempre de 10 dígitos: provincia(2) + municipio(3) + distrito(2) +
 *  sección(3). Se valida la FORMA, no la pertenencia (esa la decide el join). */
export function isValidSeccionKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{10}$/.test(value)
}

/** Los tres últimos dígitos de `CUSEC` son `CSEC`. `000` marca el polígono
 *  AGREGADO DE DISTRITO que el INE incluye en la misma capa. No es una sección:
 *  tratarlo como sección inventaría una fila que la fuente no publica. */
export function esPoligonoDistrito(cusec: string): boolean {
  return isValidSeccionKey(cusec) && cusec.slice(7) === '000'
}

/** El municipio de un `CUSEC` son los cinco primeros dígitos. */
export function municipioDeSeccion(cusec: string): string | null {
  return isValidSeccionKey(cusec) ? cusec.slice(0, 5) : null
}

/** La clave ADRH de sección (columna "Secciones") es el mismo `CUSEC` de 10
 *  dígitos. Se normaliza a texto con ceros iniciales; nunca se parsea a number
 *  para no perder los ceros. */
export function normalizarClaveSeccionAdrh(bruto: string): string | null {
  const m = bruto.match(/(\d{10})/)
  return m ? m[1] : null
}

/** La clave ADRH de distrito (columna "Distritos") tiene 7 dígitos. Se usa solo
 *  para diagnóstico: el atlas de secciones nunca la mezcla con `CUSEC`. */
export function normalizarClaveDistritoAdrh(bruto: string): string | null {
  const m = bruto.match(/(\d{7})/)
  return m ? m[1] : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Interpretación de valores (el punto donde se decide ND vs 0)
// ─────────────────────────────────────────────────────────────────────────────

/** Marcadores que el INE usa para "celda no difundida". Ninguno significa cero:
 *  el cero es un valor legítimo y se representa con `0`. */
const MARCADORES_ND = new Set([
  '',
  '..',
  '...',
  '-',
  '–',
  '—',
  ':',
  '..s',
  's',
  'nd',
  'n/d',
  'ncp',
  'nc',
  'x',
  '*',
  'no disponible',
  'no MID',
])

/** Celdas que sí son un número, incluidas las que el INE acompaña de la nota
 *  "Se proporciona la cota superior" (secreto por encima de la cota). */
const COTAS_SUPERIORES = /cota|secreto/i

export interface InterpretacionAdrh {
  value: number | null
  status: SeccionValorStatus
  note: string | null
  /** `true` si el INE difunde un valor censurado y publica la cota. */
  cotaSuperior: boolean
}

/** Interpreta la columna `Total` de un CSV del ADRH.
 *
 *  Formato verificado de las descargas `jaxiT3` (español): la coma es el
 *  separador DECIMAL y el punto es SIEMPRE separador de MILLARES, incluso
 *  cuando la cifra no lleva coma. Patrones reales de la tabla 30656 (renta):
 *  `DD.DDD` y `D.DDD`; de la 37678 (Gini/P80-P20): `D,D`, `DD,D`, `DD`. Tratar
 *  "20.516" como 20,516 (en vez de 20516) encogía la renta por un factor 1000.
 *
 *  Regla central: un ND, un secreto o una cadena vacía producen
 *  `{ value: null, status: 'no_difundido' }`. NUNCA 0. */
export function interpretarTotalAdrh(bruto: string): InterpretacionAdrh {
  const texto = (bruto ?? '').trim()
  const norm = texto.toLowerCase()
  if (MARCADORES_ND.has(norm)) {
    return { value: null, status: 'no_difundido', note: null, cotaSuperior: false }
  }
  // Se retiran los puntos de millares y se convierte la coma decimal. La guarda
  // evita que un marcador residual como "." se degrade a 0: si no queda un
  // número con forma válida, es ND, jamás 0.
  const normalizado = norm.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
    return { value: null, status: 'no_difundido', note: null, cotaSuperior: false }
  }
  const num = Number(normalizado)
  if (!Number.isFinite(num)) {
    return { value: null, status: 'no_difundido', note: null, cotaSuperior: false }
  }
  return { value: num, status: 'observado', note: null, cotaSuperior: false }
}

export function notaCotaSuperior(nota: string | null | undefined): string | null {
  if (!nota) return null
  return COTAS_SUPERIORES.test(nota) ? nota.trim() : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Clasificación coroplética
// ─────────────────────────────────────────────────────────────────────────────

export type ModoClasificacion = 'cuantil' | 'intervalos_iguales' | 'cortes_manuales'

export const CLASES_MINIMO = 3
export const CLASES_MAXIMO = 7

export interface CorteClase {
  /** Límite inferior inclusivo. */
  min: number
  /** Límite superior EXCLUSIVO, salvo en la última clase. */
  max: number
  /** Etiqueta lista para leyenda. */
  etiqueta: string
  color: string
  secciones: number
}

export interface ResultadoClasificacion {
  cortes: CorteClase[]
  /** `true` si el número de valores distintos no daba para el nº pedido. */
  reducidoPorValoresDistintos: boolean
  valoresDistintos: number
  nObservados: number
  nNoDifundidos: number
  min: number
  max: number
}

/** Rampa secuencial DISCRETA derivada de la escala musgo del sistema IMA.
 *  No es un gradiente CSS: son pasos fijos con contraste verificado entre
 *  clases adyacentes (ver scripts/verify-secciones-rampa.mjs). */
export const RAMPA_SECUENCIAL: readonly string[] = [
  '#D5EDE6', // musgo-100
  '#B5D3CB', // musgo-200
  '#90B3AA', // musgo-300
  '#688F85', // musgo-400
  '#3E665C', // musgo-500 (institucional)
  '#2E554B', // musgo-600
  '#21463D', // musgo-700
]

/** Rampa divergente (discreta) centrada en la mediana, para indicadores con
 *  sentido de "por encima / por debajo". Mismo origen que la secuencial. */
export const RAMPA_DIVERGENTE: readonly string[] = [
  '#21463D', // musgo-700
  '#688F85', // musgo-400
  '#D5EDE6', // musgo-100 (neutro claro)
  '#E1B7B6', // rupestre-200
  '#643335', // rupestre-500
]

/** Relleno de "sin dato". Deliberadamente FUERA de la rampa: trama + hueco, de
 *  modo que un ND nunca se confunda con el valor más bajo ni con el cero. */
export const COLOR_SIN_DATO = '#B0BDB0' // limo-500
/** Contorno de ND: más oscuro que el relleno, para separar la trama. */
export const COLOR_CONTORNO_SIN_DATO = '#505A50' // limo-800

export function colorDeClase(indice: number, total: number, divergente = false): string {
  const rampa = divergente ? RAMPA_DIVERGENTE : RAMPA_SECUENCIAL
  if (total <= 1) return rampa[divergente ? 2 : rampa.length - 1]
  const t = indice / (total - 1)
  const pos = Math.round(t * (rampa.length - 1))
  return rampa[Math.min(rampa.length - 1, Math.max(0, pos))]
}

function formatoNumero(v: number, unidad: string): string {
  const abs = Math.abs(v)
  const decimales = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const s = v.toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
  return unidad === '%' ? `${s} %` : `${s} ${unidad}`.trim()
}

export interface OpcionesClasificacion {
  modo: ModoClasificacion
  clases: number
  cortesManuales?: number[] | null
  divergente?: boolean
  unidad: string
}

/** Calcula los cortes de la clasificación a partir de los valores OBSERVADOS.
 *  Los ND quedan fuera del cálculo (no desplazan la escala) pero se cuentan
 *  para poder mostrarlos en la leyenda. */
export function clasificar(
  valores: Array<number | null>,
  opciones: OpcionesClasificacion,
): ResultadoClasificacion {
  const observados = valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const nNoDifundidos = valores.length - observados.length
  const distintos = new Set(observados.map((v) => v)).size
  const min = observados.length ? Math.min(...observados) : 0
  const max = observados.length ? Math.max(...observados) : 0

  let cortes: number[]
  if (opciones.modo === 'cortes_manuales' && opciones.cortesManuales && opciones.cortesManuales.length) {
    cortes = [...opciones.cortesManuales].sort((a, b) => a - b)
  } else {
    const ordenados = [...observados].sort((a, b) => a - b)
    const pedidas = Math.max(CLASES_MINIMO, Math.min(CLASES_MAXIMO, opciones.clases))
    // Menos valores distintos que clases pedidas → se reduce (no se repite color).
    const n = Math.max(1, Math.min(pedidas, distintos))
    cortes = []
    for (let i = 1; i < n; i++) {
      if (opciones.modo === 'cuantil') {
        const idx = Math.floor((ordenados.length * i) / n)
        cortes.push(ordenados[Math.min(ordenados.length - 1, idx)])
      } else {
        cortes.push(min + ((max - min) * i) / n)
      }
    }
    // Cortes duplicados en cuantiles → se deduplican y se reduce el nº de clases.
    cortes = [...new Set(cortes)].sort((a, b) => a - b)
  }

  const nClases = cortes.length + 1
  const limites = [min, ...cortes, max]
  const conteo = new Array<number>(nClases).fill(0)

  for (const v of observados) {
    let clase = cortes.findIndex((c) => v < c)
    if (clase === -1) clase = nClases - 1
    conteo[clase] += 1
  }

  const resultado: CorteClase[] = cortes.map((c, i) => {
    const inf = limites[i]
    const sup = limites[i + 1]
    const ultima = i === nClases - 1
    const etq = ultima
      ? `${formatoNumero(inf, opciones.unidad)} o más`
      : `${formatoNumero(inf, opciones.unidad)} – ${formatoNumero(sup, opciones.unidad)}`
    return {
      min: inf,
      max: sup,
      etiqueta: etq,
      color: colorDeClase(i, nClases, opciones.divergente ?? false),
      secciones: conteo[i],
    }
  })

  return {
    cortes: resultado,
    reducidoPorValoresDistintos: nClases < Math.max(CLASES_MINIMO, opciones.clases),
    valoresDistintos: distintos,
    nObservados: observados.length,
    nNoDifundidos,
    min,
    max,
  }
}

/** Índice de clase de un valor dentro de una clasificación ya calculada. */
export function claseDeValor(valor: number | null, cortes: CorteClase[]): number {
  if (valor === null || !Number.isFinite(valor)) return -1
  for (let i = 0; i < cortes.length; i++) {
    const esUltima = i === cortes.length - 1
    if (valor < cortes[i].max || (esUltima && valor <= cortes[i].max)) return i
  }
  return cortes.length - 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación (fail-closed). Usada por el cargador, la API y los QA.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoValidacion {
  ok: boolean
  errores: string[]
  avisos: string[]
}

export function validarSeccionesAtlas(objeto: unknown): ResultadoValidacion {
  const errores: string[] = []
  const avisos: string[] = []
  if (!objeto || typeof objeto !== 'object') {
    return { ok: false, errores: ['El objeto no es un objeto JSON'], avisos }
  }
  const o = objeto as Partial<SeccionesAtlasV1>
  if (o.schemaVersion !== SECCIONES_ATLAS_SCHEMA) {
    errores.push(`schemaVersion esperado "${SECCIONES_ATLAS_SCHEMA}", recibido "${String(o.schemaVersion)}"`)
  }
  if (!isValidIne5(o.municipalityIne)) {
    errores.push(`municipalityIne inválido: "${String(o.municipalityIne)}"`)
  }
  if (typeof o.geometryYear !== 'number' || o.geometryYear < 2000 || o.geometryYear > 2100) {
    errores.push(`geometryYear inválido: "${String(o.geometryYear)}"`)
  }
  if (!Array.isArray(o.sections)) {
    errores.push('sections ausente o no es un array')
  }
  if (!Array.isArray(o.indicators)) {
    errores.push('indicators ausente o no es un array')
  }
  if (!o.observations || typeof o.observations !== 'object') {
    errores.push('observations ausente')
  }

  if (errores.length) return { ok: false, errores, avisos }

  const sections = o.sections as SeccionFeature[]
  const observations = o.observations as Record<string, SeccionIndicadorObservaciones>
  const indicadores = o.indicators as SeccionIndicador[]

  // 1. Geometría: todo polígono debe ser del municipio y tener CUSEC válido.
  const claves = new Set<string>()
  for (const f of sections) {
    const cusec = f?.properties?.CUSEC
    if (!isValidSeccionKey(cusec)) {
      errores.push(`CUSEC inválido o ausente: "${String(cusec)}"`)
      continue
    }
    if (esPoligonoDistrito(cusec)) {
      errores.push(`Polígono agregado de distrito (${cusec}) publicado como sección`)
      continue
    }
    if (municipioDeSeccion(cusec) !== o.municipalityIne) {
      errores.push(`Polígono ${cusec} NO pertenece al municipio ${o.municipalityIne}`)
    }
    if (f?.properties?.CUMUN !== o.municipalityIne) {
      errores.push(`CUMUN ${String(f?.properties?.CUMUN)} != ${o.municipalityIne} (${cusec})`)
    }
    if (claves.has(cusec)) errores.push(`CUSEC duplicado: ${cusec}`)
    claves.add(cusec)
    if (!f?.geometry) errores.push(`Geometría vacía en ${cusec}`)
  }

  // 2. Observaciones: nunca un 0 disfrazado de ND ni una clave huérfana.
  const idsValidos = new Set(indicadores.map((i) => i.id))
  for (const [seccion, porIndicador] of Object.entries(observations)) {
    if (!claves.has(seccion)) {
      avisos.push(`Observaciones para ${seccion}, que no está en la geometría`)
    }
    for (const [indicadorId, obs] of Object.entries(porIndicador ?? {})) {
      if (!idsValidos.has(indicadorId)) {
        errores.push(`Observación con indicador desconocido "${indicadorId}" en ${seccion}`)
      }
      for (const [periodo, o2] of Object.entries(obs ?? {})) {
        const oo = o2 as SeccionObservacion
        if (oo.sectionKey !== seccion) {
          errores.push(`sectionKey ${oo.sectionKey} no coincide con la clave ${seccion}`)
        }
        if (oo.referencePeriod !== Number(periodo)) {
          errores.push(`referencePeriod ${oo.referencePeriod} no coincide con la clave ${periodo}`)
        }
        if (municipioDeSeccion(seccion) !== o.municipalityIne) {
          errores.push(`Observación ${seccion}/${indicadorId}/${periodo} de otro municipio`)
        }
        if (!admiteValor(oo.status) && oo.value !== null) {
          errores.push(
            `Estado "${oo.status}" con value=${String(oo.value)} en ${seccion}/${indicadorId}/${periodo}: un ND nunca lleva número`,
          )
        }
        if (oo.status === 'observado' && oo.value === null) {
          errores.push(`Estado "observado" sin valor en ${seccion}/${indicadorId}/${periodo}`)
        }
      }
    }
  }

  return { ok: errores.length === 0, errores, avisos }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de presentación compartidas por mapa, PNG y XLSX
// ─────────────────────────────────────────────────────────────────────────────

export function etiquetaEstado(status: SeccionValorStatus): string {
  switch (status) {
    case 'observado':
      return 'Observado'
    case 'derivado_verificable':
      return 'Derivado verificable'
    case 'no_difundido':
      return 'No difundido (ND / secreto estadístico)'
    case 'no_aplicable':
      return 'No aplicable'
    case 'sin_cobertura':
      return 'Sin cobertura a nivel de sección'
    case 'error_ingesta':
      return 'Error de ingesta'
  }
}

export function formatearValor(
  value: number | null,
  status: SeccionValorStatus,
  unidad: string,
): string {
  if (value === null || !admiteValor(status)) {
    return status === 'sin_cobertura' ? 'Sin cobertura' : 'ND'
  }
  if (unidad === '%') {
    return `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
  }
  const abs = Math.abs(value)
  const dec = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return `${value.toLocaleString('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })} ${unidad}`.trim()
}

/** Cobertura de un indicador para un periodo: contadas sobre las secciones
 *  realmente publicadas, nunca sobre el total de municipios. */
export interface CoberturaPeriodo {
  periodo: number
  observados: number
  noDifundidos: number
  sinCobertura: number
  totalSecciones: number
  pctObservados: number
}

/** Cobertura de UN indicador en UN periodo.
 *  `porSeccionPeriodo` es el mapa de UN indicador: sectionKey → periodo →
 *  observación (es decir `observations[seccion]?.[indicadorId]`). La cobertura
 *  se cuenta sobre las secciones realmente publicadas, nunca sobre el total de
 *  municipios ni sobre secciones sin geometría. */
export function coberturaDePeriodo(
  sections: SeccionFeature[],
  porSeccion: Record<string, SeccionPorPeriodo> | undefined,
  periodo: number,
): CoberturaPeriodo {
  const total = sections.length
  let observados = 0
  let noDifundidos = 0
  let sinCobertura = 0
  for (const f of sections) {
    const obs = porSeccion?.[f.properties.CUSEC]?.[String(periodo)]
    if (!obs) {
      sinCobertura++
    } else if (obs.status === 'observado') {
      observados++
    } else if (obs.status === 'no_difundido') {
      noDifundidos++
    } else {
      sinCobertura++
    }
  }
  return {
    periodo,
    observados,
    noDifundidos,
    sinCobertura,
    totalSecciones: total,
    pctObservados: total ? Math.round((observados / total) * 1000) / 10 : 0,
  }
}
