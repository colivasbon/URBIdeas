// Invalidación selectiva de la caché por municipio (tag `socideas-muni-<ine>`).
//
// Los loaders corren como scripts Node FUERA del runtime Next/Vercel, donde
// `revalidateTag()` no existe. Por eso la invalidación se hace contra el
// endpoint interno `POST /api/socideas/revalidate`, protegido con secreto de
// entorno (`SOCIDEAS_REVALIDATE_TOKEN`, SOLO servidor — nunca NEXT_PUBLIC_*).
//
// Contrato:
//  - Se escribe primero el objeto R2; solo después se revalida.
//  - Si la escritura R2 falló, NO se llama a revalidación (shouldRevalidate).
//  - El endpoint solo acepta INE-5 estrictamente validados, en batch.
//  - Un fallo de revalidación NUNCA revierte datos R2: se audita como
//    degradación (ver buildRevalidationAuditRow).
//  - Sin secreto/URL en local, la revalidación se omite con degradación
//    explícita: no rompe desarrollo ni builds.

export const REVALIDATE_PATH = '/api/socideas/revalidate'
export const REVALIDATE_TOKEN_HEADER = 'x-revalidate-token'
/** Tamaño de lote por petición (el endpoint acepta hasta MAX_INES por request). */
export const REVALIDATE_BATCH_SIZE = 200
/** Límite estricto de INEs por request (payloads mayores se rechazan con 400). */
export const REVALIDATE_MAX_INES = 2000
/** Reintentos por lote ante error de red/5xx (backoff exponencial base 500 ms). */
export const REVALIDATE_MAX_RETRIES = 3

export type RevalidateMode = 'endpoint' | 'omitido'

export interface RevalidationSummary {
  /** Municipios recibidos por el llamador (INE-5 ya escritos en R2). */
  solicitados: number
  /** INE-5 bien formados tras normalizar (únicos). */
  validos: number
  /** Tags invalidadas con éxito según respuesta del endpoint. */
  invalidados: number
  /** Entradas descartadas por formato inválido o duplicado. */
  descartados: number
  /** Lotes fallidos (tras reintentos) o errores declarados por el endpoint. */
  errores: number
  /** true = no se pudo completar la invalidación (degradación auditada). */
  degradado: boolean
  /** Cómo se intentó la invalidación. */
  modo: RevalidateMode
  /** Base URL usada (sin secretos). Null si se omitió. */
  endpoint: string | null
  timestamp: string
  /** Error resumido, si existe (sin secretos). */
  error?: string
}

export interface IneListValidation {
  /** INE-5 únicos y bien formados, en orden de aparición. */
  validos: string[]
  /** Total de entradas recibidas (antes de validar/deduplicar). */
  solicitados: number
  /** Entradas no válidas (formato) + duplicados eliminados. */
  descartados: number
}

/** INE-5 estricto: exactamente 5 dígitos ASCII. */
export function isValidIne5(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{5}$/.test(value)
}

/** Tag de caché de un municipio — DEBE coincidir con `readMunicipioJson`. */
export function muniCacheTag(ine: string): string {
  return `socideas-muni-${ine}`
}

/**
 * Valida y normaliza una lista de INE-5 aceptando cualquier entrada desconocida
 * como "descartada" (no lanza). El límite de tamaño lo decide el caller
 * (endpoint: 400 si supera REVALIDATE_MAX_INES).
 */
export function validateIneList(raw: unknown): IneListValidation {
  if (!Array.isArray(raw)) return { validos: [], solicitados: 0, descartados: 0 }
  const seen = new Set<string>()
  const validos: string[] = []
  let descartados = 0
  for (const item of raw) {
    if (!isValidIne5(item)) {
      descartados++
      continue
    }
    if (seen.has(item)) {
      descartados++
      continue
    }
    seen.add(item)
    validos.push(item)
  }
  return { validos, solicitados: raw.length, descartados }
}

/**
 * Parsea el body del endpoint. Devuelve error estructural (→ 400) o la lista
 * validada. Reglas estrictas: objeto con `ines` array; tope de tamaño; sin
 * duplicados excesivos (se deduplica, pero un payload mayor al tope se rechaza
 * completo aunque todo sean duplicados).
 */
