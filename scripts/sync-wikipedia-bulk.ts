#!/usr/bin/env node
// Sincronizador MASIVO del enriquecimiento Wikipedia/Wikidata a R2.
//
// POR QUÉ: el sincronizador por-municipio (sync-wikipedia-enrichment.ts) hace
// WDQS (patrimonio) por municipio y no escala a los ~8.132 municipios. Este usa
// la API de MediaWiki/Wikidata POR LOTES (50 títulos por petición) para el
// resumen y los datos de Wikidata: cubre todos los municipios en minutos.
//
// ALCANCE HONESTO: NO consulta WDQS (patrimonio P1435) porque Wikidata Query
// Service limita agresivamente (HTTP 429). Los bienes patrimoniales quedan
// vacíos y el bloque lo declara; el resumen, la imagen (con licencia libre
// verificada en Commons), las coordenadas, la web y el QID SÍ se publican.
// El sincronizador por-municipio sigue siendo la vía para el patrimonio.
//
// Contrato EXACTO: `socideas/wikipedia/{ine}.json` (src/lib/wikipedia-enrichment.ts).
//
// USO:
//   npx tsx scripts/sync-wikipedia-bulk.ts --only=45090,45172
//   npx tsx scripts/sync-wikipedia-bulk.ts --limit=200 --write --skip-existing
//   npx tsx scripts/sync-wikipedia-bulk.ts --write --skip-existing   (nacional)
//
// Cortesía con Wikimedia: lotes de 50 títulos, pausa de 250 ms entre peticiones,
// User-Agent identificativo. tmp/ está en .gitignore.

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import {
  TERRITORY_RE,
  SPAIN_SIGNAL_RE,
  FOREIGN_QUALIFIER_RE,
  checkCommonsLicenses,
  commonsFileFromThumbUrl,
  wikipediaEnrichmentKey,
  type WikipediaEnrichment,
  type WikipediaArticle,
  type WikidataEnrichment,
} from '../src/lib/wikipedia-enrichment'

config({ path: '.env.local' })

const USER_AGENT = 'SOCideas/2.3 (https://urb-ideas.vercel.app; bulk sync; contacto via repo)'
const MW_API = 'https://es.wikipedia.org/w/api.php'
const WD_API = 'https://www.wikidata.org/w/api.php'
const BATCH = 50
const PAUSE_MS = 250
const AUDIT_DIR = path.join('tmp', 'audit')

interface Municipio {
  codigo_ine: string
  nombre: string
  provincia: string
}

interface Args { write: boolean; skipExisting: boolean; only: string[] | null; limit: number | null; offset: number; notFoundOnly: boolean }

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const onlyArg = argv.find((a) => a.startsWith('--only='))
  const limitArg = argv.find((a) => a.startsWith('--limit='))
  const offsetArg = argv.find((a) => a.startsWith('--offset='))
  const limitValue = limitArg === undefined ? null : Number(limitArg.slice('--limit='.length))
  const offsetValue = offsetArg === undefined ? 0 : Number(offsetArg.slice('--offset='.length))
  return {
    write: argv.includes('--write'),
    skipExisting: argv.includes('--skip-existing'),
    notFoundOnly: argv.includes('--not-found-only'),
    only: onlyArg === undefined ? null : onlyArg.slice('--only='.length).split(',').map((c) => c.trim()).filter(Boolean),
    limit: limitValue !== null && Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null,
    offset: Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0,
  }
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
const norm = (v: string): string => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

async function getJson<T>(url: string, timeoutMs = 25000): Promise<T | null> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal })
      if (res.status === 429 || res.status >= 500) { await pause(1500 * (attempt + 1)); continue }
      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      if (attempt < 2) await pause(1000)
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function r2(): S3Client | null {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !key || !secret || !process.env.R2_BUCKET) return null
  return new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret } })
}

async function loadMunicipios(): Promise<Municipio[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const rows: Municipio[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias(nombre)')
      .order('codigo_ine')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`municipios: ${error.message}`)
    const batch = (data ?? []) as unknown as { codigo_ine: string; nombre: string; provincia: { nombre?: string } | null }[]
    for (const b of batch) rows.push({ codigo_ine: b.codigo_ine, nombre: b.nombre, provincia: b.provincia?.nombre ?? '' })
    if (batch.length < PAGE) break
  }
  return rows
}

