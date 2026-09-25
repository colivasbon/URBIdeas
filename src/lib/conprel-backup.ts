// Backup durable de envelopes CONPREL — SIEMPRE local, R2 opcional.
//
// Contrato (diseño §7.4 «Rollback» + encargo de la misión):
//  - ANTES de cualquier putMunicipioJson en el loader, los envelopes objetivo
//    se copian a `tmp/conprel-backups/<runId>/` con un `index.json` que
//    registra por INE: bytes antes, sha256 del JSON y key R2.
//  - La carpeta va identificada POR RUN (no solo tmp/): permite restaurar
//    exactamente el estado previo de ese run.
//  - R2 opcional: si hay credenciales R2_* se puede replicar el backup al
//    prefijo `socideas/backups/conprel/<runId>/`. Eso es SOLO para el run de
//    escritura real (gate doble) o un `--r2` explícito del CLI; esta misión
//    NO ejecuta escrituras R2. Sin credenciales → solo local, y el límite
//    queda documentado en el Índice (`r2Backup`).
//  - Este módulo NO valida el write-gate: el loader lo hace antes de llamar.
//
// Nunca imprime valores de credenciales.

import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export const CONPREL_BACKUP_ROOT = path.join('tmp', 'conprel-backups')
/** Prefijo R2 de backup (independiente del prefijo de producción v2). */
export const CONPREL_R2_BACKUP_PREFIX = 'socideas/backups/conprel'

export interface BackupItem {
  ine: string
  key: string
  bytes: number
  sha256: string
  /** 'ok' | '404' (sin envelope previo) | 'error:<detalle>' */
  estado: string
  /** Ruta local relativa del JSON de backup (solo si estado=ok). */
  archivo: string | null
}

export interface BackupIndex {
  version: 1
  runId: string
  creadoEn: string
  /** Raíz local (relativa al cwd) de este backup. */
  dir: string
  alcance: 'local'
  /** Resultado del espejo R2 (no intentado en esta misión salvo --r2). */
  r2Backup: string
  r2Prefix: string | null
  total: number
  ok: number
  ausentes: number
  errores: number
  bytesTotales: number
  items: BackupItem[]
}

export function backupDirFor(runId: string, root = CONPREL_BACKUP_ROOT): string {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`runId inválido para ruta de backup: "${runId}"`)
  }
  return path.join(root, runId)
}

export function sha256Buffer(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

export function r2BackupKeyFor(runId: string, ine: string): string {
  return `${CONPREL_R2_BACKUP_PREFIX}/${runId}/${ine}.json`
}

export interface BackupEnvelopesOpts {
  runId: string
  ines: readonly string[]
  /** Key y JSON por INE. null = sin envelope previo (404). */
  fetcher: (ine: string) => Promise<{ key: string; json: string } | null>
  /** Raíz local (para tests aislados). Defecto: tmp/conprel-backups. */
  root?: string
  /** Reflector R2 opcional (inyectable; la misión NO lo usa con red real). */
  r2Uploader?: (item: { ine: string; key: string; body: string }) => Promise<void>
}

/**
 * Copia los envelopes indicados a `tmp/conprel-backups/<runId>/` y escribe
 * `index.json`. No lanza ante 404 (queda `ausentes` en el Índice); un
 * throw del fetcher queda como `error:<detalle>` por INE (el loader decide
 * si aborta: exigimos al menos que los objetivos con eco estén respaldados).
 */
export async function backupEnvelopes(opts: BackupEnvelopesOpts): Promise<BackupIndex> {
  const dir = backupDirFor(opts.runId, opts.root)
  fs.mkdirSync(dir, { recursive: true })
  const items: BackupItem[] = []
  let r2Backup = 'no-solicitado'
  let r2Prefix: string | null = null
  if (opts.r2Uploader) {
    r2Backup = 'ok'
    r2Prefix = `${CONPREL_R2_BACKUP_PREFIX}/${opts.runId}/`
  }

  for (const ine of opts.ines) {
    const key = `socideas/v2/municipios/${ine}.json`
    try {
      const got = await opts.fetcher(ine)
      if (!got) {
        items.push({ ine, key, bytes: 0, sha256: '', estado: '404', archivo: null })
        continue
      }
      const body = Buffer.from(got.json, 'utf8')
      const archivo = `${ine}.json`
      fs.writeFileSync(path.join(dir, archivo), body)
      items.push({
        ine,
        key: got.key,
        bytes: body.length,
        sha256: sha256Buffer(body),
        estado: 'ok',
        archivo,
      })
      if (opts.r2Uploader) {
        try {
          await opts.r2Uploader({ ine, key: r2BackupKeyFor(opts.runId, ine), body: got.json })
        } catch (e) {
          r2Backup = `degradado:${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
        }
      }
    } catch (e) {
      items.push({
        ine,
        key,
        bytes: 0,
        sha256: '',
        estado: `error:${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        archivo: null,
      })
    }
  }

  const index: BackupIndex = {
    version: 1,
    runId: opts.runId,
    creadoEn: new Date().toISOString(),
    dir,
    alcance: 'local',
    r2Backup,
    r2Prefix,
    total: items.length,
    ok: items.filter((i) => i.estado === 'ok').length,
    ausentes: items.filter((i) => i.estado === '404').length,
    errores: items.filter((i) => i.estado.startsWith('error')).length,
    bytesTotales: items.reduce((s, i) => s + i.bytes, 0),
    items,
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2))
  return index
}

/** Lee un Índice de backup existente. */
export function leerBackupIndex(runId: string, root = CONPREL_BACKUP_ROOT): BackupIndex {
  const p = path.join(backupDirFor(runId, root), 'index.json')
  if (!fs.existsSync(p)) throw new Error(`Backup inexistente: ${p}`)
  return JSON.parse(fs.readFileSync(p, 'utf8')) as BackupIndex
}

/** Credenciales R2 presentes (sin exponer valores). */
export function r2BackupCredsPresentes(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  )
}

/**
 * LÍmite documentado del backup local: vive en `tmp/` del worktree/de la
 * máquina que ejecuta el run. Si esa máquina muere antes del espejo R2, el
 * backup local se pierde. Por eso (a) el Índice lleva hashes verificables,
 * (b) el loader exige backup antes de escribir y (c) con credenciales R2 el
 * run de escritura real debe activar `r2Uploader` (prefijo
 * `socideas/backups/conprel/<runId>/`) — esa escritura SÍ toca R2 y solo se
 * habilita junto al gate doble de escritura de producción.
 */
export const CONPREL_BACKUP_LIMITE_DOC =
  'Backup local en tmp/conprel-backups/<runId>/: efímero (disco de la máquina del run). ' +
  'Hashes en index.json permiten verificar integridad; el espejo R2 ' +
  `(${CONPREL_R2_BACKUP_PREFIX}/<runId>/) es opcional y solo con credenciales + gate de escritura.`
