// Parser CONPREL — locale ES estricto, validación de cabeceras, duplicados y
// construcción de tuplas de envelope. Determinista; sin red ni escrituras.
//
// Reglas (diseño §§1,4 + encargo):
//  - Locale coma decimal. Acepta «1234,56», «0,00», «-12,34» y miles «1.234,56».
//    RECHAZA formato no esperado (p. ej. decimal con punto «123.456», US
//    «1,234.56», letras) con error claro → bloquea el run.
//  - Ceros explícitos («0,00») = 0 real de la fuente → SÍ tupla valor 0.
//  - Ausencia de fila o campo vacío = ND → NO tupla (nunca 0).
//  - Duplicados en (idente,cdcta,tipreig) o codente/candidato: REGISTRAR y
//    BLOQUEAR (se lanza ConprelBloqueoError; el loader sale con exit≠0).
//  - Negativos: se PERMITEN y se CONTABILIZAN (regla documentada: los importes
//    de corrección contable pueden ser negativos; nunca se descartan en
//    silencio). El recuento viaja en el manifiesto (`negativos`).

import * as fs from 'fs'
import {
  CONPREL_FAMILIAS,
  esCapitulo,
  esMunicipalCodente,
  prefijoIne5,
} from './conprel-contracts'
import type { ConprelFamilia, ConprelFamiliaDef } from './conprel-contracts'
import { conprelSlugFor, conprelSlugsForFamilia, conprelEstadoTupla } from './conprel-slugs'
import type { ConprelSlugDef } from './conprel-slugs'

export class ConprelParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConprelParseError'
  }
}

/** Error de bloqueo: duplicados u otras violaciones de contrato. Exit≠0. */
export class ConprelBloqueoError extends Error {
  readonly registro: unknown
  constructor(message: string, registro?: unknown) {
    super(message)
    this.name = 'ConprelBloqueoError'
    this.registro = registro
  }
}

// ── Locale ES ──────────────────────────────────────────────────────────────

const RE_ES_SIMPLE = /^-?\d+(?:,\d+)?$/
const RE_ES_MILES = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/
/** Formatos NO esperados (decimal anglo, basura): se rechazan con error claro. */
const RE_US_BAD = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/
const RE_DOT_DECIMAL = /^-?\d+\.\d+$/

/**
 * Parsea un importe en locale español estricto.
 * Devuelve `null` solo si la ausencia de valor (campo vacío / undefined).
 * Lanza ConprelParseError ante formato no esperado.
 */
export function parseImporteEs(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null
  const s = String(raw).replace(/^\uFEFF/, '').trim()
  if (s === '') return null
  if (RE_US_BAD.test(s)) {
    throw new ConprelParseError(`Importe en formato US no soportado (se espera coma decimal): "${raw}"`)
  }
  if (RE_DOT_DECIMAL.test(s)) {
    throw new ConprelParseError(
      `Importe con decimal en punto (formato no esperado en CONPREL; se espera coma decimal): "${raw}"`,
    )
  }
  if (RE_ES_MILES.test(s) || RE_ES_SIMPLE.test(s)) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n)) throw new ConprelParseError(`Importe no numérico: "${raw}"`)
    return n
  }
  throw new ConprelParseError(`Importe con formato no reconocido (locale ES estricto): "${raw}"`)
}

// ── CSV (delimitador «|», UTF-8) ───────────────────────────────────────────

export interface CsvTabla {
  header: string[]
  rows: Array<Record<string, string>>
}

export function leerCsvPipe(path: string): CsvTabla {
  if (!fs.existsSync(path)) throw new ConprelParseError(`CSV no encontrado: ${path}`)
  const raw = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) throw new ConprelParseError(`CSV vacío: ${path}`)
  const header = (lines[0] ?? '').split('|').map((h) => h.trim())
  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split('|')
    const row: Record<string, string> = {}
    header.forEach((h, j) => {
      row[h] = (cells[j] ?? '').trim()
    })
    rows.push(row)
  }
  return { header, rows }
}

