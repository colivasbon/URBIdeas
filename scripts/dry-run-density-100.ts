// Dry-run de densidad a 100 municipios estratificados (10/10/80).
// CALCULA y MIDE, no publica nada: sin escrituras R2/Supabase, sin migraciones.
// - Superficie: IGN IGN_INFOGEO_MUNICIPIOS.xlsx (descarga real; se reutiliza la
//   copia de tmp/density-sample/ si existe).
// - Población: reutilizada de R2 v2 pública (solo lectura); no recarga padrón.
// - Estratos: 10 fijos de la misión + 10 extremos del catálogo local
//   (5 mayor + 5 menor población, excluyendo fijos) + 80 aleatorios
//   estratificados por provincia (round-robin con PRNG de semilla fija).
// - Por municipio: mismo delta v2 que dry-run-density-sample (área + densidad,
//   tuplas de 9, presupuesto ~150 KB/bloque) + medida de bytes.
// Uso: npx tsx scripts/dry-run-density-100.ts
// Salida: tmp/density-100/{ine}.json (100) + summary.json + manifest.json (gitignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import * as XLSX from 'xlsx'
import {
  ANIO_SUPERFICIE,
  AREA_SLUG,
  AREA_UNIT,
  DENSITY_SLUG,
  DENSITY_UNIT,
  IGN_INFOGEO_SOURCE,
  IGN_SURFACE_URLS,
  NGMEP_TABLE_ID,
  calcDensity,
  densityDetailLabel,
  densityYearsWarning,
} from '../src/lib/socideas-density'

config({ path: '.env.local' })

const R2_BASE =
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const OUT_DIR = join('tmp', 'density-100')
const IGN_CANDIDATES = [
  join('tmp', 'density-sample', 'IGN_INFOGEO_MUNICIPIOS_2026-09-16.xlsx'),
  join(OUT_DIR, 'IGN_INFOGEO_MUNICIPIOS_2026-09-16.xlsx'),
]

// 10 fijos de la misión (dry-run-density-sample).
const FIJOS = [
  '01001', '07010', '28079', '28143', '08019',
  '41091', '29067', '35003', '46250', '15030',
]

const SEED = 20260916
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface CatalogoEntry {
  codigo_ine: string
  nombre: string
  provincia_codigo: string
  poblacion: number
}

