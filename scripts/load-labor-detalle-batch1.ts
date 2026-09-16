// Escritor LABOR-DETALLE Batch 1 (Fase 2B cierre): merge-por-bloque de detalle
// SEPE/TGSS julio 2026 sobre envelopes v2 VIVOS, sin tocar totales ni otras claves.
//
// Uso:
//   npx tsx scripts/load-labor-detalle-batch1.ts --parse-only
//   npx tsx scripts/load-labor-detalle-batch1.ts --parse-only --limit 100 --offset 0
//   npx tsx scripts/load-labor-detalle-batch1.ts --parse-only --codes 28079,07010,41091
//   npx tsx scripts/load-labor-detalle-batch1.ts --write --limit 500 --offset 0   (SOLO orquestador)
//   npx tsx scripts/load-labor-detalle-batch1.ts --mock --write                  → exit 1
//
// Reglas (diseño en src/lib/socideas-labor-envelope.ts):
// - Fuentes reales ya verificadas: tmp/labor-100/Paro_por_municipios_2026_csv.csv
//   (SEPE, Windows-1252, `;`) y tmp/labor-100/Muni072026.xlsx (TGSS).
// - Convención tableId ya publicada: sepe_2026_07 / tgss_2026_07 (commit 77bc649).
//   Las filas de detalle usan EXACTAMENTE esos tableId.
// - MERGE por bloque a nivel de tupla v2 cruda (sin expandV2Envelope, para no
//   reasignar fuentes): se copian los catálogos vivos tal cual y se AÑADEN solo
//   tuplas de DETALLE (dim con sexo/tramo_edad/sector/regimen) ausentes,
//   construidas con buildSepeTuples/buildTgssTuples. Los totales (dim base) y
//   el resto de claves JAMÁS se tocan ni se duplican.
// - Secreto estadístico: parseSepeCell("<5") y parseTgssCell(">=X"/"<5") → null
//   y push() omite nulls: ninguna celda suprimida genera tupla (ausencia = ND).
// - --parse-only (defecto seguro): sin R2 ni Supabase; escribe manifest +
//   muestras en tmp/labor/. --write: PUT + read-back con cache-buster +
//   data_sync_runs tipo='labor_detalle_batch1'. Requiere credenciales.
// - Presupuesto: envelope final < 150 KB por municipio.
// - NUNCA imprime secretos (solo presencia/longitud).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { putMunicipioJson } from '../src/lib/socideas-r2'
import type { R2MunicipioEnvelopeV2 } from '../src/lib/socideas-r2'
import {
  buildSepeTuples,
  buildTgssTuples,
  mapTgssRow,
  parseSepeCell,
  parseSepeCsv,
  parseTgssCell,
  type LaborV2Input,
  type LaborWarning,
  type SepeMonthRow,
  type TgssMuniRow,
} from '../src/lib/socideas-labor-envelope'

const BUDGET_BYTES = 150 * 1024
const PERIODO = '2026-07'
const ANIO = 2026
const MES = 7
const SEPE_TABLE = 'sepe_2026_07'
const TGSS_TABLE = 'tgss_2026_07'
const SYNC_TIPO = 'labor_detalle_batch1'
const FALLBACK_R2_BASE = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const SEPE_URL = 'https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos/Paro_por_municipios_2026_csv.csv'
const TGSS_URL = 'https://www.seg-social.es/descarga/es/Muni072026'
const CONCURRENCY = 10
const FETCH_RETRIES = 4

interface Args {
  doWrite: boolean
  parseOnly: boolean
  limit: number
  offset: number
  codes: string[] | null
  force: boolean
  sepeCsv: string
  tgssXlsx: string
  out: string
  r2Base: string
  muestras: number
}

function flagVal(argv: string[], name: string): number {
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return Number.parseInt(eq.split('=')[1], 10) || 0
  const i = argv.indexOf(name)
  if (i >= 0 && argv[i + 1] !== undefined) return Number.parseInt(argv[i + 1], 10) || 0
  return 0
}