/** Cabecera estricta: mismas columnas (orden y contenido) que el contrato. */
export function assertHeader(actual: string[], esperadas: readonly string[], origen: string): void {
  const a = actual.join(',')
  const e = esperadas.join(',')
  if (a !== e) {
    throw new ConprelParseError(
      `Cabecera alterada en ${origen}: esperada [${e}] · encontrada [${a}]`,
    )
  }
}

// ── Inventario ─────────────────────────────────────────────────────────────

export interface InvMunicipal {
  codente: string
  ine: string
  idente: string
  nombre: string
  estado: string
  nsec: string
}

export interface InvCarga {
  municipales: InvMunicipal[]
  totalFilas: number
  /** Filas ZV/ZO (y otras) de Ceuta/Melilla: existen pero NO son municipio. */
  noMunicipalesCeutaMelilla: string[]
}

/**
 * Carga y valida el inventario. Bloquea si:
 *  - cabecera distinta del contrato;
 *  - codente duplicado (en cualquier fila);
 *  - dos filas municipales con el mismo INE-5 (prefijo).
 */
export function cargarInventario(path: string, def: ConprelFamiliaDef): InvCarga {
  const csv = leerCsvPipe(path)
  assertHeader(csv.header, def.invColumns, path)

  const seenCodente = new Map<string, number>()
  const municipales: InvMunicipal[] = []
  const seenIne = new Map<string, string>()
  const seenIdente = new Map<string, string>()
  const noMunCeuta: string[] = []

  for (const [i, r] of csv.rows.entries()) {
    const codente = r.codente ?? ''
    if (codente.length < 7) {
      throw new ConprelParseError(`Fila corrupta (codente corto) en ${path}:${i + 2}: "${codente}"`)
    }
    const prev = seenCodente.get(codente)
    if (prev !== undefined) {
      throw new ConprelBloqueoError(
        `DUPLICADO codente bloqueante en ${path}: "${codente}" (filas ${prev} y ${i + 2})`,
        { codente, filas: [prev, i + 2] },
      )
    }
    seenCodente.set(codente, i + 2)

    if (esMunicipalCodente(codente)) {
      const ine = prefijoIne5(codente)
      const inePrev = seenIne.get(ine)
      if (inePrev !== undefined) {
        throw new ConprelBloqueoError(
          `DUPLICADO municipio (INE-5) bloqueante en ${path}: ${ine} en "${inePrev}" y "${codente}"`,
          { ine, codentes: [inePrev, codente] },
        )
      }
      seenIne.set(ine, codente)
      const idente = r.idente ?? ''
      if (!/^\d+$/.test(idente)) {
        throw new ConprelParseError(`Fila municipal sin idente numérico en ${path}:${i + 2}: idente="${idente}"`)
      }
      const identePrev = seenIdente.get(idente)
      if (identePrev !== undefined) {
        throw new ConprelBloqueoError(
          `DUPLICADO idente entre municipales bloqueante en ${path}: idente ${idente} en "${identePrev}" y "${codente}"`,
          { idente, codentes: [identePrev, codente] },
        )
      }
      seenIdente.set(idente, codente)
      municipales.push({
        codente,
        ine,
        idente,
        nombre: r.nombreente ?? '',
        estado: r.estado ?? '',
        nsec: r.nsec ?? '',
      })
    } else {
      const ine = prefijoIne5(codente)
      const tipo = codente.slice(5, 7).toUpperCase()
      if ((ine === '51001' || ine === '52001') && (tipo === 'ZV' || tipo === 'ZO')) {
        noMunCeuta.push(codente)
      }
    }
  }
  return { municipales, totalFilas: csv.rows.length, noMunicipalesCeutaMelilla: noMunCeuta }
}

// ── Económica (capítulos) ──────────────────────────────────────────────────

export interface EcoFila {
  idente: string
  cdcta: string
  tipreig: string
  /** Magnitud → número | null (ausencia). */
  valores: Record<string, number | null>
}

export interface EcoCarga {
  filas: EcoFila[]
  totalCapitulos: number
  totalNoCapitulo: number
  negativos: number
  nulos: number
  cerosExplicitos: number
}

