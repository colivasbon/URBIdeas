import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = postgres('postgresql://postgres.nkfepxuyrbcxolljykwk:ClaveUrb12-@aws-1-eu-west-1.pooler.supabase.com:6543/postgres', { ssl: 'require' })

interface MunicipioINE {
  codigo_ine: string
  nombre: string
  provincia_codigo: string
  poblacion: number
  lat: number
  lng: number
}

async function run() {
  const raw = readFileSync(join(process.cwd(), 'scripts', 'data', 'municipios-ine.json'), 'utf-8')
  const municipios: MunicipioINE[] = JSON.parse(raw)
  console.log(`Loaded ${municipios.length} municipalities`)

  // Batch update using a single CASE statement
  const BATCH_SIZE = 200
  let totalUpdated = 0

  for (let i = 0; i < municipios.length; i += BATCH_SIZE) {
    const batch = municipios.slice(i, i + BATCH_SIZE)
    
    const cases = batch.map(m => 
      `WHEN codigo_ine = '${m.codigo_ine}' THEN ST_SetSRID(ST_MakePoint(${m.lng}, ${m.lat}), 4326)`
    ).join(' ')
    
    const codes = batch.map(m => `'${m.codigo_ine}'`).join(',')
    
    await sql.unsafe(`
      UPDATE municipios SET geom = CASE ${cases} END
      WHERE codigo_ine IN (${codes}) AND geom IS NULL
    `)
    
    totalUpdated += batch.length
    if (totalUpdated % 1000 === 0 || totalUpdated >= municipios.length) {
      console.log(`Updated: ${totalUpdated}/${municipios.length}`)
    }
  }

  // Verify
  const [withGeom] = await sql`SELECT COUNT(*) as total FROM municipios WHERE geom IS NOT NULL`
  const [withoutGeom] = await sql`SELECT COUNT(*) as total FROM municipios WHERE geom IS NULL`
  console.log(`\nWith geometry: ${withGeom.total}`)
  console.log(`Without geometry: ${withoutGeom.total}`)

  await sql.end()
  console.log('Done!')
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
