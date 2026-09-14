import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
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

type ExportStage =
  | 'validate_code'
  | 'create_supabase_client'
  | 'resolve_municipality'
  | 'load_base_data'
  | 'load_demographic_summary'
  | 'load_ine_layers'
  | 'build_project_sheet'
  | 'build_demographic_sheet'
  | 'build_political_sheet'
  | 'build_economic_sheet'
  | 'build_sociocultural_sheet'
  | 'build_heritage_sheet'
  | 'build_infrastructure_sheet'
  | 'build_associations_sheet'
  | 'build_criteria_sheet'
  | 'serialize_xlsx'
  | 'build_http_response'

function logStage(
  requestId: string,
  stage: ExportStage,
  ineCode: string,
  extra?: Record<string, unknown>,
): void {
  console.log(JSON.stringify({
    tag: 'SOCIDEAS_XLSX_EXPORT',
    requestId,
    stage,
    ineCode,
    ts: new Date().toISOString(),
    ...extra,
  }))
}

function logError(
  requestId: string,
  stage: ExportStage,
  ineCode: string,
  err: unknown,
): { name: string; message: string } {
  const errObj = err instanceof Error ? err : new Error(String(err))
  const safeName = errObj.name || 'UnknownError'
  // Sanitizar mensaje: eliminar rutas, tokens, URLs internas
  const raw = errObj.message || 'unknown'
  const safe = raw
    .replace(/[A-Za-z]:\\[^\s]*/g, '[path]')
    .replace(/\/[^\s]*/g, '[path]')
    .replace(/Bearer\s+\S+/g, 'Bearer [redacted]')
    .replace(/[a-f0-9]{20,}/gi, '[hash]')
    .slice(0, 200)

  console.error(JSON.stringify({
    tag: 'SOCIDEAS_XLSX_EXPORT',
    level: 'error',
    requestId,
    stage,
    ineCode,
    errorName: safeName,
    errorMessage: safe,
    ts: new Date().toISOString(),
  }))

  return { name: safeName, message: safe }
}

