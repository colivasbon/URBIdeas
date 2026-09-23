/**
 * SIMULACIÓN CONPREL → envelopes R2 (SOLO LECTURA ESCRITURA LOCAL).
 *
 * Simula el parser de las dos familias sobre una muestra (CSVs `sim_*` en
 * temp extraídos del Access definitivo) y produce envelopes combinados
 * (ppto 2025 + liq 2024) en tmp/conprel-sim/*.json — NUNCA en R2 ni
 * Supabase. Mide: joins, nulos (entidades sin filas), tamaños <150 KB y
 * preservación de slugs del envelope preexistente.
 *
 * Contratos simulados (ver docs/conprel-integracion-partial-diseno.md):
 * - PPTO: tb_economica(id, idente, cdcta, tipreig, importe) — importe =
 *   presupuesto de la publicación definitiva (cdImporte=P, cdFase=U).
 * - LIQ:  tb_economica(..., imported, importer, importel, importec) —
 *   d=presupuesto definitivo, r=reconocidos (derechos/obligaciones),
 *   l=liquidado, c=ejercicio corriente (validado vs EL2025CT: match exacto).
 * - Clave única: (idente, cdcta, tipreig) — 0 duplicados verificados.
 * - Slugs provisionales SOLO para simulación (prefijo conprel_sim_*).
 *
 * Uso: npx tsx scripts/simular-conprel-envelopes.ts
 */
import * as fs from 'fs'
import * as path from 'path'

const CSV_DIR = path.join(process.env.TEMP ?? '.', 'opencode', 'conprel', 'csv')
const OUT_DIR = path.join(process.cwd(), 'tmp', 'conprel-sim')
const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  R2_PUBLIC_BASE_FALLBACK
).replace(/\/$/, '')
const SOURCE_URL_PPTO =
  'https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero?CCAA=&TipoDato=Presupuestos&Ejercicio=2025&TipoPublicacion=Access'
const SOURCE_URL_LIQ =
  'https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero?CCAA=&TipoDato=Liquidaciones&Ejercicio=2024&TipoPublicacion=Access'

function loadCsv(file: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(path.join(CSV_DIR, file), 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const hdr = (lines[0] ?? '').split('|')
  const out: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('|')
    const row: Record<string, string> = {}
    hdr.forEach((h, j) => (row[h] = (cells[j] ?? '').trim()))
    out.push(row)
  }
  return out
}

