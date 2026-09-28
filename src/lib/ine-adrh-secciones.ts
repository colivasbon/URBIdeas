// Ingesta de indicadores ADRH a nivel de SECCIÓN CENSAL — SOLO SERVIDOR.
//
// Complementa `ine-adrh.ts`, que a propósito DESCARTA las filas de distrito y
// sección (`ine-adrh.ts:129-130`) porque hasta ahora solo se publicaba nivel
// municipal. Aquí se leen esas mismas filas y se indexan por `CUSEC`.
//
// Formato real verificado en las descargas csv_bd del INE (2026-09), tabla
// 30656 (renta, Albacete) y 37678 (gini, Albacete):
//   Municipios \t Distritos \t Secciones \t Indicadores… \t Periodo \t Total
// Ejemplo de fila de SECCIÓN (no de distrito, no municipal):
//   02003 Albacete \t 0200301 Albacete distrito 01 \t 0200301016 Albacete sección 01016
//     \t Renta neta media por persona \t 2023 \t ""
// Ese `""` final es una celda NO DIFUNDIDA (secreto estadístico). Se publica
// como `no_difundido` con `value: null`. NUNCA como 0.
//
// La columna `Secciones` contiene `<CUSEC de 10 dígitos> <nombre>`. El
// CUSEC es la MISMA clave que publica la capa de seccionado (provincia 2 +
// municipio 3 + distrito 2 + sección 3), así que el join es exacto por
// identidad de clave oficial: nunca por parecido de nombres.

import {
  interpretarTotalAdrh,
  isValidSeccionKey,
  municipioDeSeccion,
  normalizarClaveDistritoAdrh,
  normalizarClaveSeccionAdrh,
  type SeccionIndicador,
  type SeccionIndicadorObservaciones,
  type SeccionObservacion,
  type SeccionPorPeriodo,
  type SeccionValorStatus,
} from './socideas-secciones'

export const ADRH_OPERATION = 'Atlas de Distribución de Renta de los Hogares (ADRH)'
export const ADRH_OPERATION_IDE = '1254736177088'

/** Definiciones de los indicadores, derivadas de la columna "Indicadores…" del
 *  propio CSV (verificado sobre las 52 provincias). Los identificadores y las
 *  unidades son de SOCideas; las etiquetas de origen se guardan tal cual para
 *  poder auditar el dato contra el INE. */
