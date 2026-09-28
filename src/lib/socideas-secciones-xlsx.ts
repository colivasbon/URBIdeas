// Datos de secciones censales para el libro XLSX municipal SOCideas.
// MÓDULO NUEUTRO, AISLADO Y PURO: sin I/O, sin `exceljs`, sin Node, sin secretos.
// El escritor del libro (`socideas-xlsx.ts`, solo servidor) importa este módulo y
// maqueta lo que aquí se devuelve. Aquí NO se escribe ni una celda: solo se
// decide QUÉ se escribe, de modo que el contenido se pueda auditar sin abrir
// Excel y sin arrancar el pipeline.
//
// LA REGLA DE ORO (idéntica a la del contrato congelado `socideas-secciones.ts`)
//   Un valor no publicado NUNCA es 0. Se emite como `valor: null` con la etiqueta
//   de estado, y el escritor lo pinta como celda Crisopa con el texto "ND".
//   Un 0 real se emite como `valor: 0` y se conserva. El round-trip no puede
//   confundir ambos casos porque la columna "Estado" acompaña siempre a "Valor".
//
// LO QUE ESTE MÓDULO GARANTIZA POR CONSTRUCCIÓN
//   1. Formato largo (una fila por sección × indicador × año). Nunca miles de
//      columnas: ver la nota de formato más abajo.
//   2. La clave territorial es el `CUSEC` de 10 dígitos del INE, como TEXTO. Se
//      marca con `texto: true` en `celdasSecciones()` para que el escritor fije
//      `numFmt = '@'`: si se escribiera como número, Excel borraría los ceros
//      iniciales y la clave dejaría de resolver contra el INE.
//   3. Los polígonos agregados de distrito (`CUSEC` con `CSEC = 000`) NO se
//      exportan como secciones: la fuente no publica ese grano y emitirlo
//      inventaría una fila. Quedan contados en `diagnostico`.
//   4. Las secciones con geometría pero sin estadística publicada SÍ se
//      exportan, con estado "Sin cobertura a nivel de sección". La cobertura
//      ausente es un dato, no un silencio.
//   5. El valor municipal NUNCA se reparte entre secciones: no existe ninguna
//      ruta de código que lo haga, ni por resta, ni por proporción de población.
//   6. Orden estable: dos ejecuciones sobre el mismo atlas producen exactamente
//      las mismas filas en el mismo orden (salida byte a byte estable).
//   7. Umbral de volumen: por encima de `SECCIONES_XLSX_UMBRAL_COMBINACIONES`
//      se marca `truncado: true` con el recuento exacto. Los datos NO se
//      recortan: el llamante decide si escribe un CSV aparte en vez de una hoja
//      inmanejable.

import {
  SECCIONES_ATRIBUCION,
  SECCIONES_ATLAS_SCHEMA,
  admiteValor,
  esPoligonoDistrito,
  etiquetaEstado,
  formatearValor,
  isValidSeccionKey,
  municipioDeSeccion,
  type SeccionIndicador,
  type SeccionObservacion,
  type SeccionPorPeriodo,
  type SeccionValorStatus,
  type SeccionesAtlasV1,
} from './socideas-secciones'
import { INE_INSTITUTION } from './socideas-source-registry'

// ============================================================================
// Umbral de volumen
// ============================================================================

/** Métrica del guard: `secciones publicadas × indicadores seleccionados`.
 *
 *  Por qué 25.000 y no el límite del formato (1.048.576 filas): el tope legal de
 *  XLSX está 42 veces por encima y no es la restricción real. La restricción
 *  real es de uso: el libro municipal ya arrastra diez hojas más, ExcelJS
 *  mantiene el bloque entero en memoria al escribirlo, y por encima de ~25.000
 *  filas el bloque deja de ser una tabla consultable y pasa a ser una descarga.
 *  Un municipio con más de 25.000 combinaciones sección×indicador está en el
 *  extremo alto de la distribución nacional (Madrid ronda 2.200 secciones), y su
 *  entrega honesta es un CSV adjunto, no una hoja dentro del libro.
 *
 *  Con `anio` resuelto (un periodo por indicador, el caso por defecto) el
 *  número de filas emitidas coincide exactamente con esta métrica. */
