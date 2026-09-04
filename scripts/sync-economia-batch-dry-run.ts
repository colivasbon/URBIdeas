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
  const isMock = process.argv.includes('--mock')
  let dryRun = process.argv.includes('--dry-run') || true // por defecto dry-run
  if (isMock) dryRun = true
  // Mock solo con --mock, nunca con escritura
  if (isMock && process.argv.includes('--write')) {
    console.error('ERROR: --mock no puede combinarse con --write (intento de escritura). Exit 1')
    process.exit(1)
  }
  if (isMock) {
    console.log('*** MOCK MODE – valores marcados MOCK, dryRun forzado ***')
    const mocks: Record<string, string[]> = {
      '28079': ['MOCK renta_neta_media_persona 2023: 21450 euros', 'MOCK renta_neta_media_hogar 2023: 38520 euros', 'MOCK gini 2023: 32.8 puntos', 'MOCK p80_p20 2023: 6.2 ratio', 'MOCK paro_registrado 2026: 64231 personas', 'MOCK afiliacion_total 2026: 2145321 personas'],
      '02069': ['MOCK renta_neta_media_persona 2023: 11240 euros', 'MOCK renta_neta_media_hogar 2023: 26780 euros', 'MOCK gini 2023: 28.3 puntos', 'MOCK paro_registrado 2026: 1187 personas', 'MOCK afiliacion_total 2026: 5842 personas'],
      '02029': ['MOCK renta_neta_media_persona 2023: 10320 euros', 'MOCK renta_neta_media_hogar 2023: 24110 euros', 'MOCK gini 2023: 27.1 puntos', 'MOCK paro_registrado 2026: 42 personas', 'MOCK sin_cobertura: AEAT ≤1.000 hab.'],
    }
    for (const m of MUESTRA) {
      console.log(`\n=== ${m.codigo} ${m.nombre} ===`)
      console.log('  estado=MOCK leidos=9 actualizados=9')
      console.log('  anios=2023,2025,2026 bytes 0→657 r2_key=null')
      for (const v of mocks[m.codigo] ?? []) console.log(`    - ${v}`)
      console.log('  pendientes: (MOCK sin pendientes reales)')
    }
    console.log('\nMOCK completado. Exit 0 (dry-run). Si se intenta escribir con --mock, exit 1.')
    return
  }
  console.log(`Batch 1 dry-run=${dryRun} – R2: no escribe, Supabase: solo lectura + registro dry-run`)
  let hasRealError = false
  for (const m of MUESTRA) {
    console.log(`\n=== ${m.codigo} ${m.nombre} ===`)
    try {
      const sum: unknown = await syncMunicipioEconomia(supabase as never, m.codigo, { dryRun, conDirce: true })
      const s = sum as typeof sum & { _muestra?: { slug: string; anio: number; valor: number | null }[]; pendientes: string[]; estado: string; registros_leidos: number; registros_actualizados: number; anios: number[]; bytesAntes: number; bytesDespues: number; r2_key: string | null }
      console.log(`  estado=${s.estado} leidos=${s.registros_leidos} actualizados=${s.registros_actualizados}`)
      console.log(`  anios=${s.anios.join(',')} bytes ${s.bytesAntes}→${s.bytesDespues} r2_key=${s.r2_key ?? 'dry-run sin escritura'}`)
      if (s._muestra) {
        for (const v of s._muestra) {
          const prefix = isMock ? 'MOCK ' : ''
          console.log(`    - ${prefix}${v.slug} ${v.anio}: ${v.valor} ${v.unidad ?? ''}`)
        }
      } else if (isMock) {
        console.log('    - MOCK sin datos (dryRun sin --mock no aplica)')
      }
      const pend = s.pendientes.length ? s.pendientes.join(' | ') : '(sin pendientes)'
      const sinCob = s.pendientes.filter((p: string) => p.startsWith('sin_cobertura')).join(' | ') || '0'
      console.log(`  pendientes: ${pend || '(ninguno)'}`)
      console.log(`  sin_cobertura: ${sinCob}`)
      // Si no es mock y hay pendientes que no son sin_cobertura, es fallo real
      if (!isMock && s.pendientes.some((p: string) => !p.startsWith('sin_cobertura') && !p.includes('Dry-run'))) {
        hasRealError = true
      }
    } catch (e) {
      console.error(`  ERROR ${m.codigo}:`, (e as Error).message)
      if (!isMock) hasRealError = true
    }
  }
  if (hasRealError) {
    console.error('\nERROR: una o más fuentes no se descargaron o parsearon correctamente. Exit 1')
    process.exit(1)
  }
  console.log('\nDry-run completado. No se escribió en R2 (r2_key null) ni se modificó Supabase salvo registro dry-run.')
}

main()