const DEFINICIONES: {
  etiquetaIne: string
  id: string
  etiqueta: string
  tema: 'renta' | 'desigualdad'
  unidad: string
  universo: string
  denominador: string | null
  definicion: string
  tableFamily: 'renta' | 'gini'
}[] = [
  {
    etiquetaIne: 'Renta neta media por persona',
    id: 'renta_neta_media_persona',
    etiqueta: 'Renta neta media por persona',
    tema: 'renta',
    unidad: 'euros',
    universo: 'Personas fisicas con declaración del IRPF',
    denominador: null,
    definicion:
      'Renta neta media anual por persona declarada en el IRPF. Promedio, no suma: no se suman valores de secciones.',
    tableFamily: 'renta',
  },
  {
    etiquetaIne: 'Renta neta media por hogar',
    id: 'renta_neta_media_hogar',
    etiqueta: 'Renta neta media por hogar',
    tema: 'renta',
    unidad: 'euros',
    universo: 'Hogares con declaración del IRPF',
    denominador: null,
    definicion:
      'Renta neta media anual por hogar declarado en el IRPF. Promedio sobre hogares, no sobre personas.',
    tableFamily: 'renta',
  },
  {
    etiquetaIne: 'Renta bruta media por persona',
    id: 'renta_bruta_media_persona',
    etiqueta: 'Renta bruta media por persona',
    tema: 'renta',
    unidad: 'euros',
    universo: 'Personas fisicas con declaración del IRPF',
    denominador: null,
    definicion: 'Renta bruta media anual por persona declarada en el IRPF.',
    tableFamily: 'renta',
  },
  {
    etiquetaIne: 'Renta bruta media por hogar',
    id: 'renta_bruta_media_hogar',
    etiqueta: 'Renta bruta media por hogar',
    tema: 'renta',
    unidad: 'euros',
    universo: 'Hogares con declaración del IRPF',
    denominador: null,
    definicion: 'Renta bruta media anual por hogar declarado en el IRPF.',
    tableFamily: 'renta',
  },
  {
    etiquetaIne: 'Media de la renta por unidad de consumo',
    id: 'renta_media_unidad_consumo',
    etiqueta: 'Renta media por unidad de consumo',
    tema: 'renta',
    unidad: 'euros',
    universo: 'Unidades de consumo (escala de equivalencia del Panel de Hogares)',
    denominador: null,
    definicion:
      'Renta media por unidad de consumo. La unidad de consumo corrige el tamaño del hogar con una escala de equivalencia.',
    tableFamily: 'renta',
  },
  {
    etiquetaIne: 'Mediana de la renta por unidad de consumo',
    id: 'renta_mediana_unidad_consumo',
    etiqueta: 'Renta mediana por unidad de consumo',
    tema: 'renta',
    unidad: 'euros',
    universo: 'Unidades de consumo (escala de equivalencia del Panel de Hogares)',
    denominador: null,
    definicion:
      'Mediana de la renta por unidad de consumo. Mediana: el 50 % de las unidades de consumo tiene una renta igual o inferior.',
    tableFamily: 'renta',
  },
  {
    etiquetaIne: 'Índice de Gini',
    id: 'indice_gini',
    etiqueta: 'Índice de Gini',
    tema: 'desigualdad',
    unidad: 'puntos',
    universo: 'Declarantes del IRPF de la sección',
    denominador: null,
    definicion:
      'Índice de Gini de la distribución de la renta. 0 = igualdad total; valores altos = mayor desigualdad.',
    tableFamily: 'gini',
  },
  {
    etiquetaIne: 'Distribución de la renta P80/P20',
    id: 'p80_p20',
    etiqueta: 'Distribución de la renta P80/P20',
    tema: 'desigualdad',
    unidad: 'ratio',
    universo: 'Declarantes del IRPF de la sección',
    denominador: null,
    definicion:
      'Cociente entre el percentil 80 y el percentil 20 de la renta. Mide la distancia entre ricos y pobres.',
    tableFamily: 'gini',
  },
]

/** Normaliza la etiqueta del INE para comparar sin acentos ni mayúsculas. */
export function normalizarEtiquetaIne(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
}

const POR_ETIQUETA = new Map<string, (typeof DEFINICIONES)[number]>(
  DEFINICIONES.map((d) => [normalizarEtiquetaIne(d.etiquetaIne), d]),
)

/** Etiquetas de cabecera de grupo que NO son indicadores: aparecen como
 *  subtítulo de sección en el CSV y nunca deben convertirse en un indicador.
 *  Se usan como aserción explícita en el parseo, no como filtro implícito. */
const ETIQUETAS_NO_INDICADOR = new Set(
  [
    'indicadores de renta media y mediana',
    'indice de gini y distribucion de la renta p80/p20',
  ].map(normalizarEtiquetaIne),
)

/** Normaliza un valor del CSV: `14.105` (punto) o `28,7` (coma). */
function parseNumero(bruto: string): number | null {
  const t = bruto.trim()
  if (t === '') return null
  // Se descartan los mismos marcadores que en el contrato, por si el CSV trae
  // alguno donde la API traía cadena vacía.
  const interp = interpretarTotalAdrh(t)
  return interp.status === 'observado' ? interp.value : null
}

/** Una fila tal y como viene del CSV provincial. */
export interface FilaAdrhSeccionCruda {
  municipioIne: string
  municipioNombre: string
  distritoKey: string | null
  seccionKey: string | null
  indicadorEtiquetaIne: string
  anio: number
  total: string
}

export interface ResultadoParseoAdrh {
  /** sectionKey → indicatorId → periodo → observación. */
  porSeccion: Record<string, SeccionIndicadorObservaciones>
  /** Valores MUNICIPALES (filas con distrito y sección vacíos), para
   *  comparación. Nunca se usan como valor de una sección. */
  municipal: Record<string, Record<string, number | null>>
  periodos: number[]
  indicadoresPresentes: string[]
  /** Filas de sección descartadas por clave no válida. */
  clavesInvalidas: number
  /** Filas de sección que pertenecen a OTRO municipio (control de calidad). */
  ajenasAlMunicipio: number
  totalFilasSeccion: number
  totalNoDifundidas: number
  avisos: string[]
}

