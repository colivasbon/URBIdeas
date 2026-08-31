import postgres from 'postgres'

const sql = postgres('postgresql://postgres.nkfepxuyrbcxolljykwk:ClaveUrb12-@aws-1-eu-west-1.pooler.supabase.com:6543/postgres', { ssl: 'require' })

async function run() {
  console.log('Migración 016: Ampliando modelo normativa...')
  
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS municipio_id UUID REFERENCES municipios(id)`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS fuente_oficial TEXT`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS administracion_emisora TEXT`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMPTZ`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS url_verificada TEXT`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS resultado_verificacion TEXT`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ DEFAULT NOW()`
  await sql`ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS observaciones TEXT`
  console.log('  Columnas de trazabilidad añadidas.')

  await sql.unsafe(`ALTER TABLE normativa_vigente DROP CONSTRAINT IF EXISTS normativa_vigente_ambito_check`)
  await sql.unsafe(`ALTER TABLE normativa_vigente ADD CONSTRAINT normativa_vigente_ambito_check CHECK (ambito IN ('estatal', 'autonomico', 'provincial', 'municipal', 'planeamiento'))`)
  console.log('  CHECK constraint ampliado.')

  await sql`CREATE INDEX IF NOT EXISTS idx_normativa_municipio ON normativa_vigente(municipio_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_normativa_fuente ON normativa_vigente(fuente_oficial)`
  console.log('  Índices creados.')

  await sql`UPDATE normativa_vigente SET fuente_oficial = 'BOE', administracion_emisora = 'Gobierno de España' WHERE ambito = 'estatal' AND fuente_oficial IS NULL`
  await sql`UPDATE normativa_vigente SET administracion_emisora = 'Comunidad Autónoma' WHERE ambito = 'autonomico' AND administracion_emisora IS NULL`
  console.log('  Datos de trazabilidad actualizados.')

  const [c] = await sql`SELECT COUNT(*) as total FROM normativa_vigente`
  console.log(`  Total normativa: ${c.total}`)
  
  await sql.end()
  console.log('✅ Migración 016 completada.')
}

run().catch(e => { console.error('❌', e.message); process.exit(1) })
