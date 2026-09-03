// Sincronización económica de UN municipio (Fase 2B).
// Uso: npx tsx scripts/sync-economia-municipio.ts 02069 [--adrh 37683] [--no-dirce]
// Requiere .env.local con SUPABASE_* + R2_* (solo servidor/scripts, nunca cliente).
// Actualización parcial del JSON v2: Demografía intacta, tope +150 KB.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { syncMunicipioEconomia } from '../src/lib/socideas-sync-economia'

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
    console.log(JSON.stringify({ ...summary, segundos: Math.round((Date.now() - t0) / 1000) }, null, 2))
  } catch (err) {
    console.error('SYNC ERROR:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
void main()
