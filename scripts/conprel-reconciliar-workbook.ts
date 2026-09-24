/**
 * RECONCILIACIÓN CONPREL Access ↔ workbook oficial — solo lectura.
 *
 * Misión Agente A/contable (feat/conprel-contabilidad): cruza los CSVs extraídos
 * de los .accdb definitivos con los workbooks Excel oficiales de la misma familia
 * (EP2025Cxx = presupuestos 2025 definitivos · EL2024Cxx = liquidaciones 2024
 * definitivas · LD2024 = liquidación nacional · EP2025_def_total = presupuesto
 * nacional) en una muestra DIVERSA de municipios, y descompone el hueco
 * Access↔workbook del 97,82 % (no firmantes + restos).
 *
 * Entradas (TEMP/%TEMP%/opencode/conprel — fuera del repo):
 *   csv/loader_inv_ppto2025.csv   codente|estado|id|idente|nombreente|nsec|poblacion
 *   csv/loader_eco_ppto2025.csv   idente|cdcta|tipreig|importe
 *   csv/loader_inv_liq2024.csv    (idem inv)
 *   csv/loader_eco_liq2024.csv    idente|cdcta|tipreig|imported|importer|importel|importec
 *   csv/loader_eco_cons_ppto2025.csv / loader_eco_cons_liq2024.csv
 *                                (tb_economica_cons por id — grano consolidado = workbook)
 *   csv/pd2025_nonsigners.csv     relación de no firmantes (hoja Relación EP2025)
 *   EP2025C01..19.xlsx | EP2025_def_01.tmp (01) | EP2025_def_total.tmp (nacional)
 *   EL2024C01..19.xlsx | EL2024_def_01.tmp (01) | LD2024.tmp (nacional)
 *   EL2025CT.xlsx                 (diagnóstico de año: es liquidación 2025, NO 2024)
 *
 * Salidas:
 *   tmp/conprel-reconciliacion/report-<ts>.json
 *   tmp/conprel-reconciliacion/comparisons-<ts>.csv
 *   tmp/conprel-reconciliacion/gap-nonsigners-<ts>.csv
 *   resumen por consola
 *
 * Uso: npx tsx scripts/conprel-reconciliar-workbook.ts
 * NO escribe R2/Supabase ni publica nada. Tolera ausencia de workbooks (los omite
 * y lo registra en el informe).
 */
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'

const CONPREL_DIR = path.join(process.env.TEMP ?? '.', 'opencode', 'conprel')
const CSV_DIR = path.join(CONPREL_DIR, 'csv')
const OUT_DIR = path.join(process.cwd(), 'tmp', 'conprel-reconciliacion')

