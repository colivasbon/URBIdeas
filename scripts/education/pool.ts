// Concurrencia acotada y reintentos con backoff. Sin E/S propia.

/** Ejecuta `fn` sobre `items` con como mucho `concurrency` tareas a la vez. Conserva el orden. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const n = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

/** true para errores de red, 5xx, 429 y tiempos de espera. */
export function esReintentable(e: unknown): boolean {
  const err = e as { name?: string; code?: string; $metadata?: { httpStatusCode?: number }; $retryable?: unknown; message?: string }
  const status = err?.$metadata?.httpStatusCode
  if (typeof status === 'number') return status >= 500 || status === 429
  if (err?.$retryable) return true
  const marca = `${err?.name ?? ''} ${err?.code ?? ''} ${err?.message ?? ''}`
  return /ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|TimeoutError|NetworkingError|RequestTimeout|fetch failed|AbortError|UND_ERR/i.test(marca)
}

export interface OpcionesReintento {
  intentos?: number
  baseMs?: number
  maxMs?: number
  reintentable?: (e: unknown) => boolean
  onReintento?: (e: unknown, intento: number, esperaMs: number) => void
}

/** Backoff exponencial con jitter. Lanza el último error si se agotan los intentos. */
export async function conReintentos<T>(fn: () => Promise<T>, op: OpcionesReintento = {}): Promise<T> {
  const intentos = op.intentos ?? 5
  const base = op.baseMs ?? 400
  const max = op.maxMs ?? 8000
  const reintentable = op.reintentable ?? esReintentable
  let ultimo: unknown
  for (let i = 1; i <= intentos; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      if (i === intentos || !reintentable(e)) throw e
      const espera = Math.min(max, base * 2 ** (i - 1)) * (0.75 + Math.random() * 0.5)
      op.onReintento?.(e, i, espera)
      await new Promise((r) => setTimeout(r, espera))
    }
  }
  throw ultimo
}
