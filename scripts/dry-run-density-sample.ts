// Dry-run de densidad de población: CALCULA y MIDE, no publica nada.
// - Superficie: IGN IGN_INFOGEO_MUNICIPIOS.xlsx (descarga real verificada
//   2026-09-16, copia de procedencia en tmp/density-sample/). Nivel municipio
//   confirmado: Identificador = código INE 5 cifras, Superficie ya en km².
// - Población: reutiliza la YA cargada en R2 v2 pública (solo lectura, sin
//   credenciales); no recarga padrón ni toca el envelope real.
// - Calcula densidad = población / superficie como INDICADOR DERIVADO
//   (cálculo SOCideas, no dato INE), con años explícitos por componente y
//   aviso si no son contemporáneos (regla nunca-mezclar-en-silencio).
// - Construye el DELTA v2 por municipio (nuevos slugs area_km2 y
//   density_per_km2 + fuente ign_infogeo), simula el envelope fusionado y mide
//   bytes con JSON.stringify(v2).length (presupuesto ~150 KB/bloque).
// - NO escribe R2 ni Supabase, NO migra, NO integra en la ficha.
// Uso: npx tsx scripts/dry-run-density-sample.ts
// Salida: consola + tmp/density-sample/{ine}.json + tmp/density-sample/summary.json (gitignored).
import { mkdirSync, writeFileSync } from 'node:fs'
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
const OUT_DIR = join('tmp', 'density-sample')
const IGN_XLSX = join(OUT_DIR, 'IGN_INFOGEO_MUNICIPIOS_2026-09-16.xlsx')

// 10 municipios de la misión (código INE 5 dígitos).
const MUNICIPIOS = [
  '01001', '07010', '28079', '28143', '08019',
  '41091', '29067', '35003', '46250', '15030',
]

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
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

// ---------- 1. Superficies IGN (descarga real, cabeceras inspeccionadas) ----------

const wb = XLSX.readFile(IGN_XLSX)
const sheet = wb.Sheets['IGN_INFOGEO_MUNICIPIOS']
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
const header = rows[0] as string[]
check('cabecera IGN con Identificador + Superficie (km2)',
  header[0] === 'Identificador' && header[3] === 'Superficie (km2)',
  JSON.stringify(header.slice(0, 7)))
const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && /^\d{5}$/.test(String(r[0] ?? '')))
check('cobertura IGN total nacional (8132 municipios)', dataRows.length === 8132, `${dataRows.length} filas`)
const superficieByIne = new Map<string, { nombre: string; superficieKm2: number }>()
for (const r of dataRows) {
  const ine = String(r[0])
  const sup = Number(r[3])
  if (MUNICIPIOS.includes(ine) && Number.isFinite(sup) && sup > 0) {
    superficieByIne.set(ine, { nombre: String(r[1] ?? ''), superficieKm2: sup })
  }
}
check('superficie IGN para los 10 municipios', superficieByIne.size === 10, `${superficieByIne.size}/10`)

// ---------- 2-4. Población R2 + cálculo + delta v2, por municipio ----------

const MUNI_DIM = JSON.stringify({ ambito: 'municipio' })

