// Ingesta de indicadores DEMOGRÁFICOS a nivel de SECCIÓN CENSAL — SOLO SERVIDOR.
//
// Fuente: Censo anual de población 2021-2025 (operación INE `1254736176992`).
// Tablas PROVINCIALES de secciones censales (una por provincia y variable):
//   - «Población por sexo y edad (grupos quinquenales)» → total, sexo, 0-14, 65+, 80+ y %s.
//   - «Población por sexo y nacionalidad (española/extranjera)» → extranjera y %.
//
// Formato real verificado en las descargas csv_bd (2026-09):
//   Provincias \t Municipios \t Secciones \t Sexo \t Edad|Nacionalidad \t Periodo \t Total
//   Ejemplo de fila de SECCIÓN:
//     02 Albacete \t 02003 Albacete \t 0200301001 Albacete sección 01001 \t Total \t De 0 a 4 años \t 2025 \t 412
// La clave es el mismo CUSEC de 10 dígitos de la capa de seccionado.
//
// El punto es separador de MILLARES y la coma decimal (igual que el ADRH): se
// reutiliza `interpretarTotalAdrh`. Un ND es `no_difundido`, NUNCA 0.
//
// Todos los derivados (% de envejecimiento, etc.) usan el denominador de la
// MISMA tabla, año y sección (la población total observada de esa sección). No
// se inventan tramos: 0-14 sale de sumar 0-4, 5-9 y 10-14 EXACTOS.

import {
  interpretarTotalAdrh,
  isValidSeccionKey,
  municipioDeSeccion,
  normalizarClaveSeccionAdrh,
  type SeccionIndicador,
  type SeccionIndicadorObservaciones,
  type SeccionObservacion,
  type SeccionPorPeriodo,
  type SeccionValorStatus,
} from './socideas-secciones'

export const CENSO_OPERATION = 'Censo anual de población'
export const CENSO_OPERATION_IDE = '1254736176992'

type FuenteCenso = 'sexoEdad' | 'nacionalidad'

interface DefinicionCenso {
  id: string
  etiqueta: string
  unidad: string
  universo: string
  denominador: string | null
  definicion: string
  fuente: FuenteCenso
}

export const DEFINICIONES_CENSO: DefinicionCenso[] = [
  {
    id: 'poblacion_total',
    etiqueta: 'Población total',
    unidad: 'personas',
    universo: 'Residentes en la sección (Censo anual)',
    denominador: null,
    definicion: 'Población residente empadronada en la sección censal, todas las edades y ambos sexos.',
    fuente: 'sexoEdad',
  },
  {
    id: 'poblacion_hombres',
    etiqueta: 'Población · hombres',
    unidad: 'personas',
    universo: 'Residentes hombres (Censo anual)',
    denominador: null,
    definicion: 'Población residente de sexo masculino, todas las edades.',
    fuente: 'sexoEdad',
  },
  {
    id: 'poblacion_mujeres',
    etiqueta: 'Población · mujeres',
    unidad: 'personas',
    universo: 'Residentes mujeres (Censo anual)',
    denominador: null,
    definicion: 'Población residente de sexo femenino, todas las edades.',
    fuente: 'sexoEdad',
  },
  {
    id: 'poblacion_0_14',
    etiqueta: 'Población de 0 a 14 años',
    unidad: 'personas',
    universo: 'Residentes de 0 a 14 años (Censo anual)',
    denominador: null,
    definicion: 'Suma exacta de los grupos 0-4, 5-9 y 10-14. No se inventan tramos distintos de los quinquenales.',
    fuente: 'sexoEdad',
  },
  {
    id: 'poblacion_65_mas',
    etiqueta: 'Población de 65 y más años',
    unidad: 'personas',
    universo: 'Residentes de 65 y más años (Censo anual)',
    denominador: null,
    definicion: 'Suma exacta de los grupos quinquenales desde 65-69 hasta 100 y más.',
    fuente: 'sexoEdad',
  },
  {
    id: 'poblacion_80_mas',
    etiqueta: 'Población de 80 y más años',
    unidad: 'personas',
    universo: 'Residentes de 80 y más años (Censo anual)',
    denominador: null,
    definicion: 'Suma exacta de los grupos quinquenales desde 80-84 hasta 100 y más.',
    fuente: 'sexoEdad',
  },
  {
    id: 'pct_65_mas',
    etiqueta: 'Envejecimiento · 65 y más (%)',
    unidad: '%',
    universo: 'Residentes (Censo anual)',
    denominador: 'Población total de la sección (misma tabla y año)',
    definicion: 'Población de 65 y más años sobre la población total de la misma sección, tabla y año, en porcentaje.',
    fuente: 'sexoEdad',
  },
  {
    id: 'pct_80_mas',
    etiqueta: 'Envejecimiento · 80 y más (%)',
    unidad: '%',
    universo: 'Residentes (Censo anual)',
    denominador: 'Población total de la sección (misma tabla y año)',
    definicion: 'Población de 80 y más años sobre la población total de la misma sección, tabla y año, en porcentaje.',
    fuente: 'sexoEdad',
  },
  {
    id: 'pct_0_14',
    etiqueta: 'Población de 0 a 14 años (%)',
    unidad: '%',
    universo: 'Residentes (Censo anual)',
    denominador: 'Población total de la sección (misma tabla y año)',
    definicion: 'Población de 0 a 14 años sobre la población total de la misma sección, tabla y año, en porcentaje.',
    fuente: 'sexoEdad',
  },
  {
    id: 'poblacion_extranjera',
    etiqueta: 'Población extranjera',
    unidad: 'personas',
    universo: 'Residentes con nacionalidad extranjera (Censo anual)',
    denominador: null,
    definicion: 'Población residente cuya nacionalidad no es española.',
    fuente: 'nacionalidad',
  },
  {
    id: 'pct_extranjera',
    etiqueta: 'Población extranjera (%)',
    unidad: '%',
    universo: 'Residentes (Censo anual)',
    denominador: 'Población total de la sección (misma tabla y año)',
    definicion: 'Población extranjera sobre la población total de la misma sección, tabla y año, en porcentaje.',
    fuente: 'nacionalidad',
  },
]