function candidatos(nombre: string, provincia: string): string[] {
  const raw = nombre.trim()
  const out: string[] = [raw]
  const parts = raw.includes('/') ? raw.split('/').map((p) => p.trim()).filter(Boolean) : []
  out.push(...parts)
  if (provincia.trim() !== '') {
    out.push(`${raw} (${provincia.trim()})`)
    for (const p of parts) out.push(`${p} (${provincia.trim()})`)
  }
  return [...new Set(out.filter((t) => t !== ''))]
}

interface MwPage {
  title: string
  pageid?: number
  missing?: boolean
  extract?: string
  fullurl?: string
  lastrevid?: number
  thumbnail?: { source?: string; width?: number; height?: number }
  original?: { source?: string; width?: number; height?: number }
  pageprops?: { wikibase_item?: string }
}

function validar(title: string, texto: string, province: string, ine: string, p300: string | null, hasCoords: boolean): { ok: boolean; reason: string } {
  const qualifier = /\(([^)]*)\)/.exec(title)
  if (qualifier && FOREIGN_QUALIFIER_RE.test(norm(qualifier[1]))) return { ok: false, reason: 'calificador_extranjero' }
  const t = norm(texto)
  if (t === '') return { ok: false, reason: 'sin_resumen' }
  if (!TERRITORY_RE.test(t)) return { ok: false, reason: 'no_territorio' }
  const p300Ine = p300 !== null && /^\d{5}$/.test(p300) ? p300 : null
  if (p300Ine !== null && p300Ine !== ine.trim()) return { ok: false, reason: 'p300_no_coincide' }
  if (p300Ine !== null) return { ok: true, reason: 'p300_ine' }
  if (hasCoords) return { ok: true, reason: 'coords' }
  const provNorm = norm(province)
  if (provNorm !== '' && t.includes(provNorm)) return { ok: true, reason: 'provincia_en_texto' }
  if (SPAIN_SIGNAL_RE.test(t)) return { ok: true, reason: 'senal_espana' }
  if (title.includes('(')) return { ok: true, reason: 'titulo_desambiguado' }
  return { ok: false, reason: 'sin_confirmacion' }
}

