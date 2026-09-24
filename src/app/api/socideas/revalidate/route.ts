import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import {
  REVALIDATE_TOKEN_HEADER,
  muniCacheTag,
  parseRevalidateBody,
  tokenMatches,
} from '@/lib/socideas-revalidate'

export const dynamic = 'force-dynamic'

// ——— B3: rate limit deslizante (en memoria, best-effort por instancia) ———
// Límites: 60 peticiones autenticadas/min por IP y 5.000 INEs/min acumulados
// (los loaders hacen 1 petición por lote de ≤200 INE → 25 lotes/min, holgado).
// En serverless cada instancia mantiene su propio Map: el cómputo es
// best-effort (no un quota distribuido); frena bucles concentrados sobre una
// instancia, no es a prueba de multi-región. La autenticación SIEMPRE corre
// ANTES: sin token válido no se consume cupo y no hay sondeo del rate limit.
// Los 429 no incluyen secretos ni IP en los logs.
const RATE_WINDOW_MS = 60_000
const RATE_MAX_REQUESTS_PER_MIN = 60
const RATE_MAX_INES_PER_MIN = 5_000

interface RateState {
  /** Timestamps de peticiones autenticadas dentro de la ventana (orden creciente). */
  reqs: number[]
  /** Consumo de INEs por evento {t, n} dentro de la ventana. */
  ines: Array<{ t: number; n: number }>
}

/** Clave = IP del proxy (x-forwarded-for, primer salto). Sin token/secretos. */
function rateKey(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0] : '').trim()
  return ip || 'unknown'
}

const rateStates = new Map<string, RateState>()

function pruneState(state: RateState, now: number): void {
  const cut = now - RATE_WINDOW_MS
  while (state.reqs.length > 0 && state.reqs[0] <= cut) state.reqs.shift()
  while (state.ines.length > 0 && state.ines[0].t <= cut) state.ines.shift()
}

function sweepIdleStates(now: number): void {
  if (rateStates.size <= 256) return
  for (const [key, state] of rateStates) {
    pruneState(state, now)
    if (state.reqs.length === 0 && state.ines.length === 0) rateStates.delete(key)
  }
}

function getRateState(key: string, now: number): RateState {
  let state = rateStates.get(key)
  if (!state) {
    state = { reqs: [], ines: [] }
    rateStates.set(key, state)
  }
  pruneState(state, now)
  sweepIdleStates(now)
  return state
}

type RateDecision =
  | { ok: true }
  | { ok: false; retryAfterSec: number; limit: 'requests' | 'ines' }

/** Consume 1 petición autenticada de la ventana deslizante. */
export function consumeRateRequest(key: string, now = Date.now()): RateDecision {
  const state = getRateState(key, now)
  if (state.reqs.length >= RATE_MAX_REQUESTS_PER_MIN) {
    const retryAfterSec = Math.max(1, Math.ceil((state.reqs[0] + RATE_WINDOW_MS - now) / 1000))
    return { ok: false, retryAfterSec, limit: 'requests' }
  }
  state.reqs.push(now)
  return { ok: true }
}

/** Consume `n` INEs del techo acumulado de la ventana deslizante. */
export function consumeRateInes(key: string, n: number, now = Date.now()): RateDecision {
  if (n <= 0) return { ok: true }
  const state = getRateState(key, now)
  let total = 0
  for (const e of state.ines) total += e.n
  if (total + n > RATE_MAX_INES_PER_MIN) {
    const retryAfterSec = state.ines.length > 0
      ? Math.max(1, Math.ceil((state.ines[0].t + RATE_WINDOW_MS - now) / 1000))
      : Math.ceil(RATE_WINDOW_MS / 1000)
    return { ok: false, retryAfterSec, limit: 'ines' }
  }
  state.ines.push({ t: now, n })
  return { ok: true }
}

function rateLimitedResponse(decision: Extract<RateDecision, { ok: false }>): NextResponse {
  console.log(JSON.stringify({
    tag: 'SOCIDEAS_REVALIDATE',
    outcome: 'rate_limited',
    limit: decision.limit,
    retry_after_s: decision.retryAfterSec,
    ts: new Date().toISOString(),
  }))
  return NextResponse.json(
    { data: null, error: 'Límite de tasa excedido. Reintente en unos segundos.', count: 0 },
    { status: 429, headers: { 'Retry-After': String(decision.retryAfterSec) } },
  )
}

