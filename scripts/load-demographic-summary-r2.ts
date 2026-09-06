// FASE B — Carga inmutable en R2 del resumen demográfico (requiere --confirm-r2-write).
// Lee tmp/demo3e-summaries.json (Fase A), escribe bajo el prefijo NUEVO e
// inmutable `socideas/demographics/ine/v1/`, verifica por relectura y solo
// entonces publica manifests/latest-successful.json (también en prefijo nuevo).
// NUNCA toca claves activas (socideas/v1|v2), Supabase, UI, XLSX ni endpoints.
// Uso: npx tsx scripts/load-demographic-summary-r2.ts --confirm-r2-write
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { MunicipalSummary } from './build-demographic-summary-r2'

config({ path: '.env.local' })

const PREFIX = 'socideas/demographics/ine/v1/municipal'
const MANIFEST_PREFIX = 'socideas/demographics/ine/v1/manifests'
const CONCURRENCY = 20

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function r2(): { client: S3Client; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Falta configuración R2 (solo se usa para el prefijo demográfico nuevo)')
  }
  return {
    client: new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } }),
    bucket,
  }
}

async function putWithRetry(
  client: S3Client, bucket: string, key: string, body: string, meta: Record<string, string>,
): Promise<void> {
  let last: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: body, ContentType: 'application/json',
        CacheControl: 'public, max-age=86400', Metadata: meta,
      }))
      return
    } catch (err) {
      last = err
      await sleep(500 * (attempt + 1))
    }
  }
  throw last instanceof Error ? last : new Error(`Put fallido: ${key}`)
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-r2-write')) {
    console.error('Rehúso escribir sin --confirm-r2-write explícito. Cero escrituras realizadas.')
    process.exit(2)
  }
  if (!existsSync('tmp/demo3e-summaries.json') || !existsSync('tmp/demo3e-prewrite.json')) {
    console.error('Falta la Fase A: ejecute primero scripts/build-demographic-summary-r2.ts')
    process.exit(1)
  }
  const objects = JSON.parse(readFileSync('tmp/demo3e-summaries.json', 'utf8')) as MunicipalSummary[]
  const prewrite = JSON.parse(readFileSync('tmp/demo3e-prewrite.json', 'utf8')) as { expected: number }
  if (!Array.isArray(objects) || objects.length !== 8130 || objects.length !== prewrite.expected) {
    console.error(`Lote inválido: ${objects.length} objetos (esperados ${prewrite.expected})`)
    process.exit(1)
  }
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`
  console.log(`Run ${runId}: escribiendo ${objects.length} objetos bajo ${PREFIX}/ (claves activas intactas)`)
  const { client, bucket } = r2()
  const shaOf = (s: string): string => createHash('sha256').update(s).digest('hex')
  const entries: { ine: string; sha256: string; bytes: number }[] = []
  const failed: string[] = []
  let cursor = 0
  const workers = Array.from({ length: CONCURRENCY }, () => (async () => {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= objects.length) break
      const o = objects[i]
      const body = JSON.stringify(o)
      const key = `${PREFIX}/${o.ineCode}.json`
      try {
        await putWithRetry(client, bucket, key, body, {
          schemaversion: o.schemaVersion, inecode: o.ineCode,
          generatedat: new Date().toISOString(), runid: runId, sha256: shaOf(body),
        })
        entries.push({ ine: o.ineCode, sha256: shaOf(body), bytes: body.length })
      } catch (err) {
        failed.push(`${o.ineCode}: ${err instanceof Error ? err.message : 'error'}`)
      }
      if ((i + 1) % 1000 === 0) console.log(`  … ${i + 1}/${objects.length}`)
    }
  })())
  await Promise.all(workers)
  console.log(`Escritos: ${entries.length}/${objects.length} · fallos: ${failed.length}`)
  if (failed.length > 0 || entries.length !== objects.length) {
    const failedManifest = { kind: 'demo3e-run', runId, estado: 'error', escritos: entries.length, esperados: objects.length, fallos: failed.slice(0, 50), date: new Date().toISOString() }
    await putWithRetry(client, bucket, `${MANIFEST_PREFIX}/${runId}.json`, JSON.stringify(failedManifest), { runid: runId })
    console.error(`Manifest de ejecución fallida: ${MANIFEST_PREFIX}/${runId}.json. latest-successful NO publicado. Faltan ${objects.length - entries.length}.`)
    process.exit(1)
  }
  // Relectura determinista: 4 de prueba + suprimidos + ≥5 CCAA.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const { data } = await supabase.from('municipios').select('codigo_ine, provincia:provincias(comunidad_autonoma:comunidades_autonomas(nombre))').order('codigo_ine')
  const rows = (data ?? []) as unknown as { codigo_ine: string; provincia: { comunidad_autonoma: { nombre: string } } }[]
  const ccaaOf = new Map(rows.map((r) => [r.codigo_ine.trim(), r.provincia.comunidad_autonoma.nombre]))
  const preSup = (JSON.parse(readFileSync('tmp/demo3e-prewrite.json', 'utf8')) as { supMunis: Record<string, string[]> }).supMunis
  const checkSet = new Set<string>(['02003', '07010', '02069', '28143', ...Object.values(preSup).flat()])
  const seenCcaa = new Set<string>()
  for (const r of rows) {
    if (checkSet.size >= 20) break
    const c = ccaaOf.get(r.codigo_ine.trim()) ?? ''
    if (!seenCcaa.has(c)) {
      seenCcaa.add(c)
      checkSet.add(r.codigo_ine.trim())
    }
  }
  while (checkSet.size < 20 && rows.length > 0) {
    const pick = rows[Math.floor(checkSet.size * 7919 / 20) % rows.length]
    checkSet.add(pick.codigo_ine.trim())
    if (checkSet.size > 60) break
  }
  const byIne = new Map(objects.map((o) => [o.ineCode, JSON.stringify(o)]))
  let verified = 0
  const verifyFails: string[] = []
  for (const ine of checkSet) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${PREFIX}/${ine}.json` }))
      const text = await res.Body?.transformToString()
      const expected = byIne.get(ine)
      if (!text || !expected) { verifyFails.push(`${ine}: sin contenido`); continue }
      if (shaOf(text) !== shaOf(expected)) { verifyFails.push(`${ine}: checksum distinto`); continue }
      const got = JSON.parse(text) as MunicipalSummary
      if (got.ineCode !== ine || got.schemaVersion !== 'ine-demographic-summary-v1') {
        verifyFails.push(`${ine}: campos base distintos`)
        continue
      }
      verified += 1
    } catch (err) {
      verifyFails.push(`${ine}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }
  console.log(`Relectura: ${verified}/${checkSet.size} OK (${[...seenCcaa].length} CCAA)`)
  if (verifyFails.length > 0) {
    console.error('Verificación fallida:', verifyFails.slice(0, 10).join(' | '))
    process.exit(1)
  }
  const manifest = {
    kind: 'demo3e-run',
    runId,
    estado: 'ok',
    esperados: objects.length,
    escritos: entries.length,
    verificados: verified,
    comando: 'npx tsx scripts/load-demographic-summary-r2.ts --confirm-r2-write',
    date: new Date().toISOString(),
    sources: {
      nationality: { tableId: '68535' },
      birth_country: { tableId: '66322' },
      birth_residence_relation: { tableId: '68540' },
    },
    entries,
  }
  const manifestBody = JSON.stringify(manifest)
  await putWithRetry(client, bucket, `${MANIFEST_PREFIX}/${runId}.json`, manifestBody, { runid: runId })
  await putWithRetry(
    client, bucket, `${MANIFEST_PREFIX}/latest-successful.json`,
    JSON.stringify({ kind: 'demo3e-latest', runId, esperados: objects.length, verificados: verified, date: new Date().toISOString() }),
    { runid: runId },
  )
  writeFileSync('tmp/demo3e-load.json', JSON.stringify({ runId, escritos: entries.length, verificados: verified, manifestBytes: manifestBody.length }, null, 2))
  console.log(`OK: manifest ${MANIFEST_PREFIX}/${runId}.json + latest-successful publicados (prefijo nuevo).`)
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
