// Batch 1 dry-run – no escribe en R2 ni Supabase (sync con dryRun:true)
// Uso: npx tsx scripts/sync-economia-batch-dry-run.ts
// Municipios muestra: 28079 Madrid (capital grande), 02069 La Roda (medio), pequeño <1.000 hab. (ej. 02029 Casas de Ves)
// Requiere .env.local con SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SOCIDEAS_R2_BASE (solo lectura)

import { createClient } from '@supabase/supabase-js'
import { syncMunicipioEconomia } from '../src/lib/socideas-sync-economia'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase: ReturnType<typeof createClient> | null = null
if (SUPABASE_URL && SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
} else {
  console.warn('Dry-run sin credenciales Supabase: se simula sin tocar DB (run_id=dry-run)')
  supabase = null as unknown as ReturnType<typeof createClient>
}

const MUESTRA = [
  { codigo: '28079', nombre: 'Madrid (capital grande)' },
  { codigo: '02069', nombre: 'La Roda (medio 15k)' },
  { codigo: '02029', nombre: 'Casas de Ves (<1.000 hab.)' },
]

async function main() {
  const dryRun = process.argv.includes('--dry-run') || true // por defecto dry-run
  console.log(`Batch 1 dry-run=${dryRun} – R2: no escribe, Supabase: solo lectura + registro dry-run`)
  for (const m of MUESTRA) {
    console.log(`\n=== ${m.codigo} ${m.nombre} ===`)
    try {
      const sum: unknown = await syncMunicipioEconomia(supabase as never, m.codigo, { dryRun, conDirce: true })
      const s = sum as typeof sum & { _muestra?: { slug: string; anio: number; valor: number | null }[]; pendientes: string[]; estado: string; registros_leidos: number; registros_actualizados: number; anios: number[]; bytesAntes: number; bytesDespues: number; r2_key: string | null }
      console.log(`  estado=${s.estado} leidos=${s.registros_leidos} actualizados=${s.registros_actualizados}`)
      console.log(`  anios=${s.anios.join(',')} bytes ${s.bytesAntes}→${s.bytesDespues} r2_key=${s.r2_key ?? 'dry-run sin escritura'}`)
      if (s._muestra) {
        for (const v of s._muestra) {
          console.log(`    - ${v.slug} ${v.anio}: ${v.valor} ${v.unidad ?? ''}`)
        }
      }
      const pend = s.pendientes.length ? s.pendientes.join(' | ') : '(sin pendientes)'
      const sinCob = s.pendientes.filter((p: string) => p.startsWith('sin_cobertura')).join(' | ') || '0'
      console.log(`  pendientes: ${pend || '(ninguno)'}`)
      console.log(`  sin_cobertura: ${sinCob}`)
    } catch (e) {
      console.error(`  ERROR ${m.codigo}:`, (e as Error).message)
    }
  }
  console.log('\nDry-run completado. No se escribió en R2 (r2_key null) ni se modificó Supabase salvo registro dry-run.')
}

main()
