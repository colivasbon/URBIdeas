// Sincronización del Directorio de Bibliotecas Públicas de Castilla-La Mancha
// (SOCideas · bloque Sociocultural · equipamientos)
//
// Uso:
//   npx tsx scripts/sync-bibliotecas-clm.ts                # DRY-RUN (no escribe nada)
//   npx tsx scripts/sync-bibliotecas-clm.ts --write        # escritura real
//   npx tsx scripts/sync-bibliotecas-clm.ts --only=02007,16016  # limitar municipios
//
// Fuente (verificada en vivo 2026-09-28):
//   https://datosabiertos.castillalamancha.es/dataset/directorio-de-bibliotecas-de-castilla-la-mancha
//   CSV: Bibliotecas_públicas_2025.csv (62.544 bytes, delimitador ';', ISO-8859-1)
//
// CLAVE TERRITORIAL: nombre de municipio + provincia → código INE (5 dígitos).
// NUNCA join por nombre solo. Si la combinación no es unívoca, se descarta.
//
// Seguridad: si la fuente remota falla, NO se inventan datos. Se registra el error.
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

config({ path: '.env.local' })

const pExecFile = promisify(execFile)

const CSV_URL =
  'https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/Bibliotecas_p%C3%BAblicas_2025.csv'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const hoy = (): string => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Utilidades HTTP
// ---------------------------------------------------------------------------

async function conReintentos<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimo: unknown
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      await new Promise((r) => setTimeout(r, 600 + i * 900))
    }
  }
  throw ultimo
}

async function curlGet(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; url: string; body: ArrayBuffer; detalle: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bib-'))
  const archivo = path.join(dir, 'body.bin')
  try {
    const { stdout } = await pExecFile(
      'curl.exe',
      [
        '-sS', '-L',
        '--max-time', String(Math.max(Math.ceil(timeoutMs / 1000), 5)),
        '-A', UA,
        '-o', archivo,
        '-w', '%{http_code}\t%{url_effective}',
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs + 5000 },
    )
    const [codigo, urlFinal] = stdout.trim().split('\t')
    const buf = await readFile(archivo)
    const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    return {
      status: Number(codigo) || 0,
      url: urlFinal || url,
      body,
      detalle: `curl ${codigo}`,
    }
  } finally {
    await unlink(archivo).catch(() => undefined)
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function httpGet(
  url: string,
  timeoutMs = 60000,
): Promise<{ status: number; url: string; body: ArrayBuffer; detalle: string }> {
  try {
    return await conReintentos(async () => {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, accept: '*/*' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
      const body = await res.arrayBuffer()
      return { status: res.status, url: res.url, body, detalle: `fetch ${res.status}` }
    })
  } catch (e) {
    console.log(`    fetch falló (${e instanceof Error ? e.message : String(e)}) → curl`)
    const c = await curlGet(url, timeoutMs)
    if (c.status < 200 || c.status >= 300) throw new Error(`HTTP ${c.status} en ${url}`)
    return c
  }
}

// ---------------------------------------------------------------------------
// Caché local de descargas (tmp/bib-cache, gitignored)
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join('tmp', 'bib-cache')

async function guardarCache(clave: string, body: ArrayBuffer): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(path.join(CACHE_DIR, clave), Buffer.from(body))
  } catch {
    // La caché es best-effort
  }
}

async function leerCache(clave: string): Promise<{ body: ArrayBuffer; fecha: string } | null> {
  try {
    const archivo = path.join(CACHE_DIR, clave)
    const buf = await readFile(archivo)
    const stat = await import('node:fs/promises').then((m) => m.stat(archivo))
    return {
      body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      fecha: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
    }
  } catch {
    return null
  }
}

async function descargar(
  url: string,
  claveCache: string,
  timeoutMs: number,
): Promise<{ status: number; url: string; body: ArrayBuffer; detalle: string; origen: 'remota' | 'copia_local' }> {
  try {
    const r = await httpGet(url, timeoutMs)
    await guardarCache(claveCache, r.body)
    return { ...r, origen: 'remota' }
  } catch (e) {
    const detalleError = e instanceof Error ? e.message : String(e)
    const c = await leerCache(claveCache)
    if (!c) throw e
    console.log(`    remoto no disponible (${detalleError}) → copia local del ${c.fecha}`)
    return {
      status: 0,
      url,
      body: c.body,
      detalle: `remoto no disponible (${detalleError}) · copia local descargada el ${c.fecha}`,
      origen: 'copia_local',
    }
  }
}

