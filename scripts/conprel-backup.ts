/**
 * BACKUP durable de envelopes CONPREL — local por defecto; R2 opcional.
 *
 * Copia los envelopes objetivo de un run a `tmp/conprel-backups/<runId>/`
 * con `index.json` (ine, key, bytes antes, sha256, estado). Pensado para
 * ejecutarse ANTES de cualquier escritura (el loader lo invoca también
 * dentro de modoEscritura; este CLI permite hacerlo manualmente).
 *
 * Flags:
 *   --run-id=<id>     identificador de run (defecto: timestamp+aleatorio)
 *   --ines=a,b,c      lista explícita de INEs
 *   --muestra         fixtures qa-fixtures MUESTRA_COBERTURA (14 INE)
 *   --all-ppto        todos los municipales AA/ZZ de PPTO-2025 (7.345)
 *   --all-liq         todos los municipales AA/ZZ de LIQ-2024  (6.861)
 *   --lote=N --lote-total=M   partición determinista (misma que el loader)
 *   --provincias=01,31,…      por prefijo INE
 *   --r2              ESPEJO en R2 (prefijo socideas/backups/conprel/<runId>/).
 *                      SOLO con credenciales R2_*; es una ESCRITURA R2 — la
 *                      misión actual NO lo ejecuta. Requiere además
 *                      --confirm-r2-write + SOCIDEAS_CONPREL_WRITE=autorizado.
 *   --dry-run-r2      solo informa si hay credenciales R2 (sin escribir)
 *   --root=DIR        raíz alternativa de backups (tests)
 *
 * Lectura de envelopes: fetch público (sin credenciales). Con --r2 el
 * uploader usa S3 con las credenciales de entorno (nunca se imprimen).
 *
 * Uso:
 *   npx tsx scripts/conprel-backup.ts --muestra
 *   npx tsx scripts/conprel-backup.ts --all-ppto --lote=1 --lote-total=20
 *   npx tsx scripts/conprel-backup.ts --ines=28079,02003 --dry-run-r2
 */

import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { CONPREL_FAMILIAS } from '../src/lib/conprel-contracts'
import type { ConprelFamilia } from '../src/lib/conprel-contracts'
import {
  CONPREL_BACKUP_LIMITE_DOC,
  backupEnvelopes,
  r2BackupCredsPresentes,
} from '../src/lib/conprel-backup'
import { cargarInventario } from '../src/lib/conprel-parser'
import { conprelCsvDir } from '../src/lib/conprel-extract'
import { aplicarLote } from '../src/lib/conprel-lotes'
import { MUESTRA_COBERTURA } from './qa-fixtures'

config({ path: '.env.local' })

interface Args {
  runId: string
  ines: string[] | null
  muestra: boolean
  allPpto: boolean
  allLiq: boolean
  provincias: string[] | null
  lote: number | null
  loteTotal: number | null
  r2: boolean
  dryRunR2: boolean
  confirmWrite: boolean
  root: string | undefined
}

function newRunId(): string {
  return (
    new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) +
    '-' +
    Math.random().toString(36).slice(2, 7)
  )
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    runId: newRunId(),
    ines: null,
    muestra: false,
    allPpto: false,
    allLiq: false,
    provincias: null,
    lote: null,
    loteTotal: null,
    r2: false,
    dryRunR2: false,
    confirmWrite: false,
    root: undefined,
  }
  for (const raw of argv) {
    if (raw.startsWith('--run-id=')) a.runId = raw.slice('--run-id='.length)
    else if (raw.startsWith('--root=')) a.root = raw.slice('--root='.length)
    else if (raw.startsWith('--ines=')) {
      a.ines = raw
        .slice('--ines='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (raw.startsWith('--provincias=')) {
      a.provincias = raw
        .slice('--provincias='.length)
        .split(',')
        .map((s) => s.trim().padStart(2, '0'))
        .filter(Boolean)
    } else if (raw.startsWith('--lote=')) a.lote = Number(raw.slice('--lote='.length))
    else if (raw.startsWith('--lote-total=')) a.loteTotal = Number(raw.slice('--lote-total='.length))
    else if (raw === '--muestra') a.muestra = true
    else if (raw === '--all-ppto') a.allPpto = true
    else if (raw === '--all-liq') a.allLiq = true
    else if (raw === '--r2') a.r2 = true
    else if (raw === '--dry-run-r2') a.dryRunR2 = true
    else if (raw === '--confirm-r2-write') a.confirmWrite = true
    else if (raw === '--help' || raw === '-h') {
      console.log('Ver cabecera del fichero para flags.')
      process.exit(0)
    } else throw new Error(`Flag desconocido: ${raw}`)
  }
  if (!a.muestra && !a.allPpto && !a.allLiq && !a.ines && a.provincias === null) {
    a.muestra = true
  }
  return a
}

function inventarioMunicipales(familia: ConprelFamilia): string[] {
  const def = CONPREL_FAMILIAS[familia]
  const p = path.join(conprelCsvDir(), `loader_inv_${familia}${def.ejercicio}.csv`)
  if (!fs.existsSync(p)) {
    throw new Error(`Falta inventario ${p}; ejecuta primero el loader en dry-run o --extract`)
  }
  const inv = cargarInventario(p, def)
  return inv.municipales.map((m) => m.ine)
}

function seleccionarInes(args: Args): string[] {
  let ines: string[]
  if (args.ines) {
    ines = args.ines
  } else if (args.muestra) {
    const set = new Set(MUESTRA_COBERTURA.map((m) => m.ine))
    const dePpto = args.allLiq && !args.allPpto ? inventarioMunicipales('liq') : inventarioMunicipales('ppto')
    ines = dePpto.filter((i) => set.has(i))
  } else {
    const set = new Set<string>()
    if (args.allPpto) for (const i of inventarioMunicipales('ppto')) set.add(i)
    if (args.allLiq) for (const i of inventarioMunicipales('liq')) set.add(i)
    if (!args.allPpto && !args.allLiq) for (const i of inventarioMunicipales('ppto')) set.add(i)
    ines = [...set]
  }
  if (args.provincias) {
    const allowed = new Set(args.provincias)
    ines = ines.filter((i) => allowed.has(i.slice(0, 2)))
  }
  if (args.lote !== null || args.loteTotal !== null) {
    const r = aplicarLote(ines, { lote: args.lote, loteTotal: args.loteTotal })
    ines = r.ines
    if (r.etiqueta) console.log(`Lote: ${r.etiqueta} · ${ines.length} INEs`)
  }
  return [...new Set(ines)].sort()
}

const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
).replace(/\/$/, '')

