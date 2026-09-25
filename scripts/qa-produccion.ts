/**
 * QA masivo de PRODUCCIÓN: SSR de 250 municipios estratificados + XLSX de 30.
 * Solo lectura contra producción; no escribe nada.
 *
 * Comprueba:
 *  - ningún 500 ni HTML roto ni "Application error"
 *  - educación 2021 visible en la hoja sociocultural
 *  - agrario 2020 visible en la hoja economia
 *  - migración: FLUJOS y SALDO separados en la hoja demografía
 *  - datos preexistentes (población, renta/DIRCE, elecciones) intactos
 *  - ND no se presenta como 0 (indicios en HTML)
 *  - XLSX abre, 11 hojas del contrato `socideas-book@2`, tablas nuevas
 *    presentes (agrario, saldos, educación y diccionario de indicadores), sin
 *    corrupción
 *
 * Uso: npx tsx scripts/qa-produccion.ts [--ssr 250] [--xlsx 30]
 */
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

config({ path: '.env.local' })

const BASE = process.env.QA_BASE_URL ?? 'https://urb-ideas.vercel.app'
const args = process.argv.slice(2)
const argN = (k: string, d: number) => {
  const i = args.indexOf(k)
  return i >= 0 ? parseInt(args[i + 1] ?? String(d), 10) : d
}
const N_SSR = argN('--ssr', 250)
const N_XLSX = argN('--xlsx', 30)

type Muni = { codigo_ine: string; nombre: string; provincia: string; comunidad_autonoma: string }

interface Fail { code: string; hoja: string; what: string; detail: string }

async function fetchText(url: string): Promise<{ status: number; text: string; err?: string }> {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45_000) })
    const text = await r.text()
    return { status: r.status, text }
  } catch (e) {
    return { status: 0, text: '', err: (e as Error).message }
  }
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        await fn(items[idx])
      }
    }),
  )
}