/** Construye el catálogo de indicadores demográficos, marcando los que la
 *  fuente publica realmente para este municipio. */
export function construirCatalogoCenso(
  tablas: { sexoEdad: number; nacionalidad: number },
  presentes: string[],
  sourceBase: (tabla: number) => string,
): SeccionIndicador[] {
  return DEFINICIONES_CENSO.map((d) => {
    const tabla = d.fuente === 'sexoEdad' ? tablas.sexoEdad : tablas.nacionalidad
    return {
      id: d.id,
      etiqueta: d.etiqueta,
      tema: 'demografia',
      operation: CENSO_OPERATION,
      operationLabel: `${CENSO_OPERATION} (operación ${CENSO_OPERATION_IDE})`,
      sourceTable: String(tabla),
      sourceLabel: d.etiqueta,
      tableFamily: d.fuente === 'sexoEdad' ? 'censo_sexo_edad' : 'censo_nacionalidad',
      url: sourceBase(tabla),
      unidad: d.unidad,
      universo: d.universo,
      denominador: d.denominador,
      definicion: d.definicion,
      publicadoPorSeccion: presentes.includes(d.id),
      etiquetaNoDifundido: 'ND',
    } satisfies SeccionIndicador
  })
}

interface CeldaCenso {
  value: number | null
  status: SeccionValorStatus
}

/** key `${sexo}|${dimension}` → periodo → celda. */
type Dims = Map<string, Map<number, CeldaCenso>>

export interface ParseoCenso {
  porSeccion: Map<string, Dims>
  municipal: Dims
  periodos: number[]
  clavesInvalidas: number
  ajenasAlMunicipio: number
  totalFilasSeccion: number
  avisos: string[]
}