function getOpt(argv: string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.split('=')[1]
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const doWrite = argv.includes('--write')
  const parseOnly = argv.includes('--parse-only') || !doWrite
  const codesRaw = getOpt(argv, '--codes') ?? ''
  const codes = codesRaw
    ? codesRaw.split(',').map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s))
    : null
  if (codesRaw && (!codes || codes.length === 0)) {
    throw new Error('--codes requiere lista de INE de 5 dígitos separados por coma')
  }
  return {
    doWrite,
    parseOnly,
    limit: flagVal(argv, '--limit'),
    offset: flagVal(argv, '--offset'),
    codes,
    force: argv.includes('--force'),
    sepeCsv: getOpt(argv, '--sepe-csv') ?? join('tmp', 'labor-100', 'Paro_por_municipios_2026_csv.csv'),
    tgssXlsx: getOpt(argv, '--tgss-xlsx') ?? join('tmp', 'labor-100', 'Muni072026.xlsx'),
    out: getOpt(argv, '--out') ?? join('tmp', 'labor'),
    r2Base: (
      getOpt(argv, '--r2-base') ??
      process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ??
      process.env.SOCIDEAS_R2_PUBLIC_BASE ??
      FALLBACK_R2_BASE
    ).replace(/\/$/, ''),
    muestras: flagVal(argv, '--muestras') || 5,
  }
}

function tupleKey(slug: string, anio: number, dimJson: string, table: string): string {
  return `${slug}|${anio}|${dimJson}|${table}`
}

function isDetalleDim(dim: Record<string, string>): boolean {
  return (
    'sexo' in dim || 'tramo_edad' in dim || 'sector' in dim || 'regimen' in dim
  )
}

async function fetchLive(base: string, ine: string): Promise<{ env: R2MunicipioEnvelopeV2 | null; status: string }> {
  let last = 'desconocido'
  for (let intento = 0; intento < FETCH_RETRIES; intento++) {
    if (intento > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** (intento - 1)))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    try {
      const res = await fetch(`${base}/socideas/v2/municipios/${ine}.json`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      last = `HTTP ${res.status}`
      if (res.status === 404) return { env: null, status: last }
      if (res.status !== 200) continue // 429/5xx → reintento con backoff
      const json = (await res.json()) as R2MunicipioEnvelopeV2
      if (!json || json.version !== 2 || json.codigo_ine !== ine || !Array.isArray(json.valores)) {
        return { env: null, status: 'invalido' }
      }
      return { env: json, status: last }
    } catch {
      last = 'red/timeout'
    } finally {
      clearTimeout(timer)
    }
  }
  return { env: null, status: last }
}

interface IneResult {
  ine: string
  estado: string
  baseBytes: number
  nuevas: number
  finalBytes: number
  addedBytes: number
  duplicadasOmitidas: number
  contradicciones: number
  colisionesTotal: number
  suprimidasSinTupla: number
  violacionesSuprimidas: number
  sepeTotal: number | null
  tgssTotal: number | null
  warnings: LaborWarning[]
  motivo?: string
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (process.argv.slice(2).includes('--mock') && args.doWrite) {
    console.error('ERROR: --mock no puede combinarse con --write. Exit 1')
    process.exit(1)
  }

  // Verificación literal: ninguna celda ">=X"/"<5" genera tupla (por construcción).
  if (parseTgssCell('>=10') !== null || parseTgssCell(' <5') !== null || parseSepeCell('<5') !== null) {
    throw new Error('parseTgssCell/parseSepeCell aceptan rangos de secreto: abortado')
  }

  if (!existsSync(args.sepeCsv)) throw new Error(`Falta CSV SEPE real: ${args.sepeCsv}`)
  if (!existsSync(args.tgssXlsx)) throw new Error(`Falta XLSX TGSS real: ${args.tgssXlsx}`)
  mkdirSync(args.out, { recursive: true })

  // SEPE julio 2026 (CSV Windows-1252 → latin1).
  const sepeRows = parseSepeCsv(readFileSync(args.sepeCsv).toString('latin1')).filter(
    (r) => r.periodo === PERIODO,
  )
  const sepeByIne = new Map<string, SepeMonthRow[]>()
  for (const r of sepeRows) {
    const arr = sepeByIne.get(r.codigoIne) ?? []
    arr.push(r)
    sepeByIne.set(r.codigoIne, arr)
  }

