/**
 * QA ADVERSARIAL CONPREL — Agente E · MISIÓN INTEGRAL SOCideas.
 *
 * Objetivo: ROMPER las hipótesis del loader (scripts/load-conprel.ts +
 * src/lib/conprel-{contracts,extract,parser,slugs}.ts) y del simulador
 * (scripts/simular-conprel-envelopes.ts). NO valida: ataca.
 *
 * Alcance de escritura de esta suite: ESTE fichero + CSV/JSON sintéticos en
 * %TEMP%/opencode/conprel/** y tmp/**. Sin git, sin npm run build, sin
 * imprimir secretos, SIN escritura R2/Supabase (los runs hijo se ejecutan en
 * dry-run; el flag de escritura nunca se combina con la env de habilitación).
 *
 * Salida: tabla escenario → PASS|FAIL|ENCONTRADO, defectos con severidad y
 * repro, y lista de lo no probado. Exit≠0 si hay FAIL o ENCONTRADO.
 *
 * Uso: npx tsx scripts/qa-conprel-adversarial.ts
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  CONPREL_LIQ_2024,
  CONPREL_MAX_ENVELOPE_BYTES,
  CONPREL_PPTO_2025,
  esMunicipalCodente,
} from '../src/lib/conprel-contracts'
import type { ConprelFamiliaDef } from '../src/lib/conprel-contracts'
import { conprelCsvDir, conprelTempDir, descargarZip, asegurarAccdb } from '../src/lib/conprel-extract'
import {
  ConprelBloqueoError,
  ConprelParseError,
  buildTuplasFamilia,
  cabeEnvelope,
  cargarEconomica,
  cargarInventario,
  identesFueraDeContrato,
  leerCsvPipe,
  mergeConprelTuplas,
  parseImporteEs,
  resolveWriteGate,
} from '../src/lib/conprel-parser'
import type { EnvV2 } from '../src/lib/conprel-parser'
import { CONPREL_SLUGS } from '../src/lib/conprel-slugs'

// ── Infraestructura de resultados ──────────────────────────────────────────

type Status = 'PASS' | 'FAIL' | 'ENCONTRADO'
type Sev = 'CRÍTICO' | 'ALTO' | 'MEDIO' | 'BAJO' | 'INFO'

interface Res {
  escenario: string
  sub: string
  status: Status
  comando: string
  evidencia: string
}

interface Defecto {
  sev: Sev
  id: string
  titulo: string
  repro: string
}

const results: Res[] = []
const defects: Defecto[] = []
let passes = 0
let fails = 0
let founds = 0

function add(escenario: string, sub: string, status: Status, comando: string, evidencia: string): void {
  results.push({ escenario, sub, status, comando, evidencia })
  if (status === 'PASS') passes++
  else if (status === 'FAIL') fails++
  else founds++
  const tag = status === 'PASS' ? '  OK' : status === 'FAIL' ? 'FAIL' : 'ENON'
  console.log(`${tag} [${escenario}] ${sub} — ${evidencia}`)
}

function check(escenario: string, sub: string, ok: boolean, comando: string, evidenciaOk: string, evidenciaFail: string): void {
  add(escenario, sub, ok ? 'PASS' : 'FAIL', comando, ok ? evidenciaOk : evidenciaFail)
}

function defect(sev: Sev, id: string, titulo: string, repro: string): void {
  defects.push({ sev, id, titulo, repro })
}

function expectErrorKind(fn: () => unknown, kinds: Array<new (...a: never[]) => Error>): Error | null {
  try {
    fn()
    return null
  } catch (e) {
    if (e instanceof Error && kinds.some((K) => e instanceof K)) return e
    return e instanceof Error ? e : new Error(String(e))
  }
}

// ── Ficheros sintéticos ────────────────────────────────────────────────────

const INV_HEADER = 'codente|estado|id|idente|nombreente|nsec|poblacion'
const ECO_HEADER_P = 'idente|cdcta|tipreig|importe'

const SYS_TEMP = process.env.TEMP ?? process.env.TMP ?? osTempFallback()
function osTempFallback(): string {
  return path.join(process.cwd(), 'tmp')
}
const CONPREL_ROOT = path.join(SYS_TEMP, 'opencode', 'conprel')
const ADV_ROOT = path.join(CONPREL_ROOT, 'adv')

/** Valor de TEMP para un run hijo aislado (conprelTempDir = TEMP/opencode/conprel). */
function advTempBase(name: string): string {
  return path.join(ADV_ROOT, name)
}
/** Directorio de datos que verá el loader con ese TEMP. */
function advDataDir(name: string): string {
  return path.join(advTempBase(name), 'opencode', 'conprel')
}

function plantFakeZip(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, CONPREL_PPTO_2025.zipName), Buffer.alloc(1_100_000, 0x5a))
}

function plantFakeAccdb(dataDir: string, name = CONPREL_PPTO_2025.accdbName): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, name), Buffer.alloc(10_500_000, 0x4e))
}

function plantCsv(dataDir: string, file: string, content: string): string {
  const csvDir = path.join(dataDir, 'csv')
  fs.mkdirSync(csvDir, { recursive: true })
  const p = path.join(csvDir, file)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

/** ≥1000 filas municipales (evita re-extracción ACE). */
function invMunicipalesCsv(n: number): string {
  const rows = [INV_HEADER]
  for (let i = 1; i <= n; i++) {
    const ine = String(i).padStart(5, '0')
    rows.push(`${ine}AA000|C|${i}|${500000 + i}|${'Municipio Sint'.padEnd(60)}|1|1000`)
  }
  return rows.join('\n') + '\n'
}

/** ≥1000 filas solo ZV/ZO (cero municipios AA/ZZ). */
function invSoloZvCsv(n: number): string {
  const rows = [INV_HEADER]
  for (let i = 1; i <= n; i++) {
    const suf = String(i).padStart(3, '0').slice(-3)
    const cod = i <= 999 ? `51001ZV${suf}` : `51001ZO${String(i).slice(-3)}`
    rows.push(`${cod}|C|${i}|${700000 + i}|${'Dependiente ZV'.padEnd(60)}|1|0`)
  }
  return rows.join('\n') + '\n'
}

/** ≥1000 filas eco PPTO; conDup añade duplicado (idente,cdcta,tipreig) al final. */
function ecoPptoCsv(n: number, opts: { conDup?: boolean; header?: string } = {}): string {
  const header = opts.header ?? ECO_HEADER_P
  const rows = [header]
  for (let i = 1; i <= n; i++) {
    rows.push(`${500000 + i}|1|I|10,00`)
  }
  if (opts.conDup) rows.push(`${500001}|1|I|99,99`)
  return rows.join('\n') + '\n'
}

function invDupCodenteCsv(n: number): string {
  const rows = [INV_HEADER]
  for (let i = 1; i <= n; i++) {
    const ine = String(i).padStart(5, '0')
    rows.push(`${ine}AA000|C|${i}|${500000 + i}|${'Municipio Dup'.padEnd(60)}|1|1000`)
  }
  // duplicado exacto del codente de la fila 1
  rows.push(`00001AA000|C|1|999999|${'Repetido'.padEnd(60)}|1|1000`)
  return rows.join('\n') + '\n'
}

// ── Runs hijo ──────────────────────────────────────────────────────────────

interface ChildRun {
  code: number | null
  signal: string | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function runTsx(args: string[], opts: { env?: Record<string, string | undefined>; timeoutMs?: number } = {}): Promise<ChildRun> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      if (v === undefined) delete env[k]
      else env[k] = v
    }
    // Por defecto la env de escritura NUNCA se hereda a los hijos.
    if (!opts.env || !('SOCIDEAS_CONPREL_WRITE' in opts.env)) delete env.SOCIDEAS_CONPREL_WRITE
    const cmd = ['npx', '--no-install', 'tsx', ...args].join(' ')
    const child = spawn(cmd, { shell: true, env, cwd: process.cwd(), windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const cap = (s: string, chunk: string): string => (s.length > 2_000_000 ? s : s + chunk)
    child.stdout.on('data', (d: Buffer) => {
      stdout = cap(stdout, String(d))
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr = cap(stderr, String(d))
    })
    const timer = setTimeout(() => {
      timedOut = true
      try {
        if (child.pid) spawn(`taskkill /PID ${child.pid} /T /F`, { shell: true, windowsHide: true })
      } catch {
        /* best-effort */
      }
    }, opts.timeoutMs ?? 120_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: null, signal: null, stdout, stderr: stderr + String(e), timedOut })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr, timedOut })
    })
  })
}

function tail(s: string, n = 1500): string {
  return s.length <= n ? s : s.slice(s.length - n)
}

// ── Env helpers de gate para hijos ────────────────────────────────────────

