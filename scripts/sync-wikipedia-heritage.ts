#!/usr/bin/env node
// Pase de PATRIMONIO (bienes P1435) sobre los objetos ya publicados
// `socideas/wikipedia/{ine}.json`: lee cada objeto, consulta Wikidata en lotes
// (VALUES por QID de municipio) y fusiona los bienes patrimoniales con su
// imagen (licencia libre verificada en Commons). Reescribe el objeto.
//
// POR QUÉ aparte: el sincronizador masivo (sync-wikipedia-bulk.ts) NO usa WDQS
// (limitado); este pase lo hace por LOTES de QIDs, que WDQS sí atiende bien.
//
// USO:
//   npx tsx --env-file=.env.local scripts/sync-wikipedia-heritage.ts --write
//   (sin --write: solo informa)
//
// Cortesía con WDQS: lotes de 40 QIDs, pausa de 1 s entre consultas.

import { config } from 'dotenv'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import {
  checkCommonsLicenses,
  wikipediaEnrichmentKey,
  type WikipediaEnrichment,
  type HeritageSite,
} from '../src/lib/wikipedia-enrichment'

config({ path: '.env.local' })

const USER_AGENT = 'SOCideas/2.3 (https://urb-ideas.vercel.app; heritage pass; contacto via repo)'
const WDQS = 'https://query.wikidata.org/sparql'
const QID_BATCH = 40
const PAUSE_MS = 1000
const WRITE_CONCURRENCY = 25

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const chunk = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o }

interface Binding { m?: { value?: string }; item?: { value?: string }; itemLabel?: { value?: string }; heritageLabel?: { value?: string }; image?: { value?: string } }