const TOL_EUR = 0.01 // euros (redondeos de coma flotante del workbook)
const CAPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const TIPS = ['I', 'G'] as const
type Tip = (typeof TIPS)[number]

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function parseEs(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim().replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function loadPipe(file: string): Record<string, string>[] {
  const raw = fs.readFileSync(path.join(CSV_DIR, file), 'utf8').replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const hdr = lines[0].split('|').map((h) => h.trim())
  return lines.slice(1).map((l) => {
    const p = l.split('|')
    const o: Record<string, string> = {}
    hdr.forEach((h, i) => {
      o[h] = (p[i] ?? '').trim()
    })
    return o
  })
}

function loadQuotedCsv(file: string): Record<string, string>[] {
  const raw = fs.readFileSync(path.join(CSV_DIR, file), 'utf8').replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return []
  const parse = (l: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (inQ) {
        if (ch === '"') {
          if (l[i + 1] === '"') {
            cur += '"'
            i++
          } else inQ = false
        } else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const hdr = parse(lines[0]).map((h) => h.replace(/^﻿/, '').trim())
  return lines.slice(1).map((l) => {
    const p = parse(l)
    const o: Record<string, string> = {}
    hdr.forEach((h, i) => {
      o[h] = (p[i] ?? '').trim()
    })
    return o
  })
}

interface InvRow {
  codente: string
  estado: string
  id: string
  idente: string
  nombreente: string
  prefix: string
  tipo: string
}

interface EcoPpto {
  idente: string
  cdcta: string
  tipreig: Tip
  importe: number
}
interface EcoLiq {
  idente: string
  cdcta: string
  tipreig: Tip
  imported: number
  importer: number
  importel: number
  importec: number
}

/** Sumas por capítulo (1..9) y tipreig para un idente. Faltante = 0. */
type CapMap = Record<string, number> // clave `${tip}${cap}`

function emptyCaps(): CapMap {
  const m: CapMap = {}
  for (const t of TIPS) for (const c of CAPS) m[`${t}${c}`] = 0
  return m
}

function buildPptoIndex(eco: EcoPpto[]): Map<string, CapMap> {
  const idx = new Map<string, CapMap>()
  for (const r of eco) {
    if (!/^[1-9]$/.test(r.cdcta)) continue
    let m = idx.get(r.idente)
    if (!m) {
      m = emptyCaps()
      idx.set(r.idente, m)
    }
    m[`${r.tipreig}${r.cdcta}`] += r.importe
  }
  return idx
}

const LIQ_MAGS = ['imported', 'importer', 'importel', 'importec'] as const
type LiqMag = (typeof LIQ_MAGS)[number]

function buildLiqIndex(eco: EcoLiq[]): Map<string, Record<LiqMag, CapMap>> {
  const idx = new Map<string, Record<LiqMag, CapMap>>()
  for (const r of eco) {
    if (!/^[1-9]$/.test(r.cdcta)) continue
    let m = idx.get(r.idente)
    if (!m) {
      m = { imported: emptyCaps(), importer: emptyCaps(), importel: emptyCaps(), importec: emptyCaps() }
      idx.set(r.idente, m)
    }
    const key = `${r.tipreig}${r.cdcta}`
    for (const mag of LIQ_MAGS) m[mag][key] += r[mag]
  }
  return idx
}

// ---------------------------------------------------------------------------
// Workbooks
// ---------------------------------------------------------------------------

interface EntityRow {
  ine5: string
  pr: string
  cor: string
  tipo: string // A00 / Z00 / D00 ...
  nombre: string
  /** capítulo 1..9 por tipreig (euros) */
  I: number[]
  G: number[]
  totalI: number
  totalG: number
}

interface EntitySheetInfo {
  sheet: string
  headerRow: number
  /** etiqueta del grupo de ingresos (cabecera de fila de grupo) */
  labelI: string
  labelG: string
}

function findEntitySheet(wb: XLSX.WorkBook): EntitySheetInfo | null {
  for (const sn of wb.SheetNames) {
    if (sn.startsWith('_xlnm') || sn.startsWith('microsoft')) continue
    const ws = wb.Sheets[sn]
    if (!ws) continue
    let rows: unknown[][]
    try {
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
    } catch {
      continue
    }
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const r = (rows[i] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()))
      if (r.includes('Pr') && r.includes('Cor') && r.includes('Impuestos directos')) {
        // fila de grupos: 1-2 filas arriba, busca "Previsión" / "Derechos" / "Créditos" / "Obligaciones"
        let labelI = ''
        let labelG = ''
        for (let k = Math.max(0, i - 3); k < i; k++) {
          for (const cell of rows[k] ?? []) {
            const s = cell === null || cell === undefined ? '' : String(cell)
            if (!labelI && /Previsi[oó]n|Derechos/i.test(s)) labelI = s.replace(/\s+/g, ' ').trim()
            if (!labelG && /Cr[eé]ditos|Obligaciones/i.test(s)) labelG = s.replace(/\s+/g, ' ').trim()
          }
        }
        return { sheet: sn, headerRow: i, labelI, labelG }
      }
    }
  }
  return null
}

function parseEntityRows(wb: XLSX.WorkBook, info: EntitySheetInfo): EntityRow[] {
  const ws = wb.Sheets[info.sheet]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
  const out: EntityRow[] = []
  for (let i = info.headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const pr = String(r[0] ?? '').padStart(2, '0').trim()
    const cor = String(r[1] ?? '').padStart(3, '0').trim()
    const tipo = String(r[2] ?? '').trim()
    if (!/^\d{2}$/.test(pr) || !/^\d{3}$/.test(cor) || !/^[A-Z]\d{2}$/.test(tipo)) continue
    const nombre = String(r[3] ?? '').trim()
    const I: number[] = []
    const G: number[] = []
    for (let c = 0; c < 9; c++) {
      I.push(parseEs(r[6 + c]))
      G.push(parseEs(r[16 + c]))
    }
    out.push({
      ine5: pr + cor,
      pr,
      cor,
      tipo,
      nombre,
      I,
      G,
      totalI: parseEs(r[15]),
      totalG: parseEs(r[25]),
    })
  }
  return out
}

function resolveFile(codigo: string, familia: 'EP2025' | 'EL2024'): string | null {
  const candidates: string[] = []
  if (familia === 'EP2025') {
    candidates.push(path.join(CONPREL_DIR, `EP2025C${codigo}.xlsx`))
    if (codigo === '01') candidates.push(path.join(CONPREL_DIR, 'EP2025_def_01.tmp'))
    if (codigo === '00') candidates.push(path.join(CONPREL_DIR, 'EP2025_def_total.tmp'))
  } else {
    candidates.push(path.join(CONPREL_DIR, `EL2024C${codigo}.xlsx`))
    if (codigo === '01') candidates.push(path.join(CONPREL_DIR, 'EL2024_def_01.tmp'))
    if (codigo === '00') candidates.push(path.join(CONPREL_DIR, 'LD2024.tmp'))
  }
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}

/** Códigos CCAA 01..19 (+00 nacional cuando exista). */
function listCodigos(familia: 'EP2025' | 'EL2024'): string[] {
  const found = new Set<string>()
  for (let i = 1; i <= 19; i++) {
    const c = String(i).padStart(2, '0')
    if (resolveFile(c, familia)) found.add(c)
  }
  return [...found].sort()
}

// ---------------------------------------------------------------------------
// Muestra diversa (INE verificados en docs/qa-fixtures + capitales estándar)
// ---------------------------------------------------------------------------

interface Sample {
  ine: string
  nombre: string
  cat: 'capital' | 'mediano' | 'rural' | 'ca_autonoma' | 'ausencia_foral'
}

const MUESTRA: Sample[] = [
  // Capitales / grandes
  { ine: '28079', nombre: 'Madrid', cat: 'capital' },
  { ine: '08019', nombre: 'Barcelona', cat: 'capital' },
  { ine: '46250', nombre: 'Valencia', cat: 'capital' },
  { ine: '41091', nombre: 'Sevilla', cat: 'capital' },
  { ine: '50297', nombre: 'Zaragoza', cat: 'capital' },
  { ine: '48020', nombre: 'Bilbao', cat: 'capital' },
  { ine: '31201', nombre: 'Pamplona', cat: 'capital' },
  { ine: '47186', nombre: 'Valladolid', cat: 'capital' },
  { ine: '02003', nombre: 'Albacete', cat: 'capital' },
  { ine: '33044', nombre: 'Oviedo', cat: 'capital' },
  { ine: '07040', nombre: 'Palma', cat: 'capital' },
  { ine: '38038', nombre: 'Santa Cruz de Tenerife', cat: 'capital' },
  { ine: '39075', nombre: 'Santander', cat: 'capital' },
  { ine: '15030', nombre: 'A Coruña', cat: 'capital' },
  { ine: '06015', nombre: 'Badajoz', cat: 'capital' },
  { ine: '30030', nombre: 'Murcia', cat: 'capital' },
  { ine: '26089', nombre: 'Logroño', cat: 'capital' },
  { ine: '11012', nombre: 'Cádiz', cat: 'capital' },
  { ine: '18087', nombre: 'Granada', cat: 'capital' },
  { ine: '45168', nombre: 'Toledo', cat: 'capital' },
  { ine: '09059', nombre: 'Burgos', cat: 'capital' },
  { ine: '10037', nombre: 'Cáceres', cat: 'capital' },
  { ine: '21041', nombre: 'Huelva', cat: 'capital' },
  { ine: '23050', nombre: 'Jaén', cat: 'capital' },
  { ine: '44216', nombre: 'Teruel', cat: 'capital' },
  { ine: '03014', nombre: 'Alicante', cat: 'capital' },
  { ine: '25120', nombre: 'Lleida', cat: 'capital' },
  // Ciudades autónomas
  { ine: '51001', nombre: 'Ceuta', cat: 'ca_autonoma' },
  { ine: '52001', nombre: 'Melilla', cat: 'ca_autonoma' },
  // Medianos
  { ine: '08073', nombre: 'Cornellà de Llobregat', cat: 'mediano' },
  { ine: '28092', nombre: 'Móstoles', cat: 'mediano' },
  { ine: '03065', nombre: 'Elche', cat: 'mediano' },
  { ine: '30016', nombre: 'Cartagena', cat: 'mediano' },
  { ine: '31232', nombre: 'Tudela', cat: 'mediano' },
  { ine: '48013', nombre: 'Barakaldo', cat: 'mediano' },
  { ine: '15078', nombre: 'Santiago de Compostela', cat: 'mediano' },
  // Rurales / asimetrías documentadas
  { ine: '04004', nombre: 'Albánchez', cat: 'rural' },
  { ine: '05019', nombre: 'Ávila', cat: 'rural' },
  { ine: '06161', nombre: 'Zarza-Capilla', cat: 'rural' },
  { ine: '05188', nombre: 'Poveda', cat: 'rural' },
  { ine: '19191', nombre: 'Monasterio', cat: 'rural' },
  { ine: '48044', nombre: 'Getxo', cat: 'rural' },
  // Ausencias documentadas (deben quedar ND/ausentes en ambos lados)
  { ine: '01059', nombre: 'Vitoria-Gasteiz', cat: 'ausencia_foral' },
  { ine: '31169', nombre: 'Milagro', cat: 'ausencia_foral' },
  { ine: '01018', nombre: 'Zigoitia', cat: 'ausencia_foral' },
]

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

interface Comparison {
  ine: string
  nombre: string
  cat: string
  familia: 'ppto2025' | 'liq2024'
  magnitud: string
  cap: number
  tip: Tip
  access: number
  workbook: number
  diff: number
  status: 'exacto' | 'diff' | 'solo_access' | 'solo_workbook' | 'ausente_access' | 'ausente_workbook'
}

function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const out: Record<string, unknown> = {
    generado: new Date().toISOString(),
    dir_datos: CONPREL_DIR,
    tolerancia_eur: TOL_EUR,
    avisos: [] as string[],
  }
  const avisos = out.avisos as string[]
  const comparisons: Comparison[] = []

  // --- Cargar Access ------------------------------------------------------
  const invP = loadPipe('loader_inv_ppto2025.csv').map((r) => ({
    codente: r.codente,
    estado: r.estado,
    id: r.id,
    idente: r.idente,
    nombreente: r.nombreente,
    prefix: r.codente.slice(0, 5),
    tipo: r.codente.slice(5, 7),
  })) as InvRow[]
  const invL = loadPipe('loader_inv_liq2024.csv').map((r) => ({
    codente: r.codente,
    estado: r.estado,
    id: r.id,
    idente: r.idente,
    nombreente: r.nombreente,
    prefix: r.codente.slice(0, 5),
    tipo: r.codente.slice(5, 7),
  })) as InvRow[]

  const ecoPRaw = loadPipe('loader_eco_ppto2025.csv')
  const ecoP: EcoPpto[] = ecoPRaw.map((r) => ({
    idente: r.idente,
    cdcta: r.cdcta.trim(),
    tipreig: (r.tipreig === 'G' ? 'G' : 'I') as Tip,
    importe: parseEs(r.importe),
  }))
  const ecoLRaw = loadPipe('loader_eco_liq2024.csv')
  const ecoL: EcoLiq[] = ecoLRaw.map((r) => ({
    idente: r.idente,
    cdcta: r.cdcta.trim(),
    tipreig: (r.tipreig === 'G' ? 'G' : 'I') as Tip,
    imported: parseEs(r.imported),
    importer: parseEs(r.importer),
    importel: parseEs(r.importel),
    importec: parseEs(r.importec),
  }))

  const pptoIdx = buildPptoIndex(ecoP)
  const liqIdx = buildLiqIndex(ecoL)

  const muniP = new Map<string, InvRow>() // ine5 → fila AA/ZZ
  for (const r of invP) if (r.tipo === 'AA' || r.tipo === 'ZZ') muniP.set(r.prefix, r)
  const muniL = new Map<string, InvRow>()
  for (const r of invL) if (r.tipo === 'AA' || r.tipo === 'ZZ') muniL.set(r.prefix, r)

  // Dependientes por id (misma corporación) — para diagnóstico de consolidación
  const byIdP = new Map<string, InvRow[]>()
  for (const r of invP) {
    const arr = byIdP.get(r.id) ?? []
    arr.push(r)
    byIdP.set(r.id, arr)
  }

  out.access = {
    inv_ppto: invP.length,
    inv_liq: invL.length,
    eco_ppto: ecoP.length,
    eco_liq: ecoL.length,
    municipios_aa_zz_ppto: muniP.size,
    municipios_aa_zz_liq: muniL.size,
  }

  // --- Consolidados (tb_economica_cons) por id ------------------------------
  // La fila del workbook = entidad local consolidada (AG + dependientes −
  // transferencias internas). El grain idéntico vive en tb_economica_cons.
  const consPPath = path.join(CSV_DIR, 'loader_eco_cons_ppto2025.csv')
  const consLPath = path.join(CSV_DIR, 'loader_eco_cons_liq2024.csv')
  const consPIdx = new Map<string, CapMap>()
  const consLIdx = new Map<string, Record<LiqMag, CapMap>>()
  if (fs.existsSync(consPPath)) {
    for (const r of loadPipe('loader_eco_cons_ppto2025.csv')) {
      const cd = (r.cdcta ?? '').trim()
      if (!/^[1-9]$/.test(cd)) continue
      let m = consPIdx.get(r.id)
      if (!m) {
        m = emptyCaps()
        consPIdx.set(r.id, m)
      }
      m[`${r.tipreig === 'G' ? 'G' : 'I'}${cd}`] += parseEs(r.importe)
    }
  } else {
    avisos.push('sin loader_eco_cons_ppto2025.csv — estrategia cons omitida en ppto')
  }
  if (fs.existsSync(consLPath)) {
    for (const r of loadPipe('loader_eco_cons_liq2024.csv')) {
      const cd = (r.cdcta ?? '').trim()
      if (!/^[1-9]$/.test(cd)) continue
      let m = consLIdx.get(r.id)
      if (!m) {
        m = { imported: emptyCaps(), importer: emptyCaps(), importel: emptyCaps(), importec: emptyCaps() }
        consLIdx.set(r.id, m)
      }
      const key = `${r.tipreig === 'G' ? 'G' : 'I'}${cd}`
      for (const mag of LIQ_MAGS) m[mag][key] += parseEs(r[mag])
    }
  } else {
    avisos.push('sin loader_eco_cons_liq2024.csv — estrategia cons omitida en liq')
  }
  out.access.eco_cons_ppto = consPIdx.size
  out.access.eco_cons_liq = consLIdx.size

  // --- Indexar workbooks por familia -------------------------------------
  const epCodigos = listCodigos('EP2025')
  const elCodigos = listCodigos('EL2024')
  const epByIne = new Map<string, EntityRow & { ccaa: string; file: string; sheet: string }>()
  const elByIne = new Map<string, EntityRow & { ccaa: string; file: string; sheet: string }>()
  const wbMeta: Record<string, unknown> = { ep: [] as unknown[], el: [] as unknown[] }

  for (const cod of epCodigos) {
    const file = resolveFile(cod, 'EP2025')!
    try {
      const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
      const info = findEntitySheet(wb)
      if (!info) {
        avisos.push(`EP2025C${cod}: sin hoja de entidades (Pr/Cor) — omitido`)
        continue
      }
      const rows = parseEntityRows(wb, info)
      ;(wbMeta.ep as unknown[]).push({
        ccaa: cod,
        file: path.basename(file),
        sheet: info.sheet,
        labelI: info.labelI,
        labelG: info.labelG,
        filas: rows.length,
        a00: rows.filter((r) => r.tipo === 'A00').length,
        z00: rows.filter((r) => r.tipo === 'Z00').length,
      })
      for (const r of rows) {
        if (r.tipo === 'A00' || r.tipo === 'Z00') {
          if (!epByIne.has(r.ine5)) epByIne.set(r.ine5, { ...r, ccaa: cod, file: path.basename(file), sheet: info.sheet })
        }
      }
    } catch (e) {
      avisos.push(`EP2025C${cod}: error lectura — ${(e as Error).message}`)
    }
  }
  for (const cod of elCodigos) {
    const file = resolveFile(cod, 'EL2024')!
    try {
      const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
      const info = findEntitySheet(wb)
      if (!info) {
        avisos.push(`EL2024C${cod}: sin hoja de entidades — omitido`)
        continue
      }
      const rows = parseEntityRows(wb, info)
      ;(wbMeta.el as unknown[]).push({
        ccaa: cod,
        file: path.basename(file),
        sheet: info.sheet,
        labelI: info.labelI,
        labelG: info.labelG,
        filas: rows.length,
        a00: rows.filter((r) => r.tipo === 'A00').length,
        z00: rows.filter((r) => r.tipo === 'Z00').length,
      })
      for (const r of rows) {
        if (r.tipo === 'A00' || r.tipo === 'Z00') {
          if (!elByIne.has(r.ine5)) elByIne.set(r.ine5, { ...r, ccaa: cod, file: path.basename(file), sheet: info.sheet })
        }
      }
    } catch (e) {
      avisos.push(`EL2024C${cod}: error lectura — ${(e as Error).message}`)
    }
  }
  out.workbooks = wbMeta

  // --- Comparaciones por municipio de la muestra --------------------------
  const sampleResults: Record<string, unknown>[] = []

  for (const s of MUESTRA) {
    const row: Record<string, unknown> = { ine: s.ine, nombre: s.nombre, cat: s.cat }

    // PPTO
    const invRowP = muniP.get(s.ine)
    const wbP = epByIne.get(s.ine)
    row.ppto = {
      access: invRowP ? { codente: invRowP.codente, idente: invRowP.idente, dependientes: Math.max(0, (byIdP.get(invRowP.id) ?? []).length - 1) } : null,
      workbook: wbP ? { file: wbP.file, sheet: wbP.sheet, tipo: wbP.tipo, nombre: wbP.nombre } : null,
    }
    if (!invRowP && !wbP) {
      row.ppto_estado = 'ausente_ambos'
    } else if (!invRowP) {
      row.ppto_estado = 'solo_workbook'
    } else if (!wbP) {
      row.ppto_estado = 'solo_access'
    } else {
      // Suma por id de TODOS los identes (AG + dependientes, sin eliminar)
      const grupoCaps = emptyCaps()
      for (const d of byIdP.get(invRowP.id) ?? []) {
        const dc = pptoIdx.get(d.idente)
        if (!dc) continue
        for (const k of Object.keys(dc)) grupoCaps[k] += dc[k]
      }
      const consCaps = consPIdx.get(invRowP.id)
      const strategies: Record<string, { caps: CapMap; label: string }> = {
        cons: { caps: consCaps ?? emptyCaps(), label: 'tb_economica_cons[id]' },
        aa: { caps: pptoIdx.get(invRowP.idente) ?? emptyCaps(), label: 'tb_economica[idente AA/ZZ]' },
        grupo: { caps: grupoCaps, label: 'Σ tb_economica por id (sin eliminar)' },
      }
      const stratSummary: Record<string, { exactos: number; maxDiff: number }> = {}
      for (const [name, st] of Object.entries(strategies)) {
        let exactos = 0
        let maxDiff = 0
        for (const tip of TIPS) {
          for (const cap of CAPS) {
            const a = st.caps[`${tip}${cap}`]
            const w = tip === 'I' ? wbP.I[cap - 1] : wbP.G[cap - 1]
            const diff = a - w
            if (Math.abs(diff) <= TOL_EUR) exactos++
            maxDiff = Math.max(maxDiff, Math.abs(diff))
            if (name === 'cons' || (name === 'aa' && Math.abs(diff) > TOL_EUR)) {
              const status: Comparison['status'] =
                Math.abs(diff) <= TOL_EUR ? 'exacto' : a === 0 ? 'solo_workbook' : w === 0 ? 'solo_access' : 'diff'
              comparisons.push({
                ine: s.ine,
                nombre: s.nombre,
                cat: s.cat,
                familia: 'ppto2025',
                magnitud: name === 'cons' ? 'importe' : `importe_${name}`,
                cap,
                tip,
                access: a,
                workbook: w,
                diff,
                status,
              })
            }
          }
        }
        stratSummary[name] = { exactos, maxDiff }
      }
      row.ppto_estrategias = stratSummary
      const cons = stratSummary.cons
      row.ppto_estado = cons && cons.maxDiff <= TOL_EUR ? 'exacto_18_celdas_cons' : `cons_diff_max=${cons?.maxDiff}`
      row.ppto_estado_aa = stratSummary.aa.maxDiff <= TOL_EUR ? 'exacto_18_celdas_aa' : `aa_diff_max=${stratSummary.aa.maxDiff}`
      row.ppto_exactos = cons?.exactos ?? 0
      row.ppto_max_diff = cons?.maxDiff ?? -1
    }

    // LIQ: hoja entidad solo expone Derechos/Obligaciones = importer
    const invRowL = muniL.get(s.ine)
    const wbL = elByIne.get(s.ine)
    row.liq = {
      access: invRowL ? { codente: invRowL.codente, idente: invRowL.idente, id: invRowL.id } : null,
      workbook: wbL ? { file: wbL.file, sheet: wbL.sheet, tipo: wbL.tipo } : null,
    }
    if (!invRowL && !wbL) {
      row.liq_estado = 'ausente_ambos'
    } else if (!invRowL) {
      row.liq_estado = 'solo_workbook'
    } else if (!wbL) {
      row.liq_estado = 'solo_access'
    } else {
      const grupoMag = emptyCaps()
      for (const d of (invL.filter((x) => x.id === invRowL.id) as InvRow[])) {
        const dc = liqIdx.get(d.idente)?.importer
        if (!dc) continue
        for (const k of Object.keys(dc)) grupoMag[k] += dc[k]
      }
      const consMag = consLIdx.get(invRowL.id)?.importer
      const strategies: Record<string, CapMap> = {
        cons: consMag ?? emptyCaps(),
        aa: liqIdx.get(invRowL.idente)?.importer ?? emptyCaps(),
        grupo: grupoMag,
      }
      const stratSummary: Record<string, { exactos: number; maxDiff: number }> = {}
      for (const [name, caps] of Object.entries(strategies)) {
        let exactos = 0
        let maxDiff = 0
        for (const tip of TIPS) {
          for (const cap of CAPS) {
            const a = caps[`${tip}${cap}`]
            const w = tip === 'I' ? wbL.I[cap - 1] : wbL.G[cap - 1]
            const diff = a - w
            if (Math.abs(diff) <= TOL_EUR) exactos++
            maxDiff = Math.max(maxDiff, Math.abs(diff))
            if (name === 'cons' || (name === 'aa' && Math.abs(diff) > TOL_EUR)) {
              const status: Comparison['status'] =
                Math.abs(diff) <= TOL_EUR ? 'exacto' : a === 0 ? 'solo_workbook' : w === 0 ? 'solo_access' : 'diff'
              comparisons.push({
                ine: s.ine,
                nombre: s.nombre,
                cat: s.cat,
                familia: 'liq2024',
                magnitud: name === 'cons' ? 'importer' : `importer_${name}`,
                cap,
                tip,
                access: a,
                workbook: w,
                diff,
                status,
              })
            }
          }
        }
        stratSummary[name] = { exactos, maxDiff }
      }
      row.liq_estrategias = stratSummary
      const cons = stratSummary.cons
      row.liq_estado = cons && cons.maxDiff <= TOL_EUR ? 'exacto_18_celdas_cons' : `cons_diff_max=${cons?.maxDiff}`
      row.liq_estado_aa = stratSummary.aa.maxDiff <= TOL_EUR ? 'exacto_18_celdas_aa' : `aa_diff_max=${stratSummary.aa.maxDiff}`
      row.liq_exactos = cons?.exactos ?? 0
      row.liq_max_diff = cons?.maxDiff ?? -1
    }

    sampleResults.push(row)
  }
  out.muestra = sampleResults

  // --- Ceuta / Melilla: Tabla1 del workbook de la Ciudad Autónoma ---------
  out.ciudades_autonomas = testCiudadesAutonomas(consPIdx, consLIdx, invP, invL)

  // Resúmenes de la muestra
  const pptoExactos = sampleResults.filter((r) => String(r.ppto_estado).startsWith('exacto')).length
  const pptoConDato = sampleResults.filter(
    (r) => r.ppto !== null && ((r.ppto as { access: unknown }).access !== null || (r.ppto as { workbook: unknown }).workbook !== null),
  ).length
  const liqExactos = sampleResults.filter((r) => String(r.liq_estado).startsWith('exacto')).length
  out.muestra_resumen = {
    municipios: MUESTRA.length,
    ppto_estado_exacto: pptoExactos,
    ppto_estados: countBy(sampleResults, (r) => String(r.ppto_estado).split('=')[0]),
    ppto_estados_estrategia_aa: countBy(sampleResults, (r) => String(r.ppto_estado_aa ?? 'n/a').split('=')[0]),
    liq_estado_exacto: liqExactos,
    liq_estados: countBy(sampleResults, (r) => String(r.liq_estado).split('=')[0]),
    liq_estados_estrategia_aa: countBy(sampleResults, (r) => String(r.liq_estado_aa ?? 'n/a').split('=')[0]),
    comparaciones_celdas: comparisons.length,
    comparaciones_exactas: comparisons.filter((c) => c.status === 'exacto').length,
    comparaciones_diff: comparisons.filter((c) => c.status === 'diff').length,
    con_algun_lado: pptoConDato,
  }

  // --- PPTO nacional: Tabla1 vs Access (hueco 97,82 %) --------------------
  const gap = readPptoTabla1Gap(() => {
    const aaCaps = emptyCaps()
    const zzCaps = emptyCaps()
    const aaCons = emptyCaps()
    const zzCons = emptyCaps()
    for (const r of invP) {
      if (r.tipo !== 'AA' && r.tipo !== 'ZZ') continue
      const caps = pptoIdx.get(r.idente)
      const cons = consPIdx.get(r.id)
      const tAA = r.tipo === 'AA'
      if (caps) for (const k of Object.keys(caps)) (tAA ? aaCaps : zzCaps)[k] += caps[k]
      if (cons) for (const k of Object.keys(cons)) (tAA ? aaCons : zzCons)[k] += cons[k]
    }
    return { aaCaps, zzCaps, aaCons, zzCons }
  })
  out.ppto_nacional_gap = gap

  // Descomposición por CCAA + no firmantes
  const nonsigners = loadQuotedCsv('pd2025_nonsigners.csv')
  const nsSummary = {
    filas: nonsigners.length,
    por_tipo: {} as Record<string, number>,
    tipo_A: 0,
    tipo_A_en_access: 0,
    tipo_A_fuera_access: [] as string[],
  }
  const accessSet = new Set(invP.map((r) => r.prefix))
  for (const ns of nonsigners) {
    const t = (ns.tipo ?? '?').trim()
    nsSummary.por_tipo[t] = (nsSummary.por_tipo[t] ?? 0) + 1
    if (t === 'A') {
      nsSummary.tipo_A++
      const ine = (ns.prov ?? '').padStart(2, '0') + (ns.corp ?? '').padStart(3, '0')
      if (accessSet.has(ine)) nsSummary.tipo_A_en_access++
      else nsSummary.tipo_A_fuera_access.push(`${ine} ${(ns.nombre ?? '').trim()}`)
    }
  }

  // Contribución económica de no firmantes fuera de Access (según workbook EP)
  const gapRows: Record<string, unknown>[] = []
  let nsImporteI1 = 0
  let wbA00I1 = 0
  let accessAAI1 = 0
  let accessConsI1 = 0
  const nsSet = new Set(nsSummary.tipo_A_fuera_access.map((s) => s.slice(0, 5)))
  for (const [ine, row] of epByIne) {
    if (row.tipo !== 'A00') continue
    wbA00I1 += row.I[0]
    if (nsSet.has(ine)) nsImporteI1 += row.I[0]
  }
  for (const r of invP) {
    if (r.tipo !== 'AA') continue
    accessAAI1 += pptoIdx.get(r.idente)?.['I1'] ?? 0
    accessConsI1 += consPIdx.get(r.id)?.['I1'] ?? 0
  }
  // Recuento de filas A00 totales en workbooks vs Access AA
  let a00Total = 0
  for (const row of epByIne.values()) if (row.tipo === 'A00') a00Total++

  out.nonsigners = {
    ...nsSummary,
    tipo_A_fuera_access_muestra: nsSummary.tipo_A_fuera_access.slice(0, 20),
    tipo_A_fuera_access_total: nsSummary.tipo_A_fuera_access.length,
  }
  const tabl1AyuntI1 = (() => {
    const g = out.ppto_nacional_gap as { ingresos?: Record<string, { workbook_ayuntamientos_miles?: number }> }
    return (g?.ingresos?.I1?.workbook_ayuntamientos_miles ?? 0) * 1000
  })()
  out.ppto_gap_descomposicion = {
    workbook_A00_filas: a00Total,
    access_AA_filas: muniP.size,
    // Cadena de tres niveles (cap.1 · impuestos directos · €)
    tabl1_ayuntamientos_elevado_eur: tabl1AyuntI1,
    workbook_A00_plano_eur: wbA00I1,
    access_cons_aa_eur: accessConsI1,
    access_aa_ag_eur: accessAAI1,
    delta_elevacion_tabl1_menos_plano_eur: tabl1AyuntI1 - wbA00I1,
    delta_plano_menos_access_eur: wbA00I1 - accessConsI1,
    no_firmantes_A_fuera_access_I1_eur: nsImporteI1,
    residuo_plano_menos_access_menos_ns_eur: wbA00I1 - accessConsI1 - nsImporteI1,
    ratio_accessAA_sobre_tabl1: tabl1AyuntI1 ? accessAAI1 / tabl1AyuntI1 : null,
    ratio_accessCons_sobre_tabl1: tabl1AyuntI1 ? accessConsI1 / tabl1AyuntI1 : null,
    ratio_plano_sobre_tabl1: tabl1AyuntI1 ? wbA00I1 / tabl1AyuntI1 : null,
    // legado
    workbook_A00_I1_eur: wbA00I1,
    access_AA_I1_eur: accessAAI1,
    hueco_eur: tabl1AyuntI1 - accessAAI1,
    hueco_explicado_por_no_firmantes_eur: nsImporteI1,
    residuo_eur: tabl1AyuntI1 - accessAAI1 - nsImporteI1,
    workbook_A00_I1_miles: wbA00I1 / 1000,
    access_AA_I1_miles: accessAAI1 / 1000,
    ratio_access_sobre_workbook: tabl1AyuntI1 ? accessAAI1 / tabl1AyuntI1 : null,
  }
  for (const cod of epCodigos) {
    let wb = 0
    let ns = 0
    let nRows = 0
    let nNs = 0
    for (const row of epByIne.values()) {
      if (row.ccaa !== cod || row.tipo !== 'A00') continue
      nRows++
      wb += row.I[0]
      if (nsSet.has(row.ine5)) {
        nNs++
        ns += row.I[0]
      }
    }
    gapRows.push({ ccaa: cod, a00_filas: nRows, ns_fuera_access_filas: nNs, workbook_I1: wb, ns_I1: ns })
  }

  // --- LIQ nacional: LD2024 Tabla 1 vs Access (todas las entidades) -------
  out.liq_nacional_gap = readLiqTabla1Gap(invL, liqIdx)

  // --- Diagnóstico EL2025CT (año) ----------------------------------------
  out.diagnostico_el2025ct = diagnoseEl2025ct()

  // --- Ciudades autónomas: Tabla1 col6 vs Access ZZ -----------------------
  // (incluido en ppto_nacional_gap si se pudo leer Tabla1)

  // --- Escrituras ---------------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const jsonPath = path.join(OUT_DIR, `report-${ts}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8')

  const csvPath = path.join(OUT_DIR, `comparisons-${ts}.csv`)
  const hdr = 'ine,nombre,cat,familia,magnitud,cap,tip,access,workbook,diff,status'
  const lines = comparisons.map((c) =>
    [c.ine, c.nombre, c.cat, c.familia, c.magnitud, c.cap, c.tip, c.access, c.workbook, c.diff, c.status].join(','),
  )
  fs.writeFileSync(csvPath, [hdr, ...lines].join('\n'), 'utf8')

  const gapPath = path.join(OUT_DIR, `gap-nonsigners-${ts}.csv`)
  fs.writeFileSync(
    gapPath,
    ['ccaa,a00_filas,ns_fuera_access_filas,workbook_I1,ns_I1', ...gapRows.map((r) => Object.values(r).join(','))].join('\n'),
    'utf8',
  )

  // --- Consola ------------------------------------------------------------
  console.log('== CONPREL reconciliación Access ↔ workbook ==')
  console.log(`Access: inv ppto=${invP.length} liq=${invL.length} · eco ppto=${ecoP.length} liq=${ecoL.length} · AA+ZZ ppto=${muniP.size} liq=${muniL.size}`)
  console.log(`Workbooks EP2025 CCAA: [${epCodigos.join(',')}] · EL2024 CCAA: [${elCodigos.join(',')}]`)
  const wr = out.muestra_resumen as Record<string, number>
  console.log(`Muestra: ${MUESTRA.length} municipios · comparaciones=${comparisons.length} exactas=${wr.comparaciones_exactas} diff=${wr.comparaciones_diff}`)
  const mr = out.muestra_resumen as Record<string, unknown>
  console.log(`PPTO estados (cons): ${JSON.stringify(mr.ppto_estados)}`)
  console.log(`PPTO estados (AA):   ${JSON.stringify(mr.ppto_estados_estrategia_aa)}`)
  console.log(`LIQ estados (cons):  ${JSON.stringify(mr.liq_estados)}`)
  console.log(`LIQ estados (AA):    ${JSON.stringify(mr.liq_estados_estrategia_aa)}`)
  console.log('Detalle muestra:')
  for (const r of sampleResults) {
    console.log(
      `  ${r.ine} ${String(r.nombre).padEnd(24)} ppto=${String(r.ppto_estado).padEnd(28)} aa=${String(r.ppto_estado_aa ?? '-').padEnd(24)} liq=${String(r.liq_estado)} aa=${String(r.liq_estado_aa ?? '-')}`,
    )
  }
  console.log('Ciudades autónomas:')
  console.log(JSON.stringify(out.ciudades_autonomas, null, 1))
  const g = out.ppto_gap_descomposicion as Record<string, number>
  console.log('PPTO cadena hueco I1 (cap.1 impuestos directos, €):')
  console.log(`  Tabla1 elevado=${(g.tabl1_ayuntamientos_elevado_eur / 1e6).toFixed(2)} M€`)
  console.log(`  A00 plano     =${(g.workbook_A00_plano_eur / 1e6).toFixed(2)} M€  (Δ elevación=${(g.delta_elevacion_tabl1_menos_plano_eur / 1e6).toFixed(2)} M€)`)
  console.log(`  Access cons   =${(g.access_cons_aa_eur / 1e6).toFixed(2)} M€  (Δ=${(g.delta_plano_menos_access_eur / 1e6).toFixed(2)} M€ = ns ${(g.no_firmantes_A_fuera_access_I1_eur / 1e6).toFixed(2)} + residuo ${(g.residuo_plano_menos_access_menos_ns_eur / 1e6).toFixed(2)})`)
  const gAA = g.access_aa_ag_eur ?? 0
  console.log(`  Access AA/AG  =${(gAA / 1e6).toFixed(2)} M€`)
  console.log(`  ratio AccessAA/Tabla1=${((g.ratio_accessAA_sobre_tabl1 ?? 0) * 100).toFixed(2)}%  ·  A00plano/Tabla1=${((g.ratio_plano_sobre_tabl1 ?? 0) * 100).toFixed(2)}%`)
  console.log(`No firmantes: ${nsSummary.filas} total · tipo A=${nsSummary.tipo_A} (en Access ${nsSummary.tipo_A_en_access}, fuera ${nsSummary.tipo_A_fuera_access.length})`)
  console.log('LIQ nacional (LD2024 Tabla 1, miles €):')
  console.log(JSON.stringify(out.liq_nacional_gap, null, 1))
  console.log('Diagnóstico EL2025CT:')
  console.log(JSON.stringify(out.diagnostico_el2025ct, null, 1))
  if (avisos.length) console.log('Avisos:', avisos)
  console.log(`OK → ${jsonPath}`)
  console.log(`OK → ${csvPath}`)
  console.log(`OK → ${gapPath}`)
}

