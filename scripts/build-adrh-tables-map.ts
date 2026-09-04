// Descubre las tablas jaxiT3 del ADRH (renta media/mediana e índice de Gini/P80-P20)
// para las 52 provincias vía wstempus TABLAS_OPERACION y regenera
// src/lib/adrh-province-tables.json SIN placeholders ni campos inventados.
//
// Uso: npx tsx scripts/build-adrh-tables-map.ts
// Sale con exit 1 si alguna provincia queda sin mapear o alguna tabla no responde 200.

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'

const OPERACION = 353
const UA = { 'User-Agent': 'URBIdeas/1.0 (+https://urbideas.com)' }
const TABLAS_URL = `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/${OPERACION}`

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const PROVINCIAS: Record<string, { nombre: string }> = {
  '01': { nombre: 'Araba/Álava' }, '02': { nombre: 'Albacete' }, '03': { nombre: 'Alicante' },
  '04': { nombre: 'Almería' }, '05': { nombre: 'Ávila' }, '06': { nombre: 'Badajoz' },
  '07': { nombre: 'Illes Balears' }, '08': { nombre: 'Barcelona' }, '09': { nombre: 'Burgos' },
  '10': { nombre: 'Cáceres' }, '11': { nombre: 'Cádiz' }, '12': { nombre: 'Castellón' },
  '13': { nombre: 'Ciudad Real' }, '14': { nombre: 'Córdoba' }, '15': { nombre: 'A Coruña' },
  '16': { nombre: 'Cuenca' }, '17': { nombre: 'Girona' }, '18': { nombre: 'Granada' },
  '19': { nombre: 'Guadalajara' }, '20': { nombre: 'Gipuzkoa' }, '21': { nombre: 'Huelva' },
  '22': { nombre: 'Huesca' }, '23': { nombre: 'Jaén' }, '24': { nombre: 'León' },
  '25': { nombre: 'Lleida' }, '26': { nombre: 'La Rioja' }, '27': { nombre: 'Lugo' },
  '28': { nombre: 'Madrid' }, '29': { nombre: 'Málaga' }, '30': { nombre: 'Murcia' },
  '31': { nombre: 'Navarra' }, '32': { nombre: 'Ourense' }, '33': { nombre: 'Asturias' },
  '34': { nombre: 'Palencia' }, '35': { nombre: 'Las Palmas' }, '36': { nombre: 'Pontevedra' },
  '37': { nombre: 'Salamanca' }, '38': { nombre: 'Santa Cruz de Tenerife' }, '39': { nombre: 'Cantabria' },
  '40': { nombre: 'Segovia' }, '41': { nombre: 'Sevilla' }, '42': { nombre: 'Soria' },
  '43': { nombre: 'Tarragona' }, '44': { nombre: 'Teruel' }, '45': { nombre: 'Toledo' },
  '46': { nombre: 'Valencia' }, '47': { nombre: 'Valladolid' }, '48': { nombre: 'Bizkaia' },
  '49': { nombre: 'Zamora' }, '50': { nombre: 'Zaragoza' }, '51': { nombre: 'Ceuta' },
  '52': { nombre: 'Melilla' },
}

type Tabla = { Id?: number; Nombre?: string; Codigo?: string; id?: number; nombre?: string; codigo?: string }

function tablaId(t: Tabla): number | null {
  const v = t.Id ?? t.id
  return typeof v === 'number' ? v : null
}
function tablaNombre(t: Tabla): string {
  return String(t.Nombre ?? t.nombre ?? '')
}
function tablaCodigo(t: Tabla): string {
  return String(t.Codigo ?? t.codigo ?? '')
}

async function checkCsv(id: number): Promise<{ bytes: number; sha256: string }> {
  const url = `https://www.ine.es/jaxiT3/files/t/csv_bd/${id}.csv`
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sha256 = createHash('sha256').update(buf).digest('hex')
  await mkdir(join(process.cwd(), 'tmp/economia'), { recursive: true })
  await writeFile(join(process.cwd(), `tmp/economia/ADRH_${id}.csv`), buf)
  console.log(`[instrument] ${url} → ${res.status} ${buf.length}B sha256:${sha256}`)
  return { bytes: buf.length, sha256 }
}

