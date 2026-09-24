// Diagnóstico del endpoint de exportación XLSX.
// Ejecuta el flujo completo para un código INE dado y produce un resumen
// de cada etapa, identificando exactamente dónde falla.
//
// Uso:
//   npx tsx scripts/diagnose-xlsx-export.ts              (todos los municipios)
//   npx tsx scripts/diagnose-xlsx-export.ts 02003        (solo Albacete)
//   npx tsx scripts/diagnose-xlsx-export.ts --sheet=demography (solo hoja demografía)
//
// Sin servidor: prueba el generador directamente con datos sintéticos + env vars reales.
import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { createSupabaseServerSafe } from '../src/lib/supabase-server'
import { getPerfilDemografico } from '../src/lib/socideas-perfil'
import { getPerfilEconomico } from '../src/lib/socideas-economia'
import { readDemographicPresentation } from '../src/lib/socideas-demographic-summary'
import { readMunicipalIneLayers } from '../src/lib/socideas-ine-layers'
import { buildDemographicDimensionTables } from '../src/lib/socideas-demographic-export'
import { buildDemografiaTables, buildEconomiaTables } from '../src/lib/socideas-export'
import { buildMunicipioWorkbook, type ComparativeSheetInput } from '../src/lib/socideas-xlsx'
import type { ExportTable } from '../src/lib/socideas-export'

type Stage = {
  name: string
  status: 'ok' | 'error' | 'skipped'
  duration?: number
  detail?: string
  error?: string
}

const ALL_MUNICIPIOS = ['02003', '07010', '02069', '28143']
// Hojas del contrato `socideas-book@2` (el filtro --sheet= compara contra el
// destino v2 de cada hoja de entrada v1).
const SHEET_FLAGS: Record<string, string[]> = {
  project: ['00_RESUMEN'],
  demography: ['01_DEMOGRAFÍA'],
  political: ['02_POLÍTICA'],
  economy: ['03_ECONOMÍA_Y_EMPLEO'],
  agrarian: ['04_AGRARIO'],
  services: ['05_SOCIAL_EDUCACIÓN_SERVICIOS'],
  housing: ['06_VIVIENDA_Y_HOGARES'],
  heritage: ['07_PATRIMONIO_TURISMO'],
  infrastructure: ['08_INFRAESTRUCTURA_RECURSOS'],
  associations: ['09_ASOCIACIONES_GOBERNANZA'],
  methodology: ['10_METODOLOGÍA_FUENTES'],
}
const V1_TO_V2: Record<string, string> = {
  '01_PERFIL_DEMOGRÁFICO': '01_DEMOGRAFÍA',
  '02_CONTEXTO_POLÍTICO': '02_POLÍTICA',
  '03_CONTEXTO_ECONÓMICO': '03_ECONOMÍA_Y_EMPLEO',
  '04_CONTEXTO_SOCIOCULTURAL': '05_SOCIAL_EDUCACIÓN_SERVICIOS',
  '05_PATRIMONIO_Y_TURISMO': '07_PATRIMONIO_TURISMO',
  '06_INFRAESTRUCTURA_Y_RECURSOS': '08_INFRAESTRUCTURA_RECURSOS',
  '07_ASOCIACIONES': '09_ASOCIACIONES_GOBERNANZA',
}

function hr(): string { return '-'.repeat(70) }