function countBy<T>(arr: T[], key: (t: T) => string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const x of arr) {
    const k = key(x)
    m[k] = (m[k] ?? 0) + 1
  }
  return m
}

/** Tabla1 del workbook nacional de presupuestos: columna Ayuntamientos vs Access. */
function readPptoTabla1Gap(
  sumAccess: () => { aaCaps: CapMap; zzCaps: CapMap; aaCons: CapMap; zzCons: CapMap },
): Record<string, unknown> {
  const file = resolveFile('00', 'EP2025')
  if (!file) return { error: 'sin workbook nacional EP2025' }
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
  const ws = wb.Sheets['Tabla1'] ?? wb.Sheets['Tabla 1']
  if (!ws) return { error: 'sin hoja Tabla1', hojas: wb.SheetNames.slice(0, 40) }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
  // Tabla1: Ctas en col1 · Denominación col2 · Ayuntamientos col4 · Diputaciones col5 ·
  // Ciudades Autónomas col6 · Total consolidado col13. Bloques Ingresos/Gastos por etiqueta en col2.
  const caps: Record<number, { ayunt: number; dipu: number; ciudades: number; total: number }> = {}
  const gastosCaps: Record<number, { ayunt: number; dipu: number; ciudades: number; total: number }> = {}
  let inIngresos = false
  let inGastos = false
  for (const r of rows) {
    const c1 = String(r?.[1] ?? '').trim()
    const c2 = String(r?.[2] ?? '').trim()
    if (c2 === 'Ingresos') {
      inIngresos = true
      inGastos = false
      continue
    }
    if (c2 === 'Gastos') {
      inGastos = true
      inIngresos = false
      continue
    }
    if (!/^[1-9]$/.test(c1)) continue
    const n = Number(c1)
    const entry = { ayunt: parseEs(r[4]), dipu: parseEs(r[5]), ciudades: parseEs(r[6]), total: parseEs(r[13]) }
    if (inIngresos) caps[n] = entry
    if (inGastos) gastosCaps[n] = entry
  }
  const { aaCaps, zzCaps, aaCons, zzCons } = sumAccess()
  const detalle: Record<string, unknown> = {}
  for (const c of CAPS) {
    const w = caps[c]
    if (!w) continue
    detalle[`I${c}`] = {
      workbook_ayuntamientos_miles: w.ayunt,
      workbook_diputaciones_miles: w.dipu,
      workbook_ciudades_autonomas_miles: w.ciudades,
      access_AA_ag_miles: aaCaps[`I${c}`] / 1000,
      access_AA_cons_miles: aaCons[`I${c}`] / 1000,
      access_ZZ_cons_miles: zzCons[`I${c}`] / 1000,
      ratio_AA_ag: w.ayunt ? aaCaps[`I${c}`] / 1000 / w.ayunt : null,
      ratio_AA_cons: w.ayunt ? aaCons[`I${c}`] / 1000 / w.ayunt : null,
      ratio_ZZ_cons: w.ciudades ? zzCons[`I${c}`] / 1000 / w.ciudades : null,
      ratio_ZZ_ag: w.ciudades ? zzCaps[`I${c}`] / 1000 / w.ciudades : null,
    }
  }
  const gastosDetalle: Record<string, unknown> = {}
  for (const c of CAPS) {
    const w = gastosCaps[c]
    if (!w) continue
    gastosDetalle[`G${c}`] = {
      workbook_ayuntamientos_miles: w.ayunt,
      workbook_ciudades_miles: w.ciudades,
      access_AA_ag_miles: aaCaps[`G${c}`] / 1000,
      access_AA_cons_miles: aaCons[`G${c}`] / 1000,
      access_ZZ_cons_miles: zzCons[`G${c}`] / 1000,
      ratio_AA_ag: w.ayunt ? aaCaps[`G${c}`] / 1000 / w.ayunt : null,
      ratio_AA_cons: w.ayunt ? aaCons[`G${c}`] / 1000 / w.ayunt : null,
      ratio_ZZ_cons: w.ciudades ? zzCons[`G${c}`] / 1000 / w.ciudades : null,
    }
  }
  return {
    archivo: path.basename(file),
    hoja: 'Tabla1',
    nota_unidad: 'miles de euros · Tabla1 Ayuntamientos = agregado con elevación (Nota metodológica §4)',
    ingresos: detalle,
    gastos: gastosDetalle,
  }
}

