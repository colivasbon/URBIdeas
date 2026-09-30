// Hash y JSON canónico del núcleo político.
//
// La idempotencia de la publicación se basa en `content_sha256`: SHA-256 del
// JSON canónico (claves ordenadas) SIN los campos volátiles (fechas de
// descarga/sincronización y el propio hash). Dos ejecuciones sobre los mismos
// ficheros oficiales producen el mismo hash aunque cambie la hora.

import { createHash } from 'node:crypto'

export function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Campos que no forman parte del contenido (cambian entre ejecuciones). */
export const VOLATILE_FIELDS: ReadonlySet<string> = new Set(['content_sha256', 'retrievedAt', 'synced_at', 'generatedAt'])

function canonical(value: unknown, dropVolatile: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => canonical(v, dropVolatile))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      if (dropVolatile && VOLATILE_FIELDS.has(k)) continue
      const v = (value as Record<string, unknown>)[k]
      if (v === undefined) continue
      out[k] = canonical(v, dropVolatile)
    }
    return out
  }
  return value
}

/** JSON con claves ordenadas (estable entre ejecuciones y plataformas). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value, false))
}

/** SHA-256 del contenido sin campos volátiles. */
export function contentSha256(value: unknown): string {
  return sha256Hex(JSON.stringify(canonical(value, true)))
}