interface R2V2 {
  version: number
  codigo_ine: string
  generado_en: string
  indicators: { slug: string; nombre: string; unidad: string | null }[]
  sources: { slug: string; organismo: string; nombre: string }[]
  source_urls: string[]
  dimensiones: Record<string, string>[]
  valores: [number, number, number | null, string | null, number, number, string | null, string | null, string][]
}

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  if (!ok) console.log(`FAIL — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function buildList(): { lista: string[]; reserva: string[]; estratos: Record<string, string[]> } {
  const raw = JSON.parse(readFileSync(join('scripts', 'data', 'municipios-ine.json'), 'utf-8')) as CatalogoEntry[]
  const validos = raw.filter((e) => /^\d{5}$/.test(e.codigo_ine))
  const elegidos = new Set<string>(FIJOS)

  // 10 extremos del catálogo local (solo estratificación, la población oficial
  // de cada cálculo sale de R2): 5 mayor + 5 menor, excluyendo fijos.
  const porPob = [...validos].sort((a, b) => b.poblacion - a.poblacion)
  const extremos: string[] = []
  for (const e of porPob) {
    if (extremos.length >= 5) break
    if (!elegidos.has(e.codigo_ine)) { extremos.push(e.codigo_ine); elegidos.add(e.codigo_ine) }
  }
  const porPobAsc = [...validos].sort((a, b) => a.poblacion - b.poblacion)
  let menores = 0
  for (const e of porPobAsc) {
    if (menores >= 5) break
    if (!elegidos.has(e.codigo_ine)) { extremos.push(e.codigo_ine); elegidos.add(e.codigo_ine); menores += 1 }
  }

  // 80 estratificados por provincia: round-robin con barajado de semilla fija.
  const porProv = new Map<string, CatalogoEntry[]>()
  for (const e of validos) {
    if (elegidos.has(e.codigo_ine)) continue
    const arr = porProv.get(e.provincia_codigo) ?? []
    arr.push(e)
    porProv.set(e.provincia_codigo, arr)
  }
  const rand = mulberry32(SEED)
  for (const arr of porProv.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
  const provs = [...porProv.keys()].sort()
  const estrato80: string[] = []
  // Reserva de 10 (mismo orden round-robin) por si algún elegido no tiene
  // envelope R2 (404): se sustituye y se documenta en el manifest.
  const reserva: string[] = []
  let ronda = 0
  while ((estrato80.length < 80 || reserva.length < 10) && ronda < 10000) {
    let avanzo = false
    for (const p of provs) {
      const arr = porProv.get(p) ?? []
      const idx = ronda
      if (idx < arr.length) {
        const ine = arr[idx].codigo_ine
        elegidos.add(ine)
        if (estrato80.length < 80) estrato80.push(ine)
        else if (reserva.length < 10) reserva.push(ine)
        avanzo = true
      }
    }
    if (!avanzo) break
    ronda += 1
  }

  return {
    lista: [...FIJOS, ...extremos, ...estrato80],
    reserva,
    estratos: { fijos: FIJOS, extremos, estratificados_provincia: estrato80 },
  }
}

const MUNI_DIM = JSON.stringify({ ambito: 'municipio' })

async function run(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const t0 = Date.now()
  const { lista, reserva, estratos } = buildList()
  check('lista de 100 (10/10/80)', lista.length === 100, `${lista.length}`)
  check(
    'sin duplicados',
    new Set(lista).size === lista.length,
    `${new Set(lista).size}/${lista.length}`,
  )

  const ignPath = IGN_CANDIDATES.find((p) => existsSync(p))
  check('fichero IGN disponible', ignPath !== undefined, ignPath ?? 'ausente')
  if (!ignPath) {
    console.log(`\nFallos: ${failures}`)
    process.exitCode = 1
    return
  }
  const wb = XLSX.readFile(ignPath)
  const sheet = wb.Sheets['IGN_INFOGEO_MUNICIPIOS']
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
  const header = rows[0] as string[]
  check(
    'cabecera IGN con Identificador + Superficie (km2)',
    header[0] === 'Identificador' && header[3] === 'Superficie (km2)',
    JSON.stringify(header.slice(0, 7)),
  )
  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && /^\d{5}$/.test(String(r[0] ?? '')))
  check('cobertura IGN total nacional (8132 municipios)', dataRows.length === 8132, `${dataRows.length} filas`)
  const superficieByIne = new Map<string, { nombre: string; superficieKm2: number }>()
  for (const r of dataRows) {
    const sup = Number(r[3])
    if (Number.isFinite(sup) && sup > 0) {
      superficieByIne.set(String(r[0]), { nombre: String(r[1] ?? ''), superficieKm2: sup })
    }
  }
  const conSup = lista.filter((ine) => superficieByIne.has(ine))
  check('superficie IGN para los 100', conSup.length === 100, `${conSup.length}/100`)

  const summary: Record<string, unknown>[] = []
  const reemplazos: Record<string, string>[] = []
  let ok = 0
  let sinPoblacion = 0
  let maxDeltaKb = 0
  let sumaDeltaKb = 0

  const cola = [...lista]
  for (let i = 0; i < cola.length; i++) {
    const ine = cola[i]
    const res = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`)
    if (res.status === 404 && reserva.length > 0) {
      // Sin envelope R2 (municipio no sincronizado): sustituto documentado.
      await res.text().catch(() => '')
      const sustituto = reserva.shift() as string
      reemplazos.push({ original: ine, sustituto, motivo: 'HTTP 404 sin envelope R2' })
      cola.push(sustituto)
      continue
    }
    check(`${ine} R2 v2 legible`, res.status === 200, `HTTP ${res.status}`)
    if (res.status !== 200) continue
    const env = (await res.json()) as R2V2
    if (!(env.version === 2 && env.valores.every((t) => t.length === 9))) {
      check(`${ine} envelope v2 con tuplas de 9`, false)
      continue
    }

    const popIdx = env.indicators.findIndex((i) => i.slug === 'population_total')
    let pop: { anio: number; valor: number; urlIdx: number; tableId: string | null; serieId: string | null } | null = null
    if (popIdx >= 0) {
      for (const t of env.valores) {
        if (t[0] !== popIdx || t[2] === null) continue
        if (JSON.stringify(env.dimensiones[t[4]]) !== MUNI_DIM) continue
        if (!pop || t[1] > pop.anio) {
          pop = { anio: t[1], valor: t[2] as number, urlIdx: t[5], tableId: t[6], serieId: t[7] }
        }
      }
    }
    if (!pop) {
      sinPoblacion += 1
      check(`${ine} población municipal reutilizada de R2`, false, 'ausente')
      continue
    }

    const sup = superficieByIne.get(ine) ?? null
    const calc = calcDensity({
      poblacion: pop.valor,
      anioPoblacion: pop.anio,
      superficieKm2: sup?.superficieKm2 ?? null,
      anioSuperficie: ANIO_SUPERFICIE,
    })
    const warning = densityYearsWarning(pop.anio, ANIO_SUPERFICIE)

    const indicators = [...env.indicators,
      { slug: AREA_SLUG, nombre: 'Superficie municipal', unidad: AREA_UNIT },
      { slug: DENSITY_SLUG, nombre: 'Densidad de población', unidad: DENSITY_UNIT }]
    const sources = [...env.sources, { ...IGN_INFOGEO_SOURCE }]
    const sourceUrls = [...env.source_urls]
    for (const u of IGN_SURFACE_URLS) if (!sourceUrls.includes(u)) sourceUrls.push(u)
    const dimMuni = env.dimensiones.findIndex((d) => JSON.stringify(d) === MUNI_DIM)
    const urlIgn = sourceUrls.indexOf(IGN_SURFACE_URLS[0])
    const areaIdx = indicators.length - 2
    const densIdx = indicators.length - 1
    const delta: R2V2['valores'] = []
    if (sup) {
      delta.push([areaIdx, ANIO_SUPERFICIE, sup.superficieKm2, AREA_UNIT, dimMuni, urlIgn, NGMEP_TABLE_ID, null, 'validado'])
    }
    if (calc.valor !== null) {
      delta.push([densIdx, pop.anio, calc.valor, DENSITY_UNIT, dimMuni, pop.urlIdx, pop.tableId, null, 'validado'])
    }
    if (delta.length !== 2) {
      check(`${ine} delta con 2 filas (área + densidad)`, false, `${delta.length} filas`)
      continue
    }

    const before = JSON.stringify(env).length
    const merged: R2V2 = { ...env, indicators, sources, source_urls: sourceUrls, valores: [...env.valores, ...delta] }
    const after = JSON.stringify(merged).length
    const deltaBytes = after - before
    const deltaKb = deltaBytes / 1024
    if (!(deltaBytes < 150 * 1024)) {
      check(`${ine} delta bajo presupuesto (~150 KB/bloque)`, false, `+${deltaKb.toFixed(2)} KB`)
      continue
    }
    maxDeltaKb = Math.max(maxDeltaKb, deltaKb)
    sumaDeltaKb += deltaKb

    const bySlug = new Map(merged.sources.map((s) => [s.slug, s]))
    const tableToSource = (tableId: string | null): string => {
      if (tableId === NGMEP_TABLE_ID) return IGN_INFOGEO_SOURCE.slug // línea propuesta en sourceSlugForTable
      if (tableId === '2895' || tableId === '2853') return 'ine_tempus3'
      return merged.sources[0]?.slug ?? ''
    }
    const attribution = delta.map((t) => ({
      slug: indicators[t[0]].slug,
      fuente_atribuida: bySlug.get(tableToSource(t[6]))?.organismo ?? null,
      url: merged.source_urls[t[5]],
    }))

    writeFileSync(join(OUT_DIR, `${ine}.json`), JSON.stringify({
      codigo_ine: ine,
      nombre_ign: sup?.nombre ?? null,
      fuente_superficie: {
        fichero: 'IGN_INFOGEO_MUNICIPIOS.xlsx',
        urls: [...IGN_SURFACE_URLS],
        anio_superficie: ANIO_SUPERFICIE,
      },
      poblacion: { valor: pop.valor, anio: pop.anio, tabla: pop.tableId, serie: pop.serieId },
      superficie_km2: sup?.superficieKm2 ?? null,
      formula: `${pop.valor} hab (${pop.anio}) / ${sup?.superficieKm2} km² (IGN ${ANIO_SUPERFICIE})`,
      densidad_hab_km2: calc.valor,
      detalle_etiqueta: densityDetailLabel(pop.anio, ANIO_SUPERFICIE),
      aviso_anios_no_contemporaneos: warning,
      delta_v2: { indicators: indicators.slice(-2), sources: sources.slice(-1), valores: delta },
      atribucion_simulada: attribution,
      bytes: { envelope_original: before, delta: deltaBytes, envelope_simulado: after },
    }, null, 2))
    summary.push({
      ine,
      nombre: sup?.nombre ?? null,
      poblacion: pop.valor,
      anio_poblacion: pop.anio,
      superficie_km2: sup?.superficieKm2 ?? null,
      anio_superficie: ANIO_SUPERFICIE,
      densidad: calc.valor,
      aviso_anios: warning !== null,
      delta_kb: Math.round(deltaKb * 100) / 100,
    })
    ok += 1
  }

  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  const manifest = {
    dry_run: 'densidad-100',
    fecha_utc: new Date().toISOString(),
    estratos: { descripcion: '10 fijos misión + 10 extremos catálogo + 80 round-robin por provincia', semilla_prng: SEED, ...estratos },
    catalogo_local: 'scripts/data/municipios-ine.json (solo estratificación; la población de cada cálculo sale de R2)',
    fuente_superficie: {
      fichero: ignPath,
      urls: [...IGN_SURFACE_URLS],
      anio_superficie: ANIO_SUPERFICIE,
      filas_municipio: dataRows.length,
      licencia: 'CC BY 4.0 ign.es',
    },
    resultados: {
      ok,
      medidos: summary.length,
      objetivo: 100,
      fallos: failures,
      reemplazos,
      sin_poblacion_r2: sinPoblacion,
      delta_kb_max: Math.round(maxDeltaKb * 100) / 100,
      delta_kb_media: ok > 0 ? Math.round((sumaDeltaKb / ok) * 100) / 100 : null,
      presupuesto_kb_bloque: 150,
    },
    notas: [
      'Sin escrituras R2/Supabase, sin migraciones, sin cambios en el envelope real.',
      'La atribución NGMEP→ign_infogeo está simulada en local (1 línea propuesta en sourceSlugForTable, fuera de alcance).',
    ],
    duracion_s: Math.round((Date.now() - t0) / 1000),
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nDensidad-100: OK=${ok} medidos=${summary.length}/100 fallos=${failures} sin_poblacion=${sinPoblacion} reemplazos=${reemplazos.length} delta_max=${maxDeltaKb.toFixed(2)}KB media=${ok > 0 ? (sumaDeltaKb / ok).toFixed(2) : '—'}KB en ${OUT_DIR}/`)
  process.exit(failures > 0 || summary.length !== 100 ? 1 : 0)
}

run().catch((err) => {
  console.error(`ERROR dry-run-100: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
