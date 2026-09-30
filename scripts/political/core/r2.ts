// Acceso a R2 del loader político (S3 API). Credenciales de .env.local.
// Nunca imprime secretos. Sólo escribe bajo socideas/secciones/v1/political/.
//
// Idempotencia: cada objeto lleva el metadato `content-sha256` (hash del
// contenido sin campos volátiles). Antes de escribir se consulta HeadObject:
// si el hash coincide, no se reescribe.

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { POLITICAL_R2_PREFIX } from '../../../src/lib/socideas-secciones-political'

export const META_CONTENT_SHA = 'content-sha256'

export interface R2 {
  client: S3Client
  bucket: string
}

export function r2FromEnv(): R2 {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!account || !key || !secret || !bucket) {
    throw new Error('Faltan R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET en .env.local')
  }
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: key, secretAccessKey: secret },
    }),
    bucket,
  }
}

function assertPrefix(key: string): void {
  if (!key.startsWith(`${POLITICAL_R2_PREFIX}/`)) throw new Error(`Clave fuera del prefijo político: ${key}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function withRetries<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let last: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      const name = (e as { name?: string }).name
      if (name === 'NoSuchKey' || name === 'NotFound') throw e
      if (i < attempts) await sleep(400 * 2 ** (i - 1))
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`)
}

/** Metadato content-sha256 del objeto, o null si no existe. */
export async function headContentSha(r2: R2, key: string): Promise<{ exists: boolean; sha: string | null; size: number | null }> {
  try {
    const h = await withRetries(() => r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key })), `HEAD ${key}`)
    return { exists: true, sha: h.Metadata?.[META_CONTENT_SHA] ?? null, size: h.ContentLength ?? null }
  } catch (e) {
    const name = (e as { name?: string }).name
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return { exists: false, sha: null, size: null }
    throw e
  }
}

export async function getText(r2: R2, key: string): Promise<string | null> {
  try {
    const r = await withRetries(() => r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key })), `GET ${key}`)
    return (await r.Body?.transformToString('utf-8')) ?? null
  } catch (e) {
    const name = (e as { name?: string }).name
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) return null
    throw e
  }
}

export async function getBytes(r2: R2, key: string): Promise<Uint8Array | null> {
  try {
    const r = await withRetries(() => r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key })), `GET ${key}`)
    return (await r.Body?.transformToByteArray()) ?? null
  } catch (e) {
    const name = (e as { name?: string }).name
    if (name === 'NoSuchKey' || name === 'NotFound') return null
    throw e
  }
}

export type PutOutcome = 'written' | 'unchanged'

/** Escribe si el content-sha256 difiere (o no existe). */
export async function putIfChanged(
  r2: R2,
  key: string,
  body: string | Uint8Array,
  contentSha: string,
  contentType: string,
): Promise<PutOutcome> {
  assertPrefix(key)
  const h = await headContentSha(r2, key)
  if (h.exists && h.sha === contentSha) return 'unchanged'
  await withRetries(
    () =>
      r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=300',
          Metadata: { [META_CONTENT_SHA]: contentSha },
        }),
      ),
    `PUT ${key}`,
  )
  return 'written'
}

export async function listKeys(r2: R2, prefix: string): Promise<string[]> {
  const out: string[] = []
  let token: string | undefined
  do {
    const r = await withRetries(
      () => r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: prefix, ContinuationToken: token })),
      `LIST ${prefix}`,
    )
    for (const o of r.Contents ?? []) if (o.Key) out.push(o.Key)
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return out
}

/** Pool concurrente: aplica fn a cada item con N en vuelo. Devuelve fallos. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<Array<{ item: T; error: string }>> {
  const failures: Array<{ item: T; error: string }> = []
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      const item = items[i] as T
      try {
        await fn(item, i)
      } catch (e) {
        failures.push({ item, error: e instanceof Error ? e.message : String(e) })
      }
    }
  })
  await Promise.all(workers)
  return failures
}
