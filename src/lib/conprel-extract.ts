// Adquisición + extracción ACE→CSV determinista (CONPREL).
//
// - Si faltan zip/accdb en %TEMP%/opencode/conprel, descarga por URL oficial
//   (TipoPublicacion=Access, Ejercicio, TipoDato) con reintentos.
// - Extracción PowerShell + ACE OLEDB → CSV «|» en el mismo directorio.
//   SELECT de columnas mínimas; filtro de capítulo en SQL con fallback JS.
// - SHA-256 del cuerpo crudo del ZIP para el manifiesto del run.
// NO escribe R2/Supabase.

import { spawn } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { CONPREL_FAMILIAS, esCapitulo } from './conprel-contracts'
import type { ConprelFamilia, ConprelFamiliaDef } from './conprel-contracts'
import { CONPREL_PARSER_VERSION } from './conprel-contracts'

export function conprelTempDir(): string {
  return path.join(process.env.TEMP ?? process.env.TMP ?? '.', 'opencode', 'conprel')
}

export function conprelCsvDir(): string {
  return path.join(conprelTempDir(), 'csv')
}

export function sha256File(p: string): string {
  const h = crypto.createHash('sha256')
  const fd = fs.openSync(p, 'r')
  try {
    const buf = Buffer.allocUnsafe(1 << 20)
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null)
      if (n <= 0) break
      h.update(buf.subarray(0, n))
    }
  } finally {
    fs.closeSync(fd)
  }
  return h.digest('hex')
}

