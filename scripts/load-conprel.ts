/**
 * LOADER CONPREL �  envelopes R2 v2 (dry-run por defecto; escritura gateada).
 *
 * Misión integral SOCideas · Agente B. Baseline: docs/conprel-integracion-
 * partial-diseno.md (contratos §§1-4,7) y docs/presupuestos-municipales-
 * fuente-decision.md §11. Parser de referencia: scripts/simular-conprel-
 * envelopes.ts. Patrón de loader: scripts/load-aeat-irpf-municipal.ts.
 *
 * Ficheros de datos (temp, fuera del repo):
 *   %TEMP%/opencode/conprel/*.zip|*.accdb  (descarga oficial con reintentos)
 *   %TEMP%/opencode/conprel/csv/loader_*.csv (ACE� CSV, columnas mínimas)
 *
 * FLAGS (dry-run es el defecto; selección estratificada):
 *   --dry-run              modo por defecto (implícito si no hay escritura)
 *   --familia=ppto|liq     familia a procesar (repetible; default: ambas si hay flags de alcance)
 *   --muestra              fixtures qa-fixtures MUESTRA_COBERTURA (14 INE)
 *   --all-ppto             todos los candidatos PPTO-2025 (esperados 7.345)
 *   --all-liq              todos los candidatos LIQ-2024  (esperados 6.861)
 *   --ausentes             catálogo sin fila AA/ZZ en la familia (requiere Supabase read)
 *   --provincias=01,31,48,20,51,52
 *                          select por prefijo INE (Álava, Navarra, Bizkaia,
 *                          Gipuzkoa, Ceuta, Melilla)
 *   --colisiones           las ~50 divergencias de nombre: join por C�DIGO,
 *                          verificar que el INE no cambia
 *   --size-full            medición de tamaño de población COMPLETA (R2 lectura
 *                          pública, concurrencia 15): familia única + combinado
 *   --extract              fuerza reextracción ACE aunque existan CSV
 *   --confirm-r2-write     ACUMULAR con env SOCIDEAS_CONPREL_WRITE=autorizado
 *                          para escritura real (NO habilitado en esta misión)
 *
 * Uso típico:
 *   npx tsx scripts/load-conprel.ts --muestra --familia=ppto
 *   npx tsx scripts/load-conprel.ts --all-ppto
 *   npx tsx scripts/load-conprel.ts --all-liq
 *   npx tsx scripts/load-conprel.ts --size-full --all-ppto --all-liq
 *   npx tsx scripts/load-conprel.ts --colisiones --ausentes --familia=ppto
 *
 * NUNCA escribe R2/Supabase en dry-run. El modo escritura exige ambas
 * habilitaciones y NO debe ejecutarse en esta misión.
 */

import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  CONPREL_FAMILIAS,
  CONPREL_MAX_ENVELOPE_BYTES,
  CONPREL_PARSER_VERSION,
} from '../src/lib/conprel-contracts'
import type { ConprelFamilia } from '../src/lib/conprel-contracts'
import { CONPREL_SLUGS } from '../src/lib/conprel-slugs'
import {
  ConprelBloqueoError,
  ConprelParseError,
  buildTuplasFamilia,
  cabeEnvelope,
  cargarEconomica,
  cargarInventario,
  mergeConprelTuplas,
  resolveWriteGate,
  identesFueraDeContrato,
} from '../src/lib/conprel-parser'
import type { EcoCarga, EnvV2, InvCarga } from '../src/lib/conprel-parser'
import {
  CONPREL_R2_READ_CONCURRENCY,
  CONPREL_SOURCE_NOMBRE,
  CONPREL_SOURCE_ORGANISMO,
  CONPREL_SOURCE_SLUG,
} from '../src/lib/conprel-contracts'
import { extraerFamilia, prepararFuentes } from '../src/lib/conprel-extract'
import { MUESTRA_COBERTURA } from './qa-fixtures'
import {
  buildRevalidationAuditRow,
  revalidateAfterWrites,
  shouldRevalidate,
} from '../src/lib/socideas-revalidate'

config({ path: '.env.local' })

// ���� Args ��������������������������������������������������������������������������������������������������������������������������������������

