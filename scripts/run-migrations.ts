import postgres from 'postgres'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!DATABASE_URL) {
  console.error('ERROR: Necesitas la variable DATABASE_URL o SUPABASE_DB_URL en .env.local')
  console.error('Formato: postgresql://postgres.[ref]:[password]@aws-1-eu-west-1.pooler.supabase.com:6543/postgres')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })

async function runMigration011() {
  console.log('=== MIGRACIÓN 011: Dedup + Constraints + Legislación ===')

  // Part 1: Deduplicar
  console.log('Parte 1: Eliminando duplicados...')
  await sql`DELETE FROM fuentes_geoportales WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY nombre, url ORDER BY created_at DESC) as rn FROM fuentes_geoportales) t WHERE rn > 1)`
  await sql`DELETE FROM capas_wms WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY comunidad_autonoma_id, nombre_capa, url_servicio ORDER BY created_at DESC) as rn FROM capas_wms) t WHERE rn > 1)`
  await sql`DELETE FROM normativa_vigente WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY titulo, referencia_legal ORDER BY created_at DESC) as rn FROM normativa_vigente) t WHERE rn > 1)`
  console.log('Duplicados eliminados.')

  // Part 2: Constraints UNIQUE
  console.log('Parte 2: Añadiendo restricciones UNIQUE...')
  const [hasFuentes] = await sql`SELECT 1 FROM pg_constraint WHERE conname = 'uq_fuentes_nombre_url'`
  if (!hasFuentes) await sql`ALTER TABLE fuentes_geoportales ADD CONSTRAINT uq_fuentes_nombre_url UNIQUE (nombre, url)`
  const [hasCapas] = await sql`SELECT 1 FROM pg_constraint WHERE conname = 'uq_capas_ccaa_nombre_url'`
  if (!hasCapas) await sql`ALTER TABLE capas_wms ADD CONSTRAINT uq_capas_ccaa_nombre_url UNIQUE (comunidad_autonoma_id, nombre_capa, url_servicio)`
  const [hasNormativa] = await sql`SELECT 1 FROM pg_constraint WHERE conname = 'uq_normativa_titulo_ref'`
  if (!hasNormativa) await sql`ALTER TABLE normativa_vigente ADD CONSTRAINT uq_normativa_titulo_ref UNIQUE (titulo, referencia_legal)`
  console.log('Restricciones UNIQUE creadas.')

  // Part 3: Legislación autonómica (11 CCAA)
  console.log('Parte 3: Insertando legislación autonómica...')

  const leyes = [
    { ccaa: 'Galicia', titulo: 'Ley del Suelo de Galicia', ref: 'Ley 2/2016, del 10 de febrero, del suelo de Galicia', fecha: '2016-02-16', enlace: 'https://www.boe.es/boe/dias/2016/03/05/pdfs/BOE-A-2016-2371.pdf' },
    { ccaa: 'Castilla y León', titulo: 'Ley de Suelo y Urbanismo de Castilla y León', ref: 'Ley 8/2001, de 13 de diciembre, de Suelo y Urbanismo de Castilla y León', fecha: '2002-01-19', enlace: 'https://www.boe.es/boe/dias/2002/01/19/pdfs/BOE-A-2002-1327.pdf' },
    { ccaa: 'Castilla-La Mancha', titulo: 'Ley de Suelo y Urbanismo de Castilla-La Mancha', ref: 'Ley 9/2006, de 28 de diciembre, de Suelo y Urbanismo de Castilla-La Mancha', fecha: '2006-12-29', enlace: 'https://www.boe.es/boe/dias/2007/01/24/pdfs/BOE-A-2007-1601.pdf' },
    { ccaa: 'Canarias', titulo: 'Ley de Suelo de Canarias', ref: 'Ley 4/1997, de 4 de diciembre, de Suelo de Canarias', fecha: '1997-12-05', enlace: 'https://www.boe.es/boe/dias/1998/01/10/pdfs/BOE-A-1998-800.pdf' },
    { ccaa: 'Islas Baleares', titulo: 'Ley de Suelo de las Islas Baleares', ref: 'Ley 12/2017, de 26 de diciembre, de Suelo de las Islas Baleares', fecha: '2017-12-28', enlace: 'https://www.boe.es/boe/dias/2018/01/10/pdfs/BOE-A-2018-233.pdf' },
    { ccaa: 'Extremadura', titulo: 'Ley del Suelo y Ordenación Territorial de Extremadura', ref: 'Ley 15/2001, de 14 de diciembre, del Suelo y Ordenación Territorial de Extremadura', fecha: '2001-12-15', enlace: 'https://www.boe.es/boe/dias/2002/01/19/pdfs/BOE-A-2002-1337.pdf' },
    { ccaa: 'Región de Murcia', titulo: 'Ley de Ordenación del Territorio, Urbanismo y Paisaje de la Región de Murcia', ref: 'Ley 13/2015, de 31 de marzo, de Ordenación del Territorio, Urbanismo y Paisaje de la Región de Murcia', fecha: '2015-04-15', enlace: 'https://www.boe.es/boe/dias/2015/04/15/pdfs/BOE-A-2015-4502.pdf' },
    { ccaa: 'Comunidad Foral de Navarra', titulo: 'Ley Foral de Urbanismo de Navarra', ref: 'Ley 35/2002, de 4 de diciembre, foral de Urbanismo de Navarra', fecha: '2002-12-05', enlace: 'https://www.boe.es/boe/dias/2003/01/07/pdfs/BOE-A-2003-314.pdf' },
    { ccaa: 'La Rioja', titulo: 'Ley de Suelo, Vivienda y Urbanismo de La Rioja', ref: 'Ley 8/2004, de 19 de octubre, de Suelo, Vivienda y Urbanismo de La Rioja', fecha: '2004-10-20', enlace: 'https://www.boe.es/boe/dias/2004/11/13/pdfs/BOE-A-2004-1975.pdf' },
    { ccaa: 'Cantabria', titulo: 'Ley de Suelo y Régimen Urbanístico del Suelo de Cantabria', ref: 'Ley 2/2001, de 25 de junio, de Suelo y Régimen Urbanístico del Suelo de Cantabria', fecha: '2001-06-28', enlace: 'https://www.boe.es/boe/dias/2001/07/25/pdfs/BOE-A-2001-13761.pdf' },
    { ccaa: 'Asturias', titulo: 'Ley de Suelo del Principado de Asturias', ref: 'Ley 3/2002, de 22 de marzo, de Suelo del Principado de Asturias', fecha: '2002-03-25', enlace: 'https://www.boe.es/boe/dias/2002/04/13/pdfs/BOE-A-2002-7344.pdf' },
  ]

  for (const l of leyes) {
    const [ccaaRow] = await sql`SELECT id FROM comunidades_autonomas WHERE nombre = ${l.ccaa}`
    if (!ccaaRow) { console.log(`  CCAA "${l.ccaa}" no encontrada, saltando.`); continue }
    await sql`INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia) VALUES ('autonomico', ${ccaaRow.id}, ${l.titulo}, ${l.ref}, ${l.fecha}, ${l.enlace}, 'vigente') ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING`
    console.log(`  ✓ ${l.ccaa}`)
  }
  console.log('Legislación autonómica insertada.')
}