export const SECCIONES_XLSX_UMBRAL_COMBINACIONES = 25_000

/** Semántica de un ND, visible en la hoja junto a los datos. */
export const SECCIONES_SEMANTICA_ND =
  'Un valor no publicado se presenta como ND (celda Crisopa). ND nunca es 0: la celda vacía, el secreto estadístico y la supresión del INE se presentan como ND, y el 0 se conserva solo cuando la fuente difunde un 0.'

/** Semántica de las filas de cobertura, visible en la hoja. */
export const SECCIONES_SEMANTICA_COBERTURA =
  'Las secciones con geometría pero sin estadística publicada para el indicador y el año se incluyen con estado "Sin cobertura a nivel de sección". No se eliminan en silencio, no se rellenan con el valor municipal y no se completan por reparto proporcional.'

/** Granularidad de la tabla, textual y explícita. */
export const SECCIONES_GRANULARIDAD = 'Sección censal (CUSEC de 10 dígitos del INE)'

/**
 * Aviso de licencia. El contrato del atlas no fija licencia, así que NO se
 * inventa ninguna: se declara la ausencia y se reproduce la atribución que
 * exige la cesión del seccionado.
 */
export const SECCIONES_NOTA_LICENCIA =
  'Licencia no fijada en el contrato del atlas. Se reproduce la atribución que exige la cesión del seccionado; verificar la licencia vigente en la fuente oficial antes de redistribuir.'

// ============================================================================
// Fila de exportación
// ============================================================================

/** Una fila del bloque de secciones censales, en formato largo.
 *
 *  `claveSeccion` es un `string` a propósito. Es el `CUSEC` del INE (10 dígitos
 *  con ceros iniciales) y DEBE escribirse como celda de texto; el escritor lo
 *  deduce de `celdasSecciones()`, que devuelve `texto: true` para esta columna.
 *  `valor: null` significa ND o sin cobertura: jamás se escribe 0 en su lugar. */
export interface SeccionFilaExport {
  /** `CUSEC` del INE, 10 dígitos. TEXTO: conserva los ceros iniciales. */
  claveSeccion: string;
  /** `CDIS` del INE. Cadena vacía si la capa no lo publica. */
  distrito: string;
  /** `CSEC` del INE, 3 dígitos. TEXTO: conserva los ceros iniciales. */
  seccion: string;
  /** Nombre del municipio según el contrato del atlas. */
  municipioNombre: string;
  /** Año ESTADÍSTICO de la observación. Nunca el año de la geometría. */
  anio: number;
  /** Identificador estable del indicador en SOCideas. */
  indicadorId: string;
  /** Etiqueta legible del indicador. */
  indicadorEtiqueta: string;
  /** Valor observado, o `null` si la fuente no lo difundió. NUNCA 0 por ND. */
  valor: number | null;
  /** Etiqueta humana del estado (ver `etiquetaEstado` del contrato). */
  estado: string;
  /** Unidad del indicador tal y como la declara la fuente. */
  unidad: string;
  /** Denominador de los porcentajes derivados, o `null` si es un promedio. */
  denominador: string | null;
  /** Universo sobre el que se calcula el indicador. */
  universo: string;
  /** Id exacto de la tabla jaxiT3 de origen. */
  sourceTable: string;
  /** Número de operación del INE (INEbase). */
  operation: string;
  /** URL pública de la tabla de origen. */
  sourceUrl: string;
  /** Nota metodológica o de reserva publicada junto al dato, si la hay. */
  methodologyNote: string | null;
}

/** Claves de `SeccionFilaExport` en el orden de las columnas de la hoja.
 *  `celdasSecciones()` se apoya en este orden, así que columnas y campos no
 *  pueden desalinearse. */
export const SECCIONES_CAMPOS = [
  'claveSeccion',
  'distrito',
  'seccion',
  'municipioNombre',
  'anio',
  'indicadorId',
  'indicadorEtiqueta',
  'valor',
  'estado',
  'unidad',
  'denominador',
  'universo',
  'sourceTable',
  'operation',
  'sourceUrl',
  'methodologyNote',
] as const satisfies readonly (keyof SeccionFilaExport)[]

export type SeccionCampo = (typeof SECCIONES_CAMPOS)[number]

