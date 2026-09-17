// Dry-run mercado de trabajo (SUBAGENTE 2, Fase 2B): verifica el diseño v2
// laboral con los FICHEROS REALES, sin escribir en R2/Supabase.
//
// Uso:
//   npx tsx scripts/dry-run-labor-sepe-tgss.ts [--ines 01001,28079] [--limit 10]
//     [--sepe-csv tmp/labor-sample/Paro_por_municipios_2026_csv.csv]
//     [--tgss-xlsx tmp/labor-sample/Muni072026.xlsx]
//     [--out tmp/labor-sample] [--force] [--r2-base https://…]
//
// Flujo por municipio: lee envelope v2 VIVO de R2 (solo lectura pública) →
// parsea filas SEPE (julio 2026, último mes del CSV) + TGSS (julio 2026) →
// construye tuplas de DETALLE (las totales ya cargadas se reutilizan, no se
// duplican) → recompacta con toV2Envelope → mide JSON.stringify(v2).length →
// exige < 150 KB → escribe muestra en tmp/ (NADA en R2 real).
// Reanudable: salta municipios con muestra existente salvo --force.
// Sin datos ficticios: celdas suprimidas (<5, >=X) se omiten y se justifican.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import {
  expandV2Envelope,
  toV2Envelope,
  type R2MunicipioEnvelopeV2,
} from '../src/lib/socideas-r2'
import {
  buildSepeTuples,
  buildTgssTuples,
  mapTgssRow,
  parseSepeCsv,
  type LaborV2Input,
  type LaborWarning,
  type SepeMonthRow,
  type TgssMuniRow,
} from '../src/lib/socideas-labor-envelope'

const BUDGET_BYTES = 150 * 1024
const DEFAULT_INES = ['01001', '07010', '28079', '28143', '08019', '41091', '29067', '35003', '46250', '15030']
const FALLBACK_R2_BASE = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'

interface Args {
  ines: string[]
  limit?: number
  sepeCsv: string
  tgssXlsx: string
  out: string
  force: boolean
  r2Base: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const inesRaw = get('--ines')
  return {
    ines: inesRaw ? inesRaw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_INES,
    limit: get('--limit') !== undefined ? Number.parseInt(get('--limit') as string, 10) : undefined,
    sepeCsv: get('--sepe-csv') ?? join('tmp', 'labor-sample', 'Paro_por_municipios_2026_csv.csv'),
    tgssXlsx: get('--tgss-xlsx') ?? join('tmp', 'labor-sample', 'Muni072026.xlsx'),
    out: get('--out') ?? join('tmp', 'labor-sample'),
    force: argv.includes('--force'),
    r2Base: (get('--r2-base') ?? process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? process.env.SOCIDEAS_R2_PUBLIC_BASE ?? FALLBACK_R2_BASE).replace(/\/$/, ''),
  }
}

