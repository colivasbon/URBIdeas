// Presentación CONPREL para ficha y XLSX — textos, estados S1–S4 y familias.
// Fuente única de verdad de los textos aprobados en
// docs/conprel-producto-textos.md §4 (inserción en UI/exportación).
//
// Reglas (§7 del mismo documento):
//  - ND = «No consta registro municipal en el fichero consultado» — nunca
//    «no remitió»/«incumple» ni causa foral individual sin prueba.
//  - ND ≠ 0: un 0 publicado en fila existente se conserva como cero real.
//  - Familias separadas (PPTO-2025 vs LIQ-2024): sin ejecución cruzada.
//  - Coberturas congeladas: 7.345/8.132 (90,3 %) y 6.861/8.132 (84,4 %).
//  - Avances excluidos; sin `available` nacional.
import type { IndicatorValue } from './socideas'
import { isRealValue } from './socideas-availability'
import {
  CONPREL_LIQ_2024,
  CONPREL_PPTO_2025,
  CONPREL_SOURCE_NOMBRE,
  CONPREL_SOURCE_ORGANISMO,
  type ConprelFamilia,
} from './conprel-contracts'
import { CONPREL_SLUGS, conprelSlugsForFamilia } from './conprel-slugs'
import { conprelMockFixture } from './conprel-mock'
import { isConprelMockEnabled } from './conprel-flag'
import {
  CONPREL_AUSENCIA_TEXTO,
  CONPREL_COBERTURA_PCT,
  CONPREL_COBERTURA_PRESENTES,
  CONPREL_COBERTURA_PRESENTES_TEXTO,
  CONPREL_DENOMINADOR,
  CONPREL_DENOMINADOR_TEXTO,
  CONPREL_NOTA_ANTI_COMPARACION,
  CONPREL_NOTA_ND,
  CONPREL_NOTA_SERIE,
  CONPREL_PIE_LIQ,
  CONPREL_PIE_PPTO,
} from './conprel-textos'

export {
  CONPREL_AUSENCIA_TEXTO,
  CONPREL_NOTA_ANTI_COMPARACION,
  CONPREL_NOTA_ND,
  CONPREL_NOTA_SERIE,
  CONPREL_NO_PUBLICADO_TEXTO,
} from './conprel-textos'

// ---------------------------------------------------------------------------
// Cobertura baseline (congelada; no recalcular en UI)
// ---------------------------------------------------------------------------

export const CONPREL_DENOM = CONPREL_DENOMINADOR

export const CONPREL_COBERTURA: Record<
  ConprelFamilia,
  { presentes: number; presentesTexto: string; pctTexto: string }
> = {
  ppto: {
    presentes: CONPREL_COBERTURA_PRESENTES.ppto,
    presentesTexto: CONPREL_COBERTURA_PRESENTES_TEXTO.ppto,
    pctTexto: CONPREL_COBERTURA_PCT.ppto,
  },
  liq: {
    presentes: CONPREL_COBERTURA_PRESENTES.liq,
    presentesTexto: CONPREL_COBERTURA_PRESENTES_TEXTO.liq,
    pctTexto: CONPREL_COBERTURA_PCT.liq,
  },
}

/** Texto de cobertura de una familia (contexto territorial sin 100 % de España). */
export function conprelCoberturaTexto(familia: ConprelFamilia): string {
  const c = CONPREL_COBERTURA[familia]
  return `Presente en ${c.presentesTexto} de ${CONPREL_DENOMINADOR_TEXTO} municipios en el fichero definitivo (${c.pctTexto} %).`
}

// ---------------------------------------------------------------------------
// Definiciones por magnitud (slug → definición visible)
// ---------------------------------------------------------------------------

const CONPREL_DEFINICIONES: Record<string, string> = {
  conprel_ppto_importe:
    'Presupuesto del ejercicio según la publicación definitiva CONPREL (cdFase=U; glosario de fase ' +
    'pendiente de verificación V1 — no se etiqueta «inicial» ni «avance»).',
  conprel_liq_prevision_definitivos_importe:
    'Previsión o créditos definitivos del ejercicio corriente (columna imported de tb_economica).',
  conprel_liq_reconocidos_importe:
    'Derechos liquidados (I) y obligaciones reconocidas netas (G) — columna importer de tb_economica.',
  conprel_liq_recaudacion_corriente_importe:
    'Recaudación o pagos líquidos del ejercicio corriente — columna importel de tb_economica.',
  conprel_liq_recaudacion_cerrados_importe:
    'Recaudación o pagos líquidos de ejercicios cerrados — columna importec de tb_economica. ' +
    'Los ceros masivos de la fuente son ceros reales publicados, no ausencias.',
}

