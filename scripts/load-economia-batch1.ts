// Carga REAL nacional del bloque economía (Batch 1) en R2 – con autorización expresa.
// Uso:
//   npx tsx scripts/load-economia-batch1.ts --write --limit 500 --offset 0
//   npx tsx scripts/load-economia-batch1.ts --parse-only
//   npx tsx scripts/load-economia-batch1.ts --mock --write   → exit 1 (escritura con mock imposible)
//
// Reglas:
// - MERGE por municipio: lee el JSON existente, sustituye SOLO slugs de economía, preserva demografía.
// - Sin JSON previo: crea documento mínimo v2 y lo reporta aparte.
// - AEAT pendiente (sin XLSX del operador). SEPE solo julio 2026 (sin serie 12 meses).
// - Reutiliza tmp/economia/ (no re-descarga lo verificado). DIRCE: UNA descarga nult=1 + join por COD.
// - Read-back tras cada PUT (con cache-buster) + manifest tmp/economia/r2-load-manifest.json (resumible).
// - Registra data_sync_runs tipo=economia_batch1. Requiere .env.local (service_role + R2).
// - NUNCA imprime secretos (solo presencia/longitud).

import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import * as XLSX from 'xlsx'
import {
  expandV2Envelope,
  putMunicipioJson,
  readMunicipioJson,
  toV2Envelope,
} from '../src/lib/socideas-r2'
import type { R2MunicipioEnvelopeV2 } from '../src/lib/socideas-r2'
import { SOCIDEAS_ECONOMY_INDICATORS } from '../src/lib/socideas'

const TMP = join(process.cwd(), 'tmp/economia')
const MAP_PATH = join(process.cwd(), 'src/lib/adrh-province-tables.json')
const MANIFEST_PATH = join(TMP, 'r2-load-manifest.json')
const ROWS_PATH = join(TMP, 'batch1_rows.json')
const MAX_ADDED_BYTES = 150 * 1024

const ECONOMY_SLUGS = new Set<string>(SOCIDEAS_ECONOMY_INDICATORS as readonly string[])

// Carga .env.local sin dependencias (nunca imprime valores)
function loadEnvLocal() {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch { /* sin .env.local: fallará al necesitar credenciales */ }
}
loadEnvLocal()
const envOk = (k: string) => (process.env[k] ? `OK(${process.env[k]!.length}c)` : 'FALTA')
console.log(`[env] SUPABASE_URL=${envOk('NEXT_PUBLIC_SUPABASE_URL')} SERVICE_ROLE=${envOk('SUPABASE_SERVICE_ROLE_KEY')} R2_BASE=${envOk('NEXT_PUBLIC_SOCIDEAS_R2_BASE')} R2_BUCKET=${envOk('R2_BUCKET')}`)