/**
 * Ceuta/Melilla: los workbooks C18/C19 NO traen hoja de entidades; traen Tabla1
 * (ppto, miles €) y Tabla 1 (liq, 5 magnitudes, miles €) del conjunto de la Ciudad
 * Autónoma (= entidad consolidada). Se compara contra tb_economica_cons[id ZZ].
 */
function testCiudadesAutonomas(
  consP: Map<string, CapMap>,
  consL: Map<string, Record<LiqMag, CapMap>>,
  invP: InvRow[],
  invL: InvRow[],
): Record<string, unknown> {
  const outCA: Record<string, unknown> = {}
  const munis = [
    { ine: '51001', nombre: 'Ceuta', cod: '18' },
    { ine: '52001', nombre: 'Melilla', cod: '19' },
  ]
  for (const m of munis) {
    const entry: Record<string, unknown> = { ine: m.ine }
    const invPRow = invP.find((r) => r.prefix === m.ine && (r.tipo === 'AA' || r.tipo === 'ZZ'))
    const invLRow = invL.find((r) => r.prefix === m.ine && (r.tipo === 'AA' || r.tipo === 'ZZ'))
    entry.access_ppto = invPRow ? { codente: invPRow.codente, id: invPRow.id } : null
    entry.access_liq = invLRow ? { codente: invLRow.codente, id: invLRow.id } : null

    // PPTO: EP2025Cxx Tabla1 (cap → valor miles, col4 = "Ciudad Autónoma")
    const epFile = resolveFile(m.cod, 'EP2025')
    if (epFile && invPRow) {
      const wb = XLSX.read(fs.readFileSync(epFile), { type: 'buffer' })
      const ws = wb.Sheets['Tabla1'] ?? wb.Sheets['Tabla 1']
      if (ws) {
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
        const cons = consP.get(invPRow.id) ?? emptyCaps()
        const detalle: Record<string, unknown> = {}
        let exactos = 0
        let maxDiff = 0
        let inIngresos = false
        let inGastos = false
        for (const r of rows) {
          const c2 = String(r?.[2] ?? '').trim()
          if (c2 === 'Ingresos') {
            inIngresos = true
            inGastos = false
            continue
          }
          if (c2 === 'Gastos') {
            inGastos = true
            inIngresos = false
            continue
          }
          const c1 = String(r?.[1] ?? '').trim()
          if (!/^[1-9]$/.test(c1)) continue
          const cap = Number(c1)
          const w = parseEs(r[4]) // miles
          if (inIngresos && !(`I${cap}` in detalle)) {
            const a = cons[`I${cap}`] / 1000
            const diff = a - w
            detalle[`I${cap}`] = { access_cons_miles: a, workbook_miles: w, diff_miles: diff }
            if (Math.abs(diff) <= 0.02) exactos++
            maxDiff = Math.max(maxDiff, Math.abs(diff))
          }
          if (inGastos && !(`G${cap}` in detalle)) {
            const a = cons[`G${cap}`] / 1000
            const diff = a - w
            detalle[`G${cap}`] = { access_cons_miles: a, workbook_miles: w, diff_miles: diff }
            if (Math.abs(diff) <= 0.02) exactos++
            maxDiff = Math.max(maxDiff, Math.abs(diff))
          }
        }
        entry.ppto = { archivo: path.basename(epFile), hoja: 'Tabla1', exactos_IG: exactos, max_diff_miles: maxDiff, detalle }
      }
    }

    // LIQ: EL2024Cxx Tabla 1 (5 magnitudes, miles) — bloque Ingresos
    const elFile = resolveFile(m.cod, 'EL2024')
    if (elFile && invLRow) {
      const wb = XLSX.read(fs.readFileSync(elFile), { type: 'buffer' })
      const ws = wb.Sheets['Tabla 1'] ?? wb.Sheets['Tabla1']
      if (ws) {
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
        const cons = consL.get(invLRow.id)
        const mags: LiqMag[] = ['imported', 'importer', 'importel', 'importec']
        const colFor: Record<LiqMag, number> = { imported: 1, importer: 2, importel: 3, importec: 4 }
        const detalle: Record<string, unknown> = {}
        let exactos = 0
        let maxDiff = 0
        let inIng = false
        const seen = new Set<number>()
        for (const r of rows) {
          const c2 = String(r?.[2] ?? '').trim()
          if (c2 === 'Ingresos') {
            inIng = true
            continue
          }
          if (c2 === 'Gastos') {
            inIng = false
            continue
          }
          const c1 = String(r?.[1] ?? '').trim()
          if (!inIng || !/^[1-9]$/.test(c1)) continue
          const cap = Number(c1)
          if (seen.has(cap)) continue
          seen.add(cap)
          const entryCap: Record<string, number> = {}
          for (const mag of mags) {
            // cols Tabla 1 LIQ: [4]PI [5]Previsión Definitiva [6]Derechos [7]Recaud.CE [8]Recaud.ECerrados
            const w = parseEs(r[4 + colFor[mag]])
            const a = cons ? cons[mag][`I${cap}`] / 1000 : 0
            const diff = a - w
            entryCap[mag] = w
            entryCap[`${mag}_access`] = a
            entryCap[`${mag}_diff`] = diff
            if (Math.abs(diff) <= 0.02) exactos++
            maxDiff = Math.max(maxDiff, Math.abs(diff))
          }
          detalle[`I${cap}`] = entryCap
        }
        entry.liq = {
          archivo: path.basename(elFile),
          hoja: 'Tabla 1',
          exactos_4mags_x_caps: exactos,
          max_diff_miles: maxDiff,
          detalle,
        }
      }
    }
    outCA[m.nombre] = entry
  }
  return outCA
}