interface Args {
  dryRun: boolean
  dryRunExplicit: boolean
  familias: ConprelFamilia[]
  muestra: boolean
  allPpto: boolean
  allLiq: boolean
  ausentes: boolean
  provincias: string[] | null
  colisiones: boolean
  sizeFull: boolean
  extract: boolean
  confirmWrite: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    dryRun: true,
    dryRunExplicit: false,
    familias: [],
    muestra: false,
    allPpto: false,
    allLiq: false,
    ausentes: false,
    provincias: null,
    colisiones: false,
    sizeFull: false,
    extract: false,
    confirmWrite: false,
  }
  for (const raw of argv) {
    if (raw === '--dry-run') {
      a.dryRun = true
      a.dryRunExplicit = true
    } else if (raw === '--muestra') a.muestra = true
    else if (raw === '--all-ppto') a.allPpto = true
    else if (raw === '--all-liq') a.allLiq = true
    else if (raw === '--ausentes') a.ausentes = true
    else if (raw === '--colisiones') a.colisiones = true
    else if (raw === '--size-full') a.sizeFull = true
    else if (raw === '--extract') a.extract = true
    else if (raw === '--confirm-r2-write') a.confirmWrite = true
    else if (raw.startsWith('--familia=')) {
      const f = raw.slice('--familia='.length)
      if (f !== 'ppto' && f !== 'liq') throw new Error(`--familia inválido: ${f}`)
      a.familias.push(f)
    } else if (raw.startsWith('--provincias=')) {
      a.provincias = raw
        .slice('--provincias='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.padStart(2, '0'))
    } else if (raw === '--help' || raw === '-h') {
      console.log('Ver cabecera del fichero para flags. --dry-run es el defecto.')
      process.exit(0)
    } else {
      throw new Error(`Flag desconocido: ${raw}`)
    }
  }
  if (a.allPpto && !a.familias.includes('ppto')) a.familias.push('ppto')
  if (a.allLiq && !a.familias.includes('liq')) a.familias.push('liq')
  // Alcance por defecto si no se indicó familia: ambas familias con datos.
  if (a.familias.length === 0) a.familias = ['ppto', 'liq']
  // Selección de alcance por defecto: muestra (seguro).
  if (!a.muestra && !a.allPpto && !a.allLiq && !a.sizeFull && !a.ausentes && !a.colisiones && a.provincias === null) {
    a.muestra = true
  }
  return a
}

// ���� Catálogo (solo lectura Supabase) ������������������������������������������������������������������������������

interface Catalogo {
  nombres: Map<string, string>
  porProvincia: Map<string, string[]> // prov2 �  ines
}

async function cargarCatalogo(): Promise<Catalogo> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan claves Supabase en .env.local (solo lectura)')
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const nombres = new Map<string, string>()
  const porProvincia = new Map<string, string[]>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('municipios')
      .select('codigo_ine, nombre')
      .order('codigo_ine')
      .range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ codigo_ine: string; nombre: string }>) {
      const ine = r.codigo_ine.trim()
      nombres.set(ine, r.nombre)
      const prov = ine.slice(0, 2)
      const arr = porProvincia.get(prov) ?? []
      arr.push(ine)
      porProvincia.set(prov, arr)
    }
    if ((data ?? []).length < 1000) break
  }
  return { nombres, porProvincia }
}

// ���� R2 lectura pública ����������������������������������������������������������������������������������������������������������

const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
).replace(/\/$/, '')

async function fetchEnvelopePublico(ine: string): Promise<EnvV2 | null> {
  let last = 'sin-intento'
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json', 'User-Agent': 'URBIdeas-conprel-loader/1.0' },
        cache: 'no-store',
      })
      if (r.status === 404) {
        // Confirmar con un reintento: r2.dev puede devolver 404 transitorio bajo carga.
        if (attempt < 4) {
          await sleep(200 * attempt)
          continue
        }
        fetchFallos.set(ine, '404')
        return null
      }
      if (r.status !== 200) {
        last = `HTTP ${r.status}`
        if (attempt < 4) {
          await sleep(400 * attempt)
          continue
        }
        break
      }
      const j = (await r.json()) as EnvV2
      if (!j || j.codigo_ine !== ine || !Array.isArray(j.valores)) {
        last = `payload-inválido codigo_ine=${String(j?.codigo_ine)}`
        if (attempt < 4) {
          await sleep(400 * attempt)
          continue
        }
        break
      }
      return j
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
      if (attempt < 4) {
        await sleep(600 * attempt)
        continue
      }
    }
  }
  fetchFallos.set(ine, last)
  return null
}

/** Diagnóstico de envelopes no hallados (para distinguir 404 real de fallo de red). */
const fetchFallos = new Map<string, string>()

async function mapConcurrencia<T>(
  items: readonly T[],
  conc: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.max(1, conc) }, async () => {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      await fn(items[idx]!, idx)
    }
  })
  await Promise.all(workers)
}

/** Pausa corta entre tandas para no saturar el R2 público (r2.dev). */
const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms))

// ���� Datos por familia ������������������������������������������������������������������������������������������������������������

interface FamiliaDatos {
  familia: ConprelFamilia
  inv: InvCarga
  eco: EcoCarga
  invPath: string
  ecoPath: string
}

const normNombre = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