function claimString(entity: Record<string, unknown> | null, prop: string): string | undefined {
  const claims = (entity?.claims as Record<string, { rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }[]> | undefined)?.[prop] ?? []
  for (const c of claims) {
    if (c.rank !== undefined && c.rank !== 'normal') continue
    const v = c.mainsnak?.datavalue?.value
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return undefined
}

function claimCoords(entity: Record<string, unknown> | null): { lat: number; lon: number } | undefined {
  const claims = (entity?.claims as Record<string, { rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }[]> | undefined)?.P625 ?? []
  for (const c of claims) {
    if (c.rank !== undefined && c.rank !== 'normal') continue
    const v = c.mainsnak?.datavalue?.value as { latitude?: number; longitude?: number } | undefined
    if (typeof v?.latitude === 'number' && typeof v?.longitude === 'number') return { lat: v.latitude, lon: v.longitude }
  }
  return undefined
}

function claimYear(entity: Record<string, unknown> | null): string | undefined {
  const claims = (entity?.claims as Record<string, { rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }[]> | undefined)?.P571 ?? []
  for (const c of claims) {
    if (c.rank !== undefined && c.rank !== 'normal') continue
    const v = c.mainsnak?.datavalue?.value as { time?: string; precision?: number } | undefined
    if (typeof v?.time !== 'string') continue
    if (typeof v.precision === 'number' && v.precision < 9) continue
    const m = /^([+-])(\d+)-/.exec(v.time)
    if (m) return `${m[1] === '-' ? '-' : ''}${m[2]}`
  }
  return undefined
}

async function main() {
  const args = parseArgs()
  const started = Date.now()
  let municipios = await loadMunicipios()
  if (args.only) municipios = municipios.filter((m) => args.only!.includes(m.codigo_ine))
  if (args.offset > 0 || args.limit) municipios = municipios.slice(args.offset, args.limit ? args.offset + args.limit : undefined)

  const client = args.write || args.notFoundOnly ? r2() : null
  if ((args.write || args.notFoundOnly) && !client) { console.error('Faltan credenciales R2'); process.exit(1) }

  // --not-found-only: procesa solo municipios cuyo objeto R2 es not_found o no
  // existe (los found/partial ya son válidos y no se tocan).
  if (args.notFoundOnly && client) {
    const keep: Municipio[] = []
    for (const lote of chunk(municipios, 25)) {
      const res = await Promise.allSettled(lote.map(async (m) => {
        try {
          const r = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: wikipediaEnrichmentKey(m.codigo_ine) }))
          const txt = await r.Body?.transformToString()
          const j = txt ? (JSON.parse(txt) as { status?: string }) : null
          return j && (j.status === 'found' || j.status === 'partial') ? null : m
        } catch {
          return m
        }
      }))
      for (const r of res) if (r.status === 'fulfilled' && r.value) keep.push(r.value)
    }
    municipios = keep
  }
  console.log(`bulk wikipedia · municipios=${municipios.length} (offset=${args.offset}${args.notFoundOnly ? ' · not-found-only' : ''}) · write=${args.write} · skipExisting=${args.skipExisting}`)

  // 1) títulos candidatos → mapa a municipio
  const porTitulo = new Map<string, Municipio[]>()
  for (const m of municipios) {
    for (const c of candidatos(m.nombre, m.provincia)) {
      const arr = porTitulo.get(c) ?? []
      arr.push(m)
      porTitulo.set(c, arr)
    }
  }
  const titulos = [...porTitulo.keys()]

  // 2) MediaWiki por lotes
  const pageByTitle = new Map<string, MwPage>()
  const resolver = new Map<string, string>() // requested → final
  let mwReq = 0
  for (const lote of chunk(titulos, BATCH)) {
    const url = `${MW_API}?action=query&format=json&formatversion=2&prop=extracts%7Cpageimages%7Cinfo%7Cpageprops&exintro=1&explaintext=1&piprop=original%7Cthumbnail&pithumbsize=900&redirects=1&inprop=url&titles=${encodeURIComponent(lote.join('|'))}`
    const j = await getJson<{ query?: { pages?: MwPage[]; normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[] } }>(url)
    mwReq++
    if (!j?.query) continue
    const normMap = new Map((j.query.normalized ?? []).map((n) => [n.from, n.to]))
    const redMap = new Map((j.query.redirects ?? []).map((r) => [r.from, r.to]))
    for (const p of j.query.pages ?? []) if (!p.missing) pageByTitle.set(p.title, p)
    for (const req of lote) {
      let cur = normMap.get(req) ?? req
      cur = redMap.get(cur) ?? cur
      if (pageByTitle.has(cur)) resolver.set(req, cur)
    }
    if (mwReq % 20 === 0) console.log(`  MediaWiki: ${mwReq} peticiones · páginas=${pageByTitle.size}`)
    await pause(PAUSE_MS)
  }
  console.log(`MediaWiki: ${mwReq} peticiones · títulos resueltos=${resolver.size}/${titulos.length}`)

  // 3) wikidata por lotes (QIDs de pageprops)
  const qids = [...new Set([...pageByTitle.values()].map((p) => p.pageprops?.wikibase_item).filter((q): q is string => typeof q === 'string' && /^Q\d+$/.test(q)))]
  const entityById = new Map<string, Record<string, unknown>>()
  let wdReq = 0
  for (const lote of chunk(qids, BATCH)) {
    const url = `${WD_API}?action=wbgetentities&format=json&props=claims&ids=${encodeURIComponent(lote.join('|'))}`
    const j = await getJson<{ entities?: Record<string, Record<string, unknown>> }>(url)
    wdReq++
    for (const [id, e] of Object.entries(j?.entities ?? {})) if (e && (e as { missing?: string }).missing === undefined) entityById.set(id, e)
    await pause(PAUSE_MS)
  }
  console.log(`Wikidata: ${wdReq} peticiones · entidades=${entityById.size}`)

  // 4) construir objetos
  const objetos: { ine: string; data: WikipediaEnrichment }[] = []
  const filesAEscudo = new Set<string>()
  const parsed: { m: Municipio; page: MwPage; entity: Record<string, unknown> | null; article: WikipediaArticle | null }[] = []
  for (const m of municipios) {
    let page: MwPage | null = null
    for (const c of candidatos(m.nombre, m.provincia)) {
      const final = resolver.get(c)
      if (final) { page = pageByTitle.get(final) ?? null; break }
    }
    if (!page) { parsed.push({ m, page: null as unknown as MwPage, entity: null, article: null }); continue }
    const qid = page.pageprops?.wikibase_item
    const entity = qid && /^Q\d+$/.test(qid) ? entityById.get(qid) ?? null : null
    const p300 = entity ? claimString(entity, 'P772') ?? claimString(entity, 'P300') ?? null : null
    const coords = entity ? claimCoords(entity) : undefined
    const texto = page.extract ?? ''
    const v = validar(page.title, texto, m.provincia, m.codigo_ine, p300, coords !== undefined)
    if (!v.ok) { parsed.push({ m, page, entity, article: null }); continue }
    const thumbFile = commonsFileFromThumbUrl(page.thumbnail?.source ?? page.original?.source ?? '')
    const p18 = entity ? claimString(entity, 'P18') : undefined
    if (thumbFile) filesAEscudo.add(thumbFile)
    if (p18) filesAEscudo.add(p18)
    const author: WikipediaArticle = {
      title: page.title,
      pageId: page.pageid ?? 0,
      summary: (texto.replace(/\s+/g, ' ').trim()).slice(0, 1000),
      url: page.fullurl ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia, La Enciclopedia Libre',
    }
    if (typeof page.lastrevid === 'number') author.lastRevision = String(page.lastrevid)
    parsed.push({ m, page, entity, article: author })
  }

  // 4b) Fallback para municipios sin artículo: buscar la entidad por su código
  // INE en Wikidata (P772, `haswbstatement`) → sitelink eswiki → artículo.
  // Recupera títulos bilingües/redirecciones/desambiguados que no casaron por
  // nombre. Nunca sustituye: si no hay entidad, el municipio queda not_found.
  const sinArticulo = parsed.filter((p) => p.article === null)
  if (sinArticulo.length > 0) {
    console.log(`fallback P772 para ${sinArticulo.length} municipios sin artículo…`)
    const qidPorIne = new Map<string, string>()
    for (const p of sinArticulo) {
      const url = `${WD_API}?action=query&list=search&format=json&formatversion=2&srlimit=1&srsearch=${encodeURIComponent(`haswbstatement:P772=${p.m.codigo_ine}`)}`
      const j = await getJson<{ query?: { search?: { title: string }[] } }>(url)
      const q = j?.query?.search?.[0]?.title
      if (q && /^Q\d+$/.test(q)) qidPorIne.set(p.m.codigo_ine, q)
      await pause(120)
    }
    const fbQids = [...new Set(qidPorIne.values())]
    const fbEntity = new Map<string, Record<string, unknown>>()
    for (const lote of chunk(fbQids, BATCH)) {
      const url = `${WD_API}?action=wbgetentities&format=json&formatversion=2&props=claims%7Csitelinks&sitefilter=eswiki&ids=${encodeURIComponent(lote.join('|'))}`
      const j = await getJson<{ entities?: Record<string, Record<string, unknown>> }>(url)
      for (const [id, e] of Object.entries(j?.entities ?? {})) if (e && (e as { missing?: string }).missing === undefined) fbEntity.set(id, e)
      await pause(PAUSE_MS)
    }
    const tituloPorIne = new Map<string, string>()
    for (const [ine, qid] of qidPorIne) {
      const e = fbEntity.get(qid)
      const t = (e?.sitelinks as Record<string, { title?: string }> | undefined)?.eswiki?.title
      if (typeof t === 'string' && t !== '') tituloPorIne.set(ine, t)
    }
    const fbPageByTitle = new Map<string, MwPage>()
    for (const lote of chunk([...new Set(tituloPorIne.values())], BATCH)) {
      const url = `${MW_API}?action=query&format=json&formatversion=2&prop=extracts%7Cpageimages%7Cinfo%7Cpageprops&exintro=1&explaintext=1&piprop=original%7Cthumbnail&pithumbsize=900&inprop=url&titles=${encodeURIComponent(lote.join('|'))}`
      const j = await getJson<{ query?: { pages?: MwPage[] } }>(url)
      for (const pg of j?.query?.pages ?? []) if (!pg.missing) fbPageByTitle.set(pg.title, pg)
      await pause(PAUSE_MS)
    }
    let recuperados = 0
    for (const p of sinArticulo) {
      const t = tituloPorIne.get(p.m.codigo_ine)
      if (!t) continue
      const pg = fbPageByTitle.get(t)
      if (!pg) continue
      const qid = qidPorIne.get(p.m.codigo_ine)
      const entity = qid ? fbEntity.get(qid) ?? null : null
      const p772 = entity ? claimString(entity, 'P772') ?? claimString(entity, 'P300') ?? null : null
      const coords = entity ? claimCoords(entity) : undefined
      const v = validar(pg.title, pg.extract ?? '', p.m.provincia, p.m.codigo_ine, p772, coords !== undefined)
      if (!v.ok) continue
      const thumbFile = commonsFileFromThumbUrl(pg.thumbnail?.source ?? pg.original?.source ?? '')
      const p18 = entity ? claimString(entity, 'P18') : undefined
      if (thumbFile) filesAEscudo.add(thumbFile)
      if (p18) filesAEscudo.add(p18)
      const author: WikipediaArticle = {
        title: pg.title,
        pageId: pg.pageid ?? 0,
        summary: (pg.extract ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000),
        url: pg.fullurl ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`,
        license: 'CC BY-SA 4.0',
        attribution: 'Wikipedia, La Enciclopedia Libre',
      }
      if (typeof pg.lastrevid === 'number') author.lastRevision = String(pg.lastrevid)
      p.page = pg
      p.entity = entity
      p.article = author
      recuperados++
    }
    console.log(`  fallback: ${recuperados}/${sinArticulo.length} recuperados por P772`)
  }

  // 4c) Segundo fallback: búsqueda en es.wikipedia por nombre + provincia, para
  // municipios sin entidad Wikidata con P772. Se valida igual (provincia,
  // coordenadas, España); el primero válido se acepta. Nunca sustituye sin
  // confirmación.
  const sinArticulo2 = parsed.filter((p) => p.article === null)
  if (sinArticulo2.length > 0) {
    let recuperados2 = 0
    for (const p of sinArticulo2) {
      const consulta = `${p.m.nombre} ${p.m.provincia}`
      const sUrl = `${MW_API}?action=query&list=search&format=json&formatversion=2&srlimit=3&srsearch=${encodeURIComponent(consulta)}`
      const sj = await getJson<{ query?: { search?: { title: string }[] } }>(sUrl)
      for (const t of (sj?.query?.search ?? []).map((s) => s.title)) {
        const pgUrl = `${MW_API}?action=query&format=json&formatversion=2&prop=extracts%7Cpageimages%7Cinfo%7Cpageprops&exintro=1&explaintext=1&piprop=original%7Cthumbnail&pithumbsize=900&inprop=url&titles=${encodeURIComponent(t)}`
        const pj = await getJson<{ query?: { pages?: MwPage[] } }>(pgUrl)
        const pg = pj?.query?.pages?.[0]
        if (!pg || pg.missing) continue
        const qid = pg.pageprops?.wikibase_item
        let entity: Record<string, unknown> | null = null
        if (qid && /^Q\d+$/.test(qid)) {
          const ej = await getJson<{ entities?: Record<string, Record<string, unknown>> }>(`${WD_API}?action=wbgetentities&format=json&formatversion=2&props=claims&ids=${qid}`)
          entity = ej?.entities?.[qid] ?? null
        }
        const p772 = entity ? claimString(entity, 'P772') ?? claimString(entity, 'P300') ?? null : null
        const coords = entity ? claimCoords(entity) : undefined
        const v = validar(pg.title, pg.extract ?? '', p.m.provincia, p.m.codigo_ine, p772, coords !== undefined)
        if (!v.ok) continue
        const thumbFile = commonsFileFromThumbUrl(pg.thumbnail?.source ?? pg.original?.source ?? '')
        const p18 = entity ? claimString(entity, 'P18') : undefined
        if (thumbFile) filesAEscudo.add(thumbFile)
        if (p18) filesAEscudo.add(p18)
        const author: WikipediaArticle = {
          title: pg.title,
          pageId: pg.pageid ?? 0,
          summary: (pg.extract ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000),
          url: pg.fullurl ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`,
          license: 'CC BY-SA 4.0',
          attribution: 'Wikipedia, La Enciclopedia Libre',
        }
        if (typeof pg.lastrevid === 'number') author.lastRevision = String(pg.lastrevid)
        p.page = pg
        p.entity = entity
        p.article = author
        recuperados2++
        break
      }
      await pause(120)
    }
    console.log(`  búsqueda eswiki: ${recuperados2}/${sinArticulo2.length} recuperados`)
  }

  // 5) licencias Commons en lote
  const { licenses } = await checkCommonsLicenses([...filesAEscudo])
  const licOf = (f: string | undefined): { free: boolean; license?: string } => {
    if (!f) return { free: false }
    const hit = licenses.get(f.replace(/^File:/i, ''))
    return hit ? hit : { free: false }
  }

  for (const { m, page, entity, article } of parsed) {
    if (!article) { objetos.push({ ine: m.codigo_ine, data: { municipalityName: m.nombre, ineCode: m.codigo_ine, wikipedia: null, wikidata: null, heritageSites: [], status: 'not_found', retrievedAt: new Date().toISOString() } }); continue }
    const thumbFile = commonsFileFromThumbUrl(page.thumbnail?.source ?? page.original?.source ?? '')
    const thumbLic = licOf(thumbFile ?? undefined)
    if (thumbFile && thumbLic.free) {
      const w = page.thumbnail?.width ?? page.original?.width ?? 0
      const h = page.thumbnail?.height ?? page.original?.height ?? 0
      if (w > 0 && h > 0) article.thumbnail = { url: (page.thumbnail?.source ?? page.original?.source) as string, width: w, height: h, ...(thumbLic.license ? { license: thumbLic.license } : {}) }
    }
    let wikidata: WikidataEnrichment | null = null
    if (entity) {
      const qid = (entity.id as string) ?? ''
      if (qid) {
        wikidata = { qid }
        const web = claimString(entity, 'P856')
        if (web && /^https?:\/\//i.test(web)) wikidata.officialWebsite = web
        const coords = claimCoords(entity)
        if (coords) wikidata.coordinates = coords
        const fund = claimYear(entity)
        if (fund) wikidata.founded = fund
        const ine = claimString(entity, 'P300')
        if (ine) wikidata.ineCode = ine
        const geo = claimString(entity, 'P1566')
        if (geo) wikidata.geoNamesId = geo
        const p18 = claimString(entity, 'P18')
        const p18Lic = licOf(p18)
        if (p18 && p18Lic.free) { wikidata.mainImage = p18; if (p18Lic.license) wikidata.mainImageLicense = p18Lic.license }
      }
    }
    objetos.push({ ine: m.codigo_ine, data: { municipalityName: m.nombre, ineCode: m.codigo_ine, wikipedia: article, wikidata, heritageSites: [], status: wikidata ? 'found' : 'partial', retrievedAt: new Date().toISOString() } })
  }

  const counts = objetos.reduce<Record<string, number>>((acc, o) => { acc[o.data.status] = (acc[o.data.status] ?? 0) + 1; return acc }, {})
  console.log(`objetos construidos=${objetos.length} · estados=${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`)

  // 6) escritura R2 (idempotente, concurrente por lotes)
  if (args.write && client) {
    let wrote = 0, skipped = 0, failed = 0
    const manifest: unknown[] = []
    const escribir = async (o: { ine: string; data: WikipediaEnrichment }): Promise<void> => {
      const key = wikipediaEnrichmentKey(o.ine)
      if (args.skipExisting) {
        try {
          const res = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }))
          const txt = await res.Body?.transformToString()
          const j = txt ? (JSON.parse(txt) as { status?: string }) : null
          // Solo se salta si el objeto existente YA es válido (found/partial);
          // los not_found se reintentan y sobrescriben con el fallback.
          if (j && (j.status === 'found' || j.status === 'partial')) { skipped++; return }
        } catch { /* no existe o no legible → escribir */ }
      }
      const body = Buffer.from(JSON.stringify(o.data), 'utf8')
      await client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: 'application/json', CacheControl: 'public, max-age=86400', Metadata: { kind: 'wikipedia-enrichment', sha256: sha(body) } }))
      wrote++
      manifest.push({ ine: o.ine, status: o.data.status, bytes: body.length, sha256: sha(body) })
    }
    for (const lote of chunk(objetos, 25)) {
      const res = await Promise.allSettled(lote.map((o) => escribir(o)))
      for (let i = 0; i < res.length; i++) {
        if (res[i].status === 'rejected') { failed++; console.error(`FALLO ${lote[i].ine}: ${(res[i] as PromiseRejectedResult).reason instanceof Error ? ((res[i] as PromiseRejectedResult).reason as Error).message : (res[i] as PromiseRejectedResult).reason}`) }
      }
    }
    console.log(`R2: escritos=${wrote} · saltados(existentes)=${skipped} · fallos=${failed}`)
    mkdirSync(AUDIT_DIR, { recursive: true })
    writeFileSync(path.join(AUDIT_DIR, `wikipedia-bulk-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), total: objetos.length, counts, wrote, skipped, failed, items: manifest }, null, 2), 'utf8')
  } else {
    console.log('DRY-RUN: no se escribe en R2 (usa --write).')
  }
  console.log(`Duración: ${Date.now() - started} ms`)
}

main().catch((e) => { console.error(e); process.exit(1) })