async function runMigration013() {
  console.log('\n=== MIGRACIÓN 013: Categorías WMS + Capas Nacionales ===')

  // Añadir columna categoria
  await sql`ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'planeamiento_general'`
  await sql`CREATE INDEX IF NOT EXISTS idx_capas_wms_categoria ON capas_wms(categoria)`
  console.log('Columna "categoria" añadida.')

  // Actualizar categorías existentes
  await sql`UPDATE capas_wms SET categoria = 'clasificacion_suelo' WHERE nombre_capa LIKE '%CLASSIFICACIONS%'`
  await sql`UPDATE capas_wms SET categoria = 'calificacion_urbanistica' WHERE nombre_capa LIKE '%QUALIFICACIONS%'`
  await sql`UPDATE capas_wms SET categoria = 'planeamiento_general' WHERE nombre_capa LIKE '%PLANEJAMENT%' OR nombre_capa LIKE '%AMBIT%'`
  console.log('Categorías actualizadas en capas existentes.')

  // Insertar PNOA para todas las CCAA
  await sql`INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria) SELECT ca.id, 'PNOA_HISTORICO', 'https://www.ign.es/wms/pnoa-historico', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'ortofoto' FROM comunidades_autonomas ca WHERE NOT EXISTS (SELECT 1 FROM capas_wms c WHERE c.comunidad_autonoma_id = ca.id AND c.nombre_capa = 'PNOA_HISTORICO')`
  console.log('  ✓ PNOA_HISTORICO insertado para todas las CCAA.')

  // Insertar Planosig
  await sql`INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria) SELECT ca.id, 'PLANOSIG_HISTORICO', 'https://www.ign.es/wms/planosig', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'patrimonio_cultural' FROM comunidades_autonomas ca WHERE NOT EXISTS (SELECT 1 FROM capas_wms c WHERE c.comunidad_autonoma_id = ca.id AND c.nombre_capa = 'PLANOSIG_HISTORICO')`
  console.log('  ✓ PLANOSIG_HISTORICO insertado para todas las CCAA.')
}