async function cargarDatos(
  familias: readonly ConprelFamilia[],
  extract: boolean,
): Promise<Map<ConprelFamilia, FamiliaDatos>> {
  const out = new Map<ConprelFamilia, FamiliaDatos>()
  // Manifiesto de fuentes por run (zip sha256 / URL / bytes).
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + '-' + Math.random().toString(36).slice(2, 7)
  const man = await prepararFuentes(familias, runId)
  const manPath = path.join(process.cwd(), 'tmp', `conprel-manifest-${runId}.json`)
  fs.mkdirSync(path.dirname(manPath), { recursive: true })
  fs.writeFileSync(manPath, JSON.stringify({ ...man, estado: 'preparado' }, null, 2))
  console.log(`Manifest fuentes: ${path.relative(process.cwd(), manPath)}`)

  for (const f of familias) {
    const def = CONPREL_FAMILIAS[f]
    const ext = await extraerFamilia(f, { force: extract })
    console.log(
      `Extracción ${f}: inv=${ext.invFilas} eco=${ext.ecoFilas} cap=${ext.ecoCapitulos} ` +
        `filtroSQL=${ext.filtroCapituloSql} (${ext.ms} ms)`,
    )
    const inv = cargarInventario(ext.invPath, def)
    const eco = cargarEconomica(ext.ecoPath, def, {})
    // Si el SQL no pudo filtrar capítulos, se filtra aquí (mismo predicado).
    // totalNoCapitulo ya se contó en cargarEconomica; solo recortamos filas.
    if (!ext.filtroCapituloSql) {
      eco.filas = eco.filas.filter((r) => /^\d$/.test(r.cdcta))
    }
    const ecoCap = eco
    out.set(f, {
      familia: f,
      inv,
      eco: ecoCap,
      invPath: ext.invPath,
      ecoPath: ext.ecoPath,
    })
    console.log(
      `  inventario: ${inv.totalFilas} filas · municipales(AA+ZZ)=${inv.municipales.length} · ` +
        `eco cap=${ecoCap.totalCapitulos} · negativos=${ecoCap.negativos} · nulos=${ecoCap.nulos} · ceros=${ecoCap.cerosExplicitos}`,
    )
    if (inv.municipales.length === 0) throw new ConprelBloqueoError(`${f}: 0 municipios AA/ZZ`)
    // Actualizar manifiesto con recuentos por familia (duplicados siempre visibles).
    man.estado = 'extraido'
    man.recuentos = {
      ...(man.recuentos ?? {}),
      [f]: {
        invFilas: inv.totalFilas,
        municipales: inv.municipales.length,
        ecoCapitulos: ecoCap.totalCapitulos,
        ecoFilas: ecoCap.filas.length,
        negativos: ecoCap.negativos,
        nulos: ecoCap.nulos,
        cerosExplicitos: ecoCap.cerosExplicitos,
        zvZoExcluidos: inv.noMunicipalesCeutaMelilla,
        duplicados: 0,
      },
    }
    if (!Array.isArray(man.duplicados)) man.duplicados = []
    fs.writeFileSync(manPath, JSON.stringify(man, null, 2))
  }
  return out
}

// ���� Selección de candidatos ������������������������������������������������������������������������������������������������

function seleccionar(
  datos: FamiliaDatos,
  args: Args,
  catalogo: Catalogo | null,
): { ines: string[]; etiqueta: string } {
  const mun = datos.inv.municipales
  let ines: string[]
  let etiqueta: string
  if (args.muestra) {
    const set = new Set(MUESTRA_COBERTURA.map((m) => m.ine))
    ines = mun.map((m) => m.ine).filter((i) => set.has(i))
    etiqueta = 'muestra_fixtures_14'
  } else if (args.allPpto || args.allLiq) {
    // all-* solo amplía la familia; si además hay provincias, se recorta.
    ines = mun.map((m) => m.ine)
    etiqueta = `all_${datos.familia}`
  } else {
    ines = mun.map((m) => m.ine)
    etiqueta = `full_${datos.familia}`
  }
  if (args.provincias) {
    const allowed = new Set(args.provincias)
    ines = ines.filter((i) => allowed.has(i.slice(0, 2)))
    etiqueta += `_prov_${args.provincias.join('-')}`
  }
  void catalogo
  return { ines: [...new Set(ines)].sort(), etiqueta }
}

// ���� Dry-run por INE ����������������������������������������������������������������������������������������������������������������

interface DryRunStats {
  etiqueta: string
  candidatos: number
  conInventario: number
  sinInventario: string[]
  conEco: number
  sinEco: string[]
  tuplas: number
  envelopesOk: number
  sinEnvelopeR2: string[]
  bytesMax: number
  bytesMaxIne: string | null
  sobre150kb: string[]
  slugsPerdidos: string[]
  preservacionOk: number
}

