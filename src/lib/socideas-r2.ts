// Acceso a R2 para datos masivos SOCideas (SOLO servidor para escritura;
// la lectura pública no necesita credenciales).
//
// Arquitectura Fase 2A.2: Supabase guarda catálogo, buscador territorial,
// runs de sincronización y último-año; el GRUESO (historia completa por
// municipio) vive en R2 como un JSON por municipio. Los datos son
// estadísticas oficiales públicas: el bucket se expone en lectura pública,
// sin secretos en el cliente.
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const R2_KEY_PREFIX_V1 = 'socideas/v1/municipios'
export const R2_KEY_PREFIX = 'socideas/v2/municipios'
export const R2_ENVELOPE_VERSION = 2

export interface R2MunicipioEnvelope {
  version: number
  codigo_ine: string
  generado_en: string
  /** v1: filas completas. v2: ver R2MunicipioEnvelopeV2. */
  valores: unknown[]
}

/** Formato v2 compacto y sin pérdidas: catálogos una vez arriba, filas como
 * tuplas [indicador, año, valor, unidad, dimensión, url, tabla, serie, estado].
 * Mismos datos y misma visibilidad que v1 (~85-90% menos bytes). */
export interface R2MunicipioEnvelopeV2 {
  version: 2
  codigo_ine: string
  generado_en: string
  indicators: { slug: string; nombre: string; unidad: string | null }[]
  sources: { slug: string; organismo: string; nombre: string }[]
  source_urls: string[]
  dimensiones: Record<string, string>[]
  valores: [number, number, number | null, string | null, number, number, string | null, string | null, string][]
}

export function r2KeyFor(codigoIne: string): string {
  return `${R2_KEY_PREFIX}/${codigoIne}.json`
}

export function r2KeyForV1(codigoIne: string): string {
  return `${R2_KEY_PREFIX_V1}/${codigoIne}.json`
}

/** Compacta filas completas (forma v1) a tuplas v2. */
export function toV2Envelope(
  codigoIne: string,
  generadoEn: string,
  filas: {
    indicator: { slug: string; nombre: string; unidad: string | null }
    source: { slug: string; organismo: string; nombre: string }
    anio_referencia: number | null
    valor_numerico: number | null
    unidad: string | null
    dimensiones: Record<string, string>
    source_url: string | null
    source_table_id: string | null
    source_series_id?: string | null
    estado_validacion: string
  }[],
): R2MunicipioEnvelopeV2 {
  const indicators: R2MunicipioEnvelopeV2['indicators'] = []
  const indIdx = new Map<string, number>()
  const sources: R2MunicipioEnvelopeV2['sources'] = []
  const srcIdx = new Map<string, number>()
  const urls: string[] = []
  const urlIdx = new Map<string, number>()
  const dims: Record<string, string>[] = []
  const dimIdx = new Map<string, number>()
  const valores: R2MunicipioEnvelopeV2['valores'] = []
  for (const f of filas) {
    let ii = indIdx.get(f.indicator.slug)
    if (ii === undefined) {
      ii = indicators.length
      indIdx.set(f.indicator.slug, ii)
      indicators.push({ slug: f.indicator.slug, nombre: f.indicator.nombre, unidad: f.indicator.unidad })
    }
    let si = srcIdx.get(f.source.slug)
    if (si === undefined) {
      si = sources.length
      srcIdx.set(f.source.slug, si)
      sources.push({ slug: f.source.slug, organismo: f.source.organismo, nombre: f.source.nombre })
    }
    const urlKey = f.source_url ?? ''
    let ui = urlIdx.get(urlKey)
    if (ui === undefined) {
      ui = urls.length
      urlIdx.set(urlKey, ui)
      urls.push(urlKey)
    }
    const dimKey = JSON.stringify(f.dimensiones)
    let di = dimIdx.get(dimKey)
    if (di === undefined) {
      di = dims.length
      dimIdx.set(dimKey, di)
      dims.push(f.dimensiones)
    }
    valores.push([
      ii,
      f.anio_referencia ?? 0,
      f.valor_numerico,
      f.unidad,
      di,
      ui,
      f.source_table_id,
      f.source_series_id ?? null,
      f.estado_validacion,
    ])
  }
  return {
    version: 2,
    codigo_ine: codigoIne,
    generado_en: generadoEn,
    indicators,
    sources,
    source_urls: urls,
    dimensiones: dims,
    valores,
  }
}

/** Expande un envelope v2 a filas completas (forma que consume la ficha).
 * Fase 2B: la tupla v2 no lleva índice de fuente; con varias fuentes (Economía)
 * la fuente se resuelve por `tableId` (correspondencia oficial) con fallback a
 * `sources[0]`. Los JSON de 1 fuente (Demografía) se expanden exactamente igual
 * que antes. */
export function expandV2Envelope(env: R2MunicipioEnvelopeV2): Record<string, unknown>[] {
  const bySlug = new Map(env.sources.map((s) => [s.slug, s]))
  const fallback = env.sources[0] ?? { slug: '', organismo: '', nombre: '' }
  return env.valores.map((t) => {
    const [ii, anio, valor, unidad, di, ui, tableId, serieId, estado] = t
    const ind = env.indicators[ii] ?? { slug: '', nombre: '', unidad: null }
    const src = (tableId ? sourceSlugForTable(tableId) : null) ?? null
    const source = (src ? bySlug.get(src) : undefined) ?? fallback
    return {
      municipio_codigo_ine: env.codigo_ine,
      anio_referencia: anio,
      fecha_referencia: `${anio}-01-01`,
      valor_numerico: valor,
      valor_texto: null,
      unidad,
      dimensiones: env.dimensiones[di] ?? {},
      source_url: env.source_urls[ui] ?? '',
      source_table_id: tableId,
      source_series_id: serieId,
      estado_validacion: estado,
      obtenido_en: env.generado_en,
      indicator: ind,
      source,
    }
  })
}

/** Correspondencia oficial tableId → source.slug para envelopes multi-fuente.
 * DPOP provincial / 2853 / 33570 / DIRCE 4721 / ADRH 53688 viven en Tempus3;
 * EDM* es AEAT; el resto de tablas ADRH/agrarias se resuelven por prefijo. */
export function sourceSlugForTable(tableId: string): string | null {
  if (/^(28(5[3-9]|6\d|7\d|8\d|9\d|90[0-7])|33570)$/.test(tableId)) return 'ine_tempus3'
  if (tableId === '4721') return 'ine_dirce'
  if (tableId === '53688' || /^ADRH/i.test(tableId)) return 'ine_adrh'
  if (/^EDM\d{4}$/.test(tableId)) return 'aeat_edm'
  if (/^CA20/i.test(tableId)) return 'ine_censo_agrario'
  return null
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

/** Lee el JSON del municipio desde la URL pública (sin credenciales).
 * Prueba v2 y recurre a v1 durante la transición. */
export async function readMunicipioJson(codigoIne: string): Promise<R2MunicipioEnvelope | null> {
  const base = r2PublicBase()
  if (!base) return null
  for (const key of [r2KeyFor(codigoIne), r2KeyForV1(codigoIne)]) {
    const found = await fetchR2Key(base, key, codigoIne)
    if (found) return found
  }
  return null
}

async function fetchR2Key(
  base: string,
  key: string,
  codigoIne: string,
): Promise<R2MunicipioEnvelope | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${base}/${key}`, {
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
export async function putMunicipioJson(
  codigoIne: string,
  envelope: R2MunicipioEnvelope | R2MunicipioEnvelopeV2,
): Promise<string> {
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