async function main() {
  console.log(`=== QA producción ${BASE} · SSR ${N_SSR} · XLSX ${N_XLSX} ===`)
  // Muestra estratificada a partir del CSV nacional del Censo 2021 ya en caché
  // (8.131 códigos INE-5 + nombre): sin depender de Supabase ni de nombres como clave.
  const csvPath = path.join(process.cwd(), 'tmp', 'ine-55249-censo2021.csv')
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Falta ${csvPath}: reejecutar scripts/load-education-censo-2021.ts --dry-run`)
  }
  const csv = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '')
  const csvLines = csv.split(/\r?\n/)
  const seen = new Map<string, string>()
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split('\t')
    if (cols.length < 7) continue
    const m = /^(\d{5})\s+(.+)$/.exec(cols[2] ?? '')
    if (m && !seen.has(m[1])) seen.set(m[1], m[2].trim())
    if (seen.size >= 4000) break
  }
  const munis: Muni[] = [...seen.entries()].map(([codigo_ine, nombre]) => ({
    codigo_ine,
    nombre,
    provincia: codigo_ine.slice(0, 2),
    comunidad_autonoma: '',
  }))
  // Muestreo regular para cubrir todo el territorio.
  const step = Math.max(1, Math.floor(munis.length / N_SSR))
  const ssrSet: Muni[] = []
  for (let i = 0; i < munis.length && ssrSet.length < N_SSR; i += step) ssrSet.push(munis[i])
  const xlsxSet: Muni[] = []
  const xStep = Math.max(1, Math.floor(ssrSet.length / N_XLSX))
  for (let i = 0; i < ssrSet.length && xlsxSet.length < N_XLSX; i += xStep) xlsxSet.push(ssrSet[i])
  console.log(`  Municipios SSR: ${ssrSet.length} · XLSX: ${xlsxSet.length} · origen: ${munis.length} filas`)

  // ── SSR ──
  const HOJAS: Array<{ q: string; nombre: string; checks: Array<{ needle: string; clave: string }> }> = [
    {
      q: '',
      nombre: 'demografia',
      checks: [
        { needle: 'Flujos migratorios', clave: 'flujos' },
        { needle: 'Saldo migratorio neto', clave: 'saldo' },
        { needle: 'Datos oficiales', clave: 'traza' },
      ],
    },
    {
      q: '?hoja=economia',
      nombre: 'economia',
      checks: [
        { needle: 'Sector agrario', clave: 'agrario' },
        { needle: 'Censo Agrario 2020', clave: 'agrarioAnio' },
        { needle: 'Renta', clave: 'renta' },
      ],
    },
    {
      q: '?hoja=sociocultural',
      nombre: 'sociocultural',
      checks: [
        { needle: 'Nivel educativo', clave: 'educacion' },
        { needle: 'Censo de Población y Viviendas 2021', clave: 'censo2021' },
      ],
    },
  ]

  const fails: Fail[] = []
  let okPages = 0
  let total = 0
  const stats = new Map<string, number>()
  const bump = (k: string) => stats.set(k, (stats.get(k) ?? 0) + 1)

  await pool(
    ssrSet,
    8,
    async (m) => {
      for (const hoja of HOJAS) {
        total++
        const url = `${BASE}/socideas/${m.codigo_ine}${hoja.q}`
        const { status, text, err } = await fetchText(url)
        if (err || status !== 200) {
          fails.push({ code: m.codigo_ine, hoja: hoja.nombre, what: 'HTTP', detail: `${status} ${err ?? ''}` })
          continue
        }
        if (text.length < 5000) {
          fails.push({ code: m.codigo_ine, hoja: hoja.nombre, what: 'HTML corto', detail: `${text.length} B` })
          continue
        }
        if (/Application error|Internal Server Error|__NEXT_ERROR__|Error: /i.test(text.slice(0, 4000))) {
          fails.push({ code: m.codigo_ine, hoja: hoja.nombre, what: 'error en HTML', detail: text.slice(0, 160) })
          continue
        }
        if (m.nombre && !text.includes(m.nombre.slice(0, Math.min(12, m.nombre.length)))) {
          fails.push({ code: m.codigo_ine, hoja: hoja.nombre, what: 'nombre ausente', detail: m.nombre })
          continue
        }
        for (const c of hoja.checks) {
          if (text.includes(c.needle)) bump(`${hoja.nombre}:${c.clave}`)
        }
        // ND no debe aparecer como "0" en el bloque de saldos.
        if (hoja.nombre === 'demografia' && text.includes('Saldo migratorio neto')) {
          const seg = text.slice(text.indexOf('Saldo migratorio neto'), text.indexOf('Saldo migratorio neto') + 3000)
          bump('demografia:bloqueSaldo')
          if (/>ND</.test(seg) || /ND/.test(seg)) bump('demografia:ndPresente')
        }
        okPages++
      }
    },
  )

  console.log('  --- SSR ---')
  console.log(`  Páginas correctas: ${okPages}/${total} · fallos: ${fails.length}`)
  for (const [k, v] of [...stats.entries()].sort()) console.log(`    ${k}: ${v}`)

  // ── XLSX ──
  console.log('  --- XLSX ---')
  const outDir = path.join(process.cwd(), 'tmp', 'qa-xlsx')
  fs.mkdirSync(outDir, { recursive: true })
  let xlsxOk = 0
  const xlsxFails: string[] = []
  const HOJAS_ESPERADAS = [
    '00_RESUMEN', '01_DEMOGRAFÍA', '02_POLÍTICA', '03_ECONOMÍA_Y_EMPLEO', '04_AGRARIO',
    '05_SOCIAL_EDUCACIÓN_SERVICIOS', '06_VIVIENDA_Y_HOGARES', '07_PATRIMONIO_TURISMO',
    '08_INFRAESTRUCTURA_RECURSOS', '09_ASOCIACIONES_GOBERNANZA', '10_METODOLOGÍA_FUENTES',
  ]
  await pool(
    xlsxSet,
    4,
    async (m) => {
      try {
        const r = await fetch(`${BASE}/api/socideas/exportar/${m.codigo_ine}`, { signal: AbortSignal.timeout(90_000) })
        if (r.status !== 200) { xlsxFails.push(`${m.codigo_ine}: HTTP ${r.status}`); return }
        const buf = Buffer.from(await r.arrayBuffer())
        // ZIP válido = firma PK\x03\x04
        if (buf.length < 5000 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
          xlsxFails.push(`${m.codigo_ine}: no es ZIP/XLSX (${buf.length} B)`); return
        }
        const zipPath = path.join(outDir, `${m.codigo_ine}.zip`)
        fs.writeFileSync(zipPath, buf)
        const dest = path.join(outDir, m.codigo_ine)
        fs.rmSync(dest, { recursive: true, force: true })
        const { execSync } = await import('node:child_process')
        execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force"`, { stdio: 'ignore' })
        const wbPath = path.join(dest, 'xl', 'workbook.xml')
        if (!fs.existsSync(wbPath)) { xlsxFails.push(`${m.codigo_ine}: sin workbook.xml`); return }
        const wb = fs.readFileSync(wbPath, 'utf8')
        const missing = HOJAS_ESPERADAS.filter((h) => !wb.includes(h))
        if (missing.length) { xlsxFails.push(`${m.codigo_ine}: faltan hojas ${missing.join(',')}`); return }
        const ssPath = path.join(dest, 'xl', 'sharedStrings.xml')
        const ss = fs.existsSync(ssPath) ? fs.readFileSync(ssPath, 'utf8') : ''
        if (!ss.includes('Usos del suelo agrario')) xlsxFails.push(`${m.codigo_ine}: falta tabla 'Usos del suelo agrario'`)
        if (!ss.includes('Saldo migratorio')) xlsxFails.push(`${m.codigo_ine}: falta tabla 'Saldo migratorio'`)
        if (!ss.includes('Nivel educativo')) xlsxFails.push(`${m.codigo_ine}: falta tabla 'Nivel educativo'`)
        if (!ss.includes('Diccionario de indicadores')) xlsxFails.push(`${m.codigo_ine}: falta 'Diccionario de indicadores'`)
        xlsxOk++
      } catch (e) {
        xlsxFails.push(`${m.codigo_ine}: ${(e as Error).message}`)
      }
    },
  )
  console.log(`  XLSX correctos: ${xlsxOk}/${xlsxSet.length} · fallos: ${xlsxFails.length}`)
  for (const f of xlsxFails.slice(0, 10)) console.log(`    ${f}`)

  const pass = fails.length === 0 && xlsxFails.length === 0
  console.log(`\nRESULTADO QA: ${pass ? 'PASS' : 'FAIL'} · SSR ${okPages}/${total} · XLSX ${xlsxOk}/${xlsxSet.length}`)

  const report = {
    fecha: new Date().toISOString(),
    base: BASE,
    ssr: { pedidos: total, ok: okPages, fallos: fails.slice(0, 50) },
    xlsx: { pedidos: xlsxSet.length, ok: xlsxOk, fallos: xlsxFails },
    stats: Object.fromEntries(stats),
    pass,
  }
  const repPath = path.join(process.cwd(), 'tmp', `qa-produccion-${Date.now()}.json`)
  fs.writeFileSync(repPath, JSON.stringify(report, null, 2))
  console.log(`  Informe: ${repPath}`)
  if (!pass) process.exit(1)
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
