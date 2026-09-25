// Datos temporales/provisionales municipales — SOLO SERVIDOR (lectura pública;
// la escritura queda reservada a la herramienta interna autorizada).
//
// Colección lateral NUEVA y aislada respecto a las capas canónicas:
//   `socideas/temporary-data/v1/municipal/{INE-5}.json`
// No se escriben datos de ejemplo en esta tarea y no se activa temporalidad
// para municipios que no la tengan. Un temporal nunca sustituye al consolidado.

export const TEMPORARY_DATA_V1_SCHEMA = 'temporary-municipal-data-v1'
export const TEMPORARY_DATA_V1_PREFIX = 'socideas/temporary-data/v1/municipal'
export const TEMPORARY_LABEL = 'Dato provisional'

export interface TemporaryMunicipalData {
  schemaVersion: typeof TEMPORARY_DATA_V1_SCHEMA
  ineCode: string
  status: 'provisional'
  label: typeof TEMPORARY_LABEL
  source: string
  sourceUrl?: string
  period: string
  publishedAt?: string
  retrievedAt: string
  expiresAt?: string
  replaces?: string | null
  values: Record<string, unknown>
  notes?: string[]
}

export function isValidTemporaryIneCode(code: string): boolean {
  return /^\d{5}$/.test(code)
}

export function temporaryDataKeyFor(codigoIne: string): string {
  return `${TEMPORARY_DATA_V1_PREFIX}/${codigoIne}.json`
}

/** Fecha ISO válida. */
function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

/**
 * Validación estricta del contrato temporal. Rechaza:
 *  - status distinto de `provisional`;
 *  - etiqueta visible distinta de `Dato provisional`;
 *  - ausencia de fuente, período o fecha de extracción;
 *  - municipio INE-5 inválido;
 *  - valores no serializables.
 */
export function validateTemporaryMunicipalData(
  value: unknown,
): { ok: true; data: TemporaryMunicipalData } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!value || typeof value !== 'object') return { ok: false, errors: ['objeto raíz inválido'] }
  const o = value as Record<string, unknown>
  if (o.schemaVersion !== TEMPORARY_DATA_V1_SCHEMA) errors.push('schemaVersion no coincide')
  if (typeof o.ineCode !== 'string' || !isValidTemporaryIneCode(o.ineCode)) errors.push('ineCode no es INE-5')
  if (o.status !== 'provisional') errors.push('status debe ser provisional')
  if (o.label !== TEMPORARY_LABEL) errors.push(`label debe ser "${TEMPORARY_LABEL}"`)
  if (typeof o.source !== 'string' || o.source.trim().length === 0) errors.push('source obligatoria')
  if (typeof o.period !== 'string' || o.period.trim().length === 0) errors.push('period obligatorio')
  if (!isIsoDate(o.retrievedAt)) errors.push('retrievedAt obligatorio y válido')
  if (o.publishedAt !== undefined && !isIsoDate(o.publishedAt)) errors.push('publishedAt inválido')
  if (o.expiresAt !== undefined && !isIsoDate(o.expiresAt)) errors.push('expiresAt inválido')
  if (!o.values || typeof o.values !== 'object' || Array.isArray(o.values)) errors.push('values debe ser un objeto')
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: value as TemporaryMunicipalData }
}

/** Devuelve true solo si hay temporal y no está caducado respecto a `now`. */
export function isTemporaryCurrent(data: TemporaryMunicipalData, now = new Date()): boolean {
  if (!data.expiresAt) return true
  const exp = new Date(data.expiresAt)
  return Number.isNaN(exp.getTime()) ? true : exp.getTime() >= now.getTime()
}

function r2PublicBase(): string | null {
  // `||` (no `??`): una env definida pero VACÍA debe caer al fallback, igual
  // que en `socideas-r2.ts`; con `??` una cadena vacía anulaba la lectura.
  const base =
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    process.env.SOCIDEAS_R2_PUBLIC_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  return base ? base.replace(/\/$/, '') : null
}

/**
 * Lee el objeto temporal del municipio (lectura pública R2). Devuelve null ante
 * ausencia, error, timeout o contrato inválido. No expone rutas ni errores
 * técnicos; nunca lanza.
 */
export async function readTemporaryMunicipalData(codigoIne: string): Promise<TemporaryMunicipalData | null> {
  if (!isValidTemporaryIneCode(codigoIne)) return null
  const base = r2PublicBase()
  if (!base) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${base}/${temporaryDataKeyFor(codigoIne)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.status !== 200) return null
    const json = (await res.json()) as unknown
    const parsed = validateTemporaryMunicipalData(json)
    if (!parsed.ok) {
      console.error(`[socideas][temporal] objeto descartado para ${codigoIne}: ${parsed.errors.join('; ')}`)
      return null
    }
    if (parsed.data.ineCode !== codigoIne) return null
    return parsed.data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