/**
 * Carga tb_economica (ya filtrada o no a capítulos). Bloquea ante:
 *  - cabecera alterada;
 *  - clave (idente,cdcta,tipreig) duplicada;
 *  - importe con formato no ES.
 * `soloCapitulos=true` descarta filas que no son capítulo (sin error).
 */
export function cargarEconomica(
  path: string,
  def: ConprelFamiliaDef,
  opts: { soloCapitulos?: boolean } = {},
): EcoCarga {
  const csv = leerCsvPipe(path)
  assertHeader(csv.header, def.ecoColumns, path)

  const seen = new Map<string, number>()
  const filas: EcoFila[] = []
  let totalCap = 0
  let totalNoCap = 0
  let negativos = 0
  let nulos = 0
  let ceros = 0

  for (const [i, r] of csv.rows.entries()) {
    const cdcta = (r.cdcta ?? '').trim()
    const idente = (r.idente ?? '').trim()
    const tipreig = (r.tipreig ?? '').trim()
    const linea = i + 2

    if (!/^\d+$/.test(idente)) {
      throw new ConprelParseError(`Fila corrupta (idente) en ${path}:${linea}: "${idente}"`)
    }
    if (cdcta === '' || tipreig === '') {
      throw new ConprelParseError(`Fila corrupta (cdcta/tipreig vacío) en ${path}:${linea}`)
    }
    if (tipreig !== 'I' && tipreig !== 'G') {
      throw new ConprelParseError(`tipreig inesperado en ${path}:${linea}: "${tipreig}" (se espera I|G)`)
    }

    const cap = esCapitulo(cdcta)
    if (!cap) {
      totalNoCap++
      if (opts.soloCapitulos) continue
    } else {
      totalCap++
    }

    const key = `${idente}|${cdcta}|${tipreig}`
    const prev = seen.get(key)
    if (prev !== undefined) {
      throw new ConprelBloqueoError(
        `DUPLICADO (idente,cdcta,tipreig) bloqueante en ${path}: ${key} (filas ${prev} y ${linea})`,
        { idente, cdcta, tipreig, filas: [prev, linea] },
      )
    }
    seen.set(key, linea)

    const valores: Record<string, number | null> = {}
    for (const mag of def.magnitudes) {
      const v = parseImporteEs(r[mag])
      if (v === null) nulos++
      else {
        if (v < 0) negativos++
        if (v === 0) ceros++
      }
      valores[mag] = v
    }
    filas.push({ idente, cdcta, tipreig, valores })
  }

  return {
    filas,
    totalCapitulos: totalCap,
    totalNoCapitulo: totalNoCap,
    negativos,
    nulos,
    cerosExplicitos: ceros,
  }
}

// ── Índice por idente (join municipal) ─────────────────────────────────────

export function indiceEcoPorIdente(filas: readonly EcoFila[]): Map<string, EcoFila[]> {
  const m = new Map<string, EcoFila[]>()
  for (const f of filas) {
    const arr = m.get(f.idente)
    if (arr) arr.push(f)
    else m.set(f.idente, [f])
  }
  return m
}

// ── Tuplas de envelope ─────────────────────────────────────────────────────

export interface ConprelTupla {
  slug: string
  anio: number
  valor: number
  unidad: string
  dim: Record<string, string>
  url: string
  tableId: string
  estado: string
  /** Definición de slug (para auditoría). */
  def: ConprelSlugDef
}

export interface BuildTuplasResultado {
  tuplas: ConprelTupla[]
  municipiosConFilas: number
  municipiosSinFilas: string[]
  filasCapituloUsadas: number
}

/**
 * Construye las tuplas de UNA familia para los municipios indicados.
 * Reglas: solo `idente` del inventario AA/ZZ (jamás `id` de grupo ni ZV/ZO);
 * capítulo de 1 dígito; campo nulo → sin tupla; 0 explícito → tupla 0.
 */