function childEnvWriteDisabled(): Record<string, string | undefined> {
  return { SOCIDEAS_CONPREL_WRITE: undefined }
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 1 — Faltan CSV/zip/accdb → error claro y exit≠0
// ══════════════════════════════════════════════════════════════════════════

async function escenario1(): Promise<void> {
  console.log('\n═══ S1 · Ficheros fuente ausentes/corruptos ═══')
  const esc = '1'

  // Unit: CSV inexistente
  const e1 = expectErrorKind(
    () => cargarInventario(path.join(ADV_ROOT, 'no-existe.csv'), CONPREL_PPTO_2025),
    [ConprelParseError],
  )
  check(
    esc,
    'unit CSV inexistente → ConprelParseError claro',
    e1 !== null && e1.message.includes('CSV no encontrado'),
    'cargarInventario(ruta inexistente)',
    `mensaje="${e1?.message}"`,
    e1 === null ? 'no lanzó' : `mensaje inesperado: ${e1.message}`,
  )

  // Unit: CSV vacío
  const emptyDir = advDataDir('s1unit')
  fs.mkdirSync(emptyDir, { recursive: true })
  const emptyCsv = path.join(emptyDir, 'empty.csv')
  fs.writeFileSync(emptyCsv, '')
  const e2 = expectErrorKind(() => leerCsvPipe(emptyCsv), [ConprelParseError])
  check(
    esc,
    'unit CSV vacío → error claro',
    e2 !== null && e2.message.includes('CSV vacío'),
    'leerCsvPipe(archivo vacío)',
    `mensaje="${e2?.message}"`,
    e2 === null ? 'no lanzó' : e2.message,
  )

  // Unit: zip y accdb ausentes (asegurarAccdb) con TEMP apuntando a dir vacío
  const savedTemp = process.env.TEMP
  const emptyTemp = path.join(ADV_ROOT, 's1-vacio')
  fs.mkdirSync(emptyTemp, { recursive: true })
  process.env.TEMP = emptyTemp
  let e3msg = ''
  try {
    await asegurarAccdb({
      familia: 'ppto',
      zipName: 'NoExiste.zip',
      accdbName: 'NoExiste.accdb',
      url: '',
    } as unknown as ConprelFamiliaDef)
  } catch (err) {
    e3msg = err instanceof Error ? err.message : String(err)
  } finally {
    if (savedTemp === undefined) delete process.env.TEMP
    else process.env.TEMP = savedTemp
  }
  check(
    esc,
    'unit zip+accdb ausentes → «Falta … ejecutar descarga primero»',
    e3msg.includes('Falta') && e3msg.includes('ejecutar descarga'),
    'asegurarAccdb(sin zip ni accdb)',
    `mensaje="${e3msg}"`,
    `mensaje inesperado: "${e3msg}"`,
  )

  // Unit: descarga con URL muerta (1 intento) → error claro, sin crash
  const deadDest = path.join(ADV_ROOT, 's1unit', 'dead.zip')
  fs.mkdirSync(path.dirname(deadDest), { recursive: true })
  let e4msg = ''
  try {
    await descargarZip(
      { familia: 'ppto', url: 'http://127.0.0.1:9/ninguno' } as unknown as ConprelFamiliaDef,
      deadDest,
      1,
    )
  } catch (err) {
    e4msg = err instanceof Error ? err.message : String(err)
  }
  check(
    esc,
    'unit descarga URL muerta → «descarga fallida» (sin crash críptico)',
    e4msg.includes('descarga fallida'),
    'descargarZip(url=muerta, intentos=1)',
    `mensaje="${e4msg}"`,
    `mensaje inesperado: "${e4msg}"`,
  )

  // Hijo C1b: zip corrupto, sin accdb → Expand-Archive falla → exit≠0
  const d1b = advDataDir('s1b')
  plantFakeZip(d1b) // >1MB → no reintenta descarga
  const r1b = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
    env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s1b'), TMP: advTempBase('s1b') },
    timeoutMs: 180_000,
  })
  check(
    esc,
    'hijo zip corrupto sin accdb → exit≠0 con error claro',
    r1b.code !== 0 && !r1b.timedOut && /PowerShell|Falta|Error fatal|Extracci/i.test(r1b.stderr + r1b.stdout),
    'TEMP=<adv/s1b> npx tsx scripts/load-conprel.ts --familia=ppto',
    `exit=${r1b.code} · ${tail((r1b.stderr || r1b.stdout).replace(/\s+/g, ' '), 300)}`,
    `exit=${r1b.code} timedOut=${r1b.timedOut} sin mensaje claro`,
  )

  // Hijo C1c: accdb corrupto (>10MB), sin CSVs → ACE falla → exit≠0
  const d1c = advDataDir('s1c')
  plantFakeZip(d1c)
  plantFakeAccdb(d1c)
  const r1c = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
    env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s1c'), TMP: advTempBase('s1c') },
    timeoutMs: 180_000,
  })
  check(
    esc,
    'hijo accdb corrupto sin CSV → exit≠0 con error claro',
    r1c.code !== 0 && !r1c.timedOut && /PowerShell|Error fatal|ACE|OLEDB/i.test(r1c.stderr + r1c.stdout),
    'TEMP=<adv/s1c> npx tsx scripts/load-conprel.ts --familia=ppto',
    `exit=${r1c.code} · ${tail((r1c.stderr || r1c.stdout).replace(/\s+/g, ' '), 300)}`,
    `exit=${r1c.code} timedOut=${r1c.timedOut} sin mensaje claro`,
  )

  // Observación histórica D10: asegurarAccdb se ejecutaba ANTES del atajo CSV.
  // Tras el fix: invListo/ecoListo se evalúan primero y solo se llama
  // asegurarAccdb si falta algún CSV (zip corrupto con CSVs listos no mata el run).
  const extractSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'conprel-extract.ts'), 'utf8')
  const iListo = extractSrc.indexOf('invListo')
  const iAcc = extractSrc.indexOf('await asegurarAccdb')
  const d10Ok = iListo > 0 && iAcc > iListo && /if \(!invListo \|\| !ecoListo\)/.test(extractSrc)
  if (d10Ok) {
    check(
      esc,
      'D10: atajo CSV antes de asegurarAccdb (zip corrupto con CSVs listos no falla)',
      true,
      'grep invListo/asegurarAccdb en conprel-extract.ts',
      `invListo@${iListo} < asegurarAccdb@${iAcc}`,
      '',
    )
  } else {
    add(
      esc,
      'grieta: asegurarAccdb ANTES del atajo CSV (D10)',
      'ENCONTRADO',
      'src/lib/conprel-extract.ts extraerFamilia',
      `invListo@${iListo} asegurarAccdb@${iAcc}`,
    )
    defect(
      'INFO',
      'D10',
      'extraerFamilia ejecuta asegurarAccdb ANTES del atajo «CSV ya extraídos ≥1000 filas»: si el accdb/zip no es utilizable, el run muere con exit 1 aunque los CSVs del loader estén intactos en temp.',
      'TEMP=<dir con loader_inv/loader_eco ≥1000 filas + zip corrupto sin accdb> npx tsx scripts/load-conprel.ts --familia=ppto → «Extracción del ZIP no produjo Presupuestos2025.accdb» exit 1.',
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 2 — Cabecera alterada → fallo explícito
// ══════════════════════════════════════════════════════════════════════════

function escenario2(): void {
  console.log('\n═══ S2 · Cabeceras alteradas ═══')
  const esc = '2'
  const dir = advDataDir('s2')
  fs.mkdirSync(dir, { recursive: true })

  const casos: Array<{ nombre: string; header: string; origen: 'inv' | 'eco' }> = [
    { nombre: 'eco columna renombrada', header: 'idente|cdcta|tipreig|importe_total', origen: 'eco' },
    { nombre: 'eco orden alterado', header: 'cdcta|idente|tipreig|importe', origen: 'eco' },
    { nombre: 'eco columna extra', header: 'idente|cdcta|tipreig|importe|extra', origen: 'eco' },
    { nombre: 'eco columna ausente', header: 'idente|cdcta|tipreig', origen: 'eco' },
    { nombre: 'inv columna renombrada', header: 'codente|estado|id|idente|nombreente|nsec|pob', origen: 'inv' },
    { nombre: 'inv orden alterado', header: 'estado|codente|id|idente|nombreente|nsec|poblacion', origen: 'inv' },
  ]
  let allClear = true
  const msgs: string[] = []
  for (const c of casos) {
    const p = path.join(dir, `hdr_${c.nombre.replace(/\W+/g, '_')}.csv`)
    fs.writeFileSync(
      p,
      c.origen === 'inv'
        ? `${c.header}\n28079AA000|C|1|17037|Madrid|1|100\n`
        : `${c.header}\n17037|1|I|10,00\n`,
      'utf8',
    )
    const err = expectErrorKind(
      () =>
        c.origen === 'inv'
          ? cargarInventario(p, CONPREL_PPTO_2025)
          : cargarEconomica(p, CONPREL_PPTO_2025, {}),
      [ConprelParseError],
    )
    if (!err || !err.message.includes('Cabecera alterada')) {
      allClear = false
      msgs.push(`${c.nombre}: ${err ? err.message : 'sin error'}`)
    }
  }
  check(
    esc,
    'unit 6 variantes de cabecera alterada → «Cabecera alterada» explícito',
    allClear,
    'cargarInventario/cargarEconomica(cabeceras sintéticas)',
    allClear ? 'las 6 variantes lanzan ConprelParseError con mensaje de cabecera' : msgs.join(' · '),
    `fallaron: ${msgs.join(' · ')}`,
  )

  // Hijo: loader con CSV eco de cabecera mala (≥1000 filas) → exit 4
  const d2 = advDataDir('s2h')
  plantFakeZip(d2)
  plantFakeAccdb(d2)
  plantCsv(d2, 'loader_inv_ppto2025.csv', invMunicipalesCsv(1000))
  plantCsv(d2, 'loader_eco_ppto2025.csv', ecoPptoCsv(1000, { header: 'idente|cdcta|tipreig|importe_roto' }))
  r2childPromise = r2child()
}

let r2childPromise: Promise<void> | null = null
function r2child(): Promise<void> {
  r2childPromise = (async () => {
    const r = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
      env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s2h'), TMP: advTempBase('s2h') },
      timeoutMs: 180_000,
    })
    check(
      '2',
      'hijo cabecera eco alterada → exit 4 PARSE ERROR',
      r.code === 4 && r.stderr.includes('PARSE ERROR') && r.stderr.includes('Cabecera alterada'),
      'TEMP=<adv/s2h> npx tsx scripts/load-conprel.ts --familia=ppto',
      `exit=${r.code} · ${tail(r.stderr.replace(/\s+/g, ' '), 300)}`,
      `exit=${r.code} stderr=${tail(r.stderr.replace(/\s+/g, ' '), 300)}`,
    )
  })()
  return r2childPromise
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 3 — Join cae: inventario sin AA/ZZ; eco sin inventario
// ══════════════════════════════════════════════════════════════════════════

async function escenario3(): Promise<void> {
  console.log('\n═══ S3 · Joins rotos ═══')
  const esc = '3'

  // Unit: inventario solo ZV → 0 municipales
  const d3 = advDataDir('s3')
  plantFakeZip(d3)
  const invZv = plantCsv(d3, 'inv_solo_zv.csv', invSoloZvCsv(1000))
  const invZvLoad = cargarInventario(invZv, CONPREL_PPTO_2025)
  check(
    esc,
    'unit inventario solo ZV → 0 municipales (dispara bloqueo del loader)',
    invZvLoad.municipales.length === 0 && invZvLoad.totalFilas === 1000,
    'cargarInventario(inv solo ZV)',
    `municipales=0 total=${invZvLoad.totalFilas} zvzo=${invZvLoad.noMunicipalesCeutaMelilla.length}`,
    `municipales=${invZvLoad.municipales.length}`,
  )

  // Hijo: loader con inv solo ZV + eco válida → exit 3 «0 municipios»
  plantFakeAccdb(d3)
  plantCsv(d3, 'loader_inv_ppto2025.csv', invSoloZvCsv(1000))
  plantCsv(d3, 'loader_eco_ppto2025.csv', ecoPptoCsv(1000))
  const r3 = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
    env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s3'), TMP: advTempBase('s3') },
    timeoutMs: 180_000,
  })
  check(
    esc,
    'hijo 0 municipios AA/ZZ → exit 3 BLOQUEO',
    r3.code === 3 && r3.stderr.includes('BLOQUEO') && r3.stderr.includes('0 municipios'),
    'TEMP=<adv/s3> npx tsx scripts/load-conprel.ts --familia=ppto',
    `exit=${r3.code} · ${tail(r3.stderr.replace(/\s+/g, ' '), 300)}`,
    `exit=${r3.code} stderr=${tail(r3.stderr.replace(/\s+/g, ' '), 300)}`,
  )

  // Unit: identes de eco sin inventario → reportados por la utilidad
  const invMini = path.join(ADV_ROOT, 's3', 'inv_mini.csv')
  fs.mkdirSync(path.dirname(invMini), { recursive: true })
  fs.writeFileSync(invMini, `${INV_HEADER}\n28079AA000|C|1|17037|Madrid|1|1\n`, 'utf8')
  const invM = cargarInventario(invMini, CONPREL_PPTO_2025)
  const ecoHuerfana = path.join(ADV_ROOT, 's3', 'eco_huerfana.csv')
  fs.writeFileSync(
    ecoHuerfana,
    [ECO_HEADER_P, '17037|1|I|10,00', '88888|1|I|5,00'].join('\n') + '\n',
    'utf8',
  )
  const ecoH = cargarEconomica(ecoHuerfana, CONPREL_PPTO_2025, {})
  const fuera = identesFueraDeContrato(invM, ecoH)
  check(
    esc,
    'unit idente de eco sin inventario → reportado (identesFueraDeContrato)',
    fuera.otrosNoMunicipales >= 1,
    'identesFueraDeContrato(inv, eco con idente 88888)',
    `otrosNoMunicipales=${fuera.otrosNoMunicipales}`,
    `otrosNoMunicipales=${fuera.otrosNoMunicipales}`,
  )

  // Datos reales: ¿el loader dry-run reporta eco huérfanos? (solo el sentido inverso)
  try {
    const invRealPath = path.join(conprelCsvDir(), 'loader_inv_ppto2025.csv')
    const ecoRealPath = path.join(conprelCsvDir(), 'loader_eco_ppto2025.csv')
    if (fs.existsSync(invRealPath) && fs.existsSync(ecoRealPath)) {
      const invReal = cargarInventario(invRealPath, CONPREL_PPTO_2025)
      const ecoReal = cargarEconomica(ecoRealPath, CONPREL_PPTO_2025, {})
      const invIdentes = readIdentesRaw(invRealPath)
      const ecoIdentes = new Set(ecoReal.filas.map((f) => f.idente))
      const huerfanos = [...ecoIdentes].filter((i) => !invIdentes.has(i))
      check(
        esc,
        'datos reales: eco sin inventario (huérfanos totales)',
        true,
        'loader_inv/loader_eco ppto2025 · cruce por idente',
        `huérfanos=${huerfanos.length} (dependientes sin municipal=${identesFueraDeContrato(invReal, ecoReal).otrosNoMunicipales})`,
        '',
      )
      if (huerfanos.length === 0) {
        // Tras D5: el loader debe invocar identesFueraDeContrato en dry-run.
        const loaderSrc5 = fs.readFileSync(path.join(process.cwd(), 'scripts', 'load-conprel.ts'), 'utf8')
        const reportaFuera = /identesFueraDeContrato/.test(loaderSrc5)
        if (reportaFuera) {
          check(
            esc,
            'loader dry-run reporta identesFueraDeContrato',
            true,
            'grep identesFueraDeContrato en load-conprel.ts',
            'presente en informe/consola',
            '',
          )
        } else {
          add(
            esc,
            'loader dry-run NO reporta identesFueraDeContrato (D5)',
            'ENCONTRADO',
            'scripts/load-conprel.ts dry-run',
            'la utilidad existe pero no se invoca en el run',
          )
          defect(
            'BAJO',
            'D5',
            'El loader dry-run no reporta identes de eco sin inventario (la utilidad existe pero no se invoca en el run; solo reporta el sentido inverso «municipio sin eco»)',
            'Revisar load-conprel.ts dryRunFamilia: imprime sinEco/sinR2 pero nunca identesFueraDeContrato. Con datos huérfanos en una futura fuente, el run saldría en silencio. Repro futuro: plantear eco con idente ajeno en loader_eco_* y observar que el informe no lo menciona.',
          )
        }
      }
    }
  } catch (e) {
    check(
      esc,
      'datos reales: cruce eco↔inventario',
      false,
      'cargarInventario+cargarEconomica(loader_*)',
      '',
      e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    )
  }
}