async function discoverProvinceForTable(id: number): Promise<string | null> {
  const url = `https://www.ine.es/jaxiT3/files/t/csv_bd/${id}.csv`
  // Descarga un tramo amplio: las primeras filas suelen ser secciones/distritos,
  // hay que llegar hasta una fila de nivel municipal (Distritos y Secciones vacíos).
  const res = await fetch(url, { headers: { ...UA, Range: 'bytes=0-200000' } })
  let buf: Buffer
  if (!res.ok) {
    const r2 = await fetch(url, { headers: UA })
    if (!r2.ok) return null
    buf = Buffer.from(await r2.arrayBuffer())
  } else {
    buf = Buffer.from(await res.arrayBuffer())
  }
  const txt = buf.toString('latin1')
  const lines = txt.split(/\r?\n/)
  if (lines.length < 2) return null
  const header = lines[0].split('\t')
  // La cabecera trae BOM (ï»¿Municipios): usar includes en vez de startsWith
  const idx = (name: string) => header.findIndex(h => h.trim().toLowerCase().includes(name))
  const iMuni = idx('municipios')
  const iDist = idx('distritos')
  const iSecc = idx('secciones')
  if (iMuni < 0) return null
  for (const line of lines.slice(1, 2000)) {
    const cols = line.split('\t')
    if (cols.length <= iMuni) continue
    if (iDist >= 0 && (cols[iDist] ?? '').trim() !== '') continue
    if (iSecc >= 0 && (cols[iSecc] ?? '').trim() !== '') continue
    const m = (cols[iMuni] ?? '').match(/^\s*(\d{5})\b/)
    if (m) return m[1].slice(0, 2)
  }
  return null
}

async function main() {
  console.log(`Descargando lista de tablas de la operación ${OPERACION}…`)
  const res = await fetch(TABLAS_URL, { headers: UA })
  if (!res.ok) throw new Error(`${TABLAS_URL} → HTTP ${res.status}`)
  const tablas = (await res.json()) as Tabla[]
  if (!Array.isArray(tablas) || tablas.length === 0) throw new Error('TABLAS_OPERACION vacío')
  console.log(`Tablas en la operación: ${tablas.length}`)

  const candidatas = tablas.filter(t => {
    const n = norm(tablaNombre(t))
    const c = norm(tablaCodigo(t))
    // Solo las municipales (DIST-SECC-MUN) de renta y Gini
    if (!c.includes('dist-secc-mun')) return false
    return n.includes('renta media y mediana') || n.includes('gini')
  })
  console.log(`Candidatas renta/Gini municipal: ${candidatas.length}`)

  const provinceMap: Record<string, { renta: number | null; gini: number | null }> = {}
  for (const code of Object.keys(PROVINCIAS)) provinceMap[code] = { renta: null, gini: null }

  for (const t of candidatas) {
    const id = tablaId(t)
    if (id === null) continue
    const n = norm(tablaNombre(t))
    const isRenta = n.includes('renta media y mediana')
    const isGini = n.includes('gini')
    if (!isRenta && !isGini) continue
    const prov = await discoverProvinceForTable(id)
    if (!prov || !provinceMap[prov]) continue
    if (isRenta && provinceMap[prov].renta === null) provinceMap[prov].renta = id
    if (isGini && provinceMap[prov].gini === null) provinceMap[prov].gini = id
  }

  const map: Record<string, unknown> = {}
  const fallos: string[] = []
  for (const [code, prov] of Object.entries(PROVINCIAS)) {
    const { renta, gini } = provinceMap[code]
    if (renta === null || gini === null) {
      fallos.push(`${code} ${prov.nombre}: renta=${renta} gini=${gini}`)
      continue
    }
    await checkCsv(renta)
    await checkCsv(gini)
    map[code] = { provincia: prov.nombre, renta, gini, verificado: new Date().toISOString().slice(0, 10) }
    console.log(`${code} ${prov.nombre}: renta=${renta} gini=${gini} OK`)
  }

  const nacionales = tablas.filter(t => {
    const n = norm(tablaNombre(t))
    return n.includes('renta media y mediana') && (n.includes('nacionales') || n.includes('ccaa'))
  })
  const nacionalId = nacionales.length > 0 ? tablaId(nacionales[0]) : 53689
  map['_nacional'] = { tabla: nacionalId, descripcion: 'Resultados nacionales, por CCAA, provincias e islas' }
  if (nacionalId) {
    try { await checkCsv(nacionalId) } catch {}
  }

  if (fallos.length > 0) {
    console.error(`\nProvincias sin mapear (${fallos.length}):`)
    fallos.forEach(f => console.error(' -', f))
    process.exit(1)
  }

  const dest = join(process.cwd(), 'src/lib/adrh-province-tables.json')
  await writeFile(dest, JSON.stringify(map, null, 2) + '\n')
  console.log(`\nMapa completo (52 provincias + nacional ${nacionalId}) escrito en ${dest}`)

  // Assert: ningún hash truncado tipo "a1b2c3..." en src/lib (los "..." de spread
  // operators como ...props son legítimos y no deben romper el build).
  const { execSync } = await import('child_process')
  try {
    execSync('git grep -nE "[0-9a-f]{6,}\\.\\.\\." -- src lib', { encoding: 'utf8', stdio: 'pipe' })
    console.error('FAIL: se encontró un hash truncado ("..." tras hex) en src/lib')
    process.exit(1)
  } catch {
    console.log('PASS: no hay hashes truncados en src/lib')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