/** LD2024 Tabla 1 (nacional, todas las entidades, miles €) vs suma Access de TODOS los identes. */
function readLiqTabla1Gap(
  invL: InvRow[],
  liqIdx: Map<string, Record<LiqMag, CapMap>>,
): Record<string, unknown> {
  const file = resolveFile('00', 'EL2024')
  if (!file) return { error: 'sin LD2024' }
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
  const ws = wb.Sheets['Tabla 1'] ?? wb.Sheets['Tabla1']
  if (!ws) return { error: 'sin hoja Tabla 1', hojas: wb.SheetNames.slice(0, 40) }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]

  // Sumas Access: todos los identes con filas eco (individualizados = base de la publicación)
  const all = {
    imported: emptyCaps(),
    importer: emptyCaps(),
    importel: emptyCaps(),
    importec: emptyCaps(),
  }
  let identesInvConEco = 0
  for (const r of invL) {
    const m = liqIdx.get(r.idente)
    if (!m) continue
    identesInvConEco++
    for (const mag of LIQ_MAGS) for (const k of Object.keys(m[mag])) all[mag][k] += m[mag][k]
  }
  // (identes eco sin inventario no deberían existir; se ignora)

  const capsWb: Record<number, number[]> = {} // cap → [PI, PD/prevDef, DR, RC, RE] miles
  let inIngresos = false
  for (const r of rows) {
    const c0 = String(r?.[1] ?? r?.[0] ?? '').trim()
    const c2 = String(r?.[2] ?? '').trim()
    if (c2 === 'Ingresos' || String(r?.[2] ?? '') === 'Ingresos') inIngresos = true
    if (c2 === 'Gastos') inIngresos = false
    if (inIngresos && /^[1-9]$/.test(c0)) {
      capsWb[Number(c0)] = [parseEs(r[4]), parseEs(r[5]), parseEs(r[6]), parseEs(r[7]), parseEs(r[8])]
    }
  }
  const detalle: Record<string, unknown> = {}
  const mags: LiqMag[] = ['imported', 'importer', 'importel', 'importec']
  // columnas del workbook: [PI, PresupuestoDefinitivo, Derechos, RecaudaciónEC, RecaudaciónECerrados]
  // mapeo Access: imported→col1, importer→col2, importel→col3, importec→col4
  const colFor: Record<LiqMag, number> = { imported: 1, importer: 2, importel: 3, importec: 4 }
  for (const c of CAPS) {
    const w = capsWb[c]
    if (!w) continue
    const entry: Record<string, unknown> = {}
    for (const mag of mags) {
      const a = all[mag][`I${c}`] / 1000
      const wv = w[colFor[mag]]
      entry[mag] = {
        workbook_miles: wv,
        access_todos_identes_miles: a,
        ratio: wv ? a / wv : null,
        diff_miles: a - wv,
      }
    }
    detalle[`I${c}`] = entry
  }
  return {
    archivo: path.basename(file),
    hoja: 'Tabla 1',
    identes_inventario_con_eco: identesInvConEco,
    columnas_workbook: ['Presupuesto Inicial', 'Presupuesto Definitivo', 'Derechos Reconocidos Netos', 'Recaudación Líquida EC', 'Recaudación Líquida ECerrados'],
    mapeo_access: { imported: 'Presupuesto Definitivo/Previsiones Definitivas', importer: 'Derechos Reconocidos Netos', importel: 'Recaudación Líquida EC', importec: 'Recaudación Líquida ECerrados' },
    ingresos: detalle,
  }
}