async function dryRunFamilia(
  datos: FamiliaDatos,
  ines: readonly string[],
  etiqueta: string,
  conc = CONPREL_R2_READ_CONCURRENCY,
): Promise<{ stats: DryRunStats; tuplasPorIne: Map<string, ReturnType<typeof buildTuplasFamilia>> }> {
  const def = CONPREL_FAMILIAS[datos.familia]
  const byIne = new Map<string, ReturnType<typeof buildTuplasFamilia>>()
  const munByIne = new Map(datos.inv.municipales.map((m) => [m.ine, m]))
  // Para cada INE, rebuild con solo su fila municipal (idente AA/ZZ).
  for (const ine of ines) {
    const m = munByIne.get(ine)
    if (!m) continue
    byIne.set(
      ine,
      buildTuplasFamilia(datos.familia, [m], datos.eco, { url: def.url }),
    )
  }

  const stats: DryRunStats = {
    etiqueta,
    candidatos: ines.length,
    conInventario: 0,
    sinInventario: [],
    conEco: 0,
    sinEco: [],
    tuplas: 0,
    envelopesOk: 0,
    sinEnvelopeR2: [],
    bytesMax: 0,
    bytesMaxIne: null,
    sobre150kb: [],
    slugsPerdidos: [],
    preservacionOk: 0,
  }

  const slugsFamilia = new Set(
    CONPREL_SLUGS.filter((s) => s.familia === datos.familia).map((s) => s.slug),
  )

  await mapConcurrencia(ines, conc, async (ine) => {
    const m = munByIne.get(ine)
    if (!m) {
      stats.sinInventario.push(ine)
      return
    }
    stats.conInventario++
    const b = byIne.get(ine)!
    if (b.municipiosConFilas === 0) {
      stats.sinEco.push(ine)
      // ND sin fila: no se mergea (espejo del write: continue).
      return
    }
    stats.conEco++
    stats.tuplas += b.tuplas.length
    if (b.tuplas.length === 0) return
    const env = await fetchEnvelopePublico(ine)
    if (!env) {
      stats.sinEnvelopeR2.push(ine)
      return
    }
    const slugsAntes = new Set(env.indicators.map((i) => i.slug))
    const jsonAntes = JSON.stringify(env)
    mergeConprelTuplas(env, b.tuplas, {
      sourceSlug: CONPREL_SOURCE_SLUG,
      organismo: CONPREL_SOURCE_ORGANISMO,
      nombreFuente: CONPREL_SOURCE_NOMBRE,
      slugsARemplazar: slugsFamilia,
    })
    const slugsDespues = new Set(env.indicators.map((i) => i.slug))
    const perdidos = [...slugsAntes].filter((s) => !slugsDespues.has(s))
    if (perdidos.length) stats.slugsPerdidos.push(`${ine}:${perdidos.join(',')}`)
    else stats.preservacionOk++
    const { ok, bytes } = cabeEnvelope(JSON.stringify(env))
    if (bytes > stats.bytesMax) {
      stats.bytesMax = bytes
      stats.bytesMaxIne = ine
    }
    if (!ok) stats.sobre150kb.push(`${ine}:${bytes}`)
    stats.envelopesOk++
    void jsonAntes
  })

  // Segunda pasada (secuencial, lenta) para los sinR2: descarta fallos de red
  // bajo carga; solo el 404 persistente cuenta como «sin envelope en R2».
  if (stats.sinEnvelopeR2.length > 0 && stats.sinEnvelopeR2.length < ines.length) {
    const reintentos = [...stats.sinEnvelopeR2]
    stats.sinEnvelopeR2 = []
    for (const ine of reintentos) {
      const env2 = await fetchEnvelopePublico(ine)
      if (!env2) {
        stats.sinEnvelopeR2.push(ine)
        continue
      }
      const m = munByIne.get(ine)
      if (!m) continue
      const b = byIne.get(ine)!
      if (b.municipiosConFilas === 0 || b.tuplas.length === 0) continue
      const slugsAntes = new Set(env2.indicators.map((i) => i.slug))
      mergeConprelTuplas(env2, b.tuplas, {
        sourceSlug: CONPREL_SOURCE_SLUG,
        organismo: CONPREL_SOURCE_ORGANISMO,
        nombreFuente: CONPREL_SOURCE_NOMBRE,
        slugsARemplazar: slugsFamilia,
      })
      const slugsDespues = new Set(env2.indicators.map((i) => i.slug))
      const perdidos = [...slugsAntes].filter((s) => !slugsDespues.has(s))
      if (perdidos.length) stats.slugsPerdidos.push(`${ine}:${perdidos.join(',')}`)
      else stats.preservacionOk++
      const { ok, bytes } = cabeEnvelope(JSON.stringify(env2))
      if (bytes > stats.bytesMax) {
        stats.bytesMax = bytes
        stats.bytesMaxIne = ine
      }
      if (!ok) stats.sobre150kb.push(`${ine}:${bytes}`)
      stats.envelopesOk++
    }
    console.log(`  retry pasada 2: recuperados=${reintentos.length - stats.sinEnvelopeR2.length} quedan=${stats.sinEnvelopeR2.length}`)
  }

  return { stats, tuplasPorIne: byIne }
}

// ���� size-full ����������������������������������������������������������������������������������������������������������������������������

interface SizeReport {
  ts: string
  parserVersion: string
  concurrencia: number
  escenarios: Record<
    string,
    {
      candidatos: number
      conEnvelope: number
      sinEnvelopeR2: string[]
      bytesMax: number
      bytesP95: number
      bytesMin: number
      sobre150kb: Array<{ ine: string; bytes: number }>
      tuplasTotal: number
    }
  >
}

function percentil(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]!
}

