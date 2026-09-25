// Publica los fixtures PROVINCIALES de la circunscripción de Toledo 2023 en R2
// (SA1 · SOCideas v2.3), con backup + read-back byte a byte + manifiesto.
//
//   socideas/electoral/provincial/45.json
//
// El objeto reúne los TRES bloques de la circunscripción, cada uno en su clave
// interna (autonomicas | congreso | senado). Congreso y Senado nunca se mezclan
// ni se suman entre sí ni con las Cortes: son cámaras distintas y así lo
// declara cada payload.
//
// USO
//   npx tsx scripts/publish-electoral-provincial-r2.ts            # DRY-RUN
//   npx tsx scripts/publish-electoral-provincial-r2.ts --write     # escritura
//
// Sin escrituras Supabase, sin commit, sin deploy. Los fixtures locales salen
// de `scripts/ingest-elections-toledo-2023.ts` (tmp/audit, ignorado por git).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readFile as xlsxReadFile, utils as xlsxUtils } from 'xlsx'
import type {
  AutonomicasCircunscripcionPayload,
  SenadoCircunscripcionPayload,
} from '../src/lib/socideas-electoral-provincial'
import type { CongresoProvinciaPayload } from '../src/lib/socideas-book-blocks'
import {
  electoralProvincialKey,
  validateElectoralProvincial,
  type ElectoralProvincialBundle,
} from '../src/lib/socideas-electoral-provincial-store'

config({ path: '.env.local' })

const AUDIT_DIR = path.join('tmp', 'audit')
const BACKUP_ROOT = path.join('tmp', 'backup', 'electoral-provincial')
const WRITE = process.argv.includes('--write')
const PROV = process.argv.find((a) => /^--prov=\d{2}$/.test(a))?.split('=')[1] ?? '45'

const F_AUTONOMICAS = path.join(AUDIT_DIR, 'elecciones-autonomicas-clm-2023-toledo.json')
const F_SENADO = path.join(AUDIT_DIR, 'elecciones-senado-2023-toledo.json')
const F_CONGRESO_XLSX = path.join(AUDIT_DIR, 'elecciones-congreso.xlsx')

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}
function short(h: string): string {
  return h.slice(0, 16)
}

type R2 = { client: S3Client; bucket: string }

function r2Client(): R2 | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const c = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
  if (c.name === 'NoSuchKey' || c.name === 'NotFound') return true
  return c.$metadata?.httpStatusCode === 404
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * 2 ** i))
    }
  }
  throw new Error(`${label} falló tras ${attempts} intentos [${last instanceof Error ? last.name : 'unknown'}]`)
}

async function getObjectMaybe(r2: R2, key: string): Promise<Buffer | null> {
  // El 404 (NoSuchKey) NO es un fallo transitorio: no se reintenta y se trata
  // como ausencia del objeto.
  let lastTransient: unknown = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
      const bytes = await res.Body?.transformToByteArray()
      return bytes === undefined ? null : Buffer.from(bytes)
    } catch (err) {
      if (isNotFound(err)) return null
      lastTransient = err
      if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * 2 ** attempt))
    }
  }
  throw new Error(
    `GET ${key} falló tras 4 intentos [${lastTransient instanceof Error ? lastTransient.name : 'unknown'}]`,
  )
}

async function putObject(r2: R2, key: string, body: Buffer): Promise<void> {
  await withRetry(`PUT ${key}`, () =>
    r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=3600',
        Metadata: { kind: 'electoral-provincial', sha256: sha256(body) },
      }),
    ),
  )
}