/** Encabezados visibles, en el MISMO orden que `SECCIONES_CAMPOS`. */
export const SECCIONES_XLSX_COLUMNAS: readonly string[] = [
  'Clave de sección (CUSEC)',
  'Distrito',
  'Sección (CSEC)',
  'Municipio',
  'Año de referencia',
  'Id del indicador',
  'Indicador',
  'Valor',
  'Estado',
  'Unidad',
  'Denominador',
  'Universo',
  'Tabla de origen',
  'Operación INE',
  'URL de origen',
  'Nota metodológica',
]

/** Columnas que se escriben como número. El resto, como texto (`numFmt = '@'`),
 *  y en particular `Clave de sección (CUSEC)`, `Distrito` y `Sección (CSEC)`,
 *  que llevan ceros iniciales. */
export const SECCIONES_COLUMNAS_NUMERICAS: ReadonlySet<SeccionCampo> = new Set<SeccionCampo>([
  'anio',
  'valor',
])

// ============================================================================
// Notas sobre el formato (decisión documentada)
// ============================================================================

/*
 * POR QUÉ FORMATO LARGO Y NO UNA COLUMNA POR INDICADOR
 * ------------------------------------------------------
 * La alternativa "ancha" (una columna por indicador, una fila por sección) es
 * inviable a este grano. El municipio con más secciones censales de España
 * (Madrid) ronda las 2.200, y el ADRH difunde del orden de veinte variables por
 * sección: 2.200 × 20 = 44.000 columnas, casi el triple del máximo de columnas
 * de Excel (16.384). La forma ancha no solo engorda el archivo, es imposible de
 * generar, y cuando "cabe" (municipios pequeños) esconde la cobertura: una
 * columna vacía no distingue "no publicado" de "no aplica" ni de "no descargado".
 *
 * El formato largo (sección × indicador × año) conserva la información de
 * cobertura fila a fila, admite filtros y tablas nativas de Excel, y mantiene
 * el libro dentro de límites manejables. Su coste —más filas que columnas— se
 * acota con `SECCIONES_XLSX_UMBRAL_COMBINACIONES` y se resuelve con un CSV
 * adjunto cuando el volumen no es de libro.
 *
 * El precio de esta decisión es que las columnas de texto (indicador, universo,
 * nota) se repiten en cada fila. Es asumible: con el umbral activo ninguna fila
 * supera los ~250 caracteres de contenido y ExcelJS no comprime texto
 * repetido, así que el tamaño real del bloque es lineal en el número de filas,
 * que es justo lo que el umbral acota.
 */

// ============================================================================
// Estado: ida y vuelta etiqueta → enumeración
// ============================================================================

/** Los seis estados del contrato, para poder invertir `etiquetaEstado`. */
const ESTADOS_CONTRATO: readonly SeccionValorStatus[] = [
  'observado',
  'derivado_verificable',
  'no_difundido',
  'no_aplicable',
  'sin_cobertura',
  'error_ingesta',
]

const ETIQUETA_A_ESTADO: ReadonlyMap<string, SeccionValorStatus> = new Map<string, SeccionValorStatus>(
  ESTADOS_CONTRATO.map((estado) => [etiquetaEstado(estado), estado]),
)

/**
 * Recupera la enumeración de estado a partir de su etiqueta humana, que es lo
 * que viaja en la fila de exportación. Es fail-closed: una etiqueta desconocida
 * se resuelve como `no_difundido`, un estado que NUNCA admite número, así que
 * una fila corrupta se presenta como ND en vez de como un valor.
 */
export function estadoDesdeEtiqueta(etiqueta: string): SeccionValorStatus {
  return ETIQUETA_A_ESTADO.get(etiqueta) ?? 'no_difundido'
}

/** `true` si la fila no lleva un número publicable (ND, secreto, sin cobertura). */
export function filaEsNd(fila: Pick<SeccionFilaExport, 'valor' | 'estado'>): boolean {
  return fila.valor === null || !admiteValor(estadoDesdeEtiqueta(fila.estado))
}

// ============================================================================
// Celda neutra para el escritor
// ============================================================================