async function sizeFull(
  datosMap: Map<ConprelFamilia, FamiliaDatos>,
  conc = CONPREL_R2_READ_CONCURRENCY,
): Promise<SizeReport> {
  const slugsPpto = new Set(CONPREL_SLUGS.filter((s) => s.familia === 'ppto').map((s) => s.slug))
  const slugsLiq = new Set(CONPREL_SLUGS.filter((s) => s.familia === 'liq').map((s) => s.slug))

  const builders = new Map<ConprelFamilia, Map<string, ReturnType<typeof buildTuplasFamilia>>>()
  for (const [fam, datos] of datosMap) {
    const def = CONPREL_FAMILIAS[fam]
    const m = new Map<string, ReturnType<typeof buildTuplasFamilia>>()
    for (const mun of datos.inv.municipales) {
      m.set(
        mun.ine,
        buildTuplasFamilia(fam, [mun], datos.eco, { url: def.url }),
      )
    }
    builders.set(fam, m)
  }

  const pptoInes = [...(builders.get('ppto')?.keys() ?? [])].sort()
  const liqInes = [...(builders.get('liq')?.keys() ?? [])].sort()
  const liqSet = new Set(liqInes)
  const intersection = pptoInes.filter((i) => liqSet.has(i))

  type Acum = {
    sizes: number[]
    sin: string[]
    max: number
    maxIne: string | null
    over: Array<{ ine: string; bytes: number }>
    tuplas: number
  }
  const nuevoAcum = (): Acum => ({ sizes: [], sin: [], max: 0, maxIne: null, over: [], tuplas: 0 })

  const escenarios: Record<string, Acum> = {
    solo_ppto: nuevoAcum(),
    solo_liq: nuevoAcum(),
    combinado_ppto_liq: nuevoAcum(),
  }

  const medir = async (
    ine: string,
    esc: Acum,
    familias: ConprelFamilia[],
  ): Promise<void> => {
    const env = await fetchEnvelopePublico(ine)
    if (!env) {
      esc.sin.push(ine)
      return
    }
    for (const f of familias) {
      const b = builders.get(f)?.get(ine)
      if (!b) continue
      esc.tuplas += b.tuplas.length
      mergeConprelTuplas(env, b.tuplas, {
        sourceSlug: CONPREL_SOURCE_SLUG,
        organismo: CONPREL_SOURCE_ORGANISMO,
        nombreFuente: CONPREL_SOURCE_NOMBRE,
        slugsARemplazar: f === 'ppto' ? slugsPpto : slugsLiq,
      })
    }
    const bytes = Buffer.byteLength(JSON.stringify(env), 'utf-8')
    esc.sizes.push(bytes)
    if (bytes > esc.max) {
      esc.max = bytes
      esc.maxIne = ine
    }
    if (bytes >= CONPREL_MAX_ENVELOPE_BYTES) esc.over.push({ ine, bytes })
  }

  /** 2ª pasada secuencial sobre los sinR2 (descarta ruido de red bajo carga). */
  const reintentarSinEnvelope = async (
    esc: Acum,
    _candidatos: readonly string[],
    familias: ConprelFamilia[],
  ): Promise<void> => {
    if (esc.sin.length === 0) return
    const pend = [...esc.sin]
    esc.sin = []
    for (const ine of pend) {
      await medir(ine, esc, familias)
    }
    console.log(`    retry size: recuperados=${pend.length - esc.sin.length} quedan=${esc.sin.length}`)
  }

  console.log(`  size-full: ppto=${pptoInes.length} liq=${liqInes.length} intersección=${intersection.length} conc=${conc}`)
  if (builders.has('ppto')) {
    await mapConcurrencia(pptoInes, conc, async (ine) => {
      await medir(ine, escenarios.solo_ppto!, ['ppto'])
    })
    await reintentarSinEnvelope(escenarios.solo_ppto!, pptoInes, ['ppto'])
    console.log(`    solo_ppto: ${escenarios.solo_ppto!.sizes.length} envelopes · máx=${escenarios.solo_ppto!.max} sinR2=${escenarios.solo_ppto!.sin.length}`)
  }
  if (builders.has('liq')) {
    await mapConcurrencia(liqInes, conc, async (ine) => {
      await medir(ine, escenarios.solo_liq!, ['liq'])
    })
    await reintentarSinEnvelope(escenarios.solo_liq!, liqInes, ['liq'])
    console.log(`    solo_liq: ${escenarios.solo_liq!.sizes.length} envelopes · máx=${escenarios.solo_liq!.max} sinR2=${escenarios.solo_liq!.sin.length}`)
  }
  await mapConcurrencia(intersection, conc, async (ine) => {
    await medir(ine, escenarios.combinado_ppto_liq!, ['ppto', 'liq'])
  })
  await reintentarSinEnvelope(escenarios.combinado_ppto_liq!, intersection, ['ppto', 'liq'])
  console.log(
    `    combinado: ${escenarios.combinado_ppto_liq!.sizes.length} envelopes · máx=${escenarios.combinado_ppto_liq!.max} sinR2=${escenarios.combinado_ppto_liq!.sin.length}`,
  )

  const report: SizeReport = {
    ts: new Date().toISOString(),
    parserVersion: CONPREL_PARSER_VERSION,
    concurrencia: conc,
    escenarios: {},
  }
  for (const [name, ac] of Object.entries(escenarios)) {
    const sorted = [...ac.sizes].sort((a, b) => a - b)
    report.escenarios[name] = {
      candidatos:
        name === 'solo_ppto'
          ? pptoInes.length
          : name === 'solo_liq'
            ? liqInes.length
            : intersection.length,
      conEnvelope: ac.sizes.length,
      sinEnvelopeR2: ac.sin,
      bytesMax: ac.max,
      bytesP95: percentil(sorted, 0.95),
      bytesMin: sorted[0] ?? 0,
      sobre150kb: ac.over,
      tuplasTotal: ac.tuplas,
    }
  }
  return report
}

