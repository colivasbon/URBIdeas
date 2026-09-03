// Acceso a R2 para datos masivos SOCideas (SOLO servidor para escritura;
// la lectura pública no necesita credenciales).
//
// Arquitectura Fase 2A.2: Supabase guarda catálogo, buscador territorial,
// runs de sincronización y último-año; el GRUESO (historia completa por
// municipio) vive en R2 como un JSON por municipio. Los datos son
// estadísticas oficiales públicas: el bucket se expone en lectura pública,
// sin secretos en el cliente.
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const R2_KEY_PREFIX = 'socideas/v1/municipios'
export const R2_ENVELOPE_VERSION = 1

export interface R2MunicipioEnvelope {
  version: number
  codigo_ine: string
  generado_en: string
  /** Filas con indicator/source ya incrustados (misma forma que la API). */
  valores: unknown[]
}

export function r2KeyFor(codigoIne: string): string {
  return `${R2_KEY_PREFIX}/${codigoIne}.json`
}

function r2PublicBase(): string | null {
  const base = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? process.env.SOCIDEAS_R2_PUBLIC_BASE
  return base ? base.replace(/\/$/, '') : null
}

function r2ClientFromEnv(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Falta configuración R2 en servidor (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function r2BucketFromEnv(): string {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error('Falta R2_BUCKET en servidor')
  return bucket
}

/** Lee el JSON del municipio desde la URL pública (sin credenciales). */
export async function readMunicipioJson(codigoIne: string): Promise<R2MunicipioEnvelope | null> {
  const base = r2PublicBase()
  if (!base) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${base}/${r2KeyFor(codigoIne)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`R2 respondió ${res.status}`)
    const json = (await res.json()) as R2MunicipioEnvelope
    if (!json || json.codigo_ine !== codigoIne || !Array.isArray(json.valores)) return null
    return json
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Escribe (sobrescribe) el JSON del municipio. Idempotente por clave. */
export async function putMunicipioJson(codigoIne: string, envelope: R2MunicipioEnvelope): Promise<string> {
  const client = r2ClientFromEnv()
  const bucket = r2BucketFromEnv()
  const key = r2KeyFor(codigoIne)
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(envelope),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=86400',
    }),
  )
  return key
}

/** Descarga directa (para scripts de migración con credenciales). */
export async function getMunicipioJsonRaw(codigoIne: string): Promise<R2MunicipioEnvelope | null> {
  const client = r2ClientFromEnv()
  const bucket = r2BucketFromEnv()
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: r2KeyFor(codigoIne) }),
    )
    const text = await res.Body?.transformToString()
    if (!text) return null
    const json = JSON.parse(text) as R2MunicipioEnvelope
    if (!json || json.codigo_ine !== codigoIne || !Array.isArray(json.valores)) return null
    return json
  } catch {
    return null
  }
}