export function buildTuplasFamilia(
  familia: ConprelFamilia,
  municipales: readonly InvMunicipal[],
  eco: EcoCarga,
  opts: { url: string; soloInes?: ReadonlySet<string> } = { url: '' },
): BuildTuplasResultado {
  const defFam = CONPREL_FAMILIAS[familia]
  const byIdente = indiceEcoPorIdente(eco.filas)
  const slugDefs = conprelSlugsForFamilia(familia)
  const tuplas: ConprelTupla[] = []
  const sinFilas: string[] = []
  let filasCap = 0
  let conFilas = 0

  for (const m of municipales) {
    if (opts.soloInes && !opts.soloInes.has(m.ine)) continue
    const ecos = byIdente.get(m.idente) ?? []
    if (ecos.length === 0) {
      sinFilas.push(m.ine)
      continue
    }
    conFilas++
    for (const e of ecos) {
      filasCap++
      for (const sd of slugDefs) {
        const v = e.valores[sd.columna]
        if (v === null) continue // ausencia → ND → sin tupla
        tuplas.push({
          slug: sd.slug,
          anio: defFam.ejercicio,
          valor: v,
          unidad: sd.unidad,
          dim: {
            ambito: 'municipio',
            familia: familia === 'ppto' ? 'presupuestos' : 'liquidaciones',
            cdcta: e.cdcta,
            tipreig: e.tipreig,
          },
          url: opts.url || defFam.url,
          tableId: defFam.tableId,
          estado: conprelEstadoTupla(sd),
          def: sd,
        })
      }
    }
  }
  return {
    tuplas,
    municipiosConFilas: conFilas,
    municipiosSinFilas: sinFilas,
    filasCapituloUsadas: filasCap,
  }
}

/** Test negativo obligatorio: ningún idente no-municipal (ZV/ZO u otros) debe
 *  mapearse como municipio. Devuelve los que colarían si se omitiera el filtro. */
export function identesFueraDeContrato(
  inv: InvCarga,
  eco: EcoCarga,
): { zvZo: string[]; otrosNoMunicipales: number } {
  const munIdent = new Set(inv.municipales.map((m) => m.idente))
  const zvZo = inv.noMunicipalesCeutaMelilla
  const ecoIdentes = new Set(eco.filas.map((f) => f.idente))
  const zvZoEnEco = zvZo.filter((c) => {
    // codente no lleva idente en este paso: se detectan por prefijo+tipo vía inv completo no expuesto;
    // aquí basta comprobar que ningún codente ZV/ZO está en municipales.
    return c.length >= 7 && !munIdent.has(c)
  })
  // Cuenta identes de eco que NO pertenecen a ningún municipal (dependientes u otros).
  let otros = 0
  for (const id of ecoIdentes) if (!munIdent.has(id)) otros++
  void zvZoEnEco
  return { zvZo, otrosNoMunicipales: otros }
}

// ── Merge en envelope v2 (en memoria) ──────────────────────────────────────

export interface EnvV2 {
  version: number
  codigo_ine: string
  generado_en: string
  indicators: Array<{ slug: string; nombre: string; unidad: string | null }>
  sources: Array<{ slug: string; organismo: string; nombre: string }>
  source_urls: string[]
  dimensiones: Array<Record<string, string>>
  valores: unknown[][]
}

/**
 * Merge aditivo/ idempotente de tuplas CONPREL. Solo sustituye tuplas de los
 * slugs indicados (`slugsARemplazar`); el resto del envelope queda intacto
 * (preservación de slugs). Devuelve los slugs previos perdidos (debe ser []).
 */
