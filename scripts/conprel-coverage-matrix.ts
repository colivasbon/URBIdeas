/**
 * MATRIZ DE COBERTURA CONPREL — solo lectura (misión de investigación).
 *
 * Cruza el catálogo SOCideas (8.132 INE-5 con provincia/CCAA) frente a los
 * inventarios `tb_inventario` extraídos de cuatro ficheros Access definitivos/
 * avance (CONPREL). Municipal = tipo `AA` (+ `ZZ` para Ceuta/Melilla).
 *
 * Entradas (CSV ya extraídos con ACE OLEDB):
 *   %TEMP%/opencode/conprel/csv/inv_ppto2025.csv     (definitivo)
 *   %TEMP%/opencode/conprel/csv/inv_ppto2026av.csv   (avance)
 *   %TEMP%/opencode/conprel/csv/inv_liq2024.csv      (definitivo)
 *   %TEMP%/opencode/conprel/csv/inv_liq2025av.csv    (avance)
 *   columnas: codente|estado|nombreente|poblacion|nsec
 *
 * Salidas:
 *   tmp/conprel-coverage/<fichero>-presentes.csv
 *   tmp/conprel-coverage/<fichero>-ausencias.csv
 *   tmp/conprel-coverage/matrix-report-<ts>.json
 *   resumen por consola (nacional, CCAA, provincia, dossier, estabilidad)
 *
 * Uso: npx tsx scripts/conprel-coverage-matrix.ts
 * NO escribe R2/Supabase ni publica nada.
 */
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const CSV_DIR = path.join(process.env.TEMP ?? '.', 'opencode', 'conprel', 'csv')
const OUT_DIR = path.join(process.cwd(), 'tmp', 'conprel-coverage')

interface InvRow {
  codente: string
  prefix: string
  tipo: string
  estado: string
  nombre: string
}
interface CatalogRow {
  ine: string
  nombre: string
  provincia: string
  provCode: string
  ccaa: string
}
type FileKey = 'ppto2025' | 'ppto2026av' | 'liq2024' | 'liq2025av'
const FILES: Array<{ key: FileKey; label: string; fase: string; file: string }> = [
  { key: 'ppto2025', label: 'Presupuestos 2025', fase: 'definitivo', file: 'inv_ppto2025.csv' },
  { key: 'ppto2026av', label: 'Presupuestos 2026', fase: 'avance', file: 'inv_ppto2026av.csv' },
  { key: 'liq2024', label: 'Liquidaciones 2024', fase: 'definitivo', file: 'inv_liq2024.csv' },
  { key: 'liq2025av', label: 'Liquidaciones 2025', fase: 'avance', file: 'inv_liq2025av.csv' },
]

function loadInventory(csvPath: string): InvRow[] {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const out: InvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const [codente, estado, nombre] = lines[i].split('|')
    if (!codente || codente.length < 5) continue
    out.push({
      codente,
      prefix: codente.slice(0, 5),
      tipo: codente.slice(5, 7),
      estado: estado ?? '',
      nombre: (nombre ?? '').trim(),
    })
  }
  return out
}

/** Municipal: tipo AA o ZZ (Ceuta/Melilla). El resto = otras entidades. */
const isMunicipal = (r: InvRow): boolean => r.tipo === 'AA' || r.tipo === 'ZZ'