async function diagnoseOne(codigoINE: string, sheetFilter?: string): Promise<void> {
  console.log(`\n${hr()}`)
  console.log(`DIAGNÓSTICO: ${codigoINE}`)
  console.log(`${hr()}\n`)

  const stages: Stage[] = []
  const requestId = randomUUID().slice(0, 8).toUpperCase()

  // Stage 1: Supabase
  const s1 = { name: 'create_supabase_client', status: 'ok' as const, duration: 0, detail: '' }
  let t = Date.now()
  let supabase: ReturnType<typeof createSupabaseServerSafe> = null
  try {
    supabase = createSupabaseServerSafe()
    s1.detail = supabase ? 'client created' : 'env vars missing → null'
    if (!supabase) s1.status = 'error'
  } catch (e) {
    s1.status = 'error'
    s1.error = e instanceof Error ? e.message : String(e)
  }
  s1.duration = Date.now() - t
  stages.push(s1)
  if (!supabase) { printResults(codigoINE, stages, requestId); return }

  // Stage 2: Demographic profile
  const s2 = { name: 'getPerfilDemografico', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let demo: Awaited<ReturnType<typeof getPerfilDemografico>> | null = null
  try {
    demo = await getPerfilDemografico(supabase, codigoINE, {})
    s2.detail = `status=${demo.status}`
    if (demo.status === 'notFound' || demo.status === 'badRequest') s2.status = 'error'
  } catch (e) {
    s2.status = 'error'
    s2.error = e instanceof Error ? e.message : String(e)
  }
  s2.duration = Date.now() - t
  stages.push(s2)

  // Stage 3: Economic profile
  const s3 = { name: 'getPerfilEconomico', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let eco: Awaited<ReturnType<typeof getPerfilEconomico>> | null = null
  try {
    eco = await getPerfilEconomico(supabase, codigoINE)
    s3.detail = `status=${eco.status}`
    if (eco.status === 'notFound' || eco.status === 'badRequest') s3.status = 'error'
  } catch (e) {
    s3.status = 'error'
    s3.error = e instanceof Error ? e.message : String(e)
  }
  s3.duration = Date.now() - t
  stages.push(s3)

  // Check if we have data
  const perfilDemo = demo && (demo.status === 'ok' || demo.status === 'empty') ? demo.perfil : null
  const perfilEco = eco && (eco.status === 'ok' || eco.status === 'empty') ? eco.perfil : null
  if (!perfilDemo && !perfilEco) { printResults(codigoINE, stages, requestId); return }

  // Stage 4: Demographic presentation (R2)
  const s4 = { name: 'readDemographicPresentation', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let demoExtra = null
  try {
    demoExtra = await readDemographicPresentation(codigoINE).catch(() => null)
    s4.detail = demoExtra ? 'data loaded' : 'null (optional layer)'
  } catch (e) {
    s4.status = 'error'
    s4.error = e instanceof Error ? e.message : String(e)
  }
  s4.duration = Date.now() - t
  stages.push(s4)

  // Stage 5: INE layers (R2)
  const s5 = { name: 'readMunicipalIneLayers', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let ineLayers = null
  try {
    ineLayers = await readMunicipalIneLayers(codigoINE).catch(() => null)
    s5.detail = ineLayers ? 'data loaded' : 'null (optional layer)'
  } catch (e) {
    s5.status = 'error'
    s5.error = e instanceof Error ? e.message : String(e)
  }
  s5.duration = Date.now() - t
  stages.push(s5)

  // Stage 6: Build demographic tables
  const s6 = { name: 'buildDemografiaTables', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let demografia: ExportTable[] = []
  try {
    demografia = [
      ...(perfilDemo ? buildDemografiaTables(perfilDemo) : []),
      ...buildDemographicDimensionTables(demoExtra),
    ]
    s6.detail = `${demografia.length} blocks`
  } catch (e) {
    s6.status = 'error'
    s6.error = e instanceof Error ? e.message : String(e)
  }
  s6.duration = Date.now() - t
  stages.push(s6)

  // Stage 7: Build economic tables
  const s7 = { name: 'buildEconomiaTables', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let economia: ExportTable[] = []
  try {
    economia = perfilEco ? buildEconomiaTables(perfilEco) : []
    s7.detail = `${economia.length} blocks`
  } catch (e) {
    s7.status = 'error'
    s7.error = e instanceof Error ? e.message : String(e)
  }
  s7.duration = Date.now() - t
  stages.push(s7)

  if (demografia.length === 0 && economia.length === 0) {
    stages.push({ name: 'validate_has_data', status: 'error', detail: 'no blocks' })
    printResults(codigoINE, stages, requestId)
    return
  }

  // Stage 8: Build workbook
  const s8 = { name: 'buildMunicipioWorkbook', status: 'ok' as const, duration: 0, detail: '' }
  t = Date.now()
  let buffer: Buffer | null = null
  try {
    const municipio = perfilDemo?.municipio.nombre ?? perfilEco?.municipio.nombre ?? codigoINE
    const hojas: ComparativeSheetInput[] = [
      { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil demográfico', bloques: demografia },
      { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Contexto económico', bloques: economia },
    ]

    // Si hay filtro de hoja, solo incluir las que mapean a la hoja v2 pedida.
    const filteredHojas = sheetFilter
      ? hojas.filter((h) => {
          const allowed = SHEET_FLAGS[sheetFilter]
          return allowed ? allowed.includes(V1_TO_V2[h.id] ?? h.id) : true
        })
      : hojas

    buffer = await buildMunicipioWorkbook({
      municipio,
      codigoINE,
      provincia: perfilDemo?.municipio.provincia ?? perfilEco?.municipio.provincia ?? '?',
      comunidadAutonoma: perfilDemo?.municipio.comunidad_autonoma ?? perfilEco?.municipio.comunidad_autonoma ?? '?',
      fechaGeneracion: new Date().toISOString().slice(0, 10),
      hojas: filteredHojas,
      ineLayers,
    })
    s8.detail = `${buffer.length} bytes`
  } catch (e) {
    s8.status = 'error'
    s8.error = e instanceof Error ? e.message : String(e)
  }
  s8.duration = Date.now() - t
  stages.push(s8)

  // Stage 9: Validate XLSX
  if (buffer) {
    const s9 = { name: 'validate_xlsx', status: 'ok' as const, duration: 0, detail: '' }
    t = Date.now()
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const names = wb.worksheets.map((w) => w.name)
      s9.detail = `${names.length} sheets: ${names.join(', ')}`

      // Rasgos del contrato v2 (informativos, NO incidencias): freeze, filtro o
      // tabla nativa y fusiones de título/fuente/nota son obligatorios.
      const freezeSheets = wb.worksheets.filter((w) => (w.views ?? []).some((v) => v.state === 'frozen' || v.ySplit)).length
      const filterSheets = wb.worksheets.filter((w) => !!w.autoFilter || w.getTables().length > 0).length
      let merged = 0
      for (const w of wb.worksheets) w.eachRow((row) => row.eachCell((c) => { if (c.isMerged) merged += 1 }))
      s9.detail += ` [freeze ${freezeSheets}/${wb.worksheets.length}, filtro/tabla ${filterSheets}, fusiones ${merged}]`

      // Save file
      const filename = `tmp/diagnose-${codigoINE}.xlsx`
      writeFileSync(filename, buffer)
      s9.detail += ` → ${filename}`
    } catch (e) {
      s9.status = 'error'
      s9.error = e instanceof Error ? e.message : String(e)
    }
    s9.duration = Date.now() - t
    stages.push(s9)
  }

  printResults(codigoINE, stages, requestId)
}

function printResults(codigoINE: string, stages: Stage[], requestId: string): void {
  console.log(`\nRequest ID: ${requestId}`)
  console.log(`Código INE: ${codigoINE}`)
  console.log(`\n${'Etapa'.padEnd(35)} ${'Estado'.padEnd(10)} ${'ms'.padStart(8)}  Detalle`)
  console.log('-'.repeat(85))
  for (const s of stages) {
    const icon = s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : '○'
    const ms = s.duration != null ? String(s.duration).padStart(8) : '       —'
    const err = s.error ? ` ERROR: ${s.error}` : ''
    console.log(`${icon} ${s.name.padEnd(33)} ${s.status.padEnd(10)} ${ms}  ${s.detail}${err}`)
  }

  const lastOk = stages.filter((s) => s.status === 'ok').pop()
  const firstErr = stages.find((s) => s.status === 'error')
  console.log(`\nÚltima etapa OK: ${lastOk?.name ?? 'ninguna'}`)
  if (firstErr) {
    console.log(`Primera etapa con error: ${firstErr.name}`)
    if (firstErr.error) console.log(`Error: ${firstErr.error}`)
  } else {
    console.log('Todas las etapas completadas sin error.')
  }
  console.log('')
}

async function main() {
  const args = process.argv.slice(2)
  const municipios = args.filter((a) => /^\d{5}$/.test(a))
  const sheetArg = args.find((a) => a.startsWith('--sheet='))
  const sheetFilter = sheetArg?.replace('--sheet=', '')

  const targets = municipios.length > 0 ? municipios : ALL_MUNICIPIOS

  for (const ine of targets) {
    await diagnoseOne(ine, sheetFilter)
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
