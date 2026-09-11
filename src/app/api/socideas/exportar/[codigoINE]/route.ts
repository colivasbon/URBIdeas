import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getPerfilDemografico } from '@/lib/socideas-perfil'
import { getPerfilEconomico } from '@/lib/socideas-economia'
import { readDemographicPresentation } from '@/lib/socideas-demographic-summary'
import { readMunicipalIneLayers } from '@/lib/socideas-ine-layers'
import { buildDemographicDimensionTables } from '@/lib/socideas-demographic-export'
import {
  buildDemografiaTables,
  buildEconomiaTables,
  normalizarMunicipio,
} from '@/lib/socideas-export'
import {
  XLSX_BRAND,
  buildMunicipioWorkbook,
  type ComparativeSheetInput,
} from '@/lib/socideas-xlsx'

export const dynamic = 'force-dynamic'

/**
 * GET /api/socideas/exportar/[codigoINE]: UN SOLO libro XLSX por municipio
 * con nueve hojas en orden contractual (libro municipal comparativo).
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
    const [demo, eco, demoExtra, ineLayers] = await Promise.all([
      getPerfilDemografico(supabase, codigoINE, {}),
      getPerfilEconomico(supabase, codigoINE),
      readDemographicPresentation(codigoINE).catch(() => null),
      readMunicipalIneLayers(codigoINE).catch(() => null),
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
    const demografia = [
      ...(perfilDemo ? buildDemografiaTables(perfilDemo) : []),
      ...buildDemographicDimensionTables(demoExtra),
    ]
    const economia = perfilEco ? buildEconomiaTables(perfilEco) : []
    if (demografia.length === 0 && economia.length === 0) {
      return NextResponse.json({ data: null, error: 'Este municipio aún no tiene tablas con datos reales para exportar.' }, { status: 404 })
    }

    const hojas: ComparativeSheetInput[] = [
      {
        id: '01_PERFIL_DEMOGRÁFICO',
        titulo: 'Perfil demográfico',
        bloques: demografia,
      },
      {
        id: '03_CONTEXTO_ECONÓMICO',
        titulo: 'Contexto económico',
        bloques: economia,
      },
    ]

    const buffer = await buildMunicipioWorkbook({
      municipio,
      codigoINE,
      provincia: perfilDemo?.municipio.provincia ?? perfilEco?.municipio.provincia ?? 'No disponible',
      comunidadAutonoma: perfilDemo?.municipio.comunidad_autonoma ?? perfilEco?.municipio.comunidad_autonoma ?? 'No disponible',
      fechaGeneracion: new Date().toISOString().slice(0, 10),
      hojas,
      ineLayers,
    })
    const filename = `SOCideas_${normalizarMunicipio(municipio)}_${codigoINE}_libro.xlsx`
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
