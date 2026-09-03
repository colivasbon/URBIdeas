// Migración puntual Fase 2A.2: vuelca municipal_indicator_values a R2.
//
// Uso:
//   npx tsx scripts/export-valores-to-r2.ts --go [--limit 50]
//
// Sin --go hace dry-run. Por cada municipio con valores validados construye
// el envelope (misma forma que genera el sync) y lo sube a R2. No borra nada:
// el TRUNCATE posterior requiere autorización expresa aparte.
//
// Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

async function main() {
  const argv = process.argv.slice(2)
  const go = argv.includes('--go')
  const li = argv.indexOf('--limit')
  const limit = li >= 0 ? parseInt(argv[li + 1], 10) : undefined

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('ERROR: faltan claves Supabase en .env.local')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  // Municipios con valores (paginado: PostgREST topa en 1000).
  const inies = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('municipal_indicator_values')
      .select('municipio_codigo_ine')
      .order('municipio_codigo_ine')
      .range(from, from + 999)
    if (error) throw error
    for (const r of ((data ?? []) as unknown as { municipio_codigo_ine: string }[])) {
      inies.add(r.municipio_codigo_ine.trim())
    }
    if (((data ?? []).length) < 1000) break
  }
  let lista = [...inies].sort()
  if (limit) lista = lista.slice(0, limit)
  console.log(`Municipios con valores: ${inies.size} | a exportar: ${lista.length}`)
  if (!go) {
    console.log('DRY-RUN: sin --go no se sube nada.')
    return
  }

  const { putMunicipioJson, R2_ENVELOPE_VERSION } = await import('../src/lib/socideas-r2')
  let ok = 0
  let fallos = 0
  for (let i = 0; i < lista.length; i++) {
    const ine = lista[i]
    try {
      const rows: unknown[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('municipal_indicator_values')
          .select('*, indicator:indicator_definitions(slug, nombre, unidad), source:statistical_sources(slug, organismo, nombre)')
          .eq('municipio_codigo_ine', ine)
          .eq('estado_validacion', 'validado')
          .order('anio_referencia')
          .range(from, from + 999)
        if (error) throw error
        rows.push(...((data ?? []) as unknown[]))
        if (((data ?? []).length) < 1000) break
      }
      const key = await putMunicipioJson(ine, {
        version: R2_ENVELOPE_VERSION,
        codigo_ine: ine,
        generado_en: new Date().toISOString(),
        valores: rows,
      })
      ok++
      console.log(`[${i + 1}/${lista.length}] ${ine}: ${rows.length} filas → ${key}`)
    } catch (err) {
      fallos++
      console.log(`[${i + 1}/${lista.length}] ${ine}: ERROR ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`FIN: ok=${ok} fallos=${fallos}`)
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err)
  process.exit(1)
})