  // TGSS julio 2026 (hoja única, cabecera por "MUNICIPIO", celdas D..J).
  const wb = XLSX.readFile(args.tgssXlsx)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }) as unknown[][]
  let headerIdx = -1
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    if (grid[i].some((c) => String(c ?? '').trim().toUpperCase() === 'MUNICIPIO')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) throw new Error('Cabecera TGSS no localizada (columna MUNICIPIO ausente)')
  const tgssByIne = new Map<string, TgssMuniRow>()
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i]
    if (!row) continue
    const mapped = mapTgssRow(String(row[1] ?? ''), {
      general: row[3],
      agrario: row[4],
      hogar: row[5],
      mar: row[6],
      autonomos: row[7],
      carbon: row[8],
      total: row[9],
    })
    if (mapped && !tgssByIne.has(mapped.codigoIne)) tgssByIne.set(mapped.codigoIne, mapped)
  }

  const union = [...new Set([...sepeByIne.keys(), ...tgssByIne.keys()])].sort()
  const esSubconjunto = args.codes !== null || args.limit > 0 || args.offset > 0
  const universo = args.codes ?? union.slice(args.offset, args.limit > 0 ? args.offset + args.limit : undefined)
  console.log(
    `[labor-detalle] modo=${args.doWrite ? 'WRITE' : 'parse-only'} universo=${universo.length} ` +
      `(sepe=${sepeByIne.size} tgss=${tgssByIne.size} union=${union.length}) out=${args.out}`,
  )

  // Supabase solo en --write (registro data_sync_runs). En parse-only ni se importa.
  // Sin service-role: modo local con auditoría diferida a manifest.pendingAudit
  // (bulk insert posterior con el mismo runid, como el parche TGSS).
  let supabase: { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } } | null = null
  const pendingAudit: unknown[] = []
  if (args.doWrite) {
    const { createClient } = await import('@supabase/supabase-js')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) supabase = createClient(url, key, { auth: { persistSession: false } }) as unknown as typeof supabase
    else console.log('[supabase] Sin service-role: auditoría diferida a manifest.pendingAudit.')
    if (!process.env.R2_BUCKET) throw new Error('Faltan credenciales R2 en el entorno')
  }

  const manifestPath = join(args.out, 'labor-detalle-manifest.json')
  let previos: Record<string, IneResult> = {}
  if (!args.force && existsSync(manifestPath)) {
    try {
      const mj = JSON.parse(readFileSync(manifestPath, 'utf8')) as { resultados?: IneResult[] }
      for (const r of mj.resultados ?? []) previos[r.ine] = r
    } catch {
      previos = {}
    }
  }

  const resultados: IneResult[] = []
  let muestrasEscritas = 0

  const processOne = async (ine: string): Promise<IneResult> => {
    const { env: live, status } = await fetchLive(args.r2Base, ine)
    if (!live) {
      return {
        ine, estado: 'sin_base_r2', baseBytes: 0, nuevas: 0, finalBytes: 0, addedBytes: 0,
        duplicadasOmitidas: 0, contradicciones: 0, colisionesTotal: 0,
        suprimidasSinTupla: 0, violacionesSuprimidas: 0,
        sepeTotal: null, tgssTotal: null, warnings: [],
        motivo: `lectura pública R2 sin 200 v2 válido (${status})`,
      }
    }
    const baseBytes = JSON.stringify(live).length
    // Índice de tuplas vivas: clave → valor (para detectar duplicados/contradicciones).
    const vivas = new Map<string, number | null>()
    for (const t of live.valores) {
      const [ii, anio, valor, , di, , tableId] = t
      const slug = live.indicators[ii]?.slug ?? ''
      const dimJson = JSON.stringify(live.dimensiones[di] ?? {})
      vivas.set(tupleKey(slug, anio, dimJson, tableId ?? ''), valor)
    }

    const warnings: LaborWarning[] = []
    const candidatas: LaborV2Input[] = []
    const sepeList = (sepeByIne.get(ine) ?? []).sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    const sepeRow = sepeList.length > 0 ? sepeList[sepeList.length - 1] : null
    if (sepeRow) {
      for (const t of buildSepeTuples(sepeRow, SEPE_URL, warnings)) candidatas.push(t)
    }
    const tgssRow = tgssByIne.get(ine) ?? null
    if (tgssRow) {
      for (const t of buildTgssTuples(tgssRow, ANIO, MES, PERIODO, TGSS_URL, warnings)) candidatas.push(t)
    }

    // Solo DETALLE: los totales (dim base) ya están publicados y jamás se tocan.
    const detalle = candidatas.filter((t) => isDetalleDim(t.dimensiones))
    let duplicadas = 0
    let contradicciones = 0
    const nuevas: LaborV2Input[] = []
    for (const t of detalle) {
      const k = tupleKey(t.indicator.slug, t.anio_referencia, JSON.stringify(t.dimensiones), t.source_table_id ?? '')
      if (vivas.has(k)) {
        duplicadas++
        if (vivas.get(k) !== t.valor_numerico) {
          contradicciones++
          warnings.push({
            codigoIne: ine, periodo: PERIODO, regla: 'detalle_contradicce_total_o_previa',
            detalle: `${k}: vivo=${vivas.get(k)} vs detalle=${t.valor_numerico} (no se sobrescribe)`,
          })
        }
        continue
      }
      vivas.set(k, t.valor_numerico)
      nuevas.push(t)
    }

    // Verificación: ninguna tupla de detalle colisiona con una clave de TOTAL.
    const baseDimJson = JSON.stringify({ ambito: 'municipio', periodo: PERIODO, estado: 'consolidado' })
    const totalKeys = new Set([
      tupleKey('paro_registrado', ANIO, baseDimJson, SEPE_TABLE),
      tupleKey('afiliacion_total', ANIO, baseDimJson, TGSS_TABLE),
    ])
    let colisiones = 0
    for (const t of nuevas) {
      if (totalKeys.has(tupleKey(t.indicator.slug, t.anio_referencia, JSON.stringify(t.dimensiones), t.source_table_id ?? ''))) {
        colisiones++
      }
    }

    // Verificación: celdas suprimidas ("<5"/">=X" → null) no generan tupla.
    let suprimidas = 0
    let violaciones = 0
    const freshKeys = new Set(
      nuevas.map((t) => tupleKey(t.indicator.slug, t.anio_referencia, JSON.stringify(t.dimensiones), t.source_table_id ?? '')),
    )
    if (sepeRow) {
      const base = { ambito: 'municipio', periodo: PERIODO, estado: 'consolidado' }
      const celdas: { v: number | null; dim: Record<string, string> }[] = [
        ...sepeRow.hombres.map((v, i) => ({ v, dim: { ...base, sexo: 'hombres', tramo_edad: ['<25', '25-45', '>=45'][i] } })),
        ...sepeRow.mujeres.map((v, i) => ({ v, dim: { ...base, sexo: 'mujeres', tramo_edad: ['<25', '25-45', '>=45'][i] } })),
        ...(['agricultura', 'industria', 'construccion', 'servicios', 'sin_empleo_anterior'] as const).map((s) => ({
          v: sepeRow.sectores[s], dim: { ...base, sector: s },
        })),
      ]
      for (const c of celdas) {
        if (c.v === null) {
          suprimidas++
          if (freshKeys.has(tupleKey('paro_registrado', sepeRow.anio, JSON.stringify(c.dim), SEPE_TABLE))) violaciones++
        }
      }
    }
    if (tgssRow) {
      const base = { ambito: 'municipio', periodo: PERIODO, estado: 'consolidado' }
      for (const r of ['general', 'agrario', 'hogar', 'mar', 'autonomos', 'carbon'] as const) {
        if (tgssRow.regimenes[r] === null) {
          suprimidas++
          if (freshKeys.has(tupleKey('afiliacion_total', ANIO, JSON.stringify({ ...base, regimen: r }), TGSS_TABLE))) violaciones++
        }
      }
    }

    // Merge a nivel de tupla cruda: catálogos vivos intactos, solo append.
    const indicators = [...live.indicators]
    const indIdx = new Map(indicators.map((s, i) => [s.slug, i]))
    const sources = [...live.sources]
    const srcIdx = new Map(sources.map((s, i) => [s.slug, i]))
    const urls = [...live.source_urls]
    const urlIdx = new Map(urls.map((u, i) => [u, i]))
    const dims = [...live.dimensiones]
    const dimIdx = new Map(dims.map((d, i) => [JSON.stringify(d), i]))
    const valores: R2MunicipioEnvelopeV2['valores'] = [...live.valores]
    for (const t of nuevas) {
      let ii = indIdx.get(t.indicator.slug)
      if (ii === undefined) {
        ii = indicators.length
        indIdx.set(t.indicator.slug, ii)
        indicators.push({ slug: t.indicator.slug, nombre: t.indicator.nombre, unidad: t.indicator.unidad })
      }
      let si = srcIdx.get(t.source.slug)
      if (si === undefined) {
        si = sources.length
        srcIdx.set(t.source.slug, si)
        sources.push({ slug: t.source.slug, organismo: t.source.organismo, nombre: t.source.nombre })
      }
      const urlKey = t.source_url ?? ''
      let ui = urlIdx.get(urlKey)
      if (ui === undefined) {
        ui = urls.length
        urlIdx.set(urlKey, ui)
        urls.push(urlKey)
      }
      const dimKey = JSON.stringify(t.dimensiones)
      let di = dimIdx.get(dimKey)
      if (di === undefined) {
        di = dims.length
        dimIdx.set(dimKey, di)
        dims.push(t.dimensiones)
      }
      valores.push([ii, t.anio_referencia, t.valor_numerico, t.unidad, di, ui, t.source_table_id, t.source_series_id ?? null, t.estado_validacion])
    }
    const merged: R2MunicipioEnvelopeV2 = {
      version: 2, codigo_ine: ine, generado_en: live.generado_en,
      indicators, sources, source_urls: urls, dimensiones: dims, valores,
    }
    const finalBytes = JSON.stringify(merged).length
    const addedBytes = finalBytes - baseBytes

    const r: IneResult = {
      ine,
      estado: nuevas.length === 0 ? 'sin_cambios' : args.doWrite ? 'escrito' : 'pendiente_write',
      baseBytes, nuevas: nuevas.length, finalBytes, addedBytes,
      duplicadasOmitidas: duplicadas, contradicciones, colisionesTotal: colisiones,
      suprimidasSinTupla: suprimidas, violacionesSuprimidas: violaciones,
      sepeTotal: sepeRow?.total ?? null, tgssTotal: tgssRow?.total ?? null, warnings,
    }

    if (args.doWrite) {
      if (finalBytes >= BUDGET_BYTES) throw new Error(`Presupuesto superado en ${ine}: ${finalBytes}B`)
      if (colisiones > 0 || violaciones > 0 || contradicciones > 0) {
        throw new Error(`Coherencia fallida en ${ine}: colisiones=${colisiones} violaciones=${violaciones} contradicciones=${contradicciones}`)
      }
      const key = await putMunicipioJson(ine, merged)
      const rb = await fetch(`${args.r2Base}/socideas/v2/municipios/${ine}.json?v=${Date.now()}`, {
        headers: { Accept: 'application/json' },
      })
      if (!rb.ok) throw new Error(`Read-back HTTP ${rb.status} en ${ine}`)
      const rbJson = (await rb.json()) as { codigo_ine?: string; valores?: unknown[] }
      if (rbJson.codigo_ine !== ine || !Array.isArray(rbJson.valores)) throw new Error(`Read-back inválido en ${ine}`)
      r.motivo = key
      const auditRow = {
        source_id: null, tipo_sincronizacion: SYNC_TIPO, municipio_codigo_ine: ine,
        estado: nuevas.length > 0 ? 'ok' : 'partial', registros_leidos: candidatas.length,
        registros_actualizados: nuevas.length, fin: new Date().toISOString(),
        estado_dato: 'consolidado', bloque: 'mercado_trabajo', periodo: PERIODO, fuente: 'sepe,tgss',
        metadata: { tableIds: [SEPE_TABLE, TGSS_TABLE], duplicadasOmitidas: duplicadas, warnings: warnings.length },
      }
      if (supabase) await supabase.from('data_sync_runs').insert(auditRow)
      else pendingAudit.push(auditRow)
    } else if (nuevas.length > 0 && muestrasEscritas < args.muestras) {
      muestrasEscritas++
      writeFileSync(join(args.out, `muestra-detalle-${ine}.json`), JSON.stringify(merged))
    }
    return r
  }

  // Pool de concurrencia simple (solo lectura R2 en parse-only).
  const queue = [...universo]
  const workers: Promise<void>[] = []
  let hechos = 0
  for (let w = 0; w < Math.min(CONCURRENCY, queue.length); w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const ine = queue.shift() as string
          // Reanudable: se reutilizan los INEs ya resueltos con base; los
          // sin_base_r2/error se reintentan siempre (p. ej. tras un 429).
          const prev = !args.force ? previos[ine] : undefined
          if (prev && (prev.estado === 'pendiente_write' || prev.estado === 'sin_cambios' || prev.estado === 'escrito')) {
            resultados.push(prev)
            continue
          }
          try {
            resultados.push(await processOne(ine))
          } catch (e) {
            resultados.push({
              ine, estado: 'error', baseBytes: 0, nuevas: 0, finalBytes: 0, addedBytes: 0,
              duplicadasOmitidas: 0, contradicciones: 0, colisionesTotal: 0,
              suprimidasSinTupla: 0, violacionesSuprimidas: 0,
              sepeTotal: null, tgssTotal: null, warnings: [],
              motivo: String((e as Error).message).slice(0, 500),
            })
          }
          hechos++
          if (hechos % 500 === 0) console.log(`[progreso] ${hechos}/${universo.length}`)
        }
      })(),
    )
  }
  await Promise.all(workers)

  const orden = new Map(universo.map((ine, i) => [ine, i]))
  resultados.sort((a, b) => (orden.get(a.ine) ?? 0) - (orden.get(b.ine) ?? 0))
  // En modo subconjunto (--codes/--limit/--offset) el manifest es acumulativo:
  // se fusiona con los resultados previos en vez de sobrescribirlos.
  let acumulado: IneResult[] = resultados
  if (esSubconjunto) {
    const fusion = new Map<string, IneResult>()
    for (const [ine, r] of Object.entries(previos)) fusion.set(ine, r)
    for (const r of resultados) fusion.set(r.ine, r)
    acumulado = [...fusion.values()].sort((a, b) => (a.ine < b.ine ? -1 : a.ine > b.ine ? 1 : 0))
  }
  const conBase = acumulado.filter((r) => r.estado !== 'sin_base_r2' && r.estado !== 'error')
  const finales = conBase.map((r) => r.finalBytes).sort((a, b) => a - b)
  const superan = conBase.filter((r) => r.finalBytes >= BUDGET_BYTES)
  const conDetalle = conBase.filter((r) => r.nuevas > 0)
  const sinCambios = conBase.filter((r) => r.nuevas === 0)
  const errores = acumulado.filter((r) => r.estado === 'error')
  const sinBase = acumulado.filter((r) => r.estado === 'sin_base_r2')
  const contradicciones = acumulado.reduce((a, r) => a + r.contradicciones, 0)
  const colisiones = acumulado.reduce((a, r) => a + r.colisionesTotal, 0)
  const violaciones = acumulado.reduce((a, r) => a + r.violacionesSuprimidas, 0)
  const warningsN = acumulado.reduce((a, r) => a + r.warnings.length, 0)

  const manifest = {
    generado: new Date().toISOString(),
    modo: args.doWrite ? 'write' : 'parse-only',
    tipo_sync: SYNC_TIPO,
    periodo: PERIODO,
    tableIds: [SEPE_TABLE, TGSS_TABLE],
    presupuestoBytes: BUDGET_BYTES,
    fuentes: { sepe: SEPE_URL, tgss: TGSS_URL },
    pendingAudit,
    universo: esSubconjunto ? acumulado.length : universo.length,
    conDetalleNuevo: conDetalle.length,    sinCambios: sinCambios.length,
    sinBaseR2: sinBase.length,
    errores: errores.length,
    contradicciones,
    colisionesConTotal: colisiones,
    violacionesSuprimidas: violaciones,
    warnings: warningsN,
    superacionesPresupuesto: superan.map((r) => r.ine),
    bytes: conBase.length > 0 ? {
      min: finales[0],
      mediana: finales[Math.floor(finales.length / 2)],
      max: finales[finales.length - 1],
    } : { min: 0, mediana: 0, max: 0 },
    resultados: acumulado,
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(
    `[fin] procesados=${resultados.length} acumulado=${acumulado.length} detalle_nuevo=${conDetalle.length} sin_cambios=${sinCambios.length} ` +
      `sin_base=${sinBase.length} errores=${errores.length} contradicciones=${contradicciones} ` +
      `colisiones=${colisiones} violaciones=${violaciones} warnings=${warningsN} ` +
      `KB[min/med/max]=[${finales.length > 0 ? (finales[0] / 1024).toFixed(1) : '–'}/` +
      `${finales.length > 0 ? (finales[Math.floor(finales.length / 2)] / 1024).toFixed(1) : '–'}/` +
      `${finales.length > 0 ? (finales[finales.length - 1] / 1024).toFixed(1) : '–'}] superaciones=${superan.length}`,
  )
  console.log(`Manifest en ${manifestPath} (SOLO tmp${args.doWrite ? '; escritura R2 + data_sync_runs realizadas' : ', sin escrituras R2/Supabase'}).`)
  if (errores.length > 0 || superan.length > 0 || contradicciones > 0 || colisiones > 0 || violaciones > 0) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
