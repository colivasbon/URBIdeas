// Batch 1 dry-run con evidencia ejecutable – NO escribe en R2 ni Supabase.
// Uso:
//   npx tsx scripts/sync-economia-batch-dry-run.ts --dry-run   (descargas reales + evidence.json)
//   npx tsx scripts/sync-economia-batch-dry-run.ts --mock --dry-run  (valores MOCK, exit 0)
// No requiere Supabase ni R2. Descarga fuentes públicas a tmp/economia/,
// calcula las 8 anclas desde los ficheros, escribe tmp/economia/evidence.json
// e imprime `ANCLAS: X/8 PASS`. Exit 1 si alguna ancla falla o una descarga/parseo falla.
// AEAT queda pendiente (sin XLSX del operador): no bloquea, se documenta.

import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import * as XLSX from 'xlsx'
import { fetchDirceMunicipio } from '../src/lib/ine-dirce'

const UA = { 'User-Agent': 'URBIdeas/1.0 (+https://urbideas.com)' }
const TMP = join(process.cwd(), 'tmp/economia')
const MAP_PATH = join(process.cwd(), 'src/lib/adrh-province-tables.json')

const SEPE_PAGE =
  'https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas/datos-estadisticos/municipios/2026/julio.html'
const SEPE_BASE = 'https://www.sepe.es'
const TGSS_PAGE =
  'https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas/est8/est10/est305/c43ad8ea-fe79-4329-ac8e-e5758f3c4d7a/6609c55f-65e4-4e64-b1ab-8917fce27a84'
const DIRCE_URL = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/4721?nult=1'

interface Anchor {
  id: string
  indicador: string
  esperado: number
  obtenido: number | null
  tolerancia: number
  fichero: string
  fila: string
  sha256: string
  pass: boolean
}

