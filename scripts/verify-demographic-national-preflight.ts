// Validador FASE 3D: verifica el preflight sin escribir nada.
// 1) Estático: el preflight no contiene llamadas de escritura R2/Supabase.
// 2) Manifiestos tmp/pre-3d-*.json: existen, completos, a escala nacional.
// 3) Suprimido jamás es 0 (muestra detalle); dimensiones sin mezcla.
// 4) Comparabilidad temporal evaluada (catsByPeriod presente).
// 5) Ningún dato nacional dentro de Git; alcance limitado a docs/scripts/lib.
// 6) Informe: cobertura nacional + CCAA, coherencia, tamaños medidos,
//    estrategias y recomendación.
// Uso: npx tsx scripts/verify-demographic-national-preflight.ts
import { execSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const BASE = '8e2be55'
const MANIFESTS = [
  'tmp/pre-3d-nat.json',
  'tmp/pre-3d-pais.json',
  'tmp/pre-3d-arraigo.json',
]
const ALLOWED_PREFIX = ['docs/', 'scripts/preflight-demographic-national.ts', 'scripts/verify-demographic-national-preflight.ts', 'scripts/verify-demographic-dimensions-dry-run.ts', 'src/lib/ine-demographic-dimensions.ts', 'src/lib/socideas-demographic-dimensions.ts']

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

interface ManifestResult {
  dimension: string
  tableId: number
  humanUrl: string
  date: string
  bytes: number
  sha256: string
  header: string[]
  years: string[]
  totalLines: number
  muniRows: number
  catalogN: number
  match: number
  sourceExtra: number
  sinDato: string[]
  suprimidos: number
  incompletas: number
  coherentes: number
  coherentTotal: number
  ceroExtranjero: number
  supMunis: string[]
  incompletasMunis: string[]
  incoherentes: string[]
  distinctCats: string[]
  catsByPeriod: [string, string[]][]
  perMuniSizes: number[]
  detalleSample: { ine: string; rows: { s: string; e: string | null; c: string; p: string; v: number | null; sup: boolean }[] }[]
  resumenJson: string
  complete: boolean
  notes: string[]
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: process.cwd() })
  } catch {
    return ''
  }
}

