// Verificación de enlaces web de los GAL (SOCideas · tabla `grupos_accion_local`).
//
// Uso:
//   npx tsx scripts/verify-gal-links.ts                # DRY-RUN (no escribe)
//   npx tsx scripts/verify-gal-links.ts --write        # escritura real
//   npx tsx scripts/verify-gal-links.ts --only=RRN-123 # solo un GAL
//
// Reglas:
//   · NUNCA se marca automáticamente como falso un sitio que bloquea bots.
//   · Si la sonda HTTP falla por timeout o error de red, el estado queda 'pendiente'.
//   · Solo se marca 'verificado' si la sonda HTTP devuelve 200-299.
//   · Si la sonda devuelve 404 o 410, se marca 'no_verificado'.
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 30_000

interface GalRow {
  codigo_gal: string
  nombre: string
  web_oficial: string | null
  url_fuente: string | null
  url_declarada: string | null
  url_oficial_verificada: string | null
  fecha_verificacion: string | null
  estado_enlace: string | null
}

interface VerifyResult {
  codigo_gal: string
  nombre: string
  url: string | null
  estado: 'verificado' | 'pendiente' | 'no_verificado'
  http_status: number | null
  detalle: string
}

async function sondearUrl(url: string): Promise<{ status: number | null; ok: boolean; detalle: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    return { status: res.status, ok: res.ok, detalle: `HTTP ${res.status}` }
  } catch {
    return { status: null, ok: false, detalle: 'ERROR de red o timeout' }
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
  const onlyArg = args.find((a) => a.startsWith('--only='))
  const only = onlyArg === undefined ? null : onlyArg.slice('--only='.length)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(`=== VERIFICACIÓN DE ENLACES GAL · ${write ? 'WRITE' : 'DRY-RUN'} ===`)

  let query = sb
    .from('grupos_accion_local')
    .select('codigo_gal, nombre, web_oficial, url_fuente, url_declarada, url_oficial_verificada, fecha_verificacion, estado_enlace')
    .not('web_oficial', 'is', null)
    .order('codigo_gal')
  if (only !== null) {
    query = query.eq('codigo_gal', only)
  }

  const { data, error } = await query
  if (error) {
    console.error(`Error al leer GAL: ${error.message}`)
    process.exit(1)
  }

  const rows = (data ?? []) as unknown as GalRow[]
  console.log(`GAL con web oficial: ${rows.length}`)

  const resultados: VerifyResult[] = []
  let writtenUpTo = 0
  let actualizados = 0
  for (const row of rows) {
    const url = row.web_oficial
    if (!url) {
      resultados.push({
        codigo_gal: row.codigo_gal,
        nombre: row.nombre,
        url: null,
        estado: 'pendiente',
        http_status: null,
        detalle: 'sin URL que verificar',
      })
      continue
    }

    const sonda = await sondearUrl(url)
    const estado = estadoDeSonda(sonda.status, sonda.ok)

    resultados.push({
      codigo_gal: row.codigo_gal,
      nombre: row.nombre,
      url,
      estado,
      http_status: sonda.status,
      detalle: sonda.detalle,
    })

    console.log(
      `  ${row.codigo_gal.padEnd(12)} ${row.nombre.slice(0, 40).padEnd(42)} ${estado.padEnd(14)} ${sonda.status ?? '—'}`,
    )

    if (write && resultados.length % 20 === 0) {
      const batch = resultados.slice(writtenUpTo)
      for (const r of batch) {
        const { error } = await sb
          .from('grupos_accion_local')
          .update({
            url_oficial_verificada: r.estado === 'verificado' ? r.url : null,
            fecha_verificacion: new Date().toISOString(),
            estado_enlace: r.estado,
          })
          .eq('codigo_gal', r.codigo_gal)
        if (!error) actualizados++
      }
      writtenUpTo = resultados.length
    }
  }

  // Resumen
  const conteos = resultados.reduce<Record<string, number>>((acc, r) => {
    acc[r.estado] = (acc[r.estado] ?? 0) + 1
    return acc
  }, {})

  console.log('\n=== RESUMEN ===')
  console.log(`  verificados:    ${conteos['verificado'] ?? 0}`)
  console.log(`  pendientes:     ${conteos['pendiente'] ?? 0}`)
  console.log(`  no_verificados: ${conteos['no_verificado'] ?? 0}`)

  if (write) {
    console.log('\n--- Actualizando tabla ---')
    const remaining = resultados.slice(writtenUpTo)
    for (const r of remaining) {
      const { error } = await sb
        .from('grupos_accion_local')
        .update({
          url_oficial_verificada: r.estado === 'verificado' ? r.url : null,
          fecha_verificacion: new Date().toISOString(),
          estado_enlace: r.estado,
        })
        .eq('codigo_gal', r.codigo_gal)
      if (error) {
        console.error(`  ERROR ${r.codigo_gal}: ${error.message}`)
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
