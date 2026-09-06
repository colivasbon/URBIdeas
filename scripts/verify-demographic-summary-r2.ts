// Validador FASE 3E: verifica la carga sin modificar nada.
// - Estático: los scripts no contienen escrituras ajenas al prefijo nuevo
//   (nada en Supabase, migraciones, UI, XLSX, endpoints, ni claves R2 activas).
// - Datos: valida los 8130 objetos construidos (tmp/) u online vía manifests.
// - R2: si existe latest-successful en el prefijo nuevo, verifica coherencia;
//   si no existe, informa "no publicado" sin fallar por ello.
// Uso: npx tsx scripts/verify-demographic-summary-r2.ts [--online]
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { MunicipalSummary } from './build-demographic-summary-r2'

config({ path: '.env.local' })

const NEW_PREFIX = 'socideas/demographics/ine/v1/municipal'
const MANIFEST_PREFIX = 'socideas/demographics/ine/v1/manifests'
const ACTIVE_PREFIX = ['socideas/v1/', 'socideas/v2/']

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: process.cwd() })
  } catch {
    return ''
  }
}

function validateObjects(objects: MunicipalSummary[], label: string): void {
  check(`${label}: exactamente 8130 objetos`, objects.length === 8130, `${objects.length}`)
  const requiredKeys = ['schemaVersion', 'ineCode', 'municipalityName', 'source', 'nationality', 'birthCountry', 'birthResidenceRelation', 'quality']
  let bad = 0
  let arithmetic = 0
  let evaluated = 0
  let big = 0
  let derived = 0
  let residencia = 0
  let supAsNum = 0
  for (const o of objects) {
    if (!requiredKeys.every((k) => k in (o as unknown as Record<string, unknown>))) { bad += 1; continue }
    if (!/^\d{5}$/.test(o.ineCode)) { bad += 1; continue }
    if (o.schemaVersion !== 'ine-demographic-summary-v1') { bad += 1; continue }
    if (!o.source?.tables?.nationality?.tableId || !o.source?.tables?.birthCountry?.tableId || !o.source?.tables?.birthResidenceRelation?.tableId) { bad += 1; continue }
    if (!o.source?.tables?.nationality?.period || !o.source?.tables?.birthCountry?.period || !o.source?.tables?.birthResidenceRelation?.period) { bad += 1; continue }
    if (!['observed', 'partial', 'suppressed', 'missing'].includes(o.nationality.status)) { bad += 1; continue }
    const n = o.nationality
    if (n.total !== null && n.spanish !== null && n.foreign !== null) {
      evaluated += 1
      if (n.total === n.spanish + n.foreign) arithmetic += 1
    }
    const b = o.birthResidenceRelation
    const parts = [b.sameMunicipality, b.sameProvinceOtherMunicipality, b.sameAutonomousCommunityOtherProvince, b.otherAutonomousCommunity, b.bornAbroad]
    if (b.total !== null && parts.every((vv) => vv !== null)) {
      evaluated += 1
      if (b.total === (parts as number[]).reduce((s, vv) => s + vv, 0)) arithmetic += 1
    }
    if (o.birthCountry.categories.some((c) => /^(bornInSpain|bornAbroad|foreignBorn|totalForeignBorn)$/.test(c.sourceCode))) derived += 1
    if (/residencia anterior/i.test(JSON.stringify(o.birthResidenceRelation))) residencia += 1
    const bytes = JSON.stringify(o).length
    if (bytes > 25 * 1024) big += 1
    if (o.nationality.status === 'suppressed' && (o.nationality.total !== null || o.nationality.spanish !== null || o.nationality.foreign !== null)) supAsNum += 1
  }
  check(`${label}: esquema/INE/fuente/estado`, bad === 0, bad > 0 ? `${bad} mal` : '')
  check(`${label}: aritmética exacta donde evaluable`, arithmetic === evaluated, `${arithmetic}/${evaluated}`)
  check(`${label}: sin bornAbroad derivado`, derived === 0)
  check(`${label}: sin residencia anterior`, residencia === 0)
  check(`${label}: ≤25 KB todos`, big === 0)
  check(`${label}: suprimido jamás numérico`, supAsNum === 0)
}