// ---------------------------------------------------------------------------
// CSV / normalización
// ---------------------------------------------------------------------------

function decodeTexto(buf: ArrayBuffer): { text: string; encoding: string } {
  const b = Buffer.from(buf)
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8' }
  } catch {
    try {
      return { text: new TextDecoder('iso-8859-1').decode(b), encoding: 'iso-8859-1' }
    } catch {
      return { text: b.toString('latin1'), encoding: 'latin1' }
    }
  }
}

function parseCsv(texto: string, delimitador: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"') {
      entreComillas = true
    } else if (c === delimitador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else if (c !== '\r') {
      campo += c
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ''))
}

function normalizar(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'o')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function limpiar(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t
}

// ---------------------------------------------------------------------------
// Índice de municipios
// ---------------------------------------------------------------------------

interface IndiceMunicipios {
  porTerritorio: Map<string, Set<string>>
  porNombre: Map<string, { ine: string; provincia: string }[]>
  codigosIne: Set<string>
}

async function cargarIndice(sb: SupabaseClient): Promise<IndiceMunicipios> {
  const porTerritorio = new Map<string, Set<string>>()
  const porNombre = new Map<string, { ine: string; provincia: string }[]>()
  const codigosIne = new Set<string>()

  let desde = 0
  for (;;) {
    const { data, error } = await sb
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias(nombre)')
      .range(desde, desde + 999)
    if (error) throw new Error(`municipios: ${error.message}`)
    for (const m of data ?? []) {
      const ine = String(m.codigo_ine).trim()
      const nombre = String(m.nombre)
      codigosIne.add(ine)
      const prov = Array.isArray(m.provincia) ? m.provincia[0] : m.provincia
      const provincia = (prov as { nombre?: string } | null)?.nombre ?? ''
      if (provincia) {
        const k = `${normalizar(nombre)}|${normalizar(provincia)}`
        const previo = porTerritorio.get(k)
        if (previo) previo.add(ine)
        else porTerritorio.set(k, new Set([ine]))
      }
      const nk = normalizar(nombre)
      porNombre.set(nk, [...(porNombre.get(nk) ?? []), { ine, provincia }])
    }
    if (!data || data.length < 1000) break
    desde += 1000
  }
  return { porTerritorio, porNombre, codigosIne }
}