export function parseRevalidateBody(
  body: unknown,
): { ok: true; validation: IneListValidation } | { ok: false; reason: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, reason: 'El body debe ser un objeto JSON con la clave "ines".' }
  }
  const ines = (body as { ines?: unknown }).ines
  if (!Array.isArray(ines)) {
    return { ok: false, reason: 'La clave "ines" debe ser un array.' }
  }
  if (ines.length === 0) {
    return { ok: false, reason: 'La lista "ines" no puede estar vacía.' }
  }
  if (ines.length > REVALIDATE_MAX_INES) {
    return {
      ok: false,
      reason: `Demasiadas entradas (${ines.length} > ${REVALIDATE_MAX_INES}). Envíe en lotes.`,
    }
  }
  const validation = validateIneList(ines)
  // Contrato: un payload sin NI UN INE-5 válido es inválido (400), no un 200
  // con invalidados=0 (éxito vacío engañoso). Payloads mixtos (≥1 válido)
  // siguen siendo 200 con descartados contabilizados.
  if (validation.validos.length === 0) {
    return { ok: false, reason: 'Ningún INE-5 válido en la lista (todos malformados o no numéricos).' }
  }
  return { ok: true, validation }
}

/** Divide una lista en lotes de tamaño fijo (para batching por petición). */
export function chunkInes(ines: readonly string[], size = REVALIDATE_BATCH_SIZE): string[][] {
  const n = Math.max(1, Math.floor(size))
  const out: string[][] = []
  for (let i = 0; i < ines.length; i += n) out.push(ines.slice(i, i + n))
  return out
}

/** ¿Procede revalidar? Solo si la escritura R2 fue exitosa (≥1 municipio). */
export function shouldRevalidate(writtenCount: number): boolean {
  return Number.isFinite(writtenCount) && writtenCount > 0
}

export type RevalidateFn = (ines: readonly string[]) => Promise<RevalidationSummary>

/**
 * Capa de orquestación writer → revalidación (testeable con inyección):
 *  - lista vacía (carga fallida o dry-run) → NO se invoca la revalidación (null);
 *  - lista con INE escritos → delega en la función recibida (por defecto la
 *    clienta HTTP con batching/reintentos).
 * Los writers solo pasan los INE-5 cuya escritura R2 confirmó.
 */
export async function revalidateAfterWrites(
  writtenInes: readonly string[],
  opts: { revalidateFn?: RevalidateFn } = {},
): Promise<RevalidationSummary | null> {
  if (!shouldRevalidate(writtenInes.length)) return null
  const fn: RevalidateFn = opts.revalidateFn ?? ((ines) => revalidateMunicipios(ines))
  return fn(writtenInes)
}

/** Compara token proporcionado/esperado en tiempo constante (sin fugas por longitud en claro). */
export function tokenMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || expected.length === 0) return false
  const a = Buffer.from(provided ?? '', 'utf8')
  const b = Buffer.from(expected, 'utf8')
  // Se recorre siempre el buffer más largo para no rampear por longitud.
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

interface EndpointBatchResponse {
  solicitados: number
  validos: number
  invalidados: number
  descartados: number
  errores: number
}

function emptySummary(modo: RevalidateMode, endpoint: string | null, solicitados: number, validos: number, descartados: number): RevalidationSummary {
  return {
    solicitados,
    validos,
    invalidados: 0,
    descartados,
    errores: 0,
    degradado: false,
    modo,
    endpoint,
    timestamp: new Date().toISOString(),
  }
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>

async function postBatch(
  baseUrl: string,
  token: string,
  ines: string[],
  fetchImpl: FetchImpl,
): Promise<EndpointBatchResponse> {
  let lastError = 'error desconocido'
  for (let attempt = 0; attempt < REVALIDATE_MAX_RETRIES; attempt++) {
    try {
      const res = await fetchImpl(`${baseUrl}${REVALIDATE_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [REVALIDATE_TOKEN_HEADER]: token,
        },
        body: JSON.stringify({ ines }),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 401 || res.status === 403 || res.status === 400 || res.status === 405) {
        // Error del cliente: reintentar no ayuda.
        const detail = await res.text().catch(() => '')
        throw Object.assign(new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`), { fatal: true })
      }
      if (!res.ok) {
        lastError = `HTTP ${res.status}`
        continue
      }
      const json = (await res.json()) as { data?: EndpointBatchResponse }
      const data = json.data
      if (!data || typeof data.invalidados !== 'number') {
        lastError = 'respuesta sin data válida'
        continue
      }
      return data
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e
      lastError = e instanceof Error ? e.message : String(e)
      if (attempt < REVALIDATE_MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      }
    }
  }
  throw new Error(lastError)
}

/**
 * Revalida las tags de los municipios indicados vía endpoint interno.
 * Nunca lanza: cualquier fallo se resume como `degradado: true` para que el
 * caller lo audite sin tumbar la carga.
 */