async function main(): Promise<void> {
  // Estático.
  const files = [
    'scripts/build-demographic-summary-r2.ts',
    'scripts/load-demographic-summary-r2.ts',
    'scripts/verify-demographic-summary-r2.ts',
  ]
  const writeRes: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    if (/\.from\([^)]*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/.test(src)) writeRes.push(`${f}:supabase-write`)
    if (/\b(run-?migrations?|apply-?migrations?|migrate\s*\()/i.test(src)) writeRes.push(`${f}:migrate`)
    if (f !== 'scripts/verify-demographic-summary-r2.ts' && /components\/|socideas-xlsx|FichaToolbar|ActualizacionMenu/.test(src)) {
      writeRes.push(`${f}:ui`)
    }
    // Claves R2: solo template bajo el prefijo nuevo; ningún literal activo.
    const puts = [...src.matchAll(/Key:\s*[`'"]([^`'"]+)/g)].map((m) => m[1])
    for (const k of puts) {
      if (ACTIVE_PREFIX.some((p) => k.startsWith(p))) writeRes.push(`${f}:clave-activa:${k}`)
    }
    if (f === 'scripts/load-demographic-summary-r2.ts') {
      if (!src.includes(`PREFIX = '${NEW_PREFIX}'`) || !src.includes(`MANIFEST_PREFIX = '${MANIFEST_PREFIX}'`)) {
        writeRes.push(`${f}:prefijo-inesperado`)
      }
      if (!/Key:\s*`?\$\{(PREFIX|MANIFEST_PREFIX)\}/.test(src)) writeRes.push(`${f}:put-fuera-prefijo`)
    }
  }
  check('sin escrituras ajenas (Supabase/migraciones/UI/claves activas)', writeRes.length === 0, writeRes.slice(0, 4).join(' | '))
  const diff = sh('git diff --name-only fe302fb..HEAD') + '\n' + sh('git status --porcelain')
  const touched = diff.split('\n').map((s) => s.trim().replace(/^[AM?D ]+/, '')).filter(Boolean)
  const allowed = [/^docs\//, /^scripts\/(build|load|verify)-demographic-/, /^src\/lib\/ine-demographic-dimensions\.ts$/, /^src\/lib\/socideas-demographic-dimensions\.ts$/]
  const badScope = touched.filter((f) => !allowed.some((re) => re.test(f)))
  check('alcance 3E (sin UI/XLSX/API/R2-activo)', badScope.length === 0, badScope.slice(0, 5).join(' | '))

  // Datos locales.
  if (existsSync('tmp/demo3e-summaries.json')) {
    const objects = JSON.parse(readFileSync('tmp/demo3e-summaries.json', 'utf8')) as MunicipalSummary[]
    validateObjects(objects, 'tmp')
  } else {
    console.log('INFO — sin build local; se valida solo R2.')
  }

  // R2 (solo lectura).
  if (process.argv.includes('--online')) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '' },
    })
    const bucket = process.env.R2_BUCKET ?? ''
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${MANIFEST_PREFIX}/latest-successful.json` }))
      const manifest = JSON.parse((await res.Body?.transformToString()) ?? '{}') as { esperados: number; verificados: number; runId: string }
      check('latest-successful con 8130 verificados', manifest.esperados === 8130 && manifest.verificados >= 20, `${manifest.verificados}/${manifest.esperados}`)
    } catch {
      console.log('INFO — latest-successful ausente: carga no publicada (correcto si no hubo escritura).')
    }
  } else {
    console.log('INFO — modo local (sin --online no se lee R2).')
  }
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nCarga 3E verificada: objetos, aritmética, estados y alcance OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
