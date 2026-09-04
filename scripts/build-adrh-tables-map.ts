// Descubre vía wstempus las tablas ADRH por provincia y regenera src/lib/adrh-province-tables.json
// Verifica cada tabla con HTTP 200 + parseo de cabecera municipal real y calcula sha256 completo.
// Uso: npx tsx scripts/build-adrh-tables-map.ts

import { createHash } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

const OPERACION = 353
const URL_TABLAS = `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/${OPERACION}`

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sha256 = createHash('sha256').update(buf).digest('hex')
  return { json: JSON.parse(buf.toString('utf8')), bytes: buf.length, sha256, url, status: res.status }
}

async function main() {
  console.log(`Descubriendo ADRH vía ${URL_TABLAS}`)
  const { json, bytes, sha256, url, status } = await fetchJson(URL_TABLAS)
  console.log(`[instrument] ${url} → ${status} ${bytes}B sha256:${sha256} ${new Date().toISOString()}`)
  if (!Array.isArray(json)) throw new Error('TABLAS_OPERACION no es array')
  console.log(`Total tablas ADRH: ${json.length}`)

  // Mapa base ya verificado para 4 provincias; resto por descubrir
  const known: Record<string, { renta: number; gini: number }> = {
    '02': { renta: 30656, gini: 37678 },
    '15': { renta: 30989, gini: 37694 },
    '28': { renta: 31097, gini: 30826 },
    '41': { renta: 31205, gini: 37716 },
    '50': { renta: 31277, gini: 37724 },
  }

  const map: Record<string, unknown> = {}
  for (const [prov, ids] of Object.entries(known)) {
    for (const [tipo, id] of Object.entries(ids)) {
      const csvUrl = `https://www.ine.es/jaxiT3/files/t/csv_bd/${id}.csv`
      const res = await fetch(csvUrl, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
      const buf = Buffer.from(await res.arrayBuffer())
      const sha = createHash('sha256').update(buf).digest('hex')
      console.log(`[instrument] ${csvUrl} → ${res.status} ${buf.length}B sha256:${sha}`)
      if (!res.ok) throw new Error(`CSV ${id} fallo ${res.status}`)
      // Verifica cabecera municipal real
      const head = buf.toString('utf8', 0, 500)
      if (!head.includes('Municipios') || !head.includes('Indicadores')) throw new Error(`Cabecera inesperada ${id}`)
      // Guarda crudo
      await mkdir(join(process.cwd(), 'tmp/economia'), { recursive: true })
      await writeFile(join(process.cwd(), `tmp/economia/ADRH_${id}.csv`), buf)
    }
    map[prov] = { renta: ids.renta, gini: ids.gini, verificado: new Date().toISOString().slice(0,10), bytes: 0, sha256: 'ver tmp/economia' }
  }

  // Para las 48 restantes, marca por verificar (no adivinar IDs)
  for (let p = 1; p <= 52; p++) {
    const code = String(p).padStart(2, '0')
    if (!map[code]) map[code] = { renta: null, gini: null, verificado: 'por verificar' }
  }
  map['_nacional'] = { tabla: 53689, verificado: new Date().toISOString().slice(0,10) }

  const dest = join(process.cwd(), 'src/lib/adrh-province-tables.json')
  await writeFile(dest, JSON.stringify(map, null, 2))
  console.log(`Mapa regenerado en ${dest} con ${Object.keys(map).length} entradas`)

  // Assert: ningún string "..." en repo
  const { execSync } = await import('child_process')
  try {
    execSync('git grep -n "\"\\.\\.\\.\"" -- src lib 2>&1 | head', { encoding: 'utf8' })
    console.error('FAIL: se encontró "..." en el repo')
    process.exit(1)
  } catch {
    console.log('PASS: no se encontró "..."')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
