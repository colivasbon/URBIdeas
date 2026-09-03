import { NextRequest, NextResponse } from 'next/server'
import type { DictamenResultado } from '@/lib/dictamen'
import { dictamenAHtml, slug, codigoGeneracion } from '@/lib/salida'

/**
 * POST /api/dictamen/word — Word de servidor (.doc HTML), mismo contenido que la pantalla.
 * Body: { nombre, perfilLabel, dictamen, fecha }
 */
export async function POST(request: NextRequest) {
  let body: { nombre: string; perfilLabel: string; dictamen: DictamenResultado; fecha: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }
  const { nombre, perfilLabel, dictamen: d, fecha } = body
  if (!d) return NextResponse.json({ error: 'dictamen requerido' }, { status: 400 })
  const codigo = codigoGeneracion({ nombre, d }, fecha || new Date().toISOString())
  const html = dictamenAHtml(nombre || 'Ámbito sin nombre', perfilLabel || '', d, fecha || '', codigo)
  return new NextResponse(`\uFEFF${html}`, {
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename="dictamen_${slug(nombre || 'ambito')}.doc"`,
    },
  })
}
