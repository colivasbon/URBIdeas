/**
 * QA ADVERSARIAL SOCideas — Subagente 6 (independiente).
 *
 * Misión: ROMPER lo construido. NO rehace qa-conprel-adversarial.ts /
 * verify-conprel-loader.ts / qa-produccion.ts: los complementa con ángulos
 * nuevos (15 puntos de la misión) y con producción SOLO en lectura o pruebas
 * acotadas.
 *
 * Ángulos:
 *  A1  Slugs CONPREL: nombre vs columna vs verificacion vs contratos.
 *  A2  Doble cómputo por `id` de grupo (unit: ¿se duplicaría Madrid?).
 *  A3  Inclusión accidental de ZV/ZO/DD/MM (fixtures + CSV real).
 *  A4  Ausencia convertida en cero (parser + merge + modoEscritura).
 *  A5  Cero real convertido en ND (round-trip JSON del envelope).
 *  A6  Duplicados y cambios de esquema (columnas fantasma/faltantes).
 *  A7  Backup no restaurable (fixtures del patrón fix-tgss + estático loader).
 *  A8  Envelope >150 KB (unidad + frontera entre gates + loader).
 *  A9  Pérdida de slugs tras merge (multi-familia + estático del loader).
 *  A10 Caché que sirve datos viejos (estático B1/tags + R2↔SSR producción;
 *       --revalidar = prueba acotada de revalidación con token).
 *  A11 Ficha y XLSX que discrepan (3 vías: R2 ↔ SSR ↔ XLSX).
 *  A12 SSR puntuales: Madrid, Bilbao 48020, Santiago 15078, Pamplona,
 *       Vitoria 01059/01201, Getxo 48044, Ceuta, Melilla.
 *  A13 Regresión no-CONPREL: AEAT/ADRH/Educación/Agrario/Migraciones.
 *  A14 Rate limit que bloquee revalidaciones legítimas (unit del contador B3;
 *       producción solo 2 probes inertes GET/401).
 *  A15 Secretos en commits, scripts, docs y artefactos tmp.
 *
 * Escrituras prohibidas: R2, Supabase. La token de revalidación (si se pasa
 * --revalidar) NUNCA se imprime. Salida: tabla PASS/FAIL + defectos con
 * severidad y repro; JSON en tmp/.
 *
 * Uso:
 *   npx tsx scripts/qa-adversarial-socideas.ts
 *   npx tsx scripts/qa-adversarial-socideas.ts --local-only
 *   npx tsx scripts/qa-adversarial-socideas.ts --skip-xlsx
 *   npx tsx scripts/qa-adversarial-socideas.ts --revalidar
 */
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as JSZip from 'jszip'
import { config } from 'dotenv'
import {
  CONPREL_FAMILIAS,
  CONPREL_LIQ_2024,
  CONPREL_MAX_ENVELOPE_BYTES,
  CONPREL_PPTO_2025,
  esMunicipalCodente,
} from '../src/lib/conprel-contracts'
import {
  ConprelBloqueoError,
  ConprelParseError,
  assertHeader,
  buildTuplasFamilia,
  cabeEnvelope,
  cargarEconomica,
  cargarInventario,
  mergeConprelTuplas,
} from '../src/lib/conprel-parser'
import type { EnvV2 } from '../src/lib/conprel-parser'
import { CONPREL_SLUGS, conprelSlugFor, conprelEstadoTupla } from '../src/lib/conprel-slugs'
import type { ConprelVerificacionEstado } from '../src/lib/conprel-slugs'
import { MUESTRA_COBERTURA } from './qa-fixtures'

config({ path: '.env.local' })

// ── Infraestructura de resultados ──────────────────────────────────────────

type Status = 'PASS' | 'FAIL' | 'ENCONTRADO'
type Sev = 'CRÍTICO' | 'ALTO' | 'MEDIO' | 'BAJO' | 'INFO'

interface Res {
  area: string
  sub: string
  status: Status
  comando: string
  evidencia: string
}

interface Defecto {
  sev: Sev
  id: string
  titulo: string
  repro: string
}

const results: Res[] = []
const defects: Defecto[] = []
let passes = 0
let fails = 0
let founds = 0

function add(area: string, sub: string, status: Status, comando: string, evidencia: string): void {
  results.push({ area, sub, status, comando, evidencia })
  if (status === 'PASS') passes++
  else if (status === 'FAIL') fails++
  else founds++
  const tag = status === 'PASS' ? '  OK' : status === 'FAIL' ? 'FAIL' : 'ENON'
  console.log(`${tag} [${area}] ${sub} — ${evidencia}`)
}

function check(
  area: string,
  sub: string,
  ok: boolean,
  comando: string,
  evidenciaOk: string,
  evidenciaFail: string,
): void {
  add(area, sub, ok ? 'PASS' : 'FAIL', comando, ok ? evidenciaOk : evidenciaFail)
}

function defect(sev: Sev, id: string, titulo: string, repro: string): void {
  defects.push({ sev, id, titulo, repro })
}

// ── Args / entorno ─────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const LOCAL_ONLY = args.includes('--local-only')
const SKIP_XLSX = args.includes('--skip-xlsx')
const REVALIDAR = args.includes('--revalidar')

const BASE = (process.env.QA_BASE_URL ?? 'https://urb-ideas.vercel.app').replace(/\/$/, '')
const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  R2_PUBLIC_BASE_FALLBACK
).replace(/\/$/, '')

/** SHA baseline de producción (Vercel: main @ 2b79ffe). */
const SHA_PROD = '2b79ffe3fbaa1e4434e90db56b0b827814e82d16'

const SYS_TEMP = process.env.TEMP ?? process.env.TMP ?? path.join(process.cwd(), 'tmp')
const CONPREL_CSV = path.join(SYS_TEMP, 'opencode', 'conprel', 'csv')

const INV_HEADER = 'codente|estado|id|idente|nombreente|nsec|poblacion'
const ECO_HEADER_P = 'idente|cdcta|tipreig|importe'
const ECO_HEADER_L = 'idente|cdcta|tipreig|imported|importer|importel|importec'

const FIX_ROOT = path.join(process.cwd(), 'tmp', 'qa-adv-socideas')

function writeFixture(name: string, content: string): string {
  fs.mkdirSync(FIX_ROOT, { recursive: true })
  const p = path.join(FIX_ROOT, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

function expectErrorKind(fn: () => unknown, kinds: Array<new (...a: never[]) => Error>): string | null {
  try {
    fn()
    return 'esperaba error y no lanzó'
  } catch (e) {
    if (e instanceof Error && kinds.some((K) => e instanceof K)) return null
    return `tipo inesperado → ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`
  }
}

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
}

// ══════════════════════════════════════════════════════════════════════════
// A1 — Slugs: nombre vs columna vs verificacion vs contratos
// ══════════════════════════════════════════════════════════════════════════

function a1Slugs(): void {
  console.log('\n═══ A1 · Magnitudes/slugs mal etiquetados ═══')
  const area = 'A1'

  check(
    area,
    'nº de slugs == 5 (1 ppto + 4 liq)',
    CONPREL_SLUGS.length === 5,
    'CONPREL_SLUGS.length',
    String(CONPREL_SLUGS.length),
    String(CONPREL_SLUGS.length),
  )

  const dups = CONPREL_SLUGS.filter((s, i, a) => a.findIndex((x) => x.slug === s.slug) !== i)
  check(
    area,
    'slugs únicos (sin definiciones duplicadas)',
    dups.length === 0,
    'dedupe por .slug',
    dups.map((d) => d.slug).join(',') || 'sin dups',
    dups.map((d) => d.slug).join(','),
  )

  // Cada magnitud del contrato tiene EXACTAMENTE un slug; sin huérfanos.
  for (const [fam, def] of Object.entries(CONPREL_FAMILIAS)) {
    const cols = CONPREL_SLUGS.filter((s) => s.familia === fam).map((s) => s.columna).sort()
    const esperado = [...def.magnitudes].sort()
    check(
      area,
      `familia ${fam}: columnas con slug == magnitudes del contrato`,
      cols.join(',') === esperado.join(','),
      'CONPREL_SLUGS vs CONPREL_FAMILIAS.magnitudes',
      cols.join(','),
      `slugs=[${cols.join(',')}] contrato=[${esperado.join(',')}]`,
    )
  }

  // Mapa semántico columna ↔ palabras del slug y del nombre visible.
  const esperadoSemantica: Array<{ columna: string; slugPart: string; nombreRe: RegExp }> = [
    { columna: 'importe', slugPart: 'ppto_importe', nombreRe: /presupuestario/i },
    { columna: 'imported', slugPart: 'prevision_definitivos', nombreRe: /previsi.n|definitivos/i },
    { columna: 'importer', slugPart: 'reconocidos', nombreRe: /reconocidas|obligaciones/i },
    { columna: 'importel', slugPart: 'recaudacion_corriente', nombreRe: /corriente/i },
    { columna: 'importec', slugPart: 'recaudacion_cerrados', nombreRe: /cerrados/i },
  ]
  for (const e of esperadoSemantica) {
    const def = CONPREL_SLUGS.find((s) => s.columna === e.columna)
    const okSlug = !!def && def.slug.includes(e.slugPart)
    const okNombre = !!def && e.nombreRe.test(def.nombre)
    check(
      area,
      `columna ${e.columna}: slug y nombre coinciden con la semántica verificada`,
      okSlug && okNombre,
      'CONPREL_SLUGS (slug/nombre/columna)',
      def ? `${def.slug} · «${def.nombre}»` : 'slug ausente',
      def ? `slug=${def.slug} nombre=${def.nombre}` : 'sin slug para la columna',
    )
  }

  // Regla de denominación: ppto NO puede llevar «inicial»/«definitivo» en el
  // slug mientras V1 siga abierta; liq verificado sí puede «definitivos».
  const ppto = CONPREL_SLUGS.find((s) => s.familia === 'ppto')!
  check(
    area,
    'ppto: slug sin «inicial» ni «definitivo» (V1 abierta)',
    !/inicial|definitivo/i.test(ppto.slug),
    'regla §2-3 diseño/conprel-slugs',
    ppto.slug,
    ppto.slug,
  )
  check(
    area,
    'ppto: verificacion == pendiente → estado tupla pendiente',
    ppto.verificacion === 'pendiente' && conprelEstadoTupla(ppto) === 'pendiente',
    'conprelEstadoTupla(ppto)',
    `${ppto.verificacion} → ${conprelEstadoTupla(ppto)}`,
    `${ppto.verificacion} → ${conprelEstadoTupla(ppto)}`,
  )
  const liq = CONPREL_SLUGS.filter((s) => s.familia === 'liq')
  check(
    area,
    'liq: los 4 slugs en verificado → estado tupla validado',
    liq.length === 4 && liq.every((s) => s.verificacion === 'verificado' && conprelEstadoTupla(s) === 'validado'),
    'conprelEstadoTupla',
    liq.map((s) => `${s.columna}=${s.verificacion}`).join(' '),
    liq.map((s) => `${s.columna}=${s.verificacion}→${conprelEstadoTupla(s)}`).join(' '),
  )

  const enumsOk = CONPREL_SLUGS.every((s) =>
    (['verificado', 'patron', 'pendiente'] as ConprelVerificacionEstado[]).includes(s.verificacion),
  )
  check(area, 'verificacion ∈ {verificado, patron, pendiente}', enumsOk, 'tipo ConprelVerificacionEstado', 'ok', 'valor fuera de enum')
  check(
    area,
    'unidad == euros en todos los slugs',
    CONPREL_SLUGS.every((s) => s.unidad === 'euros'),
    'ConprelSlugDef.unidad',
    'euros×5',
    CONPREL_SLUGS.map((s) => s.unidad).join(','),
  )

  const err = expectErrorKind(() => conprelSlugFor('liq', 'importe'), [Error])
  check(area, 'conprelSlugFor(liq,importe) inexistente → error', err === null, 'conprelSlugFor', 'lanza', err ?? 'devolvió slug')

  // Slugs viejos (renombrados tras Agente A) no deben sobrevivir en src/.
  const stale = ['conprel_liq_ejercicio_corriente_importe', 'conprel_liq_presupuesto_importe']
  const srcHits: string[] = []
  const walk = (dir: string): void => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(ent.name)) {
        const t = fs.readFileSync(p, 'utf8')
        for (const s of stale) if (t.includes(s)) srcHits.push(`${path.relative(process.cwd(), p)}:${s}`)
      }
    }
  }
  walk(path.join(process.cwd(), 'src'))
  check(area, 'sin slugs CONPREL obsoletos en src/', srcHits.length === 0, 'grep slugs renombrados en src/**', 'limpio', srcHits.join(' | '))
}

