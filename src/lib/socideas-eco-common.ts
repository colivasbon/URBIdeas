// Tipos y utilidades comunes de los adaptadores económicos SOCideas (SOLO servidor).
// Ningún adaptador se importa desde componentes de cliente; las fuentes oficiales
// solo se consultan en sincronizaciones controladas, nunca en la lectura de fichas.

export type EconomySourceSlug = 'aeat_edm' | 'ine_adrh' | 'ine_dirce' | 'ine_censo_agrario' | 'sepe' | 'tgss'

export interface EconomyRow {
  slug: string
  anio: number
  valor: number
  unidad: string
  dimensiones: Record<string, string>
  sourceSlug: EconomySourceSlug
  sourceUrl: string
  tableId: string
  serieId?: string | null
}

export class EcoError extends Error {
  readonly url: string
  readonly status?: number
  constructor(message: string, url: string, status?: number) {
    super(message)
    this.name = 'EcoError'
    this.url = url
    this.status = status
  }
}

const FETCH_TIMEOUT_MS = 30000

/** Descarga binaria o texto con timeout + 1 reintento (patrón ine-tempus). */
export async function fetchEco(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= 1; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: '*/*', 'User-Agent': 'URBIdeas/1.0' },
      })
      if (!res.ok) throw new EcoError(`Fuente oficial respondió ${res.status}`, url, res.status)
      return res
    } catch (err) {
      lastError = err
      if (attempt < 1) await new Promise((r) => setTimeout(r, 1000))
    } finally {
      clearTimeout(timer)
    }
  }
  if (lastError instanceof EcoError) throw lastError
  throw new EcoError(
    lastError instanceof Error ? `Fallo de red: ${lastError.message}` : 'Fallo de red',
    url,
  )
}

/** Normaliza un número con formato español (12.345,6) o internacional. */
export function parseEsNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (s === '' || s === '-' || s.toUpperCase() === 'ND' || s === '..' || s === ':') return null
  // Formato español: miles con punto, decimales con coma.
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Código INE de 5 dígitos contenido en un texto (p. ej. "02069 Roda, La"). */
export function extractIne5(texto: string): string | null {
  const m = texto.match(/\b(\d{5})\b/)
  return m ? m[1] : null
}