async function wdqs(query: string): Promise<Binding[] | null> {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`
  for (let attempt = 0; attempt <= 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' }, signal: controller.signal })
      if (res.status === 429 || res.status >= 500) { await pause(3000 * (attempt + 1)); continue }
      if (!res.ok) return null
      const j = (await res.json()) as { results?: { bindings?: Binding[] } }
      return j.results?.bindings ?? []
    } catch {
      if (attempt < 2) await pause(2000)
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

function fileFromFilePath(url: string | undefined): string | null {
  if (!url) return null
  try {
    const m = /Special:FilePath\/(.+)$/.exec(new URL(url).pathname)
    if (!m) return null
    const dec = decodeURIComponent(m[1]).replace(/_/g, ' ').trim()
    return dec === '' ? null : dec
  } catch {
    return null
  }
}

function r2(): S3Client | null {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !key || !secret || !process.env.R2_BUCKET) return null
  return new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret } })
}

async function loadInes(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const out: string[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('municipios').select('codigo_ine').order('codigo_ine').range(from, from + PAGE - 1)
    if (error) throw new Error(`municipios: ${error.message}`)
    const rows = (data ?? []) as { codigo_ine: string }[]
    for (const r of rows) out.push(r.codigo_ine)
    if (rows.length < PAGE) break
  }
  return out
}

async function main() {
  const write = process.argv.includes('--write')
  const recap = process.argv.includes('--recap')
  const started = Date.now()
  const client = r2()
  if (!client) { console.error('Faltan credenciales R2'); process.exit(1) }
  const ines = await loadInes()
  console.log(`heritage pass · municipios=${ines.length} · write=${write}`)

  // 1) leer objetos con QID y sin bienes aún
  const conQid: { ine: string; qid: string; data: WikipediaEnrichment }[] = []
  for (const lote of chunk(ines, WRITE_CONCURRENCY)) {
    const res = await Promise.allSettled(lote.map(async (ine) => {
      const r = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: wikipediaEnrichmentKey(ine) }))
      const txt = await r.Body?.transformToString()
      if (!txt) return null
      const j = JSON.parse(txt) as WikipediaEnrichment
      const qid = j.wikidata?.qid
      const nBienes = j.heritageSites?.length ?? 0
      const candidato = recap ? nBienes > 100 : nBienes === 0
      if (j.wikipedia && qid && /^Q\d+$/.test(qid) && candidato) return { ine, qid, data: j }
      return null
    }))
    for (const r of res) if (r.status === 'fulfilled' && r.value) conQid.push(r.value)
  }
  console.log(`con QID y sin bienes: ${conQid.length}`)

  // 2) WDQS por lotes de QID → bienes por QID
  const qidToIne = new Map<string, string>()
  for (const c of conQid) qidToIne.set(c.qid, c.ine)
  const qids = [...new Set(conQid.map((c) => c.qid))]
  const sitesPorQid = new Map<string, HeritageSite[]>()
  const imageFiles = new Set<string>()
  let consultas = 0
  for (const lote of chunk(qids, QID_BATCH)) {
    const values = lote.map((q) => `wd:${q}`).join(' ')
    const q = `SELECT ?m ?item ?itemLabel ?heritageLabel ?image WHERE { VALUES ?m { ${values} } ?item wdt:P131 ?m. ?item wdt:P1435 ?heritage. OPTIONAL { ?item wdt:P18 ?image. } SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". } } LIMIT 2000`
    const b = await wdqs(q)
    consultas++
    if (!b) { console.warn(`  WDQS sin respuesta en lote ${consultas}`); await pause(PAUSE_MS); continue }
    for (const row of b) {
      const mq = /(Q\d+)$/.exec(row.m?.value ?? '')?.[1]
      const iq = /(Q\d+)$/.exec(row.item?.value ?? '')?.[1]
      if (!mq || !iq) continue
      const arr = sitesPorQid.get(mq) ?? []
      if (arr.some((s) => s.qid === iq)) continue
      const img = fileFromFilePath(row.image?.value)
      if (img) imageFiles.add(img)
      arr.push({
        title: row.itemLabel?.value ?? iq,
        qid: iq,
        heritageType: row.heritageLabel?.value ?? 'Protección patrimonial',
        url: `https://www.wikidata.org/wiki/${iq}`,
        ...(img ? { image: img } : {}),
      })
      sitesPorQid.set(mq, arr)
    }
    if (consultas % 20 === 0) console.log(`  WDQS ${consultas} consultas · municipios con bienes=${sitesPorQid.size}`)
    await pause(PAUSE_MS)
  }
  console.log(`WDQS: ${consultas} consultas · municipios con bienes=${sitesPorQid.size} · ficheros imagen=${imageFiles.size}`)

  // 3) licencias Commons
  const { licenses } = await checkCommonsLicenses([...imageFiles])

  // 4) fusionar y reescribir
  let actualizados = 0, sinBienes = 0, escritos = 0, fallos = 0
  const aEscribir: { ine: string; data: WikipediaEnrichment }[] = []
  for (const c of conQid) {
    const sites = (sitesPorQid.get(c.qid) ?? []).slice(0, 100)
    if (sites.length === 0) { sinBienes++; continue }
    const conLic = sites.map((s) => {
      const lic = s.image ? licenses.get(s.image.replace(/^File:/i, '')) : undefined
      if (s.image && lic?.free) return { ...s, ...(lic.license ? { imageLicense: lic.license } : {}) }
      const { image: _img, ...rest } = s
      return rest
    })
    aEscribir.push({ ine: c.ine, data: { ...c.data, heritageSites: conLic } })
    actualizados++
  }
  console.log(`objetos con bienes a escribir: ${actualizados} · sin bienes (no se toca): ${sinBienes}`)

  if (write) {
    for (const lote of chunk(aEscribir, WRITE_CONCURRENCY)) {
      const res = await Promise.allSettled(lote.map(async (o) => {
        const body = Buffer.from(JSON.stringify(o.data), 'utf8')
        await client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: wikipediaEnrichmentKey(o.ine), Body: body, ContentType: 'application/json', CacheControl: 'public, max-age=86400', Metadata: { kind: 'wikipedia-enrichment' } }))
      }))
      for (let i = 0; i < res.length; i++) {
        if (res[i].status === 'fulfilled') escritos++
        else { fallos++; console.error(`FALLO ${lote[i].ine}: ${(res[i] as PromiseRejectedResult).reason}`) }
      }
    }
    console.log(`R2: escritos=${escritos} · fallos=${fallos}`)
  } else {
    console.log('DRY-RUN: no se escribe (usa --write).')
  }
  console.log(`Duración: ${Date.now() - started} ms`)
}

main().catch((e) => { console.error(e); process.exit(1) })