/**
 * Parsea un CSV provincial del ADRH y devuelve las filas de SECCIÓN de un
 * municipio, indexadas para el atlas.
 *
 * `tablaId` es el ID real de jaxiT3 (resuelto por provincia desde
 * `adrh-province-tables.json`); se propaga a cada observación para trazabilidad.
 */
export function parsearAdrhSecciones(
  csv: string,
  codigoIne: string,
  contexto: {
    tableId: string
    sourceUrl: string
    retrievedAt: string
    publishedAt?: string | null
    checksum: string
  },
): ResultadoParseoAdrh {
  const avisos: string[] = []
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lineas.length < 2) {
    return {
      porSeccion: {},
      municipal: {},
      periodos: [],
      indicadoresPresentes: [],
      clavesInvalidas: 0,
      ajenasAlMunicipio: 0,
      totalFilasSeccion: 0,
      totalNoDifundidas: 0,
      avisos: ['CSV ADRH vacío'],
    }
  }

  // Las descargas csv_bd del INE son TSV, con BOM. Se detecta el separador.
  const sep = lineas[0]!.includes('\t') ? '\t' : lineas[0]!.includes(';') ? ';' : ','
  const headers = lineas[0]!.split(sep).map((h) => h.replace(/^\uFEFF/, '').trim())
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const idx = (needle: string) => headers.findIndex((h) => norm(h).includes(needle))
  const iMuni = idx('municip')
  const iDist = idx('distrito')
  const iSec = idx('secc')
  const iInd = idx('indica')
  const iPer = idx('periodo') >= 0 ? idx('periodo') : idx('anyo')
  const iVal = idx('total') >= 0 ? idx('total') : idx('valor')

  if (iMuni < 0 || iInd < 0 || iPer < 0 || iVal < 0) {
    return {
      porSeccion: {},
      municipal: {},
      periodos: [],
      indicadoresPresentes: [],
      clavesInvalidas: 0,
      ajenasAlMunicipio: 0,
      totalFilasSeccion: 0,
      totalNoDifundidas: 0,
      avisos: [
        `CSV ADRH con cabeceras inesperadas: ${headers.join(' | ')}`,
      ],
    }
  }

  const porSeccion: Record<string, SeccionIndicadorObservaciones> = {}
  const municipal: Record<string, Record<string, number | null>> = {}
  const periodos = new Set<number>()
  const indicadoresPresentes = new Set<string>()
  let clavesInvalidas = 0
  let ajenasAlMunicipio = 0
  let totalFilasSeccion = 0
  let totalNoDifundidas = 0

  for (const linea of lineas.slice(1)) {
    const c = linea.split(sep)
    if (c.length <= Math.max(iMuni, iVal)) continue

    // 1. Fila municipal: la que sirve para la comparación, no para pintar.
    const municipioTexto = c[iMuni] ?? ''
    const m = municipioTexto.match(/\b(\d{5})\b/)
    if (!m || m[1] !== codigoIne) continue

    const anio = Number.parseInt((c[iPer] ?? '').trim(), 10)
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) continue

    const def = POR_ETIQUETA.get(normalizarEtiquetaIne(c[iInd] ?? ''))
    if (!def) {
      // Cabecera de grupo o indicador no catalogado: se ignora, sin inventar.
      // Si la etiqueta es una cabecera de grupo conocida y aun así trae un
      // Total, es un cambio de formato del INE: se avisa para revisión.
      if (ETIQUETAS_NO_INDICADOR.has(normalizarEtiquetaIne(c[iInd] ?? '')) && (c[iVal] ?? '').trim() !== '') {
        avisos.push(
          `La cabecera de grupo "${(c[iInd] ?? '').trim()}" trae un Total: el formato del INE puede haber cambiado`,
        )
      }
      continue
    }
    indicadoresPresentes.add(def.id)

    const distrito = iDist >= 0 ? normalizarClaveDistritoAdrh(c[iDist] ?? '') : null
    const seccion = iSec >= 0 ? normalizarClaveSeccionAdrh(c[iSec] ?? '') : null
    const total = c[iVal] ?? ''

    // ── Fila MUNICIPAL (distrito y sección vacíos) ──────────────────────────
    if (!distrito && !seccion) {
      const v = parseNumero(total)
      municipal[def.id] = municipal[def.id] ?? {}
      municipal[def.id]![String(anio)] = v
      periodos.add(anio)
      continue
    }

    // ── Fila de DISTRITO: no es una sección. Se descarta a propósito. ──────
    if (!seccion) continue

    // ── Fila de SECCIÓN ────────────────────────────────────────────────────
    totalFilasSeccion++
    if (!isValidSeccionKey(seccion)) {
      clavesInvalidas++
      continue
    }
    // Control de territorio: la sección debe ser del municipio que pedimos.
    if (municipioDeSeccion(seccion) !== codigoIne) {
      ajenasAlMunicipio++
      continue
    }
    if (esClaveAgregadoDistritoEnCsv(seccion)) {
      // Salvaguarda: una fila de sección con CSEC=000 no es una sección.
      clavesInvalidas++
      continue
    }

    const interp = interpretarTotalAdrh(total)
    const status: SeccionValorStatus = interp.status
    // Un ND (celda vacía, guion, secreto) nunca lleva número. Un 0 publicado por
    // la fuente SÍ se conserva como 0: no se degrada a ND.
    if (status !== 'observado' || interp.value === null) totalNoDifundidas++

    const obs: SeccionObservacion = {
      sectionKey: seccion,
      municipalityIne: codigoIne,
      // Se rellenan en el orquestador, que es quien conoce la geometría.
      geometryYear: 0,
      referencePeriod: anio,
      operation: ADRH_OPERATION_IDE,
      sourceTable: contexto.tableId,
      indicatorId: def.id,
      dimensions: { ambito: 'seccion_censal', distrito: distrito ?? '' },
      value: status === 'observado' ? interp.value : null,
      unit: def.unidad,
      denominator: def.denominador,
      status,
      sourceUrl: contexto.sourceUrl,
      publishedAt: contexto.publishedAt ?? null,
      retrievedAt: contexto.retrievedAt,
      checksum: contexto.checksum,
      methodologyNote: interp.cotaSuperior
        ? 'El INE difunde la cota superior por secreto estadístico; no es el valor real.'
        : null,
    }

    const clavePeriodo = String(anio)
    porSeccion[seccion] = porSeccion[seccion] ?? {}
    const porIndicador: SeccionPorPeriodo = porSeccion[seccion]![def.id] ?? {}
    porSeccion[seccion]![def.id] = porIndicador
    // Si el mismo indicador/periodo aparece dos veces, la última gana; se anota.
    if (porIndicador[clavePeriodo]) {
      avisos.push(`Duplicado ${seccion}/${def.id}/${anio}: se conserva el último valor`)
    }
    porIndicador[clavePeriodo] = obs
    periodos.add(anio)
  }

  return {
    porSeccion,
    municipal,
    periodos: [...periodos].sort((a, b) => a - b),
    indicadoresPresentes: [...indicadoresPresentes].sort(),
    clavesInvalidas,
    ajenasAlMunicipio,
    totalFilasSeccion,
    totalNoDifundidas,
    avisos,
  }
}

