// Carga masiva SOCideas Fase 2A.2 — sincronización demográfica de TODA España.
//
// Uso:
//   npx tsx scripts/sync-all-municipios.ts --go [--provincias 01,02] [--limit 50]
//     [--pause-ms 2000] [--force] [--stale-days 30]
//
// Sin --go hace dry-run (lista cuántos faltan, no escribe). Reanudable: salta
// municipios con ejecución ok/partial más reciente que --stale-days (defecto
// 30) salvo --force. Pre-calienta el catálogo de series por provincia (una
// descarga por provincia en vez de una por municipio). Secuencial con pausa
// para respetar al INE. Progreso por consola + data_sync_runs.
//
// Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// y R2_* (la escritura va a R2, no a la tabla de valores).
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const PAUSE_MS = 2000

interface Args {
  go: boolean
  provincia?: string
  provincias?: string[]
  limit?: number
  pauseMs: number
  force: boolean
  staleDays: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const csv = get('--provincias')
  const stale = get('--stale-days')
  return {
    go: argv.includes('--go'),
    provincia: get('--provincia'),
    provincias: csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    limit: get('--limit') !== undefined ? parseInt(get('--limit') as string, 10) : undefined,
    pauseMs: get('--pause-ms') !== undefined ? parseInt(get('--pause-ms') as string, 10) : PAUSE_MS,
    force: argv.includes('--force'),
    staleDays: stale !== undefined ? parseInt(stale, 10) : 30,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const args = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('ERROR: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  if (args.provincia && !/^\d{2}$/.test(args.provincia)) {
    console.error('ERROR: --provincia debe ser el código INE de 2 dígitos (p. ej. 02)')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  // Municipios objetivo (solo tabla base existente, sin duplicar territorio).
  // Paginado con range: PostgREST limita a 1000 filas por defecto.
  interface MunRow { codigo_ine: string; nombre: string }
  const lista: MunRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias!inner(codigo_ine)')
      .order('codigo_ine')
      .range(from, from + PAGE - 1)
    if (args.provincia) {
      const { data: prov } = await supabase
        .from('provincias')
        .select('id')
        .eq('codigo_ine', args.provincia)
        .single()
      const provId = (prov as unknown as { id: string } | null)?.id
      if (!provId) {
        console.error(`ERROR: provincia ${args.provincia} no existe`)
        process.exit(1)
      }
      query = query.eq('provincia_id', provId)
    }
    if (args.provincias && args.provincias.length > 0) {
      const { data: provs } = await supabase
        .from('provincias')
        .select('id')
        .in('codigo_ine', args.provincias)
      const ids = ((provs ?? []) as unknown as { id: string }[]).map((p) => p.id)
      if (ids.length === 0) {
        console.error('ERROR: ninguna provincia coincide')
        process.exit(1)
      }
      query = query.in('provincia_id', ids)
    }
    if (args.limit) query = query.limit(args.limit)
    const { data, error } = await query
    if (error) throw error
    const page = ((data ?? []) as unknown as MunRow[])
    lista.push(...page)
    if (page.length < PAGE || args.limit) break
  }

  // Estado previo para reanudar: solo los 'ok' recientes se saltan; los
  // 'partial'/'error' se reintentan siempre.
  const { data: runs } = await supabase
    .from('data_sync_runs')
    .select('municipio_codigo_ine, estado, fin')
    .eq('tipo_sincronizacion', 'ine_demografico')
    .eq('estado', 'ok')
    .order('fin', { ascending: false })
  const frescos = new Set<string>()
  const ttlMs = args.staleDays * 86400_000
  // Solo los 'ok' recientes se saltan: los 'partial'/'error' se reintentan
  // siempre (pueden haber fallado por timeouts transitorios).
  for (const r of ((runs ?? []) as unknown as { municipio_codigo_ine: string; fin: string }[])) {
    if (frescos.has(r.municipio_codigo_ine)) continue
    if (Date.now() - new Date(r.fin).getTime() < ttlMs) frescos.add(r.municipio_codigo_ine)
  }
  const pendientes = args.force ? lista : lista.filter((m) => !frescos.has(m.codigo_ine))

  console.log(
    `Municipios: ${lista.length} | ya sincronizados (recientes): ${lista.length - pendientes.length} | pendientes: ${pendientes.length}`,
  )
  if (!args.go) {
    console.log('DRY-RUN: sin --go no se escribe nada.')
    return
  }

  // Import dinámico: el token solo lo usa la ruta HTTP, aquí va service_role.
  const { syncMunicipioDemografico } = await import('../src/lib/socideas-sync')
  const { DPOP_PROVINCE_TABLES, warmProvinceCatalog } = await import('../src/lib/ine-tempus')
  // Pre-calentado: una descarga del catálogo por provincia (no una por municipio).
  {
    // Solo las provincias del ámbito (no las 50): evita descargas inútiles.
    let codes: string[]
    if (args.provincia) codes = [args.provincia]
    else if (args.provincias && args.provincias.length > 0) codes = args.provincias
    else {
      const { data: provs } = await supabase.from('provincias').select('codigo_ine')
      codes = ((provs ?? []) as unknown as { codigo_ine: string }[]).map((p) => p.codigo_ine)
    }
    for (const code of codes) {
      const tableId = DPOP_PROVINCE_TABLES[code]
      if (!tableId) continue
      try {
        await warmProvinceCatalog(tableId)
        console.log(`Catálogo ${code} (tabla ${tableId}) en caché`)
      } catch (err) {
        console.log(`Catálogo ${code}: reintento por municipio (${err instanceof Error ? err.message : err})`)
      }
    }
  }
  let ok = 0
  let partial = 0
  let fallos = 0
  const t0 = Date.now()
  for (let i = 0; i < pendientes.length; i++) {
    const m = pendientes[i]
    try {
      const s = await syncMunicipioDemografico(supabase, m.codigo_ine)
      if (s.estado === 'ok') ok++
      else {
        partial++
      }
      console.log(
        `[${i + 1}/${pendientes.length}] ${m.codigo_ine} ${m.nombre}: ${s.estado} (${s.registros_actualizados} reg, años ${s.anios[0] ?? '?'}–${s.anios[s.anios.length - 1] ?? '?'})`,
      )
    } catch (err) {
      fallos++
      console.log(`[${i + 1}/${pendientes.length}] ${m.codigo_ine} ${m.nombre}: ERROR ${err instanceof Error ? err.message : err}`)
    }
    if (i < pendientes.length - 1) await sleep(args.pauseMs)
  }
  const min = Math.round((Date.now() - t0) / 60000)
  console.log(`FIN: ok=${ok} partial=${partial} fallos=${fallos} en ${min} min`)
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err)
  process.exit(1)
})
