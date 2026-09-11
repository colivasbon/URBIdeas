// Cargador de capas INE a R2 (Fase 4) — ESCRITURA RESERVADA.
//
// Garantías:
//  - Prefijo NUEVO y aislado: `socideas/ine-layers/v1/municipal/{INE-5}.json`.
//  - NUNCA escribe en `socideas/v2/municipios` ni `socideas/demographics/ine/v1`.
//  - Exige `--confirm-r2-write`, credenciales R2 y un dataset de preflight
//    marcado `complete: true` con match ≥ 99,5 % (el preflight solo produce
//    datasets de muestra incompletos hasta que se ejecute el nacional).
//  - Cada escritura lleva runId inmutable y queda registrada en un manifiesto.
//  - No borra runIds anteriores. No Sobrescribe claves activas ajenas.
//  - Un objeto > 25 KB o inválido aborta sin escribir nada.
//
// Uso: npx tsx scripts/load-ine-layers-r2.ts --layer=migration --confirm-r2-write
import { readFileSync, writeFileSync } from 'node:fs'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import {
  INE_LAYERS_V1_MANIFESTS_PREFIX,
  INE_LAYERS_V1_PREFIX,
  ineLayersKeyFor,
  isValidIneCode,
  validateMunicipalIneLayers,
  type MunicipalIneLayersV1,
} from '../src/lib/socideas-ine-layers'

config({ path: '.env.local' })

const MAX_BYTES = 25 * 1024
const MATCH_GATE = 0.995
const CONCURRENCY = 16

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

function r2Client(): { client: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  }
}

async function putWithRetry(r2: { client: S3Client; bucket: string }, key: string, body: string, metadata: Record<string, string>): Promise<void> {
  if (!key.startsWith(INE_LAYERS_V1_PREFIX)) throw new Error(`Clave fuera del prefijo autorizado: ${key}`)
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=3600',
          Metadata: metadata,
        }),
      )
      return
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw lastErr
}

async function main(): Promise<void> {
  const layer = arg('layer', 'migration')
  const datasetPath = `tmp/ine-layers-${layer}.dataset.json`
  const summaryPath = `tmp/ine-layers-${layer}.json`

  if (!process.argv.includes('--confirm-r2-write')) {
    console.error('Falta --confirm-r2-write. Abortado sin escribir nada.')
    process.exit(2)
  }
  const r2 = r2Client()
  if (!r2) {
    console.error('Sin credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET). Abortado sin escribir nada.')
    process.exit(2)
  }

  let summary: { matchPct?: number; passesGate?: boolean; p95Bytes?: number }
  let dataset: { complete?: boolean; objects?: unknown[] }
  try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as typeof summary
    dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as typeof dataset
  } catch {
    console.error(`Falta el preflight (${summaryPath}) o el dataset (${datasetPath}). Ejecute primero el preflight nacional. Abortado.`)
    process.exit(2)
  }
  if (!dataset.complete) {
    console.error('El dataset nacional está marcado como incompleto (solo muestras). Abortado sin escribir nada.')
    process.exit(2)
  }
  if (!summary.passesGate || (summary.matchPct ?? 0) / 100 < MATCH_GATE) {
    console.error(`El preflight no supera el gate (match ${summary.matchPct ?? 0} % < 99,5 %). Abortado.`)
    process.exit(2)
  }

  const objects: MunicipalIneLayersV1[] = []
  for (const raw of dataset.objects ?? []) {
    const parsed = validateMunicipalIneLayers(raw)
    if (!parsed.ok) {
      console.error(`Objeto inválido en el dataset: ${parsed.errors.join('; ')}. Abortado sin escribir nada.`)
      process.exit(1)
    }
    const bytes = Buffer.byteLength(JSON.stringify(parsed.data), 'utf8')
    if (bytes > MAX_BYTES) {
      console.error(`Objeto ${parsed.data.ineCode} de ${bytes} B supera el tope de 25 KB. Abortado sin escribir nada.`)
      process.exit(1)
    }
    if (!isValidIneCode(parsed.data.ineCode)) {
      console.error('Objeto con INE-5 inválido. Abortado.')
      process.exit(1)
    }
    objects.push(parsed.data)
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const checksums: Record<string, string> = {}
  let written = 0
  const queue = [...objects]
  async function worker(): Promise<void> {
    for (;;) {
      const obj = queue.shift()
      if (!obj) return
      const body = JSON.stringify(obj)
      await putWithRetry(r2, ineLayersKeyFor(obj.ineCode), body, {
        runid: runId,
        inecode: obj.ineCode,
        schema: obj.schemaVersion,
      })
      checksums[obj.ineCode] = Buffer.from(body).toString('base64').slice(0, 16)
      written += 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, objects.length) }, () => worker()))

  const manifest = {
    schemaVersion: 'municipal-ine-layers-manifest-v1',
    runId,
    layer,
    written,
    matchPct: summary.matchPct,
    p95Bytes: summary.p95Bytes,
    checksums,
    createdAt: new Date().toISOString(),
  }
  await putWithRetry(r2, `${INE_LAYERS_V1_MANIFESTS_PREFIX}/run-${runId}.json`, JSON.stringify(manifest), { runid: runId })
  await putWithRetry(r2, `${INE_LAYERS_V1_MANIFESTS_PREFIX}/latest-successful.json`, JSON.stringify(manifest), { runid: runId })

  writeFileSync(`tmp/ine-layers-${layer}-load.json`, JSON.stringify({ runId, written }, null, 2))
  console.log(`OK: ${written} municipios escritos bajo ${INE_LAYERS_V1_PREFIX} (runId ${runId}).`)
  console.log('Claves activas (socideas/v2, sociodeas/demographics) intactas.')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
