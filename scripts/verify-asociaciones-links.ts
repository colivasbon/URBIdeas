// Verificación de enlaces individuales de asociaciones (SOCideas · tabla `asociaciones`).
//
// Uso:
//   npx tsx scripts/verify-asociaciones-links.ts                # DRY-RUN (no escribe)
//   npx tsx scripts/verify-asociaciones-links.ts --write        # escritura real
//   npx tsx scripts/verify-asociaciones-links.ts --limit=100    # limitar a N registros
//
// Reglas:
//   · NUNCA se inventan enlaces. Si no hay URL, el estado queda 'pendiente'.
//   · Si la sonda HTTP falla por timeout o error de red, el estado queda 'pendiente'.
//   · Solo se marca 'verificado' si la sonda HTTP devuelve 200-299.
//   · Si la sonda devuelve 404 o 410, se marca 'no_verificado'.
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 30_000

interface AsocRow {
  id: string
  nombre: string
  fuente_url: string | null
  web_verificada: string | null
  social_verificada: string | null
  tipo_enlace: string | null
  fecha_verificacion: string | null
  enlace_estado: string | null
}

interface VerifyResult {
  id: number
  nombre: string
  web_url: string | null
  social_url: string | null
  web_estado: 'verificado' | 'pendiente' | 'no_verificado'
  social_estado: 'verificado' | 'pendiente' | 'no_verificado'
  web_http_status: number | null
  social_http_status: number | null
}

async function sondearUrl(url: string): Promise<{ status: number | null; ok: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    return { status: res.status, ok: res.ok }
  } catch {
    return { status: null, ok: false }
  }
}

function estadoDeSonda(status: number | null, ok: boolean): 'verificado' | 'pendiente' | 'no_verificado' {
  if (status === null) return 'pendiente'
  if (status === 404 || status === 410) return 'no_verificado'
  if (ok) return 'verificado'
  return 'pendiente'
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const limit = limitArg === undefined ? null : Number(limitArg.slice('--limit='.length))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(`=== VERIFICACIÓN DE ENLACES DE ASOCIACIONES · ${write ? 'WRITE' : 'DRY-RUN'} ===`)

  let query = sb
    .from('asociaciones')
    .select('id, nombre, fuente_url, web_verificada, social_verificada, tipo_enlace, fecha_verificacion, enlace_estado')
    .not('fuente_url', 'is', null)
    .order('id')
  if (limit !== null && Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  if (error) {
    console.error(`Error al leer asociaciones: ${error.message}`)
    process.exit(1)
  }

  const rows = (data ?? []) as unknown as AsocRow[]
  console.log(`Asociaciones con URL: ${rows.length}`)

  const resultados: VerifyResult[] = []
  for (const row of rows) {
    const webUrl = row.web_verificada
    const socialUrl = row.social_verificada

    if (!webUrl && !socialUrl) {
      resultados.push({
        id: row.id,
        nombre: row.nombre,
        web_url: null,
        social_url: null,
        web_estado: 'pendiente',
        social_estado: 'pendiente',
        web_http_status: null,
        social_http_status: null,
      })
      continue
    }

    const webSonda = webUrl ? await sondearUrl(webUrl) : null
    const socialSonda = socialUrl ? await sondearUrl(socialUrl) : null

    const webEstado = webSonda ? estadoDeSonda(webSonda.status, webSonda.ok) : 'pendiente'
    const socialEstado = socialSonda ? estadoDeSonda(socialSonda.status, socialSonda.ok) : 'pendiente'

    resultados.push({
      id: row.id,
      nombre: row.nombre,
      web_url: webUrl,
      social_url: socialUrl,
      web_estado: webEstado,
      social_estado: socialEstado,
      web_http_status: webSonda?.status ?? null,
      social_http_status: socialSonda?.status ?? null,
    })

    console.log(
      `  #${row.id} ${row.nombre.slice(0, 40).padEnd(42)} web=${webEstado.padEnd(14)} social=${socialEstado.padEnd(14)}`,
    )
  }

  // Resumen
  const conteos = resultados.reduce<Record<string, number>>((acc, r) => {
    acc[`web_${r.web_estado}`] = (acc[`web_${r.web_estado}`] ?? 0) + 1
    acc[`social_${r.social_estado}`] = (acc[`social_${r.social_estado}`] ?? 0) + 1
    return acc
  }, {})

  console.log('\n=== RESUMEN ===')
  console.log(`  web verificados:    ${conteos['web_verificado'] ?? 0}`)
  console.log(`  web pendientes:     ${conteos['web_pendiente'] ?? 0}`)
  console.log(`  web no_verificados: ${conteos['web_no_verificado'] ?? 0}`)
  console.log(`  social verificados:    ${conteos['social_verificado'] ?? 0}`)
  console.log(`  social pendientes:     ${conteos['social_pendiente'] ?? 0}`)
  console.log(`  social no_verificados: ${conteos['social_no_verificado'] ?? 0}`)

  if (write) {
    console.log('\n--- Actualizando tabla ---')
    let actualizados = 0
    for (const r of resultados) {
      const tipoEnlace = r.web_estado === 'verificado' ? 'web' : 'ninguno'

      const { error } = await sb
        .from('asociaciones')
        .update({
          web_verificada: r.web_estado === 'verificado' ? r.web_url : null,
          tipo_enlace: tipoEnlace,
          fecha_verificacion: new Date().toISOString(),
          enlace_estado: r.web_estado === 'verificado' ? 'verificado' : r.web_estado,
        })
        .eq('id', r.id)
      if (error) {
        console.error(`  ERROR #${r.id}: ${error.message}`)
      } else {
        actualizados++
      }
    }
    console.log(`  Actualizados: ${actualizados}/${resultados.length}`)
  } else {
    console.log('\nDRY-RUN: no se ha escrito nada. Repite con --write para actualizar.')
  }
}

void main()