// ----------------------------------------------------------------------------
// Congreso: misma lectura que QA (Infoelectoral, datos abiertos abiertos).
// ----------------------------------------------------------------------------
function leerCongreso(): CongresoProvinciaPayload | null {
  if (!existsSync(F_CONGRESO_XLSX)) return null
  try {
    const wb = xlsxReadFile(F_CONGRESO_XLSX)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = xlsxUtils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true })
    const header = rows[3] as string[]
    const descIdx = header.findIndex((h) => typeof h === 'string' && h.toLowerCase().includes('descripci'))
    if (descIdx < 0) return null
    const col = header.findIndex((h) => typeof h === 'string' && new RegExp(`^${PROV}\\s*-`).test(h.trim()))
    if (col < 0) return null
    const name = String(header[col]).replace(/^\d+\s*-\s*/, '').trim()
    const iter = rows.slice(4)
    const FECHA = 45130 // 2023-07-23
    const get = (descripcion: string): number | null => {
      const row = iter.find(
        (r) => Number(r[0]) === FECHA && typeof r[descIdx] === 'string' && (r[descIdx] as string).trim() === descripcion,
      )
      const v = row?.[col]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    const votosRows = iter.filter(
      (r) => Number(r[0]) === FECHA && typeof r[descIdx] === 'string' && (r[descIdx] as string).startsWith('Votos ('),
    )
    const escanosRows = iter.filter(
      (r) => Number(r[0]) === FECHA && typeof r[descIdx] === 'string' && (r[descIdx] as string).startsWith('Escaños ('),
    )
    const candidaturas = votosRows
      .map((r) => {
        const desc = (r[descIdx] as string).trim()
        const inner = desc.replace(/^Votos \((.+)\)$/, '$1')
        const parts = inner.split(' - ')
        const siglas = parts.length > 1 ? (parts.pop() ?? '').trim() : ''
        const nombre = parts.join(' - ').trim()
        const votos = typeof r[col] === 'number' ? (r[col] as number) : null
        const esc = escanosRows.find((e) => (e[descIdx] as string).includes(inner))
        const escanos = esc && typeof esc[col] === 'number' ? (esc[col] as number) : null
        return { nombre, siglas, votos, escanos }
      })
      // Solo candidaturas con voto positivo EN ESTA circunscripción: el fichero
      // de Infoelectoral trae todas las provincias y las demás aparecen con 0.
      // Publicarlas sería contaminar el payload con candidaturas ajenas.
      .filter((x) => x.votos !== null && x.votos > 0)
      .sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
    if (candidaturas.length === 0) return null
    return {
      anio: 2023,
      fecha: '2023-07-23',
      provincia: name,
      censo: get('Electores'),
      votantes: get('Votantes'),
      validos: get('Votos válidos'),
      nulos: get('Votos nulos'),
      blancos: get('Votos en blanco'),
      candidaturas,
      fuenteLabel: 'Ministerio del Interior · Infoelectoral · Elecciones generales (Congreso)',
    }
  } catch (err) {
    console.warn('[congreso] no disponible:', err instanceof Error ? err.message : String(err))
    return null
  }
}

