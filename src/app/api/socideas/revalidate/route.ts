import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import {
  REVALIDATE_TOKEN_HEADER,
  muniCacheTag,
  parseRevalidateBody,
  tokenMatches,
} from '@/lib/socideas-revalidate'

export const dynamic = 'force-dynamic'

/**
 * POST /api/socideas/revalidate — invalidación selectiva de la caché municipal.
 *
 * Protegido con `SOCIDEAS_REVALIDATE_TOKEN` (cabecera `x-revalidate-token`,
 * comparación en tiempo constante). Sin secreto configurado → 503; secreto
 * ausente/incorrecto → 401; método distinto de POST → 405.
 *
 * Body: `{ "ines": ["02003", ...] }` — solo INE-5 estrictos, máximo
 * REVALIDATE_MAX_INES por petición. Inválidos se descartan y se contabilizan;
 * payload estructuralmente inválido → 400.
 *
 * Invoca `revalidateTag('socideas-muni-<ine>', { expire: 0 })` por cada INE
 * válido. NUNCA hace revalidación global. Los logs no incluyen el secreto.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.SOCIDEAS_REVALIDATE_TOKEN || process.env.SOCIDEAS_SYNC_TOKEN
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

  const { validos, solicitados, descartados } = parsed.validation
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