/** Descarga con reintentos. Devuelve bytes + sha256 del cuerpo crudo. */
export async function descargarZip(
  def: ConprelFamiliaDef,
  destPath: string,
  intentos = 4,
): Promise<{ bytes: number; sha256: string; descargado: boolean }> {
  if (fs.existsSync(destPath)) {
    const st = fs.statSync(destPath)
    if (st.size > 1_000_000) {
      return { bytes: st.size, sha256: sha256File(destPath), descargado: false }
    }
  }
  let lastErr: unknown
  for (let a = 1; a <= intentos; a++) {
    try {
      const r = await fetch(def.url, { signal: AbortSignal.timeout(600_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1_000_000) throw new Error(`ZIP sospechoso (${buf.length} B)`)
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, buf)
      return {
        bytes: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        descargado: true,
      }
    } catch (e) {
      lastErr = e
      if (a < intentos) await new Promise((x) => setTimeout(x, 5000 * a))
    }
  }
  throw new Error(`${def.familia}: descarga fallida tras ${intentos} intentos: ${lastErr}`)
}

/** Descomprime el ZIP oficial si falta el accdb (PowerShell Expand-Archive). */
export async function asegurarAccdb(def: ConprelFamiliaDef): Promise<string> {
  const dir = conprelTempDir()
  const accdb = path.join(dir, def.accdbName)
  if (fs.existsSync(accdb) && fs.statSync(accdb).size > 10_000_000) return accdb
  const zip = path.join(dir, def.zipName)
  if (!fs.existsSync(zip)) {
    throw new Error(`Falta ${zip} y ${def.accdbName}; ejecutar descarga primero`)
  }
  await runPowerShell(
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`,
  )
  // El ZIP puede nombrar el interno distinto: renombrar si aparece otro .accdb.
  if (!fs.existsSync(accdb)) {
    const found = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.accdb') && f !== def.accdbName)
    if (found) fs.renameSync(path.join(dir, found), accdb)
  }
  if (!fs.existsSync(accdb)) throw new Error(`Extracción del ZIP no produjo ${def.accdbName}`)
  return accdb
}

export function runPowerShell(script: string, timeoutMs = 10 * 60_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`PowerShell timeout (${timeoutMs} ms)`))
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`PowerShell exit ${code}: ${stderr.slice(0, 800) || stdout.slice(0, 800)}`))
    })
  })
}

/**
 * Script PS que vuelca una consulta SELECT a CSV «|» UTF-8 con el mínimo de
 * columnas. Los números/fechas se serializan en es-ES (coma decimal); los
 * textos se recortan. `extraWhere` opcional se añade al final del FROM.
 */
function psExportQuery(accdb: string, sql: string, outPath: string): string {
  const q = (s: string) => s.replace(/'/g, "''")
  const qs = (s: string) => `'${q(s)}'`
  return `
$ErrorActionPreference = 'Stop'
$cult = [System.Globalization.CultureInfo]::GetCultureInfo('es-ES')
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${q(accdb)};")
$conn.Open()
try {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = @'
${sql}
'@
  $reader = $cmd.ExecuteReader()
  $names = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $reader.FieldCount; $i++) { $names.Add($reader.GetName($i)) }
  $sw = [System.IO.StreamWriter]::new(${qs(outPath)}, $false, [System.Text.UTF8Encoding]::new($false))
  try {
    $sw.WriteLine(($names -join '|'))
    $n = 0
    while ($reader.Read()) {
      $vals = New-Object System.Collections.Generic.List[string]
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        $v = $reader.GetValue($i)
        if ($null -eq $v -or $v -is [System.DBNull]) { $vals.Add('') }
        elseif ($v -is [string]) { $vals.Add($v.Trim()) }
        elseif ($v -is [decimal]) { $vals.Add($v.ToString('0.############################', $cult)) }
        elseif ($v -is [double] -or $v -is [single]) { $vals.Add(([decimal][double]$v).ToString('0.############################', $cult)) }
        elseif ($v -is [int] -or $v -is [long] -or $v -is [int16] -or $v -is [byte]) { $vals.Add([string]$v) }
        else { $vals.Add(([string]$v).Trim()) }
      }
      $sw.WriteLine(($vals -join '|'))
      $n++
      if (($n % 200000) -eq 0) { Write-Output "ROWS $n" }
    }
    Write-Output "TOTAL $n"
  } finally { $sw.Dispose(); $reader.Close() }
} finally { $conn.Close() }
`
}

export interface ExtraccionResultado {
  familia: ConprelFamilia
  invPath: string
  ecoPath: string
  invFilas: number
  ecoFilas: number
  ecoCapitulos: number
  filtroCapituloSql: boolean
  ms: number
}

function contarLineas(p: string): number {
  const raw = fs.readFileSync(p, 'utf8')
  let n = 0
  for (const line of raw.split(/\r?\n/)) if (line.length > 0) n++
  return Math.max(0, n - 1)
}

/**
 * Extrae inventario completo + económico (solo capítulos si el SQL lo permite)
 * a CSVs con cabecera del contrato. Reutiliza CSVs existentes salvo force.
 */
export async function extraerFamilia(
  familia: ConprelFamilia,
  opts: { force?: boolean } = {},
): Promise<ExtraccionResultado> {
  const def = CONPREL_FAMILIAS[familia]
  const t0 = Date.now()
  const csvDir = conprelCsvDir()
  fs.mkdirSync(csvDir, { recursive: true })

  const invPath = path.join(csvDir, `loader_inv_${familia}${def.ejercicio}.csv`)
  const ecoPath = path.join(csvDir, `loader_eco_${familia}${def.ejercicio}.csv`)

  const invCols = def.invColumns.join(', ')
  const ecoMagCols = def.familia === 'liq' ? 'imported, importer, importel, importec' : 'importe'
  const ecoCols = `idente, cdcta, tipreig, ${ecoMagCols}`

  // Atajo CSV: si ambos CSVs ≥1000 filas y no hay --extract, NO se toca el
  // accdb/zip (D10: zip corrupto con CSVs listos no debe matar el run).
  const invListo = !opts.force && fs.existsSync(invPath) && contarLineas(invPath) >= 1000
  const ecoListo = !opts.force && fs.existsSync(ecoPath) && contarLineas(ecoPath) >= 1000
  let accdb = ''
  if (!invListo || !ecoListo) {
    accdb = await asegurarAccdb(def)
  }

  if (!invListo) {
    await runPowerShell(
      psExportQuery(accdb, `SELECT ${invCols} FROM tb_inventario`, invPath),
      10 * 60_000,
    )
  }

  let filtroCapituloSql = true
  if (!ecoListo) {
    try {
      // Capítulo = cdcta con 1 carácter tras Trim (texto relleno o numérico).
      const sql = `SELECT ${ecoCols} FROM tb_economica WHERE Len(Trim(cdcta)) = 1 AND tipreig IN ('I','G')`
      const { stdout } = await runPowerShell(psExportQuery(accdb, sql, ecoPath), 15 * 60_000)
      if (!/TOTAL \d+/.test(stdout)) throw new Error('sin TOTAL en la salida SQL con filtro')
    } catch {
      filtroCapituloSql = false
      // Fallback: mínimo de columnas sin WHERE; el filtro de capítulo se hace en JS.
      await runPowerShell(
        psExportQuery(accdb, `SELECT ${ecoCols} FROM tb_economica`, ecoPath),
        25 * 60_000,
      )
    }
  }

  // Si el fallback dejó la cabecera bien pero el filtro es JS, contamos capítulos.
  const ecoFilas = contarLineas(ecoPath)
  const ecoCapitulos = filtroCapituloSql
    ? ecoFilas
    : (() => {
        const raw = fs.readFileSync(ecoPath, 'utf8').split(/\r?\n/)
        let c = 0
        for (let i = 1; i < raw.length; i++) {
          const line = raw[i]
          if (!line) continue
          const cells = line.split('|')
          const cd = (cells[1] ?? '').trim()
          if (esCapitulo(cd)) c++
        }
        return c
      })()

  return {
    familia,
    invPath,
    ecoPath,
    invFilas: contarLineas(invPath),
    ecoFilas,
    ecoCapitulos,
    filtroCapituloSql,
    ms: Date.now() - t0,
  }
}

export interface ManifiestoFuentes {
  runId: string
  parserVersion: string
  fecha: string
  /** Estado del run: 'preparado' → 'extraido' → (post dry-run) 'medido'. */
  estado?: string
  /** Recuentos por familia tras extracción/validación (clave: 'ppto'|'liq'). */
  recuentos?: Record<string, unknown>
  /** Duplicados inesperados detectados (hoy 0). Si no vacío → bloqueo del run. */
  duplicados: unknown[]
  fuentes: Array<{
    familia: ConprelFamilia
    ejercicio: number
    tableId: string
    url: string
    zip: string
    zipBytes: number
    zipSha256: string
    descargadoEnEsteRun: boolean
    accdb: string
    etiqueta: string
    /** Corte exacto de la fuente: mtime del ZIP oficial (ISO 8601 UTC). */
    corte: string
    /** Momento en que este run preparó la fuente (ISO 8601 UTC). */
    preparadoEn: string
    /** SHA-256 + bytes de los CSV del loader (se rellena en extraerFamilia
     *  y el loader lo vuelca aquí tras la extracción). */
    csv?: {
      inv: { path: string; bytes: number; sha256: string; filas: number }
      eco: { path: string; bytes: number; sha256: string; filas: number }
    }
  }>
}

/** SHA-256 del ZIP (cuerpo crudo) + URL/ejercicio/corte para el manifiesto. */
export async function prepararFuentes(
  familias: readonly ConprelFamilia[],
  runId: string,
): Promise<ManifiestoFuentes> {
  const dir = conprelTempDir()
  fs.mkdirSync(dir, { recursive: true })
  const fuentes: ManifiestoFuentes['fuentes'] = []
  const ahora = new Date().toISOString()
  for (const f of familias) {
    const def = CONPREL_FAMILIAS[f]
    const zipPath = path.join(dir, def.zipName)
    const zipInfo = await descargarZip(def, zipPath)
    const corte = fs.existsSync(zipPath)
      ? new Date(fs.statSync(zipPath).mtimeMs).toISOString()
      : ahora
    fuentes.push({
      familia: f,
      ejercicio: def.ejercicio,
      tableId: def.tableId,
      url: def.url,
      zip: zipPath,
      zipBytes: zipInfo.bytes,
      zipSha256: zipInfo.sha256,
      descargadoEnEsteRun: zipInfo.descargado,
      accdb: path.join(dir, def.accdbName),
      etiqueta: def.etiqueta,
      corte,
      preparadoEn: ahora,
    })
  }
  return {
    runId,
    parserVersion: CONPREL_PARSER_VERSION,
    fecha: ahora,
    duplicados: [],
    fuentes,
  }
}

/** SHA-256 y bytes de un fichero grande (streaming; sin cargarlo entero). */
export function sha256FileDigest(p: string): { bytes: number; sha256: string } {
  return { bytes: fs.statSync(p).size, sha256: sha256File(p) }
}