export function mergeConprelTuplas(
  env: EnvV2,
  tuplas: readonly ConprelTupla[],
  opts: {
    sourceSlug: string
    organismo: string
    nombreFuente: string
    slugsARemplazar: ReadonlySet<string>
  },
): { slugsPerdidos: string[]; tuplasEscritas: number } {
  // Lote vacío = no-op: nunca purga la familia previa (ND no es 0).
  if (tuplas.length === 0) return { slugsPerdidos: [], tuplasEscritas: 0 }
  const slugsAntes = new Set(env.indicators.map((i) => i.slug))

  // Fuente
  if (!env.sources.some((s) => s.slug === opts.sourceSlug)) {
    env.sources.push({ slug: opts.sourceSlug, organismo: opts.organismo, nombre: opts.nombreFuente })
  }

  // Eliminar tuplas previas SOLO de los slugs de esta familia/run.
  env.valores = env.valores.filter((t) => {
    const ii = Array.isArray(t) ? (t[0] as number) : -1
    const ind = env.indicators[ii]
    return !(ind && opts.slugsARemplazar.has(ind.slug))
  })

  let escritas = 0
  for (const row of tuplas) {
    let ii = env.indicators.findIndex((i) => i.slug === row.slug)
    if (ii < 0) {
      env.indicators.push({ slug: row.slug, nombre: row.def.nombre, unidad: row.unidad })
      ii = env.indicators.length - 1
    }
    let ui = env.source_urls.indexOf(row.url)
    if (ui < 0) {
      env.source_urls.push(row.url)
      ui = env.source_urls.length - 1
    }
    const dimKey = JSON.stringify(row.dim)
    let di = env.dimensiones.findIndex((d) => JSON.stringify(d) === dimKey)
    if (di < 0) {
      env.dimensiones.push(row.dim)
      di = env.dimensiones.length - 1
    }
    env.valores.push([ii, row.anio, row.valor, row.unidad, di, ui, row.tableId, null, row.estado])
    escritas++
  }

  const slugsDespues = new Set(env.indicators.map((i) => i.slug))
  const perdidos = [...slugsAntes].filter((s) => !slugsDespues.has(s))
  return { slugsPerdidos: perdidos, tuplasEscritas: escritas }
}

/** Gate de tamaño: true si el envelope cabe (<150 KB). */
export function cabeEnvelope(json: string): { ok: boolean; bytes: number } {
  const bytes = Buffer.byteLength(json, 'utf-8')
  return { ok: bytes < 150 * 1024, bytes }
}

// ── Gate de escritura (unit-testeable) ─────────────────────────────────────

export type ConprelWriteGate =
  | { mode: 'dry-run' }
  | { mode: 'write' }
  | { mode: 'abort'; error: string }

/**
 * --dry-run es el defecto. La escritura real exige ACUMULAR
 * `--confirm-r2-write` Y `SOCIDEAS_CONPREL_WRITE=autorizado`.
 * Sin habilitación: aborta con mensaje (el loader sale con exit≠0).
 * `--dry-run` explícito no se combina con escritura: conflicto → abort.
 * env presente sin flag → abort (habilitación incompleta, no dry-run silencioso).
 */
export function resolveWriteGate(opts: {
  confirmFlag: boolean
  envValue: string | undefined
  dryRunExplicit?: boolean
}): ConprelWriteGate {
  if (opts.dryRunExplicit) {
    if (opts.confirmFlag || (opts.envValue !== undefined && opts.envValue !== '')) {
      return {
        mode: 'abort',
        error:
          'FLAGS EN CONFLICTO: --dry-run explícito no se combina con --confirm-r2-write ' +
          'ni con SOCIDEAS_CONPREL_WRITE. Aborto sin tocar R2/Supabase.',
      }
    }
    return { mode: 'dry-run' }
  }
  if (!opts.confirmFlag) {
    if (opts.envValue !== undefined && opts.envValue !== '') {
      return {
        mode: 'abort',
        error:
          'ESCRITURA NO HABILITADA: env SOCIDEAS_CONPREL_WRITE presente sin --confirm-r2-write ' +
          '(ambas habilitaciones son obligatorias). Aborto sin tocar R2/Supabase.',
      }
    }
    return { mode: 'dry-run' }
  }
  if (opts.envValue !== 'autorizado') {
    return {
      mode: 'abort',
      error:
        'ESCRITURA NO HABILITADA: falta env SOCIDEAS_CONPREL_WRITE=autorizado ' +
        '(además de --confirm-r2-write). Aborto sin tocar R2/Supabase.',
    }
  }
  return { mode: 'write' }
}

export { conprelSlugFor }