// ---------------------------------------------------------------------------
// Hechos provinciales medidos (§1: nunca causa individual)
// ---------------------------------------------------------------------------

const HECHOS_PROVINCIALES: Record<string, string> = {
  '01':
    'Hecho medido a nivel provincial: Álava, 0 de 51 municipios presentes en el presupuesto definitivo ' +
    '2025. No se imputa causa individual a ningún municipio.',
  '31':
    'Hecho medido a nivel provincial: Navarra presenta cobertura baja en el fichero definitivo ' +
    '(alrededor del 14 % de los municipios); algunos sí constan (p. ej. Pamplona). No se imputa ' +
    'causa individual a ningún municipio.',
}

function notaTerritorial(codigoINE: string): string | null {
  return HECHOS_PROVINCIALES[codigoINE.slice(0, 2)] ?? null
}

function notaCeutaMelilla(codigoINE: string): string | null {
  if (codigoINE === '51001' || codigoINE === '52001') {
    return (
      'Ceuta y Melilla constan con tipo de entidad ZZ en el fichero; los registros dependientes ' +
      'ZV/ZO no cuentan como municipio en la cobertura.'
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Modelo de presentación
// ---------------------------------------------------------------------------

export type ConprelCruceEstado = 'S1' | 'S2' | 'S3' | 'S4'

export type ConprelEstadoFila =
  | 'presente'
  | 'ausente_fichero_ppto2025'
  | 'ausente_fichero_liq2024'
  | 'ausente_ambos_definitivos'

export interface ConprelIndicadorFila {
  slug: string
  nombre: string
  /** Magnitud contractual del design §5. */
  magnitud: string
  ejercicio: number
  cdcta: string
  tipreig: string
  concepto: string
  periodo: string
  unidad: string
  fuente: string
  definicion: string
  /** null = ausente (ND). number (incl. 0) = valor publicado en fila existente. */
  valor: number | null
  ausente: boolean
  /** true solo si la fuente publica 0,00 en fila existente. */
  esCeroPublicado: boolean
  estado: ConprelEstadoFila
}

export interface ConprelFamiliaPresentacion {
  familia: ConprelFamilia
  titulo: string
  ejercicio: number
  tableId: string
  etiquetaCorte: string
  coberturaTexto: string
  fuente: string
  fuenteUrl: string
  pie: string
  presente: boolean
  estadoFamilia: ConprelEstadoFila
  filas: ConprelIndicadorFila[]
  /** Texto de ausencia cuando la familia no tiene fila municipal. */
  ausenciaTexto: string
}

export interface ConprelPresentacion {
  codigoINE: string
  /** Dataset cargado (filas R2 o fixture mock): distingue S3 de «no publicado». */
  datasetCargado: boolean
  cruce: ConprelCruceEstado | null
  cruceTexto: string
  ppto: ConprelFamiliaPresentacion
  liq: ConprelFamiliaPresentacion
  notasTerritoriales: string[]
  notaSerie: string
  notaNd: string
  notaAntiComparacion: string
}

const MAGNITUD_LABEL: Record<string, string> = {
  conprel_ppto_importe: 'presupuesto_publicacion',
  conprel_liq_prevision_definitivos_importe: 'presupuesto_liq',
  conprel_liq_reconocidos_importe: 'reconocidos',
  conprel_liq_recaudacion_corriente_importe: 'liquidado',
  conprel_liq_recaudacion_cerrados_importe: 'recaudacion_cerrados',
}

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
}

function esConprel(v: IndicatorValue): boolean {
  return slugOf(v).startsWith('conprel_')
}

function familiaDeSlug(slug: string): ConprelFamilia | null {
  const def = CONPREL_SLUGS.find((s) => s.slug === slug)
  return def ? def.familia : null
}

function conceptoDe(cdcta: string, tipreig: string): string {
  const cap = cdcta === '1' ? 'Ingresos' : cdcta === '2' ? 'Gastos' : 'Capítulo'
  const tipo = tipreig === 'I' ? 'ingresos' : tipreig === 'G' ? 'gastos' : tipreig
  return cdcta === '1' || cdcta === '2'
    ? `Capítulo ${cdcta} · ${cap} (${tipo})`
    : `Capítulo ${cdcta || '—'}`
}

function filasDeFamilia(
  valores: IndicatorValue[],
  familia: ConprelFamilia,
  estadoAusencia: ConprelEstadoFila,
  presente: boolean,
): ConprelIndicadorFila[] {
  const defs = conprelSlugsForFamilia(familia)
  const defFamilia = familia === 'ppto' ? CONPREL_PPTO_2025 : CONPREL_LIQ_2024
  const estado: ConprelEstadoFila = presente ? 'presente' : estadoAusencia

  const origen = valores.filter((v) => {
    if (!esConprel(v)) return false
    if (familiaDeSlug(slugOf(v)) !== familia) return false
    return (v.dimensiones?.ambito ?? 'municipio') === 'municipio'
  })

  // Capítulos expuestos: 1 y 2 (§5); si el envelope no trae cdcta, se usan todas.
  const conCapitulo = origen.filter((v) => {
    const c = v.dimensiones?.cdcta
    return c === '1' || c === '2'
  })
  const base = conCapitulo.length > 0 ? conCapitulo : origen

  if (!presente || base.length === 0) {
    // Ausencia: una fila ND por magnitud de la familia (sin inventar 0).
    return defs.map((def) => ({
      slug: def.slug,
      nombre: def.nombre,
      magnitud: MAGNITUD_LABEL[def.slug] ?? def.slug,
      ejercicio: defFamilia.ejercicio,
      cdcta: '—',
      tipreig: '—',
      concepto: CONPREL_AUSENCIA_TEXTO,
      periodo: `${defFamilia.ejercicio} · ${defFamilia.etiqueta}`,
      unidad: def.unidad,
      fuente: `${CONPREL_SOURCE_ORGANISMO} · ${CONPREL_SOURCE_NOMBRE}`,
      definicion: CONPREL_DEFINICIONES[def.slug] ?? def.evidencia,
      valor: null,
      ausente: true,
      esCeroPublicado: false,
      estado,
    }))
  }

  // Deduplicar por slug+cdcta+tipreig (primer valor real; el 0 publicado cuenta).
  const seen = new Set<string>()
  const filas: ConprelIndicadorFila[] = []
  for (const v of base) {
    const slug = slugOf(v)
    const def = CONPREL_SLUGS.find((s) => s.slug === slug)
    if (!def) continue
    if (!isRealValue(v.valor_numerico)) continue
    const cdcta = v.dimensiones?.cdcta ?? '—'
    const tipreig = v.dimensiones?.tipreig ?? '—'
    const key = `${slug}|${cdcta}|${tipreig}`
    if (seen.has(key)) continue
    seen.add(key)
    filas.push({
      slug,
      nombre: def.nombre,
      magnitud: MAGNITUD_LABEL[slug] ?? def.slug,
      ejercicio: defFamilia.ejercicio,
      cdcta,
      tipreig,
      concepto: conceptoDe(cdcta, tipreig),
      periodo: `${defFamilia.ejercicio} · ${defFamilia.etiqueta}`,
      unidad: def.unidad,
      fuente: v.source
        ? `${(v.source as unknown as { organismo?: string }).organismo ?? CONPREL_SOURCE_ORGANISMO} · ${(v.source as unknown as { nombre?: string }).nombre ?? CONPREL_SOURCE_NOMBRE}`
        : `${CONPREL_SOURCE_ORGANISMO} · ${CONPREL_SOURCE_NOMBRE}`,
      definicion: CONPREL_DEFINICIONES[slug] ?? def.evidencia,
      valor: v.valor_numerico,
      ausente: false,
      esCeroPublicado: v.valor_numerico === 0,
      estado: 'presente',
    })
  }
  // Orden: capítulo 1 antes que 2; magnitudes en orden de definición.
  const ordenSlug = new Map(defs.map((d, i) => [d.slug, i]))
  filas.sort((a, b) => {
    if (a.cdcta !== b.cdcta) return a.cdcta === '1' ? -1 : b.cdcta === '1' ? 1 : 0
    return (ordenSlug.get(a.slug) ?? 99) - (ordenSlug.get(b.slug) ?? 99)
  })
  // Si el filtro anterior dejó vacío (presente pero sin filas válidas), ND.
  if (filas.length === 0) {
    return defs.map((def) => ({
      slug: def.slug,
      nombre: def.nombre,
      magnitud: MAGNITUD_LABEL[def.slug] ?? def.slug,
      ejercicio: defFamilia.ejercicio,
      cdcta: '—',
      tipreig: '—',
      concepto: CONPREL_AUSENCIA_TEXTO,
      periodo: `${defFamilia.ejercicio} · ${defFamilia.etiqueta}`,
      unidad: def.unidad,
      fuente: `${CONPREL_SOURCE_ORGANISMO} · ${CONPREL_SOURCE_NOMBRE}`,
      definicion: CONPREL_DEFINICIONES[def.slug] ?? def.evidencia,
      valor: null,
      ausente: true,
      esCeroPublicado: false,
      estado,
    }))
  }
  return filas
}

function textoCruce(
  estado: ConprelCruceEstado,
  pptoPresente: boolean,
  liqPresente: boolean,
): string {
  const ppto = pptoPresente
    ? 'Presupuestos 2025: dato publicado.'
    : 'Presupuestos 2025: ND — no consta registro municipal en el fichero consultado.'
  const liq = liqPresente
    ? 'Liquidaciones 2024: dato publicado.'
    : 'Liquidaciones 2024: ND — no consta registro municipal en el fichero consultado.'
  switch (estado) {
    case 'S1':
    case 'S2':
    case 'S4':
      return `${ppto} ${liq}`
    case 'S3':
      return (
        'ND en presupuestos 2025 y liquidaciones 2024: no consta registro municipal en los ' +
        'ficheros consultados.'
      )
  }
}

function familia(
  f: ConprelFamilia,
  presente: boolean,
  estadoAusencia: ConprelEstadoFila,
  valores: IndicatorValue[],
): ConprelFamiliaPresentacion {
  const def = f === 'ppto' ? CONPREL_PPTO_2025 : CONPREL_LIQ_2024
  return {
    familia: f,
    titulo: f === 'ppto' ? 'Presupuestos (PPTO-2025)' : 'Liquidaciones (LIQ-2024)',
    ejercicio: def.ejercicio,
    tableId: def.tableId,
    etiquetaCorte: def.etiqueta === 'definitiva_publicacion' ? 'definitiva de publicación' : def.etiqueta,
    coberturaTexto: conprelCoberturaTexto(f),
    fuente: `${CONPREL_SOURCE_ORGANISMO} · ${CONPREL_SOURCE_NOMBRE}`,
    fuenteUrl: def.url,
    pie: f === 'ppto' ? CONPREL_PIE_PPTO : CONPREL_PIE_LIQ,
    presente,
    estadoFamilia: presente ? 'presente' : estadoAusencia,
    filas: filasDeFamilia(valores, f, estadoAusencia, presente),
    ausenciaTexto: CONPREL_AUSENCIA_TEXTO,
  }
}

/**
 * Construye la presentación CONPREL del municipio.
 *
 * Devuelve `null` cuando el flag está OFF o no hay dataset cargado (ni filas
 * R2 `conprel_*` ni fixture mock): en ese caso la UI no debe inventar ND.
 *
 * `datasetCargado=true` con familias ausentes = estados S1/S2/S3 reales.
 */
export function buildConprelPresentacion(
  valores: IndicatorValue[],
  codigoINE: string,
): ConprelPresentacion | null {
  const conprelRows = valores.filter(esConprel)
  const mockFx = isConprelMockEnabled() ? conprelMockFixture(codigoINE) : null
  const pptoPresente =
    conprelRows.some((v) => familiaDeSlug(slugOf(v)) === 'ppto') || mockFx?.ppto === true
  const liqPresente =
    conprelRows.some((v) => familiaDeSlug(slugOf(v)) === 'liq') || mockFx?.liq === true
  const datasetCargado = conprelRows.length > 0 || mockFx !== null
  if (!datasetCargado) return null

  const cruce: ConprelCruceEstado =
    pptoPresente && liqPresente
      ? 'S4'
      : pptoPresente
        ? 'S1'
        : liqPresente
          ? 'S2'
          : 'S3'

  const estadoAusenciaPpto: ConprelEstadoFila =
    cruce === 'S3' ? 'ausente_ambos_definitivos' : 'ausente_fichero_ppto2025'
  const estadoAusenciaLiq: ConprelEstadoFila =
    cruce === 'S3' ? 'ausente_ambos_definitivos' : 'ausente_fichero_liq2024'

  const notas: string[] = []
  const territorial = notaTerritorial(codigoINE)
  if (territorial) notas.push(territorial)
  const ceutaMelilla = notaCeutaMelilla(codigoINE)
  if (ceutaMelilla) notas.push(ceutaMelilla)

  return {
    codigoINE,
    datasetCargado,
    cruce,
    cruceTexto: textoCruce(cruce, pptoPresente, liqPresente),
    ppto: familia('ppto', pptoPresente, estadoAusenciaPpto, valores),
    liq: familia('liq', liqPresente, estadoAusenciaLiq, valores),
    notasTerritoriales: notas,
    notaSerie: CONPREL_NOTA_SERIE,
    notaNd: CONPREL_NOTA_ND,
    notaAntiComparacion: CONPREL_NOTA_ANTI_COMPARACION,
  }
}