/** Celda neutral lista para que el escritor la maquete. Estructuralmente
 *  compatible con `ExportCell` del libro (`{ text, numeric }`); `texto` y `nd`
 *  son pistas adicionales que evitan que el escritor tenga que deducir del
 *  texto si una celda es ND o si una clave debe ir como texto. */
export interface SeccionCeldaExport {
  /** Texto visible (CSV, HTML y celda de texto). */
  text: string;
  /** Resultado numérico, o `null` si no hay valor publicable. */
  numeric: number | null;
  /** `true` si la celda debe forzarse a TEXTO en Excel (`numFmt = '@'`). */
  texto: boolean;
  /** `true` si la celda representa un ND: la pinta Crisopa. */
  nd: boolean;
}

/** Proyecta las filas del bloque a celdas neutras, columna a columna.
 *  `SECCIONES_CAMPOS` y `SECCIONES_XLSX_COLUMNAS` comparten índice, así que
 *  `celdas[i][j]` corresponde a `columnas[j]`. */
export function celdasSecciones(filas: readonly SeccionFilaExport[]): SeccionCeldaExport[][] {
  return filas.map((fila) =>
    SECCIONES_CAMPOS.map((campo) => {
      if (campo === 'valor') {
        const estado = estadoDesdeEtiqueta(fila.estado)
        const esNd = fila.valor === null || !admiteValor(estado)
        return {
          text: esNd ? formatearValor(null, estado, fila.unidad) : formatearValor(fila.valor, estado, fila.unidad),
          numeric: esNd ? null : fila.valor,
          texto: false,
          nd: esNd,
        }
      }
      const bruto = fila[campo]
      if (campo === 'anio' && typeof bruto === 'number' && Number.isFinite(bruto)) {
        return { text: String(bruto), numeric: bruto, texto: false, nd: false }
      }
      return { text: bruto === null || bruto === undefined ? '' : String(bruto), numeric: null, texto: true, nd: false }
    }),
  )
}

// ============================================================================
// Bloque de tabla
// ============================================================================

/** Bloque de procedencia: quién publica, qué tabla, con qué geometría, cuándo se
 *  descargó y qué significa un ND. Va al pie de la hoja, no como columnas. */
export interface SeccionesFuenteExport {
  organismo: string;
  /** Operaciones INE distintas de los indicadores exportados, ordenadas. */
  operaciones: string[];
  /** Tablas de origen distintas, ordenadas. */
  tablas: string[];
  /** Año de la COLECCIÓN de seccionado (geometría). No es un periodo. */
  anioGeometria: number;
  /** Años estadísticos realmente publicados para los indicadores exportados. */
  aniosEstadisticos: number[];
  coleccionGeometria: string;
  fuenteGeometria: string;
  crsGeometria: string;
  /** Fecha de descarga de la geometría. */
  geometriaRecuperadaEl: string;
  /** Fecha de descarga de la estadística. NUNCA se presenta como periodo. */
  estadisticasRecuperadasEl: string;
  /** Universo declarado por los indicadores exportados, unido. */
  universo: string;
  /** Denominadores declarados, unidos; cadena vacía si los indicadores son
   *  promedios y no tienen denominador. */
  denominador: string;
  granularidad: string;
  notaLicencia: string;
  /** Atribución obligatoria de la cesión del seccionado (la exige el INE). */
  atribucionSeccionado: string;
  semanticaNd: string;
  semanticaCobertura: string;
  /** Versión del esquema del atlas de origen, para auditar la cadena. */
  esquemaAtlas: typeof SECCIONES_ATLAS_SCHEMA;
}

export interface SeccionesTablaOpciones {
  /** Exporta un solo indicador. Sin valor: todos los publicados por sección. */
  indicadorId?: string;
  /** Año estadístico. Sin valor: el último completo de cada indicador
   *  (`periodoPorDefecto` del atlas, o el mayor periodo observado). */
  anio?: number;
}

/** Indicador que no se ha exportado, con el motivo. Se declara en el bloque
 *  para que una ausencia no se confunda con un olvido. */
export interface SeccionesIndicadorExcluido {
  indicadorId: string;
  motivo: string;
}