interface MuestraValor {
  indicador: string
  anio: number | string
  obtenido: number | null
  unidad: string
  fichero: string
  fila: string
  sha256: string
  nota?: string
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function dl(url: string, dest: string): Promise<{ status: number; bytes: number; sha256: string; path: string }> {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`Descarga fallida ${url} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const h = sha256(buf)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  console.log(`[dl] ${url} → ${res.status} ${buf.length}B sha256:${h} ${new Date().toISOString()} → ${dest}`)
  return { status: res.status, bytes: buf.length, sha256: h, path: dest }
}

/** Número con formato español INE a number: miles con punto (15.036 → 15036),
 * decimales con coma (28,7 → 28.7). Sin coma, todo punto es miles. */
function parseEsNum(raw: string): number | null {
  const s = raw.trim()
  if (s === '' || s === '-' || s.toUpperCase() === 'ND' || s === '..' || s === ':') return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function within(obtenido: number | null, esperado: number, tol: number): boolean {
  if (obtenido === null) return false
  return Math.abs(obtenido - esperado) / esperado <= tol
}

interface AdrhHit { valor: number; fila: string }

function parseAdrhMunicipal(buf: Buffer, codigoIne: string, indicadorKw: string, anio: number): AdrhHit | null {
  // Los CSV jaxiT3 son UTF-8 con BOM (no latin1: la Í de "Índice" se corrompería)
  const txt = buf.toString('utf8').replace(/^\uFEFF/, '')
  const lines = txt.split(/\r?\n/)
  if (lines.length < 2) return null
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const normH = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const headers = lines[0].split(sep).map(normH)
  const iMuni = headers.findIndex((h) => h.includes('municip'))
  const iInd = headers.findIndex((h) => h.includes('indicador') || h.includes('indice'))
  const iPer = headers.findIndex((h) => h.includes('periodo') || h.includes('ano') || h.includes('anyo'))
  const iVal = headers.findIndex((h) => h.includes('total') || h.includes('valor'))
  const iDis = headers.findIndex((h) => h.includes('distrito'))
  const iSec = headers.findIndex((h) => h.includes('secci'))
  if (iMuni < 0 || iInd < 0 || iPer < 0 || iVal < 0) throw new Error('Cabecera ADRH inesperada')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cols = line.split(sep)
    if (iDis >= 0 && (cols[iDis] ?? '').trim() !== '') continue
    if (iSec >= 0 && (cols[iSec] ?? '').trim() !== '') continue
    const m = (cols[iMuni] ?? '').match(/^\s*(\d{5})\b/)
    if (!m || m[1] !== codigoIne) continue
    if (!(cols[iInd] ?? '').toLowerCase().includes(indicadorKw.toLowerCase())) continue
    if (parseInt((cols[iPer] ?? '').trim(), 10) !== anio) continue
    const valor = parseEsNum(cols[iVal] ?? '')
    if (valor === null) continue
    return { valor, fila: line.slice(0, 160) }
  }
  return null
}

async function main() {
  const isMock = process.argv.includes('--mock')
  if (isMock && process.argv.includes('--write')) {
    console.error('ERROR: --mock no puede combinarse con --write. Exit 1')
    process.exit(1)
  }
  if (isMock) {
    console.log('*** MOCK MODE – valores marcados MOCK, dryRun forzado ***')
    console.log('ANCLAS: 0/8 PASS (mock, sin validez)')
    return
  }

  await mkdir(TMP, { recursive: true })
  const map = JSON.parse(await readFile(MAP_PATH, 'utf8')) as Record<string, { renta: number; gini: number } & { tabla?: number }>
  const anchors: Anchor[] = []
  const fail: string[] = []
  const push = (a: Anchor) => {
    anchors.push(a)
    console.log(`[ancla ${a.pass ? 'PASS' : 'FAIL'}] ${a.id}: esperado=${a.esperado} obtenido=${a.obtenido} ← ${a.fichero} :: ${a.fila}`)
    if (!a.pass) fail.push(a.id)
  }

  // 1-2. ADRH nacional (tabla 53689) + Madrid provincia
  const nacId: number = (map['_nacional'] as { tabla: number }).tabla ?? 53689
  const nac = await dl(`https://www.ine.es/jaxiT3/files/t/csv_bd/${nacId}.csv`, join(TMP, `ADRH_${nacId}.csv`))
  const nacBuf = await readFile(nac.path)
  const nacTxt = nacBuf.toString('utf8').replace(/^\uFEFF/, '')
  const nacLines = nacTxt.split(/\r?\n/)
  const findNac = (match: (c: string[]) => boolean): { valor: number; fila: string } | null => {
    for (let i = 1; i < nacLines.length; i++) {
      const cols = nacLines[i].split('\t')
      if (cols.length < 7) continue
      if (!(cols[4] ?? '').toLowerCase().includes('renta neta media por persona')) continue
      if (parseInt((cols[5] ?? '').trim(), 10) !== 2023) continue
      if (!match(cols)) continue
      const v = parseEsNum(cols[6] ?? '')
      if (v === null) continue
      return { valor: v, fila: nacLines[i].slice(0, 160) }
    }
    return null
  }
  const nacTotal = findNac((c) => c[0].trim() === 'Total Nacional' && c[1].trim() === '' && c[2].trim() === '' && c[3].trim() === '')
  if (!nacTotal) throw new Error('Ancla ADRH nacional: fila Total Nacional 2023 no encontrada en 53689.csv')
  push({ id: 'adrh_nacional', indicador: 'renta_neta_media_persona', esperado: 15036, obtenido: nacTotal.valor, tolerancia: 0.01, fichero: nac.path, fila: nacTotal.fila, sha256: nac.sha256, pass: within(nacTotal.valor, 15036, 0.01) })
  const nacMadrid = findNac((c) => c[2].trim() === 'Madrid')
  if (!nacMadrid) throw new Error('Ancla ADRH Madrid: fila Provincias=Madrid 2023 no encontrada en 53689.csv')
  push({ id: 'adrh_madrid_prov', indicador: 'renta_neta_media_persona', esperado: 18142, obtenido: nacMadrid.valor, tolerancia: 0.01, fichero: nac.path, fila: nacMadrid.fila, sha256: nac.sha256, pass: within(nacMadrid.valor, 18142, 0.01) })

  // 3-6. Anclas municipales ADRH (renta neta persona 2023)
  const muniAnchors: { id: string; ine: string; prov: string; esperado: number }[] = [
    { id: 'pozuelo', ine: '28115', prov: '28', esperado: 30524 },
    { id: 'matadepera', ine: '08120', prov: '08', esperado: 26720 },
    { id: 'boadilla', ine: '28022', prov: '28', esperado: 26668 },
    { id: 'iznalloz', ine: '18105', prov: '18', esperado: 8399 },
  ]
  const adrhFiles: Record<string, { path: string; sha256: string }> = {}
  for (const a of muniAnchors) {
    const tableId: number | undefined = (map[a.prov] as { renta: number } | undefined)?.renta
    if (!tableId) throw new Error(`Mapa ADRH sin tabla de renta para provincia ${a.prov}`)
    if (!adrhFiles[a.prov]) {
      const d = await dl(`https://www.ine.es/jaxiT3/files/t/csv_bd/${tableId}.csv`, join(TMP, `ADRH_${tableId}.csv`))
      adrhFiles[a.prov] = { path: d.path, sha256: d.sha256 }
    }
    const buf = await readFile(adrhFiles[a.prov].path)
    const hit = parseAdrhMunicipal(buf, a.ine, 'Renta neta media por persona', 2023)
    if (!hit) throw new Error(`Ancla ${a.id}: fila municipal ${a.ine} 2023 no encontrada en tabla ${tableId}`)
    push({ id: a.id, indicador: 'renta_neta_media_persona', esperado: a.esperado, obtenido: hit.valor, tolerancia: 0.01, fichero: adrhFiles[a.prov].path, fila: hit.fila, sha256: adrhFiles[a.prov].sha256, pass: within(hit.valor, a.esperado, 0.01) })
  }

  // 7. DIRCE nacional 2025
  const dirce = await dl(DIRCE_URL, join(TMP, 'DIRCE_4721_nult1.json'))
  const dirceBuf = await readFile(dirce.path)
  const dirceJson = JSON.parse(dirceBuf.toString('utf8')) as { Nombre?: string; Data?: { Anyo?: number; Valor?: number }[] }[]
  if (!Array.isArray(dirceJson)) throw new Error('DIRCE 4721: respuesta no es array')
  const nacSerie = dirceJson.find((s) => (s.Nombre ?? '').trim() === 'Nacional. Total. Total de empresas. Total CNAE. Empresas.')
    ?? dirceJson.find((s) => (s.Nombre ?? '').trim() === 'Nacional. Total. Total.')
  if (!nacSerie) throw new Error('DIRCE 4721: serie nacional no encontrada')
  const nac2025 = (nacSerie.Data ?? []).find((d) => d.Anyo === 2025)?.Valor ?? null
  push({ id: 'dirce_nacional', indicador: 'empresas_total', esperado: 3310824, obtenido: nac2025, tolerancia: 0.01, fichero: dirce.path, fila: `Nombre="${(nacSerie.Nombre ?? '').trim()}" Anyo=2025`, sha256: dirce.sha256, pass: within(nac2025, 3310824, 0.01) })

  // 8. SEPE julio 2026: todas las provincias (suma nacional + prov. Madrid + municipios)
  const sepePageRes = await fetch(SEPE_PAGE, { headers: UA })
  if (!sepePageRes.ok) throw new Error(`SEPE julio.html → HTTP ${sepePageRes.status}`)
  const sepeHtml = await sepePageRes.text()
  const hrefs = [...sepeHtml.matchAll(/href="(\/HomeSepe\/dam\/jcr:[^"]*?\/MUNI_[A-Za-z0-9_]+\.xls)"/g)].map((m) => m[1])
  const uniqueHrefs = [...new Set(hrefs)]
  if (uniqueHrefs.length < 50) throw new Error(`SEPE: solo ${uniqueHrefs.length} XLS provinciales en julio.html (esperados 52+)`)
  console.log(`[sepe] ${uniqueHrefs.length} XLS provinciales detectados`)
  let sepeNacional = 0
  let sepeMadridProv: number | null = null
  const sepeMunis: Record<string, number | null> = {}
  const sepeSecretos: string[] = []
  const wantSepe = new Set(['28079', '02069', '02029', '28115', '28022', '08120', '18105'])
  for (const href of uniqueHrefs) {
    const fname = href.split('/').pop() ?? 'sepe.xls'
    const d = await dl(`${SEPE_BASE}${href}`, join(TMP, 'sepe', fname))
    const buf = await readFile(d.path)
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets['PARO'] ?? wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
    let provSum = 0
    for (const r of rows) {
      // Los XLS guardan el INE como número (1001 en vez de 01001): rellenar a 5 dígitos.
      // Ojo: celdas vacías ("".padStart → "00000") y filas de total provincial deben excluirse.
      const rawCode = typeof r[0] === 'number' ? String(Math.trunc(r[0])) : String(r[0] ?? '').trim()
      if (rawCode === '') continue
      const code = rawCode.padStart(5, '0')
      if (!/^\d{5}$/.test(code)) continue
      const raw = String(r[2] ?? '').trim()
      if (raw === '<5' || raw === '< 5') { sepeSecretos.push(code); continue }
      const v = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(v) || v < 0) continue
      provSum += v
      sepeNacional += v
      if (wantSepe.has(code) && sepeMunis[code] === undefined) {
        sepeMunis[code] = v
        // guarda fila de evidencia (primera aparición)
        ;(sepeMunis as Record<string, unknown>)[`${code}__fila`] = JSON.stringify(r.slice(0, 4))
        ;(sepeMunis as Record<string, unknown>)[`${code}__file`] = d.path
        ;(sepeMunis as Record<string, unknown>)[`${code}__sha`] = d.sha256
      }
    }
    if (/MADRID/i.test(fname)) sepeMadridProv = provSum
  }
  if (sepeMadridProv === null) throw new Error('SEPE: fichero MUNI_MADRID_0726.xls no encontrado')
  push({ id: 'sepe_madrid_prov', indicador: 'paro_registrado', esperado: 273631, obtenido: sepeMadridProv, tolerancia: 0.01, fichero: join(TMP, 'sepe', 'MUNI_MADRID_0726.xls'), fila: 'suma columna TOTAL sheet PARO', sha256: 'ver evidence.stats.sepe_sha', pass: within(sepeMadridProv, 273631, 0.01) })

