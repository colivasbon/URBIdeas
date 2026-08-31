import postgres from 'postgres'

const sql = postgres('postgresql://postgres.nkfepxuyrbcxolljykwk:ClaveUrb12-@aws-1-eu-west-1.pooler.supabase.com:6543/postgres', { ssl: 'require' })

async function check() {
  // Check provincias
  const provincias = await sql`SELECT id, nombre, codigo_ine FROM provincias WHERE nombre ILIKE '%caceres%' OR nombre ILIKE '%Cáceres%'`
  console.log('Provincias Caceres:', JSON.stringify(provincias))

  // Check all provincias for Extremadura
  const ext = await sql`SELECT p.id, p.nombre, p.codigo_ine, ca.nombre as ccaa FROM provincias p JOIN comunidades_autonomas ca ON p.comunidad_autonoma_id = ca.id WHERE ca.nombre = 'Extremadura'`
  console.log('Extremadura provincias:', JSON.stringify(ext))

  // Check municipios for each Extremadura province
  for (const prov of ext) {
    const [count] = await sql`SELECT COUNT(*) as total FROM municipios WHERE provincia_id = ${prov.id}`
    const sample = await sql`SELECT id, nombre, codigo_ine, ST_Y(geom) as lat, ST_X(geom) as lng FROM municipios WHERE provincia_id = ${prov.id} LIMIT 3`
    console.log(`${prov.nombre} (${prov.id}): ${count.total} municipios, sample:`, JSON.stringify(sample))
  }

  // Check normativa
  const normativa = await sql`SELECT id, ambito, titulo, estado_vigencia FROM normativa_vigente LIMIT 5`
  console.log('Normativa sample:', JSON.stringify(normativa))

  await sql.end()
}

check().catch(e => console.error('ERROR:', e.message))