export interface SeccionesDiagnostico {
  /** Polígonos de la capa del atlas. */
  seccionesGeometria: number;
  /** Polígonos realmente exportables (CUSEC válido, del municipio y no
   *  agregado de distrito). */
  seccionesPublicadas: number;
  /** `CUSEC` agregados de distrito excluidos (no son secciones). */
  agregadosDistritoExcluidos: string[];
  /** `CUSEC` con forma inválida, excluidos por no poder resolverse. */
  clavesInvalidasExcluidas: string[];
  /** `CUSEC` de otro municipio, excluidos. */
  otroMunicipioExcluidas: string[];
  /** Secciones con geometría sin NINGUNA fila estadística en el atlas. */
  seccionesSinFila: string[];
  /** `CUSEC` duplicados en la capa; se conserva el primero (orden estable). */
  clavesDuplicadas: string[];
}

export interface SeccionesTablaExport {
  titulo: string;
  columnas: string[];
  filas: SeccionFilaExport[];
  fuente: SeccionesFuenteExport;
  /** Marcador de volumen. `true` = no escribir esto como hoja: emitir un CSV.
   *  Las filas siguen siendo COMPLETAS: el truncado nunca descarta datos. */
  truncado: boolean;
  /** `seccionesPublicadas × indicadores exportados`, antes de filtrar año. */
  combinacionesTotales: number;
  /** Umbral aplicado, expuesto para que el llamante lo documente en la hoja. */
  umbralCombinaciones: number;
  filasEmitidas: number;
  /** Periodo realmente exportado por indicador. */
  periodosPorIndicador: Record<string, number>;
  /** Indicadores del atlas que no se han exportado, con su motivo. */
  indicadoresExcluidos: SeccionesIndicadorExcluido[];
  /** Recuento de filas por etiqueta de estado, para el pie de la hoja. */
  conteoEstados: Record<string, number>;
  diagnostico: SeccionesDiagnostico;
  /** Nota lista para la línea metodológica de la hoja. */
  nota: string;
}

// ============================================================================
// Utilidades internas
// ============================================================================

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function unicosOrdenados(valores: readonly string[]): string[] {
  return [...new Set(valores.filter((v) => v.trim().length > 0))].sort(cmp)
}

/** Une Sinónimos sin duplicar y en orden estable. */
function unirTextos(valores: readonly string[], separador = ' · '): string {
  return unicosOrdenados(valores).join(separador)
}

interface SeccionPublicada {
  cusec: string
  distrito: string
  csec: string
  nmun: string
}

/** Selecciona los polígonos que son secciones censales reales, sin inventar
 *  ninguna y en orden estable (el orden importa para el desempate de duplicados
 *  y para la salida byte a byte estable). */
function seleccionarSecciones(
  atlas: SeccionesAtlasV1,
): { secciones: SeccionPublicada[]; diagnostico: SeccionesDiagnostico } {
  const agregados: string[] = []
  const invalidas: string[] = []
  const ajenas: string[] = []
  const duplicadas: string[] = []
  const vistas = new Set<string>()
  const secciones: SeccionPublicada[] = []

  const ordenadas = [...atlas.sections].sort((a, b) =>
    cmp(String(a?.properties?.CUSEC ?? ''), String(b?.properties?.CUSEC ?? '')),
  )

  for (const feature of ordenadas) {
    const cusec = String(feature?.properties?.CUSEC ?? '')
    if (!isValidSeccionKey(cusec)) {
      invalidas.push(cusec)
      continue
    }
    if (esPoligonoDistrito(cusec)) {
      agregados.push(cusec)
      continue
    }
    if (municipioDeSeccion(cusec) !== atlas.municipalityIne) {
      ajenas.push(cusec)
      continue
    }
    if (vistas.has(cusec)) {
      duplicadas.push(cusec)
      continue
    }
    vistas.add(cusec)
    secciones.push({
      cusec,
      distrito: String(feature?.properties?.CDIS ?? '').trim(),
      csec: String(feature?.properties?.CSEC ?? cusec.slice(7, 10)).trim(),
      nmun: String(feature?.properties?.NMUN ?? '').trim(),
    })
  }

  const sinFila = secciones
    .filter((s) => {
      const porIndicador = atlas.observations?.[s.cusec]
      if (!porIndicador) return true
      return Object.values(porIndicador).every((porPeriodo) => Object.keys(porPeriodo ?? {}).length === 0)
    })
    .map((s) => s.cusec)

  return {
    secciones,
    diagnostico: {
      seccionesGeometria: atlas.sections.length,
      seccionesPublicadas: secciones.length,
      agregadosDistritoExcluidos: agregados,
      clavesInvalidasExcluidas: invalidas,
      otroMunicipioExcluidas: ajenas,
      seccionesSinFila: sinFila,
      clavesDuplicadas: duplicadas,
    },
  }
}

