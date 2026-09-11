// Preflight nacional de capas INE (Fase 4) — SOLO LECTURA.
// Mide match territorial real (códigos INE-5 en el catálogo de series INE),
// construye objetos de muestra para los municipios de prueba y valida el
// contrato. Cero escrituras R2/Supabase.
//
// Uso: npx tsx scripts/preflight-ine-layers-national.ts [--layer=migration]
//      [--sample=02003,07010,02069,28143,02065,28079,50297] [--out=tmp/...]
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import {
  INE_LAYERS_V1_SCHEMA,
  validateMunicipalIneLayers,
  type IneMigrationYear,
  type IneValue,
  type MunicipalIneLayersV1,
} from '../src/lib/socideas-ine-layers'

config({ path: '.env.local' })

const INE = 'https://servicios.ine.es/wstempus/js/ES'
const CATALOG_PATH = 'scripts/data/municipios-ine.json'
const MATCH_GATE = 0.995
const MAX_BYTES = 25 * 1024

interface CatalogMuni { codigo_ine: string; nombre: string; provincia_codigo: string }
interface SeriesMetaItem { Id?: number; FK_Variable?: number; Nombre?: string; Codigo?: string }
interface SeriesMeta { MetaData?: SeriesMetaItem[] }
interface IneDataRow { COD?: string; Nombre?: string; Data?: { Anyo?: number; Valor?: number | null; T3_TipoDato?: string }[] }

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

function loadCatalog(): Map<string, CatalogMuni> {
  const list = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as CatalogMuni[]
  return new Map(list.map((m) => [m.codigo_ine, m]))
}