async function main(): Promise<void> {
  // --- 1. Estático: sin escrituras en el preflight ---
  const src = readFileSync('scripts/preflight-demographic-national.ts', 'utf8')
  const writePatterns = [/\.from\([^)]*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/, /PutObjectCommand/, /\.put\(/, /\.rpc\(/, /migrate/i, /R2_BUCKET/, /createBranch|createProject/]
  const hits = writePatterns.filter((re) => re.test(src))
  check('sin escrituras R2/Supabase en el preflight', hits.length === 0, hits.map((r) => String(r)).join(','))
  check('preflight sin UI/XLSX/endpoint (solo lectura INE)', !/components\/|socideas-xlsx|exportar|FichaToolbar|ActualizacionMenu/.test(src))

  // --- 2. Manifiestos ---
  const manifests: ManifestResult[] = []
  for (const f of MANIFESTS) {
    const ok = existsSync(f)
    check(`manifiesto ${f}`, ok)
    if (!ok) continue
    const m = JSON.parse(readFileSync(f, 'utf8')) as { date: string; catalogN: number; results: ManifestResult[] }
    check(`${f}: escala nacional`, (m.catalogN ?? 0) >= 8000, `${m.catalogN}`)
    for (const r of m.results) {
      check(`${r.dimension}: completo y legible`, r.complete === true && r.match > 0, `match=${r.match}`)
      manifests.push(r)
    }
  }
  if (manifests.length !== 3) {
    console.error('Faltan manifiestos para validar')
    process.exit(1)
  }

  // --- 3. Suprimido jamás es 0; dimensiones sin mezcla ---
  for (const r of manifests) {
    let bad = 0
    let genuine = 0
    for (const s of r.detalleSample) {
      for (const row of s.rows) {
        if (row.sup && row.v !== null) bad += 1
        if (!row.sup && row.v === 0) genuine += 1
      }
    }
    check(`${r.dimension}: suprimido jamás es 0`, bad === 0, `genuinos=${genuine}`)
  }

  // --- 4. Comparabilidad evaluada ---
  for (const r of manifests) {
    check(`${r.dimension}: catsByPeriod evaluado`, r.catsByPeriod.length > 0, r.years.join(','))
  }

  // --- 5. Nada nacional dentro de Git ---
  const status = sh('git status --porcelain')
  const dataFiles = status.split('\n').filter((l) => /\.(csv|json|ndjson|parquet)$/i.test(l) && !l.includes('package'))
  check('sin datos nacionales en Git (status)', dataFiles.length === 0, dataFiles.slice(0, 3).join(' | '))
  const lsFiles = sh('git ls-files tmp/ scripts/*.csv')
  check('tmp/ fuera del índice', lsFiles.trim() === '')
  const checkIgnore = sh('git check-ignore tmp/dry-run-3d.json tmp/pre-3d-nat.json')
  check('tmp/ ignorado', checkIgnore.includes('tmp/'))

  // --- 6. Alcance: solo docs/scripts/lib lector ---
  const diff = sh(`git diff --name-only ${BASE}..HEAD`) + '\n' + status.split('\n').map((l) => l.slice(3)).join('\n')
  const changed = diff.split('\n').map((s) => s.trim()).filter(Boolean)
  const allowed = (f: string): boolean => ALLOWED_PREFIX.some((p) => f === p || (p.endsWith('/') && f.startsWith(p)))
  const badScope = changed.filter((f) => !allowed(f))
  check('alcance limitado (docs/scripts/lib)', badScope.length === 0, badScope.slice(0, 5).join(' | '))

  // --- 7. Catálogo + informe ---
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const ccaaByIne = new Map<string, string>()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, provincia:provincias(comunidad_autonoma:comunidades_autonomas(nombre))')
      .order('codigo_ine')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as { codigo_ine: string; provincia: { comunidad_autonoma: { nombre: string } } }[]
    for (const r of rows) ccaaByIne.set(r.codigo_ine.trim(), r.provincia.comunidad_autonoma.nombre)
    if (rows.length < PAGE) break
    from += PAGE
  }
  const pct = (a: number, b: number): string => (b > 0 ? `${((a / b) * 100).toFixed(1)} %` : '—')
  console.log('\n| Dimensión | Municipios catálogo | Municipios con match | Cobertura % | Sin match | Sin dato | Suprimidos | Categorías completas | Último año | Años comparables |')
  for (const r of manifests) {
    const lastYear = [...r.years].sort().pop() ?? '—'
    console.log(`| ${r.dimension} | ${r.catalogN} | ${r.match} | ${pct(r.match, r.catalogN)} | ${r.catalogN - r.match} | ${r.sinDato.length} | ${r.suprimidos} | ${r.match - r.incompletas} | ${lastYear} | ${r.years.join(',')} |`)
  }
  console.log('\n| CCAA | Municipios catálogo | Nacionalidad | Nacimiento | Arraigo | Sin match | Supresión | Observación |')
  const ccaas = [...new Set(ccaaByIne.values())].sort()
  const byDim = new Map(manifests.map((r) => [r.dimension, r]))
  for (const ccaa of ccaas) {
    const munis = [...ccaaByIne.entries()].filter(([, c]) => c === ccaa).map(([ine]) => ine)
    const okFor = (dim: string): number => {
      const r = byDim.get(dim)
      if (!r) return 0
      const bad = new Set([...r.supMunis, ...r.incompletasMunis, ...r.sinDato, ...r.incoherentes])
      return munis.filter((ine) => !bad.has(ine)).length
    }
    const cells = ['nationality', 'birth_country', 'birth_residence_relation'].map((d) => `${okFor(d)}/${munis.length}`)
    const anySup = ['nationality', 'birth_country', 'birth_residence_relation'].map((d) => byDim.get(d))
      .some((r) => r && munis.some((ine) => r.supMunis.includes(ine)))
    console.log(`| ${ccaa} | ${munis.length} | ${cells[0]} | ${cells[1]} | ${cells[2]} | 0 | ${anySup ? 'sí' : 'no'} | — |`)
  }

  // --- 8. Tamaños medidos ---
  const stats = (xs: number[]): { n: number; mean: number; p50: number; p95: number; max: number; sum: number } => {
    const s = [...xs].sort((a, b) => a - b)
    const sum = s.reduce((a, b) => a + b, 0)
    const at = (p: number): number => (s.length > 0 ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0)
    return { n: s.length, mean: s.length > 0 ? sum / s.length : 0, p50: at(0.5), p95: at(0.95), max: s.length > 0 ? s[s.length - 1] : 0, sum }
  }
  console.log('\n| Estrategia | Datos | Tamaño nacional | Tamaño p95 municipal | Impacto de lectura | Decisión |')
  for (const r of manifests) {
    const st = stats(r.perMuniSizes)
    const gz = gzipSync(r.resumenJson).length
    console.log(`| Resumen ${r.dimension} | ${st.n} resúmenes | ${(st.sum / 1048576).toFixed(2)} MB (gzip ${(gz / 1048576).toFixed(2)} MB) | p95 ${st.p95} B | +1 JSON/muni en R2 | por decidir abajo |`)
    console.log(`  media ${Math.round(st.mean)} B · p50 ${st.p50} B · p95 ${st.p95} B · max ${st.max} B · >25KB:${r.perMuniSizes.filter((x) => x > 25 * 1024).length} · >50KB:${r.perMuniSizes.filter((x) => x > 50 * 1024).length} · >100KB:${r.perMuniSizes.filter((x) => x > 100 * 1024).length}`)
  }
  // Detalle medido en muestra + extrapolación etiquetada.
  const detBytes: number[] = []
  for (const r of manifests) {
    for (const s of r.detalleSample) {
      detBytes.push(JSON.stringify({ ine: s.ine, rows: s.rows }).length)
    }
  }
  const dst = stats(detBytes)
  const catalogN = manifests[0]?.catalogN ?? 8130
  console.log(`| Detalle (muestra ${detBytes.length}) | sexo/edad/país/series | media ${Math.round(dst.mean)} B · p95 ${dst.p95} B · max ${dst.max} B | extrapolado ~${(dst.mean * catalogN / 1048576).toFixed(1)} MB nacional (ESTIMADO) | payload pesado | solo si se justifica |`)
  console.log(`| Híbrido | resumen batch + detalle bajo demanda | batch = resumen; 0 ahora | latencia/API | — | alternativa |`)

  // --- 9. Recomendación por reglas explícitas ---
  for (const r of manifests) {
    const fullMatch = r.match === r.catalogN
    const coherent = r.coherentTotal > 0 && r.coherentes === r.coherentTotal
    let rec = 'no integrar'
    if (r.dimension === 'nationality' && fullMatch && coherent) rec = 'integrar (resumen)'
    else if (r.dimension === 'birth_residence_relation' && fullMatch && coherent) rec = 'integrar (resumen)'
    else if (r.dimension === 'birth_country' && fullMatch) rec = 'integrar con límites (sin serie homogénea de países)'
    console.log(`Recomendación ${r.dimension}: ${rec}`)
  }
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nPreflight nacional verificado: lectura, cobertura, coherencia y tamaños OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
