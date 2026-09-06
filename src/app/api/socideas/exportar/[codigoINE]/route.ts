import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getPerfilDemografico } from '@/lib/socideas-perfil'
import { getPerfilEconomico } from '@/lib/socideas-economia'
import {
  buildDemografiaTables,
  buildEconomiaTables,
  demografiaExcluidas,
  economiaExcluidas,
  normalizarMunicipio,
  seccionesExcluidas,
} from '@/lib/socideas-export'
import { XLSX_BRAND, buildMunicipioWorkbook } from '@/lib/socideas-xlsx'

export const dynamic = 'force-dynamic'

/**
 * GET /api/socideas/exportar/[codigoINE]: UN SOLO libro XLSX por municipio
 * (00_Resumen + 01_Demografía + 02_Economía; 03_Secciones solo con datos reales).
 * Datos públicos ya presentes en la ficha; generación idempotente en memoria.
 * Sin escrituras R2/Supabase, sin secretos, sin tokens. No modifica caché ni APIs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  if (!/^\d{5}$/.test(codigoINE)) {
    return NextResponse.json({ data: null, error: 'Código INE inválido (se esperan 5 dígitos)' }, { status: 400 })
  }
  try {
    const supabase = createSupabaseServer()
    const [demo, eco] = await Promise.all([
      getPerfilDemografico(supabase, codigoINE, {}),
      getPerfilEconomico(supabase, codigoINE),
    ])
    if ((demo.status === 'notFound' || demo.status === 'badRequest') && eco.status !== 'ok' && eco.status !== 'empty') {
      return NextResponse.json({ data: null, error: `No se encontró el municipio ${codigoINE}.` }, { status: 404 })
    }
    const perfilDemo = demo.status === 'ok' || demo.status === 'empty' ? demo.perfil : null
    const perfilEco = eco.status === 'ok' || eco.status === 'empty' ? eco.perfil : null
    if (!perfilDemo && !perfilEco) {
      return NextResponse.json({ data: null, error: `No se encontró el municipio ${codigoINE}.` }, { status: 404 })
    }
    const municipio = perfilDemo?.municipio.nombre ?? perfilEco?.municipio.nombre ?? codigoINE
    const demografia = perfilDemo ? buildDemografiaTables(perfilDemo) : []
    const economia = perfilEco ? buildEconomiaTables(perfilEco) : []
    if (demografia.length === 0 && economia.length === 0) {
      return NextResponse.json({ data: null, error: 'Este municipio aún no tiene tablas con datos reales para exportar.' }, { status: 404 })
    }
    const buffer = await buildMunicipioWorkbook({
      municipio,
      codigoINE,
      fechaGeneracion: new Date().toISOString().slice(0, 10),
      demografia,
      economia,
      excluidasDemografia: demografiaExcluidas(),
      excluidasEconomia: economiaExcluidas(economia.some((t) => t.id === 'renta')),
      excluidasSecciones: seccionesExcluidas(),
    })
    const filename = `SOCideas_${normalizarMunicipio(municipio)}_${codigoINE}_tablas.xlsx`
    const body = new Uint8Array(buffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Socideas-Brand': XLSX_BRAND,
      },
    })
  } catch {
    return NextResponse.json({ data: null, error: 'No se pudo generar el libro XLSX.' }, { status: 500 })
  }
}
