import postgres from 'postgres'

const sql = postgres('postgresql://postgres.nkfepxuyrbcxolljykwk:ClaveUrb12-@aws-1-eu-west-1.pooler.supabase.com:6543/postgres', { ssl: 'require' })

async function run() {
  // Create a function that returns lat/lng for a municipio
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION get_municipio_coords(p_id UUID)
    RETURNS TABLE(lat DOUBLE PRECISION, lng DOUBLE PRECISION) AS $$
    BEGIN
      RETURN QUERY
      SELECT ST_Y(m.geom) as lat, ST_X(m.geom) as lng
      FROM municipios m WHERE m.id = p_id AND m.geom IS NOT NULL;
    END;
    $$ LANGUAGE plpgsql;
  `)
  console.log('Function get_municipio_coords created.')

  // Test it
  const [test] = await sql`SELECT * FROM get_municipio_coords((SELECT id FROM municipios WHERE codigo_ine = '10037' LIMIT 1))`
  console.log('Test Cáceres coords:', test)

  await sql.end()
  console.log('Done!')
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