/** `CSEC = '000'` marca el agregado de distrito; nunca es una sección. */
function esClaveAgregadoDistritoEnCsv(seccion: string): boolean {
  return isValidSeccionKey(seccion) && seccion.slice(7) === '000'
}

/** Construye el catálogo de indicadores para un municipio, marking los que el
 *  INE no publica a nivel de sección. */
export function construirCatalogoIndicadores(
  provinciaTabla: { renta: string; gini: string },
  presentes: string[],
  municipioNombre: string,
  sourceBase: (tabla: string) => string,
): SeccionIndicador[] {
  return DEFINICIONES.map((d) => {
    const tabla = d.tableFamily === 'renta' ? provinciaTabla.renta : provinciaTabla.gini
    const publicado = presentes.includes(d.id)
    return {
      id: d.id,
      etiqueta: d.etiqueta,
      tema: d.tema,
      operation: ADRH_OPERATION,
      operationLabel: `${ADRH_OPERATION} (operación ${ADRH_OPERATION_IDE})`,
      sourceTable: tabla,
      sourceLabel: d.etiquetaIne,
      tableFamily: d.tableFamily,
      url: sourceBase(tabla),
      unidad: d.unidad,
      universo: d.universo,
      denominador: d.denominador,
      definicion: d.definicion,
      publicadoPorSeccion: publicado,
      etiquetaNoDifundido: 'ND',
    } satisfies SeccionIndicador
  })
}
