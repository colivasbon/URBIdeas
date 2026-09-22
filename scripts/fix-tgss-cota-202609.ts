// Parche de corrección R2: afiliacion_total con cotas ">=X" publicadas como valor exacto.
// Causa raíz: scripts/load-economia-batch1.ts (commit 4fa9b53, 04-09) hacía
// Number(raw.replace(/^>=/, '')) y publicaba la cota inferior como total exacto.
// Alcance verificado: 5.139 de 8.125 municipios (columna J del XLSX oficial Muni072026).
//
// Diseño (trazabilidad en Supabase, NO en el envelope — MEMORIA.md §3B):
// - Backup previo en tmp/ (JSON íntegro + SHA-256 por municipio), siempre local.
// - Merge por bloque: ELIMINA las tuplas afiliacion_total/tgss_2026_07/2026-07
//   cuyo valor coincide con la cota (ausencia = secreto/ND, patrón del proyecto).
//   Resto de tuplas intactas (demografía, migración, DIRCE, renta, Gini, SEPE).
// - data_sync_runs tipo 'tgss_correccion_cota_202609' con metadata auditable.
// - Manifest local tmp/tgss-fix-manifest-{fecha}.json.
//
// Uso:
//   npx tsx scripts/fix-tgss-cota-202609.ts [--parse-only] [--write --runid X]
//     [--limit N] [--offset N] [--codes 28143,08279] [--force]
// Por defecto (sin --write): DRY-RUN. No toca R2 ni Supabase bajo ningún concepto.
// La escritura real requiere --write explícito + runid, y aborta si el recuento
// de afectados difiere >5% del dry-run (salvaguarda anti-deriva de R2).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { putMunicipioJson, type R2MunicipioEnvelopeV2 } from '../src/lib/socideas-r2'

// Carga .env.local sin dependencias (nunca imprime valores; mismo patrón que load-economia-batch1.ts).
function loadEnvLocal(): void {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch { /* sin .env.local: fallará al necesitar credenciales */ }
}
loadEnvLocal()

const R2_PUBLIC = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const TGSS_URL = 'https://www.seg-social.es/descarga/es/Muni072026'
const TMP = join('tmp', 'tgss-fix-202609')
const BUDGET_BYTES = 150 * 1024
const SYNC_TIPO = 'tgss_correccion_cota_202609'
const CAUSA_COMMIT = '4fa9b53'
const FECHA_PUBLICACION_ORIGINAL = '2026-09-04'

interface Args {
  write: boolean
  runid: string
  limit: number
  offset: number
  codes: string[] | null
  force: boolean
  tgssXlsx: string
}

function get(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}
function stamp(): string {
  const d = new Date()
  const p = (n: number, l = 2): string => String(n).padStart(l, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex')
}
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}
async function getJson(url: string, tries = 4): Promise<unknown> {
  let last: Error | null = null
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return (await r.json()) as unknown
    } catch (e) {
      last = e as Error
      await sleep(500 * 2 ** i)
    }
  }
  throw last ?? new Error('GET fallido')
}