/**
 * POST /api/socideas/revalidate — invalidación selectiva de la caché municipal.
 *
 * Protegido con `SOCIDEAS_REVALIDATE_TOKEN` (cabecera `x-revalidate-token`,
 * comparación en tiempo constante). B2: SIN fallback a `SOCIDEAS_SYNC_TOKEN`.
 * Sin secreto dedicado configurado → 503; secreto ausente/incorrecto (incluido
 * un valor de SYNC) → 401; método distinto de POST → 405.
 *
 * Orden del contrato (B3): método → 503 → 401 (auth) → rate limit 429 →
 * body inválido 400 → techo de INEs 429 → 200. El rate limit corre SIEMPRE
 * después de la auth para no permitir sondeo sin token.
 *
 * Body: `{ "ines": ["02003", ...] }` — solo INE-5 estrictos, máximo
 * REVALIDATE_MAX_INES por petición. Inválidos se descartan y se contabilizan;
 * payload estructuralmente inválido → 400.
 *
 * Invoca `revalidateTag('socideas-muni-<ine>', { expire: 0 })` por cada INE
 * válido. NUNCA hace revalidación global. Los logs no incluyen el secreto.
 */
export async function POST(request: NextRequest) {
  // B2: SOLO el token dedicado. Sin fallback a SOCIDEAS_SYNC_TOKEN
  // (ese secreto abre /sync y /sync-economia, no la revalidación masiva).
  const expected = process.env.SOCIDEAS_REVALIDATE_TOKEN
  if (!expected) {
    console.log(JSON.stringify({ tag: 'SOCIDEAS_REVALIDATE', outcome: 'not_configured', ts: new Date().toISOString() }))
    return NextResponse.json(
      { data: null, error: 'Revalidación no configurada en este entorno.', count: 0 },
      { status: 503 },
    )
  }
  const provided = request.headers.get(REVALIDATE_TOKEN_HEADER)
  if (!tokenMatches(provided, expected)) {
    console.log(JSON.stringify({ tag: 'SOCIDEAS_REVALIDATE', outcome: 'unauthorized', ts: new Date().toISOString() }))
    return NextResponse.json({ data: null, error: 'No autorizado', count: 0 }, { status: 401 })
  }

  // Auth superada → tasa por IP (solo peticiones autenticadas consumen cupo).
  const rateKeyIp = rateKey(request)
  const reqDecision = consumeRateRequest(rateKeyIp)
  if (!reqDecision.ok) return rateLimitedResponse(reqDecision)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body JSON inválido.', count: 0 }, { status: 400 })
  }
  const parsed = parseRevalidateBody(body)
  if (!parsed.ok) {
    console.log(JSON.stringify({ tag: 'SOCIDEAS_REVALIDATE', outcome: 'bad_request', reason: parsed.reason, ts: new Date().toISOString() }))
    return NextResponse.json({ data: null, error: parsed.reason, count: 0 }, { status: 400 })
  }

  // Techo de INEs/min solo tras payload válido (los 400 no penalizan el
  // presupuesto de tags, solo el de peticiones de arriba).
  const { validos, solicitados, descartados } = parsed.validation
  const inesDecision = consumeRateInes(rateKeyIp, validos.length)
  if (!inesDecision.ok) return rateLimitedResponse(inesDecision)

  let invalidados = 0
  let errores = 0
  for (const ine of validos) {
    try {
      revalidateTag(muniCacheTag(ine), { expire: 0 })
      invalidados++
    } catch (e) {
      errores++
      console.error(JSON.stringify({
        tag: 'SOCIDEAS_REVALIDATE',
        outcome: 'tag_error',
        ine,
        error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        ts: new Date().toISOString(),
      }))
    }
  }

  const summary = { solicitados, validos: validos.length, invalidados, descartados, errores }
  console.log(JSON.stringify({ tag: 'SOCIDEAS_REVALIDATE', outcome: 'ok', ...summary, ts: new Date().toISOString() }))
  return NextResponse.json({ data: summary, error: null, count: invalidados }, { status: 200 })
}

/** Métodos no permitidos → 405 (sin ejecutar nada). */
export async function GET() {
  return NextResponse.json({ data: null, error: 'Método no permitido. Use POST.', count: 0 }, { status: 405, headers: { Allow: 'POST' } })
}
export async function PUT() {
  return NextResponse.json({ data: null, error: 'Método no permitido. Use POST.', count: 0 }, { status: 405, headers: { Allow: 'POST' } })
}
export async function DELETE() {
  return NextResponse.json({ data: null, error: 'Método no permitido. Use POST.', count: 0 }, { status: 405, headers: { Allow: 'POST' } })
}