async function fetchPublico(ine: string): Promise<{ key: string; json: string } | null> {
  const key = `socideas/v2/municipios/${ine}.json`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`${R2_BASE}/${key}`, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json', 'User-Agent': 'URBIdeas-conprel-backup/1.0' },
        cache: 'no-store',
      })
      if (r.status === 404) {
        if (attempt < 3) continue
        return null
      }
      if (r.status !== 200) {
        if (attempt < 3) continue
        throw new Error(`HTTP ${r.status}`)
      }
      const json = await r.text()
      const j = JSON.parse(json) as { codigo_ine?: string; valores?: unknown[] }
      if (j.codigo_ine !== ine || !Array.isArray(j.valores)) {
        if (attempt < 3) continue
        throw new Error('payload inválido')
      }
      return { key, json }
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((x) => setTimeout(x, 300 * attempt))
    }
  }
  return null
}

async function makeR2Uploader(): Promise<
  ((item: { ine: string; key: string; body: string }) => Promise<void>) | undefined
> {
  if (!r2BackupCredsPresentes()) return undefined
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  const bucket = process.env.R2_BUCKET!
  return async (item) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: item.key,
        Body: item.body,
        ContentType: 'application/json',
        CacheControl: 'private, no-store',
      }),
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.dryRunR2) {
    const presentes = r2BackupCredsPresentes()
    console.log(`Credenciales R2 presentes: ${presentes ? 'SÍ' : 'NO'}`)
    console.log(`Límite backup local: ${CONPREL_BACKUP_LIMITE_DOC}`)
    if (!args.ines && !args.muestra && !args.allPpto && !args.allLiq && args.provincias === null) {
      process.exit(0)
    }
  }

  let r2Uploader: ((item: { ine: string; key: string; body: string }) => Promise<void>) | undefined
  if (args.r2) {
    const gateOk =
      args.confirmWrite && (process.env.SOCIDEAS_CONPREL_WRITE ?? '') === 'autorizado'
    if (!gateOk) {
      console.error(
        'ABORTO: --r2 es una escritura R2 y exige --confirm-r2-write + SOCIDEAS_CONPREL_WRITE=autorizado (gate doble). ' +
          'Sin ambas: no se espeja a R2 (puedes hacer backup local sin --r2).',
      )
      process.exit(2)
    }
    if (!r2BackupCredsPresentes()) {
      console.error('ABORTO: --r2 solicitado pero faltan credenciales R2_* en el entorno.')
      process.exit(2)
    }
    r2Uploader = await makeR2Uploader()
    console.log('ESPEJO R2 de backup HABILITADO por operador (gate doble presente).')
  }

  const ines = seleccionarInes(args)
  console.log('=== BACKUP CONPREL ===')
  console.log(`runId=${args.runId} · candidatos=${ines.length} · r2Mirror=${Boolean(r2Uploader)}`)
  if (ines.length === 0) {
    console.error('0 INEs seleccionados: nada que respaldar.')
    process.exit(1)
  }

  const t0 = Date.now()
  const index = await backupEnvelopes({
    runId: args.runId,
    ines,
    fetcher: fetchPublico,
    root: args.root,
    r2Uploader,
  })
  const ms = Date.now() - t0

  console.log(
    `Backup local: ${index.dir} · ok=${index.ok} ausentes(404)=${index.ausentes} errores=${index.errores} · ` +
      `bytes=${index.bytesTotales} · r2Backup=${index.r2Backup} · ${ms} ms`,
  )
  console.log(`Límite: ${CONPREL_BACKUP_LIMITE_DOC}`)
  if (index.errores > 0) {
    console.error('ERRORES en el backup (red/payload):')
    for (const it of index.items.filter((i) => i.estado.startsWith('error')).slice(0, 10)) {
      console.error(`  ${it.ine}: ${it.estado}`)
    }
    process.exit(1)
  }
  console.log('=== BACKUP COMPLETADO ===')
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