export async function revalidateMunicipios(
  ines: readonly string[],
  opts: {
    baseUrl?: string | null
    token?: string | null
    fetchImpl?: FetchImpl
    /** Overrides solo para pruebas locales. */
    now?: () => string
  } = {},
): Promise<RevalidationSummary> {
  const now = opts.now ?? (() => new Date().toISOString())
  const { validos, solicitados, descartados } = validateIneList(ines)
  const summary = emptySummary('omitido', null, solicitados, validos.length, descartados)
  summary.timestamp = now()

  if (validos.length === 0) {
    // Nada que revalidar (p. ej. escritura R2 sin municipios): sin degradación.
    return summary
  }

  const baseUrl = (opts.baseUrl ?? process.env.SOCIDEAS_REVALIDATE_BASE_URL ?? '').replace(/\/$/, '')
  // B2: solo el token dedicado. Un SYNC filtrado ya no habilita revalidación
  // desde los loaders (el endpoint tampoco lo acepta → 401/503 auditado).
  const token = opts.token ?? process.env.SOCIDEAS_REVALIDATE_TOKEN ?? ''
  if (!baseUrl || !token) {
    summary.degradado = true
    summary.errores = validos.length
    summary.error = !baseUrl
      ? 'SOCIDEAS_REVALIDATE_BASE_URL no configurada: revalidación omitida'
      : 'SOCIDEAS_REVALIDATE_TOKEN no configurada: revalidación omitida'
    return summary
  }

  const fetchImpl: FetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init))
  summary.modo = 'endpoint'
  summary.endpoint = `${baseUrl}${REVALIDATE_PATH}`

  const batches = chunkInes(validos)
  let invalidados = 0
  let errores = 0
  const batchErrors: string[] = []
  // Serial por lotes: orden predecible y presión mínima sobre el runtime.
  for (const batch of batches) {
    try {
      const data = await postBatch(baseUrl, token, batch, fetchImpl)
      invalidados += data.invalidados
      errores += data.errores
      summary.descartados += data.descartados
      if (data.errores > 0) batchErrors.push(`${data.errores} tags con error`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errores += batch.length
      batchErrors.push(msg)
    }
  }
  summary.invalidados = invalidados
  summary.errores = errores
  if (batchErrors.length > 0) {
    summary.degradado = true
    summary.error = batchErrors.join(' | ').slice(0, 500)
  }
  summary.timestamp = now()
  return summary
}

/**
 * Fila de `data_sync_runs` para auditar el resultado de la revalidación.
 * Estado: ok si todo invalidado; partial si hubo errores; error si no se
 * invalidó nada con Socios solicitados. Nunca un éxito silencioso.
 */
export function buildRevalidationAuditRow(
  summary: RevalidationSummary,
  extra: { runId: string; writtenCount: number; tipo?: string; bloque?: string; periodo?: string; fuente?: string },
): {
  source_id: null
  tipo_sincronizacion: string
  municipio_codigo_ine: string | null
  estado: 'ok' | 'partial' | 'error'
  registros_leidos: number
  registros_actualizados: number
  fin: string
  estado_dato: string
  bloque: string
  periodo: string
  fuente: string
  metadata: Record<string, unknown>
} {
  const estado: 'ok' | 'partial' | 'error' =
    summary.invalidados > 0 && summary.errores === 0
      ? 'ok'
      : summary.invalidados > 0
        ? 'partial'
        : summary.solicitados === 0
          ? 'ok'
          : 'error'
  return {
    source_id: null,
    tipo_sincronizacion: extra.tipo ?? 'revalidacion_tags',
    municipio_codigo_ine: null,
    estado,
    registros_leidos: summary.solicitados,
    registros_actualizados: summary.invalidados,
    fin: summary.timestamp,
    estado_dato: 'consolidado',
    bloque: extra.bloque ?? 'cache',
    periodo: extra.periodo ?? '',
    fuente: extra.fuente ?? '',
    metadata: {
      run_id: extra.runId,
      total_municipios_escritos: extra.writtenCount,
      tags_solicitadas: summary.solicitados,
      tags_validas: summary.validos,
      tags_revalidadas: summary.invalidados,
      tags_fallidas: summary.errores,
      descartadas: summary.descartados,
      endpoint_modo: summary.modo,
      endpoint: summary.endpoint,
      degradado: summary.degradado,
      timestamp: summary.timestamp,
      error: summary.error ?? null,
    },
  }
}