async function fetchJson(url: string, timeoutMs = 180000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

function valueOf(row: IneDataRow | undefined, anyo: number, unit: string, tableId: string): IneValue | null {
  const point = row?.Data?.find((d) => d.Anyo === anyo)
  if (!point) return null
  const published = typeof point.Valor === 'number' && Number.isFinite(point.Valor)
  return {
    value: published ? (point.Valor as number) : null,
    unit,
    status: published ? 'observed' : 'suppressed',
    source: 'INE',
    tableId,
    period: String(anyo),
    derived: false,
    definition: 'Saldo migratorio publicado por el INE (inmigraciones − emigraciones).',
  }
}

/** Construye la capa de movilidad migratoria de un municipio a partir de DATOS_TABLA. */
function buildMigrationObject(
  ineCode: string,
  name: string,
  rows: IneDataRow[],
  tableId: string,
): MunicipalIneLayersV1 {
  const find = (sex: string, saldo: string) =>
    rows.find((r) => (r.Nombre ?? '').includes(sex) && (r.Nombre ?? '').includes(saldo))
  const totalRow = find('Ambos sexos', 'Saldo total')
  const interiorRow = find('Ambos sexos', 'Saldo interior')
  const exteriorRow = find('Ambos sexos', 'Saldo exterior')
  const maleRow = find('Hombres', 'Saldo total')
  const femaleRow = find('Mujeres', 'Saldo total')

  const years = [...new Set((totalRow?.Data ?? []).map((d) => d.Anyo).filter((a): a is number => typeof a === 'number'))]
    .sort((a, b) => a - b)

  const annualSeries: IneMigrationYear[] = years.map((anyo) => {
    const total = valueOf(totalRow, anyo, 'personas', tableId)
    const interior = valueOf(interiorRow, anyo, 'personas', tableId)
    const exterior = valueOf(exteriorRow, anyo, 'personas', tableId)
    const male = valueOf(maleRow, anyo, 'personas', tableId)
    const female = valueOf(femaleRow, anyo, 'personas', tableId)
    return {
      period: String(anyo),
      total: total ?? { value: null, unit: 'personas', status: 'missing', source: 'INE', tableId, period: String(anyo), derived: false },
      interior: interior ?? { value: null, unit: 'personas', status: 'missing', source: 'INE', tableId, period: String(anyo), derived: false },
      exterior: exterior ?? { value: null, unit: 'personas', status: 'missing', source: 'INE', tableId, period: String(anyo), derived: false },
      bySex:
        male && female
          ? {
              total: total ?? male,
              male,
              female,
            }
          : undefined,
    }
  })

  const latest = annualSeries.length > 0 ? annualSeries[annualSeries.length - 1] : undefined
  const checksum = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  return {
    schemaVersion: INE_LAYERS_V1_SCHEMA,
    ineCode,
    municipalityName: name,
    generatedAt: new Date().toISOString(),
    layers: {
      migration: {
        period: latest?.period ?? '—',
        annualSeries,
        latest,
        status: latest && latest.total.status === 'observed' ? 'observed' : 'suppressed',
      },
    },
    quality: {
      territoryMatch: 'exact',
      sourceChecksums: { [tableId]: checksum },
      validationStatus: 'passed',
    },
  }
}

async function main(): Promise<void> {
  const layer = arg('layer', 'migration')
  const tableId = layer === 'migration' ? '69767' : '33578'
  const sampleArg = arg('sample', '02003,07010,02069,28143,02065,28079,50297,08019,41091')
  const out = arg('out', `tmp/ine-layers-${layer}.json`)
  const datasetOut = `tmp/ine-layers-${layer}.dataset.json`
  const catalog = loadCatalog()

  console.log(`Preflight de capa ${layer} (tabla INE ${tableId}) · catálogo ${catalog.size}`)

  const series = (await fetchJson(`${INE}/SERIES_TABLA/${tableId}?tip=M`)) as SeriesMeta[]
  const codeToValueId = new Map<string, number>()
  const seen = new Set<string>()
  for (const s of series) {
    for (const m of s.MetaData ?? []) {
      if (m.Codigo && /^\d{5}$/.test(m.Codigo) && typeof m.Id === 'number') {
        seen.add(m.Codigo)
        if (!codeToValueId.has(m.Codigo)) codeToValueId.set(m.Codigo, m.Id)
      }
    }
  }
  const matched = [...seen].filter((c) => catalog.has(c)).length
  const matchPct = Math.round((matched / catalog.size) * 10000) / 100
  const passesMatchGate = matchPct / 100 >= MATCH_GATE
  console.log(`Códigos INE-5 en series: ${seen.size} · match catálogo: ${matched}/${catalog.size} (${matchPct} %)`)

  const samples: { ine: string; bytes: number; valid: boolean; years: number; errors: string[] }[] = []
  const objects: MunicipalIneLayersV1[] = []
  const codes = sampleArg.split(/[\s,]+/).map((c) => c.trim()).filter((c) => /^\d{5}$/.test(c))
  for (const code of codes) {
    const meta = catalog.get(code)
    if (!meta) {
      samples.push({ ine: code, bytes: 0, valid: false, years: 0, errors: ['no está en el catálogo local'] })
      continue
    }
    const valueId = codeToValueId.get(code)
    if (!valueId) {
      samples.push({ ine: code, bytes: 0, valid: false, years: 0, errors: ['sin valor municipal en el catálogo de series INE'] })
      continue
    }
    try {
      const rows = (await fetchJson(`${INE}/DATOS_TABLA/${tableId}?nult=30&tip=A&tv=19:${valueId}`)) as IneDataRow[]
      const obj = buildMigrationObject(code, meta.nombre, rows, tableId)
      const parsed = validateMunicipalIneLayers(obj)
      const bytes = Buffer.byteLength(JSON.stringify(obj), 'utf8')
      samples.push({ ine: code, bytes, valid: parsed.ok, years: obj.layers.migration?.annualSeries?.length ?? 0, errors: parsed.ok ? [] : parsed.errors })
      if (parsed.ok) objects.push(obj)
    } catch (e) {
      samples.push({ ine: code, bytes: 0, valid: false, years: 0, errors: [e instanceof Error ? e.message : 'error'] })
    }
  }

  const validSizes = samples.filter((s) => s.valid).map((s) => s.bytes).sort((a, b) => a - b)
  const p95 = validSizes.length > 0 ? validSizes[Math.min(validSizes.length - 1, Math.ceil(validSizes.length * 0.95) - 1)] : 0
  const p95Ok = p95 > 0 && p95 <= MAX_BYTES
  const allValid = samples.length > 0 && samples.every((s) => s.valid)
  const passesGate = passesMatchGate && p95Ok && allValid

  const summary = {
    layer,
    tableId,
    generatedAt: new Date().toISOString(),
    catalogSize: catalog.size,
    municipalCodes: seen.size,
    matched,
    matchPct,
    passesMatchGate,
    sampleCount: samples.length,
    samples,
    p95Bytes: p95,
    maxBytes: MAX_BYTES,
    passesGate,
  }
  writeFileSync(out, JSON.stringify(summary, null, 2))
  // Dataset de muestra (incompleto): el cargador exige `complete: true`.
  writeFileSync(datasetOut, JSON.stringify({ layer, complete: false, objects, generatedAt: summary.generatedAt }, null, 2))

  console.log(`\nMunicipios de prueba (${samples.length}):`)
  for (const s of samples) {
    console.log(`  ${s.ine}: ${s.valid ? 'VÁLIDO' : 'INVÁLIDO'} · ${s.years} años · ${s.bytes} B${s.errors.length ? ' · ' + s.errors.join(',') : ''}`)
  }
  console.log(`\np95 muestra: ${p95} B (tope ${MAX_BYTES})`)
  console.log(`Match gate ≥99,5 %: ${passesMatchGate ? 'SÍ' : 'NO'} · Gate global: ${passesGate ? 'SÍ' : 'NO'}`)
  console.log(`Resumen en ${out} · dataset de muestra en ${datasetOut}`)

  if (!passesGate) {
    console.error('\nPreflight NO superado: no se debe cargar esta capa.')
    process.exit(1)
  }
  console.log('\nPreflight superado en muestra. La carga real requiere dataset nacional completo y credenciales R2.')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