/** Importe en euros: coma decimal, puntos opcionales de miles. */
function parseImporte(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const s = raw.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const isChapter = (cdcta: string): boolean => /^\d$/.test(cdcta)

interface SimRow {
  slug: string
  anio: number
  valor: number
  unidad: string
  dim: Record<string, string>
  url: string
  tableId: string
}

async function fetchEnvelope(ine: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json' },
    })
    if (r.status !== 200) return null
    return (await r.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function mergeSimRows(env: Record<string, unknown>, rows: SimRow[]): void {
  const indicators = env.indicators as Array<{ slug: string; nombre: string; unidad: string | null }>
  const sources = env.sources as Array<{ slug: string; organismo: string; nombre: string }>
  const urls = env.source_urls as string[]
  const dims = env.dimensiones as Array<Record<string, string>>
  const valores = env.valores as unknown[][]
  // Fuente simulada (una sola)
  let si = sources.findIndex((s) => s.slug === 'hacienda_conprel_sim')
  if (si < 0) {
    sources.push({ slug: 'hacienda_conprel_sim', organismo: 'Ministerio de Hacienda (CONPREL)', nombre: 'Simulación parcial de integración — NO PUBLICADO' })
    si = sources.length - 1
  }
  void si // la fuente se resuelve por tableId en lectores reales; aquí va en la tupla vía tableId
  for (const row of rows) {
    let ii = indicators.findIndex((i) => i.slug === row.slug)
    if (ii < 0) {
      indicators.push({ slug: row.slug, nombre: row.slug.replace(/^conprel_sim_/, ''), unidad: row.unidad })
      ii = indicators.length - 1
    }
    let ui = urls.indexOf(row.url)
    if (ui < 0) { urls.push(row.url); ui = urls.length - 1 }
    const dimKey = JSON.stringify(row.dim)
    let di = dims.findIndex((d) => JSON.stringify(d) === dimKey)
    if (di < 0) { dims.push(row.dim); di = dims.length - 1 }
    // Idempotente: sustituye tupla previa mismo indicador+dimensión+año
    const existing = valores.findIndex(
      (t) => Array.isArray(t) && t[0] === ii && t[1] === row.anio && t[4] === di,
    )
    const tupla: unknown[] = [ii, row.anio, row.valor, row.unidad, di, ui, row.tableId, null, 'simulado']
    if (existing >= 0) valores[existing] = tupla
    else valores.push(tupla)
  }
}

async function main(): Promise<void> {
  console.log('=== SIMULACIÓN CONPREL → envelopes (solo tmp local) ===')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const invP = loadCsv('sim_inv_ppto.csv')
  const ecoP = loadCsv('sim_eco_ppto.csv')
  const invL = loadCsv('sim_inv_liq.csv')
  const ecoL = loadCsv('sim_eco_liq.csv')

  const ecoPByIdente = new Map<string, Array<Record<string, string>>>()
  for (const e of ecoP) {
    const k = e.idente
    if (!ecoPByIdente.has(k)) ecoPByIdente.set(k, [])
    ecoPByIdente.get(k)!.push(e)
  }
  const ecoLByIdente = new Map<string, Array<Record<string, string>>>()
  for (const e of ecoL) {
    const k = e.idente
    if (!ecoLByIdente.has(k)) ecoLByIdente.set(k, [])
    ecoLByIdente.get(k)!.push(e)
  }

  const ines = [...new Set([...invP, ...invL].map((r) => r.codente.slice(0, 5)))].sort()
  console.log(`Muestra: ${ines.length} INE · eco ppto=${ecoP.length} · eco liq=${ecoL.length}`)

  const metrics = {
    join: {
      conInventarioPpto: 0,
      conInventarioLiq: 0,
      sinInventarioPpto: [] as string[],
      sinInventarioLiq: [] as string[],
      entidadesConEcoPpto: 0,
      entidadesConEcoLiq: 0,
      entidadesSinEcoPpto: [] as string[],
      entidadesSinEcoLiq: [] as string[],
      filasCapituloPpto: 0,
      filasCapituloLiq: 0,
    },
    envelopes: {
      ok: 0,
      sinEnvelopeR2: [] as string[],
      bytesAntes: [] as number[],
      bytesDespues: [] as number[],
      slugsAntes: [] as number[],
      slugsDespues: [] as number[],
      slugsPerdidos: [] as string[],
      sobre150kb: [] as string[],
      simulados: 0,
    },
    nulos: {
      importeNuloPpto: 0,
      importeNuloLiq: 0,
      magnitudesLiqNulas: 0,
    },
  }

  for (const ine of ines) {
    const invRowP = invP.find((r) => r.codente.startsWith(ine))
    const invRowL = invL.find((r) => r.codente.startsWith(ine))
    if (invRowP) metrics.join.conInventarioPpto++
    else metrics.join.sinInventarioPpto.push(ine)
    if (invRowL) metrics.join.conInventarioLiq++
    else metrics.join.sinInventarioLiq.push(ine)

    const rows: SimRow[] = []
    // ── PPTO 2025 ──
    if (invRowP) {
      const ecos = ecoPByIdente.get(invRowP.idente) ?? []
      if (ecos.length > 0) metrics.join.entidadesConEcoPpto++
      else metrics.join.entidadesSinEcoPpto.push(ine)
      for (const e of ecos) {
        if (!isChapter(e.cdcta)) continue
        metrics.join.filasCapituloPpto++
        const v = parseImporte(e.importe)
        if (v === null) { metrics.nulos.importeNuloPpto++; continue }
        rows.push({
          slug: `conprel_sim_ppto_cd${e.cdcta}_${e.tipreig}`,
          anio: 2025,
          valor: v,
          unidad: 'euros',
          dim: { ambito: 'municipio', familia: 'presupuestos', fase: 'definitiva_publicacion' },
          url: SOURCE_URL_PPTO,
          tableId: 'CONPREL-PPTO-2025',
        })
      }
    }
    // ── LIQ 2024: cuatro magnitudes por capítulo ──
    if (invRowL) {
      const ecos = ecoLByIdente.get(invRowL.idente) ?? []
      if (ecos.length > 0) metrics.join.entidadesConEcoLiq++
      else metrics.join.entidadesSinEcoLiq.push(ine)
      const MAG: Array<[keyof Record<string, string>, string]> = [
        ['imported', 'd'], ['importer', 'r'], ['importel', 'l'], ['importec', 'c'],
      ]
      for (const e of ecos) {
        if (!isChapter(e.cdcta)) continue
        metrics.join.filasCapituloLiq++
        for (const [col, letter] of MAG) {
          const v = parseImporte(e[col])
          if (v === null) { metrics.nulos.magnitudesLiqNulas++; continue }
          // Zeros explícitos de la fuente se conservan como valor (no son ND).
          rows.push({
            slug: `conprel_sim_liq_${letter}_cd${e.cdcta}_${e.tipreig}`,
            anio: 2024,
            valor: v,
            unidad: 'euros',
            dim: { ambito: 'municipio', familia: 'liquidaciones', magnitud: letter },
            url: SOURCE_URL_LIQ,
            tableId: 'CONPREL-LIQ-2024',
          })
        }
      }
    }

    // ── Envelope combinado ──
    const env = await fetchEnvelope(ine)
    if (!env) { metrics.envelopes.sinEnvelopeR2.push(ine); continue }
    const bytesBefore = Buffer.byteLength(JSON.stringify(env), 'utf-8')
    const slugsBefore = new Set(((env.indicators as Array<{ slug: string }>) ?? []).map((i) => i.slug))

    mergeSimRows(env, rows)
    metrics.envelopes.simulados += rows.length

    const slugsAfter = new Set(((env.indicators as Array<{ slug: string }>) ?? []).map((i) => i.slug))
    const perdidos = [...slugsBefore].filter((s) => !slugsAfter.has(s))
    if (perdidos.length) metrics.envelopes.slugsPerdidos.push(`${ine}:${perdidos.join(',')}`)

    const bytesAfter = Buffer.byteLength(JSON.stringify(env), 'utf-8')
    if (bytesAfter > 150 * 1024) metrics.envelopes.sobre150kb.push(`${ine}:${bytesAfter}`)

    metrics.envelopes.ok++
    metrics.envelopes.bytesAntes.push(bytesBefore)
    metrics.envelopes.bytesDespues.push(bytesAfter)
    metrics.envelopes.slugsAntes.push(slugsBefore.size)
    metrics.envelopes.slugsDespues.push(slugsAfter.size)

    fs.writeFileSync(path.join(OUT_DIR, `${ine}.json`), JSON.stringify(env))
  }

  const maxB = (a: number[]) => (a.length ? Math.max(...a) : 0)
  const minB = (a: number[]) => (a.length ? Math.min(...a) : 0)
  const resumen = {
    fecha: new Date().toISOString(),
    soloLecturaR2Supabase: true,
    salidaLocal: OUT_DIR,
    muestra: { ines: ines.length, ecoPpto: ecoP.length, ecoLiq: ecoL.length },
    join: {
      inventarioPpto: `${metrics.join.conInventarioPpto}/${ines.length}`,
      inventarioLiq: `${metrics.join.conInventarioLiq}/${ines.length}`,
      sinInvPpto: metrics.join.sinInventarioPpto,
      sinInvLiq: metrics.join.sinInventarioLiq,
      conEcoPpto: metrics.join.entidadesConEcoPpto,
      conEcoLiq: metrics.join.entidadesConEcoLiq,
      sinEcoPpto: metrics.join.entidadesSinEcoPpto,
      sinEcoLiq: metrics.join.entidadesSinEcoLiq,
      filasCapituloPpto: metrics.join.filasCapituloPpto,
      filasCapituloLiq: metrics.join.filasCapituloLiq,
    },
    envelopes: {
      ok: metrics.envelopes.ok,
      sinR2: metrics.envelopes.sinEnvelopeR2,
      bytesMin: minB(metrics.envelopes.bytesDespues),
      bytesMax: maxB(metrics.envelopes.bytesDespues),
      bytesMaxAntes: maxB(metrics.envelopes.bytesAntes),
      deltaBytesMax: metrics.envelopes.bytesDespues.length
        ? maxB(metrics.envelopes.bytesDespues) - maxB(metrics.envelopes.bytesAntes)
        : 0,
      simulados: metrics.envelopes.simulados,
      slugsPerdidos: metrics.envelopes.slugsPerdidos,
      sobre150kb: metrics.envelopes.sobre150kb,
    },
    nulos: metrics.nulos,
  }
  console.log(JSON.stringify(resumen, null, 2))
  const out = path.join(OUT_DIR, `sim-report-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(resumen, null, 2))
  console.log(`\nEnvelopes simulados en ${OUT_DIR} · informe ${out}`)
  const pass =
    metrics.envelopes.slugsPerdidos.length === 0 &&
    metrics.envelopes.sobre150kb.length === 0 &&
    metrics.envelopes.ok > 0
  console.log(pass ? 'SIMULACIÓN OK' : 'SIMULACIÓN CON INCIDENCIAS')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