// ���� Colisiones de nombre y ausentes ��������������������������������������������������������������������������������

function auditarColisiones(
  datos: FamiliaDatos,
  catalogo: Catalogo,
): { colisiones: number; ineEstables: number; muestras: Array<{ ine: string; conprel: string; ine_: string }> } {
  const muestras: Array<{ ine: string; conprel: string; ine_: string }> = []
  let colisiones = 0
  let ineEstables = 0
  for (const m of datos.inv.municipales) {
    const ineNombre = catalogo.nombres.get(m.ine)
    if (ineNombre === undefined) continue // fuera de catálogo �  lo cubre ausentes
    if (normNombre(ineNombre) !== normNombre(m.nombre)) {
      colisiones++
      ineEstables++ // el INE es el mismo por construcción (join por código)
      if (muestras.length < 60) {
        muestras.push({ ine: m.ine, conprel: m.nombre.trim(), ine_: ineNombre })
      }
    }
  }
  return { colisiones, ineEstables, muestras }
}

function auditarAusentes(
  datos: FamiliaDatos,
  catalogo: Catalogo,
): { ausentes: number; ines: string[] } {
  const presentes = new Set(datos.inv.municipales.map((m) => m.ine))
  const ausentes = [...catalogo.nombres.keys()].filter((i) => !presentes.has(i)).sort()
  return { ausentes: ausentes.length, ines: ausentes }
}

// ���� Escritura (SOLO futura; gate doble) ������������������������������������������������������������������������

async function modoEscritura(
  datosMap: Map<ConprelFamilia, FamiliaDatos>,
  runId: string,
): Promise<void> {
  // Implementación completa del pipeline de escritura (merge �  gate 150 KB � 
  // putMunicipioJson �  read-back �  revalidateAfterWrites �  audit row).
  // Esta rama SOLO se alcanza con --confirm-r2-write Y
  // SOCIDEAS_CONPREL_WRITE=autorizado. La misión NO la ejecuta.
  const { getMunicipioJsonRaw, putMunicipioJson } = await import('../src/lib/socideas-r2')
  const writtenInes: string[] = []
  let written = 0
  for (const [fam, datos] of datosMap) {
    const def = CONPREL_FAMILIAS[fam]
    const slugsFam = new Set(CONPREL_SLUGS.filter((s) => s.familia === fam).map((s) => s.slug))
    for (const mun of datos.inv.municipales) {
      const b = buildTuplasFamilia(fam, [mun], datos.eco, { url: def.url })
      if (b.tuplas.length === 0) continue // municipio sin fila �  ND (sin tupla)
      const raw = await getMunicipioJsonRaw(mun.ine)
      if (!raw || (raw as { version?: number }).version !== 2) continue
      const env = raw as unknown as EnvV2
      if (env.codigo_ine !== mun.ine) continue
      // Backup local previo (diseño §7.4 — patrón fix-tgss): copia del
      // envelope ANTES del merge para poder restaurar por run si el put
      // o el read-back fallan a medias. Solo filesystem local.
      const backupDir = path.join(process.cwd(), 'tmp', 'conprel-backup', runId)
      fs.mkdirSync(backupDir, { recursive: true })
      fs.writeFileSync(path.join(backupDir, `${mun.ine}.json`), JSON.stringify(env), 'utf8')
      mergeConprelTuplas(env, b.tuplas, {
        sourceSlug: CONPREL_SOURCE_SLUG,
        organismo: CONPREL_SOURCE_ORGANISMO,
        nombreFuente: CONPREL_SOURCE_NOMBRE,
        slugsARemplazar: slugsFam,
      })
      const json = JSON.stringify(env)
      const gate = cabeEnvelope(json)
      if (!gate.ok) {
        console.error(`  BLOQUEO 150KB: ${mun.ine} = ${gate.bytes} B`)
        continue
      }
      await putMunicipioJson(mun.ine, env)
      // read-back
      const back = await getMunicipioJsonRaw(mun.ine)
      if (!back || back.codigo_ine !== mun.ine) {
        console.error(`  READ-BACK fallido: ${mun.ine}`)
        continue
      }
      written++
      writtenInes.push(mun.ine)
    }
  }
  // Revalidación batch + audit row UNA sola vez al final de todo el run
  // (diseño §7: escritura R2 �  read-back �  revalidateAfterWrites �  audit row).
  if (shouldRevalidate(written)) {
    const reval = await revalidateAfterWrites(writtenInes)
    if (reval) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (url && key) {
        const sb = createClient(url, key, { auth: { persistSession: false } })
        for (const [fam] of datosMap) {
          const def = CONPREL_FAMILIAS[fam]
          const row = buildRevalidationAuditRow(reval, {
            runId,
            writtenCount: written,
            tipo: fam === 'ppto' ? 'conprel_ppto_2025' : 'conprel_liq_2024',
            bloque: 'economia',
            periodo: String(def.ejercicio),
            fuente: CONPREL_SOURCE_SLUG,
          })
          await sb.from('data_sync_runs').insert(row)
        }
      } else {
        console.error('  SIN Supabase: degradación de revalidación solo en consola/manifest')
      }
      if (reval.degradado) {
        console.error(`  REVALIDACI�N DEGRADADA: ${reval.error ?? 'sin detalle'}`)
      }
    }
  }
  console.log(`Escritura completada: ${written} municipios · runId=${runId}`)
}

