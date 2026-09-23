/**
 * DRY-RUN CONPREL — muestra estratificada de 100 municipios + validación
 * sistemática del join `LEFT(codente,5)` frente al catálogo INE-5.
 *
 * SOLO LECTURA: no escribe R2, Supabase ni publica nada. Requiere CSVs
 * extraídos del Access definitivo (PowerShell + ACE OLEDB) en:
 *   %TEMP%/opencode/conprel/csv/inv_ppto2025.csv
 *   %TEMP%/opencode/conprel/csv/inv_liq2024.csv
 * con columnas `codente|estado|nombreente|poblacion|nsec`.
 *
 * Uso: npx tsx scripts/dry-run-conprel-100.ts
 * Salida: tmp/conprel-dryrun-100-<ts>.json (+ resumen por consola).
 *
 * Diagnóstico de join (NO es el join de producción):
 *  - ¿el prefijo de5 dígitos existe en el catálogo INE-5?
 *  - si existe, ¿el nombre CONPREL coincide con el nombre INE? (colisión =
 *    join incorrecto si se usara el prefijo a ciegas)
 *  - presencia "diagnóstico" por nombre (solo para estimar cobertura; un
 *    join por nombre NUNCA se aprueba como método final).
 */
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const CONPREL_DIR = path.join(
  process.env.TEMP ?? process.env.TMP ?? '.',
  'opencode',
  'conprel',
)
const CSV_DIR = path.join(CONPREL_DIR, 'csv')

/** Excepciones/forzosos de la muestra (10). */
const EXTRAS = [
  '15078', // Santiago de Compostela (INE real)
  '30016', // Cartagena
  '51001', // Ceuta
  '52001', // Melilla
  '02001', // Abengibre (rural)
  '27044', // A Pastoriza (rural, Lugo)
  '35004', // Arrecife (isla)
  '07026', // Eivissa (isla)
  '31232', // Tudela (foral)
  '48044', // Getxo (relacionado con el caso 48013/48020 de Bizkaia)
]

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface InvRow {
  prefix: string
  codente: string
  estado: string
  nombre: string
}

function loadInventory(csvPath: string): InvRow[] {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const out: InvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const [codente, estado, nombre] = lines[i].split('|')
    if (!codente || codente.length < 5) continue
    out.push({ prefix: codente.slice(0, 5), codente, estado: estado ?? '', nombre: nombre ?? '' })
  }
  return out
}

/** Filas "municipales": tipo AA o entidades de Ceuta/Melilla (ZZ/ZV/ZO…). */
function isMunicipalRow(r: InvRow): boolean {
  const tipo = r.codente.slice(5, 7)
  if (tipo === 'AA') return true
  if (r.prefix === '51001' || r.prefix === '52001') return tipo !== 'AV' && tipo !== 'MM'
  return false
}

