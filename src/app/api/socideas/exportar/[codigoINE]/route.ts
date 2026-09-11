import { NextResponse } from 'next/server'
import { createSupabaseServerSafe } from '@/lib/supabase-server'
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
 *
 * Degradación segura:
 *  - Faltan env vars Supabase → 503 controlado
 *  - Municipio no encontrado → 404
 *  - Capas laterales ausentes (R2, INE layers) → XLSX se genera sin esas hojas
 *  - Error interno → 500 genérico, sin stack trace ni secretos
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  if (!/^\d{5}$/.test(codigoINE)) {
    return NextResponse.json(
      { error: 'Código INE inválido (se esperan 5 dígitos)' },
      { status: 400 },
    )
  }

  // 1. Supabase: configuración esencial. Sin ella no se puede leer el municipio.
  const supabase = createSupabaseServerSafe()
  if (!supabase) {
    return NextResponse.json(
      { error: 'La exportación no está disponible temporalmente.' },
      { status: 503 },
    )
  }

  try {
    // 2. Datos base (Supabase) + capas laterales (R2, opcionales).
    //    Las capas laterales FALLAN SILENCIOSAMENTE: el XLSX se genera sin ellas.
    const [demo, eco, demoExtra, ineLayers] = await Promise.all([
      getPerfilDemografico(supabase, codigoINE, {}),
      getPerfilEconomico(supabase, codigoINE),
      readDemographicPresentation(codigoINE).catch(() => null),
      readMunicipalIneLayers(codigoINE).catch(() => null),
    ])

    // 3. Validar que el municipio existe.
    const ok =
      demo.status === 'ok' || demo.status === 'empty' || eco.status === 'ok' || eco.status === 'empty'
    if (!ok) {
      return NextResponse.json(
        { error: `No se encontró el municipio ${codigoINE}.` },
        { status: 404 },
      )
    }

    const perfilDemo = demo.status === 'ok' || demo.status === 'empty' ? demo.perfil : null
    const perfilEco = eco.status === 'ok' || eco.status === 'empty' ? eco.perfil : null
    if (!perfilDemo && !perfilEco) {
      return NextResponse.json(
        { error: `No se encontró el municipio ${codigoINE}.` },
        { status: 404 },
      )
    }

    // 4. Construir tablas exportables.
    const municipio = perfilDemo?.municipio.nombre ?? perfilEco?.municipio.nombre ?? codigoINE
    const demografia = [
      ...(perfilDemo ? buildDemografiaTables(perfilDemo) : []),
      ...buildDemographicDimensionTables(demoExtra),
    ]
    const economia = perfilEco ? buildEconomiaTables(perfilEco) : []

    if (demografia.length === 0 && economia.length === 0) {
      return NextResponse.json(
        { error: 'Este municipio aún no tiene tablas con datos reales para exportar.' },
        { status: 404 },
      )
    }

    // 5. Generar XLSX.
    const hojas: ComparativeSheetInput[] = [
      { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil demográfico', bloques: demografia },
      { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Contexto económico', bloques: economia },
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

    // 6. Respuesta binaria XLSX.
    const filename = `SOCideas_${normalizarMunicipio(municipio)}_${codigoINE}_libro.xlsx`
    const body = new Uint8Array(buffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Socideas-Brand': XLSX_BRAND,
      },
    })
  } catch (err) {
    // 7. Error interno: registrar sin exponer detalles al cliente.
    console.error(`[socideas][exportar] Error generando XLSX para ${codigoINE}:`, err)
    return NextResponse.json(
      { error: 'No se pudo generar el archivo en este momento.' },
      { status: 500 },
    )
  }
}