/** ¿EL2025CT corresponde a liq2024 o a liq2025? Test Albanchez + targets. */
function diagnoseEl2025ct(): Record<string, unknown> {
  const file = path.join(CONPREL_DIR, 'EL2025CT.xlsx')
  if (!fs.existsSync(file)) return { error: 'sin EL2025CT' }
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
  const info = findEntitySheet(wb)
  if (!info) return { error: 'sin hoja entidades' }
  const rows = parseEntityRows(wb, info)
  const alba = rows.find((r) => r.ine5 === '04004')
  // Access liq2024 Albanchez importer I1
  const ecoL = loadPipe('loader_eco_liq2024.csv')
  let accI1 = 0
  for (const r of ecoL) {
    if (r.idente === '631' && r.cdcta.trim() === '1' && r.tipreig === 'I') accI1 += parseEs(r.importer)
  }
  // targets liq2025av (si existe)
  let targetI1: number | null = null
  try {
    const t = fs.readFileSync(path.join(CSV_DIR, 'liq2025av_targets_chapters.csv'), 'utf8')
    for (const line of t.split(/\r?\n/)) {
      if (!line.includes('"631"') || !line.includes('"I"') || !line.includes('"1"')) continue
      const cells = line.match(/"(?:[^"]|"")*"|[^,]*/g)?.filter((_, i) => i % 2 === 0).map((s) => s.replace(/^"|"$/g, '')) ?? []
      // header: id,idente,tip,cdcta,imported,importer,importel,importec
      if (cells.length >= 6 && cells[2] === 'I' && cells[3] === '1') {
        targetI1 = parseEs(cells[5])
      }
    }
  } catch {
    /* opcional */
  }
  const titulo = String(
    (XLSX.utils.sheet_to_json(wb.Sheets[info.sheet], { header: 1, raw: true, defval: null }) as unknown[][])[1]?.[0] ?? '',
  )
  return {
    archivo: 'EL2025CT.xlsx',
    titulo_hoja_entidades: titulo.replace(/\s+/g, ' ').trim(),
    hoja: info.sheet,
    etiqueta_grupo_I: info.labelI,
    albanchez_importer_I1_workbook: alba ? alba.I[0] : null,
    albanchez_importer_I1_access_liq2024: accI1,
    match_liq2024: alba ? Math.abs(alba.I[0] - accI1) <= TOL_EUR : false,
    albanchez_importer_I1_targets_liq2025av: targetI1,
    match_liq2025av: alba && targetI1 !== null ? Math.abs(alba.I[0] - targetI1) <= TOL_EUR : null,
    conclusion:
      alba && Math.abs(alba.I[0] - accI1) > TOL_EUR
        ? 'EL2025CT NO cuadra con Liquidaciones2024 Access (es la liquidación 2025); la validación previa V2 que usaba EL2025CT contra LIQ-2024 estaba mal emparejada.'
        : 'EL2025CT cuadra con LIQ-2024',
  }
}

main()