/**
 * GET /api/socideas/exportar/[codigoINE]: UN SOLO libro XLSX por municipio
 * con nueve hojas en orden contractual (libro municipal comparativo).
 *
 * Instrumentación: cada request lleva un requestId visible en el error
 * y registrado en server logs para diagnóstico.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const requestId = randomUUID().slice(0, 8).toUpperCase()
  let stage: ExportStage = 'validate_code'
  let ineCode = ''

  try {
    // 1. Validar código INE
    const { codigoINE } = await params
    ineCode = codigoINE
    console.log('[SOCIDEAS_XLSX_EXPORT_START]', { ineCode, requestId })
    if (!/^\d{5}$/.test(codigoINE)) {
      return NextResponse.json(
        { error: 'Código INE inválido (se esperan 5 dígitos)', requestId, ref: `XLSX-${requestId}` },
        { status: 400 },
      )
    }
    logStage(requestId, 'validate_code', ineCode, { ok: true })

    // 2. Supabase
    stage = 'create_supabase_client'
    const supabase = createSupabaseServerSafe()
    if (!supabase) {
      logStage(requestId, stage, ineCode, { ok: false, reason: 'env_missing' })
      return NextResponse.json(
        { error: 'La exportación no está disponible temporalmente.', requestId, ref: `XLSX-${requestId}` },
        { status: 503 },
      )
    }
    logStage(requestId, stage, ineCode, { ok: true })
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'create_supabase_client', ok: true })

    // 3. Datos base + capas laterales
    stage = 'load_base_data'
    logStage(requestId, stage, ineCode, { parallel: true })
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'load_base_data', parallel: true })
    const [demo, eco, demoExtra, ineLayers] = await Promise.all([
      getPerfilDemografico(supabase, codigoINE, {}),
      getPerfilEconomico(supabase, codigoINE),
      readDemographicPresentation(codigoINE).catch((e) => {
        console.warn('[SOCIDEAS_XLSX_EXPORT_LAYER_SKIP]', { ineCode, requestId, layer: 'demographic_summary', errorName: e?.name, errorMessageSafe: String(e?.message).slice(0, 200) })
        logStage(requestId, 'load_demographic_summary', ineCode, { ok: false, error: String(e) })
        return null
      }),
      readMunicipalIneLayers(codigoINE).catch((e) => {
        console.warn('[SOCIDEAS_XLSX_EXPORT_LAYER_SKIP]', { ineCode, requestId, layer: 'ine_layers', errorName: e?.name, errorMessageSafe: String(e?.message).slice(0, 200) })
        logStage(requestId, 'load_ine_layers', ineCode, { ok: false, error: String(e) })
        return null
      }),
    ])
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', {
      ineCode, requestId, stage: 'load_base_data_done',
      demoStatus: demo.status, ecoStatus: eco.status,
      hasDemographicPresentation: demoExtra !== null,
      hasIneLayers: ineLayers !== null,
    })

    // 4. Validar que el municipio existe
    stage = 'resolve_municipality'
    const ok =
      demo.status === 'ok' || demo.status === 'empty' || eco.status === 'ok' || eco.status === 'empty'
    if (!ok) {
      logStage(requestId, stage, ineCode, { ok: false, demoStatus: demo.status, ecoStatus: eco.status })
      return NextResponse.json(
        { error: `No se encontró el municipio ${codigoINE}.`, requestId, ref: `XLSX-${requestId}` },
        { status: 404 },
      )
    }

    const perfilDemo = demo.status === 'ok' || demo.status === 'empty' ? demo.perfil : null
    const perfilEco = eco.status === 'ok' || eco.status === 'empty' ? eco.perfil : null
    if (!perfilDemo && !perfilEco) {
      logStage(requestId, stage, ineCode, { ok: false, reason: 'no_perfil' })
      return NextResponse.json(
        { error: `No se encontró el municipio ${codigoINE}.`, requestId, ref: `XLSX-${requestId}` },
        { status: 404 },
      )
    }
    logStage(requestId, stage, ineCode, {
      ok: true,
      demoStatus: demo.status,
      ecoStatus: eco.status,
      hasDemographicPresentation: demoExtra !== null,
      hasIneLayers: ineLayers !== null,
    })
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', {
      ineCode, requestId, stage: 'resolve_municipality', ok: true,
      demoStatus: demo.status, ecoStatus: eco.status,
    })

    // 5. Construir tablas (con aislamiento por bloque)
    stage = 'build_demographic_sheet'
    const municipio = perfilDemo?.municipio.nombre ?? perfilEco?.municipio.nombre ?? codigoINE
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'build_demographic_sheet', start: true })
    let demografia: Awaited<ReturnType<typeof buildDemografiaTables>> = []
    try {
      demografia = [
        ...(perfilDemo ? buildDemografiaTables(perfilDemo) : []),
        ...buildDemographicDimensionTables(demoExtra),
      ]
    } catch (e) {
      logError(requestId, stage, ineCode, e)
    }
    logStage(requestId, stage, ineCode, { blocks: demografia.length })
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'build_demographic_sheet', blocks: demografia.length })

    stage = 'build_economic_sheet'
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'build_economic_sheet', start: true })
    let economia: Awaited<ReturnType<typeof buildEconomiaTables>> = []
    try {
      economia = perfilEco ? buildEconomiaTables(perfilEco) : []
    } catch (e) {
      logError(requestId, stage, ineCode, e)
    }
    logStage(requestId, stage, ineCode, { blocks: economia.length })
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'build_economic_sheet', blocks: economia.length })

    if (demografia.length === 0 && economia.length === 0) {
      return NextResponse.json(
        { error: 'Este municipio aún no tiene tablas con datos reales para exportar.', requestId, ref: `XLSX-${requestId}` },
        { status: 404 },
      )
    }

    // 6. Generar XLSX
    stage = 'serialize_xlsx'
    const hojas: ComparativeSheetInput[] = [
      { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil demográfico', bloques: demografia },
      { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Contexto económico', bloques: economia },
    ]

    logStage(requestId, stage, ineCode, {
      totalBlocks: demografia.length + economia.length,
      hasIneLayers: ineLayers !== null,
    })
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', {
      ineCode, requestId, stage: 'serialize_xlsx',
      totalBlocks: demografia.length + economia.length,
      hasIneLayers: ineLayers !== null,
    })

    const buffer = await buildMunicipioWorkbook({
      municipio,
      codigoINE,
      provincia: perfilDemo?.municipio.provincia ?? perfilEco?.municipio.provincia ?? 'No disponible',
      comunidadAutonoma: perfilDemo?.municipio.comunidad_autonoma ?? perfilEco?.municipio.comunidad_autonoma ?? 'No disponible',
      fechaGeneracion: new Date().toISOString().slice(0, 10),
      hojas,
      ineLayers,
    })

    // Validar que el buffer no esté vacío o sea sospechosamente pequeño
    if (buffer.length < 1000) {
      logStage(requestId, stage, ineCode, { ok: false, reason: 'buffer_too_small', size: buffer.length })
      console.error('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'serialize_xlsx', ok: false, reason: 'buffer_too_small', size: buffer.length })
      return NextResponse.json(
        { error: 'El archivo generado está vacío o incompleto.', requestId, ref: `XLSX-${requestId}` },
        { status: 500 },
      )
    }
    console.log('[SOCIDEAS_XLSX_EXPORT_STAGE]', { ineCode, requestId, stage: 'serialize_xlsx_done', bufferSize: buffer.length })

    // 7. Respuesta
    stage = 'build_http_response'
    const filename = `SOCideas_${normalizarMunicipio(municipio)}_${codigoINE}_libro.xlsx`
    const body = new Uint8Array(buffer)

    logStage(requestId, stage, ineCode, {
      ok: true,
      filename,
      size: body.byteLength,
    })

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Socideas-Brand': XLSX_BRAND,
        'X-Socideas-Request-Id': requestId,
      },
    })
  } catch (err) {
    console.error('[SOCIDEAS_XLSX_EXPORT_ERROR]', {
      ineCode, requestId, stage,
      errorName: err instanceof Error ? err.name : 'Unknown',
      errorMessageSafe: String(err instanceof Error ? err.message : err).slice(0, 300),
    })
    logError(requestId, stage, ineCode, err)
    return NextResponse.json(
      {
        error: 'No se pudo generar el archivo en este momento.',
        requestId,
        ref: `XLSX-${requestId}`,
      },
      { status: 500 },
    )
  }
}
