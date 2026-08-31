import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface MunicipioINE {
  codigo_ine: string
  nombre: string
  provincia_codigo: string
  poblacion: number
  lat: number
  lng: number
}

async function main() {
  const raw = readFileSync(join(__dirname, '..', 'data', 'municipios-ine.json'), 'utf-8')
  const municipios: MunicipioINE[] = JSON.parse(raw)
  
  console.log(`Loaded ${municipios.length} municipalities from INE data`)
  
  const { data: provincias, error: provError } = await supabase
    .from('provincias')
    .select('id, codigo_ine')
  
  if (provError) {
    console.error('Error loading provincias:', provError.message)
    process.exit(1)
  }
  
  const provinciaMap = new Map<string, string>()
  for (const p of provincias || []) {
    provinciaMap.set(p.codigo_ine, p.id)
  }
  
  console.log(`Loaded ${provinciaMap.size} provincias`)
  
  let inserted = 0
  let errors = 0
  
  for (let i = 0; i < municipios.length; i++) {
    const m = municipios[i]
    const provId = provinciaMap.get(m.provincia_codigo)
    
    if (!provId) {
      console.warn(`Provincia ${m.provincia_codigo} not found for ${m.nombre}`)
      errors++
      continue
    }
    
    const { error } = await supabase.from('municipios').upsert({
      codigo_ine: m.codigo_ine,
      nombre: m.nombre,
      provincia_id: provId,
      poblacion: m.poblacion,
      geom: `SRID=4326;POINT(${m.lng} ${m.lat})`
    }, { onConflict: 'codigo_ine' })
    
    if (error) {
      console.error(`Error inserting ${m.nombre}: ${error.message}`)
      errors++
    } else {
      inserted++
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`Progress: ${i + 1}/${municipios.length} (${inserted} inserted, ${errors} errors)`)
    }
  }
  
  console.log(`\nDone! Inserted: ${inserted}, Errors: ${errors}, Total: ${municipios.length}`)
}

main().catch(console.error)
