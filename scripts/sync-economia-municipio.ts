// Sincronización económica de UN municipio (Fase 2B).
// Uso: npx tsx scripts/sync-economia-municipio.ts 02069 [--adrh 37683] [--no-dirce]
// Requiere .env.local con SUPABASE_* + R2_* (solo servidor/scripts, nunca cliente).
// Actualización parcial del JSON v2: Demografía intacta, tope +150 KB.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { syncMunicipioEconomia } from '../src/lib/socideas-sync-economia'
import { revalidateAfterWrites } from '../src/lib/socideas-revalidate'

config({ path: '.env.local' })

const codigo = process.argv[2]
if (!codigo || !/^\d{5}$/.test(codigo)) {
  console.error('Uso: npx tsx scripts/sync-economia-municipio.ts <CODIGO_INE_5> [--adrh <id,ad...>] [--no-dirce]')
  process.exit(1)
}
const adrhIdx = process.argv.indexOf('--adrh')
// Por defecto se auto-resuelven por provincia en el sync (ver ADRH_PROVINCE_TABLES).
const adrhTableIds = adrhIdx >= 0 ? (process.argv[adrhIdx + 1] ?? '').split(',').filter(Boolean) : []
const conDirce = !process.argv.includes('--no-dirce')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)
async function main(): Promise<void> {
  const t0 = Date.now()
  try {
    const summary = await syncMunicipioEconomia(supabase, codigo, { adrhTableIds, conDirce })
    // Revalidación selectiva SOLO si la lib confirmó escritura R2 (r2_key).
    // Fallo de revalidación: no se revierte R2; se refleja en la salida.
    let revalidation: Awaited<ReturnType<typeof revalidateAfterWrites>> = null
    if (summary.r2_key) {
      revalidation = await revalidateAfterWrites([summary.municipio_codigo_ine ?? codigo])
      if (revalidation?.degradado) {
        console.error(`[revalidacion] degradada: ${revalidation.error ?? 'sin detalle'}`)
      }
      // Auditoría: fusiona en el run ya abierto por la lib, preservando claves.
      try {
        const { data: runRow } = await supabase
          .from('data_sync_runs')
          .select('metadata')
          .eq('id', summary.run_id)
          .maybeSingle()
        const previo = (runRow as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}
        await supabase
          .from('data_sync_runs')
          .update({ metadata: { ...previo, revalidation } })
          .eq('id', summary.run_id)
      } catch {
        // Resumen JSON de la salida sigue reflejando la revalidación.
      }
    }
    console.log(JSON.stringify({ ...summary, revalidation, segundos: Math.round((Date.now() - t0) / 1000) }, null, 2))
  } catch (err) {
    console.error('SYNC ERROR:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
void main()