function normName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function main(): Promise<void> {
  console.log('=== MATRIZ DE COBERTURA CONPREL (solo lectura) ===')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Catálogo SOCideas con provincia/CCAA
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Faltan claves Supabase'); process.exit(1) }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const catalog: CatalogRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias!inner(nombre, codigo_ine, comunidad_autonoma:comunidades_autonomas!inner(nombre))')
      .order('codigo_ine')
      .range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as unknown as Array<{
      codigo_ine: string; nombre: string
      provincia: { nombre: string; codigo_ine: string; comunidad_autonoma: { nombre: string } }
    }>) {
      catalog.push({
        ine: r.codigo_ine.trim(),
        nombre: r.nombre,
        provincia: r.provincia.nombre,
        provCode: r.provincia.codigo_ine,
        ccaa: r.provincia.comunidad_autonoma.nombre,
      })
    }
    if (((data ?? []).length) < 1000) break
  }
  const catByIne = new Map(catalog.map((c) => [c.ine, c]))
  console.log(`Catálogo: ${catalog.length} municipios · ${new Set(catalog.map((c) => c.ccaa)).size} CCAA · ${new Set(catalog.map((c) => c.provCode)).size} provincias`)

  // Carga de inventarios
  const inv = new Map<FileKey, InvRow[]>()
  const tipos = new Map<FileKey, Map<string, number>>()
  for (const f of FILES) {
    const p = path.join(CSV_DIR, f.file)
    if (!fs.existsSync(p)) { console.error(`Falta ${p}`); process.exit(1) }
    const rows = loadInventory(p)
    inv.set(f.key, rows)
    const t = new Map<string, number>()
    for (const r of rows) t.set(r.tipo, (t.get(r.tipo) ?? 0) + 1)
    tipos.set(f.key, t)
    console.log(`${f.label} (${f.fase}): ${rows.length} filas · municipales(AA+ZZ)=${rows.filter(isMunicipal).length}`)
  }

  // ── Matriz cobertura por fichero ──
  const matriz: Record<FileKey, {
    presentes: number
    ausentes: number
    pct: number
    porCcaa: Array<{ ccaa: string; total: number; presentes: number; pct: number }>
    porProvincia: Array<{ provCode: string; provincia: string; ccaa: string; total: number; presentes: number; pct: number }>
    ausencias: Array<CatalogRow & { presentesOtroFichero?: boolean }>
  }> = {} as never

  const coverageByFile = new Map<FileKey, Set<string>>()
  for (const f of FILES) {
    const rows = inv.get(f.key)!
    const munByPrefix = new Map<string, InvRow>()
    for (const r of rows) if (isMunicipal(r)) { if (!munByPrefix.has(r.prefix)) munByPrefix.set(r.prefix, r) }
    coverageByFile.set(f.key, new Set(munByPrefix.keys()))

    const presentes: Array<CatalogRow & { conprel_codente: string; conprel_nombre: string }> = []
    const ausencias: CatalogRow[] = []
    for (const c of catalog) {
      const hit = munByPrefix.get(c.ine)
      if (hit) presentes.push({ ...c, conprel_codente: hit.codente, conprel_nombre: hit.nombre })
      else ausencias.push(c)
    }
    // CSVs
    const pc = path.join(OUT_DIR, `${f.key}-presentes.csv`)
    const ac = path.join(OUT_DIR, `${f.key}-ausencias.csv`)
    fs.writeFileSync(pc, ['codigo_ine|nombre|provincia|ccaa|conprel_codente|conprel_nombre',
      ...presentes.map((x) => `${x.ine}|${x.nombre}|${x.provincia}|${x.ccaa}|${x.conprel_codente}|${x.conprel_nombre}`)].join('\n'))
    fs.writeFileSync(ac, ['codigo_ine|nombre|provincia|ccaa',
      ...ausencias.map((x) => `${x.ine}|${x.nombre}|${x.provincia}|${x.ccaa}`)].join('\n'))

    // Agregados CCAA / provincia
    const ccaaAgg = new Map<string, { total: number; presentes: number }>()
    const provAgg = new Map<string, { provincia: string; ccaa: string; total: number; presentes: number }>()
    for (const c of catalog) {
      const a = ccaaAgg.get(c.ccaa) ?? { total: 0, presentes: 0 }
      a.total++
      if (coverageByFile.get(f.key)!.has(c.ine)) a.presentes++
      ccaaAgg.set(c.ccaa, a)
      const k = c.provCode
      const p = provAgg.get(k) ?? { provincia: c.provincia, ccaa: c.ccaa, total: 0, presentes: 0 }
      p.total++
      if (coverageByFile.get(f.key)!.has(c.ine)) p.presentes++
      provAgg.set(k, p)
    }
    const pct = Math.round((presentes.length / catalog.length) * 1000) / 10
    matriz[f.key] = {
      presentes: presentes.length,
      ausentes: ausencias.length,
      pct,
      porCcaa: [...ccaaAgg.entries()]
        .map(([ccaa, v]) => ({ ccaa, total: v.total, presentes: v.presentes, pct: Math.round((v.presentes / v.total) * 1000) / 10 }))
        .sort((a, b) => a.pct - b.pct || a.ccaa.localeCompare(b.ccaa)),
      porProvincia: [...provAgg.entries()]
        .map(([provCode, v]) => ({ provCode, ...v, pct: Math.round((v.presentes / v.total) * 1000) / 10 }))
        .sort((a, b) => a.provCode.localeCompare(b.provCode)),
      ausencias,
    }
    console.log(`\n[${f.label} ${f.fase}] cobertura ${presentes.length}/${catalog.length} = ${pct}% (denominador: catálogo SOCideas ${catalog.length})`)
    for (const c of matriz[f.key].porCcaa) {
      if (c.presentes < c.total) console.log(`  CCAA ${c.ccaa}: ${c.presentes}/${c.total} (${c.pct}%)`)
    }
  }

  // ── Dossier de ausencias ──
  console.log('\n=== DOSSIER DE AUSENCIAS ===')

  // Álava: todas las filas de provincia 01 por tipo, por fichero
  const alava: Record<string, unknown> = {}
  for (const f of FILES) {
    const rows = inv.get(f.key)!.filter((r) => r.prefix.slice(0, 2) === '01')
    const byTipo = new Map<string, number>()
    for (const r of rows) byTipo.set(r.tipo, (byTipo.get(r.tipo) ?? 0) + 1)
    alava[f.key] = {
      totalFilas: rows.length,
      municipales: rows.filter(isMunicipal).length,
      porTipo: Object.fromEntries(byTipo),
      filas: rows.map((r) => `${r.codente}=${r.nombre.trim()}(tipo ${r.tipo})`).slice(0, 20),
    }
    console.log(`Álava [${f.key}]: filas=${rows.length} municipales=${rows.filter(isMunicipal).length} tipos=${JSON.stringify(Object.fromEntries(byTipo))}`)
  }
  // Diagnóstico por nombre (SOLO diagnóstico, no criterio de join)
  const alavaNombre = FILES.map((f) => {
    const hits = inv.get(f.key)!.filter((r) => /gasteiz|vitoria|araba|álava|alava/i.test(r.nombre))
    return { file: f.key, hits: hits.map((h) => `${h.codente}=${h.nombre.trim()}`).slice(0, 10) }
  })
  console.log('Álava nombre-diagnóstico:', JSON.stringify(alavaNombre))

  // Navarra: presentes (31*) vs ausentes
  const navarraCat = catalog.filter((c) => c.provCode === '31')
  const navPresentes = inv.get('ppto2025')!.filter((r) => isMunicipal(r) && r.prefix.slice(0, 2) === '31')
  const navPresentesSet = new Set(navPresentes.map((r) => r.prefix))
  const navAusentes = navarraCat.filter((c) => !navPresentesSet.has(c.ine))
  fs.writeFileSync(path.join(OUT_DIR, 'navarra-presentes-ppto2025.csv'),
    ['codigo_ine|conprel_codente|conprel_nombre', ...navPresentes.map((r) => `${r.prefix}|${r.codente}|${r.nombre.trim()}`)].join('\n'))
  fs.writeFileSync(path.join(OUT_DIR, 'navarra-ausentes-ppto2025.csv'),
    ['codigo_ine|nombre', ...navAusentes.map((c) => `${c.ine}|${c.nombre}`)].join('\n'))
  const navEstabilidad = FILES.map((f) => ({
    file: f.key,
    municipales31: inv.get(f.key)!.filter((r) => isMunicipal(r) && r.prefix.slice(0, 2) === '31').length,
  }))
  console.log(`Navarra: catálogo=${navarraCat.length} presentes(ppto2025)=${navPresentes.length} ausentes=${navAusentes.length}`)
  console.log('Navarra presentes (39):', navPresentes.map((r) => r.prefix).sort().join(','))
  console.log('Navarra estabilidad:', JSON.stringify(navEstabilidad))
  console.log('Navarra ausentes (muestra 15):', navAusentes.slice(0, 15).map((c) => `${c.ine} ${c.nombre}`).join(' · '))

  // Vitoria01059 / Getxo48044 / specials: presencia por fichero
  const probe = (ine: string) => FILES.map((f) => {
    const hit = inv.get(f.key)!.find((r) => isMunicipal(r) && r.prefix === ine)
    const byName = inv.get(f.key)!.filter((r) => isMunicipal(r) && normName(r.nombre).includes(normName(ine === '01059' ? 'gasteiz' : ine === '48044' ? 'getxo' : '\u0000')))
    return {
      file: f.key,
      porCodigo: hit ? hit.codente : null,
      porNombre_diagnostico: (['01059', '48044'].includes(ine) ? byName.map((r) => r.codente) : []),
    }
  })
  // Búsqueda amplia de nombres para Vitoria/Getxo (solo diagnóstico)
  const nameSearch = (pat: RegExp) => FILES.map((f) => ({
    file: f.key,
    hits: inv.get(f.key)!.filter((r) => pat.test(r.nombre)).map((r) => `${r.codente}=${r.nombre.trim()}`).slice(0, 6),
  }))
  const vitia = { codigo: probe('01059'), porNombre: nameSearch(/gasteiz|vitoria/i) }
  const getxo = { codigo: probe('48044'), porNombre: nameSearch(/getxo|gexto/i) }
  console.log('Vitoria 01059 por código:', JSON.stringify(vitia.codigo))
  console.log('Vitoria nombre-diagnóstico:', JSON.stringify(vitia.porNombre))
  console.log('Getxo 48044 por código:', JSON.stringify(getxo.codigo))
  console.log('Getxo nombre-diagnóstico:', JSON.stringify(getxo.porNombre))

  const specials: Record<string, unknown> = {}
  for (const ine of ['01018', '31169', '06161', '19191']) {
    const meta = catByIne.get(ine)
    specials[ine] = {
      nombre: meta?.nombre, provincia: meta?.provincia, ccaa: meta?.ccaa,
      presencia: FILES.map((f) => {
        const hit = inv.get(f.key)!.find((r) => isMunicipal(r) && r.prefix === ine)
        return { file: f.key, porCodigo: hit ? hit.codente : null }
      }),
    }
    console.log(`Special ${ine} (${meta?.nombre}, ${meta?.provincia}):`, JSON.stringify((specials[ine] as { presencia: unknown }).presencia))
  }

  // ── Estabilidad entre ejercicios ──
  console.log('\n=== ESTABILIDAD (definitivo vs avance) ===')
  const est = {
    ppto: {
      def: { key: 'ppto2025', cobertura: matriz.ppto2025.presentes, pct: matriz.ppto2025.pct },
      avance: { key: 'ppto2026av', cobertura: matriz.ppto2026av.presentes, pct: matriz.ppto2026av.pct },
      deltaCobertura: matriz.ppto2026av.presentes - matriz.ppto2025.presentes,
      ausentesEnAmbos: [...coverageByFile.get('ppto2025')!].length,
    },
    liq: {
      def: { key: 'liq2024', cobertura: matriz.liq2024.presentes, pct: matriz.liq2024.pct },
      avance: { key: 'liq2025av', cobertura: matriz.liq2025av.presentes, pct: matriz.liq2025av.pct },
      deltaCobertura: matriz.liq2025av.presentes - matriz.liq2024.presentes,
    },
  }
  // Álava/Navarra/Vitoria/Getxo en los 4 ficheros (ya calculados) + ausencias persistentes
  const persistentes = catalog.filter((c) => FILES.every((f) => !coverageByFile.get(f.key)!.has(c.ine)))
  const soloDefPpto = catalog.filter((c) => coverageByFile.get('ppto2025')!.has(c.ine) && !coverageByFile.get('ppto2026av')!.has(c.ine))
  const soloAvancePpto = catalog.filter((c) => !coverageByFile.get('ppto2025')!.has(c.ine) && coverageByFile.get('ppto2026av')!.has(c.ine))
  console.log(`PPTO def ${matriz.ppto2025.presentes} (${matriz.ppto2025.pct}%) vs avance ${matriz.ppto2026av.presentes} (${matriz.ppto2026av.pct}%) delta=${est.ppto.deltaCobertura}`)
  console.log(`LIQ  def ${matriz.liq2024.presentes} (${matriz.liq2024.pct}%) vs avance ${matriz.liq2025av.presentes} (${matriz.liq2025av.pct}%) delta=${est.liq.deltaCobertura}`)
  console.log(`Ausentes en LOS CUATRO ficheros: ${persistentes.length} (permanent candidates)`)
  console.log(`PPTO: solo en definitivo (no en avance aún): ${soloDefPpto.length} · solo en avance: ${soloAvancePpto.length}`)
  fs.writeFileSync(path.join(OUT_DIR, 'ausentes-los-4-ficheros.csv'),
    ['codigo_ine|nombre|provincia|ccaa', ...persistentes.map((c) => `${c.ine}|${c.nombre}|${c.provincia}|${c.ccaa}`)].join('\n'))
  // Distribución de tipos por fichero (distinción de entidades)
  const tipoResumen: Record<string, Record<string, number>> = {}
  for (const f of FILES) tipoResumen[f.key] = Object.fromEntries([...tipos.get(f.key)!].sort())

  const report = {
    fecha: new Date().toISOString(),
    soloLectura: true,
    denominador: { municipios: catalog.length, nota: 'catálogo SOCideas (incluye Ceuta 51001 y Melilla 52001)' },
    ficheros: FILES,
    matriz,
    tiposPorFichero: tipoResumen,
    dossier: { alava, alavaNombreDiagnostico: alavaNombre, navarra: {
      catalogo: navarraCat.length, presentes: navPresentes.length, ausentes: navAusentes.length,
      presentesIne: navPresentes.map((r) => r.prefix).sort(), estabilidad: navEstabilidad,
    }, vitia, getxo, specials },
    estabilidad: {
      ...est,
      ausentesLosCuatro: persistentes.length,
      pptoSoloDef: soloDefPpto.length,
      pptoSoloAvance: soloAvancePpto.length,
    },
    limitaciones: [
      'Campo poblacion del catálogo con desalineaciones observadas (Vitoria=25, Pamplona=102, Abengibre=80289): no apto para segmentar sin saneamiento.',
      'Nombre usado SOLO como diagnóstico de ausencias, nunca como criterio de join.',
      'Avances (2026 ppto / 2025 liq) tienen menos entidades que los definitivos por remisión progresiva.',
    ],
  }
  const out = path.join(OUT_DIR, `matrix-report-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\nCSVs y informe en ${OUT_DIR}`)
  console.log(`Informe: ${out}`)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