async function fetchR2(base: string, ine: string): Promise<R2MunicipioEnvelopeV2 | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${base}/socideas/v2/municipios/${ine}.json`, { signal: controller.signal })
    if (res.status !== 200) return null
    const json = (await res.json()) as R2MunicipioEnvelopeV2
    if (!json || json.codigo_ine !== ine || !Array.isArray(json.valores)) return null
    return json
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Último mes disponible en el CSV para el municipio (filas ya filtradas por INE). */
function latestSepeRow(rows: SepeMonthRow[]): SepeMonthRow | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.anio - b.anio || a.mes - b.mes)
  return sorted[sorted.length - 1] ?? null
}

function tupleKey(t: { slug: string; anio: number; dim: string; table: string }): string {
  return `${t.slug}|${t.anio}|${t.dim}|${t.table}`
}

async function main(): Promise<void> {
  const args = parseArgs()
  const ines = args.limit !== undefined ? args.ines.slice(0, args.limit) : args.ines
  mkdirSync(args.out, { recursive: true })

  if (!existsSync(args.sepeCsv)) throw new Error(`Falta CSV SEPE real: ${args.sepeCsv}`)
  if (!existsSync(args.tgssXlsx)) throw new Error(`Falta XLSX TGSS real: ${args.tgssXlsx}`)

  // SEPE: el CSV es Windows-1252 → decodificar como latin1 (conserva tildes).
  const sepeText = readFileSync(args.sepeCsv).toString('latin1')
  const sepeRows = parseSepeCsv(sepeText)
  const sepeByIne = new Map<string, SepeMonthRow[]>()
  for (const r of sepeRows) {
    const arr = sepeByIne.get(r.codigoIne) ?? []
    arr.push(r)
    sepeByIne.set(r.codigoIne, arr)
  }

  // TGSS: hoja única; localizar cabecera por "MUNICIPIO" y leer D..J.
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

  const manifest: Record<string, unknown>[] = []
  let failures = 0
  for (const ine of ines) {
    const outPath = join(args.out, `muestra-${ine}.json`)
    if (!args.force && existsSync(outPath)) {
      console.log(`[${ine}] muestra existente, se salta (usa --force para rehacer)`)
      continue
    }
    const live = await fetchR2(args.r2Base, ine)
    if (!live) {
      console.log(`[${ine}] SIN envelope R2 vivo → ND justificado (sin base para medir)`)
      manifest.push({ ine, estado: 'sin_base_r2', motivo: 'lectura pública R2 sin 200 válido' })
      failures++
      continue
    }
    const baseBytes = JSON.stringify(live).length
    const expanded = expandV2Envelope(live) as {
      indicator: { slug: string; nombre: string; unidad: string | null }
      source: { slug: string; organismo: string; nombre: string }
      anio_referencia: number | null
      valor_numerico: number | null
      unidad: string | null
      dimensiones: Record<string, string>
      source_url: string | null
      source_table_id: string | null
      source_series_id?: string | null
      estado_validacion: string
    }[]
    const seen = new Set(
      expanded.map((f) =>
        tupleKey({
          slug: f.indicator.slug,
          anio: f.anio_referencia ?? 0,
          dim: JSON.stringify(f.dimensiones),
          table: f.source_table_id ?? '',
        }),
      ),
    )

    const warnings: LaborWarning[] = []
    const fresh: LaborV2Input[] = []
    const sepeRow = latestSepeRow(sepeByIne.get(ine) ?? [])
    if (sepeRow) {
      const sepeUrl = `https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos/Paro_por_municipios_${sepeRow.anio}_csv.csv`
      for (const t of buildSepeTuples(sepeRow, sepeUrl, warnings)) {
        const k = tupleKey({ slug: t.indicator.slug, anio: t.anio_referencia, dim: JSON.stringify(t.dimensiones), table: t.source_table_id ?? '' })
        if (!seen.has(k)) {
          seen.add(k)
          fresh.push(t)
        }
      }
    }
    const tgssRow = tgssByIne.get(ine)
    if (tgssRow) {
      const tgssUrl = 'https://www.seg-social.es/descarga/es/Muni072026'
      for (const t of buildTgssTuples(tgssRow, 2026, 7, '2026-07', tgssUrl, warnings)) {
        const k = tupleKey({ slug: t.indicator.slug, anio: t.anio_referencia, dim: JSON.stringify(t.dimensiones), table: t.source_table_id ?? '' })
        if (!seen.has(k)) {
          seen.add(k)
          fresh.push(t)
        }
      }
    }

    const merged = toV2Envelope(ine, live.generado_en, [
      ...expanded.map((f) => ({
        indicator: f.indicator,
        source: f.source,
        anio_referencia: f.anio_referencia,
        valor_numerico: f.valor_numerico,
        unidad: f.unidad,
        dimensiones: f.dimensiones,
        source_url: f.source_url,
        source_table_id: f.source_table_id,
        source_series_id: f.source_series_id ?? null,
        estado_validacion: f.estado_validacion,
      })),
      ...fresh,
    ])
    const finalBytes = JSON.stringify(merged).length
    const ok = finalBytes < BUDGET_BYTES
    if (!ok) failures++
    writeFileSync(outPath, JSON.stringify(merged))
    const ndSepe = sepeRow ? sepeRow.total === null : true
    const ndTgss = tgssRow ? tgssRow.total === null : true
    console.log(
      `[${ine}] base=${baseBytes} nuevas=${fresh.length} final=${finalBytes} ` +
        `(${(finalBytes / 1024).toFixed(1)} KB) ${ok ? 'DENTRO' : 'FUERA'} de presupuesto; ` +
        `SEPE=${sepeRow ? `${sepeRow.periodo} total=${sepeRow.total ?? 'ND(suprimido <5)'}` : 'ND(sin fila)'}; ` +
        `TGSS=${tgssRow ? `2026-07 total=${tgssRow.total ?? 'ND(rango <5/> =X)'}` : 'ND(sin fila)'}; ` +
        `warnings=${warnings.length}${ndSepe || ndTgss ? ' (ND justificado, sin estimar)' : ''}`,
    )
    for (const w of warnings) console.log(`   ! ${w.regla}: ${w.detalle}`)
    manifest.push({
      ine,
      estado: ok ? 'muestra_ok' : 'presupuesto_excedido',
      baseBytes,
      tuplasNuevas: fresh.length,
      finalBytes,
      sepePeriodo: sepeRow?.periodo ?? null,
      sepeTotal: sepeRow?.total ?? null,
      tgssTotal: tgssRow?.total ?? null,
      warnings,
    })
  }

  writeFileSync(join(args.out, 'manifest-labor.json'), JSON.stringify({
    generado: new Date().toISOString(),
    presupuestoBytes: BUDGET_BYTES,
    fuentes: {
      sepe: 'https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos/Paro_por_municipios_2026_csv.csv',
      tgss: 'https://www.seg-social.es/descarga/es/Muni072026',
      catalogoSepe: 'https://datos.gob.es/es/catalogo/ea0041513-paro-registrado-por-municipios-desglosado-por-sexo-tramos-de-edad-y-sector-de-actividad-economica',
    },
    resultados: manifest,
  }, null, 2))
  console.log(`Muestras en ${args.out} (SOLO tmp, sin escrituras R2/Supabase). Fallos: ${failures}`)
  if (failures > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(`ERROR dry-run-labor: ${err instanceof Error ? err.message : 'desconocido'}`)
  process.exitCode = 1
})