async function main(): Promise<void> {
  const args: Args = {
    write: process.argv.includes('--write'),
    runid: get('--runid') ?? `tgss_correccion_202609_${stamp()}`,
    limit: Number(get('--limit') ?? '100000'),
    offset: Number(get('--offset') ?? '0'),
    codes: get('--codes') ? String(get('--codes')).split(',').map((s) => s.trim()) : null,
    force: process.argv.includes('--force'),
    tgssXlsx: get('--tgss-xlsx') ?? join(TMP, 'Muni072026.xlsx'),
  }
  mkdirSync(TMP, { recursive: true })
  mkdirSync(join(TMP, 'backup'), { recursive: true })
  const manifestPath = join(TMP, `manifest-${args.runid}.json`)

  // FASE 0: fichero oficial (descarga si falta) y mapa de celdas ">=X".
  if (!existsSync(args.tgssXlsx) || args.force) {
    console.log('[tgss-fix] Descargando XLSX oficial…')
    const r = await fetch(TGSS_URL, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
    if (!r.ok) throw new Error(`TGSS HTTP ${r.status}`)
    writeFileSync(args.tgssXlsx, Buffer.from(await r.arrayBuffer()))
  }
  const wb = XLSX.readFile(args.tgssXlsx)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['ParaExportar'] ?? wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][]
  const cotas = new Map<string, string>() // ine -> celda literal ">=X"
  for (const r of rows) {
    const m = String((r as unknown[])[1] ?? '').match(/^\s*(\d{5})\b/)
    if (!m) continue
    const raw = String((r as unknown[])[9] ?? '').trim()
    if (/^>=/.test(raw)) cotas.set(m[1], raw)
  }
  let ines = [...cotas.keys()].sort()
  if (args.codes) ines = args.codes.filter((c) => cotas.has(c))
  ines = ines.slice(args.offset, args.offset + args.limit)
  console.log(`[tgss-fix] Celdas ">=X" en fichero oficial: ${cotas.size}. A procesar: ${ines.length}. Modo: ${args.write ? 'WRITE' : 'DRY-RUN'}`)

  // Manifest (resumible).
  type Item = {
    ine: string; celda: string; valorIncorrecto: number | null; bytesAntes: number; bytesDespues: number
    tuplasEliminadas: number; otrasTuplasIntactas: boolean; backupSha: string; estado: string; readback?: string
  }
  let manifest: { runid: string; items: Record<string, Item>; dryRunCount?: number } = { runid: args.runid, items: {} }
  if (existsSync(manifestPath) && !args.force) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as typeof manifest
  }

  const CONC = 8
  // Salvaguarda >5% (solo en --write): R2 no debe haber derivado desde el dry-run.
  // Doble nivel: (a) celdas ">=X" en fuente vs ref; (b) tuplas objetivo reales
  // en R2 vs EXPECTED_OK=3725 (preflight con lectura viva, aborta antes de escribir).
  const EXPECTED_OK = 3725
  if (args.write) {
    const ref = manifest.dryRunCount ?? cotas.size
    const drift = Math.abs(cotas.size - ref) / Math.max(1, ref)
    if (drift > 0.05) {
      throw new Error(`ABORTO: afectados=${cotas.size} difiere >5% del dry-run (${ref}). R2 o la fuente cambiaron; revisar antes de escribir.`)
    }
    console.log(`[tgss-fix] Salvaguarda fuente OK: afectados=${cotas.size} vs ref=${ref} (deriva ${(drift * 100).toFixed(2)}%).`)
    const m = manifest as typeof manifest & { preflightOk?: number }
    if (m.preflightOk === undefined || args.force) {
      console.log('[tgss-fix] Preflight: recontando tuplas objetivo vivas en R2…')
      const todas = [...cotas.keys()].sort()
      let confirm = 0
      for (let i = 0; i < todas.length; i += CONC) {
        const batch = todas.slice(i, i + CONC)
        const counts = await Promise.all(batch.map(async (ine) => {
          try {
            const env = (await getJson(`${R2_PUBLIC}/socideas/v2/municipios/${ine}.json`)) as R2MunicipioEnvelopeV2
            const idx = new Map<number, string>()
            env.indicators.forEach((x, n) => idx.set(n, x.slug))
            const celda = cotas.get(ine) ?? ''
            const esperado = Number(celda.replace(/^>=/, '').replace(/\./g, ''))
            return (env.valores as unknown[][]).filter((v) => {
              const t = v as [number, number, number | null, string, number, number, string | null, string | null, string]
              if (idx.get(t[0]) !== 'afiliacion_total' || t[6] !== 'tgss_2026_07' || t[2] !== esperado) return false
              const d = (env.dimensiones[t[4]] ?? {}) as Record<string, string>
              return d.periodo === '2026-07' && d.ambito === 'municipio'
            }).length
          } catch { return -1 }
        }))
        confirm += counts.filter((c) => c === 1).length
      }
      m.preflightOk = confirm
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
      console.log(`[tgss-fix] Preflight: ${confirm} tuplas objetivo vivas (esperado ${EXPECTED_OK} ±5% → [${Math.round(EXPECTED_OK * 0.95)}, ${Math.round(EXPECTED_OK * 1.05)}]).`)
      if (confirm < EXPECTED_OK * 0.95 || confirm > EXPECTED_OK * 1.05) {
        delete m.preflightOk
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
        throw new Error(`ABORTO: preflight=${confirm} fuera de rango ±5% de ${EXPECTED_OK}. R2 derivó desde el dry-run; revisar antes de escribir.`)
      }
    } else {
      console.log(`[tgss-fix] Preflight ya superado en este runid (${m.preflightOk} confirmadas).`)
    }
  } else {
    manifest.dryRunCount = cotas.size
  }

  // Clientes de escritura SOLO en modo --write (en dry-run ni se construyen).
  // Si no hay SUPABASE_SERVICE_ROLE_KEY y se pasa --defer-audit, las filas de
  // auditoría se acumulan en manifest.pendingAudit para insertarlas en bloque
  // justo después (misma autorización, mismo contenido); el runid NO se da por
  // cerrado hasta que ese bulk insert queda verificado.
  const deferAudit = process.argv.includes('--defer-audit')
  let supabase: { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } } | null = null
  if (args.write) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const { createClient } = await import('@supabase/supabase-js')
      supabase = createClient(url, key, { auth: { persistSession: false } }) as unknown as NonNullable<typeof supabase>
    } else if (!deferAudit) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY y no se pasó --defer-audit: sin trazabilidad no se escribe.')
    } else {
      console.log('[tgss-fix] Sin service-role: auditoría diferida a bulk insert posterior (mismo runid).')
    }
  }

  let ok = 0, errores = 0, sinCambios = 0
  // Solo INE con put + read-back OK (modo --write): revalidación selectiva.
  const escritosInes: string[] = []
  for (let i = 0; i < ines.length; i += CONC) {
    const batch = ines.slice(i, i + CONC)
    await Promise.all(batch.map(async (ine) => {
      try {
        if (manifest.items[ine]?.estado === 'ok' && !args.force) { ok++; return }
        const env = (await getJson(`${R2_PUBLIC}/socideas/v2/municipios/${ine}.json`)) as R2MunicipioEnvelopeV2
        const rawText = JSON.stringify(env)
        const bytesAntes = rawText.length
        const backupPath = join(TMP, 'backup', `${ine}.json`)
        if (!existsSync(backupPath) || args.force) writeFileSync(backupPath, rawText)
        const backupSha = sha256(rawText)
        const idx = new Map<number, string>()
        env.indicators.forEach((x, n) => idx.set(n, x.slug))
        const esObjetivo = (v: unknown[]): boolean => {
          const t = v as [number, number, number | null, string, number, number, string | null, string | null, string]
          if (idx.get(t[0]) !== 'afiliacion_total' || t[6] !== 'tgss_2026_07') return false
          const d = (env.dimensiones[t[4]] ?? {}) as Record<string, string>
          return d.periodo === '2026-07' && d.ambito === 'municipio'
        };
        const objetivos = env.valores.filter(esObjetivo)
        const celda = cotas.get(ine) ?? ''
        const esperado = Number(celda.replace(/^>=/, '').replace(/\./g, ''))
        const coinciden = objetivos.filter((v) => (v as number[])[2] === esperado)
        if (objetivos.length === 0) { sinCambios++; manifest.items[ine] = { ine, celda, valorIncorrecto: null, bytesAntes, bytesDespues: bytesAntes, tuplasEliminadas: 0, otrasTuplasIntactas: true, backupSha, estado: 'sin-tupla-objetivo' }; return }
        if (coinciden.length !== objetivos.length) {
          throw new Error(`tupla no coincide con celda: objetivos=${objetivos.length} coinciden=${coinciden.length} celda=${celda}`)
        }
        const resto = env.valores.filter((v) => !esObjetivo(v))
        const otrasIntactas = resto.length + objetivos.length === env.valores.length
        const nuevo = { ...env, valores: resto }
        const bytesDespues = JSON.stringify(nuevo).length
        if (bytesDespues > BUDGET_BYTES) throw new Error(`presupuesto superado: ${bytesDespues}`)
        if (bytesDespues >= bytesAntes) throw new Error('el parche debe reducir tamaño, no aumentarlo')
        const item: Item = {
          ine, celda, valorIncorrecto: esperado, bytesAntes, bytesDespues,
          tuplasEliminadas: objetivos.length, otrasTuplasIntactas: otrasIntactas, backupSha, estado: 'ok',
        }
        if (args.write) {
          const key = await putMunicipioJson(ine, nuevo)
          const rb = await fetch(`${R2_PUBLIC}/socideas/v2/municipios/${ine}.json?rb=${Date.now()}`, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
          if (!rb.ok) throw new Error(`read-back HTTP ${rb.status}`)
          const rbJson = (await rb.json()) as { codigo_ine?: string; valores?: unknown[] }
          if (rbJson.codigo_ine !== ine || !Array.isArray(rbJson.valores)) throw new Error('read-back inválido')
          if ((rbJson.valores as unknown[]).some(esObjetivo)) throw new Error('read-back aún contiene la tupla')
          item.readback = 'ok'
          escritosInes.push(ine)
          const auditRow = {
            source_id: null, tipo_sincronizacion: SYNC_TIPO, municipio_codigo_ine: ine, estado: 'ok',
            fin: new Date().toISOString(), estado_dato: 'consolidado', bloque: 'economia', periodo: '2026-07', fuente: 'tgss',
            metadata: {
              valor_incorrecto_publicado: esperado, celda_original_fichero: celda,
              accion: 'tupla eliminada, pasa a ND', commit_causa_raiz: CAUSA_COMMIT,
              fecha_publicacion_original: FECHA_PUBLICACION_ORIGINAL,
              fecha_correccion: new Date().toISOString().slice(0, 10), runid: args.runid, clave_r2: key,
            },
          }
          if (supabase) {
            await supabase.from('data_sync_runs').insert(auditRow)
          } else {
            const m2 = manifest as typeof manifest & { pendingAudit?: unknown[] }
            m2.pendingAudit = m2.pendingAudit ?? []
            m2.pendingAudit.push(auditRow)
          }
        }
        manifest.items[ine] = item
        ok++
      } catch (e) {
        errores++
        manifest.items[ine] = { ine, celda: cotas.get(ine) ?? '', valorIncorrecto: null, bytesAntes: 0, bytesDespues: 0, tuplasEliminadas: 0, otrasTuplasIntactas: false, backupSha: '', estado: `error: ${String((e as Error).message).slice(0, 200)}` }
      }
    }))
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
    if ((i / CONC) % 10 === 0) console.log(`[tgss-fix] ${Math.min(i + CONC, ines.length)}/${ines.length} ok=${ok} errores=${errores}`)
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
  console.log(`[tgss-fix] FIN modo=${args.write ? 'WRITE' : 'DRY-RUN'} ok=${ok} sinCambios=${sinCambios} errores=${errores} manifest=${manifestPath}`)
  if (!args.write) console.log('[tgss-fix] Sin --write no se toca R2 ni Supabase. Usa --write --runid para la ejecución real (tras autorización).')
  // Revalidación selectiva post-reparación (solo --write y solo INE verificados).
  // Fallo de revalidación: NO se revierte la reparación; queda auditado.
  if (args.write) {
    const { buildRevalidationAuditRow, revalidateAfterWrites } = await import('../src/lib/socideas-revalidate')
    const reval = await revalidateAfterWrites(escritosInes)
    if (reval) {
      console.log(`[tgss-fix][revalidacion] solicitadas=${reval.solicitados} revalidadas=${reval.invalidados} fallidas=${reval.errores} degradado=${reval.degradado}`)
      if (reval.error) console.error(`[tgss-fix][revalidacion] ${reval.error}`)
      try {
        const row = buildRevalidationAuditRow(reval, {
          runId: args.runid ?? `tgss-fix-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}`,
          writtenCount: escritosInes.length,
          tipo: `${SYNC_TIPO}_revalidacion`,
          bloque: 'economia',
          periodo: '2026-07',
          fuente: 'tgss',
        })
        if (supabase) await supabase.from('data_sync_runs').insert(row)
        else {
          const m2 = manifest as typeof manifest & { pendingAudit?: unknown[] }
          m2.pendingAudit = m2.pendingAudit ?? []
          m2.pendingAudit.push(row)
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
        }
      } catch (e) {
        console.error(`[tgss-fix][revalidacion] auditoría no insertada: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
}

main().catch((e) => { console.error('ERROR', (e as Error).message); process.exit(1) })