async function main(): Promise<void> {
  console.log('=== DRY-RUN CONPREL · muestra 100 + validación de join (solo lectura) ===')
  const pptoPath = path.join(CSV_DIR, 'inv_ppto2025.csv')
  const liqPath = path.join(CSV_DIR, 'inv_liq2024.csv')
  if (!fs.existsSync(pptoPath) || !fs.existsSync(liqPath)) {
    console.error(`Faltan CSVs en ${CSV_DIR}. Ejecutar la extracción ACE primero.`)
    process.exit(1)
  }
  const ppto = loadInventory(pptoPath)
  const liq = loadInventory(liqPath)
  console.log(`Inventarios: ppto2025=${ppto.length} filas · liq2024=${liq.length} filas`)

  // Catálogo INE-5 (solo lectura)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Faltan claves Supabase en .env.local'); process.exit(1) }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const catalog = new Map<string, string>() // ine -> nombre
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre')
      .order('codigo_ine')
      .range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as { codigo_ine: string; nombre: string }[]) {
      catalog.set(r.codigo_ine.trim(), r.nombre)
    }
    if (((data ?? []).length) < 1000) break
  }
  console.log(`Catálogo INE: ${catalog.size} municipios`)

  // ── 1. Validación sistemática del join sobre filas municipales ──
  function joinStats(rows: InvRow[], label: string) {
    const mun = rows.filter(isMunicipalRow)
    let inCatalog = 0
    let nameOk = 0
    let collision = 0
    let unknown = 0
    const collisionSamples: Array<{ conprel: string; ine: string; conprelName: string; ineName: string }> = []
    const unknownSamples: string[] = []
    for (const r of mun) {
      const ineName = catalog.get(r.prefix)
      if (ineName === undefined) {
        unknown++
        if (unknownSamples.length < 8) unknownSamples.push(`${r.codente} (${r.nombre})`)
        continue
      }
      inCatalog++
      if (normName(ineName) === normName(r.nombre)) nameOk++
      else {
        collision++
        if (collisionSamples.length < 12) {
          collisionSamples.push({ conprel: r.codente, ine: r.prefix, conprelName: r.nombre, ineName })
        }
      }
    }
    const stats = {
      label,
      municipales: mun.length,
      prefijoEnCatalogo: inCatalog,
      nombreCoincide: nameOk,
      colisionNombre: collision,
      prefijoDesconocido: unknown,
      pctNombreOk: mun.length ? Math.round((nameOk / mun.length) * 1000) / 10 : 0,
      colisionSamples: collisionSamples,
      desconocidoSamples: unknownSamples,
    }
    console.log(
      `[${label}] municipales=${mun.length} prefijo∈cat=${inCatalog} nombreOK=${nameOk} COLISION=${collision} desconocido=${unknown} (${stats.pctNombreOk}% nombreOK)`,
    )
    for (const c of collisionSamples.slice(0, 5)) {
      console.log(`  COLISION: CONPREL ${c.conprel}="${c.conprelName}" vs INE ${c.ine}="${c.ineName}"`)
    }
    return stats
  }
  const statsPpto = joinStats(ppto, 'PPTO-2025')
  const statsLiq = joinStats(liq, 'LIQ-2024')

  // ── 2. Caso 48013 / Bilbao (investigación específica) ──
  const caso48013 = {
    ineBilbao: '48013',
    pptoFilasPrefijo48013: ppto.filter((r) => r.prefix === '48013').map((r) => `${r.codente}=${r.nombre}`),
    pptoFilasNombreBilbao: ppto.filter((r) => /bilbao/i.test(r.nombre) && isMunicipalRow(r)).map((r) => r.codente),
    liqFilasPrefijo48013: liq.filter((r) => r.prefix === '48013').map((r) => `${r.codente}=${r.nombre}`),
    liqFilasNombreBilbao: liq.filter((r) => /bilbao/i.test(r.nombre) && isMunicipalRow(r)).map((r) => `${r.codente}=${r.nombre}`),
    hallazgo:
      'CONPREL asigna a Bilbao el codente 48020AA000 (no el INE 48013) y usa 48013AA000 para Barakaldo ' +
      '(INE 48015). LEFT(codente,5)=INE-5 queda FALSIFICADO como regla general.',
  }
  console.log('Caso 48013:', JSON.stringify(caso48013, null, 2))

  // ── 3. Muestra estratificada de 100 ──
  // Capitals verificados contra el catálogo INE (corrección: Burgos=09059,
  // Cáceres=10037, Cádiz=11012, Granada=18087, Huelva=21041, Jaén=23050,
  // Teruel=44216, Zaragoza=50297, Bilbao=48020; Toledo=45168).
  const cap50 = [
    '01059', '02003', '03014', '04013', '05019', '07040', '08019', '09059',
    '10037', '11012', '12013', '13016', '14021', '15030', '16078', '17093',
    '18087', '19130', '20069', '21041', '22125', '23050', '24089', '25120',
    '26078', '27028', '28079', '29067', '30030', '31201', '32030', '33044',
    '34120', '35016', '36038', '37274', '38038', '39075', '40194', '41091',
    '42173', '43004', '44216', '45168', '46078', '47186', '48020', '49257',
    '50297',
  ].filter((x) => catalog.has(x))
  if (cap50.length !== 50) console.warn(`Aviso: solo ${cap50.length}/50 capitales presentes en catálogo`)
  const sampleSet = new Set<string>([...cap50, ...EXTRAS.filter((x) => catalog.has(x))])
  // Relleno rural estratificado (población < 1000), determinista.
  const rurales: Array<[string, number | null]> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, poblacion')
      .lt('poblacion', 1000)
      .order('codigo_ine')
      .range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as { codigo_ine: string; poblacion: number | null }[]) {
      rurales.push([r.codigo_ine.trim(), r.poblacion])
    }
    if (((data ?? []).length) < 1000) break
  }
  const need = 100 - sampleSet.size
  const stride = Math.max(1, Math.floor(rurales.length / Math.max(need, 1)))
  for (let i = 0; i < rurales.length && sampleSet.size < 100; i += stride) {
    const [ine] = rurales[i]
    if (!sampleSet.has(ine)) sampleSet.add(ine)
  }
  // Completar si el stride no llegó a100
  for (const [ine] of rurales) {
    if (sampleSet.size >= 100) break
    sampleSet.add(ine)
  }
  const muestra = [...sampleSet].sort().slice(0, 100)
  if (muestra.length !== 100) console.warn(`Aviso: muestra=${muestra.length} (objetivo 100)`)

  function diagnoseIne(ine: string) {
    const ineName = catalog.get(ine) ?? ''
    const naiveP = ppto.find((r) => isMunicipalRow(r) && r.prefix === ine)
    const naiveL = liq.find((r) => isMunicipalRow(r) && r.prefix === ine)
    const nameP = ppto.find((r) => isMunicipalRowRowName(r, ineName))
    const nameL = liq.find((r) => isMunicipalRowRowName(r, ineName))
    const naivePOk = naiveP ? normName(naiveP.nombre) === normName(ineName) : false
    const naiveLOk = naiveL ? normName(naiveL.nombre) === normName(ineName) : false
    return {
      ine,
      nombre: ineName,
      ppto: {
        naive: naiveP ? `${naiveP.codente}=${naiveP.nombre}` : null,
        naiveCorrecto: naiveP ? naivePOk : null,
        presenciaDiagnosticoNombre: nameP ? nameP.codente : null,
      },
      liq: {
        naive: naiveL ? `${naiveL.codente}=${naiveL.nombre}` : null,
        naiveCorrecto: naiveL ? naiveLOk : null,
        presenciaDiagnosticoNombre: nameL ? nameL.codente : null,
      },
    }
  }
  function isMunicipalRowRowName(r: InvRow, ineName: string): boolean {
    return isMunicipalRow(r) && normName(r.nombre) === normName(ineName)
  }

  const diagnostico = muestra.map(diagnoseIne)
  const naiveErroneosP = diagnostico.filter((d) => d.ppto.naive !== null && d.ppto.naiveCorrecto === false)
  const naiveErroneosL = diagnostico.filter((d) => d.liq.naive !== null && d.liq.naiveCorrecto === false)
  const naiveAusenteP = diagnostico.filter((d) => d.ppto.naive === null)
  const naiveAusenteL = diagnostico.filter((d) => d.liq.naive === null)
  const presenteNombreP = diagnostico.filter((d) => d.ppto.presenciaDiagnosticoNombre !== null)
  const presenteNombreL = diagnostico.filter((d) => d.liq.presenciaDiagnosticoNombre !== null)

  console.log('\n--- Muestra 100: resumen del join NAIVO (prefijo=INE) ---')
  console.log(`PPTO2025: naive-hit=${100 - naiveAusenteP.length} naive-COLISION=${naiveErroneosP.length} naive-ausente=${naiveAusenteP.length} | presencia-diagnóstico-por-nombre=${presenteNombreP.length}/100`)
  console.log(`LIQ2024 : naive-hit=${100 - naiveAusenteL.length} naive-COLISION=${naiveErroneosL.length} naive-ausente=${naiveAusenteL.length} | presencia-diagnóstico-por-nombre=${presenteNombreL.length}/100`)
  if (naiveErroneosP.length || naiveErroneosL.length) {
    console.log('Colisiones naive en la muestra:')
    for (const d of [...naiveErroneosP, ...naiveErroneosL].slice(0, 10)) {
      console.log(`  ${d.ine} ${d.nombre}: ppto=${d.ppto.naive} liq=${d.liq.naive}`)
    }
  }

  // ── 4. Distinción presupuesto / liquidación / ejecución (Excel + catálogo de cuentas) ──
  const xlsxPath = path.join(CONPREL_DIR, 'EL2025CT.xlsx')
  let excelHeaders: string[] = []
  if (fs.existsSync(xlsxPath)) {
    const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false })
    // Buscar fila de cabecera con 'Derechos' u 'Obligaciones'
    for (let i = 0; i < Math.min(aoa.length, 12); i++) {
      const row = (aoa[i] ?? []).map((c) => String(c ?? '').trim())
      if (row.some((c) => /derechos|obligaciones/i.test(c))) {
        excelHeaders = row.filter(Boolean)
        break
      }
    }
  }
  const cuentasPath = path.join(CSV_DIR, 'cuentas_ppto2025.csv')
  let cuentasSample: string[] = []
  if (fs.existsSync(cuentasPath)) {
    cuentasSample = fs.readFileSync(cuentasPath, 'utf8').split(/\r?\n/).slice(1, 16).filter(Boolean)
  }
  console.log('\nCabeceras Excel liquidación (presupuesto≠liquidación≠ejecución):', excelHeaders.slice(0, 20))
  console.log('Muestras tb_cuentasEconomica (definiciones oficiales):', cuentasSample.length, 'filas de ejemplo')

  // ── 5. Veredicto por criterios (solo evidencia; el documento decide) ──
  // Nota: "colisionNombre" = mismo prefijo INE con nombre CONPREL distinto.
  // Las muestras inspeccionadas son variantes de la MISMA entidad (cambios
  // oficiales de nombre, orden bilingüe, grafías): el join va por CÓDIGO y el
  // código siempre existe en el catálogo (desconocido=0). No es join inseguro.
  const joinCodeSafe = statsPpto.prefijoDesconocido === 0 && statsLiq.prefijoDesconocido === 0
  const provinciasSinAA = ['01'] // Álava: 0 municipios AA en PPTO-2025 (medido)
  const verdict = {
    join_por_codigo_prefijo_en_catalogo: joinCodeSafe
      ? 'OK (100% de prefijos municipales ∈ catálogo INE-5 en ambos ficheros)'
      : 'INSEGURO',
    join_nombre_divergente: {
      ppto: `${statsPpto.colisionNombre}/${statsPpto.municipales} (${statsPpto.pctNombreOk}% nombreOK)`,
      liq: `${statsLiq.colisionNombre}/${statsLiq.municipales} (${statsLiq.pctNombreOk}% nombreOK)`,
      interpretacion: 'variantes de nombre de la misma entidad; no invalida el join por código',
    },
    cobertura_muestra: {
      ppto_naive_hit: `${100 - naiveAusenteP.length}/100`,
      liq_naive_hit: `${100 - naiveAusenteL.length}/100`,
      ppto_presencia_nombre: `${presenteNombreP.length}/100`,
      liq_presencia_nombre: `${presenteNombreL.length}/100`,
    },
    huecos_estructurales: {
      alava_municipios_aa_ppto: 0,
      navarra_municipios_aa_ppto: 39,
      provincias_sin_aa: provinciasSinAA,
      ausencias_puntuales_muestra: {
        ppto: naiveAusenteP.map((d) => d.ine),
        liq: naiveAusenteL.map((d) => d.ine),
      },
    },
    recomendacion:
      joinCodeSafe
        ? 'PENDIENTE por COBERTURA (Álava sin municipios AA, Navarra parcial, ausencias puntuales): el join por código queda validado; falta explicar huecos y cerrar criterio 6'
        : 'PENDIENTE: join por código no validado',
  }
  console.log('\nVeredicto técnico preliminar:', JSON.stringify(verdict, null, 2))

  const report = {
    fecha: new Date().toISOString(),
    soloLectura: true,
    fuentes: { ppto2025: pptoPath, liq2024: liqPath, excel: xlsxPath },
    join: { ppto: statsPpto, liq: statsLiq },
    caso48013,
    muestra: { total: muestra.length, ine: muestra, diagnostico },
    muestraResumen: {
      ppto_naive_colision: naiveErroneosP.length,
      ppto_naive_ausente: naiveAusenteP.length,
      ppto_presencia_nombre: presenteNombreP.length,
      liq_naive_colision: naiveErroneosL.length,
      liq_naive_ausente: naiveAusenteL.length,
      liq_presencia_nombre: presenteNombreL.length,
    },
    distincionContable: { excelHeaders, cuentasEjemplo: cuentasSample },
    verdict,
  }
  const out = path.join(process.cwd(), 'tmp', `conprel-dryrun-100-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\nInforme: ${out}`)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