async function runMigration014() {
  console.log('\n=== MIGRACIÓN 014: 8.131 Municipios INE ===')

  // Crear función upsert
  await sql`CREATE OR REPLACE FUNCTION upsert_municipio(p_codigo_ine CHAR(5), p_nombre TEXT, p_provincia_codigo TEXT, p_poblacion INTEGER, p_lng DOUBLE PRECISION, p_lat DOUBLE PRECISION) RETURNS VOID AS $$ DECLARE v_provincia_id UUID; BEGIN SELECT id INTO v_provincia_id FROM provincias WHERE codigo_ine = p_provincia_codigo; IF v_provincia_id IS NULL THEN RAISE NOTICE 'Provincia % not found for %', p_provincia_codigo, p_nombre; RETURN; END IF; INSERT INTO municipios (codigo_ine, nombre, provincia_id, poblacion, geom) VALUES (p_codigo_ine, p_nombre, v_provincia_id, p_poblacion, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)) ON CONFLICT (codigo_ine) DO UPDATE SET nombre = EXCLUDED.nombre, poblacion = EXCLUDED.poblacion, geom = EXCLUDED.geom; END; $$ LANGUAGE plpgsql`
  console.log('Función upsert_municipio creada.')

  // Leer JSON de municipios
  const fs = await import('fs')
  const path = await import('path')
  const jsonPath = path.join(process.cwd(), 'scripts', 'data', 'municipios-ine.json')
  const raw = fs.readFileSync(jsonPath, 'utf-8')
  const municipios = JSON.parse(raw)
  console.log(`Cargados ${municipios.length} municipios del JSON.`)

  let inserted = 0
  let errors = 0

  for (let i = 0; i < municipios.length; i++) {
    const m = municipios[i]
    try {
      await sql`SELECT upsert_municipio(${m.codigo_ine}, ${m.nombre}, ${m.provincia_codigo}, ${m.poblacion}, ${m.lng}, ${m.lat})`
      inserted++
    } catch (err) {
      console.error(`Error en ${m.nombre} (${m.codigo_ine}): ${err.message}`)
      errors++
    }
    if ((i + 1) % 1000 === 0) {
      console.log(`  Progreso: ${i + 1}/${municipios.length} (${inserted} OK, ${errors} errores)`)
    }
  }

  console.log(`\nMunicipios procesados: ${inserted} insertados/actualizados, ${errors} errores.`)

  // Verificar
  const [count] = await sql`SELECT COUNT(*) as total FROM municipios`
  console.log(`Total municipios en tabla: ${count.total}`)

  const top10 = await sql`SELECT p.nombre as provincia, COUNT(m.id) as num_municipios FROM provincias p LEFT JOIN municipios m ON m.provincia_id = p.id GROUP BY p.nombre ORDER BY num_municipios DESC LIMIT 10`
  console.log('\nTop 10 provincias por número de municipios:')
  for (const row of top10) {
    console.log(`  ${row.provincia}: ${row.num_municipios}`)
  }

  // Eliminar función
  await sql`DROP FUNCTION IF EXISTS upsert_municipio`
  console.log('\nFunción upsert_municipio eliminada.')
}

async function verifyFinal() {
  console.log('\n=== VERIFICACIÓN FINAL ===')
  const [mun] = await sql`SELECT COUNT(*) as total FROM municipios`
  console.log(`Total municipios: ${mun.total}`)
  const [leg] = await sql`SELECT COUNT(*) as total FROM normativa_vigente`
  console.log(`Total normativa: ${leg.total}`)
  const [cap] = await sql`SELECT COUNT(*) as total FROM capas_wms WHERE activo = true`
  console.log(`Total capas WMS activas: ${cap.total}`)
  const [fue] = await sql`SELECT COUNT(*) as total FROM fuentes_geoportales`
  console.log(`Total fuentes geoportales: ${fue.total}`)
}

async function main() {
  try {
    await runMigration011()
    await runMigration013()
    await runMigration014()
    await verifyFinal()
    console.log('\n✅ Todas las migraciones ejecutadas correctamente.')
  } catch (err) {
    console.error('\n❌ Error en migración:', err.message)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