  // Extras (también bloquean exit): SEPE 28079 y TGSS nacional
  const sepe28079 = sepeMunis['28079'] ?? null
  const extras: Anchor[] = []
  extras.push({ id: 'sepe_28079', indicador: 'paro_registrado', esperado: 131527, obtenido: sepe28079, tolerancia: 0.02, fichero: String((sepeMunis as Record<string, unknown>)['28079__file'] ?? ''), fila: String((sepeMunis as Record<string, unknown>)['28079__fila'] ?? 'no encontrada'), sha256: String((sepeMunis as Record<string, unknown>)['28079__sha'] ?? ''), pass: within(sepe28079, 131527, 0.02) })

  // 9. TGSS julio 2026 (municipal) + referencia nacional oficial del mismo mes
  const tgssPageRes = await fetch(TGSS_PAGE, { headers: UA })
  if (!tgssPageRes.ok) throw new Error(`TGSS página → HTTP ${tgssPageRes.status}`)
  const tgssHtml = await tgssPageRes.text()
  const tgssHref = tgssHtml.match(/href="(\/descarga\/es\/Muni072026)"/)?.[1]
  if (!tgssHref) throw new Error('TGSS: href /descarga/es/Muni072026 no encontrado en la página oficial')
  const tgssUrl = `https://www.seg-social.es${tgssHref}`
  const tgss = await dl(tgssUrl, join(TMP, 'Muni072026.xlsx'))
  // Referencia nacional oficial julio 2026 (fichero mensual TGSS, Tabla_3_6, PERIODO2=20260731, SISTEMA)
  const tgssNacPage = 'https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas/EST8/EST10/EST305/EST306'
  const tgssNacPageRes = await fetch(tgssNacPage, { headers: UA })
  if (!tgssNacPageRes.ok) throw new Error(`TGSS nacional página → HTTP ${tgssNacPageRes.status}`)
  const tgssNacHtml = await tgssNacPageRes.text()
  const tgssNacHref = tgssNacHtml.match(/href="(\/wps\/wcm\/connect\/wss\/[^"]*Afiliaci[^"]*2026[^"]*?\.xlsx[^"]*)"/)?.[1]
  if (!tgssNacHref) throw new Error('TGSS: href del fichero nacional 2026 no encontrado')
  const tgssNacUrl = `https://www.seg-social.es${tgssNacHref.replace(/&amp;/g, '&')}`
  const tgssNac = await dl(tgssNacUrl, join(TMP, 'TGSS_nacional_2026.xlsx'))
  const tgssNacBuf = await readFile(tgssNac.path)
  const tgssNacWb = XLSX.read(tgssNacBuf, { type: 'buffer' })
  const tgssNacRows = XLSX.utils.sheet_to_json(tgssNacWb.Sheets['Tabla_3_6'], { header: 1, raw: true }) as unknown[][]
  let tgssNacTotal: number | null = null
  {
    let s = 0
    for (const r of tgssNacRows) {
      if (String(r[0]) === '20260731' && r[6] === 'SISTEMA' && typeof r[8] === 'number') s += r[8] as number
    }
    tgssNacTotal = s > 0 ? s : null
  }
  if (tgssNacTotal === null) throw new Error('TGSS nacional: suma julio 2026 vacía en Tabla_3_6')
  const tgssBuf = await readFile(tgss.path)
  const tgssWb = XLSX.read(tgssBuf, { type: 'buffer' })
  const tgssSheet = tgssWb.Sheets['ParaExportar'] ?? tgssWb.Sheets[tgssWb.SheetNames[0]]
  const tgssRows = XLSX.utils.sheet_to_json(tgssSheet, { header: 1 }) as unknown[][]
  let tgssNacional = 0
  let tgssLower = 0
  const tgssMunis: Record<string, { valor: number | null; secreto: boolean; fila: string }> = {}
  const wantTgss = new Set(['28079', '02069', '02029'])
  for (const r of tgssRows) {
    const m = String(r[1] ?? '').match(/^\s*(\d{5})\b/)
    if (!m) continue
    const code = m[1]
    const raw = String(r[9] ?? '').trim()
    if (raw === '<5' || raw === '< 5') {
      tgssLower += 4
      if (wantTgss.has(code) && !tgssMunis[code]) tgssMunis[code] = { valor: null, secreto: true, fila: JSON.stringify((r as unknown[]).slice(0, 3)) }
      continue
    }
    if (raw.startsWith('>=')) {
      const v = Number(raw.slice(2).replace(/\./g, '').replace(',', '.'))
      if (Number.isFinite(v)) { tgssNacional += v; tgssLower += 4 }
      continue
    }
    const v = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v < 0 || raw === '') continue
    tgssNacional += v
    if (wantTgss.has(code) && !tgssMunis[code]) tgssMunis[code] = { valor: v, secreto: false, fila: JSON.stringify((r as unknown[]).slice(0, 3)) }
  }
  // Referencia: total nacional oficial julio 2026 del fichero mensual TGSS (no la
  // estimación ≈22,5 M, que queda invalidada por el dato oficial).
  extras.push({ id: 'tgss_nacional', indicador: 'afiliacion_total', esperado: tgssNacTotal, obtenido: tgssNacional, tolerancia: 0.02, fichero: tgss.path, fila: `suma columna TOTAL (+cota inferior <5: ${tgssLower}); referencia ${tgssNac.path} Tabla_3_6 PERIODO2=20260731`, sha256: tgss.sha256, pass: within(tgssNacional, tgssNacTotal, 0.02) })

  // Muestra con trazabilidad (renta hogar + Gini desde sus tablas; empresas vía DIRCE tv=; AEAT pendiente sin fichero)
  // Albacete (02) no está en las anclas: descargar su renta para la muestra 02069/02029
  if (!adrhFiles['02']) {
    const albRenta: number = (map['02'] as { renta: number }).renta
    if (!albRenta) throw new Error('Mapa ADRH sin tabla de renta para provincia 02')
    const d = await dl(`https://www.ine.es/jaxiT3/files/t/csv_bd/${albRenta}.csv`, join(TMP, `ADRH_${albRenta}.csv`))
    adrhFiles['02'] = { path: d.path, sha256: d.sha256 }
  }
  const giniTables: Record<string, number> = {
    '28': (map['28'] as { gini: number }).gini,
    '02': (map['02'] as { gini: number }).gini,
  }
  const giniFiles: Record<string, { path: string; sha256: string }> = {}
  for (const [prov, id] of Object.entries(giniTables)) {
    const d = await dl(`https://www.ine.es/jaxiT3/files/t/csv_bd/${id}.csv`, join(TMP, `ADRH_${id}.csv`))
    giniFiles[prov] = { path: d.path, sha256: d.sha256 }
  }
  const giniVal = async (prov: string, ine: string): Promise<{ valor: number | null; fila: string; estado: string }> => {
    const buf = await readFile(giniFiles[prov].path)
    const hit = parseAdrhMunicipal(buf, ine, 'Gini', 2023)
    if (!hit) return { valor: null, fila: `sin fila Gini 2023 para ${ine} (posible <100 hab. → sin_cobertura)`, estado: 'sin_cobertura' }
    return { valor: hit.valor, fila: hit.fila, estado: 'actualizado' }
  }
  const rentaHogar = async (prov: string, ine: string): Promise<{ valor: number | null; fila: string }> => {
    const buf = await readFile(adrhFiles[prov].path)
    const hit = parseAdrhMunicipal(buf, ine, 'Renta neta media por hogar', 2023)
    return { valor: hit?.valor ?? null, fila: hit?.fila ?? `sin fila renta hogar 2023 para ${ine}` }
  }
  const dirceTotal = async (ine: string): Promise<{ valor: number | null; fila: string }> => {
    try {
      const d = await fetchDirceMunicipio(ine)
      const total = d.grupos.AAA?.filter((p) => p.anio === 2025).pop()?.valor ?? null
      return { valor: total, fila: `Tempus3 DATOS_TABLA/4721?tv=${d.sourceUrl.split('tv=')[1] ?? ''} serie AAA Anyo=2025` }
    } catch (e) {
      return { valor: null, fila: `DIRCE no disponible: ${(e as Error).message}` }
    }
  }
  const AEAT_PENDIENTE = 'pendiente: AEAT EDM 2023 requiere XLSX del operador en tmp/economia/Estadistica_declarantes_IRPF_2023.xlsx (https://sede.agenciatributaria.gob.es/Sede/datosabiertos/catalogo/hacienda/Estadistica_de_los_declarantes_del_IRPF_por_municipios.shtml). Renta bruta media POR DECLARACIÓN (incluye conjuntas; no es renta por persona ni por hogar) + nº de titulares.'
  const [g28079, g02069, g02029, h28079, h02069, h02029, e28079, e02069, e02029] = await Promise.all([
    giniVal('28', '28079'), giniVal('02', '02069'), giniVal('02', '02029'),
    rentaHogar('28', '28079'), rentaHogar('02', '02069'), rentaHogar('02', '02029'),
    dirceTotal('28079'), dirceTotal('02069'), dirceTotal('02029'),
  ])
  const sepeInfo = (code: string) => ({
    fichero: String((sepeMunis as Record<string, unknown>)[`${code}__file`] ?? ''),
    fila: String((sepeMunis as Record<string, unknown>)[`${code}__fila`] ?? 'sin fila'),
    sha: String((sepeMunis as Record<string, unknown>)[`${code}__sha`] ?? ''),
  })
  const muestra: Record<string, MuestraValor[]> = {
    '28079': [
      { indicador: 'renta_neta_media_persona', anio: 2023, obtenido: (await (async () => { const b = await readFile(adrhFiles['28'].path); return parseAdrhMunicipal(b, '28079', 'Renta neta media por persona', 2023)?.valor ?? null })()), unidad: 'euros', fichero: adrhFiles['28'].path, fila: 'fila municipal 28079 Distrito/Sección vacíos, tabla 31097', sha256: adrhFiles['28'].sha256 },
      { indicador: 'renta_neta_media_hogar', anio: 2023, obtenido: h28079.valor, unidad: 'euros', fichero: adrhFiles['28'].path, fila: h28079.fila, sha256: adrhFiles['28'].sha256 },
      { indicador: 'gini', anio: 2023, obtenido: g28079.valor, unidad: 'puntos', fichero: giniFiles['28'].path, fila: g28079.fila, sha256: giniFiles['28'].sha256 },
      { indicador: 'empresas_total', anio: 2025, obtenido: e28079.valor, unidad: 'empresas', fichero: 'Tempus3 DATOS_TABLA/4721', fila: e28079.fila, sha256: '' },
      { indicador: 'paro_registrado', anio: '2026-07', obtenido: sepeMunis['28079'] ?? null, unidad: 'personas', fichero: sepeInfo('28079').fichero, fila: sepeInfo('28079').fila, sha256: sepeInfo('28079').sha },
      { indicador: 'afiliacion_total', anio: '2026-07', obtenido: tgssMunis['28079']?.valor ?? null, unidad: 'personas', fichero: tgss.path, fila: tgssMunis['28079']?.fila ?? '', sha256: tgss.sha256 },
      { indicador: 'irpf_renta_bruta_media', anio: 2023, obtenido: null, unidad: 'euros', fichero: '', fila: AEAT_PENDIENTE, sha256: '', nota: 'pendiente' },
    ],
    '02069': [
      { indicador: 'renta_neta_media_persona', anio: 2023, obtenido: (await (async () => { const b = await readFile(adrhFiles['02'].path); return parseAdrhMunicipal(b, '02069', 'Renta neta media por persona', 2023)?.valor ?? null })()), unidad: 'euros', fichero: adrhFiles['02'].path, fila: 'fila municipal 02069, tabla 30656', sha256: adrhFiles['02'].sha256 },
      { indicador: 'renta_neta_media_hogar', anio: 2023, obtenido: h02069.valor, unidad: 'euros', fichero: adrhFiles['02'].path, fila: h02069.fila, sha256: adrhFiles['02'].sha256 },
      { indicador: 'gini', anio: 2023, obtenido: g02069.valor, unidad: 'puntos', fichero: giniFiles['02'].path, fila: g02069.fila, sha256: giniFiles['02'].sha256 },
      { indicador: 'empresas_total', anio: 2025, obtenido: e02069.valor, unidad: 'empresas', fichero: 'Tempus3 DATOS_TABLA/4721', fila: e02069.fila, sha256: '' },
      { indicador: 'paro_registrado', anio: '2026-07', obtenido: sepeMunis['02069'] ?? null, unidad: 'personas', fichero: sepeInfo('02069').fichero, fila: sepeInfo('02069').fila, sha256: sepeInfo('02069').sha },
      { indicador: 'afiliacion_total', anio: '2026-07', obtenido: tgssMunis['02069']?.valor ?? null, unidad: 'personas', fichero: tgss.path, fila: tgssMunis['02069']?.fila ?? '', sha256: tgss.sha256 },
      { indicador: 'irpf_renta_bruta_media', anio: 2023, obtenido: null, unidad: 'euros', fichero: '', fila: AEAT_PENDIENTE, sha256: '', nota: 'pendiente' },
    ],
    '02029': [
      { indicador: 'renta_neta_media_persona', anio: 2023, obtenido: (await (async () => { const b = await readFile(adrhFiles['02'].path); return parseAdrhMunicipal(b, '02029', 'Renta neta media por persona', 2023)?.valor ?? null })()), unidad: 'euros', fichero: adrhFiles['02'].path, fila: 'fila municipal 02029 Chinchilla de Monte-Aragón, tabla 30656', sha256: adrhFiles['02'].sha256 },
      { indicador: 'renta_neta_media_hogar', anio: 2023, obtenido: h02029.valor, unidad: 'euros', fichero: adrhFiles['02'].path, fila: h02029.fila, sha256: adrhFiles['02'].sha256 },
      { indicador: 'gini', anio: 2023, obtenido: g02029.valor, unidad: 'puntos', fichero: giniFiles['02'].path, fila: g02029.fila, sha256: giniFiles['02'].sha256 },
      { indicador: 'empresas_total', anio: 2025, obtenido: e02029.valor, unidad: 'empresas', fichero: 'Tempus3 DATOS_TABLA/4721', fila: e02029.fila, sha256: '' },
      { indicador: 'paro_registrado', anio: '2026-07', obtenido: sepeMunis['02029'] ?? null, unidad: 'personas', fichero: sepeInfo('02029').fichero, fila: sepeInfo('02029').fila, sha256: sepeInfo('02029').sha },
      { indicador: 'afiliacion_total', anio: '2026-07', obtenido: tgssMunis['02029']?.valor ?? null, unidad: 'personas', fichero: tgss.path, fila: tgssMunis['02029']?.fila ?? '', sha256: tgss.sha256, nota: tgssMunis['02029']?.secreto ? 'sin_cobertura (<5 → null+flag)' : '' },
      { indicador: 'irpf_renta_bruta_media', anio: 2023, obtenido: null, unidad: 'euros', fichero: '', fila: 'sin_cobertura: AEAT EDM solo municipios >1.000 hab. territorio común (02029 por debajo del umbral); nunca 0', sha256: '', nota: 'sin_cobertura' },
    ],
  }

  const evidence = {
    generated_at: new Date().toISOString(),
    dry_run: true,
    anchors,
    extras,
    muestra,
    stats: {
      sepe_provincias: uniqueHrefs.length,
      sepe_nacional: sepeNacional,
      sepe_secretos_lt5: sepeSecretos.length,
      tgss_nacional: tgssNacional,
      tgss_cota_inferior_lt5: tgssLower,
    },
  }
  await writeFile(join(TMP, 'evidence.json'), JSON.stringify(evidence, null, 2))
  const passed = anchors.filter((a) => a.pass).length
  console.log(`\nANCLAS: ${passed}/8 PASS`)
  for (const e of extras) console.log(`[extra ${e.pass ? 'PASS' : 'FAIL'}] ${e.id}: esperado=${e.esperado} obtenido=${e.obtenido}`)
  const allOk = fail.length === 0 && extras.every((e) => e.pass)
  if (!allOk) {
    console.error(`\nFAIL: ${fail.join(', ')}${extras.some((e) => !e.pass) ? ' + extras' : ''}. Exit 1`)
    process.exit(1)
  }
  console.log('\nDry-run con evidencia real completado. Sin escrituras en R2/Supabase.')
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