// ���� main ��������������������������������������������������������������������������������������������������������������������������������������

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const gate = resolveWriteGate({
    confirmFlag: args.confirmWrite,
    envValue: process.env.SOCIDEAS_CONPREL_WRITE,
    dryRunExplicit: args.dryRunExplicit,
  })
  if (gate.mode === 'abort') {
    console.error(`ABORTO: ${gate.error}`)
    process.exit(2)
  }
  let falloDry = false
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + '-' + Math.random().toString(36).slice(2, 7)
  console.log('=== LOADER CONPREL · SOCideas ===')
  console.log(
    `Modo: ${gate.mode === 'write' ? 'ESCRITURA R2 (habilitada)' : 'DRY-RUN (defecto)'} · runId=${runId} · parser=${CONPREL_PARSER_VERSION}`,
  )
  console.log(`Familias: ${args.familias.join(', ')} · flags: muestra=${args.muestra} all-ppto=${args.allPpto} all-liq=${args.allLiq} size-full=${args.sizeFull} ausentes=${args.ausentes} colisiones=${args.colisiones} provincias=${args.provincias?.join('/') ?? '-'}`)

  // 1. Descarga + extracción + parseo estricto (bloquea ante duplicados/cabeceras).
  let datosMap: Map<ConprelFamilia, FamiliaDatos>
  try {
    datosMap = await cargarDatos(args.familias, args.extract)
  } catch (e) {
    if (e instanceof ConprelBloqueoError) {
      console.error(`BLOQUEO: ${e.message}`)
      if (e.registro !== undefined) console.error('Registro:', JSON.stringify(e.registro))
      process.exit(3)
    }
    if (e instanceof ConprelParseError) {
      console.error(`PARSE ERROR: ${e.message}`)
      process.exit(4)
    }
    throw e
  }

  // 2. Catálogo si hace falta (ausentes/colisiones).
  let catalogo: Catalogo | null = null
  if (args.ausentes || args.colisiones) {
    catalogo = await cargarCatalogo()
    console.log(`Catálogo INE: ${catalogo.nombres.size} municipios`)
  }

  const informe: Record<string, unknown> = {
    runId,
    parserVersion: CONPREL_PARSER_VERSION,
    modo: gate.mode,
    flags: args,
    familias: {},
  }

  // 3. Dry-run estratificado por familia (solo con alcance explícito o defecto;
  //    --ausentes/--colisiones/--size-full solos no disparan fetch masivo aquí).
  const hayAlcanceDryRun =
    args.muestra ||
    args.allPpto ||
    args.allLiq ||
    args.provincias !== null ||
    (!args.ausentes && !args.colisiones && !args.sizeFull)
  if (hayAlcanceDryRun && (!args.sizeFull || args.muestra || args.provincias !== null)) {
    for (const [fam, datos] of datosMap) {
      const { ines, etiqueta } = seleccionar(datos, args, catalogo)
      if (ines.length === 0) {
        console.log(`[${fam}] 0 candidatos para etiqueta ${etiqueta}`)
        continue
      }
      console.log(`\n--- Dry-run ${fam} · ${etiqueta} · ${ines.length} INE ---`)
      const { stats } = await dryRunFamilia(datos, ines, etiqueta)
      console.log(
        `  inv=${stats.conInventario}/${stats.candidatos} eco=${stats.conEco} sinEco=${stats.sinEco.length} ` +
          `tuplas=${stats.tuplas} env=${stats.envelopesOk} sinR2=${stats.sinEnvelopeR2.length} ` +
          `bytesMáx=${stats.bytesMax} (${stats.bytesMaxIne}) >150KB=${stats.sobre150kb.length} ` +
          `slugsPerdidos=${stats.slugsPerdidos.length} preservados=${stats.preservacionOk}/${stats.envelopesOk}`,
      )
      const fuera = identesFueraDeContrato(datos.inv, datos.eco)
      console.log(
        `  identes fuera de contrato: zvZo=${fuera.zvZo.length} otrosNoMunicipales=${fuera.otrosNoMunicipales}`,
      )
      ;(informe.familias as Record<string, unknown>)[fam] = {
        ...stats,
        identesFueraDeContrato: fuera,
      }
      if (stats.sinEco.length) console.log(`  sin eco (ND): ${stats.sinEco.slice(0, 20).join(',')}${stats.sinEco.length > 20 ? '⬦' : ''}`)
      if (stats.sinEnvelopeR2.length) {
        const motivos = stats.sinEnvelopeR2.slice(0, 8).map((i) => `${i}:${fetchFallos.get(i) ?? 'sin-detalle'}`)
        console.log(`  sinR2 muestra motivos: ${motivos.join(' | ')}`)
        const porMotivo = new Map<string, number>()
        for (const i of stats.sinEnvelopeR2) {
          const m = fetchFallos.get(i) ?? 'sin-detalle'
          const k =
            m === '404'
              ? '404'
              : m.startsWith('HTTP') || m.toLowerCase().includes('timeout') || m.toLowerCase().includes('fetch')
                ? 'error-red'
                : m.includes('payload')
                  ? 'payload'
                  : 'otro'
          porMotivo.set(k, (porMotivo.get(k) ?? 0) + 1)
        }
        console.log(`  sinR2 por motivo: ${[...porMotivo].map(([k, v]) => `${k}=${v}`).join(' ')}`)
      }
      if (stats.sobre150kb.length) {
        console.error(`  >150KB: ${stats.sobre150kb.join(', ')}`)
        falloDry = true
      }
      if (stats.slugsPerdidos.length) {
        console.error(`  SLUGS PERDIDOS: ${stats.slugsPerdidos.join('; ')}`)
        falloDry = true
      }
    }
  }

  // 4. Colisiones de nombre (join por código).
  if (args.colisiones && catalogo) {
    for (const [fam, datos] of datosMap) {
      const col = auditarColisiones(datos, catalogo)
      console.log(
        `\n[colisiones ${fam}] divergencias de nombre=${col.colisiones} · INE estables=${col.ineEstables}/${col.colisiones}`,
      )
      for (const m of col.muestras.slice(0, 8)) {
        console.log(`  ${m.ine}: CONPREL="${m.conprel}" vs INE="${m.ine_}" (join por código �  INE intacto)`)
      }
      ;(informe.familias as Record<string, unknown>)[`${fam}_colisiones`] = col
    }
  }

  // 5. Ausentes (catálogo �� inventario municipal).
  if (args.ausentes && catalogo) {
    for (const [fam, datos] of datosMap) {
      const aus = auditarAusentes(datos, catalogo)
      console.log(`\n[ausentes ${fam}] ${aus.ausentes} municipios de catálogo sin fila AA/ZZ (ND, nunca 0)`)
      console.log(`  muestra: ${aus.ines.slice(0, 15).join(',')}`)
      ;(informe.familias as Record<string, unknown>)[`${fam}_ausentes`] = {
        total: aus.ausentes,
        ines: aus.ines,
      }
    }
  }

  // 6. size-full (población completa, dos escenarios).
  if (args.sizeFull) {
    console.log('\n--- size-full (lectura R2 pública, merge en memoria) ---')
    const report = await sizeFull(datosMap)
    const out = path.join(process.cwd(), 'tmp', `conprel-loader-size-${Date.now()}.json`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
    console.log(`Informe tamaño: ${path.relative(process.cwd(), out)}`)
    for (const [name, s] of Object.entries(report.escenarios)) {
      console.log(
        `  ${name}: candidatos=${s.candidatos} conEnv=${s.conEnvelope} sinR2=${s.sinEnvelopeR2.length} ` +
          `máx=${s.bytesMax} p95=${s.bytesP95} >150KB=${s.sobre150kb.length} tuplas=${s.tuplasTotal}`,
      )
      if (s.sobre150kb.length) {
        console.error(`    lista >150KB: ${s.sobre150kb.map((x) => `${x.ine}:${x.bytes}`).join(', ')}`)
        falloDry = true
      }
    }
    informe.sizeFull = report
  }

  // 7. Escritura (solo con gate doble; NO en esta misión).
  if (gate.mode === 'write') {
    console.log('\n--- ESCRITURA R2 (habilitada por operador) ---')
    await modoEscritura(datosMap, runId)
  }

  const outDir = path.join(process.cwd(), 'tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `conprel-loader-dryrun-${runId}.json`)
  fs.writeFileSync(outPath, JSON.stringify(informe, null, 2))
  console.log(`\nInforme dry-run: ${path.relative(process.cwd(), outPath)}`)
  if (falloDry && gate.mode !== 'write') {
    console.error('DRY-RUN CON FALLOS (>150KB o slugsPerdidos): exitCode=1')
    process.exitCode = 1
  }
  if (gate.mode === 'write') {
    console.log('=== CARGA COMPLETADA ===')
  } else {
    console.log('=== DRY-RUN COMPLETADO - sin escritura ===')
  }
}

main().catch((e) => {
  if (e instanceof ConprelBloqueoError) {
    console.error(`BLOQUEO: ${e.message}`)
    process.exit(3)
  }
  if (e instanceof ConprelParseError) {
    console.error(`PARSE ERROR: ${e.message}`)
    process.exit(4)
  }
  console.error('Error fatal:', e)
  process.exit(1)
})