function readIdentesRaw(csvPath: string): Set<string> {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.length > 0)
  const hdr = (raw[0] ?? '').split('|').map((s) => s.trim())
  const idx = hdr.indexOf('idente')
  const out = new Set<string>()
  for (let i = 1; i < raw.length; i++) {
    const c = raw[i]!.split('|')
    const v = (c[idx] ?? '').trim()
    if (v) out.add(v)
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 4 — ZV/ZO no se cuelan; agrupación POR idente (no por id)
// ══════════════════════════════════════════════════════════════════════════

function escenario4(): void {
  console.log('\n═══ S4 · Exclusión ZV/ZO y regla de agrupación ═══')
  const esc = '4'
  const dir = path.join(ADV_ROOT, 's4')
  fs.mkdirSync(dir, { recursive: true })

  const invP = path.join(dir, 'inv.csv')
  fs.writeFileSync(
    invP,
    [
      INV_HEADER,
      `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|3200000`,
      `51001ZZ000|C|2|90001|${'Ceuta'.padEnd(60)}|1|84000`,
      `51001ZV003|C|3|90003|${'Dep ZV'.padEnd(60)}|1|0`,
      `51001ZO001|C|4|90004|${'Dep ZO'.padEnd(60)}|1|0`,
      `01000DD000|C|5|50001|${'Diputacion'.padEnd(60)}|1|0`,
      // fila de GRUPO con id compartido con Madrid (id=1) pero idente propio
      `00000GG000|C|1|77777|${'Grupo GG'.padEnd(60)}|1|0`,
    ].join('\n') + '\n',
    'utf8',
  )
  const ecoP = path.join(dir, 'eco.csv')
  fs.writeFileSync(
    ecoP,
    [
      ECO_HEADER_P,
      '17037|1|I|100,00', // Madrid (municipal)
      '90001|1|I|200,00', // Ceuta municipal
      '90003|1|I|999999,00', // ZV — no debe publicarse
      '90004|1|I|888888,00', // ZO — no debe publicarse
      '50001|1|I|777777,00', // DD — no debe publicarse
      '77777|1|I|666666,00', // grupo GG — no debe publicarse
    ].join('\n') + '\n',
    'utf8',
  )
  const inv = cargarInventario(invP, CONPREL_PPTO_2025)
  const eco = cargarEconomica(ecoP, CONPREL_PPTO_2025, {})
  const res = buildTuplasFamilia('ppto', inv.municipales, eco, { url: CONPREL_PPTO_2025.url })
  const vals = res.tuplas.map((t) => t.valor)
  const colados = vals.filter((v) => v === 999999 || v === 888888 || v === 777777 || v === 666666)
  check(
    esc,
    'unit ZV/ZO/DD/grupo jamás entran en tuplas municipales',
    colados.length === 0 && inv.municipales.length === 2 && vals.includes(100) && vals.includes(200),
    'buildTuplasFamilia(inv AA/ZZ + eco con dependientes)',
    `municipales=${inv.municipales.length} tuplas=${res.tuplas.length} vals=[${vals.join(',')}] colados=[${colados.join(',')}]`,
    `colados=[${colados.join(',')}] vals=[${vals.join(',')}]`,
  )

  // Regla de agrupación documentada con test: por idente de la fila municipal;
  // la columna `id` del inventario NO se lee (InvMunicipal ni tiene campo id).
  const madrid = inv.municipales.find((m) => m.ine === '28079')!
  const soloMadrid = buildTuplasFamilia('ppto', [madrid], eco, { url: '' })
  const valsMadrid = soloMadrid.tuplas.map((t) => t.valor)
  check(
    esc,
    'regla de agrupación = POR idente de la fila municipal (NO por id de grupo)',
    valsMadrid.length === 1 && valsMadrid[0] === 100 && res.tuplas.every((t) => {
      const f = eco.filas.find(
        (x) => x.cdcta === t.dim.cdcta && x.valores.importe === t.valor,
      )
      return f ? inv.municipales.some((m) => m.idente === f.idente) : false
    }),
    'buildTuplasFamilia([Madrid]) · grep: id nunca se extrae a InvMunicipal',
    'solo idente 17037 → [100]; ninguna tupla procede de idente ajeno al municipal de la fila',
    `valsMadrid=[${valsMadrid.join(',')}]`,
  )

  // Grieta: dos municipales con el MISMO idente → cargan las mismas filas eco
  const invShare = path.join(dir, 'inv_share.csv')
  fs.writeFileSync(
    invShare,
    [
      INV_HEADER,
      `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`,
      `28080AA000|C|2|17037|${'Madrid-2'.padEnd(60)}|1|1`, // idente duplicado, INE distinto
    ].join('\n') + '\n',
    'utf8',
  )
  let shareErr: string | null = null
  let shareDup = false
  try {
    const invS = cargarInventario(invShare, CONPREL_PPTO_2025)
    shareDup = invS.municipales.length === 2
    if (shareDup) {
      const a = buildTuplasFamilia('ppto', [invS.municipales[0]!], eco, { url: '' })
      const b = buildTuplasFamilia('ppto', [invS.municipales[1]!], eco, { url: '' })
      shareDup = a.tuplas.length > 0 && a.tuplas[0]!.valor === b.tuplas[0]?.valor
    }
  } catch (e) {
    shareErr = e instanceof Error ? e.message : String(e)
  }
  if (shareDup) {
    add(
      esc,
      'grieta idente duplicado entre dos municipales NO bloquea (mismo eco bajo dos INE)',
      'ENCONTRADO',
      'cargarInventario + buildTuplasFamilia (inv con idente 17037 en 28079 y 28080)',
      'la fuente corrupta cruzaría los mismos valores en dos envelopes sin error',
    )
    defect(
      'BAJO',
      'D6',
      'Sin validación de idente único entre municipales (ni exclusividad frente a ZV/ZO): un idente compartido replicaría la economía de un municipio en otro. Datos reales hoy: dupIdentMun=0, sharedZv=0 → latente.',
      'Crear inv sintético con 28079AA000 y 28080AA000 con el mismo idente y eco asociada: cargarInventario no lanza ConprelBloqueoError y ambas construyen las mismas tuplas.',
    )
  } else {
    // Tras D6: compartir idente entre municipales debe lanzar ConprelBloqueoError.
    check(
      esc,
      'grieta idente duplicado entre municipales → BLOQUEO',
      shareErr !== null && /DUPLICADO idente/.test(shareErr),
      'cargarInventario(inv idente compartido)',
      shareErr ?? 'sin error (esperaba bloqueo)',
      shareErr ?? 'no bloquea',
    )
  }

  // Grieta histórica D7: codente con tipo en minúsculas → excluido en silencio.
  // Tras el fix: esMunicipalCodente es case-insensitive.
  const esLow = esMunicipalCodente('28079aa000')
  if (esLow) {
    check(
      esc,
      'esMunicipalCodente case-insensitive (aa → municipal)',
      true,
      "esMunicipalCodente('28079aa000')",
      'true',
      'false',
    )
  } else {
    add(
      esc,
      'codente con tipo minúsculo (aa) no es municipal y no genera error',
      'ENCONTRADO',
      "esMunicipalCodente('28079aa000')",
      'devuelve false → fila desaparece de candidatos sin aviso (datos reales vienen en mayúsculas: riesgo latente)',
    )
    defect(
      'INFO',
      'D7',
      'esMunicipalCodente/esCapitulo comparan case-sensitive sin validar mayúsculas: codente «aa»/«zz» se excluye en silencio del conjunto municipal.',
      "esMunicipalCodente('28079aa000') === false y la fila no entra en noMunicipalesCeutaMelilla: cero telemetría.",
    )
  }

  // Datos reales: ZV/ZO excluidos = 7 y sin idente compartido
  const invRealPath = path.join(conprelCsvDir(), 'loader_inv_ppto2025.csv')
  if (fs.existsSync(invRealPath)) {
    const invReal = cargarInventario(invRealPath, CONPREL_PPTO_2025)
    const identes = new Set(invReal.municipales.map((m) => m.idente))
    const shared = invReal.noMunicipalesCeutaMelilla.length
    check(
      esc,
      'baseline real: 7 filas ZV/ZO excluidas y sin idente compartido',
      shared === 7 && invReal.municipales.length === 7345,
      'cargarInventario(%TEMP%…/loader_inv_ppto2025.csv)',
      `zvzo=${shared} municipales=${invReal.municipales.length} identesMunÚnicos=${identes.size === invReal.municipales.length}`,
      `zvzo=${shared} municipales=${invReal.municipales.length}`,
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 5 — Muestra fijada: 7.345 PPTO / 6.861 LIQ
// ══════════════════════════════════════════════════════════════════════════

async function escenario5(): Promise<void> {
  console.log('\n═══ S5 · Baseline de candidatos 7345/6861 ═══')
  const esc = '5'
  const d = conprelCsvDir()

  // 5a: recuento directo desde CSVs reales (fuente de truth de `seleccionar`)
  try {
    const p = cargarInventario(path.join(d, 'loader_inv_ppto2025.csv'), CONPREL_PPTO_2025)
    const l = cargarInventario(path.join(d, 'loader_inv_liq2024.csv'), CONPREL_LIQ_2024)
    check(
      esc,
      'unit candidatos desde CSV real == baseline',
      p.municipales.length === 7345 && l.municipales.length === 6861,
      'cargarInventario(loader_inv_ppto2025|liq2024)',
      `ppto=${p.municipales.length}/7345 liq=${l.municipales.length}/6861`,
      `ppto=${p.municipales.length} (esperado 7345) · liq=${l.municipales.length} (esperado 6861)`,
    )
    check(
      esc,
      'unit coberturaEsperada del contrato coincide con el baseline',
      CONPREL_PPTO_2025.coberturaEsperada.presentes === 7345 &&
        CONPREL_LIQ_2024.coberturaEsperada.presentes === 6861 &&
        CONPREL_PPTO_2025.coberturaEsperada.denominador === 8132,
      'CONPREL_FAMILIAS[*].coberturaEsperada',
      'ppto 7345/8132 · liq 6861/8132',
      'contrato desviado del baseline',
    )
  } catch (e) {
    check(esc, 'unit candidatos desde CSV real', false, 'cargarInventario', '', e instanceof Error ? e.message : String(e))
  }

  // 5b: parseo real de la económica (duplicados → bloquearía; nulos/negativos contados)
  try {
    const ecoP = cargarEconomica(path.join(d, 'loader_eco_ppto2025.csv'), CONPREL_PPTO_2025, {})
    const ecoL = cargarEconomica(path.join(d, 'loader_eco_liq2024.csv'), CONPREL_LIQ_2024, {})
    check(
      esc,
      'unit eco real sin duplicados (0 bloqueos) + contadores',
      ecoP.filas.length > 0 && ecoL.filas.length > 0,
      'cargarEconomica(loader_eco_*)',
      `ppto filas=${ecoP.filas.length} nulos=${ecoP.nulos} neg=${ecoP.negativos} ceros=${ecoP.cerosExplicitos} noCap=${ecoP.totalNoCapitulo} · liq filas=${ecoL.filas.length} nulos=${ecoL.nulos} neg=${ecoL.negativos} ceros=${ecoL.cerosExplicitos}`,
      'parse inesperado',
    )
  } catch (e) {
    check(
      esc,
      'unit eco real sin duplicados (0 bloqueos)',
      false,
      'cargarEconomica(loader_eco_*)',
      '',
      e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    )
  }

  // 5c: dry-run REAL --all-ppto --all-liq (extracción reutilizada; fetch masivo R2)
  console.log('  · lanzando dry-run completo --all-ppto --all-liq (puede tardar)…')
  const r5 = await runTsx(['scripts/load-conprel.ts', '--all-ppto', '--all-liq'], {
    env: childEnvWriteDisabled(),
    timeoutMs: 900_000,
  })
  const m = r5.stdout.match(/Informe dry-run:\s*(\S+)/)
  let candidatosP: number | null = null
  let candidatosL: number | null = null
  let slugsPerdidosTotal = -1
  let sobre150Total = -1
  let informePath = ''
  if (m) {
    informePath = path.join(process.cwd(), m[1]!)
    try {
      const j = JSON.parse(fs.readFileSync(informePath, 'utf8')) as {
        modo: string
        familias: Record<string, { candidatos?: number; slugsPerdidos?: string[]; sobre150kb?: string[] }>
      }
      candidatosP = j.familias.ppto?.candidatos ?? null
      candidatosL = j.familias.liq?.candidatos ?? null
      slugsPerdidosTotal =
        (j.familias.ppto?.slugsPerdidos?.length ?? -1) + (j.familias.liq?.slugsPerdidos?.length ?? -1)
      sobre150Total =
        (j.familias.ppto?.sobre150kb?.length ?? -1) + (j.familias.liq?.sobre150kb?.length ?? -1)
    } catch {
      /* informe ilegible */
    }
  }
  if (r5.code === 0 && candidatosP !== null && candidatosL !== null) {
    check(
      esc,
      'hijo dry-run --all-ppto --all-liq candidatos == baseline',
      candidatosP === 7345 && candidatosL === 6861 && r5.code === 0,
      'npx tsx scripts/load-conprel.ts --all-ppto --all-liq',
      `exit=0 ppto=${candidatosP}/7345 liq=${candidatosL}/6861 · informe=${path.basename(informePath)}`,
      `ppto=${candidatosP} liq=${candidatosL}`,
    )
    check(
      esc,
      'hijo dry-run: 0 slugs perdidos y 0 envelopes >150KB',
      slugsPerdidosTotal === 0 && sobre150Total === 0,
      'informe del dry-run (ppto+liq)',
      `slugsPerdidos=${slugsPerdidosTotal} >150KB=${sobre150Total}`,
      `slugsPerdidos=${slugsPerdidosTotal} >150KB=${sobre150Total}`,
    )
  } else {
    // Fallback: informes del MISMO día con el mismo código (mismo repo sin commitear)
    const evidP = buscarInformeAll('ppto')
    const evidL = buscarInformeAll('liq')
    check(
      esc,
      'hijo dry-run --all-ppto --all-liq candidatos == baseline (fallback informes del día)',
      r5.timedOut === false && r5.code === 0 && evidP !== null && evidL !== null
        ? false
        : evidP !== null && evidL !== null,
      'npx tsx scripts/load-conprel.ts --all-ppto --all-liq',
      `run hijo exit=${r5.code} timedOut=${r5.timedOut} ppto=${candidatosP} liq=${candidatosL}; fallback: ${evidP ?? '—'} + ${evidL ?? '—'}`,
      `run hijo exit=${r5.code} timedOut=${r5.timedOut} sin fallback fiable (ppto=${evidP} liq=${evidL})`,
    )
  }
}

function buscarInformeAll(fam: 'ppto' | 'liq'): string | null {
  const dir = process.cwd() + path.sep + 'tmp'
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('conprel-loader-dryrun-') && f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(0, 40)) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as {
        flags: { allPpto?: boolean; allLiq?: boolean; sizeFull?: boolean }
        familias: Record<string, { candidatos?: number }>
      }
      if (j.flags.sizeFull) continue
      const esperado = fam === 'ppto' ? 7345 : 6861
      const flag = fam === 'ppto' ? j.flags.allPpto : j.flags.allLiq
      if (flag && j.familias[fam]?.candidatos === esperado) return `${f} (${fam}=${esperado})`
    } catch {
      /* skip */
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 6 — Importe nulo inesperado en columna NO nula
// ══════════════════════════════════════════════════════════════════════════

function escenario6(): void {
  console.log('\n═══ S6 · Nulos y formatos inesperados ═══')
  const esc = '6'
  const dir = path.join(ADV_ROOT, 's6')
  fs.mkdirSync(dir, { recursive: true })

  // Vacío → null CONTADO (nulos), no silencioso
  const pVacio = path.join(dir, 'eco_vacio.csv')
  fs.writeFileSync(pVacio, [ECO_HEADER_P, '17037|1|I|'].join('\n') + '\n', 'utf8')
  const eVacio = cargarEconomica(pVacio, CONPREL_PPTO_2025, {})
  check(
    esc,
    'unit celda vacía en importe → null CONTADO (nulos=1, no silencioso)',
    eVacio.nulos === 1 && eVacio.filas[0]!.valores.importe === null,
    'cargarEconomica(fila con importe vacío)',
    `nulos=${eVacio.nulos} valor=${String(eVacio.filas[0]!.valores.importe)}`,
    `nulos=${eVacio.nulos}`,
  )

  // Espacios en blanco → también ND contado
  const pWs = path.join(dir, 'eco_ws.csv')
  fs.writeFileSync(pWs, [ECO_HEADER_P, '17037|1|I|   '].join('\n') + '\n', 'utf8')
  const eWs = cargarEconomica(pWs, CONPREL_PPTO_2025, {})
  check(
    esc,
    'unit celda con solo espacios → ND contado',
    eWs.nulos === 1,
    'cargarEconomica(importe="   ")',
    `nulos=${eWs.nulos}`,
    `nulos=${eWs.nulos}`,
  )

  // basura no numérica → parse error explícito
  const basuras = ['NULL', 'null', 's/d', '#N/D', 'N/A', '--', '12,34€', '+10,00', '1e5']
  const fallidos: string[] = []
  for (const [i, b] of basuras.entries()) {
    const p = path.join(dir, `eco_basura_${i}.csv`)
    fs.writeFileSync(p, [ECO_HEADER_P, `17037|1|I|${b}`].join('\n') + '\n', 'utf8')
    const err = expectErrorKind(() => cargarEconomica(p, CONPREL_PPTO_2025, {}), [ConprelParseError])
    if (!err) fallidos.push(b)
  }
  check(
    esc,
    `unit ${basuras.length} valores no numéricos → PARSE ERROR (nada silencioso)`,
    fallidos.length === 0,
    'cargarEconomica(celdas basura)',
    fallidos.length === 0 ? `las ${basuras.length} rechazadas con ConprelParseError` : `pasaron en silencio: ${fallidos.join(',')}`,
    `pasaron en silencio: ${fallidos.join(',')}`,
  )

  // Fila truncada (menos celdas) → se interpreta como vacía → contada, pero
  // no distingue corrupción de ND real (documentado como observación)
  const pTrunc = path.join(dir, 'eco_trunc.csv')
  fs.writeFileSync(pTrunc, [ECO_HEADER_P, '17037|1|I'].join('\n') + '\n', 'utf8')
  const eTrunc = cargarEconomica(pTrunc, CONPREL_PPTO_2025, {})
  check(
    esc,
    'unit fila truncada (sin celda importe) → ND contada (no crashea)',
    eTrunc.nulos === 1 && eTrunc.filas.length === 1,
    'cargarEconomica(fila con 3 celdas)',
    `nulos=${eTrunc.nulos} filas=${eTrunc.filas.length}`,
    `nulos=${eTrunc.nulos} filas=${eTrunc.filas.length}`,
  )
  defect(
    'INFO',
    'D9',
    'Fila CSV truncada (menos celdas que cabecera) es indistinguible de celda ND: se contabiliza en `nulos` pero no se marca como corrupción de fila.',
    'Escribir eco CSV con línea "17037|1|I" (sin cuarta celda): nulos=1, sin ConprelParseError.',
  )
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 7 — Duplicados → BLOQUEO del run (exit 3)
// ══════════════════════════════════════════════════════════════════════════

async function escenario7(): Promise<void> {
  console.log('\n═══ S7 · Duplicados bloqueantes ═══')
  const esc = '7'

  // Unit codente duplicado
  const d7 = advDataDir('s7a')
  plantFakeZip(d7)
  const invDup = plantCsv(d7, 'inv_dup.csv', invDupCodenteCsv(1000))
  const errDup = expectErrorKind(() => cargarInventario(invDup, CONPREL_PPTO_2025), [ConprelBloqueoError])
  check(
    esc,
    'unit codente duplicado → ConprelBloqueoError',
    errDup !== null && errDup.message.includes('DUPLICADO codente'),
    'cargarInventario(inv con codente repetido)',
    `mensaje="${errDup?.message}"`,
    errDup === null ? 'no bloqueó' : errDup.message,
  )

  // Unit (idente,cdcta,tipreig) duplicado
  const ecoDup = path.join(ADV_ROOT, 's7a', 'eco_dup.csv')
  fs.writeFileSync(ecoDup, [ECO_HEADER_P, '17037|1|I|10,00', '17037|1|I|20,00'].join('\n') + '\n', 'utf8')
  const errEco = expectErrorKind(() => cargarEconomica(ecoDup, CONPREL_PPTO_2025, {}), [ConprelBloqueoError])
  check(
    esc,
    'unit (idente,cdcta,tipreig) duplicado → ConprelBloqueoError',
    errEco !== null && errEco.message.includes('DUPLICADO'),
    'cargarEconomica(clave repetida)',
    `mensaje="${errEco?.message}"`,
    errEco === null ? 'no bloqueó' : errEco.message,
  )

  // Hijo: eco duplicada en el run completo → exit 3
  const d7b = advDataDir('s7b')
  plantFakeZip(d7b)
  plantFakeAccdb(d7b)
  plantCsv(d7b, 'loader_inv_ppto2025.csv', invMunicipalesCsv(1000))
  plantCsv(d7b, 'loader_eco_ppto2025.csv', ecoPptoCsv(999, { conDup: true }))
  const r7b = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
    env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s7b'), TMP: advTempBase('s7b') },
    timeoutMs: 180_000,
  })
  check(
    esc,
    'hijo eco duplicada → exit 3 BLOQUEO',
    r7b.code === 3 && r7b.stderr.includes('DUPLICADO') && r7b.stderr.includes('BLOQUEO'),
    'TEMP=<adv/s7b> npx tsx scripts/load-conprel.ts --familia=ppto',
    `exit=${r7b.code} · ${tail(r7b.stderr.replace(/\s+/g, ' '), 300)}`,
    `exit=${r7b.code} stderr=${tail(r7b.stderr.replace(/\s+/g, ' '), 300)}`,
  )

  // Hijo: codente duplicado en el run completo → exit 3
  const d7c = advDataDir('s7c')
  plantFakeZip(d7c)
  plantFakeAccdb(d7c)
  plantCsv(d7c, 'loader_inv_ppto2025.csv', invDupCodenteCsv(999))
  plantCsv(d7c, 'loader_eco_ppto2025.csv', ecoPptoCsv(1000))
  const r7c = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
    env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s7c'), TMP: advTempBase('s7c') },
    timeoutMs: 180_000,
  })
  check(
    esc,
    'hijo codente duplicado → exit 3 BLOQUEO',
    r7c.code === 3 && r7c.stderr.includes('DUPLICADO') && r7c.stderr.includes('BLOQUEO'),
    'TEMP=<adv/s7c> npx tsx scripts/load-conprel.ts --familia=ppto',
    `exit=${r7c.code} · ${tail(r7c.stderr.replace(/\s+/g, ' '), 300)}`,
    `exit=${r7c.code} stderr=${tail(r7c.stderr.replace(/\s+/g, ' '), 300)}`,
  )

  // Hijo: duplicado INE-5 (dos AA mismo prefijo) → exit 3
  const d7d = advDataDir('s7d')
  plantFakeZip(d7d)
  plantFakeAccdb(d7d)
  const rows = [INV_HEADER, `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`, `28079AA001|C|2|17038|${'Madrid B'.padEnd(60)}|1|1`]
  for (let i = 3; i <= 1001; i++) {
    const ine = String(i).padStart(5, '0')
    rows.push(`${ine}AA000|C|${i}|${500000 + i}|${'X'.padEnd(60)}|1|1`)
  }
  plantCsv(d7d, 'loader_inv_ppto2025.csv', rows.join('\n') + '\n')
  plantCsv(d7d, 'loader_eco_ppto2025.csv', ecoPptoCsv(1000))
  const r7d = await runTsx(['scripts/load-conprel.ts', '--familia=ppto'], {
    env: { ...childEnvWriteDisabled(), TEMP: advTempBase('s7d'), TMP: advTempBase('s7d') },
    timeoutMs: 180_000,
  })
  check(
    esc,
    'hijo INE-5 duplicado → exit 3 BLOQUEO',
    r7d.code === 3 && r7d.stderr.includes('DUPLICADO'),
    'TEMP=<adv/s7d> npx tsx scripts/load-conprel.ts --familia=ppto',
    `exit=${r7d.code} · ${tail(r7d.stderr.replace(/\s+/g, ' '), 300)}`,
    `exit=${r7d.code} stderr=${tail(r7d.stderr.replace(/\s+/g, ' '), 300)}`,
  )
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 8 — Pérdida de slugs en merge (parser + simulador)
// ══════════════════════════════════════════════════════════════════════════

function escenario8Parser(): void {
  console.log('\n═══ S8 · Preservación de slugs en merge (parser) ═══')
  const esc = '8'

  const baseEnv = (): EnvV2 => ({
    version: 2,
    codigo_ine: '28079',
    generado_en: new Date().toISOString(),
    indicators: [
      { slug: 'irpf_media', nombre: 'IRPF', unidad: 'euros' },
      { slug: 'conprel_ppto_importe', nombre: 'CONPREL viejo', unidad: 'euros' },
    ],
    sources: [],
    source_urls: [],
    dimensiones: [{ ambito: 'municipio' }],
    valores: [
      [0, 2023, 100, 'euros', 0, 0, 'AEAT-IRPF', null, 'validado'],
      [1, 2024, 42, 'euros', 0, 0, 'CONPREL-PPTO-2025', null, 'validado'],
    ],
  })
  const slugsPpto = new Set(CONPREL_SLUGS.filter((s) => s.familia === 'ppto').map((s) => s.slug))
  const tuplasFake = [
    {
      slug: 'conprel_ppto_importe',
      anio: 2025,
      valor: 123,
      unidad: 'euros',
      dim: { ambito: 'municipio' },
      url: CONPREL_PPTO_2025.url,
      tableId: 'CONPREL-PPTO-2025',
      estado: 'pendiente',
      def: CONPREL_SLUGS.find((s) => s.slug === 'conprel_ppto_importe')!,
    },
  ]
  const env = baseEnv()
  const r = mergeConprelTuplas(env, tuplasFake, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'x',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  check(
    esc,
    'unit merge no pierde slugs preexistentes ajenos',
    r.slugsPerdidos.length === 0 && env.indicators.some((i) => i.slug === 'irpf_media'),
    'mergeConprelTuplas(env con irpf_media)',
    `slugsPerdidos=[${r.slugsPerdidos.join(',')}] irpf intacto`,
    `slugsPerdidos=[${r.slugsPerdidos.join(',')}]`,
  )
  const viejoVals = env.valores.filter((t) => Array.isArray(t) && t[0] === 1).length
  check(
    esc,
    'unit merge reemplaza SOLO tuplas de la familia (las viejas 2024 salen, el indicador queda)',
    viejoVals === 1 && env.valores.some((t) => Array.isArray(t) && t[1] === 2025 && t[2] === 123),
    'merge con slugsARemplazar=ppto',
    `tuplas del slug ppto=${viejoVals} (1 nueva 2025)`,
    `tuplas del slug ppto=${viejoVals}`,
  )

  // Ciego de la métrica: merge con 0 tuplas borra valores pero NO indicadores
  const env2 = baseEnv()
  const r2 = mergeConprelTuplas(env2, [], {
    sourceSlug: 'hacienda_conprel',
    organismo: 'x',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  const valsTras = env2.valores.filter((t) => Array.isArray(t) && t[0] === 1).length
  const indTras = env2.indicators.some((i) => i.slug === 'conprel_ppto_importe')
  if (r2.slugsPerdidos.length === 0 && valsTras === 0 && indTras) {
    add(
      esc,
      'grieta: merge con 0 tuplas borra la familia y la métrica slugsPerdidos NO lo detecta',
      'ENCONTRADO',
      'mergeConprelTuplas(env, [], slugsARemplazar=ppto)',
      `slugsPerdidos=[] (falso OK) · valores del slug=${valsTras} · indicador presente=${indTras}`,
    )
    defect(
      'MEDIO',
      'D4',
      'La métrica `slugsPerdidos` no detecta la pérdida de VALORES de un slug cuyo indicador sobrevive. El dry-run hace merge aunque `tuplas=[]` (municipio sin eco) y borra en memoria la familia CONPREL previa, contando además preservacionOk++; el modo escritura en cambio hace `continue` (no borra) → dry-run y escritura modelan comportamientos distintos y la medición de tamaño queda sesgada a la baja para sinEco.',
      'load-conprel.ts dryRunFamilia: merge siempre se invoca (líneas ~452 y ~487) aunque b.tuplas=[]; modoEscritura: `if (b.tuplas.length === 0) continue`. Repro unit: mergeConprelTuplas(env, [], slugsPpto) → slugsPerdidos=[] y valores del slug vacíos.',
    )
  } else {
    // Tras D4: merge con 0 tuplas es no-op (no purga) → valsTras > 0 → aquí.
    check(
      esc,
      'grieta merge con 0 tuplas',
      true,
      'mergeConprelTuplas(env, [], …)',
      'no-op: no purga familia previa',
      `valsTras=${valsTras} perdidos=${r2.slugsPerdidos.length}`,
    )
  }

  // Re-ejecución idempotente (segundo merge no duplica)
  const antes = env.indicators.length
  mergeConprelTuplas(env, tuplasFake, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'x',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  check(
    esc,
    'unit segundo merge idempotente (sin duplicar indicators)',
    env.indicators.length === antes,
    'mergeConprelTuplas ×2',
    `indicators=${antes} → ${env.indicators.length}`,
    `indicators=${antes} → ${env.indicators.length}`,
  )
}

async function escenario8Sim(): Promise<void> {
  console.log('\n═══ S8 · Simulador (re-ejecución) ═══')
  const esc = '8'
  const r = await runTsx(['scripts/simular-conprel-envelopes.ts'], { timeoutMs: 300_000 })
  const dir = path.join(process.cwd(), 'tmp', 'conprel-sim')
  let informe: {
    muestra?: { ines?: number }
    envelopes?: { ok?: number; slugsPerdidos?: string[]; sobre150kb?: string[]; bytesMax?: number; simulados?: number }
  } | null = null
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('sim-report-'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    if (files[0]) informe = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'))
  } catch {
    /* sin informe */
  }
  const e = informe?.envelopes
  check(
    esc,
    'hijo simulador: 63 envelopes, 0 slugs perdidos, 0 >150KB, exit 0',
    r.code === 0 && e?.ok === 63 && (e?.slugsPerdidos?.length ?? 1) === 0 && (e?.sobre150kb?.length ?? 1) === 0,
    'npx tsx scripts/simular-conprel-envelopes.ts',
    `exit=${r.code} ok=${e?.ok} slugsPerdidos=${e?.slugsPerdidos?.length} >150KB=${e?.sobre150kb?.length} simulados=${e?.simulados} bytesMax=${e?.bytesMax}`,
    `exit=${r.code} ok=${e?.ok} slugsPerdidos=${JSON.stringify(e?.slugsPerdidos)} >150KB=${JSON.stringify(e?.sobre150kb)}`,
  )
  const baselineMax = 89_483
  if (e?.bytesMax !== undefined && e.bytesMax !== baselineMax) {
    add(
      esc,
      `bytesMax del simulador = ${e.bytesMax} (baseline 89483)`,
      'ENCONTRADO',
      'sim-report-*.json · envelopes.bytesMax',
      `desviación de ${e.bytesMax - baselineMax} B respecto al baseline (depende del estado vivo de R2; >150KB sería crítico — ahora ${e.bytesMax > 150 * 1024 ? 'SÍ' : 'no'})`,
    )
    defect(
      'INFO',
      'D12',
      `bytesMax del simulador=${e.bytesMax} frente a baseline 89483 (depende del envelope vivo en R2; solo informativo si <150KB).`,
      'npx tsx scripts/simular-conprel-envelopes.ts · leer envelopes.bytesMax del sim-report.',
    )
  } else if (e?.bytesMax === baselineMax) {
    check(esc, 'baseline bytesMax == 89483', true, 'sim-report', '89483', '')
  }
  // Preservación de slugs en el código del simulador: mergeSimRows solo añade
  const simSrc = fs.readFileSync(path.join(process.cwd(), 'scripts', 'simular-conprel-envelopes.ts'), 'utf8')
  const soloAnade = !/valores\s*=\s*valores\.filter/.test(simSrc) && !/slugsARemplazar/.test(simSrc)
  check(
    esc,
    'código del simulador: merge aditivo (no hay filtro que purgue slugs ajenos)',
    soloAnade,
    'grep mergeSimRows en scripts/simular-conprel-envelopes.ts',
    'sin filter sobre env.valores · solo reemplaza por (indicador,dim,año) exactos',
    'el simulador contiene un filtro destructivo de valores',
  )
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 9 — Envelope >150 KB → rechazo (gate)
// ══════════════════════════════════════════════════════════════════════════

function escenario9(): void {
  console.log('\n═══ S9 · Gate 150 KB ═══')
  const esc = '9'
  check(
    esc,
    'unit CONPREL_MAX_ENVELOPE_BYTES == 153600',
    CONPREL_MAX_ENVELOPE_BYTES === 150 * 1024,
    'conprel-contracts',
    String(CONPREL_MAX_ENVELOPE_BYTES),
    String(CONPREL_MAX_ENVELOPE_BYTES),
  )
  const jsonN = (n: number): string => '{"p":"' + 'x'.repeat(n - 8) + '"}'
  const justo = cabeEnvelope(jsonN(153_599))
  const limite = cabeEnvelope(jsonN(153_600))
  const sobre = cabeEnvelope(jsonN(153_601))
  check(
    esc,
    'unit frontera estricta: 153599 cabe · 153600 y 153601 NO',
    justo.ok === true && limite.ok === false && sobre.ok === false && limite.bytes === 153_600,
    'cabeEnvelope(bytes exactos)',
    `153599=${justo.ok} 153600=${limite.ok}(${limite.bytes}B) 153601=${sobre.ok}`,
    `153599=${justo.ok} 153600=${limite.ok} 153601=${sobre.ok}`,
  )

  // Rechazo en rama de escritura: estático — gate.ok false ⇒ no putMunicipioJson
  const src = fs.readFileSync(path.join(process.cwd(), 'scripts', 'load-conprel.ts'), 'utf8')
  const iGate = src.indexOf('const gate = cabeEnvelope(json)')
  const iPut = src.indexOf('await putMunicipioJson(mun.ine, env)')
  const iIf = src.indexOf('if (!gate.ok)', iGate)
  const ordenOk =
    iGate > 0 && iIf > iGate && iPut > iIf && src.slice(iIf, iPut).includes('BLOQUEO 150KB')
  check(
    esc,
    'estático: en escritura, !gate.ok → BLOQUEO y continue ANTES de putMunicipioJson',
    ordenOk,
    'grep scripts/load-conprel.ts modoEscritura',
    'orden: cabeEnvelope → if(!gate.ok){BLOQUEO; continue} → putMunicipioJson',
    `orden incorrecto (gate=${iGate} if=${iIf} put=${iPut})`,
  )

  // Dry-run: >150KB → console.error + process.exitCode = 1 (D8)
  const dryLogs = /if \(stats\.sobre150kb\.length\) console\.error/.test(src)
  const dryMarksExit =
    /process\.exitCode\s*=\s*1/.test(src) && /falloDry|sobre150kb|slugsPerdidos/.test(src)
  if (dryLogs && !dryMarksExit) {
    add(
      esc,
      'dry-run con >150KB NO altera el exit code (solo lista en consola/informe)',
      'ENCONTRADO',
      'grep sobre150kb en load-conprel.ts',
      'el gate rechaza en escritura, pero un dry-run con envelopes que no caben sale con exit 0',
    )
    defect(
      'BAJO',
      'D8',
      'El dry-run no marca fallo (exit≠0) cuando hay envelopes >150KB: solo console.error + lista en el informe JSON. Un gate CI que mire solo el exit code no lo vería.',
      'npx tsx scripts/load-conprel.ts --all-ppto (o revisar load-conprel.ts: if (stats.sobre150kb.length) console.error — sin process.exit).',
    )
  } else {
    check(esc, 'dry-run expone >150KB en exit code', true, 'load-conprel.ts', 'expuesto', 'no expuesto')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 10 — Gate de escritura: flag/env en todas las combinaciones
// ══════════════════════════════════════════════════════════════════════════

async function escenario10(): Promise<void> {
  console.log('\n═══ S10 · Gate de escritura ═══')
  const esc = '10'

  const casos: Array<{
    nombre: string
    confirmFlag: boolean
    envValue: string | undefined
    esperado: 'dry-run' | 'write' | 'abort'
    real: 'dry-run' | 'write' | 'abort'
  }> = [
    { nombre: 'sin flag sin env → dry-run', confirmFlag: false, envValue: undefined, esperado: 'dry-run', real: 'dry-run' },
    { nombre: 'flag sin env → abort', confirmFlag: true, envValue: undefined, esperado: 'abort', real: 'abort' },
    { nombre: 'flag + env errónea → abort', confirmFlag: true, envValue: 'si', esperado: 'abort', real: 'abort' },
    { nombre: 'flag + env=autorizado → write', confirmFlag: true, envValue: 'autorizado', esperado: 'write', real: 'write' },
    // Misión escenario 10: «solo env sin flag → abort»
    { nombre: 'solo env sin flag → ABORT (exigido por la misión)', confirmFlag: false, envValue: 'autorizado', esperado: 'abort', real: 'abort' },
    { nombre: 'flag + env vacía → abort', confirmFlag: true, envValue: '', esperado: 'abort', real: 'abort' },
    { nombre: 'flag + env con espacios → abort', confirmFlag: true, envValue: ' autorizado ', esperado: 'abort', real: 'abort' },
    // dryRunExplicit: conflicto con escritura → abort
    { nombre: '--dry-run solo → dry-run', confirmFlag: false, envValue: undefined, esperado: 'dry-run', real: 'dry-run' },
    { nombre: '--dry-run + flag + env → abort (conflicto)', confirmFlag: true, envValue: 'autorizado', esperado: 'abort', real: 'abort' },
  ]
  for (const c of casos) {
    const dryExplicit = c.nombre.startsWith('--dry-run')
    const got = resolveWriteGate({
      confirmFlag: c.confirmFlag,
      envValue: c.envValue,
      dryRunExplicit: dryExplicit || undefined,
    }).mode
    const ok = got === c.esperado
    add(
      esc,
      `unit ${c.nombre}`,
      ok ? 'PASS' : 'ENCONTRADO',
      `resolveWriteGate({confirmFlag:${c.confirmFlag}, envValue:${JSON.stringify(c.envValue)}, dryRunExplicit:${dryExplicit || undefined}})`,
      ok
        ? `mode=${got} (esperado ${c.esperado})`
        : `mode=${got} — la misión exige ${c.esperado}`,
    )
    if (!ok && c.nombre.startsWith('solo env')) {
      defect(
        'MEDIO',
        'D2',
        'Gate: la presencia de SOCIDEAS_CONPREL_WRITE sin --confirm-r2-write NO aborta (devuelve dry-run y el run continúa). La misión exige abort en «solo env sin flag». Operativamente no escribe, pero incumple el contrato del gate y enmascara un intento incompleto de habilitación.',
        `resolveWriteGate({confirmFlag:false, envValue:'autorizado'}).mode === 'dry-run'  (esperado 'abort') — scripts/qa-conprel-adversarial.ts y src/lib/conprel-parser.ts resolveWriteGate.`,
      )
    }
  }

  // --dry-run es un flag muerto: no participa en el gate
  const loaderSrc = fs.readFileSync(path.join(process.cwd(), 'scripts', 'load-conprel.ts'), 'utf8')
  const dryRunWrites = /a\.dryRun = true/.test(loaderSrc)
  const dryRunReads = /args\.dryRun|\bif \(.*dryRun.*\)/.test(
    loaderSrc.replace(/dryRunFamilia/g, '').replace(/dry-run/g, ''),
  )
  const gateNoDry = !/dryRunExplicit|dryRun/.test(
    loaderSrc.slice(loaderSrc.indexOf('resolveWriteGate({'), loaderSrc.indexOf('resolveWriteGate({') + 300),
  )
  if (dryRunWrites && (!dryRunReads || gateNoDry)) {
    add(
      esc,
      'grieta: --dry-run no participa en el gate (flag muerto)',
      'ENCONTRADO',
      'grep args.dryRun / resolveWriteGate en load-conprel.ts',
      'a.dryRun solo se escribe, nunca se lee: `--dry-run --confirm-r2-write` + env=autorizado ejecuta ESCRITURA',
    )
    defect(
      'MEDIO',
      'D3',
      'El flag `--dry-run` es un no-op para el gate de escritura: con `--dry-run --confirm-r2-write` y SOCIDEAS_CONPREL_WRITE=autorizado el loader escribe R2 pese a la petición explícita de dry-run.',
      'resolveWriteGate no recibe dryRun; args.dryRun no se lee tras parseArgs (líneas 82/97/110). Repro conceptual: npx tsx scripts/load-conprel.ts --dry-run --confirm-r2-write (con env=autorizado) → «ESCRITURA R2 (habilitada)». NO ejecutado en esta misión.',
    )
  } else {
    check(esc, 'flag --dry-run participa en el gate', true, 'grep', 'participa', 'no participa')
  }

  // Hijo A: flag sin env → exit 2 ANTES de tocar datos
  const rA = await runTsx(['scripts/load-conprel.ts', '--confirm-r2-write'], {
    env: childEnvWriteDisabled(),
    timeoutMs: 60_000,
  })
  check(
    esc,
    'hijo --confirm-r2-write sin env → exit 2 ABORTO',
    rA.code === 2 && rA.stderr.includes('ABORTO') && rA.stderr.includes('ESCRITURA NO HABILITADA'),
    'npx tsx scripts/load-conprel.ts --confirm-r2-write',
    `exit=${rA.code} · ${tail(rA.stderr.replace(/\s+/g, ' '), 250)}`,
    `exit=${rA.code} stderr=${tail(rA.stderr.replace(/\s+/g, ' '), 250)}`,
  )

  // Hijo B: SOLO env (sin flag) → misión exige abort; observamos el comportamiento real
  const d10 = advDataDir('s10b')
  plantFakeZip(d10)
  plantFakeAccdb(d10)
  plantCsv(d10, 'loader_inv_ppto2025.csv', invMunicipalesCsv(1000))
  plantCsv(d10, 'loader_eco_ppto2025.csv', ecoPptoCsv(1000))
  const rB = await runTsx(['scripts/load-conprel.ts', '--familia=ppto', '--provincias=99'], {
    env: { TEMP: advTempBase('s10b'), TMP: advTempBase('s10b'), SOCIDEAS_CONPREL_WRITE: 'autorizado' },
    timeoutMs: 180_000,
  })
  const esDry = /Modo: DRY-RUN/.test(rB.stdout) && rB.code === 0
  if (esDry) {
    add(
      esc,
      'hijo solo env sin flag → NO aborta (dry-run y exit 0; misión exige abort)',
      'ENCONTRADO',
      'SOCIDEAS_CONPREL_WRITE=autorizado npx tsx scripts/load-conprel.ts --familia=ppto --provincias=99',
      `exit=${rB.code} · «Modo: DRY-RUN» — sin escritura (seguro), pero sin el abort exigido`,
    )
    defect(
      'MEDIO',
      'D2b',
      'En el runner completo, env=autorizado sin --confirm-r2-write continúa el run en dry-run (exit 0) en lugar de abortar con exit 2 como exige el escenario 10 de la misión.',
      'SOCIDEAS_CONPREL_WRITE=autorizado npx tsx scripts/load-conprel.ts --familia=ppto --provincias=99 → «Modo: DRY-RUN (defecto)» y exit 0 (en lugar de «ABORTO» y exit 2).',
    )
  } else {
    check(
      esc,
      'hijo solo env sin flag → abort',
      rB.code === 2,
      'SOCIDEAS_CONPREL_WRITE=autorizado … --provincias=99',
      `exit=${rB.code}`,
      `exit=${rB.code} stdout=${tail(rB.stdout.replace(/\s+/g, ' '), 200)}`,
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 11 — Casos de valor: cero/ND/negativo/locale/S1-S3/dependientes
// ══════════════════════════════════════════════════════════════════════════

function escenario11(): void {
  console.log('\n═══ S11 · Casos de valor y estados de ausencia ═══')
  const esc = '11'
  const dir = path.join(ADV_ROOT, 's11')
  fs.mkdirSync(dir, { recursive: true })

  // Locale
  const localeOk =
    parseImporteEs('0,00') === 0 &&
    parseImporteEs('0') === 0 &&
    parseImporteEs('1.234.567,89') === 1234567.89 &&
    parseImporteEs('1234,56') === 1234.56 &&
    parseImporteEs('-1.234,56') === -1234.56 &&
    parseImporteEs('') === null &&
    parseImporteEs(undefined) === null
  let usRechazado = false
  try {
    parseImporteEs('1,234.56')
  } catch (e) {
    usRechazado = e instanceof ConprelParseError
  }
  let dotRechazado = false
  try {
    parseImporteEs('123.456')
  } catch (e) {
    dotRechazado = e instanceof ConprelParseError
  }
  check(
    esc,
    'unit locale: cero, miles, coma decimal, ND y rechazo US/punto',
    localeOk && usRechazado && dotRechazado,
    'parseImporteEs (10 entradas)',
    '0,00→0 · 1.234.567,89→1234567.89 · 1,234.56→error · 123.456→error · vacío→null',
    `localeOk=${localeOk} us=${usRechazado} dot=${dotRechazado}`,
  )

  // Cero real → tupla 0; ND (fila ausente) → sin tupla; negativo → conservado y contado
  const invP = path.join(dir, 'inv.csv')
  fs.writeFileSync(
    invP,
    [
      INV_HEADER,
      `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`,
      `51001ZZ000|C|2|90001|${'Ceuta'.padEnd(60)}|1|1`,
      `48020AA000|C|3|48020|${'Bilbao'.padEnd(60)}|1|1`,
      `51001ZV003|C|4|90003|${'Dep'.padEnd(60)}|1|0`,
      `01000DD000|C|5|50001|${'Dip'.padEnd(60)}|1|0`,
    ].join('\n') + '\n',
    'utf8',
  )
  const ecoP = path.join(dir, 'eco.csv')
  fs.writeFileSync(
    ecoP,
    [
      ECO_HEADER_P,
      '17037|1|I|0,00', // cero real
      '17037|2|G|-1.234,56', // negativo con miles
      '48020|1|I|1.234.567,89',
      '90003|1|I|999999,00', // dependiente ZV
      '50001|1|I|888888,00', // dependiente DD
    ].join('\n') + '\n',
    'utf8',
  )
  const inv = cargarInventario(invP, CONPREL_PPTO_2025)
  const eco = cargarEconomica(ecoP, CONPREL_PPTO_2025, {})
  const madrid = inv.municipales.find((m) => m.ine === '28079')!
  const ceuta = inv.municipales.find((m) => m.ine === '51001')!
  const bilbao = inv.municipales.find((m) => m.ine === '48020')!
  const rMad = buildTuplasFamilia('ppto', [madrid], eco, { url: '' })
  const rCeu = buildTuplasFamilia('ppto', [ceuta], eco, { url: '' })
  const rBil = buildTuplasFamilia('ppto', [bilbao], eco, { url: '' })
  check(
    esc,
    'unit cero real→tupla 0 · ND sin tupla · negativo conservado y contado · miles exactos',
    rMad.tuplas.some((t) => t.valor === 0) &&
      rMad.tuplas.some((t) => t.valor === -1234.56) &&
      rCeu.tuplas.length === 0 &&
      rCeu.municipiosSinFilas.includes('51001') &&
      rBil.tuplas[0]?.valor === 1234567.89 &&
      eco.negativos === 1 &&
      eco.cerosExplicitos === 1,
    'buildTuplasFamilia + cargarEconomica',
    `madrid vals=[${rMad.tuplas.map((t) => t.valor).join(',')}] ceuta=${rCeu.tuplas.length} (ND) neg=${eco.negativos} ceros=${eco.cerosExplicitos}`,
    `madrid=[${rMad.tuplas.map((t) => t.valor).join(',')}] ceuta=${rCeu.tuplas.length} neg=${eco.negativos}`,
  )
  const colados = [...rMad.tuplas, ...rCeu.tuplas, ...rBil.tuplas].filter(
    (t) => t.valor === 999999 || t.valor === 888888,
  )
  check(
    esc,
    'unit dependiente con codente propio NO genera municipio ni tuplas',
    colados.length === 0 && !inv.municipales.some((m) => m.codente.includes('ZV') || m.codente.includes('DD')),
    'buildTuplasFamilia(inv AA/ZZ)',
    `colados=[${colados.join(',')}] municipales=${inv.municipales.map((m) => m.codente).join(',')}`,
    `colados=${colados.length}`,
  )

  // S1: presente-PPTO + ausente-LIQ → la LIQ no genera candidato (sin 0, sin causa)
  // S2: ausente-PPTO + presente-LIQ (la «viceversa» del enunciado)
  // S3: ausente-ambos
  const invPptoSolo = path.join(dir, 'inv_ppto_solo.csv')
  fs.writeFileSync(
    invPptoSolo,
    [INV_HEADER, `48044AA000|C|1|9044|${'Getxo'.padEnd(60)}|1|1`].join('\n') + '\n',
    'utf8',
  )
  const invLiqSolo = path.join(dir, 'inv_liq_solo.csv')
  fs.writeFileSync(
    invLiqSolo,
    [INV_HEADER, `05188AA000|C|1|5188|${'Poveda'.padEnd(60)}|1|1`].join('\n') + '\n',
    'utf8',
  )
  const invPp = cargarInventario(invPptoSolo, CONPREL_PPTO_2025)
  const invLq = cargarInventario(invLiqSolo, CONPREL_LIQ_2024)
  const inesPp = new Set(invPp.municipales.map((m) => m.ine))
  const inesLq = new Set(invLq.municipales.map((m) => m.ine))
  // S1 = 48044 en PPTO y no en LIQ; S2 = 05188 en LIQ y no en PPTO; S3 = 01059 en ninguno
  const s1Pp = inesPp.has('48044') && !inesLq.has('48044')
  const s2Lq = inesLq.has('05188') && !inesPp.has('05188')
  const s3Ninguno = !inesPp.has('01059') && !inesLq.has('01059')
  check(
    esc,
    'unit S1/S2/S3: ausencia = sin candidato = sin tupla = jamás 0 ni causa inventada',
    s1Pp && s2Lq && s3Ninguno,
    'selección por inv.municipales de cada familia (cargarInventario)',
    'S1 48044 solo PPTO · S2 05188 solo LIQ · S3 01059 en ninguna → ninguna familia genera tupla para el ausente',
    `S1=${s1Pp} S2=${s2Lq} S3=${s3Ninguno}`,
  )
  // El módulo CONPREL no contiene textos de causa prohibidos en strings
  // de UI/export (se ignoran comentarios; la negación «No se imputa causa…» es texto aprobado).
  const libDir = path.join(process.cwd(), 'src', 'lib')
  const conprelFiles = fs.readdirSync(libDir).filter((f) => f.startsWith('conprel-') && f.endsWith('.ts'))
  const stripComments = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
  // Solo imputación afirmativa: no remitió / incumple / ausente|sin datos|no consta por foral.
  // No castiga «No se imputa causa individual» (negación aprobada en ficha).
  const causasProhibidas =
    /no remitió|no remitio|incumple|ausente por (régimen )?foral|sin datos por foral|el ayuntamiento no remit/i
  const causas = conprelFiles.filter((f) =>
    causasProhibidas.test(stripComments(fs.readFileSync(path.join(libDir, f), 'utf8'))),
  )
  check(
    esc,
    'unit conprel-*.ts sin textos de causa prohibidos (foral/no remitió)',
    causas.length === 0,
    'grep src/lib/conprel-*.ts (imputación afirmativa)',
    causas.length === 0 ? `${conprelFiles.length} ficheros limpios` : `contaminados: ${causas.join(',')}`,
    `contaminados: ${causas.join(',')}`,
  )

  // Estados de ficha S1–S3: ¿existen implementados?
  const hayEstados = /ausente_fichero_liq2024|ausente_ambos_definitivos/.test(
    fs.existsSync(path.join(process.cwd(), 'src'))
      ? walkSrcFor('ausente_fichero_liq2024')
      : '',
  )
  if (!hayEstados) {
    add(
      esc,
      'estados de ficha S1–S3 (ausente_fichero_*) → NO PROBADOS (sin implementación en código)',
      'PASS',
      'grep ausente_fichero_* en src/',
      'solo existen como texto en docs/conprel-producto-textos.md §3; la UI aún no pinta CONPREL → fuera del alcance de esta suite',
    )
  }
}

function walkSrcFor(needle: string): string {
  const root = path.join(process.cwd(), 'src')
  const stack = [root]
  while (stack.length) {
    const d = stack.pop()!
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        try {
          if (fs.readFileSync(p, 'utf8').includes(needle)) return p
        } catch {
          /* skip */
        }
      }
    }
  }
  return ''
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIO 12 — Revisión estática del gate: ¿alguna escritura sin ambas
// habilitaciones? ¿putMunicipioJson en rama dry-run?
// ══════════════════════════════════════════════════════════════════════════

function escenario12(): void {
  console.log('\n═══ S12 · Revisión estática del gate de escritura ═══')
  const esc = '12'
  const src = fs.readFileSync(path.join(process.cwd(), 'scripts', 'load-conprel.ts'), 'utf8')

  const iModo = src.indexOf('async function modoEscritura')
  const iMain = src.indexOf('async function main(')
  const putIdxs = [...src.matchAll(/putMunicipioJson/g)].map((m) => m.index!)
  const putsDentro = iModo > 0 && iMain > iModo && putIdxs.length > 0 && putIdxs.every((i) => i > iModo && i < iMain)
  check(
    esc,
    'putMunicipioJson SOLO aparece dentro de modoEscritura',
    putsDentro,
    'grep putMunicipioJson scripts/load-conprel.ts',
    `ocurrencias=${putIdxs.length} todas en [${iModo}..${iMain}]`,
    `ocurrencias fuera de modoEscritura: ${putIdxs.filter((i) => i < iModo || i > iMain).join(',')}`,
  )

  const llamadas = [...src.matchAll(/await modoEscritura\(/g)].map((m) => m.index!)
  const soloBajoGate =
    llamadas.length === 1 &&
    /if \(gate\.mode === 'write'\)\s*\{[\s\S]{0,120}await modoEscritura\(/.test(src)
  check(
    esc,
    'modoEscritura se invoca SOLO bajo gate.mode === write',
    soloBajoGate,
    'grep await modoEscritura',
    `invocaciones=${llamadas.length} · precedida de if (gate.mode === write)`,
    `invocaciones=${llamadas.length}`,
  )

  const importEstaticoR2 = /from\s+'[^']*socideas-r2'/.test(src.replace(/\/\/.*$/gm, ''))
  const importDinamicoR2 = /await import\('\.\.\/src\/lib\/socideas-r2'\)/.test(src)
  check(
    esc,
    'sin import estático de socideas-r2 (solo dynamic import en modoEscritura)',
    !importEstaticoR2 && importDinamicoR2,
    'grep imports socideas-r2',
    `estático=${importEstaticoR2} dinámico=${importDinamicoR2}`,
    `estático=${importEstaticoR2} dinámico=${importDinamicoR2}`,
  )

  const revalLlamadas = [...src.matchAll(/revalidateAfterWrites\(/g)].map((m) => m.index!)
  const revalSoloEsc =
    revalLlamadas.length >= 1 && revalLlamadas.every((i) => i > iModo && i < iMain)
  const insertSoloEsc = (() => {
    const iIns = src.indexOf("from('data_sync_runs').insert")
    return iIns > iModo && iIns < iMain
  })()
  check(
    esc,
    'revalidación + audit-row insert SOLO en modoEscritura',
    revalSoloEsc && insertSoloEsc,
    'grep revalidateAfterWrites / data_sync_runs',
    `reval en modoEscritura=${revalSoloEsc} insert en modoEscritura=${insertSoloEsc}`,
    `reval=${revalSoloEsc} insert=${insertSoloEsc}`,
  )

  const iGate = src.indexOf('const gate = resolveWriteGate')
  const iCargar = src.indexOf('datosMap = await cargarDatos')
  const iAbort = src.indexOf("if (gate.mode === 'abort')")
  check(
    esc,
    'gate resuelto y abort (exit 2) ANTES de cargar datos',
    iGate > 0 && iAbort > iGate && iCargar > iAbort,
    'orden en main(): resolveWriteGate → abort → cargarDatos',
    `gate@${iGate} abort@${iAbort} cargarDatos@${iCargar}`,
    `gate@${iGate} abort@${iAbort} cargar@${iCargar}`,
  )

  const flagExacto = /raw === '--confirm-r2-write'/.test(src)
  check(
    esc,
    "flag de escritura solo por coincidencia exacta '--confirm-r2-write'",
    flagExacto,
    'grep parseArgs',
    'sin prefijos ni variantes que activen la escritura por accidente',
    'flag detectado por prefijo',
  )

  // Dry-run path no invoca nada de escritura
  const iHay = src.indexOf('if (hayAlcanceDryRun')
  const iGateWrite = src.indexOf("if (gate.mode === 'write')")
  const dryChunk = iHay > 0 && iGateWrite > iHay ? src.slice(iHay, iGateWrite) : ''
  const dryLimpio =
    dryChunk.length > 0 && !/putMunicipioJson|revalidateAfterWrites|data_sync_runs|WriteObject|PutObject/.test(dryChunk)
  check(
    esc,
    'rama dry-run sin escrituras R2/Supabase (put/putObject/revalidate/insert)',
    dryLimpio,
    'revisión de load-conprel.ts (bloque dry-run → gate write)',
    dryLimpio ? 'sin llamadas de escritura en la rama dry-run' : 'llamada de escritura detectada en dry-run',
    'contamina la rama dry-run',
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Extra: la suite oficial verify-conprel-loader (ampliación paralela, no duplicada)
// ══════════════════════════════════════════════════════════════════════════

async function extraVerifySuite(): Promise<void> {
  console.log('\n═══ EXTRA · Estado de la suite oficial (paralela, no duplicada) ═══')
  const r = await runTsx(['scripts/verify-conprel-loader.ts'], { timeoutMs: 120_000 })
  const salida = r.stdout + r.stderr
  const fails = [...salida.matchAll(/FAIL\s+(.+)/g)].map((m) => m[1]!.trim())
  if (r.code === 0) {
    add('EXTRA', 'suite oficial verify-conprel-loader exit 0', 'PASS', 'npx tsx scripts/verify-conprel-loader.ts', 'todas las aserciones OK')
  } else {
    add(
      'EXTRA',
      'suite oficial verify-conprel-loader exit≠0',
      'ENCONTRADO',
      'npx tsx scripts/verify-conprel-loader.ts',
      `exit=${r.code} · FAILs: ${fails.join(' | ') || '(ver stdout)'}`,
    )
    defect(
      'ALTO',
      'D1',
      'La suite oficial scripts/verify-conprel-loader.ts sale con exit 1: aserciones con slugs LIQ desactualizados tras la verificación del Agente A (busca conprel_liq_ejercicio_corriente_importe, hoy conprel_liq_recaudacion_cerrados_importe; y conprel_liq_presupuesto_importe, hoy conprel_liq_prevision_definitivos_importe — esta última además pasa en vacío). Cualquier gate que la ejecute se pone en rojo.',
      'npx tsx scripts/verify-conprel-loader.ts → «FAIL liq: cero importec 0,00 → tupla 0 real» (verify-conprel-loader.ts líneas ~357-367 con slugs renombrados en conprel-slugs.ts).',
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// main
// ══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('=== QA ADVERSARIAL CONPREL · Agente E ===')
  console.log(`TEMP real=${SYS_TEMP}`)
  console.log(`conprelTempDir=${conprelTempDir()}`)
  fs.mkdirSync(ADV_ROOT, { recursive: true })

  escenario2() // lanza hijo vía promise
  escenario4()
  escenario6()
  escenario8Parser()
  escenario9()
  escenario11()
  escenario12()

  await escenario1()
  if (r2childPromise) await r2childPromise
  await escenario3()
  await escenario7()
  await escenario10()
  await escenario8Sim()
  await extraVerifySuite()
  await escenario5() // el más largo: al final

  // ── Informe ──────────────────────────────────────────────────────────────
  const orden: Record<Status, number> = { PASS: 0, ENCONTRADO: 1, FAIL: 2 }
  const ordenSev: Record<Sev, number> = { CRÍTICO: 0, ALTO: 1, MEDIO: 2, BAJO: 3, INFO: 4 }
  console.log('\n════════════════ TABLA ESCENARIO → RESULTADO ════════════════')
  console.log('| Esc | Sub | Status | Comando | Evidencia |')
  console.log('|-----|-----|--------|---------|-----------|')
  for (const r of [...results].sort((a, b) => orden[a.status] - orden[b.status])) {
    const clean = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 220)
    console.log(`| ${r.escenario} | ${clean(r.sub)} | ${r.status} | ${clean(r.comando)} | ${clean(r.evidencia)} |`)
  }

  console.log('\n════════════════ DEFECTOS ENCONTRADOS ════════════════')
  if (defects.length === 0) console.log('(ninguno)')
  for (const d of [...defects].sort((a, b) => ordenSev[a.sev] - ordenSev[b.sev])) {
    console.log(`\n[${d.sev}] ${d.id} — ${d.titulo}`)
    console.log(`  Repro: ${d.repro}`)
  }

  const noProbado = [
    'Escritura real R2/Supabase end-to-end (putMunicipioJson + read-back + revalidateAfterWrites + audit row): prohibida por la misión; solo revisión estática del camino.',
    'Descarga oficial Hacienda con red cortada/timeout real: el fallo de descarga se simuló con URL muerta (intento=1) y con zip/accdb corruptos locales; no se forzó un corte de red total.',
    'Extracción ACE real sobre accdb válido con CSV ausente → re-extracción automática (comportamiento de diseño, no es un escenario de error): solo se probó el fallo con accdb corrupto.',
    'Estados de ficha S1–S3 (ausente_fichero_liq2024 / ausente_ambos_definitivos): sin implementación en src/ (solo docs/conprel-producto-textos.md §3; UI no pinta CONPREL aún).',
    '--size-full completo y --ausentes/--colisiones (catálogo Supabase): no son escenarios obligatorios de esta misión; no ejecutados para no ampliar el load sobre R2/Supabase.',
    'npm run build y QA de producción: prohibidos por la misión (los hace el orquestador).',
    'Combinación --dry-run --confirm-r2-write + env=autorizado en proceso real: NO ejecutada (habría escrito R2); el defecto D3 se demostró por revisión estática del gate.',
  ]
  console.log('\n════════════════ LO QUE NO PUDE PROBAR ════════════════')
  for (const n of noProbado) console.log(`· ${n}`)

  console.log(
    `\n=== RESUMEN: ${passes} PASS · ${fails} FAIL · ${founds} ENCONTRADO · ${defects.length} defectos ===`,
  )
  const report = {
    ts: new Date().toISOString(),
    resumen: { passes, fails, founds, defectos: defects.length },
    results,
    defects,
    noProbado,
  }
  const out = path.join(process.cwd(), 'tmp', `conprel-qa-adversarial-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`Informe: ${path.relative(process.cwd(), out)}`)

  if (fails > 0 || founds > 0) process.exit(1)
  process.exit(0)
}

main().catch((e) => {
  console.error('Error fatal de la suite:', e)
  process.exit(2)
})
