// Auditoría de capas municipales INE candidatas (Fase 4) — SOLO LECTURA.
// Fuentes públicas INE (Tempus3). Cero escrituras R2/Supabase. Cero migraciones.
// Salida: consola + tmp/ine-layers-audit.json (ignorado por git).
//
// Uso: npx tsx scripts/audit-ine-layers.ts [--offline]
import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'

config({ path: '.env.local' })

const INE = 'https://servicios.ine.es/wstempus/js/ES'
const CATALOG_PATH = 'scripts/data/municipios-ine.json'
const OFFLINE = process.argv.includes('--offline')

interface CatalogMuni { codigo_ine: string; nombre: string; provincia_codigo: string }

function loadCatalog(): CatalogMuni[] {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as CatalogMuni[]
}

async function fetchJson(url: string, timeoutMs = 120000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (res.status !== 200) throw new Error(`HTTP ${res.status} en ${url}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function probe(url: string): Promise<{ status: number; contentType: string; bytes: number }> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    const buf = await res.arrayBuffer()
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', bytes: buf.byteLength }
  } catch {
    return { status: 0, contentType: '', bytes: 0 }
  }
}

interface SeriesMeta { MetaData?: { Id?: number; FK_Variable?: number; Nombre?: string; Codigo?: string }[] }

/** Extrae los códigos INE-5 presentes en el catálogo de series de una tabla. */
function municipalCodesFromSeries(series: unknown): Set<string> {
  const codes = new Set<string>()
  for (const s of (series as SeriesMeta[]) ?? []) {
    for (const m of s.MetaData ?? []) {
      if (m.Codigo && /^\d{5}$/.test(m.Codigo)) codes.add(m.Codigo)
    }
  }
  return codes
}

async function auditTempusTable(id: string, catalog: CatalogMuni[]): Promise<Record<string, unknown>> {
  const groups = (await fetchJson(`${INE}/GRUPOS_TABLA/${id}`)) as { Nombre?: string }[]
  const series = await fetchJson(`${INE}/SERIES_TABLA/${id}?tip=M`)
  const codes = municipalCodesFromSeries(series)
  const catalogCodes = new Set(catalog.map((c) => c.codigo_ine))
  const matched = [...codes].filter((c) => catalogCodes.has(c)).length
  const matchPct = catalogCodes.size > 0 ? Math.round((matched / catalogCodes.size) * 10000) / 100 : 0
  return {
    tableId: id,
    groups: groups.map((g) => g.Nombre ?? ''),
    seriesCount: Array.isArray(series) ? series.length : 0,
    municipalCodes: codes.size,
    catalogSize: catalogCodes.size,
    matched,
    matchPct,
    decision: matchPct >= 99.5 ? 'apta-para-carga' : 'no-apta',
  }
}

async function main(): Promise<void> {
  const catalog = loadCatalog()
  console.log(`Catálogo local: ${catalog.length} municipios`)

  const results: Record<string, unknown> = { generatedAt: new Date().toISOString(), catalogSize: catalog.length }

  if (OFFLINE) {
    console.log('Modo --offline: sin sondas de red.')
  } else {
    console.log('\n=== Tablas Tempus3 (municipal) ===')
    for (const id of ['69767', '33578']) {
      try {
        const r = await auditTempusTable(id, catalog)
        results[id] = r
        console.log(
          `TABLA ${id} · grupos=[${(r.groups as string[]).join(' / ')}] · series=${r.seriesCount} · ` +
            `INE-5=${r.municipalCodes}/${r.catalogSize} · match=${r.matchPct}% · ${r.decision}`,
        )
      } catch (e) {
        results[id] = { error: e instanceof Error ? e.message : 'error' }
        console.log(`TABLA ${id} · ERROR: ${e instanceof Error ? e.message : 'desconocido'}`)
      }
    }

    console.log('\n=== Tablas jaxi (Censo 2021 / Censo Agrario 2020) ===')
    for (const id of ['55249', '52071', '52076', '52081', '52082']) {
      const p = await probe(`https://www.ine.es/jaxi/Tabla.htm?tpx=${id}`)
      const tempus = await probe(`${INE}/GRUPOS_TABLA/${id}`)
      results[`jaxi_${id}`] = { jaxi: p, tempus3Groups: tempus }
      console.log(`jaxi ${id}: jaxi=${p.status} (${p.bytes} B) · tempus3-grupos=${tempus.status} → pendiente de endpoint municipal`)
    }
  }

  writeFileSync('tmp/ine-layers-audit.json', JSON.stringify(results, null, 2))
  console.log('\nAuditoría en tmp/ine-layers-audit.json')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