/** Indicadores a exportar: los que el INE difunde por sección y, si se pide,
 *  solo el indicado. Los que no se difunden a este grano se EXCLUYEN con su
 *  motivo (no se rellenan de "sin cobertura": la fuente nunca los publicó aquí). */
function seleccionarIndicadores(
  atlas: SeccionesAtlasV1,
  opts: SeccionesTablaOpciones,
): { selected: SeccionIndicador[]; excluidos: SeccionesIndicadorExcluido[] } {
  const selected: SeccionIndicador[] = []
  const excluidos: SeccionesIndicadorExcluido[] = []
  const pedido = opts.indicadorId?.trim()

  for (const indicador of atlas.indicators) {
    if (pedido && indicador.id !== pedido) continue
    if (!indicador.publicadoPorSeccion) {
      excluidos.push({
        indicadorId: indicador.id,
        motivo: 'El INE no difunde este indicador a nivel de sección censal; no se publica por sección.',
      })
      continue
    }
    selected.push(indicador)
  }

  if (pedido && selected.length === 0 && excluidos.length === 0) {
    excluidos.push({ indicadorId: pedido, motivo: 'El indicador solicitado no existe en el catálogo del atlas.' })
  }

  // Orden estable por id, para que el bloque no dependa del orden del JSON.
  selected.sort((a, b) => cmp(a.id, b.id))
  excluidos.sort((a, b) => cmp(a.indicadorId, b.indicadorId))
  return { selected, excluidos }
}

/** Periodo de un indicador, en este orden: año pedido, `periodoPorDefecto` del
 *  atlas, mayor periodo observado. Devuelve `null` si no hay ninguno: en ese
 *  caso NO se inventa un año (el año de la geometría no es un periodo
 *  estadístico) y el indicador se excluye con su motivo. */
function resolverPeriodo(
  atlas: SeccionesAtlasV1,
  indicador: SeccionIndicador,
  anioPedido: number | undefined,
): number | null {
  if (typeof anioPedido === 'number' && Number.isFinite(anioPedido)) return anioPedido
  const cobertura = atlas.cobertura?.find((c) => c.indicatorId === indicador.id)
  if (cobertura && typeof cobertura.periodoPorDefecto === 'number') return cobertura.periodoPorDefecto
  const periodos = new Set<number>()
  for (const porIndicador of Object.values(atlas.observations ?? {})) {
    const porPeriodo = porIndicador?.[indicador.id] as SeccionPorPeriodo | undefined
    for (const clave of Object.keys(porPeriodo ?? {})) {
      const n = Number(clave)
      if (Number.isFinite(n)) periodos.add(n)
    }
  }
  if (periodos.size === 0) return null
  return Math.max(...periodos)
}

/** Valor publicable, fail-closed: un estado que no admite número NUNCA produce
 *  un número, ni siquiera si el atlas trajera uno por error. */
function valorPublicable(obs: SeccionObservacion): number | null {
  if (!admiteValor(obs.status)) return null
  if (typeof obs.value !== 'number' || !Number.isFinite(obs.value)) return null
  return obs.value
}

// ============================================================================
// API pública
// ============================================================================

/**
 * Filas del bloque de secciones censales, en formato largo y orden estable.
 *
 * Orden: municipio, distrito, sección (los tres son segmentos del `CUSEC` de 10
 * dígitos, que es la clave jerárquica oficial), después indicador y año. Todas
 * las claves de comparación son de longitud fija salvo el id de indicador, y
 * todas las comparaciones son de cadena, sin `localeCompare`: dos ejecuciones
 * sobre el mismo atlas devuelven filas idénticas en el mismo orden.
 */
export function filasSeccionesDesdeAtlas(
  atlas: SeccionesAtlasV1,
  opts: SeccionesTablaOpciones = {},
): SeccionFilaExport[] {
  return construirTablaSecciones(atlas, opts).filas
}

