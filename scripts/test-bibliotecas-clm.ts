// Tests del adaptador de bibliotecas CLM
// Verifica: parseo CSV, resolución de INE, integridad de datos
//
// Uso:
//   npx tsx scripts/test-bibliotecas-clm.ts

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltan credenciales de Supabase')
  process.exit(1)
}

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

async function main(): Promise<void> {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log('=== Tests: sync-bibliotecas-clm ===\n')

  // Test 1: La tabla existe y tiene datos
  console.log('1. Integridad de la tabla')
  const { count, error } = await sb
    .from('bibliotecas_clm')
    .select('id', { count: 'exact', head: true })
  assert(!error, `tabla accesible${error ? ` (${error.message})` : ''}`)
  assert((count ?? 0) > 0, `tiene filas (${count ?? 0})`)

  // Test 2: Alcalá del Júcar tiene biblioteca
  console.log('\n2. Alcalá del Júcar (02007)')
  const { data: alcala, error: e1 } = await sb
    .from('bibliotecas_clm')
    .select('*')
    .eq('codigo_ine', '02007')
  assert(!e1, `consulta sin error${e1 ? ` (${e1.message})` : ''}`)
  assert((alcala?.length ?? 0) === 1, `tiene 1 biblioteca (${alcala?.length ?? 0})`)
  if (alcala?.[0]) {
    assert(
      alcala[0].nombre_biblioteca.includes('ALCALÁ DEL JÚCAR'),
      `nombre correcto: ${alcala[0].nombre_biblioteca}`,
    )
    assert(alcala[0].provincia === 'Albacete', `provincia correcta: ${alcala[0].provincia}`)
    assert(alcala[0].fuente_url.includes('datosabiertos.castillalamancha.es'), 'fuente URL correcta')
    assert(alcala[0].fuente_fecha.length === 10, `fecha fuente: ${alcala[0].fuente_fecha}`)
  }

  // Test 3: Almendros no tiene biblioteca (verificado en CSV fuente)
  console.log('\n3. Almendros (16016)')
  const { data: almendros, error: e2 } = await sb
    .from('bibliotecas_clm')
    .select('*')
    .eq('codigo_ine', '16016')
  assert(!e2, `consulta sin error${e2 ? ` (${e2.message})` : ''}`)
  assert((almendros?.length ?? 0) === 0, `no tiene biblioteca (${almendros?.length ?? 0})`)

  // Test 4: Integridad de datos
  console.log('\n4. Integridad de datos')
  const { data: all, error: e3 } = await sb
    .from('bibliotecas_clm')
    .select('codigo_ine, nombre_biblioteca, fuente_url, fuente_fecha')
    .limit(1000)
  assert(!e3, `consulta sin error${e3 ? ` (${e3.message})` : ''}`)
  if (all) {
    const conIne = all.filter((r) => /^\d{5}$/.test(r.codigo_ine))
    assert(conIne.length === all.length, `todos tienen INE-5 (${conIne.length}/${all.length})`)
    const conNombre = all.filter((r) => r.nombre_biblioteca && r.nombre_biblioteca.trim() !== '')
    assert(conNombre.length === all.length, `todos tienen nombre (${conNombre.length}/${all.length})`)
    const conFuente = all.filter((r) => r.fuente_url && r.fuente_url.startsWith('http'))
    assert(conFuente.length === all.length, `todos tienen fuente URL (${conFuente.length}/${all.length})`)
    const conFecha = all.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fuente_fecha))
    assert(conFecha.length === all.length, `todos tienen fecha ISO (${conFecha.length}/${all.length})`)
  }

  // Test 5: no hay duplicados por (codigo_ine, nombre_biblioteca)
  console.log('\n5. Unicidad')
  const { data: dup, error: e4 } = await sb
    .from('bibliotecas_clm')
    .select('codigo_ine, nombre_biblioteca')
  assert(!e4, `consulta sin error${e4 ? ` (${e4.message})` : ''}`)
  if (dup) {
    const seen = new Set<string>()
    let dupCount = 0
    for (const r of dup) {
      const k = `${r.codigo_ine}|${r.nombre_biblioteca}`
      if (seen.has(k)) dupCount++
      seen.add(k)
    }
    assert(dupCount === 0, `sin duplicados (${dupCount} encontrados)`)
  }

  console.log(`\n=== RESULTADO: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

void main()
