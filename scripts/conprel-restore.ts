/**
 * RESTORE de backups CONPREL — SIEMPRE aislado; NUNCA escribe R2 oficial.
 *
 * Lee `tmp/conprel-backups/<runId>/index.json`, revalida sha256/bytes de
 * cada JSON de backup y «reproduce el put» SOLO en un destino controlado
 * (`--dest=` o `tmp/conprel-restore-sim/<runId>/` por defecto). Opcionalmente
 * compara (solo lectura) el backup contra el envelope público vivo en R2
 * para detectar si el run ya tocó producción.
 *
 * Modos:
 *   (defecto)     dry-run: valida hashes del índice contra los ficheros.
 *   --dest=DIR    además copia los JSON validados a DIR (simulación de put).
 *   --ines=a,b,c  submuestra (p. ej. 3-5 municipios para la prueba).
 *   --compare-r2  fetch público (GET) del envelope actual y reporta deltas.
 *
 * Uso típico (prueba de restauración 3-5 municipios):
 *   npx tsx scripts/conprel-restore.ts --run-id=<runId> --dest=tmp/conprel-restore-sim/demo --compare-r2
 *
 * NUNCA importa putMunicipioJson ni escribe Supabase. Exit 0 = todos OK.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  CONPREL_BACKUP_ROOT,
  backupDirFor,
  leerBackupIndex,
  sha256Buffer,
} from '../src/lib/conprel-backup'
import type { BackupIndex } from '../src/lib/conprel-backup'

interface Args {
  runId: string | null
  dest: string | null
  ines: string[] | null
  compareR2: boolean
  root: string
}

function parseArgs(argv: string[]): Args {
  const a: Args = { runId: null, dest: null, ines: null, compareR2: false, root: CONPREL_BACKUP_ROOT }
  for (const raw of argv) {
    if (raw.startsWith('--run-id=')) a.runId = raw.slice('--run-id='.length)
    else if (raw.startsWith('--dest=')) a.dest = raw.slice('--dest='.length)
    else if (raw.startsWith('--root=')) a.root = raw.slice('--root='.length)
    else if (raw.startsWith('--ines=')) {
      // padStart: PowerShell puede truncar ceros iniciales al tokenizar (02003 → 2003).
      a.ines = raw
        .slice('--ines='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.padStart(5, '0'))
    } else if (raw === '--compare-r2') a.compareR2 = true
    else if (raw === '--help' || raw === '-h') {
      console.log('Uso: npx tsx scripts/conprel-restore.ts --run-id=<id> [--dest=DIR] [--ines=a,b] [--compare-r2] [--root=DIR]')
      process.exit(0)
    } else throw new Error(`Flag desconocido: ${raw}`)
  }
  if (!a.runId) {
    // Auto-detect: el backup local más reciente.
    if (fs.existsSync(a.root)) {
      const dirs = fs
        .readdirSync(a.root)
        .filter((d) => fs.existsSync(path.join(a.root, d, 'index.json')))
        .map((d) => ({ d, t: fs.statSync(path.join(a.root, d)).mtimeMs }))
        .sort((x, y) => y.t - x.t)
      if (dirs[0]) {
        a.runId = dirs[0].d
        console.log(`run-id no indicado; usando el más reciente: ${a.runId}`)
      }
    }
  }
  if (!a.runId) throw new Error('Falta --run-id (y no hay backups en tmp/conprel-backups)')
  return a
}

const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
).replace(/\/$/, '')

async function fetchPublico(ine: string): Promise<string | null> {
  try {
    const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json', 'User-Agent': 'URBIdeas-conprel-restore/1.0' },
      cache: 'no-store',
    })
    if (r.status !== 200) return null
    return await r.text()
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const dir = backupDirFor(args.runId!, args.root)
  console.log('=== RESTORE CONPREL (destino aislado; sin escritura R2 oficial) ===')
  console.log(`Backup: ${dir}`)

  let index: BackupIndex
  try {
    index = leerBackupIndex(args.runId!, args.root)
  } catch (e) {
    console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  }

  let items = index.items
  if (args.ines) {
    const want = new Set(args.ines)
    items = items.filter((i) => want.has(i.ine))
    const missing = args.ines.filter((i) => !index.items.some((x) => x.ine === i))
    if (missing.length) {
      console.error(`ERROR: INEs fuera del índice de backup: ${missing.join(',')}`)
      process.exit(3)
    }
  }

  let ok = 0
  let fallos = 0
  let ausentes = 0
  const report: Record<string, unknown> = {
    runId: args.runId,
    creadoEn: index.creadoEn,
    modo: args.dest ? 'restore-sim' : 'dry-run-hash',
    dest: args.dest,
    items: [] as unknown[],
  }

  const destDir = args.dest
    ? path.isAbsolute(args.dest)
      ? args.dest
      : path.join(process.cwd(), args.dest)
    : null
  if (destDir) fs.mkdirSync(destDir, { recursive: true })

  for (const item of items) {
    if (item.estado === '404') {
      ausentes++
      ;(report.items as unknown[]).push({ ine: item.ine, resultado: '404-sin-backup' })
      continue
    }
    if (item.estado !== 'ok' || !item.archivo) {
      fallos++
      console.error(`  FAIL ${item.ine}: estado de backup "${item.estado}"`)
      ;(report.items as unknown[]).push({ ine: item.ine, resultado: 'error-indice', estado: item.estado })
      continue
    }
    const p = path.join(dir, item.archivo)
    if (!fs.existsSync(p)) {
      fallos++
      console.error(`  FAIL ${item.ine}: fichero de backup ausente (${item.archivo})`)
      ;(report.items as unknown[]).push({ ine: item.ine, resultado: 'fichero-ausente' })
      continue
    }
    const body = fs.readFileSync(p)
    const sha = sha256Buffer(body)
    if (sha !== item.sha256 || body.length !== item.bytes) {
      fallos++
      console.error(
        `  FAIL ${item.ine}: hash/bytes no cuadran (idx ${item.sha256.slice(0, 12)}…/${item.bytes} B · real ${sha.slice(0, 12)}…/${body.length} B)`,
      )
      ;(report.items as unknown[]).push({
        ine: item.ine,
        resultado: 'hash-mismatch',
        esperado: item.sha256,
        real: sha,
      })
      continue
    }

    // «Put» simulado en destino aislado (misma key relativa, sin tocar R2).
    if (destDir) {
      const outFile = path.join(destDir, `${item.ine}.json`)
      fs.writeFileSync(outFile, body)
    }

    let cmp: string | null = null
    if (args.compareR2) {
      const vivo = await fetchPublico(item.ine)
      if (vivo === null) cmp = 'sin-envelope-publico'
      else {
        const vivoSha = sha256Buffer(vivo)
        cmp = vivoSha === item.sha256 ? 'igual-que-backup' : 'difiera-del-backup'
      }
    }

    ok++
    const fila = { ine: item.ine, resultado: 'ok', bytes: item.bytes, sha256: item.sha256 }
    if (cmp) (fila as Record<string, unknown>).compareR2 = cmp
    ;(report.items as unknown[]).push(fila)
    console.log(
      `  OK   ${item.ine} · ${item.bytes} B · sha256=${item.sha256.slice(0, 16)}…${cmp ? ` · r2=${cmp}` : ''}`,
    )
  }

  const out = path.join(
    process.cwd(),
    'tmp',
    `conprel-restore-${args.runId}-${Date.now()}.json`,
  )
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ ...report, resumen: { ok, fallos, ausentes } }, null, 2))
  console.log(`\nResumen: ok=${ok} fallos=${fallos} ausentes=${ausentes}`)
  if (destDir) console.log(`Restore simulado en: ${destDir}`)
  console.log(`Informe: ${path.relative(process.cwd(), out)}`)
  console.log('=== RESTORE COMPLETADO — sin escritura R2 oficial ===')
  if (fallos > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