/** Construye el bloque completo de secciones censales: columnas, filas,
 *  procedencia, diagnóstico y marcador de volumen. No escribe nada. */
export function construirTablaSecciones(
  atlas: SeccionesAtlasV1,
  opts: SeccionesTablaOpciones = {},
): SeccionesTablaExport {
  const anioPedido = typeof opts.anio === 'number' && Number.isFinite(opts.anio) ? opts.anio : undefined
  const { secciones, diagnostico } = seleccionarSecciones(atlas)
  const { selected, excluidos } = seleccionarIndicadores(atlas, opts)

  const periodosPorIndicador: Record<string, number> = {}
  const conPeriodo: Array<{ indicador: SeccionIndicador; anio: number }> = []
  for (const indicador of selected) {
    const anio = resolverPeriodo(atlas, indicador, anioPedido)
    if (anio === null) {
      excluidos.push({
        indicadorId: indicador.id,
        motivo:
          'El atlas no declara ningún periodo estadístico para este indicador; no se le imputa un año (el año del seccionado no es un periodo estadístico).',
      })
      continue
    }
    periodosPorIndicador[indicador.id] = anio
    conPeriodo.push({ indicador, anio })
  }
  excluidos.sort((a, b) => cmp(a.indicadorId, b.indicadorId))

  const filas: SeccionFilaExport[] = []
  for (const { indicador, anio } of conPeriodo) {
    for (const seccion of secciones) {
      const porIndicador = atlas.observations?.[seccion.cusec]
      const obs = (porIndicador?.[indicador.id] as SeccionPorPeriodo | undefined)?.[String(anio)] ?? null
      const estado: SeccionValorStatus = obs ? obs.status : 'sin_cobertura'
      filas.push({
        claveSeccion: seccion.cusec,
        distrito: seccion.distrito,
        seccion: seccion.csec,
        municipioNombre: atlas.municipalityName,
        anio,
        indicadorId: indicador.id,
        indicadorEtiqueta: indicador.etiqueta,
        valor: obs ? valorPublicable(obs) : null,
        estado: etiquetaEstado(estado),
        unidad: obs?.unit ?? indicador.unidad,
        denominador: obs?.denominator ?? indicador.denominador,
        universo: indicador.universo,
        sourceTable: obs?.sourceTable ?? indicador.sourceTable,
        operation: obs?.operation ?? indicador.operation,
        sourceUrl: obs?.sourceUrl ?? indicador.url,
        methodologyNote: obs?.methodologyNote ?? null,
      })
    }
  }

  filas.sort((a, b) => {
    // Municipio → distrito → sección: los tres son segmentos del CUSEC oficial.
    const jerarquia =
      cmp(a.claveSeccion.slice(0, 5), b.claveSeccion.slice(0, 5)) ||
      cmp(a.claveSeccion.slice(5, 7), b.claveSeccion.slice(5, 7)) ||
      cmp(a.claveSeccion.slice(7, 10), b.claveSeccion.slice(7, 10))
    if (jerarquia !== 0) return jerarquia
    return cmp(a.indicadorId, b.indicadorId) || a.anio - b.anio
  })

  const combinacionesTotales = secciones.length * conPeriodo.length
  const conteoEstados: Record<string, number> = {}
  for (const fila of filas) conteoEstados[fila.estado] = (conteoEstados[fila.estado] ?? 0) + 1
  for (const etiqueta of [etiquetaEstado('observado'), etiquetaEstado('no_difundido'), etiquetaEstado('sin_cobertura')]) {
    if (conteoEstados[etiqueta] === undefined) conteoEstados[etiqueta] = 0
  }
  const ordenConteos = Object.keys(conteoEstados).sort(cmp)
  const conteoOrdenado: Record<string, number> = {}
  for (const clave of ordenConteos) conteoOrdenado[clave] = conteoEstados[clave]

  const truncado = combinacionesTotales > SECCIONES_XLSX_UMBRAL_COMBINACIONES
  const anios = [...new Set(conPeriodo.map((x) => x.anio))].sort((a, b) => a - b)
  const operacionLabels = selected.map((i) => i.operationLabel || i.operation)

  const fuente: SeccionesFuenteExport = {
    organismo: INE_INSTITUTION,
    operaciones: unicosOrdenados(selected.map((i) => i.operation)),
    tablas: unicosOrdenados(selected.map((i) => i.sourceTable)),
    anioGeometria: atlas.geometryYear,
    aniosEstadisticos: anios,
    coleccionGeometria: atlas.geometryCollection,
    fuenteGeometria: atlas.geometrySource,
    crsGeometria: atlas.geometryCrs,
    geometriaRecuperadaEl: atlas.geometryRetrievedAt,
    estadisticasRecuperadasEl: atlas.statsRetrievedAt,
    universo: unirTextos(selected.map((i) => i.universo)),
    denominador: unirTextos(selected.map((i) => i.denominador ?? '')),
    granularidad: SECCIONES_GRANULARIDAD,
    notaLicencia: SECCIONES_NOTA_LICENCIA,
    atribucionSeccionado: SECCIONES_ATRIBUCION,
    semanticaNd: SECCIONES_SEMANTICA_ND,
    semanticaCobertura: SECCIONES_SEMANTICA_COBERTURA,
    esquemaAtlas: SECCIONES_ATLAS_SCHEMA,
  }

  const nota = [
    `Formato largo: ${filas.length} filas = ${secciones.length} secciones × ${conPeriodo.length} indicador(es) × ${anios.length} año(s).`,
    `Geometría: seccionado ${atlas.geometryYear} (${atlas.geometryCollection}, ${atlas.geometryCrs}); dato estadístico: ${anios.join(', ') || 'sin periodo'}.`,
    SECCIONES_SEMANTICA_ND,
    SECCIONES_SEMANTICA_COBERTURA,
    SECCIONES_ATRIBUCION,
    operacionLabels.length > 0 ? `Operaciones: ${unirTextos(operacionLabels)}.` : '',
    truncado
      ? `Volumen por encima del umbral de libro (${combinacionesTotales} combinaciones > ${SECCIONES_XLSX_UMBRAL_COMBINACIONES}): publicar como CSV adjunto, no como hoja. Los datos están completos.`
      : '',
  ]
    .filter((s) => s.length > 0)
    .join(' ')

  return {
    titulo: `Indicadores por sección censal — ${atlas.municipalityName} (${atlas.municipalityIne})`,
    columnas: [...SECCIONES_XLSX_COLUMNAS],
    filas,
    fuente,
    truncado,
    combinacionesTotales,
    umbralCombinaciones: SECCIONES_XLSX_UMBRAL_COMBINACIONES,
    filasEmitidas: filas.length,
    periodosPorIndicador,
    indicadoresExcluidos: excluidos,
    conteoEstados: conteoOrdenado,
    diagnostico,
    nota,
  }
}

