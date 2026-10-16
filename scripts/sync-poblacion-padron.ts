/**
 * SINCRONIZACIÓN DE `municipios.poblacion` CON LAS CIFRAS OFICIALES DEL PADRÓN
 *
 * MODO:
 *   npx tsx scripts/sync-poblacion-padron.ts           DRY-RUN (defecto): descarga, compara, informe
 *   npx tsx scripts/sync-poblacion-padron.ts --write   escritura real (update por codigo_ine)
 *
 * MOTIVO: la columna se sembró desde scripts/data/municipios-ine.json, cuyas
 * poblaciones no proceden del INE (Villalgordo del Marquesado 48, Almonacid del
 * Marquesado 5.109, Alegría-Dulantzi 80.289). El buscador y las tarjetas la
 * muestran y descuadra con la ficha.
 *
 * FUENTE: INE, Cifras oficiales de población de los municipios españoles
 * (revisión del Padrón municipal), una tabla Tempus3 por provincia
 * (2854–2909, ids no consecutivos: se leen del catálogo de la operación DPOP). El
 * código INE del municipio se toma de los metadatos de la serie (tip=AM), no
 * del nombre. Es la misma operación que alimenta «Población actual» de la ficha.
 *
 * El Censo Anual de Población (tabla 68535, pirámide y nacionalidad) es otra
 * operación del INE y da cifras distintas (16247: 62 en el Censo frente a 59 en el Padrón).
 */
import { config } from 'dotenv'
import { writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const WRITE = process.argv.includes('--write')

interface Cifra { codigo_ine: string; nombre: string; anio: number; valor: number; tabla: number }

async function descargarTabla(t: number): Promise<Cifra[]> {
  const url = `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${t}?nult=1&tip=AM`
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const series = (await r.json()) as Array<{
        MetaData: Array<{ T3_Variable: string; Nombre: string; Codigo: string }>
        Data: Array<{ Anyo: number; Valor: number | null }>
      }>
      const out: Cifra[] = []
      for (const s of series) {
        const mun = s.MetaData.find((m) => m.T3_Variable === 'Municipios')
        const sexo = s.MetaData.find((m) => m.T3_Variable === 'Sexo')
        const tam = s.MetaData.find((m) => m.T3_Variable === 'Tamaño de los municipios')
        if (!mun || !/^\d{5}$/.test(mun.Codigo) || sexo?.Codigo !== '0' || (tam && tam.Codigo !== '0')) continue
        const d = s.Data[0]
        if (!d || d.Valor == null) continue
        out.push({ codigo_ine: mun.Codigo, nombre: mun.Nombre, anio: d.Anyo, valor: d.Valor, tabla: t })
      }
      return out
    } catch (e) {
      if (intento >= 4) throw new Error(`Tabla ${t}: ${(e as Error).message}`)
      await new Promise((res) => setTimeout(res, 2000 * intento))
    }
  }
}

async function tablasProvinciales(): Promise<number[]> {
  const r = await fetch('https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/DPOP')
  if (!r.ok) throw new Error(`Catálogo DPOP: HTTP ${r.status}`)
  const tablas = (await r.json()) as Array<{ Id: number; Nombre: string }>
  const ids = tablas.filter((t) => /: Población por municipios y sexo\.?\s*$/.test(t.Nombre)).map((t) => t.Id)
  if (ids.length !== 52) throw new Error(`Se esperaban 52 tablas provinciales, el catálogo da ${ids.length}`)
  return ids.sort((a, b) => a - b)
}

async function main() {
  const TABLAS = await tablasProvinciales()
  const cifras = new Map<string, Cifra>()
  for (const t of TABLAS) {
    const filas = await descargarTabla(t)
    for (const c of filas) cifras.set(c.codigo_ine, c)
    process.stdout.write(`tabla ${t}: ${filas.length} municipios\n`)
  }
  const anios = new Set([...cifras.values()].map((c) => c.anio))
  console.log(`INE: ${cifras.size} municipios, año(s) ${[...anios].join(', ')}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const actuales: Array<{ codigo_ine: string; nombre: string; poblacion: number | null }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('municipios').select('codigo_ine, nombre, poblacion').order('codigo_ine').range(from, from + 999)
    if (error) throw new Error(error.message)
    actuales.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  const cambios = actuales
    .filter((m) => cifras.has(m.codigo_ine) && cifras.get(m.codigo_ine)!.valor !== m.poblacion)
    .map((m) => ({ codigo_ine: m.codigo_ine, nombre: m.nombre, antes: m.poblacion, despues: cifras.get(m.codigo_ine)!.valor }))
  const sinIne = actuales.filter((m) => !cifras.has(m.codigo_ine)).map((m) => `${m.codigo_ine} ${m.nombre}`)
  const sinBase = [...cifras.keys()].filter((c) => !actuales.some((m) => m.codigo_ine === c))

  console.log(`Supabase: ${actuales.length} municipios; a corregir ${cambios.length}; sin cifra INE ${sinIne.length}; en INE sin fila en base ${sinBase.length}`)
  for (const c of cambios.filter((x) => ['16247', '16018', '16111', '16115', '01001', '02003'].includes(x.codigo_ine))) {
    console.log(`  ${c.codigo_ine} ${c.nombre}: ${c.antes} -> ${c.despues}`)
  }
  mkdirSync('tmp/audit', { recursive: true })
  writeFileSync('tmp/audit/poblacion-padron.json', JSON.stringify({ anios: [...anios], cambios, sinIne, sinBase }, null, 2))
  console.log('Informe: tmp/audit/poblacion-padron.json')

  if (!WRITE) {
    console.log('DRY-RUN: sin escritura. Repetir con --write para aplicar.')
    return
  }
  let ok = 0
  for (const c of cambios) {
    const { error } = await supabase.from('municipios').update({ poblacion: c.despues }).eq('codigo_ine', c.codigo_ine)
    if (error) console.error(`  ${c.codigo_ine}: ${error.message}`)
    else ok++
  }
  console.log(`Escritas ${ok}/${cambios.length} filas.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