function parseEsNum(raw: string): number | null {
  const s = raw.trim()
  if (s === '' || s === '-' || s.toUpperCase() === 'ND' || s === '..' || s === ':') return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

async function dl(url: string, dest: string): Promise<{ status: number; bytes: number; sha256: string }> {
  if (existsSync(dest) && statSync(dest).size > 0) {
    const buf = await readFile(dest)
    const h = createHash('sha256').update(buf).digest('hex')
    console.log(`[reuse] ${dest} ${buf.length}B sha256:${h}`)
    return { status: 200, bytes: buf.length, sha256: h }
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
  if (!res.ok) throw new Error(`Descarga fallida ${url} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const h = createHash('sha256').update(buf).digest('hex')
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  console.log(`[dl] ${url} → ${res.status} ${buf.length}B sha256:${h}`)
  return { status: res.status, bytes: buf.length, sha256: h }
}

interface ParsedRow { slug: string; anio: number; valor: number; unidad: string; dim: Record<string, string>; src: string; url: string; table: string; serie: string | null }

async function parseAdrhFile(path: string, kinds: ('renta' | 'gini')[]): Promise<Map<string, ParsedRow[]>> {
  const out = new Map<string, ParsedRow[]>()
  const buf = await readFile(path)
  const txt = buf.toString('utf8').replace(/^\uFEFF/, '')
  const lines = txt.split(/\r?\n/)
  const headers = lines[0].split('\t').map((h) => h.trim().toLowerCase())
  const iMuni = headers.findIndex((h) => h.includes('municip'))
  // 'Índice' con tilde (U+00CD/U+00ED precompuestos, sin combining chars)
  const iInd = headers.findIndex((h) => h.includes('indicador') || h.includes('indice') || h.includes('índice'))
  const iPer = headers.findIndex((h) => h.includes('period') || h.includes('ano') || h.includes('anyo'))
  const iVal = headers.findIndex((h) => h.includes('total') || h.includes('valor'))
  const iDis = headers.findIndex((h) => h.includes('distrito'))
  const iSec = headers.findIndex((h) => h.includes('secci'))
  if (iMuni < 0 || iInd < 0 || iPer < 0 || iVal < 0) throw new Error(`Cabecera ADRH inesperada en ${path}`)
  const slugOf = (ind: string): { slug: string; unidad: string } | null => {
    const l = ind.toLowerCase()
    if (l.includes('gini')) return kinds.includes('gini') ? { slug: 'gini', unidad: 'puntos' } : null
    if (l.includes('p80')) return kinds.includes('gini') ? { slug: 'p80_p20', unidad: 'ratio' } : null
    if (!kinds.includes('renta')) return null
    if (l.includes('neta') && l.includes('hogar')) return { slug: 'renta_neta_media_hogar', unidad: 'euros' }
    if (l.includes('neta')) return { slug: 'renta_neta_media_persona', unidad: 'euros' }
    if (l.includes('bruta') && l.includes('hogar')) return { slug: 'renta_bruta_media_hogar', unidad: 'euros' }
    if (l.includes('bruta')) return { slug: 'renta_bruta_media_persona', unidad: 'euros' }
    return null
  }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cols = line.split('\t')
    if (iDis >= 0 && (cols[iDis] ?? '').trim() !== '') continue
    if (iSec >= 0 && (cols[iSec] ?? '').trim() !== '') continue
    const m = (cols[iMuni] ?? '').match(/^\s*(\d{5})\b/)
    if (!m) continue
    const anio = parseInt((cols[iPer] ?? '').trim(), 10)
    if (!Number.isInteger(anio)) continue
    const meta = slugOf(cols[iInd] ?? '')
    if (!meta) continue
    const valor = parseEsNum(cols[iVal] ?? '')
    if (valor === null) continue // secreto/ND: se omite, nunca cero
    if (meta.slug === 'gini' && (valor < 0 || valor > 100)) continue
    if (valor <= 0 && meta.unidad === 'euros') continue
    const arr = out.get(m[1]) ?? []
    arr.push({ slug: meta.slug, anio, valor, unidad: meta.unidad, dim: { ambito: 'municipio' }, src: '', url: '', table: '', serie: null })
    out.set(m[1], arr)
  }
  return out
}

export async function main() {
  const args = process.argv.slice(2)
  const isMock = args.includes('--mock')
  const doWrite = args.includes('--write')
  if (isMock && doWrite) {
    console.error('ERROR: --mock no puede combinarse con --write. Exit 1')
    process.exit(1)
  }
  const parseOnly = args.includes('--parse-only')
  const limit = parseInt((args.find((a) => a.startsWith('--limit=')) ?? '--limit=0').split('=')[1], 10) || 0
  const offset = parseInt((args.find((a) => a.startsWith('--offset=')) ?? '--offset=0').split('=')[1], 10) || 0

  const map = JSON.parse(await readFile(MAP_PATH, 'utf8')) as Record<string, { renta: number; gini: number }>

  // FASE 1: parseo de todas las fuentes a batch1_rows.json (sin credenciales)
  const needParse = !existsSync(ROWS_PATH) || parseOnly
  if (needParse) {
    console.log('[fase1] Parseando fuentes ADRH/DIRCE/SEPE/TGSS...')
    const all = new Map<string, ParsedRow[]>()
    const pushRow = (ine: string, r: ParsedRow) => {
      if (!/^\d{5}$/.test(ine)) return
      const arr = all.get(ine) ?? []
      arr.push(r)
      all.set(ine, arr)
    }
    const sinCob: Record<string, string[]> = {}
    const markSin = (ine: string, msg: string) => {
      const a = sinCob[ine] ?? []
      a.push(msg)
      sinCob[ine] = a
    }
    // ADRH renta + gini por provincia
    for (const [prov, ids] of Object.entries(map)) {
      if (prov.startsWith('_')) continue
      for (const [kind, id] of [['renta', ids.renta], ['gini', ids.gini]] as const) {
        const dest = join(TMP, `ADRH_${id}.csv`)
        await dl(`https://www.ine.es/jaxiT3/files/t/csv_bd/${id}.csv`, dest)
        const rows = await parseAdrhFile(dest, [kind])
        const srcSlug = 'ine_adrh'
        for (const [ine, rs] of rows) {
          for (const r of rs) {
            pushRow(ine, { ...r, src: srcSlug, url: `https://www.ine.es/jaxiT3/files/t/csv_bd/${id}.csv`, table: String(id) })
          }
        }
      }
    }
    // DIRCE: join COD→(ine,act) desde catálogo + datos nult=1
    const dirceCat = join(TMP, 'DIRCE_series_catalog.json')
    await dl('https://servicios.ine.es/wstempus/js/ES/SERIES_TABLA/4721?tip=M', dirceCat)
    const catJson = JSON.parse((await readFile(dirceCat)).toString('utf8')) as { COD?: string; MetaData?: { FK_Variable?: number; Codigo?: string }[] }[]
    const codMap = new Map<string, { ine: string; act: string }>()
    for (const s of catJson) {
      let ine: string | null = null
      let act: string | null = null
      for (const md of s.MetaData ?? []) {
        if (md.FK_Variable === 19 && md.Codigo && /^\d{5}$/.test(md.Codigo)) ine = md.Codigo
        if (md.Codigo && /^(AAA|KAH|KAC|KAI|A11)$/.test(md.Codigo)) act = md.Codigo
      }
      if (ine && act && s.COD) codMap.set(s.COD, { ine, act })
    }
    const dirceData = join(TMP, 'DIRCE_4721_nult1.json')
    await dl('https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721?nult=1', dirceData)
    const dirceJson = JSON.parse((await readFile(dirceData)).toString('utf8')) as { COD?: string; Data?: { Anyo?: number; Valor?: number | null }[] }[]
    const dirceSlug: Record<string, string> = { AAA: 'empresas_total', KAH: 'empresas_industria', KAC: 'empresas_construccion', KAI: 'empresas_comercio_hosteleria', A11: '__resto_servicios' }
    const dirceSector: Record<string, string> = { AAA: 'total', KAH: 'industria', KAC: 'construccion', KAI: 'comercio_hosteleria', A11: 'resto_servicios' }
    const dirceByIne = new Map<string, Map<string, { anio: number; valor: number }[]>>()
    for (const s of dirceJson) {
      const mi = s.COD ? codMap.get(s.COD) : undefined
      if (!mi) continue
      for (const d of s.Data ?? []) {
        if (d.Anyo !== 2025 || typeof d.Valor !== 'number' || d.Valor < 0) continue
        let g = dirceByIne.get(mi.ine)
        if (!g) { g = new Map(); dirceByIne.set(mi.ine, g) }
        const arr = g.get(mi.act) ?? []
        arr.push({ anio: 2025, valor: Math.round(d.Valor) })
        g.set(mi.act, arr)
      }
    }
    for (const [ine, g] of dirceByIne) {
      for (const [act, puntos] of g) {
        if (act === 'A11') continue
        for (const p of puntos) {
          pushRow(ine, { slug: dirceSlug[act], anio: p.anio, valor: p.valor, unidad: 'empresas', dim: { ambito: 'municipio', sector: dirceSector[act] }, src: 'ine_dirce', url: 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721?nult=1', table: '4721', serie: null })
        }
      }
      const resto = g.get('A11')?.find((p) => p.anio === 2025)?.valor
      const comer = g.get('KAI')?.find((p) => p.anio === 2025)?.valor
      if (resto !== undefined && comer !== undefined) {
        pushRow(ine, { slug: 'empresas_servicios', anio: 2025, valor: resto + comer, unidad: 'empresas', dim: { ambito: 'municipio', sector: 'servicios' }, src: 'ine_dirce', url: 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721?nult=1', table: '4721', serie: null })
      }
      if (!g.get('AAA')) markSin(ine, 'DIRCE: sin serie total')
    }
    // SEPE julio 2026 (solo julio 2026, sin serie 12 meses – documentado)
    const sepePage = await (await fetch('https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas/datos-estadisticos/municipios/2026/julio.html', { headers: { 'User-Agent': 'URBIdeas/1.0' } })).text()
    const sepeHrefs = [...new Set([...sepePage.matchAll(/href="(\/HomeSepe\/dam\/jcr:[^"]*?\/MUNI_[A-Za-z0-9_]+\.xls)"/g)].map((m) => m[1]))]
    if (sepeHrefs.length < 50) throw new Error(`SEPE: solo ${sepeHrefs.length} XLS en julio.html`)
    for (const href of sepeHrefs) {
      const fname = href.split('/').pop() ?? 'sepe.xls'
      const dest = join(TMP, 'sepe', fname)
      await dl(`https://www.sepe.es${href}`, dest)
      const buf = await readFile(dest)
      const wb = XLSX.read(buf, { type: 'buffer' })
      const sheet = wb.Sheets['PARO'] ?? wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
      for (const r of rows) {
        const code = String(r[0] ?? '').trim()
        if (!/^\d{5}$/.test(code)) continue
        const raw = String(r[2] ?? '').trim()
        if (raw === '<5' || raw === '< 5') { markSin(code, 'SEPE: <5 (secreto)'); continue }
        const v = raw === '' ? 0 : Number(raw)
        if (!Number.isFinite(v) || v < 0) continue
        pushRow(code, { slug: 'paro_registrado', anio: 2026, valor: v, unidad: 'personas', dim: { ambito: 'municipio', periodo: '2026-07', estado: 'consolidado' }, src: 'sepe', url: `https://www.sepe.es${href}`, table: 'sepe_2026_07', serie: null })
      }
    }
    // TGSS julio 2026
    const tgssPage = await (await fetch('https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas/est8/est10/est305/c43ad8ea-fe79-4329-ac8e-e5758f3c4d7a/6609c55f-65e4-4e64-b1ab-8917fce27a84', { headers: { 'User-Agent': 'URBIdeas/1.0' } })).text()
    const tgssHref = tgssPage.match(/href="(\/descarga\/es\/Muni072026)"/)?.[1]
    if (!tgssHref) throw new Error('TGSS: href Muni072026 no encontrado')
    const tgssDest = join(TMP, 'Muni072026.xlsx')
    await dl(`https://www.seg-social.es${tgssHref}`, tgssDest)
    {
      const buf = await readFile(tgssDest)
      const wb = XLSX.read(buf, { type: 'buffer' })
      const sheet = wb.Sheets['ParaExportar'] ?? wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
      for (const r of rows) {
        const m = String(r[1] ?? '').match(/^\s*(\d{5})\b/)
        if (!m) continue
        const raw = String(r[9] ?? '').trim()
        if (raw === '<5' || raw === '< 5') { markSin(m[1], 'TGSS: <5 → null+flag'); continue }
        const v = Number(raw.replace(/\./g, '').replace(',', '.'))
        if (!Number.isFinite(v) || v < 0 || raw === '') continue
        pushRow(m[1], { slug: 'afiliacion_total', anio: 2026, valor: v, unidad: 'personas', dim: { ambito: 'municipio', periodo: '2026-07', estado: 'consolidado' }, src: 'tgss', url: 'https://www.seg-social.es/descarga/es/Muni072026', table: 'tgss_2026_07', serie: null })
      }
    }
    await writeFile(ROWS_PATH, JSON.stringify({ rows: [...all.entries()], sinCobertura: sinCob }))
    console.log(`[fase1] municipios con filas: ${all.size}. Guardado en ${ROWS_PATH}`)
    if (parseOnly) return
  }

  if (!doWrite) {
    console.log('[dry-run] Parseo OK. Sin --write no se toca R2 ni Supabase. Usa --write para cargar.')
    return
  }

  // FASE 2: carga con MERGE (requiere credenciales)
  const { createClient } = await import('@supabase/supabase-js')
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL || !SERVICE_KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  if (!process.env.R2_BUCKET) throw new Error('Faltan credenciales R2 en .env.local')
  const supabase = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: muniList, error: muniErr } = await supabase.from('municipios').select('codigo_ine').order('codigo_ine')
  if (muniErr) throw muniErr
  const municipios = ((muniList ?? []) as { codigo_ine: string }[]).map((m) => m.codigo_ine)
  const { rows, sinCobertura } = JSON.parse((await readFile(ROWS_PATH)).toString('utf8')) as { rows: [string, ParsedRow[]][]; sinCobertura: Record<string, string[]> }
  const byIne = new Map<string, ParsedRow[]>(rows)
  const { data: sources } = await supabase.from('statistical_sources').select('id, slug, organismo, nombre')
  const srcMeta = new Map(((sources ?? []) as { id: string; slug: string; organismo: string; nombre: string }[]).map((s) => [s.slug, s]))
  const { data: inds } = await supabase.from('indicator_definitions').select('id, slug, nombre, unidad').eq('activo', true)
  const indMeta = new Map(((inds ?? []) as { id: string; slug: string; nombre: string; unidad: string | null }[]).map((i) => [i.slug, i]))

  let manifest: { started: string; items: Record<string, { key: string; bytesAntes: number; bytesDespues: number; readback: string; estado: string; created_minimal?: boolean }> }
  try {
    manifest = JSON.parse((await readFile(MANIFEST_PATH)).toString('utf8'))
  } catch {
    manifest = { started: new Date().toISOString(), items: {} }
  }
  const t0 = Date.now()
  let escritos = 0
  let bytesOut = 0
  let errores = 0
  let readbackErr = 0
  const counts = { actualizado: 0, sin_cobertura: 0, pendiente: 0, error: 0 }
  const slice = municipios.slice(offset, limit > 0 ? offset + limit : undefined)
  for (const [idx, ine] of slice.entries()) {
    if (manifest.items[ine]?.readback === 'ok' && manifest.items[ine]?.estado !== 'error') continue
    try {
      const previo = await readMunicipioJson(ine).catch(() => null)
      const bytesAntes = previo ? JSON.stringify(previo).length : 0
      const filasPrevias: { slug: string; anio: number; valor: number; unidad: string; dim: Record<string, string>; sslug: string; surl: string; tid: string; sid: string | null; nombre: string; uind: string | null; org: string; nfuente: string }[] = []
      let createdMinimal = false
      if (previo && previo.version === 2) {
        for (const f of expandV2Envelope(previo as unknown as R2MunicipioEnvelopeV2) as unknown as {
          indicator: { slug: string; nombre: string; unidad: string | null }; source: { slug: string; organismo: string; nombre: string };
          anio_referencia: number; valor_numerico: number | null; unidad: string | null; dimensiones: Record<string, string>;
          source_url: string | null; source_table_id: string | null; source_series_id?: string | null
        }[]) {
          if (ECONOMY_SLUGS.has(f.indicator.slug)) continue
          if (f.valor_numerico === null || f.anio_referencia == null) continue
          filasPrevias.push({ slug: f.indicator.slug, anio: f.anio_referencia, valor: Number(f.valor_numerico), unidad: f.unidad ?? '', dim: f.dimensiones ?? {}, sslug: f.source.slug || 'ine_tempus3', surl: f.source_url ?? '', tid: f.source_table_id ?? '', sid: f.source_series_id ?? null, nombre: f.indicator.nombre, uind: f.indicator.unidad, org: f.source.organismo, nfuente: f.source.nombre })
        }
      } else if (!previo) {
        createdMinimal = true
      }
      const nuevas = byIne.get(ine) ?? []
      const todas: { indicator: { slug: string; nombre: string; unidad: string | null }; source: { slug: string; organismo: string; nombre: string }; anio_referencia: number; valor_numerico: number; unidad: string; dimensiones: Record<string, string>; source_url: string; source_table_id: string; source_series_id?: string | null; estado_validacion: 'validado' }[] = []
      for (const k of filasPrevias) {
        const meta = srcMeta.get(k.sslug) ?? { slug: k.sslug, organismo: k.org, nombre: k.nfuente }
        todas.push({ indicator: { slug: k.slug, nombre: k.nombre, unidad: k.uind ?? k.unidad }, source: { slug: meta.slug, organismo: meta.organismo, nombre: meta.nombre }, anio_referencia: k.anio, valor_numerico: k.valor, unidad: k.unidad, dimensiones: k.dim, source_url: k.surl, source_table_id: k.tid, source_series_id: k.sid ?? null, estado_validacion: 'validado' })
      }
      for (const r of nuevas) {
        const meta = indMeta.get(r.slug)
        const src = srcMeta.get(r.src)
        if (!meta || !src) continue
        todas.push({ indicator: { slug: r.slug, nombre: meta.nombre, unidad: meta.unidad ?? r.unidad }, source: { slug: src.slug, organismo: src.organismo, nombre: src.nombre }, anio_referencia: r.anio, valor_numerico: r.valor, unidad: r.unidad, dimensiones: r.dim, source_url: r.url, source_table_id: r.table, source_series_id: r.serie ?? null, estado_validacion: 'validado' })
      }
      const envelope = toV2Envelope(ine, new Date().toISOString(), todas)
      const bytesDespues = JSON.stringify(envelope).length
      if (bytesDespues - bytesAntes > MAX_ADDED_BYTES) throw new Error(`Presupuesto superado +${bytesDespues - bytesAntes}B`)
      const key = await putMunicipioJson(ine, envelope)
      // Read-back con cache-buster (el CDN público puede cachear 86400s)
      const base = (process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? process.env.SOCIDEAS_R2_PUBLIC_BASE ?? '').replace(/\/$/, '')
      const rb = await fetch(`${base}/socideas/v2/municipios/${ine}.json?v=${Date.now()}`, { headers: { Accept: 'application/json' } })
      if (!rb.ok) throw new Error(`Read-back HTTP ${rb.status}`)
      const rbJson = (await rb.json()) as { codigo_ine?: string; valores?: unknown[] }
      if (rbJson.codigo_ine !== ine || !Array.isArray(rbJson.valores)) throw new Error('Read-back inválido')
      manifest.items[ine] = { key, bytesAntes, bytesDespues, readback: 'ok', estado: nuevas.length > 0 ? 'ok' : 'pendiente', ...(createdMinimal ? { created_minimal: true } : {}) }
      escritos++
      bytesOut += bytesDespues
      if (nuevas.length > 0) counts.actualizado++
      else counts.pendiente++
      await supabase.from('data_sync_runs').insert({ source_id: null, tipo_sincronizacion: 'economia_batch1', municipio_codigo_ine: ine, estado: nuevas.length > 0 ? 'ok' : 'partial', registros_leidos: nuevas.length, registros_actualizados: nuevas.length, fin: new Date().toISOString(), estado_dato: 'consolidado', bloque: 'economia', periodo: '2026-07', fuente: 'ine_adrh,ine_dirce,sepe,tgss', metadata: { pendientes: [], sin_cobertura: sinCobertura[ine] ?? [] } })
      if ((idx + 1) % 100 === 0) {
        await writeFile(MANIFEST_PATH, JSON.stringify(manifest))
        console.log(`[progreso] ${idx + 1}/${slice.length} escritos=${escritos} errores=${errores}`)
      }
    } catch (e) {
      errores++
      counts.error++
      if (String((e as Error).message).startsWith('Read-back')) readbackErr++
      manifest.items[ine] = { key: '', bytesAntes: 0, bytesDespues: 0, readback: 'error', estado: 'error' }
      await supabase.from('data_sync_runs').insert({ source_id: null, tipo_sincronizacion: 'economia_batch1', municipio_codigo_ine: ine, estado: 'error', fin: new Date().toISOString(), error_message: String((e as Error).message).slice(0, 2000), estado_dato: 'consolidado', bloque: 'economia', periodo: '2026-07', fuente: 'ine_adrh,ine_dirce,sepe,tgss' })
    }
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest))
  const mins = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(`[fin] escritos=${escritos} bytes=${bytesOut} readbackErr=${readbackErr} errores=${errores} mins=${mins}`)
  console.log(`[conteos] actualizado=${counts.actualizado} pendiente=${counts.pendiente} error=${counts.error} sin_cobertura_municipios=${Object.keys(sinCobertura).length}`)
  if (readbackErr > 0) {
    console.error(`FAIL: ${readbackErr} errores de read-back`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