/** El bloque de procedencia como líneas `Etiqueta: valor`, listas para las filas
 *  de fuente/metodología de la hoja. */
export function lineasProcedenciaSecciones(fuente: SeccionesFuenteExport): string[] {
  return [
    `Organismo: ${fuente.organismo}`,
    `Operación INE: ${fuente.operaciones.join(', ') || 'sin operación declarada'}`,
    `Tabla de origen: ${fuente.tablas.join(', ') || 'sin tabla declarada'}`,
    `Granularidad: ${fuente.granularidad}`,
    `Geometría: seccionado ${fuente.anioGeometria} · ${fuente.coleccionGeometria} · ${fuente.crsGeometria} · descargada el ${fuente.geometriaRecuperadaEl}`,
    `Periodo estadístico: ${fuente.aniosEstadisticos.join(', ') || 'sin periodo'}`,
    `Estadística descargada el: ${fuente.estadisticasRecuperadasEl}`,
    `Universo: ${fuente.universo || 'sin universo declarado'}`,
    `Denominador: ${fuente.denominador || 'no aplica (los indicadores exportados son promedios)'}`,
    `Esquema del atlas: ${fuente.esquemaAtlas}`,
    `Atribución del seccionado: ${fuente.atribucionSeccionado}`,
    `Licencia: ${fuente.notaLicencia}`,
    `ND: ${fuente.semanticaNd}`,
    `Cobertura: ${fuente.semanticaCobertura}`,
  ]
}
