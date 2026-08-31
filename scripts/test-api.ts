import postgres from 'postgres'

const sql = postgres('postgresql://postgres.nkfepxuyrbcxolljykwk:ClaveUrb12-@aws-1-eu-west-1.pooler.supabase.com:6543/postgres', { ssl: 'require' })

async function test() {
  // Test the exact query the API makes
  const provId = 'e56f6d7a-df89-46b7-8eac-026a7a26d19a' // Cáceres
  
  console.log('Testing query for provincia_id:', provId)
  
  const result = await sql`SELECT id, nombre, codigo_ine, poblacion, provincia_id FROM municipios WHERE provincia_id = ${provId} ORDER BY nombre LIMIT 500`
  console.log(`Got ${result.length} municipalities`)
  console.log('First 3:', JSON.stringify(result.slice(0, 3)))
  
  // Test busqueda endpoint query
  console.log('\nTesting busqueda for "aliseda":')
  const search = await sql`SELECT id, nombre, codigo_ine, poblacion FROM municipios WHERE nombre ILIKE '%aliseda%' LIMIT 20`
  console.log('Search results:', JSON.stringify(search))
  
  await sql.end()
}

test().catch(e => console.error('ERROR:', e.message))