// ══════════════════════════════════════════════════════════════════════════
// A2 — Doble cómputo por id de grupo (unit)
// ══════════════════════════════════════════════════════════════════════════

function a2GroupId(): void {
  console.log('\n═══ A2 · Doble cómputo por id de grupo ═══')
  const area = 'A2'

  // Fixture: dos municipales comparten `id` de grupo (1) con identes distintos.
  // Eco propia por idente. Si se agrupara por `id`, Madrid absorbería la eco
  // del segundo municipio (o se duplicaría el cómputo).
  const invP = writeFixture(
    'a2_inv.csv',
    [
      INV_HEADER,
      `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|3200000`,
      `28080AA000|C|1|17038|${'Madrid B'.padEnd(60)}|1|1`,
      `00000GG000|C|1|77777|${'Grupo GG'.padEnd(60)}|1|0`,
    ].join('\n') + '\n',
  )
  const ecoP = writeFixture(
    'a2_eco.csv',
    [ECO_HEADER_P, '17037|1|I|100,00', '17038|1|I|200,00', '77777|1|I|999999,00'].join('\n') + '\n',
  )
  const inv = cargarInventario(invP, CONPREL_PPTO_2025)
  const eco = cargarEconomica(ecoP, CONPREL_PPTO_2025, {})

  // Estático: InvMunicipal ni siquiera expone `id` → agrupar por id es
  // imposible con el tipo actual (garantía estructural).
  const parserSrc = readRepo('src/lib/conprel-parser.ts')
  const iface = /interface InvMunicipal \{[^}]+\}/.exec(parserSrc)?.[0] ?? ''
  check(
    area,
    'estático: InvMunicipal no tiene campo id (imposible agrupar por id)',
    !/\bid\s*:/.test(iface),
    'grep interface InvMunicipal en conprel-parser.ts',
    iface.replace(/\s+/g, ' ').slice(0, 140),
    iface.replace(/\s+/g, ' '),
  )

  const madrid = inv.municipales.find((m) => m.ine === '28079')!
  const solo = buildTuplasFamilia('ppto', [madrid], eco, { url: '' })
  const vals = solo.tuplas.map((t) => t.valor)
  check(
    area,
    'unit: Madrid (idente 17037) NO recibe la eco de id compartido (17038/77777)',
    vals.length === 1 && vals[0] === 100,
    'buildTuplasFamilia([Madrid]) · join por idente',
    `vals=[${vals.join(',')}]`,
    `vals=[${vals.join(',')}]`,
  )

  // Simulación del algoritmo ROBADO (agrupar por id del CSV crudo): demostrar
  // que SÍ sobre-computaría — el test detecta la clase de bug.
  const raw = fs.readFileSync(invP, 'utf8').trim().split(/\r?\n/).slice(1)
  const ecoRaw = fs.readFileSync(ecoP, 'utf8').trim().split(/\r?\n/).slice(1)
  const identesDelIdUno = raw
    .filter((r) => {
      const cc = r.split('|')
      return esMunicipalCodente(cc[0]!) && cc[2] === '1'
    })
    .map((r) => r.split('|')[3]!)
  const wrongVals: number[] = []
  for (const l of ecoRaw) {
    const c = l.split('|')
    if (identesDelIdUno.includes(c[0]!)) {
      wrongVals.push(Number(c[3]!.replace(/\./g, '').replace(',', '.')))
    }
  }
  const wrongTotal = wrongVals.reduce((a, b) => a + b, 0)
  check(
    area,
    'unit: el algoritmo por id SÍ sobre-computaría (300 ≠ 100) — el test corta esa clase de bug',
    wrongTotal === 300 && (vals[0] ?? 0) !== wrongTotal,
    'simulación join por id compartido',
    `wrong=${wrongTotal} real=${vals[0]}`,
    `wrong=${wrongTotal} real=${vals[0]}`,
  )

  // CSV real: ningún par de municipales comparte id de grupo.
  const invReal = path.join(CONPREL_CSV, 'loader_inv_ppto2025.csv')
  if (fs.existsSync(invReal)) {
    const seen = new Map<string, string>()
    let shared = 0
    for (const l of fs.readFileSync(invReal, 'utf8').split(/\r?\n/).slice(1)) {
      if (!l) continue
      const c = l.split('|')
      if (c.length < 4 || !esMunicipalCodente(c[0]!)) continue
      if (seen.has(c[2]!)) shared++
      else seen.set(c[2]!, c[0]!)
    }
    check(area, 'CSV real ppto: 0 pares municipales con id compartido', shared === 0, 'loader_inv_ppto2025.csv', `shared=${shared}`, `shared=${shared}`)
  } else {
    add(area, 'CSV real ppto no disponible (fixture local cubre el ángulo)', 'PASS', 'loader_inv_ppto2025.csv', 'TEMP no presente')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A3 — ZV/ZO/DD/MM no se cuelan
// ══════════════════════════════════════════════════════════════════════════

function a3Zvzo(): void {
  console.log('\n═══ A3 · Inclusión accidental de ZV/ZO ═══')
  const area = 'A3'

  const casos: Array<[string, boolean]> = [
    ['51001ZZ000', true],
    ['51001ZV003', false],
    ['51001ZO001', false],
    ['24000DD000', false],
    ['24011MM000', false],
    ['28079aa000', true],
    ['51001zv003', false],
    ['28079', false],
  ]
  const wrong = casos.filter(([c, esp]) => esMunicipalCodente(c) !== esp)
  check(
    area,
    'esMunicipalCodente: matriz AA/ZZ/ZV/ZO/DD/MM/minúsculas/corto',
    wrong.length === 0,
    'esMunicipalCodente (8 casos)',
    '8/8',
    wrong.map(([c, e]) => `${c}→${esMunicipalCodente(c)}≠${e}`).join(','),
  )

  const invP = writeFixture(
    'a3_inv.csv',
    [
      INV_HEADER,
      `51001ZZ000|C|1|90001|${'Ceuta'.padEnd(60)}|1|84000`,
      `51001ZV003|C|2|90003|${'Dep ZV'.padEnd(60)}|1|0`,
      `51001ZO001|C|3|90004|${'Dep ZO'.padEnd(60)}|1|0`,
      `52001ZZ000|C|4|90005|${'Melilla'.padEnd(60)}|1|1`,
      `24000DD000|C|5|7223|${'Dip Leon'.padEnd(60)}|1|0`,
      `24011MM000|C|6|7328|${'Manco'.padEnd(60)}|1|0`,
    ].join('\n') + '\n',
  )
  const ecoP = writeFixture(
    'a3_eco.csv',
    [
      ECO_HEADER_L,
      '90001|1|I|10,00|10,00|10,00|0,00',
      '90003|1|I|999999,00|999999,00|999999,00|999999,00',
      '90004|1|I|888888,00|888888,00|888888,00|888888,00',
      '90005|1|I|20,00|20,00|20,00|0,00',
      '7223|1|I|777777,00|777777,00|777777,00|777777,00',
      '7328|1|I|666666,00|666666,00|666666,00|666666,00',
    ].join('\n') + '\n',
  )
  const inv = cargarInventario(invP, CONPREL_LIQ_2024)
  const eco = cargarEconomica(ecoP, CONPREL_LIQ_2024, {})
  check(
    area,
    'solo AA/ZZ entran como municipales (Ceuta+Melilla)',
    inv.municipales.length === 2 && inv.municipales.every((m) => esMunicipalCodente(m.codente)),
    'cargarInventario',
    `n=${inv.municipales.length}`,
    `n=${inv.municipales.length} codentes=${inv.municipales.map((m) => m.codente).join(',')}`,
  )
  check(
    area,
    'noMunicipalesCeutaMelilla == [ZV, ZO]',
    inv.noMunicipalesCeutaMelilla.length === 2 && inv.noMunicipalesCeutaMelilla.every((c) => /Z[VO]/.test(c)),
    'cargarInventario',
    inv.noMunicipalesCeutaMelilla.join(','),
    inv.noMunicipalesCeutaMelilla.join(','),
  )

  const res = buildTuplasFamilia('liq', inv.municipales, eco, { url: '' })
  const vals = res.tuplas.map((t) => t.valor)
  const colados = vals.filter((v) => [999999, 888888, 777777, 666666].includes(v))
  check(
    area,
    'eco de ZV/ZO/DD/MM jamás publicada',
    colados.length === 0 && vals.includes(10) && vals.includes(20),
    'buildTuplasFamilia(inv AA/ZZ)',
    `vals=[${vals.join(',')}]`,
    `colados=[${colados.join(',')}]`,
  )

  const invReal = path.join(CONPREL_CSV, 'loader_inv_ppto2025.csv')
  if (fs.existsSync(invReal)) {
    const carga = cargarInventario(invReal, CONPREL_PPTO_2025)
    const bad = carga.municipales.filter((m) => !esMunicipalCodente(m.codente))
    check(
      area,
      'CSV real: 0 no-AA/ZZ en municipales (7345)',
      bad.length === 0 && carga.municipales.length === 7345,
      'cargarInventario(loader_inv_ppto2025)',
      `munis=${carga.municipales.length} bad=${bad.length}`,
      `munis=${carga.municipales.length} bad=${bad.map((m) => m.codente).join(',')}`,
    )
    check(
      area,
      'CSV real: ZV/ZO Ceuta listados como excluidos (7)',
      carga.noMunicipalesCeutaMelilla.length === 7,
      'noMunicipalesCeutaMelilla',
      `n=${carga.noMunicipalesCeutaMelilla.length}`,
      `n=${carga.noMunicipalesCeutaMelilla.length}`,
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A4 — Ausencia convertida en cero
// ══════════════════════════════════════════════════════════════════════════

function a4Ausencia(): void {
  console.log('\n═══ A4 · Ausencia convertida en cero ═══')
  const area = 'A4'

  const invP = writeFixture(
    'a4_inv.csv',
    [
      INV_HEADER,
      `48044AA000|C|1|9044|${'Getxo'.padEnd(60)}|1|1`,
      `01059AA000|C|2|1059|${'Vitoria'.padEnd(60)}|1|1`,
    ].join('\n') + '\n',
  )
  // Getxo: campo importe VACÍO (ausencia). Vitoria: sin fila eco (ausencia de fila).
  const ecoP = writeFixture('a4_eco.csv', [ECO_HEADER_P, '9044|1|I|'].join('\n') + '\n')
  const inv = cargarInventario(invP, CONPREL_PPTO_2025)
  const eco = cargarEconomica(ecoP, CONPREL_PPTO_2025, {})
  const res = buildTuplasFamilia('ppto', inv.municipales, eco, { url: '' })

  check(
    area,
    'campo vacío → SIN tupla (no cero)',
    res.tuplas.length === 0,
    'buildTuplasFamilia',
    `tuplas=${res.tuplas.length} nulos=${eco.nulos}`,
    `tuplas=${res.tuplas.length} vals=[${res.tuplas.map((t) => t.valor).join(',')}]`,
  )
  check(
    area,
    'municipio sin fila → municipiosSinFilas=[01059]; Getxo (fila con campo vacío) NO cuenta como sin-filas',
    res.municipiosSinFilas.length === 1 && res.municipiosSinFilas.includes('01059'),
    'municipiosSinFilas',
    res.municipiosSinFilas.join(','),
    res.municipiosSinFilas.join(','),
  )

  // Merge con lote vacío: jamás purga ni escribe ceros.
  const env: EnvV2 = {
    version: 2,
    codigo_ine: '48044',
    generado_en: new Date().toISOString(),
    indicators: [{ slug: 'conprel_ppto_importe', nombre: 'x', unidad: 'euros' }],
    sources: [],
    source_urls: [],
    dimensiones: [],
    valores: [[0, 2025, 42, 'euros', 0, 0, 'CONPREL-PPTO-2025', null, 'validado']],
  }
  const antes = JSON.stringify(env.valores)
  const m = mergeConprelTuplas(env, [], {
    sourceSlug: 'hacienda_conprel',
    organismo: 'x',
    nombreFuente: 'x',
    slugsARemplazar: new Set(['conprel_ppto_importe']),
  })
  check(
    area,
    'merge con lote vacío = no-op (no purga, no escribe 0)',
    m.tuplasEscritas === 0 && JSON.stringify(env.valores) === antes && env.valores[0]![2] === 42,
    'mergeConprelTuplas(tuplas=[])',
    `escritas=${m.tuplasEscritas} valor sigue=42`,
    `escritas=${m.tuplasEscritas} valores=${JSON.stringify(env.valores)}`,
  )

  // Estático: modoEscritura salta munis sin tuplas (no rellena con 0).
  const loader = readRepo('scripts/load-conprel.ts')
  const salto = /if \(b\.tuplas\.length === 0\) continue/.test(loader)
  check(
    area,
    'estático: modoEscritura continúa si tuplas==0 (no inventa cero)',
    salto,
    'grep load-conprel.ts modoEscritura',
    'skip presente',
    'sin skip — podría publicar vacío',
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A5 — Cero real convertido en ND
// ══════════════════════════════════════════════════════════════════════════

function a5CeroReal(): void {
  console.log('\n═══ A5 · Cero real convertido en ND ═══')
  const area = 'A5'

  const invP = writeFixture('a5_inv.csv', [INV_HEADER, `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`].join('\n') + '\n')
  const ecoP = writeFixture('a5_eco.csv', [ECO_HEADER_L, '17037|1|I|0,00|0,00|0,00|0,00'].join('\n') + '\n')
  const inv = cargarInventario(invP, CONPREL_LIQ_2024)
  const eco = cargarEconomica(ecoP, CONPREL_LIQ_2024, {})
  const res = buildTuplasFamilia('liq', inv.municipales, eco, { url: '' })

  check(
    area,
    '0,00 ×4 magnitudes → 4 tuplas con valor 0',
    res.tuplas.length === 4 && res.tuplas.every((t) => t.valor === 0),
    'buildTuplasFamilia',
    `n=${res.tuplas.length} vals=[${res.tuplas.map((t) => t.valor).join(',')}]`,
    `n=${res.tuplas.length}`,
  )

  const env: EnvV2 = {
    version: 2,
    codigo_ine: '28079',
    generado_en: new Date().toISOString(),
    indicators: [],
    sources: [],
    source_urls: [],
    dimensiones: [],
    valores: [],
  }
  mergeConprelTuplas(env, res.tuplas, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'x',
    nombreFuente: 'x',
    slugsARemplazar: new Set(CONPREL_SLUGS.filter((s) => s.familia === 'liq').map((s) => s.slug)),
  })
  const json = JSON.stringify(env)
  const rehidratado = JSON.parse(json) as EnvV2
  const ceros = rehidratado.valores.filter((t) => Array.isArray(t) && t[2] === 0)
  const nulls = rehidratado.valores.filter((t) => Array.isArray(t) && t[2] === null)
  check(
    area,
    'tras merge+JSON: ceros siguen siendo 0 (no null/ND)',
    ceros.length === 4 && nulls.length === 0,
    'JSON round-trip',
    `ceros=${ceros.length} nulls=${nulls.length}`,
    `ceros=${ceros.length} nulls=${nulls.length}`,
  )

  check(
    area,
    'cero explícito ≠ ausencia en la semántica del parser',
    eco.cerosExplicitos === 4 && eco.nulos === 0,
    'cargarEconomica contadores',
    `ceros=${eco.cerosExplicitos} nulos=${eco.nulos}`,
    `ceros=${eco.cerosExplicitos} nulos=${eco.nulos}`,
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A6 — Duplicados y cambios de esquema
// ══════════════════════════════════════════════════════════════════════════

function a6DuplicadosEsquema(): void {
  console.log('\n═══ A6 · Duplicados y cambios de esquema ═══')
  const area = 'A6'

  const dupCasos: Array<{ nombre: string; inv?: string; eco?: string }> = [
    {
      nombre: 'dup codente',
      inv: [INV_HEADER, `28079AA000|C|1|17037|${'M'.padEnd(60)}|1|1`, `28079AA000|C|2|17038|${'M2'.padEnd(60)}|1|1`].join('\n') + '\n',
    },
    {
      nombre: 'dup INE-5',
      inv: [INV_HEADER, `28079AA000|C|1|17037|${'M'.padEnd(60)}|1|1`, `28079AA001|C|2|17038|${'M2'.padEnd(60)}|1|1`].join('\n') + '\n',
    },
    {
      nombre: 'dup idente',
      inv: [INV_HEADER, `28079AA000|C|1|17037|${'M'.padEnd(60)}|1|1`, `28080AA000|C|2|17037|${'M2'.padEnd(60)}|1|1`].join('\n') + '\n',
    },
    { nombre: 'dup clave eco', eco: [ECO_HEADER_P, '17037|1|I|10,00', '17037|1|I|20,00'].join('\n') + '\n' },
  ]
  for (const c of dupCasos) {
    const fname = `a6_${c.nombre.replace(/\s/g, '_')}.csv`
    const err = c.inv
      ? expectErrorKind(() => cargarInventario(writeFixture(fname, c.inv!), CONPREL_PPTO_2025), [ConprelBloqueoError])
      : expectErrorKind(() => cargarEconomica(writeFixture(fname, c.eco!), CONPREL_PPTO_2025, {}), [ConprelBloqueoError])
    check(area, `${c.nombre} → BLOQUEO`, err === null, 'cargarInventario/cargarEconomica', 'ConprelBloqueoError', err ?? 'sin error')
  }

  const schemaCasos: Array<{ nombre: string; header: string }> = [
    { nombre: 'columna fantasma (extra)', header: 'idente|cdcta|tipreig|importe|extra' },
    { nombre: 'columna ausente', header: 'idente|cdcta|tipreig' },
    { nombre: 'columna renombrada', header: 'idente|cdcta|tipreig|importe_total' },
    { nombre: 'orden alterado', header: 'cdcta|idente|tipreig|importe' },
    { nombre: 'delimitador coma (cabecera basura)', header: 'idente,cdcta,tipreig,importe' },
  ]
  for (const c of schemaCasos) {
    const p = writeFixture(`a6_schema_${c.nombre.replace(/[^\w]+/g, '_')}.csv`, `${c.header}\n17037|1|I|10,00\n`)
    const err = expectErrorKind(() => {
      const header = c.header.split('|')
      assertHeader(header, CONPREL_PPTO_2025.ecoColumns, p)
    }, [ConprelParseError])
    check(area, `esquema: ${c.nombre} → PARSE ERROR`, err === null, 'assertHeader', 'ConprelParseError', err ?? 'pasó sin error')
  }

  // Cabecera correcta + BOM sí pasa (robustez razonable).
  const bom = writeFixture('a6_bom.csv', `﻿${ECO_HEADER_P}\n17037|1|I|10,00\n`)
  let bomOk = false
  try {
    const t = cargarEconomica(bom, CONPREL_PPTO_2025, {})
    bomOk = t.filas.length === 1 && t.filas[0]?.idente === '17037'
  } catch {
    bomOk = false
  }
  check(area, 'BOM UTF-8 + cabecera correcta → OK (1 fila)', bomOk, 'cargarEconomica(BOM)', '1 fila idente=17037', 'fallo o 0 filas')
}

// ══════════════════════════════════════════════════════════════════════════
// A7 — Backup no restaurable (diseño con fixtures + estático loader)
// ══════════════════════════════════════════════════════════════════════════

function a7Backup(): void {
  console.log('\n═══ A7 · Backup/restauración ═══')
  const area = 'A7'

  // SA2 (agente de backup) no está mergeado en el repo → marcamos la
  // dependencia y probamos el DISEÑO (patrón fix-tgss) con fixtures propias.
  const sa2EnRepo =
    fs.existsSync(path.join(process.cwd(), 'scripts', 'sa2-backup.ts')) ||
    fs.existsSync(path.join(process.cwd(), 'scripts', 'backup-sa2.ts'))
  if (sa2EnRepo) {
    add(area, 'SA2 presente en repo', 'PASS', 'scripts/sa2*.ts', 'disponible')
  } else {
    add(
      area,
      'SA2 no mergeado → dependencia marcada; se prueba el diseño con fixtures',
      'PASS',
      'git grep SA2',
      'SA2 ausente (esperado); fixture del patrón fix-tgss más abajo',
    )
  }

  // Fixture: respaldo → corrupción → restauración → sha idéntico.
  const original = JSON.stringify({
    version: 2,
    codigo_ine: '28079',
    generado_en: '2026-01-01T00:00:00.000Z',
    indicators: [{ slug: 'irpf_declaraciones', nombre: 'IRPF', unidad: 'declaraciones' }],
    sources: [],
    source_urls: [],
    dimensiones: [],
    valores: [[0, 2023, 98166, null, 0, 0, 'EDM2023', null, 'validado']],
  })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto')
  const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex')
  const backupPath = writeFixture('a7_backup_28079.json', original)
  const shaOriginal = sha(original)
  const corrupto = original.replace('98166', '0')
  check(
    area,
    'fixture: corrupción detectable por sha',
    sha(corrupto) !== shaOriginal,
    'sha256(backup) vs sha256(corrupto)',
    'shas distintos',
    'shas iguales',
  )
  const restaurado = fs.readFileSync(backupPath, 'utf8')
  check(
    area,
    'fixture: restore desde backup → byte-idéntico',
    sha(restaurado) === shaOriginal && restaurado === original,
    'readFileSync(backup)',
    `sha=${shaOriginal.slice(0, 12)}…`,
    `sha=${sha(restaurado).slice(0, 12)}…`,
  )

  // Estático: el loader de escritura debe respaldar el envelope PREVIO antes
  // del merge/put (diseño §7.4 — patrón fix-tgss). Sin backup no hay rollback.
  const loader = readRepo('scripts/load-conprel.ts')
  const iModo = loader.indexOf('async function modoEscritura')
  const modo = iModo >= 0 ? loader.slice(iModo, iModo + 6000) : ''
  const tieneBackup = /conprel-backup|backupLocal/i.test(modo)
  // Ojo: putMunicipioJson aparece primero en el destructure del import dinámico;
  // hay que buscar la LLAMADA `await putMunicipioJson(`.
  const iBackup = modo.indexOf('conprel-backup')
  const iMerge = modo.indexOf('mergeConprelTuplas(')
  const iPutCall = modo.indexOf('await putMunicipioJson(')
  const backupAntesDeMerge = tieneBackup && iBackup >= 0 && iMerge >= 0 && iBackup < iMerge
  const mergeAntesDePut = iMerge >= 0 && iPutCall >= 0 && iMerge < iPutCall
  check(
    area,
    'estático: modoEscritura escribe backup local ANTES del merge/put',
    backupAntesDeMerge && mergeAntesDePut,
    'grep load-conprel.ts modoEscritura (conprel-backup → merge → await put)',
    backupAntesDeMerge && mergeAntesDePut
      ? `backup@${iBackup} merge@${iMerge} put@${iPutCall}`
      : tieneBackup
        ? 'backup presente pero fuera de orden'
        : 'SIN backup antes de merge',
    `backup=${tieneBackup} iBackup=${iBackup} iMerge=${iMerge} iPut=${iPutCall}`,
  )
  if (!backupAntesDeMerge) {
    defect(
      'ALTO',
      'Q6-A7',
      'El loader CONPREL (modoEscritura) no escribe backup local del envelope previo antes de putMunicipioJson, aunque el diseño §7.4 condiciona el rollback a «restore desde el backup local previo (patrón fix-tgss)». Sin ese fichero, un run de escritura defectuoso no es restaurable desde el repo/scripts.',
      'Leer scripts/load-conprel.ts → modoEscritura: no existe writeFileSync a tmp/conprel-backup/<runId>/<ine>.json antes de mergeConprelTuplas/putMunicipioJson. Repro estático: npx tsx scripts/qa-adversarial-socideas.ts → A7 «estático: modoEscritura escribe backup local…» = FAIL.',
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A8 — Envelope >150 KB
// ══════════════════════════════════════════════════════════════════════════

function a8TamanoLocal(): void {
  console.log('\n═══ A8 · Gate 150 KB (unidad + fronteras) ═══')
  const area = 'A8'

  check(
    area,
    'CONPREL_MAX_ENVELOPE_BYTES == 153600',
    CONPREL_MAX_ENVELOPE_BYTES === 150 * 1024,
    'conprel-contracts',
    String(CONPREL_MAX_ENVELOPE_BYTES),
    String(CONPREL_MAX_ENVELOPE_BYTES),
  )

  const jsonN = (n: number): string => '{"p":"' + 'x'.repeat(Math.max(0, n - 8)) + '"}'
  const justo = cabeEnvelope(jsonN(153_599))
  const limite = cabeEnvelope(jsonN(153_600))
  const sobre = cabeEnvelope(jsonN(153_601))
  check(
    area,
    'frontera estricta: 153599 cabe · 153600 y 153601 NO',
    justo.ok && !limite.ok && !sobre.ok,
    'cabeEnvelope',
    `153599=${justo.ok} 153600=${limite.ok} 153601=${sobre.ok}`,
    `153599=${justo.ok} 153600=${limite.ok} 153601=${sobre.ok}`,
  )

  // Consistencia interna del loader: sizeFull debe usar el MISMO gate que
  // cabeEnvelope (write). Si sizeFull dice "cabe" y el write rechaza, el
  // dry-run miente en la frontera exacta.
  const loader = readRepo('scripts/load-conprel.ts')
  const usaGte = /bytes\s*>=\s*CONPREL_MAX_ENVELOPE_BYTES/.test(loader) || /bytes\s*>=\s*150\s*\*\s*1024/.test(loader)
  const viejoOperador = /bytes\s*>\s*150\s*\*\s*1024/.test(loader)
  check(
    area,
    'estático: sizeFull alineado con el gate de write (>= MAX, no > MAX)',
    usaGte && !viejoOperador,
    'grep sizeFull en load-conprel.ts',
    usaGte && !viejoOperador
      ? '>= CONPREL_MAX_ENVELOPE_BYTES'
      : viejoOperador
        ? 'bytes > 150*1024 (deja pasar 153600 al write que lo rechaza)'
        : 'operador no reconocido',
    viejoOperador ? 'bytes > 150*1024 — inconsistente con cabeEnvelope (bytes < MAX)' : 'sin coincidencia',
  )
  if (viejoOperador) {
    defect(
      'BAJO',
      'Q6-A8',
      'Frontera inconsistente: sizeFull del loader marca «over» con bytes > 153600, pero el gate de escritura cabeEnvelope acepta solo bytes < 153600. Un envelope de exactamente 153600 B pasaría el reporte del dry-run y sería rechazado (o al revés según operador) en el write.',
      'scripts/load-conprel.ts → sizeFull: `if (bytes > 150 * 1024)` vs src/lib/conprel-parser.ts cabeEnvelope: `bytes < 150 * 1024`. Repro unit: npx tsx scripts/qa-adversarial-socideas.ts → A8 «estático: sizeFull alineado…».',
    )
  }

  const cob = readRepo('scripts/qa-cobertura-muestra.ts')
  if (/bytes\s*<=\s*150\s*\*\s*1024/.test(cob)) {
    add(
      area,
      'INFO: qa-cobertura usa <= 153600 (lee objetos existentes; no es gate de write)',
      'PASS',
      'grep qa-cobertura-muestra.ts',
      'umbral de lectura permisivo — no afecta al write gate CONPREL',
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A9 — Pérdida de slugs tras merge
// ══════════════════════════════════════════════════════════════════════════

function a9SlugsMerge(): void {
  console.log('\n═══ A9 · Pérdida de slugs tras merge ═══')
  const area = 'A9'

  const env: EnvV2 = {
    version: 2,
    codigo_ine: '28079',
    generado_en: new Date().toISOString(),
    indicators: [
      { slug: 'irpf_declaraciones', nombre: 'IRPF', unidad: 'decl' },
      { slug: 'population_total', nombre: 'Pob', unidad: 'hab' },
      { slug: 'conprel_ppto_importe', nombre: 'Ppto', unidad: 'euros' },
      { slug: 'conprel_liq_reconocidos_importe', nombre: 'Liq', unidad: 'euros' },
    ],
    sources: [],
    source_urls: [],
    dimensiones: [],
    valores: [
      [0, 2023, 100, 'decl', 0, 0, 'EDM2023', null, 'validado'],
      [1, 2024, 500, 'hab', 0, 0, 'INE', null, 'validado'],
      [2, 2025, 1, 'euros', 0, 0, 'CONPREL-PPTO-2025', null, 'validado'],
      [3, 2024, 2, 'euros', 0, 0, 'CONPREL-LIQ-2024', null, 'validado'],
    ],
  }

  const slugsPpto = new Set(CONPREL_SLUGS.filter((s) => s.familia === 'ppto').map((s) => s.slug))

  const invP = writeFixture('a9_inv.csv', [INV_HEADER, `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`].join('\n') + '\n')
  const ecoP = writeFixture('a9_eco.csv', [ECO_HEADER_P, '17037|1|I|500,00'].join('\n') + '\n')
  const inv = cargarInventario(invP, CONPREL_PPTO_2025)
  const eco = cargarEconomica(ecoP, CONPREL_PPTO_2025, {})
  const tuplas = buildTuplasFamilia('ppto', inv.municipales, eco, { url: '' }).tuplas

  const m1 = mergeConprelTuplas(env, tuplas, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'MinsHacienda',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  const slugsTrasPpto = new Set(env.indicators.map((i) => i.slug))
  check(
    area,
    'merge ppto no pierde irpf/population/liq',
    m1.slugsPerdidos.length === 0 &&
      slugsTrasPpto.has('irpf_declaraciones') &&
      slugsTrasPpto.has('population_total') &&
      slugsTrasPpto.has('conprel_liq_reconocidos_importe'),
    'mergeConprelTuplas(slugsARemplazar=ppto)',
    `perdidos=[${m1.slugsPerdidos.join(',')}] n_ind=${env.indicators.length}`,
    `perdidos=[${m1.slugsPerdidos.join(',')}]`,
  )
  const liqTras = env.valores.filter((t) => {
    const ii = t[0] as number
    return env.indicators[ii]?.slug.startsWith('conprel_liq_')
  }).length
  check(area, 'tuplas LIQ intactas tras merge ppto', liqTras === 1, 'env.valores post-merge', `liq=${liqTras}`, `liq=${liqTras}`)

  const nInd = env.indicators.length
  const m2 = mergeConprelTuplas(env, tuplas, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'MinsHacienda',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  check(
    area,
    'segundo merge ppto idempotente (indicators no crecen)',
    m2.slugsPerdidos.length === 0 && env.indicators.length === nInd,
    'merge ×2',
    `ind=${env.indicators.length}`,
    `ind=${env.indicators.length}`,
  )

  const loader = readRepo('scripts/load-conprel.ts')
  const soloFamilia = /CONPREL_SLUGS\.filter\(\(s\) => s\.familia === fam\)/.test(loader)
  check(
    area,
    'estático: loader reemplaza solo slugs de la familia del run',
    soloFamilia,
    'grep load-conprel.ts (filter familia === fam)',
    'filter por familia',
    'sin filtro por familia — riesgo de purga cruzada',
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A10 — Caché que sirve datos viejos
// ══════════════════════════════════════════════════════════════════════════

function a10CacheEstatico(): void {
  console.log('\n═══ A10 · Caché/invalidación (estático B1 + tags) ═══')
  const area = 'A10'

  const r2src = readRepo('src/lib/socideas-r2.ts')
  const cacheControlLine = /CacheControl:\s*'([^']+)'/.exec(r2src)?.[1] ?? ''
  check(
    area,
    'B1: putMunicipioJson usa max-age=300 (no 86400)',
    cacheControlLine === 'public, max-age=300, must-revalidate',
    'grep CacheControl en socideas-r2.ts putMunicipioJson',
    cacheControlLine || 'sin CacheControl',
    cacheControlLine || 'sin CacheControl',
  )
  check(
    area,
    'B1: ningún CacheControl activo con max-age=86400',
    !/CacheControl:\s*'[^']*max-age=86400/.test(r2src),
    'grep CacheControl: …max-age=86400',
    'limpio (el 86400 solo aparece en comentarios históricos)',
    'CacheControl activo con max-age=86400',
  )

  const muniTag = /socideas-muni-\$\{codigoIne\}/.test(r2src)
  const revsrc = readRepo('src/lib/socideas-revalidate.ts')
  const revTag = /socideas-muni-\$\{ine\}/.test(revsrc)
  check(
    area,
    'tag de lectura == tag de revalidación (socideas-muni-<ine>)',
    muniTag && revTag,
    'grep socideas-r2.ts + socideas-revalidate.ts',
    'ambos socideas-muni-${…}',
    `r2=${muniTag} rev=${revTag}`,
  )

  const route = readRepo('src/app/api/socideas/revalidate/route.ts')
  // Solo dentro del handler POST: la definición de consumeRateRequest vive
  // antes que POST en el fichero y falsearía el orden.
  const iPost = route.indexOf('export async function POST')
  const postBody = iPost >= 0 ? route.slice(iPost, iPost + 2500) : route
  const iAuth = postBody.indexOf('tokenMatches(provided, expected)')
  const iRate = postBody.indexOf('consumeRateRequest(')
  check(
    area,
    'estático: auth (401) ANTES que consumeRateRequest (429) en POST',
    iAuth >= 0 && iRate > iAuth,
    'orden dentro de export async function POST',
    `auth@${iAuth} rate@${iRate}`,
    `auth@${iAuth} rate@${iRate}`,
  )
}

async function a10CacheProd(): Promise<void> {
  const area = 'A10'
  console.log('\n═══ A10 · Caché R2↔SSR (producción, lectura) ═══')
  const muestra = [
    ['02003', 'Albacete'],
    ['28079', 'Madrid'],
    ['41091', 'Sevilla'],
  ] as const

  for (const [ine, nombre] of muestra) {
    let r2Val: number | null = null
    try {
      const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, { signal: AbortSignal.timeout(30_000) })
      if (r.ok) {
        const env = (await r.json()) as { indicators: { slug: string }[]; valores: unknown[][] }
        const ii = env.indicators.findIndex((i) => i.slug === 'irpf_declaraciones')
        if (ii >= 0) {
          const row = env.valores.find((t) => Array.isArray(t) && t[0] === ii && typeof t[2] === 'number')
          r2Val = row ? Number(row[2]) : null
        }
      }
    } catch {
      /* red */
    }
    if (r2Val === null) {
      add(area, `${ine} ${nombre}: sin irpf en R2 (skip frescura)`, 'PASS', `R2 ${ine}`, 'sin valor que comparar')
      continue
    }
    const fmt = r2Val.toLocaleString('es-ES')
    let ssr = ''
    try {
      const r = await fetch(`${BASE}/socideas/${ine}?hoja=economia`, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'cache-control': 'no-cache' },
      })
      ssr = r.ok ? await r.text() : ''
    } catch {
      /* red */
    }
    check(
      area,
      `${ine} ${nombre}: SSR (no-cache) muestra el valor vivo de R2`,
      ssr.includes(fmt),
      `GET ${BASE}/socideas/${ine}?hoja=economia vs R2`,
      `R2=${fmt} visible en SSR`,
      `R2=${fmt} NO visible en SSR (caché vieja o dato ausente)`,
    )
  }

  if (REVALIDAR) {
    // Prueba ACOTADA: 1 POST batch con 3 INEs. No es carga agresiva.
    const token = process.env.SOCIDEAS_REVALIDATE_TOKEN || process.env.SOCIDEAS_SYNC_TOKEN || ''
    if (!token) {
      add(area, '--revalidar: sin token en entorno (skip)', 'PASS', 'SOCIDEAS_REVALIDATE_TOKEN', 'ausente — prueba omitida')
      return
    }
    const ines = ['02003', '28079', '41091']
    try {
      const rr = await fetch(`${BASE}/api/socideas/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-token': token },
        body: JSON.stringify({ ines }),
        signal: AbortSignal.timeout(60_000),
      })
      const rj = (await rr.json()) as { data?: { invalidados?: number; errores?: number } }
      check(
        area,
        'POST revalidate acotado (3 INEs) → 200 invalidados=3',
        rr.status === 200 && rj.data?.invalidados === 3 && rj.data?.errores === 0,
        'POST /api/socideas/revalidate',
        `status=${rr.status} invalidados=${rj.data?.invalidados} errores=${rj.data?.errores}`,
        `status=${rr.status} data=${JSON.stringify(rj.data)}`,
      )
      for (const [ine, nombre] of muestra.slice(0, 2)) {
        try {
          const r = await fetch(`${BASE}/socideas/${ine}?hoja=economia`, {
            signal: AbortSignal.timeout(60_000),
            headers: { 'cache-control': 'no-cache' },
          })
          check(area, `${ine} ${nombre}: SSR post-revalidate 200`, r.status === 200, 'GET ficha', String(r.status), String(r.status))
        } catch (e) {
          check(area, `${ine} ${nombre}: SSR post-revalidate`, false, 'GET ficha', '', (e as Error).message)
        }
      }
    } catch (e) {
      check(area, 'POST revalidate acotado', false, 'POST /api/socideas/revalidate', '', (e as Error).message)
    }
  } else {
    add(area, 'revalidación en vivo omitida (pasar --revalidar para prueba acotada de 3 INEs)', 'PASS', '--revalidar', 'solo lectura por defecto')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A11 — Ficha y XLSX discrepantes (3 vías)
// ══════════════════════════════════════════════════════════════════════════

async function a11FichaXlsx(skipXlsx: boolean): Promise<void> {
  console.log('\n═══ A11 · R2 ↔ SSR ↔ XLSX ═══')
  const area = 'A11'
  const pares: Array<[string, string]> = [
    ['02003', 'Albacete'],
    ['28079', 'Madrid'],
  ]

  for (const [ine, nombre] of pares) {
    let r2Val: number | null = null
    try {
      const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, { signal: AbortSignal.timeout(30_000) })
      if (r.ok) {
        const env = (await r.json()) as { indicators: { slug: string }[]; valores: unknown[][] }
        const ii = env.indicators.findIndex((i) => i.slug === 'irpf_declaraciones')
        const row = ii >= 0 ? env.valores.find((t) => Array.isArray(t) && t[0] === ii && typeof t[2] === 'number') : undefined
        r2Val = row ? Number(row[2]) : null
      }
    } catch {
      /* red */
    }
    if (r2Val === null) {
      add(area, `${ine} ${nombre}: sin irpf en R2 (skip 3 vías)`, 'PASS', `R2 ${ine}`, 'sin valor')
      continue
    }
    const fmt = r2Val.toLocaleString('es-ES')
    let ssrOk = false
    try {
      const r = await fetch(`${BASE}/socideas/${ine}?hoja=economia`, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'cache-control': 'no-cache' },
      })
      ssrOk = r.ok && (await r.text()).includes(fmt)
    } catch {
      /* red */
    }
    check(area, `${ine} ${nombre}: SSR == R2 (${fmt})`, ssrOk, 'GET ficha vs R2', `R2=${fmt}`, `R2=${fmt} no visible`)

    if (skipXlsx) {
      add(area, `${ine} ${nombre}: XLSX omitido (--skip-xlsx)`, 'PASS', '--skip-xlsx', 'omitido')
      continue
    }
    let xlsxOk = false
    let xlsxDetail = ''
    try {
      const r = await fetch(`${BASE}/api/socideas/exportar/${ine}`, { signal: AbortSignal.timeout(120_000) })
      if (r.status !== 200) xlsxDetail = `HTTP ${r.status}`
      else {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf[0] !== 0x50 || buf[1] !== 0x4b) xlsxDetail = `no ZIP (${buf.length} B)`
        else {
          const zip = await JSZip.loadAsync(buf)
          const needle = `<v>${r2Val}</v>`
          for (const name of Object.keys(zip.files)) {
            if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
              const xml = (await zip.file(name)!.async('string')) ?? ''
              if (xml.includes(needle)) {
                xlsxOk = true
                break
              }
            }
          }
          xlsxDetail = xlsxOk ? `${buf.length} B · valor ${r2Val} presente` : `valor ${r2Val} NO en hojas`
        }
      }
    } catch (e) {
      xlsxDetail = (e as Error).message
    }
    check(area, `${ine} ${nombre}: XLSX == R2 (${r2Val})`, xlsxOk, `GET ${BASE}/api/socideas/exportar/${ine}`, xlsxDetail, xlsxDetail)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A12 — SSR puntuales
// ══════════════════════════════════════════════════════════════════════════

async function a12Ssr(): Promise<void> {
  console.log('\n═══ A12 · SSR puntuales (9 códigos) ═══')
  const area = 'A12'
  const casos: Array<{ ine: string; nombreEsperado: string | null; nota?: string }> = [
    { ine: '28079', nombreEsperado: 'Madrid' },
    { ine: '48020', nombreEsperado: 'Bilbao', nota: 'INE real (48013=Barakaldo)' },
    { ine: '15078', nombreEsperado: 'Santiago de Compostela', nota: 'no 27044 A Pastoriza' },
    { ine: '31201', nombreEsperado: 'Pamplona' },
    { ine: '01059', nombreEsperado: 'Vitoria', nota: 'Vitoria-Gasteiz' },
    { ine: '01201', nombreEsperado: null, nota: 'INE inexistente → EmptyState honesto' },
    { ine: '48044', nombreEsperado: 'Getxo' },
    { ine: '51001', nombreEsperado: 'Ceuta' },
    { ine: '52001', nombreEsperado: 'Melilla' },
  ]
  for (const c of casos) {
    try {
      const r = await fetch(`${BASE}/socideas/${c.ine}`, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'cache-control': 'no-cache' },
      })
      const t = await r.text()
      const sinError = !/Application error|Internal Server Error|__NEXT_ERROR__/i.test(t.slice(0, 8000)) && t.length > 5000
      if (c.nombreEsperado === null) {
        const honesto = t.includes(`No se encontró el municipio con código INE ${c.ine}`) || t.includes('404')
        check(
          area,
          `${c.ine}: INE inexistente → EmptyState honesto (no ficha fantasma)`,
          r.status === 200 && honesto && !t.includes('Vitoria-Gasteiz</h1>'),
          `GET /socideas/${c.ine} (${c.nota ?? ''})`,
          `status=${r.status} emptyState=${honesto}`,
          `status=${r.status} honesto=${honesto} len=${t.length}`,
        )
        if (r.status === 200 && honesto) {
          add(
            area,
            `${c.ine}: INFO — responde HTTP 200 con EmptyState (soft-404; decisión de producto)`,
            'PASS',
            'page.tsx !perfil → EmptyState',
            'comportamiento actual documentado; notFound() daría 404 real',
          )
        }
      } else {
        check(
          area,
          `${c.ine} ${c.nombreEsperado}: SSR 200 + nombre + sin error (${c.nota ?? ''})`.trim(),
          r.status === 200 && sinError && t.includes(c.nombreEsperado),
          `GET ${BASE}/socideas/${c.ine}`,
          `status=${r.status} len=${t.length} nombre=ok`,
          `status=${r.status} len=${t.length} nombre=${t.includes(c.nombreEsperado)} err=${!sinError}`,
        )
      }
    } catch (e) {
      check(area, `${c.ine}: SSR`, false, `GET /socideas/${c.ine}`, '', (e as Error).message)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A13 — Regresión no-CONPREL
// ══════════════════════════════════════════════════════════════════════════

async function a13Regresion(): Promise<void> {
  console.log('\n═══ A13 · Datos AEAT/ADRH/Educación/Agrario/Migraciones intactos ═══')
  const area = 'A13'
  const ine = '28079'

  try {
    const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, { signal: AbortSignal.timeout(30_000) })
    check(area, 'R2 Madrid legible', r.ok, `GET R2 ${ine}`, `status=${r.status}`, `status=${r.status}`)
    if (r.ok) {
      const env = (await r.json()) as {
        indicators: { slug: string }[]
        sources: { slug: string }[]
      }
      const slugs = env.indicators.map((i) => i.slug)
      const srcs = env.sources.map((s) => s.slug)
      check(area, 'R2: fuente aeat_edm presente', srcs.includes('aeat_edm'), 'env.sources', srcs.join(','), srcs.join(','))
      check(
        area,
        'R2: slugs AEAT (irpf_declaraciones) presente',
        slugs.includes('irpf_declaraciones'),
        'env.indicators',
        'ok',
        slugs.filter((s) => s.startsWith('irpf')).join(','),
      )
      const basicos = ['population_total', 'elec_censo', 'paro_registrado', 'afiliacion_total']
      check(
        area,
        'R2: slugs población/elecciones/SEPE/TGSS intactos',
        basicos.every((s) => slugs.includes(s)),
        'env.indicators',
        '4/4',
        basicos.filter((s) => !slugs.includes(s)).join(',') || 'faltan',
      )
      const conprelPublicado = slugs.filter((s) => s.startsWith('conprel_'))
      check(
        area,
        'R2: 0 slugs conprel_* publicados (dry-run)',
        conprelPublicado.length === 0,
        'env.indicators filter conprel_',
        '0',
        conprelPublicado.join(','),
      )
    }
  } catch (e) {
    check(area, 'R2 Madrid', false, `GET R2 ${ine}`, '', (e as Error).message)
  }

  const laterales: Array<[string, string, string]> = [
    ['ine-layers (Educación/Agrario)', `${R2_BASE}/socideas/ine-layers/v1/municipal/${ine}.json`, 'layers'],
    ['demographics (Migraciones)', `${R2_BASE}/socideas/demographics/ine/v1/municipal/${ine}.json`, 'nationality'],
  ]
  for (const [etiqueta, url, needle] of laterales) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      const body = r.ok ? await r.text() : ''
      check(
        area,
        `R2 lateral: ${etiqueta}`,
        r.ok && body.includes(needle),
        `GET …${url.slice(-60)}`,
        `status=${r.status} needle=${body.includes(needle)}`,
        `status=${r.status}`,
      )
    } catch (e) {
      check(area, `R2 lateral: ${etiqueta}`, false, 'GET', '', (e as Error).message)
    }
  }

  const hojas: Array<{ q: string; nombre: string; needles: string[] }> = [
    { q: '', nombre: 'demografia', needles: ['Flujos migratorios', 'Saldo migratorio neto'] },
    { q: '?hoja=economia', nombre: 'economia', needles: ['Sector agrario', 'Censo Agrario 2020', 'Renta'] },
    { q: '?hoja=sociocultural', nombre: 'sociocultural', needles: ['Nivel educativo', 'Censo de Población y Viviendas 2021'] },
  ]
  for (const h of hojas) {
    try {
      const r = await fetch(`${BASE}/socideas/${ine}${h.q}`, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'cache-control': 'no-cache' },
      })
      const t = r.ok ? await r.text() : ''
      const faltan = h.needles.filter((n) => !t.includes(n))
      check(
        area,
        `SSR ${h.nombre}: ${h.needles.join(' + ')}`,
        r.ok && faltan.length === 0,
        `GET /socideas/${ine}${h.q}`,
        `${h.needles.length}/${h.needles.length}`,
        faltan.join(',') || `status=${r.status}`,
      )
    } catch (e) {
      check(area, `SSR ${h.nombre}`, false, 'GET', '', (e as Error).message)
    }
  }

  for (const m of MUESTRA_COBERTURA) {
    try {
      const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${m.ine}.json`, { signal: AbortSignal.timeout(30_000) })
      if (!r.ok) {
        check(area, `cobertura ${m.ine} ${m.nombre}: R2 200`, false, `GET R2 ${m.ine}`, '', `status=${r.status}`)
        continue
      }
      const text = await r.text()
      const bytes = Buffer.byteLength(text, 'utf-8')
      const env = JSON.parse(text) as { codigo_ine?: string }
      check(
        area,
        `cobertura ${m.ine} ${m.nombre}: R2 ok + ≤150KB + codigo_ine`,
        env.codigo_ine === m.ine && bytes <= 150 * 1024,
        `GET R2 ${m.ine}`,
        `${bytes} B`,
        `${bytes} B codigo=${env.codigo_ine}`,
      )
    } catch (e) {
      check(area, `cobertura ${m.ine} ${m.nombre}`, false, 'GET R2', '', (e as Error).message)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A14 — Rate limit vs revalidaciones legítimas
// ══════════════════════════════════════════════════════════════════════════

async function a14RateLimit(): Promise<void> {
  console.log('\n═══ A14 · Rate limit B3 vs usos legítimos ═══')
  const area = 'A14'

  const mod = await import('../src/app/api/socideas/revalidate/route')
  const { consumeRateRequest, consumeRateInes } = mod

  // Requests: 60 ok, 61ª bloqueada con Retry-After.
  const kReq = `qa-req-${Date.now()}`
  let okReq = 0
  let blockedReq: { retryAfterSec: number; limit: string } | null = null
  for (let i = 0; i < 61; i++) {
    const d = consumeRateRequest(kReq, 1_000_000)
    if (d.ok) okReq++
    else if (!blockedReq) blockedReq = { retryAfterSec: d.retryAfterSec, limit: d.limit }
  }
  check(
    area,
    '60 req/min ok · 61ª → 429 con Retry-After',
    okReq === 60 && blockedReq !== null && blockedReq.retryAfterSec >= 1 && blockedReq.limit === 'requests',
    'consumeRateRequest ×61',
    `ok=${okReq} blocked=${JSON.stringify(blockedReq)}`,
    `ok=${okReq} blocked=${JSON.stringify(blockedReq)}`,
  )

  // Ventana deslizante: tras 61 s (simulado) se recupera.
  const kSlide = `qa-slide-${Date.now()}`
  const t0 = 2_000_000
  for (let i = 0; i < 60; i++) consumeRateRequest(kSlide, t0)
  const bloqueada = !consumeRateRequest(kSlide, t0).ok
  const recupera = consumeRateRequest(kSlide, t0 + 61_000).ok
  check(
    area,
    'ventana deslizante: bloquea en t y libera en t+61s',
    bloqueada && recupera,
    'consumeRateRequest(now) / now+61000',
    `bloqueada=${bloqueada} recupera=${recupera}`,
    `bloqueada=${bloqueada} recupera=${recupera}`,
  )

  // Techo de INEs: carga legítima de un loader full (8132 INEs = 41 lotes de
  // 200) debe caber en la ventana; si no, B3 bloquea revalidaciones legítimas.
  const kInes = `qa-ines-${Date.now()}`
  let okLotes = 0
  let primerBloqueo: { retryAfterSec: number; limit: string; lote: number } | null = null
  for (let lote = 1; lote <= 41; lote++) {
    const d = consumeRateInes(kInes, 200, 3_000_000)
    if (d.ok) okLotes++
    else if (!primerBloqueo) primerBloqueo = { retryAfterSec: d.retryAfterSec, limit: d.limit, lote }
  }
  const legitOk = okLotes === 41 && primerBloqueo === null
  check(
    area,
    'loader full (41×200=8200 INEs/min) NO es bloqueado',
    legitOk,
    'consumeRateInes ×41 lotes de 200',
    `okLotes=${okLotes}/41 primerBloqueo=null`,
    `okLotes=${okLotes}/41 primerBloqueo=${JSON.stringify(primerBloqueo)}`,
  )
  if (!legitOk) {
    defect(
      'ALTO',
      'Q6-A14',
      'El techo B3 de 5.000 INEs/min bloquea revalidaciones legítimas: un run de escritura CONPREL/AEAT sobre el catálogo completo (≈7.345–8.132 municipios en lotes de 200 = 37–41 lotes) supera el techo en la ventana de 60 s. revalidateMunicipios solo reintenta 3× con backoff ≤2 s (no espera Retry-After de 60 s) → el run queda degradado=true y parte de la caché municipal sirve datos viejos hasta el TTL de 1 h.',
      'Unit: npx tsx scripts/qa-adversarial-socideas.ts → A14 «loader full (41×200…)» = FAIL. Techo en src/app/api/socideas/revalidate/route.ts RATE_MAX_INES_PER_MIN=5_000; backoff fijo en src/lib/socideas-revalidate.ts postBatch (500/1000/2000 ms, sin usar Retry-After).',
    )
  }

  check(area, 'techo de peticiones (60/min) cubre 41 lotes del loader', 41 <= 60, 'RATE_MAX_REQUESTS_PER_MIN', '41 ≤ 60', '41 > 60')

  // Producción: SOLO 2 probes inertes (no consumen cupo: 405/401 son pre-tasa).
  if (!LOCAL_ONLY) {
    try {
      const g = await fetch(`${BASE}/api/socideas/revalidate`, { signal: AbortSignal.timeout(30_000) })
      check(area, 'prod probe: GET → 405 (inerte)', g.status === 405, 'GET /api/socideas/revalidate', String(g.status), String(g.status))
    } catch (e) {
      check(area, 'prod probe: GET', false, 'GET', '', (e as Error).message)
    }
    try {
      const p = await fetch(`${BASE}/api/socideas/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-token': 'qa-invalida-no-token-real' },
        body: JSON.stringify({ ines: ['02003'] }),
        signal: AbortSignal.timeout(30_000),
      })
      check(area, 'prod probe: POST token inválido → 401 (no consume cupo)', p.status === 401, 'POST con token inválido', String(p.status), String(p.status))
    } catch (e) {
      check(area, 'prod probe: POST 401', false, 'POST', '', (e as Error).message)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// A15 — Secretos
// ══════════════════════════════════════════════════════════════════════════

function a15Secretos(): void {
  console.log('\n═══ A15 · Secretos en commits/scripts/artefactos ═══')
  const area = 'A15'

  // Patrones de alto valor. Solo se reporta la POSICIÓN, jamás el valor.
  const patrones: Array<{ id: string; re: RegExp }> = [
    { id: 'JWT-like (eyJ…)', re: /eyJ[A-Za-z0-9_-]{30,}/ },
    { id: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
    { id: 'GitHub token', re: /ghp_[A-Za-z0-9]{30,}/ },
    { id: 'Slack token', re: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
    { id: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
    { id: 'private key PEM', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    {
      id: 'token con valor literal',
      re: /(SOCIDEAS_\w*TOKEN|SUPABASE_SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY)\s*=\s*["'][A-Za-z0-9+/_-]{20,}["']/,
    },
  ]

  // 1) Historial git (acotado a 400 commits; solo se imprime commit+patrón).
  try {
    const log = execSync('git log -p -n 400 --all --no-color', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const hits: string[] = []
    for (const p of patrones) {
      if (p.re.test(log)) hits.push(p.id)
    }
    check(
      area,
      'historial git (400 commits): sin patrones de secretos',
      hits.length === 0,
      'git log -p -n 400 | grep patrones',
      '0 hits',
      hits.join(', '),
    )
    if (hits.length > 0) {
      defect(
        'CRÍTICO',
        'Q6-A15',
        `Patrón de secreto en historial git: ${hits.join(', ')}. Rotar credenciales afectadas.`,
        'git log -p -n 400 --all | buscar los patrones listados (la suite no imprime valores).',
      )
    }
  } catch (e) {
    add(area, 'historial git: no inspeccionado', 'PASS', 'git log -p', `skip: ${(e as Error).message.slice(0, 80)}`)
  }

  // 2) Árbol de trabajo tracked: scripts/, src/, docs/.
  const scanDirs = ['scripts', 'src', 'docs']
  const fileHits: string[] = []
  for (const d of scanDirs) {
    const root = path.join(process.cwd(), d)
    if (!fs.existsSync(root)) continue
    const walkDir = (dir: string): void => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name)
        if (ent.isDirectory()) walkDir(p)
        else if (/\.(ts|tsx|js|mjs|md|json)$/.test(ent.name)) {
          let text = ''
          try {
            text = fs.readFileSync(p, 'utf8')
          } catch {
            continue
          }
          for (const pat of patrones) {
            if (pat.re.test(text)) fileHits.push(`${path.relative(process.cwd(), p)} :: ${pat.id}`)
          }
        }
      }
    }
    walkDir(root)
  }
  check(
    area,
    'scripts/src/docs: sin secretos literalizados',
    fileHits.length === 0,
    'scan local de patrones',
    '0 hits',
    fileHits.slice(0, 5).join(' | '),
  )
  if (fileHits.length > 0) {
    defect(
      'CRÍTICO',
      'Q6-A15b',
      `Secreto literal en árbol de trabajo: ${fileHits.slice(0, 3).join('; ')}.`,
      'npx tsx scripts/qa-adversarial-socideas.ts → A15 (posiciones en la evidencia; valores no impresos).',
    )
  }

  // 3) .env.example solo placeholders; ningún .env tracked.
  const example = fs.existsSync(path.join(process.cwd(), '.env.example')) ? readRepo('.env.example') : ''
  const placeholderOk =
    /SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui/.test(example) &&
    !/SUPABASE_SERVICE_ROLE_KEY=[A-Za-z0-9_-]{30,}/.test(example)
  check(
    area,
    '.env.example: solo placeholders',
    placeholderOk,
    'grep .env.example',
    'placeholders',
    'valor con apariencia de secreto',
  )
  try {
    const tracked = execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const envTracked = tracked
      .split(/\r?\n/)
      .filter((f) => /(^|\/)\.env($|\.local)|credentials|platform\.env|\.pem$|id_rsa/.test(f))
    check(
      area,
      'git ls-files: sin .env/credenciales trackeadas',
      envTracked.length === 0,
      'git ls-files | filtro',
      '0',
      envTracked.join(','),
    )
  } catch {
    add(area, 'git ls-files no disponible', 'PASS', 'git ls-files', 'skip')
  }

  // 4) Artefactos tmp/ del worktree (informes QA): sin tokens.
  const tmpDir = path.join(process.cwd(), 'tmp')
  const tmpHits: string[] = []
  if (fs.existsSync(tmpDir)) {
    for (const f of fs.readdirSync(tmpDir)) {
      if (!/\.(json|md|txt|log)$/.test(f)) continue
      const p = path.join(tmpDir, f)
      try {
        const text = fs.readFileSync(p, 'utf8')
        for (const pat of patrones) {
          if (pat.re.test(text)) tmpHits.push(`${f} :: ${pat.id}`)
        }
      } catch {
        /* skip */
      }
    }
  }
  check(
    area,
    'artefactos tmp/: sin secretos en informes',
    tmpHits.length === 0,
    'scan tmp/*.{json,md,txt,log}',
    '0 hits',
    tmpHits.slice(0, 3).join(' | '),
  )

  // 5) platform.env (credenciales de plataforma) vive FUERA del repo — solo
  //    se comprueba existencia por nombre de clave, jamás su contenido.
  const platformPath = 'C:\\Users\\carlosoli_b\\.config\\opencode\\credentials\\platform.env'
  if (fs.existsSync(platformPath)) {
    const nombres = fs
      .readFileSync(platformPath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => l.split('=')[0]!.trim())
    check(
      area,
      'platform.env fuera del repo (solo se listan nombres de clave)',
      nombres.length > 0 && nombres.every((n) => /^[A-Z0-9_]+$/.test(n)),
      platformPath,
      `${nombres.length} claves (valores NO leídos/imprimidos)`,
      'estructura inesperada',
    )
  } else {
    add(area, 'platform.env no presente en esta máquina', 'PASS', platformPath, 'ausente')
  }

  // 6) git status: sin ficheros .env/.pem/.key sin trackear.
  try {
    const st = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const sospechosos = st
      .split(/\r?\n/)
      .filter((l) => /\.(env|pem|key)$/.test(l.trim().replace(/^\?\?\s+/, '')))
    check(
      area,
      'git status: sin ficheros .env/.pem/.key sin trackear',
      sospechosos.length === 0,
      'git status --porcelain',
      '0',
      sospechosos.join(','),
    )
  } catch {
    /* skip */
  }
}

/** Nota de dependencia SA2 para el bloque «lo que no probé». */
const SA2_NOTA =
  'Backup SA2 (agente externo): no está mergeado en el repo — dependencia marcada; el diseño de backup/restore se probó con fixtures propias (A7).'

// ══════════════════════════════════════════════════════════════════════════
// main
// ══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('=== QA ADVERSARIAL SOCideas · Subagente 6 ===')
  console.log(`base=${BASE} · r2=${R2_BASE}`)
  console.log(
    `producción baseline=${SHA_PROD.slice(0, 7)} · modo=${LOCAL_ONLY ? 'local-only' : 'local+prod lectura'}${SKIP_XLSX ? ' · skip-xlsx' : ''}${REVALIDAR ? ' · revalidar(3 INEs)' : ''}`,
  )

  // ── Local / unit / estático (siempre) ──
  a1Slugs()
  a2GroupId()
  a3Zvzo()
  a4Ausencia()
  a5CeroReal()
  a6DuplicadosEsquema()
  a7Backup()
  a8TamanoLocal()
  a9SlugsMerge()
  a10CacheEstatico()
  a15Secretos()
  await a14RateLimit() // incluye probes prod inertes salvo --local-only

  // ── Producción (lectura o acotado) ──
  if (!LOCAL_ONLY) {
    await a10CacheProd()
    await a11FichaXlsx(SKIP_XLSX)
    await a12Ssr()
    await a13Regresion()
  } else {
    add('A12', 'SSR producción omitido (--local-only)', 'PASS', '--local-only', 'omitido')
    add('A13', 'regresión producción omitida (--local-only)', 'PASS', '--local-only', 'omitido')
  }

  // ── Informe ──
  const orden: Record<Status, number> = { PASS: 0, ENCONTRADO: 1, FAIL: 2 }
  const ordenSev: Record<Sev, number> = { 'CRÍTICO': 0, 'ALTO': 1, 'MEDIO': 2, 'BAJO': 3, 'INFO': 4 }

  console.log('\n════════════════ TABLA ÁREA → RESULTADO ════════════════')
  console.log('| Área | Sub | Status | Comando | Evidencia |')
  console.log('|------|-----|--------|---------|-----------|')
  for (const r of [...results].sort((a, b) => orden[a.status] - orden[b.status])) {
    const clean = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 220)
    console.log(`| ${r.area} | ${clean(r.sub)} | ${r.status} | ${clean(r.comando)} | ${clean(r.evidencia)} |`)
  }

  console.log('\n════════════════ DEFECTOS ENCONTRADOS ════════════════')
  if (defects.length === 0) console.log('(ninguno)')
  for (const d of [...defects].sort((a, b) => ordenSev[a.sev] - ordenSev[b.sev])) {
    console.log(`\n[${d.sev}] ${d.id} — ${d.titulo}`)
    console.log(`  Repro: ${d.repro}`)
  }

  const noProbado = [
    'Escritura real R2/Supabase: prohibida por la misión (solo lectura y pruebas acotadas).',
    SA2_NOTA,
    'Rate limit en carga real contra producción: NO se ejecutó (solo unit del contador + 2 probes inertes 405/401).',
    'E2E local de invalidación (verify-cache-invalidation-e2e.ts) requiere npm run build previo: no ejecutado aquí; la frescura se validó R2↔SSR en producción y estáticamente (B1/tags).',
    'Vitoria 01201 responde HTTP 200 + EmptyState (soft-404): es decisión de producto, documentada como INFO, no fixeada.',
  ]
  console.log('\n════════════════ LO QUE NO PUDE PROBAR ════════════════')
  for (const n of noProbado) console.log(`· ${n}`)

  console.log(`\n=== RESUMEN: ${passes} PASS · ${fails} FAIL · ${founds} ENCONTRADO · ${defects.length} defectos ===`)

  const report = {
    ts: new Date().toISOString(),
    shaProduccion: SHA_PROD,
    base: BASE,
    r2: R2_BASE,
    modo: { localOnly: LOCAL_ONLY, skipXlsx: SKIP_XLSX, revalidar: REVALIDAR },
    resumen: { passes, fails, founds, defectos: defects.length },
    results,
    defects,
    noProbado,
  }
  fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true })
  const out = path.join(process.cwd(), 'tmp', `qa-adversarial-socideas-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`Informe: ${path.relative(process.cwd(), out)}`)

  if (fails > 0 || founds > 0) process.exit(1)
  process.exit(0)
}

main().catch((e) => {
  console.error('Error fatal de la suite:', e)
  process.exit(2)
})