/** Parsea un CSV provincial del censo (sexo y edad, o sexo y nacionalidad). */
export function parsearCenso(csv: string, codigoIne: string): ParseoCenso {
  const avisos: string[] = []
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim() !== '')
  const vacio: ParseoCenso = {
    porSeccion: new Map(), municipal: new Map(), periodos: [],
    clavesInvalidas: 0, ajenasAlMunicipio: 0, totalFilasSeccion: 0, avisos: ['CSV del censo vacío'],
  }
  if (lineas.length < 2) return vacio

  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : ','
  const headers = lineas[0].split(sep).map((h) => h.replace(/^\uFEFF/, '').trim())
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const idx = (needle: string) => headers.findIndex((h) => norm(h).includes(needle))
  const iMuni = idx('municip')
  const iSec = idx('secc')
  const iSexo = idx('sexo')
  const iDim = headers.findIndex((h) => /edad|nacionalidad/i.test(norm(h)))
  const iPer = idx('periodo')
  const iVal = idx('total') >= 0 ? idx('total') : idx('valor')

  if (iMuni < 0 || iSec < 0 || iSexo < 0 || iDim < 0 || iPer < 0 || iVal < 0) {
    return { ...vacio, avisos: [`CSV del censo con cabeceras inesperadas: ${headers.join(' | ')}`] }
  }

  const porSeccion = new Map<string, Dims>()
  const municipal: Dims = new Map()
  const periodos = new Set<number>()
  let clavesInvalidas = 0
  let ajenasAlMunicipio = 0
  let totalFilasSeccion = 0

  const escribir = (dims: Dims, sexo: string, dim: string, anio: number, celda: CeldaCenso): void => {
    const k = `${sexo.toLowerCase()}|${dim.toLowerCase()}`
    let porPeriodo = dims.get(k)
    if (!porPeriodo) { porPeriodo = new Map(); dims.set(k, porPeriodo) }
    porPeriodo.set(anio, celda)
  }

  for (const linea of lineas.slice(1)) {
    const c = linea.split(sep)
    if (c.length <= Math.max(iMuni, iVal)) continue
    const mm = (c[iMuni] ?? '').match(/\b(\d{5})\b/)
    if (!mm || mm[1] !== codigoIne) continue

    const anio = Number.parseInt((c[iPer] ?? '').trim(), 10)
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) continue

    const interp = interpretarTotalAdrh(c[iVal] ?? '')
    const celda: CeldaCenso = { value: interp.status === 'observado' ? interp.value : null, status: interp.status }
    const sexo = (c[iSexo] ?? '').trim()
    const dim = (c[iDim] ?? '').trim()

    const seccionTexto = (c[iSec] ?? '').trim()
    // Fila MUNICIPAL (sin sección): referencia para comparación, no se pinta.
    if (!seccionTexto || !/\d{10}/.test(seccionTexto)) {
      escribir(municipal, sexo, dim, anio, celda)
      periodos.add(anio)
      continue
    }

    totalFilasSeccion++
    const seccion = normalizarClaveSeccionAdrh(seccionTexto)
    if (!seccion || !isValidSeccionKey(seccion)) { clavesInvalidas++; continue }
    if (municipioDeSeccion(seccion) !== codigoIne) { ajenasAlMunicipio++; continue }

    let dims = porSeccion.get(seccion)
    if (!dims) { dims = new Map(); porSeccion.set(seccion, dims) }
    escribir(dims, sexo, dim, anio, celda)
    periodos.add(anio)
  }

  return {
    porSeccion, municipal,
    periodos: [...periodos].sort((a, b) => a - b),
    clavesInvalidas, ajenasAlMunicipio, totalFilasSeccion, avisos,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivación de indicadores
// ─────────────────────────────────────────────────────────────────────────────

const EDAD_TODAS = 'todas las edades'
const SEXO_TOTAL = 'total'

function rangoEdad(dim: string): [number, number] | null {
  const d = dim.toLowerCase()
  if (d === EDAD_TODAS) return [0, 200]
  const m1 = d.match(/de\s+(\d+)\s+a\s+(\d+)/)
  if (m1) return [Number(m1[1]), Number(m1[2])]
  const m2 = d.match(/(\d+)\s+y\s+m[aá]s/)
  if (m2) return [Number(m2[1]), 200]
  return null
}

interface ContextoCenso {
  retrievedAt: string
  checksumSexoEdad: string
  checksumNacionalidad: string
  urlSexoEdad: string
  urlNacionalidad: string
  tablaSexoEdad: number
  tablaNacionalidad: number
}

export interface ResultadoCenso {
  porSeccion: Record<string, SeccionIndicadorObservaciones>
  municipal: Record<string, Record<string, number | null>>
  periodos: number[]
  indicadoresPresentes: string[]
  avisos: string[]
}

/** Combina las tablas de sexo/edad y nacionalidad en observaciones por sección. */
export function construirDemografiaCenso(
  se: ParseoCenso,
  nac: ParseoCenso,
  codigoIne: string,
  ctx: ContextoCenso,
): ResultadoCenso {
  const avisos: string[] = []
  const porSeccion: Record<string, SeccionIndicadorObservaciones> = {}
  const municipal: Record<string, Record<string, number | null>> = {}
  const periodos = new Set<number>()
  const presentes = new Set<string>()

  const tablaDe = (fuente: FuenteCenso, url: string, checksum: string) => ({ fuente, url, checksum })

  const contexto = (indId: string) => {
    const def = DEFINICIONES_CENSO.find((d) => d.id === indId)!
    return def.fuente === 'sexoEdad'
      ? tablaDe('sexoEdad', ctx.urlSexoEdad, ctx.checksumSexoEdad)
      : tablaDe('nacionalidad', ctx.urlNacionalidad, ctx.checksumNacionalidad)
  }

  const crearObs = (
    indId: string,
    seccion: string | null,
    anio: number,
    value: number | null,
    status: SeccionValorStatus,
    metodologia: string | null,
  ): SeccionObservacion => {
    const def = DEFINICIONES_CENSO.find((d) => d.id === indId)!
    const tabla = def.fuente === 'sexoEdad' ? ctx.tablaSexoEdad : ctx.tablaNacionalidad
    const cx = contexto(indId)
    return {
      sectionKey: seccion ?? '',
      municipalityIne: codigoIne,
      geometryYear: 0,
      referencePeriod: anio,
      operation: CENSO_OPERATION_IDE,
      sourceTable: String(tabla),
      indicatorId: indId,
      dimensions: { ambito: seccion ? 'seccion_censal' : 'municipio' },
      value,
      unit: def.unidad,
      denominator: def.denominador,
      status,
      sourceUrl: cx.url,
      publishedAt: null,
      retrievedAt: ctx.retrievedAt,
      checksum: cx.checksum,
      methodologyNote: metodologia,
    }
  }

  const celda = (dims: Dims | undefined, sexo: string, dim: string, anio: number): CeldaCenso | null => {
    const p = dims?.get(`${sexo.toLowerCase()}|${dim.toLowerCase()}`)
    return p?.get(anio) ?? null
  }

  const observar = (c: CeldaCenso | null): { value: number | null; status: SeccionValorStatus } =>
    c && c.status === 'observado' && typeof c.value === 'number'
      ? { value: c.value, status: 'observado' }
      : { value: null, status: 'no_difundido' }

  const sumar = (dims: Dims | undefined, anio: number, desde: number): { value: number | null; status: SeccionValorStatus } => {
    if (!dims) return { value: null, status: 'no_difundido' }
    let suma = 0
    let alguno = false
    for (const [k, porPeriodo] of dims) {
      const [sexo, dim] = k.split('|')
      if (sexo !== SEXO_TOTAL) continue
      const r = rangoEdad(dim)
      if (!r || r[0] < desde) continue
      const c = porPeriodo.get(anio)
      const o = observar(c ?? null)
      if (o.status !== 'observado' || o.value === null) return { value: null, status: 'no_difundido' }
      suma += o.value
      alguno = true
    }
    return alguno ? { value: suma, status: 'observado' } : { value: null, status: 'no_difundido' }
  }

  const sumar0a14 = (dims: Dims | undefined, anio: number): { value: number | null; status: SeccionValorStatus } => {
    if (!dims) return { value: null, status: 'no_difundido' }
    let suma = 0
    let alguno = false
    for (const [k, porPeriodo] of dims) {
      const [sexo, dim] = k.split('|')
      if (sexo !== SEXO_TOTAL) continue
      const r = rangoEdad(dim)
      if (!r || r[1] > 14) continue
      const c = observar(porPeriodo.get(anio) ?? null)
      if (c.status !== 'observado' || c.value === null) return { value: null, status: 'no_difundido' }
      suma += c.value
      alguno = true
    }
    return alguno ? { value: suma, status: 'observado' } : { value: null, status: 'no_difundido' }
  }

  const pct = (
    parte: { value: number | null; status: SeccionValorStatus },
    total: { value: number | null; status: SeccionValorStatus },
  ): { value: number | null; status: SeccionValorStatus } =>
    parte.status === 'observado' && total.status === 'observado' && parte.value !== null && total.value !== null && total.value > 0
      ? { value: (parte.value / total.value) * 100, status: 'observado' }
      : { value: null, status: 'no_difundido' }

  const emitir = (
    destino: Record<string, SeccionIndicadorObservaciones>,
    seccion: string | null,
    anio: number,
    indId: string,
    r: { value: number | null; status: SeccionValorStatus },
    metodologia: string | null,
  ): void => {
    if (r.status !== 'observado' || r.value === null) return
    presentes.add(indId)
    const key = seccion ?? ''
    if (!destino[key]) destino[key] = {}
    const porInd = destino[key][indId] ?? (destino[key][indId] = {})
    ;(porInd as SeccionPorPeriodo)[String(anio)] = crearObs(indId, seccion, anio, r.value, r.status, metodologia)
  }

  const NOTA_DERIVADO = 'Derivado de los grupos quinquenales de la misma tabla, año y sección.'
  const NOTA_PCT = 'Porcentaje sobre la población total observada de la misma sección, tabla y año.'

  for (const [seccion, dims] of se.porSeccion) {
    const dimsNac = nac.porSeccion.get(seccion)
    const todos = new Set<number>([
      ...[...dims.values()].flatMap((m) => [...m.keys()]),
      ...[...(dimsNac?.values() ?? [])].flatMap((m) => [...m.keys()]),
    ])
    for (const anio of todos) {
      periodos.add(anio)
      const total = observar(celda(dims, SEXO_TOTAL, EDAD_TODAS, anio))
      emitir(porSeccion, seccion, anio, 'poblacion_total', total, null)
      emitir(porSeccion, seccion, anio, 'poblacion_hombres', observar(celda(dims, 'Hombres', EDAD_TODAS, anio)), null)
      emitir(porSeccion, seccion, anio, 'poblacion_mujeres', observar(celda(dims, 'Mujeres', EDAD_TODAS, anio)), null)
      const j14 = sumar0a14(dims, anio)
      const m65 = sumar(dims, anio, 65)
      const m80 = sumar(dims, anio, 80)
      emitir(porSeccion, seccion, anio, 'poblacion_0_14', j14, NOTA_DERIVADO)
      emitir(porSeccion, seccion, anio, 'poblacion_65_mas', m65, NOTA_DERIVADO)
      emitir(porSeccion, seccion, anio, 'poblacion_80_mas', m80, NOTA_DERIVADO)
      emitir(porSeccion, seccion, anio, 'pct_65_mas', pct(m65, total), NOTA_PCT)
      emitir(porSeccion, seccion, anio, 'pct_80_mas', pct(m80, total), NOTA_PCT)
      emitir(porSeccion, seccion, anio, 'pct_0_14', pct(j14, total), NOTA_PCT)
      if (dimsNac) {
        const ext = observar(celda(dimsNac, SEXO_TOTAL, 'Extranjera', anio))
        const totNac = observar(celda(dimsNac, SEXO_TOTAL, 'Total', anio))
        emitir(porSeccion, seccion, anio, 'poblacion_extranjera', ext, null)
        emitir(porSeccion, seccion, anio, 'pct_extranjera', pct(ext, totNac), NOTA_PCT)
      }
    }
  }

  // Referencia municipal (fila sin sección), para la comparación de la tabla.
  for (const [indId, porPeriodo] of Object.entries(municipalizar(se.municipal, nac.municipal))) {
    municipal[indId] = porPeriodo
  }

  return {
    porSeccion,
    municipal,
    periodos: [...periodos].sort((a, b) => a - b),
    indicadoresPresentes: [...presentes].sort(),
    avisos,
  }

  function municipalizar(seM: Dims, nacM: Dims): Record<string, Record<string, number | null>> {
    const salida: Record<string, Record<string, number | null>> = {}
    const anios = new Set<number>([
      ...[...seM.values()].flatMap((m) => [...m.keys()]),
      ...[...nacM.values()].flatMap((m) => [...m.keys()]),
    ])
    for (const anio of anios) {
      const total = observar(celda(seM, SEXO_TOTAL, EDAD_TODAS, anio))
      const set = (id: string, r: { value: number | null; status: SeccionValorStatus }) => {
        if (r.status !== 'observado') return
        salida[id] = salida[id] ?? {}
        salida[id]![String(anio)] = r.value
      }
      set('poblacion_total', total)
      set('poblacion_hombres', observar(celda(seM, 'Hombres', EDAD_TODAS, anio)))
      set('poblacion_mujeres', observar(celda(seM, 'Mujeres', EDAD_TODAS, anio)))
      set('poblacion_0_14', sumar0a14(seM, anio))
      set('poblacion_65_mas', sumar(seM, anio, 65))
      set('poblacion_80_mas', sumar(seM, anio, 80))
      set('pct_65_mas', pct(sumar(seM, anio, 65), total))
      set('pct_80_mas', pct(sumar(seM, anio, 80), total))
      set('pct_0_14', pct(sumar0a14(seM, anio), total))
      const ext = observar(celda(nacM, SEXO_TOTAL, 'Extranjera', anio))
      const totNac = observar(celda(nacM, SEXO_TOTAL, 'Total', anio))
      set('poblacion_extranjera', ext)
      set('pct_extranjera', pct(ext, totNac))
    }
    return salida
  }
}