function resolverIne(
  indice: IndiceMunicipios,
  municipio: string | null,
  provincia: string | null,
): string | null {
  const mun = limpiar(municipio)
  if (!mun) return null
  const provinciaN = provincia ? normalizar(provincia) : ''
  const candidatosNombre = [mun, ...mun.split(/[\/·,]/).map((s) => s.trim())].filter(Boolean)
  if (provinciaN) {
    for (const cand of candidatosNombre) {
      const exactos = indice.porTerritorio.get(`${normalizar(cand)}|${provinciaN}`)
      if (exactos && exactos.size === 1) return [...exactos][0]
      if (exactos && exactos.size > 1) return null
    }
    return null
  }
  for (const cand of candidatosNombre) {
    const genericos = indice.porNombre.get(normalizar(cand))
    if (genericos && genericos.length === 1) return genericos[0].ine
    if (genericos && genericos.length > 1) return null
  }
  return null
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface BibliotecaRow {
  codigo_ine: string | null
  nombre_municipio: string | null
  provincia: string | null
  nombre_biblioteca: string
  direccion: string | null
  codigo_postal: string | null
  telefono: string | null
  email: string | null
  fuente_url: string
  fuente_fecha: string
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const escribir = args.includes('--write')
  const onlyArg = args.find((a) => a.startsWith('--only='))
  const solo = onlyArg
    ? new Set(
        onlyArg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const fecha = hoy()

  console.log(`=== SOCideas · sync-bibliotecas-clm · ${escribir ? 'WRITE' : 'DRY-RUN'} · ${fecha} ===`)
  if (solo) console.log(`Municipios filtrados: ${[...solo].join(', ')}`)

  console.log('Cargando índice de municipios…')
  let indice: IndiceMunicipios
  try {
    indice = await cargarIndice(sb)
    console.log(`  municipios: ${indice.porNombre.size} nombres · ${indice.codigosIne.size} códigos INE`)
  } catch (e) {
    console.error(`  ERROR índice: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }

  console.log('\nDescargando CSV de bibliotecas…')
  const dl = await descargar(CSV_URL, 'bibliotecas-clm.csv', 120000)
  const { body } = dl
  const httpStatus = dl.status
  const httpUrl = dl.url
  const origen = dl.origen
  const { text, encoding } = decodeTexto(body)
  const filas = parseCsv(text, ';')
  console.log(`  sonda: ${dl.detalle}`)
  console.log(`  origen: ${origen}`)
  console.log(`  encoding: ${encoding}`)
  console.log(`  filas leídas: ${Math.max(filas.length - 1, 0)}`)

  const cab = filas[0] ?? []
  const col = (n: string): number => cab.findIndex((h) => normalizar(h) === normalizar(n))
  const iNombre = col('Nombre biblioteca')
  const iDireccion = col('Dirección')
  const iCP = col('Código postal')
  const iMunicipio = col('Municipio')
  const iProvincia = col('Provincia')
  const iTelefono = col('Nº de teléfono')
  const iEmail = col('Dirección de correo electrónico')

  const faltan = [iNombre, iMunicipio, iProvincia].filter((i) => i < 0)
  if (faltan.length) {
    console.error(`  ERROR: cabecera inesperada (${cab.join(' | ').slice(0, 200)})`)
    process.exit(1)
  }

  const rows: BibliotecaRow[] = []
  const errores: string[] = []
  for (const f of filas.slice(1)) {
    const nombre = limpiar(f[iNombre])
    if (!nombre) {
      errores.push('fila sin nombre de biblioteca')
      continue
    }
    const municipio = limpiar(f[iMunicipio])
    const provincia = limpiar(f[iProvincia])
    const ine = resolverIne(indice, municipio, provincia)
    if (!ine) {
      errores.push(`sin INE: ${municipio}/${provincia}`)
      continue
    }
    if (solo && !solo.has(ine)) continue
    rows.push({
      codigo_ine: ine,
      nombre_municipio: municipio,
      provincia,
      nombre_biblioteca: nombre,
      direccion: limpiar(f[iDireccion]),
      codigo_postal: limpiar(f[iCP]),
      telefono: limpiar(f[iTelefono]),
      email: limpiar(f[iEmail]),
      fuente_url: httpUrl,
      fuente_fecha: fecha,
    })
  }

  console.log(`  filas válidas: ${rows.length} · con INE: ${rows.filter((r) => r.codigo_ine).length} · errores: ${errores.length}`)
  if (errores.length) console.log(`  primeros errores: ${errores.slice(0, 5).join(' | ')}`)

  // Resumen por municipio
  const porMunicipio = new Map<string, number>()
  for (const r of rows) {
    porMunicipio.set(r.codigo_ine!, (porMunicipio.get(r.codigo_ine!) ?? 0) + 1)
  }
  console.log('\n  Biblioteca por municipio:')
  for (const [ine, total] of [...porMunicipio.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nombre = rows.find((r) => r.codigo_ine === ine)?.nombre_municipio ?? '?'
    console.log(`    ${ine} ${nombre}: ${total}`)
  }

  if (!escribir) {
    console.log('\nDRY-RUN: no se ha escrito nada en Supabase. Repite con --write para insertar.')
    return
  }

  // Escritura
  console.log('\n--- Escritura en Supabase ---')

  // Borrar solo los municipios que se van a insertar (o todos si no hay filtro)
  const { error: delError } = solo
    ? await sb.from('bibliotecas_clm').delete().in('codigo_ine', [...solo])
    : await sb.from('bibliotecas_clm').delete().gte('id', 0)
  if (delError) console.error(`  ERROR borrado previo: ${delError.message}`)

  const LOTE = 500
  let escritas = 0
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE)
    const { error } = await sb.from('bibliotecas_clm').insert(lote)
    if (error) console.error(`  ERROR insert lote ${i / LOTE + 1}: ${error.message}`)
    else escritas += lote.length
  }
  console.log(`  escritas: ${escritas}/${rows.length}`)

  // Read-back
  console.log('\n--- Read-back ---')
  const { data: rb, error: rbError } = await sb
    .from('bibliotecas_clm')
    .select('codigo_ine, nombre_municipio, nombre_biblioteca')
    .in('codigo_ine', solo ? [...solo] : ['02007', '16016'])
  if (rbError) console.error(`  ERROR read-back: ${rbError.message}`)
  else {
    console.log(`  filas en BD: ${rb.length}`)
    for (const r of rb.slice(0, 10)) {
      console.log(`    ${r.codigo_ine} ${r.nombre_municipio}: ${r.nombre_biblioteca}`)
    }
  }

  console.log('\n=== CARGA COMPLETADA ===')
}

void main()