function leerJson<T>(file: string): T | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    console.warn(`[${path.basename(file)}] ilegible:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

function main(): void {
  const autonomicas = leerJson<AutonomicasCircunscripcionPayload>(F_AUTONOMICAS)
  const senado = leerJson<SenadoCircunscripcionPayload>(F_SENADO)
  const congreso = leerCongreso()

  if (!autonomicas && !senado && !congreso) {
    console.error(
      '[electoral-provincial] FALLO: no hay ningún fixture local. ' +
        'Ejecuta antes `npx tsx scripts/ingest-elections-toledo-2023.ts`.',
    )
    process.exitCode = 1
    return
  }

  const circunscripcion = autonomicas?.circunscripcion ?? senado?.circunscripcion ?? congreso?.provincia ?? ''
  const notaCobertura =
    `Los resultados corresponden a la circunscripción electoral de ${circunscripcion}. ` +
    'Este municipio no dispone de desglose a nivel municipal para esta elección. ' +
    '(Autonómicas 28-M-2023 · Congreso y Senado 23-J-2023)'

  const bundle: ElectoralProvincialBundle = {
    provinciaCodigo: PROV,
    circunscripcion,
    notaCobertura,
    publicadoEl: new Date().toISOString(),
    autonomicas: autonicasSeguro(autonomicas),
    congreso,
    senado,
  }

  const validado = validateElectoralProvincial(bundle)
  if (!validado) {
    console.error('[electoral-provincial] FALLO de validación: el bundle no pasa el validador estricto.')
    process.exitCode = 1
    return
  }

  const body = Buffer.from(JSON.stringify(validado, null, 2), 'utf8')
  const key = electoralProvincialKey(PROV)
  const localSha = sha256(body)

  console.log(
    `[electoral-provincial] modo ${WRITE ? 'WRITE' : 'DRY-RUN'} · key ${key} · ${body.length} B · sha ${short(localSha)} · ` +
      `bloques: autonómicas=${validado.autonomicas ? 'sí' : 'no'} congreso=${validado.congreso ? 'sí' : 'no'} senado=${validado.senado ? 'sí' : 'no'} · ` +
      `circunscripción=${validado.circunscripcion}`,
  )
  console.log(`[electoral-provincial] nota de cobertura: ${validado.notaCobertura}`)

  if (!WRITE) {
    console.log('DRY-RUN completado: no se ha escrito nada en R2.')
    const dryPath = path.join(AUDIT_DIR, `electoral-provincial-dryrun-${PROV}.json`)
    writeFileSync(dryPath, JSON.stringify(validado, null, 2), 'utf8')
    console.log(`[electoral-provincial] payload: ${dryPath}`)
    return
  }

  const r2 = r2Client()
  if (r2 === null) {
    console.error('[electoral-provincial] FALLO: faltan credenciales R2. Abortado sin escribir.')
    process.exitCode = 1
    return
  }

  void (async () => {
    const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(BACKUP_ROOT, runStamp)
    mkdirSync(backupDir, { recursive: true })

    const prev = await getObjectMaybe(r2, key)
    let backupPath: string
    if (prev !== null) {
      backupPath = path.join(backupDir, `${PROV}.json`)
      writeFileSync(backupPath, prev)
      console.log(`[backup] ${backupPath} (${prev.length} B, sha ${short(sha256(prev))})`)
    } else {
      backupPath = path.join(backupDir, `${PROV}.json.no-existia`)
      writeFileSync(backupPath, '')
      console.log('[backup] el objeto no existía previamente')
    }

    await putObject(r2, key, body)

    const rb = await getObjectMaybe(r2, key)
    if (rb === null) throw new Error('read-back: el objeto no existe tras el PUT')
    const rbSha = sha256(rb)
    if (rbSha !== localSha) throw new Error(`read-back sha ${short(rbSha)} ≠ local ${short(localSha)}`)
    console.log(`[read-back] OK · sha ${short(rbSha)} · ${rb.length} B`)

    // Round-trip de validación: lo que R2 devuelve debe volver a validar.
    const revalidado = validateElectoralProvincial(JSON.parse(rb.toString('utf8')))
    if (!revalidado) throw new Error('read-back: el payload devuelto no pasa la validación')
    if (revalidado.notaCobertura !== validado.notaCobertura) {
      throw new Error('read-back: la nota de cobertura no coincide')
    }

    const manifest = {
      publicadoEl: new Date().toISOString(),
      key,
      sha256: localSha,
      bytes: body.length,
      backup: backupPath,
      readBack: { sha256: rbSha, bytes: rb.length },
      bloques: {
        autonomicas: revalidado.autonomicas !== null,
        congreso: revalidado.congreso !== null,
        senado: revalidado.senado !== null,
      },
      circunscripcion: revalidado.circunscripcion,
      notaCobertura: revalidado.notaCobertura,
    }
    const manifestPath = path.join(AUDIT_DIR, `publish-electoral-provincial-manifest-${Date.now()}.json`)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    console.log(`[manifest] ${manifestPath}`)
    console.log('[electoral-provincial] PUBLICACIÓN COMPLETA')
  })().catch((err) => {
    console.error('[electoral-provincial] FALLO:', err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}

/** Defensa en profundidad: nunca publicar un payload sin nota de cobertura. */
function autonicasSeguro(a: AutonomicasCircunscripcionPayload | null): AutonomicasCircunscripcionPayload | null {
  if (!a) return null
  if (!a.notaCobertura || !/circunscripci/i.test(a.notaCobertura)) return null
  return a
}

main()