async function run(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const summary: Record<string, unknown>[] = []

  for (const ine of MUNICIPIOS) {
    const res = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`)
    check(`${ine} R2 v2 legible`, res.status === 200, `HTTP ${res.status}`)
    if (res.status !== 200) continue
    const env = (await res.json()) as R2V2
    check(`${ine} envelope v2 con tuplas de 9`, env.version === 2 && env.valores.every((t) => t.length === 9))

    // Población: reutilizar la ya cargada (population_total, ámbito municipio, último año).
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
    check(`${ine} población municipal reutilizada de R2`, pop !== null,
      pop ? `${pop.valor} hab (${pop.anio}, tabla ${pop.tableId})` : 'ausente')

    const sup = superficieByIne.get(ine) ?? null
    const calc = calcDensity({
      poblacion: pop?.valor ?? null,
      anioPoblacion: pop?.anio ?? null,
      superficieKm2: sup?.superficieKm2 ?? null,
      anioSuperficie: ANIO_SUPERFICIE,
    })
    const warning = densityYearsWarning(pop?.anio ?? null, ANIO_SUPERFICIE)

    // Delta v2 (diseño): respeta tupla de 9 + dedup de catálogos (norma MEMORIA §3B).
    // - area: fuente IGN (tableId NGMEP → requiere 1 línea en sourceSlugForTable; ver socideas-density.ts).
    // - density: derivado; reutiliza urlIdx/tableId de la población (precedente population_change_5y).
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
    if (pop && calc.valor !== null) {
      delta.push([densIdx, pop.anio, calc.valor, DENSITY_UNIT, dimMuni, pop.urlIdx, pop.tableId, null, 'validado'])
    }
    check(`${ine} delta con 2 filas (área + densidad)`, delta.length === 2, `${delta.length} filas`)

    // Medida: envelope fusionado simulado vs original (JSON.stringify().length).
    const before = JSON.stringify(env).length
    const merged: R2V2 = { ...env, indicators, sources, source_urls: sourceUrls, valores: [...env.valores, ...delta] }
    const after = JSON.stringify(merged).length
    const deltaBytes = after - before
    check(`${ine} delta bajo presupuesto (~150 KB/bloque)`, deltaBytes < 150 * 1024, `+${(deltaBytes / 1024).toFixed(2)} KB`)

    // Atribución simulada: con la correspondencia NGMEP→ign_infogeo propuesta.
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

    const sample = {
      codigo_ine: ine,
      nombre_ign: sup?.nombre ?? null,
      fuente_superficie: {
        fichero: 'IGN_INFOGEO_MUNICIPIOS.xlsx (revisión 20/10/2025)',
        urls: [...IGN_SURFACE_URLS],
        anio_superficie: ANIO_SUPERFICIE,
      },
      poblacion: pop ? { valor: pop.valor, anio: pop.anio, tabla: pop.tableId, serie: pop.serieId } : null,
      superficie_km2: sup?.superficieKm2 ?? null,
      formula: pop && sup ? `${pop.valor} hab (${pop.anio}) / ${sup.superficieKm2} km² (IGN ${ANIO_SUPERFICIE})` : null,
      densidad_hab_km2: calc.valor,
      detalle_etiqueta: densityDetailLabel(pop?.anio ?? null, ANIO_SUPERFICIE),
      aviso_anios_no_contemporaneos: warning,
      delta_v2: { indicators: indicators.slice(-2), sources: sources.slice(-1), valores: delta },
      atribucion_simulada: attribution,
      bytes: { envelope_original: before, delta: deltaBytes, envelope_simulado: after },
    }
    writeFileSync(join(OUT_DIR, `${ine}.json`), JSON.stringify(sample, null, 2))
    summary.push({
      ine,
      nombre: sup?.nombre ?? null,
      poblacion: pop?.valor ?? null,
      anio_poblacion: pop?.anio ?? null,
      superficie_km2: sup?.superficieKm2 ?? null,
      anio_superficie: ANIO_SUPERFICIE,
      densidad: calc.valor,
      aviso_anios: warning !== null,
      delta_kb: Math.round((deltaBytes / 1024) * 100) / 100,
    })
    console.log(
      `${ine} ${sup?.nombre ?? ''}: pob=${pop?.valor ?? '—'} (${pop?.anio ?? '—'}) / sup=${sup?.superficieKm2 ?? '—'} km² (IGN ${ANIO_SUPERFICIE}) → dens=${calc.valor ?? '—'} hab/km²${warning ? ' [AVISO AÑOS]' : ''} · delta +${(deltaBytes / 1024).toFixed(2)} KB`,
    )
  }

  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(`\nMuestras en ${OUT_DIR}/ (10 municipios + summary.json). Fallos: ${failures}`)
  if (failures > 0) process.exitCode = 1
}

run().catch((err) => {
  console.error(`ERROR dry-run: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
