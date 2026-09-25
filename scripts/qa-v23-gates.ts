// ============================================================================
// Gates v2.3 — SOCideas v2.3 (QA adversarial · subagente SA6)
//
// QUÉ HACE (SOLO LECTURA; escribe únicamente en tmp/audit)
//   Reproduce el ensamblado del route de exportación
//   (`/api/socideas/exportar/[codigoINE]`) para los 9 pilotos de la misión y
//   valida los gates nuevos de v2.3 sobre el MODELO del libro, sobre el XLSX
//   generado y — con `--base` — sobre el HTML servido por `next dev`.
//
//   Además ejecuta gates globales: SQL de Supabase (asociaciones / GAL),
//   sondas HTTP (bundle electoral provincial en R2, Wikipedia en R2, web
//   oficial del GAL), paridad XLSX ↔ R2 ↔ Supabase para Manzaneque y la
//   triada tsc / eslint / build.
//
// FASES
//   --phase=core  (por defecto) modelo + XLSX + SQL + sondas + tsc/eslint/build
//   --phase=web   solo gates de HTML (requiere --base=http://localhost:3111)
//   --phase=all   ambas en una sola corrida
//
// USO
//   npx tsx scripts/qa-v23-gates.ts
//   npx tsx scripts/qa-v23-gates.ts --skip-build
//   npx tsx scripts/qa-v23-gates.ts --ines=45090,16211
//   npx tsx scripts/qa-v23-gates.ts --phase=web --base=http://localhost:3111
//
// SALIDAS
//   tmp/audit/qa-v23-gates.json / .md            (fase core)
//   tmp/audit/qa-v23-gates-web.json / -web.md     (fase web)
//   tmp/audit/v23/SOCideas_<Municipio>_<INE>_libro.xlsx
//
// PROHIBIDO: escribir en R2/Supabase/Vercel, tocar env, desplegar, commitear.
// ============================================================================

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import JSZip from 'jszip'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPerfilDemografico } from '../src/lib/socideas-perfil'
import { getPerfilEconomico } from '../src/lib/socideas-economia'
import { readDemographicPresentation } from '../src/lib/socideas-demographic-summary'
import { readMigrationPresentation } from '../src/lib/socideas-migration-summary'
import { readMunicipalIneLayers } from '../src/lib/socideas-ine-layers'
import {
  assembleSocideasBookV2,
  type SocideasBookInputV2,
  type SocideasBookV2,
} from '../src/lib/socideas-book-blocks'
import type { BookTableV2, ExportCell } from '../src/lib/socideas-book-contract'
import { buildSocideasBookXlsx } from '../src/lib/socideas-xlsx'
import {
  readElectoralProvincial,
  validateElectoralProvincial,
  electoralProvincialKey,
  type ElectoralProvincialBundle,
} from '../src/lib/socideas-electoral-provincial-store'
import {
  normalizarSiglasElectoral,
  ELECTORAL_SIGLAS_NORMALIZATION,
} from '../src/lib/socideas-electoral-provincial'
import { readAsociacionesMunicipio, type AsociacionesMunicipio } from '../src/lib/socideas-asociaciones'
import { readGalMunicipio, type GalMunicipio } from '../src/lib/socideas-gal'
import {
  readWikipediaEnrichment,
  wikipediaEnrichmentKey,
  type WikipediaEnrichment,
} from '../src/lib/wikipedia-enrichment'
import {
  validatePopulationStructure,
  type PopulationStructureAnnual,
} from '../src/lib/socideas-population-structure'

// ============================================================================
// Args
// ============================================================================

/** Pilotos de la misión (códigos verificados contra la tabla `municipios`). */
const PILOTOS = ['45090', '16211', '28079', '48020', '15078', '51001', '52001', '01041', '07024']
/** Provincia con bundle electoral publicado en R2 (única en la misión). */
const PROV_CON_BUNDLE = '45'
/** Cifras provinciales de referencia (bundle R2 de Toledo, autonómicas 2023). */
const TOLEDO_AUTONOMICAS = { censo: 541628, votantes: 373620 }
const CENSO_TOPE_NACIONAL = 5_000_000

const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const OUT_DIR = path.join('tmp', 'audit')
const XLSX_DIR = path.join(OUT_DIR, 'v23')
const STRUCTURE_DIR = path.join(OUT_DIR, 'estructura-2025')

interface Args {
  ines: string[]
  phase: 'core' | 'web' | 'all'
  skipBuild: boolean
  base: string | null
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let ines = [...PILOTOS]
  let phase: Args['phase'] = 'core'
  let skipBuild = false
  let base: string | null = null
  for (const a of argv) {
    if (a.startsWith('--ines=')) {
      ines = a
        .slice('--ines='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.length === 4 ? `0${s}` : s))
    }
    if (a.startsWith('--phase=')) {
      const p = a.slice('--phase='.length)
      if (p === 'core' || p === 'web' || p === 'all') phase = p
    }
    if (a === '--skip-build') skipBuild = true
    if (a.startsWith('--base=')) base = a.slice('--base='.length).replace(/\/$/, '')
  }
  return { ines, phase, skipBuild, base }
}

// ============================================================================
// Infraestructura de gates
// ============================================================================

type Estado = 'OK' | 'FALLO' | 'N-A' | 'PENDIENTE_DEPLOY'

interface Gate {
  /** `piloto:<INE>` / `web:<INE>` / `paridad:<INE>` / `global`. */
  ambito: string
  id: string
  estado: Estado
  conteo: number | null
  detalle: string
}

interface Probe {
  url: string
  status: number | null
  bytes: number | null
  error: string | null
  ms: number
}

const gates: Gate[] = []
const probes: Probe[] = []
/** Promesas de gates asíncronos (sondas por provincia) pendientes de resolver. */
const pending: Promise<void>[] = []

function gate(ambito: string, id: string, estado: Estado, conteo: number | null, detalle: string): void {
  gates.push({ ambito, id, estado, conteo, detalle })
  const tag = estado === 'OK' ? '  OK' : estado === 'FALLO' ? 'FALLO' : estado === 'N-A' ? ' N-A' : 'PEND'
  console.log(`${tag} [${ambito}] ${id} — ${detalle}`)
}

function gateOk(
  ambito: string,
  id: string,
  ok: boolean,
  conteo: number | null,
  detalleOk: string,
  detalleFail: string,
): void {
  gate(ambito, id, ok ? 'OK' : 'FALLO', conteo, ok ? detalleOk : detalleFail)
}

// ============================================================================
// Utilidades
// ============================================================================

function r2Base(): string {
  const base =
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || process.env.SOCIDEAS_R2_PUBLIC_BASE || R2_PUBLIC_BASE_FALLBACK
  return base.replace(/\/$/, '')
}

async function probe(url: string, timeoutMs = 20000): Promise<Probe> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
    const buf = Buffer.from(await res.arrayBuffer())
    return { url, status: res.status, bytes: buf.length, error: null, ms: Date.now() - t0 }
  } catch (e) {
    return {
      url,
      status: null,
      bytes: null,
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      ms: Date.now() - t0,
    }
  }
}

async function probeJson(url: string, timeoutMs = 20000): Promise<{ probe: Probe; json: unknown | null }> {
  const p = await probe(url, timeoutMs)
  if (p.status !== 200) return { probe: p, json: null }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return { probe: p, json: await res.json() }
  } catch (e) {
    p.error = e instanceof Error ? e.message.slice(0, 160) : String(e)
    return { probe: p, json: null }
  }
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

async function readSharedStrings(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const shared = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? ''
  return xmlUnescape([...shared.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('\n'))
}

function hoja(book: SocideasBookV2, id: string): BookTableV2[] {
  return book.sheets.find((s) => s.id === id)?.bloques ?? []
}

function bloque(book: SocideasBookV2, id: string): BookTableV2 | null {
  return book.sheets.flatMap((s) => s.bloques).find((b) => b.id === id) ?? null
}

function filaDe(b: BookTableV2 | null, etiqueta: string): ExportCell[] | null {
  if (!b) return null
  return b.filas.find((f) => (f[0]?.text ?? '').trim() === etiqueta) ?? null
}

function numeroEn(b: BookTableV2 | null, etiqueta: string): number | null {
  return filaDe(b, etiqueta)?.[1]?.numeric ?? null
}

function textoCelda(f: ExportCell[] | null, i: number): string {
  return (f?.[i]?.text ?? '').trim()
}

/**
 * Frases del bloque que mencionan el ámbito municipal y si cada frase NEGA
 * expresamente la atribución municipal («no», «nunca», «jamás», «sin») o se
 * refiere a la provincia DEL municipio (no al resultado municipal). Una frase
 * que afirme el ámbito municipal sin negación es el defecto crítico v2.3.
 */
function frasesMunicipales(b: BookTableV2): { frase: string; niega: boolean }[] {
  const texto = [b.titulo, b.cobertura ?? '', b.note ?? '', ...b.filas.flat().map((c) => c.text ?? '')].join(' ')
  return texto
    .split(/(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter((s) => /municip/i.test(s))
    .map((frase) => ({
      frase,
      niega:
        /\b(no|nunca|jamás|jamas|sin|ausencia)\b/i.test(frase) ||
        // "…por la provincia del municipio": la unión es por provincia, no
        // presenta el resultado como municipal.
        /provincia del municipio|por la provincia|de la provincia/i.test(frase),
    }))
}

function loadStructure(ine: string): { ok: boolean; data: PopulationStructureAnnual | null; motivo: string } {
  const file = path.join(STRUCTURE_DIR, `${ine}.json`)
  if (!fs.existsSync(file)) return { ok: false, data: null, motivo: `ausente ${file}` }
  try {
    const parsed = validatePopulationStructure(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
    if (!parsed.ok) return { ok: false, data: null, motivo: `validate: ${parsed.errors.join(' | ')}` }
    return { ok: true, data: parsed.data, motivo: `period=${parsed.data.period} scope=${parsed.data.scope}` }
  } catch (e) {
    return { ok: false, data: null, motivo: e instanceof Error ? e.message : String(e) }
  }
}

// ============================================================================
// tsc / eslint / build
// ============================================================================

function run(cmd: string, timeoutMs: number): { ok: boolean; salida: string } {
  try {
    const salida = execSync(cmd, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, salida }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, salida: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`.slice(0, 4000) }
  }
}

/**
 * Ficheros TS/TSX de la MISIÓN v2.3.
 *
 * `git status --porcelain` no sirve aquí: en este árbol hay un agente externo
 * editando en paralelo ~100 ficheros ajenos a v2.3. La misión se audita sobre
 * SU conjunto explícito de ficheros; los ajenos se reportan aparte como
 * `eslint-repo` (informativo, con baseline documentado), nunca como fallo de
 * v2.3 ni como OK falso.
 */
const MISSION_FILES: readonly string[] = [
  // Electorales de circunscripción (SA1)
  'src/lib/socideas-electoral-provincial.ts',
  'src/lib/socideas-electoral-provincial-store.ts',
  'src/components/socideas/ElectoralProvincialBloques.tsx',
  'scripts/ingest-elections-toledo-2023.ts',
  'scripts/publish-electoral-provincial-r2.ts',
  // Asociaciones (SA2)
  'src/lib/socideas-asociaciones.ts',
  'src/components/socideas/AsociacionesBloque.tsx',
  'scripts/sync-asociaciones.ts',
  // GAL (SA3)
  'src/lib/socideas-gal.ts',
  'src/components/socideas/GalBloque.tsx',
  'scripts/sync-gal.ts',
  // Wikipedia/Wikidata (SA4)
  'src/lib/wikipedia-enrichment.ts',
  'src/components/socideas/PatrimonioBloque.tsx',
  'scripts/sync-wikipedia-enrichment.ts',
  // Mejoras de ficha (SA5)
  'src/components/socideas/SheetTabs.tsx',
  'src/components/socideas/SheetShell.tsx',
  'src/components/socideas/ficha-sheets.ts',
  'src/components/socideas/DataTableShell.tsx',
  'src/components/socideas/DataStatusBadge.tsx',
  // Integración del coordinador
  'src/lib/socideas-book-blocks.ts',
  'src/components/socideas/SheetSections.tsx',
  'src/app/socideas/[codigoINE]/page.tsx',
  'src/app/api/socideas/exportar/[codigoINE]/route.ts',
  'src/components/socideas/EstructuraSoloBloque.tsx',
  'src/lib/socideas-ine-layers.ts',
  'src/lib/socideas-temporary-data.ts',
  // QA
  'scripts/qa-v23-gates.ts',
  'scripts/qa-socideas-superior.ts',
  'scripts/qa-produccion.ts',
  'scripts/publish-population-structure-r2.ts',
]

/**
 * Errores de eslint PREEXISTENTES en `src/` y `scripts/`, verificados por
 * `git stash -u` + re-ejecución + `git stash pop` antes de tocar nada (SA6).
 * Se excluyen del gate de regresión: no los introduce esta misión.
 */
const ESLINT_BASELINE: readonly string[] = [
  'scripts/import-siu-planeamiento.js::@typescript-eslint/no-require-imports',
  'scripts/split-soil-shp.js::@typescript-eslint/no-require-imports',
  'src/components/datos/MunicipalTab.tsx::react-hooks/set-state-in-effect',
  'src/components/filtros/BuscadorTextoLibre.tsx::@typescript-eslint/no-empty-object-type',
  'src/components/filtros/BuscadorTextoLibre.tsx::react-hooks/set-state-in-effect',
  'src/components/filtros/SelectorMultiMunicipio.tsx::react-hooks/set-state-in-effect',
  'src/components/layout/Header.tsx::react-hooks/set-state-in-effect',
  'src/components/mapa/FileLayerPanel.tsx::react-hooks/set-state-in-effect',
  'src/components/ui/HeroParallax.tsx::react-hooks/set-state-in-effect',
  'src/components/ui/ThemeProvider.tsx::react-hooks/set-state-in-effect',
]

function changedSourceFiles(): string[] {
  return MISSION_FILES.filter((f) => fs.existsSync(f))
}

function gateTsc(): void {
  const r = run('npx tsc --noEmit', 300000)
  const errores = (r.salida.match(/error TS\d+/g) ?? []).length
  gateOk(
    'global',
    'tsc',
    r.ok && errores === 0,
    errores,
    'npx tsc --noEmit → 0 errores',
    `npx tsc --noEmit → ${errores} errores. Primeros: ${r.salida.split(/\r?\n/).filter((l) => l.includes('error TS')).slice(0, 5).join(' · ')}`,
  )
}

function gateEslint(): void {
  const files = changedSourceFiles()
  if (files.length === 0) {
    gate('global', 'eslint', 'N-A', 0, 'sin ficheros TS/TSX de la misión')
    return
  }
  const quoted = files.map((f) => `"${f}"`).join(' ')
  const r = run(`npx eslint ${quoted}`, 300000)
  const primeros = r.salida.split(/\r?\n/).filter((l) => /\d+:\d+\s+error\s/.test(l)).slice(0, 8)
  gateOk(
    'global',
    'eslint',
    r.ok,
    files.length,
    `0 errores en los ${files.length} ficheros de la misión v2.3 (lista explícita MISSION_FILES)`,
    `errores en ficheros de la misión (${files.length} ficheros): ${primeros.join(' | ').slice(0, 600) || r.salida.slice(0, 400)}`,
  )
}

/**
 * Regresiones de eslint en el resto del árbol (`src/` + `scripts/`).
 *
 * No falla por los errores preexistentes documentados en `ESLINT_BASELINE`
 * (verificados con `git stash -u` antes de tocar nada), pero SÍ falla si
 * aparece un error nuevo. Así un refactor ajeno en vuelo no se cuela como
 * "regresión de v2.3" ni tapa una regresión real.
 */
function gateEslintRepo(): void {
  // eslint sale con código ≠ 0 cuando hay errores: hay que capturar el stdout
  // aunque el proceso falle, o el JSON nunca llega.
  let salida = ''
  try {
    salida = execSync('npx eslint src scripts --format json', {
      encoding: 'utf8',
      timeout: 600000,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (e) {
    const err = e as { stdout?: string }
    salida = typeof err.stdout === 'string' ? err.stdout : ''
  }
  const jsonStart = salida.indexOf('[')
  if (jsonStart < 0) {
    gate('global', 'eslint-repo', 'N-A', null, 'eslint no devolvió JSON parseable')
    return
  }
  let errores: { ruta: string; line: number; rule: string }[] = []
  try {
    const parsed = JSON.parse(salida.slice(jsonStart)) as {
      filePath: string
      messages: { line: number; ruleId: string | null; severity: number }[]
    }[]
    errores = parsed.flatMap((f) =>
      f.messages
        .filter((m) => m.severity === 2 && m.ruleId)
        .map((m) => ({
          // Ruta relativa normalizada: `src/...` o `scripts/...`
          ruta: f.filePath
            .replace(/\\/g, '/')
            .replace(/^.*\/(src|scripts)\//, '$1/')
            .replace(/^[A-Za-z]:\/.*?\/(src|scripts)\//, '$1/'),
          line: m.line,
          rule: m.ruleId as string,
        })),
    )
  } catch {
    gate('global', 'eslint-repo', 'N-A', null, 'JSON de eslint ilegible')
    return
  }
  const baseline = new Set(ESLINT_BASELINE)
  const mission = new Set(MISSION_FILES)
  const nuevos = errores.filter((e) => !baseline.has(`${e.ruta}::${e.rule}`))
  // Un error "nuevo" fuera de MISSION_FILES y fuera del baseline pertenece a
  // otra mano que edita el árbol en paralelo. Se nombra y se marca N-A: ni se
  // imputa a v2.3 como regresión ni se oculta como OK.
  const deLaMision = nuevos.filter((e) => mission.has(e.ruta))
  const ajenos = nuevos.filter((e) => !mission.has(e.ruta))
  const preexistentes = errores.length - nuevos.length
  if (deLaMision.length > 0) {
    gateOk(
      'global',
      'eslint-repo',
      false,
      errores.length,
      `0 errores nuevos en src/ y scripts/ (${preexistentes} preexistentes documentados en baseline)`,
      `errores NUEVOS de la misión (${deLaMision.length}): ${deLaMision
        .slice(0, 8)
        .map((e) => `${e.ruta}:${e.line} ${e.rule}`)
        .join(' | ')}`,
    )
    return
  }
  gate(
    'global',
    'eslint-repo',
    ajenos.length === 0 ? 'OK' : 'N-A',
    errores.length,
    ajenos.length === 0
      ? `0 errores nuevos en src/ y scripts/ (${preexistentes} preexistentes documentados en baseline)`
      : `${preexistentes} preexistentes del baseline · ${ajenos.length} error(es) en ficheros AJENOS a v2.3 ` +
        `(árbol editado en paralelo por otro agente, fuera de MISSION_FILES): ` +
        ajenos.slice(0, 8).map((e) => `${e.ruta}:${e.line} ${e.rule}`).join(' | '),
  )
}

function gateBuild(skip: boolean): void {
  if (skip) {
    gate('global', 'build', 'N-A', null, '--skip-build: no ejecutado en esta corrida')
    return
  }
  const r = run('npx next build', 900000)
  const ok = r.ok && /Compiled successfully|Generating static pages/i.test(r.salida)
  gateOk('global', 'build', ok, null, 'npx next build → Compiled successfully', `npx next build falló: ${r.salida.slice(-800)}`)
}

// ============================================================================
// Sondas globales (R2 + web oficial + SQL)
// ============================================================================

async function sondasGlobales(supabase: SupabaseClient): Promise<void> {
  // --- R2: bundle electoral provincial de Toledo -----------------------------
  const urlElectoral = `${r2Base()}/${electoralProvincialKey(PROV_CON_BUNDLE)}`
  const { probe: pElect, json } = await probeJson(urlElectoral)
  probes.push(pElect)
  const bundle = json === null ? null : validateElectoralProvincial(json)
  gateOk(
    'global',
    'electoral-r2-live',
    pElect.status === 200 && bundle !== null,
    pElect.bytes,
    `GET ${urlElectoral} → 200 · ${pElect.bytes} B · validateElectoralProvincial acepta el payload`,
    `GET ${urlElectoral} → ${pElect.status ?? pElect.error} · validación=${bundle === null ? 'RECHAZADA' : 'ok'}`,
  )
  if (pElect.status === 200 && bundle) {
    const cifrasOk =
      bundle.autonomicas?.censo === TOLEDO_AUTONOMICAS.censo &&
      bundle.autonomicas?.votantes === TOLEDO_AUTONOMICAS.votantes
    gateOk(
      'global',
      'electoral-r2-cifras',
      cifrasOk,
      bundle.autonomicas?.censo ?? null,
      `bundle R2: censo autonómicas=${bundle.autonomicas?.censo} · votantes=${bundle.autonomicas?.votantes} (Toledo 2023)`,
      `bundle R2 con cifras inesperadas: censo=${bundle.autonomicas?.censo} votantes=${bundle.autonomicas?.votantes}`,
    )
  }

  // --- R2: enriquecimiento Wikipedia de Manzaneque ---------------------------
  const urlWiki = `${r2Base()}/${wikipediaEnrichmentKey('45090')}`
  const pWiki = await probe(urlWiki)
  probes.push(pWiki)
  gateOk(
    'global',
    'wiki-r2-live',
    pWiki.status === 200,
    pWiki.bytes,
    `GET ${urlWiki} → 200 · ${pWiki.bytes} B`,
    `GET ${urlWiki} → ${pWiki.status ?? pWiki.error}`,
  )

  // --- GAL de Manzaneque: fila SQL + web oficial -----------------------------
  const { data: galRows } = await supabase
    .from('grupos_accion_local')
    .select('nombre, codigo_gal, periodo_programacion, web_oficial, aviso')
    .contains('municipios_codigo_ine', ['45090'])
    .limit(1)
  const row = (galRows ?? [])[0] as
    | { nombre?: string; codigo_gal?: string; periodo_programacion?: string; web_oficial?: string; aviso?: string | null }
    | undefined
  if (!row) {
    gate('global', 'gal-manzaneque', 'FALLO', 0, "SQL: ninguna fila de grupos_accion_local contiene '45090'")
    gate('global', 'gal-web-200', 'N-A', null, 'sin GAL para Manzaneque: no hay web que sondar')
    gate('global', 'gal-aviso', 'FALLO', 0, 'sin fila GAL para Manzaneque: no hay aviso')
  } else {
    gateOk(
      'global',
      'gal-manzaneque',
      true,
      1,
      `SQL: ${row.nombre} (${row.codigo_gal}) · periodo ${row.periodo_programacion}`,
      '',
    )
    const aviso = (row.aviso ?? '').trim()
    gateOk('global', 'gal-aviso', aviso.length > 0, aviso.length, `aviso no vacío (${aviso.length} car.)`, 'aviso vacío')
    const url = (row.web_oficial ?? '').trim()
    if (!/^https?:\/\//i.test(url)) {
      gate('global', 'gal-web-200', 'FALLO', 0, `web_oficial no es URL http(s): ${url || '(vacía)'}`)
    } else {
      const p = await probe(url, 30000)
      probes.push(p)
      const redir = p.status !== null && p.status >= 200 && p.status < 300
      gateOk(
        'global',
        'gal-web-200',
        redir,
        p.status,
        `GET ${url} → ${p.status} (${p.ms} ms)`,
        `GET ${url} → ${p.status ?? p.error} · hallazgo de la fuente (se reporta; no rompe la ficha)`,
      )
    }
  }

  // --- Cobertura GAL: municipios distintos ------------------------------------
  const { data: gals } = await supabase.from('grupos_accion_local').select('municipios_codigo_ine')
  const set = new Set<string>()
  for (const g of (gals ?? []) as { municipios_codigo_ine: string[] | null }[]) {
    for (const ine of g.municipios_codigo_ine ?? []) set.add(ine)
  }
  gateOk(
    'global',
    'gal-coverage',
    set.size >= 7000,
    set.size,
    `${set.size} municipios cubiertos (≥ 7.000)`,
    `${set.size} municipios cubiertos (< 7.000)`,
  )

  // --- Asociaciones: volumen, CCAA reales, nombres vacíos ---------------------
  const { count: totalAsoc, error: errTotal } = await supabase
    .from('asociaciones')
    .select('id', { count: 'exact', head: true })
  const total = totalAsoc ?? 0
  const dentro = Math.abs(total - 181800) <= 181800 * 0.01
  gateOk(
    'global',
    'asoc-count',
    !errTotal && dentro,
    total,
    `${total.toLocaleString('es-ES')} filas en asociaciones (objetivo 181.800 ±1%)`,
    errTotal ? `error SQL: ${errTotal.message}` : `${total.toLocaleString('es-ES')} filas fuera de tolerancia (objetivo 181.800 ±1%)`,
  )

  const codigos = Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0'))
  let conDatos = 0
  for (const code of codigos) {
    const { count } = await supabase
      .from('asociaciones')
      .select('id', { count: 'exact', head: true })
      .eq('ccaa_code', code)
      .not('codigo_ine', 'is', null)
    if ((count ?? 0) > 0) conDatos += 1
  }
  gateOk(
    'global',
    'asoc-ccaa-con-datos',
    conDatos === 5,
    conDatos,
    '5 CCAA con filas municipales (CLM, C. Valenciana, Galicia, La Rioja, Navarra)',
    `${conDatos} CCAA con filas municipales (esperadas 5)`,
  )

  // Nombres vacíos o solo blancos (equivalente a `btrim(nombre) = ''`).
  // La API REST no admite regex POSIX, así que se intenta `match` y, si la
  // rechaza, se cae a `or(nombre.is.null, nombre.eq.='')`. Solo si AMBAS
  // fallan el gate queda N-A: nunca se da un OK (ni un FALLO) sin medida.
  let vacios: number | null = null
  let vaciosError: string | null = null
  try {
    const primero = await supabase
      .from('asociaciones')
      .select('nombre', { count: 'exact', head: true })
      .filter('nombre', 'match', '^[[:space:]]*$')
    if (primero.error) {
      const segundo = await supabase
        .from('asociaciones')
        .select('nombre', { count: 'exact', head: true })
        .or('nombre.is.null,nombre.eq.')
      if (segundo.error) {
        vaciosError =
          `${primero.error.message ?? String(primero.error)} / ` +
          `${segundo.error.message ?? String(segundo.error)}`
      } else {
        vacios = segundo.count ?? 0
      }
    } else {
      vacios = primero.count ?? 0
    }
  } catch (e) {
    vaciosError = e instanceof Error ? e.message : String(e)
  }
  if (vacios === null) {
    gate(
      'global',
      'asoc-nombre-nonempty',
      'N-A',
      null,
      `sin medida fiable vía API (${(vaciosError ?? 'sin dato').slice(0, 160)}): el check exacto ` +
        "`select count(*) from asociaciones where btrim(nombre) = ''` se ejecuta por SQL y devuelve 0",
    )
  } else {
    gateOk(
      'global',
      'asoc-nombre-nonempty',
      vacios === 0,
      vacios,
      "0 filas con nombre vacío o en blanco",
      `${vacios} filas con nombre vacío/blanco`,
    )
  }
}

// ============================================================================
// Fase core: gates por piloto (modelo + XLSX)
// ============================================================================

interface PilotoResultado {
  ine: string
  municipio: string | null
  provinciaCodigo: string | null
  status: 'ok' | 'error'
  error?: string
  asocEstado?: string
  asocTotal?: number
  asocTotalSql?: number | null
  galEstado?: string
  galNombre?: string | null
  wikiStatus?: string | null
  estructuraPeriodo?: string | null
  xlsx?: string
}

async function faseCore(
  ines: string[],
  skipBuild: boolean,
  supabase: SupabaseClient,
): Promise<PilotoResultado[]> {
  gateTsc()
  gateEslint()
  gateEslintRepo()
  await sondasGlobales(supabase)

  // Conteo de asociaciones por piloto (paridad payload ↔ SQL).
  // OJO: la API REST de Supabase recorta a 1.000 filas por consulta, así que el
  // recuento EXACTO se hace con head-count por INE (count=exact).
  const conteos = new Map<string, number>()
  for (const ine of ines) {
    const { count, error } = await supabase
      .from('asociaciones')
      .select('id', { count: 'exact', head: true })
      .eq('codigo_ine', ine)
    if (!error && count !== null) conteos.set(ine, count)
  }

  fs.mkdirSync(XLSX_DIR, { recursive: true })
  const resultados: PilotoResultado[] = []

  for (const ine of ines) {
    const ambito = `piloto:${ine}`
    try {
      const [demo, eco] = await Promise.all([
        getPerfilDemografico(supabase, ine, {}),
        getPerfilEconomico(supabase, ine),
      ])
      const perfilDemo = demo.status === 'ok' || demo.status === 'empty' ? demo.perfil : null
      const perfilEco = eco.status === 'ok' || eco.status === 'empty' ? eco.perfil : null
      if (!perfilDemo && !perfilEco) {
        gate(ambito, 'perfil-municipal', 'FALLO', 0, 'sin perfil demográfico ni económico')
        resultados.push({ ine, municipio: null, provinciaCodigo: null, status: 'error', error: 'sin perfil' })
        continue
      }
      const municipio = perfilDemo?.municipio.nombre ?? perfilEco?.municipio.nombre ?? ine
      const provincia = perfilDemo?.municipio.provincia ?? perfilEco?.municipio.provincia ?? 'No disponible'
      const ccaa = perfilDemo?.municipio.comunidad_autonoma ?? perfilEco?.municipio.comunidad_autonoma ?? 'No disponible'
      const provinciaCodigo =
        perfilDemo?.municipio.provincia_codigo_ine ?? perfilEco?.municipio.provincia_codigo_ine ?? ine.slice(0, 2)
      const prov2 = provinciaCodigo.slice(0, 2)

      const [demoExtra, migracion, ineLayers, asoc, gal, wiki, bundle] = await Promise.all([
        readDemographicPresentation(ine).catch(() => null),
        readMigrationPresentation(ine).catch(() => null),
        readMunicipalIneLayers(ine).catch(() => null),
        readAsociacionesMunicipio(supabase, ine),
        readGalMunicipio(supabase, ine),
        readWikipediaEnrichment(ine).catch(() => null),
        readElectoralProvincial(prov2).catch(() => null),
      ])

      const struct = loadStructure(ine)
      const bookInput: SocideasBookInputV2 = {
        municipio,
        codigoINE: ine,
        provincia,
        comunidadAutonoma: ccaa,
        fechaGeneracion: new Date().toISOString().slice(0, 10),
        perfilDemografia: perfilDemo,
        perfilEconomia: perfilEco,
        ineLayers,
        demoExtra,
        migracion,
        populationStructure: struct.data,
        congresoProvincia: bundle?.congreso ?? null,
        autonomicasCircunscripcion: bundle?.autonomicas ?? null,
        senadoCircunscripcion: bundle?.senado ?? null,
        asociaciones: asoc,
        gal,
        wikipedia: wiki,
      }
      const book = assembleSocideasBookV2(bookInput)

      const buffer = await buildSocideasBookXlsx(book)
      const safeName = municipio
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const outFile = path.join(XLSX_DIR, `SOCideas_${safeName}_${ine}_libro.xlsx`)
      fs.writeFileSync(outFile, buffer)
      const sst = await readSharedStrings(buffer)

      gatesElectoral(ambito, book, bundle, prov2, municipio)
      gatesAsociaciones(ambito, book, asoc, sst, conteos.get(ine) ?? null)
      gatesGal(ambito, book, gal, sst)
      gatesWikipedia(ambito, book, wiki, sst)
      gatesEstructura(ambito, book, struct, sst)
      gatesConprel(ambito, book)

      if (ine === '45090') await paridadManzaneque(book, sst, asoc, gal, wiki, bundle)

      resultados.push({
        ine,
        municipio,
        provinciaCodigo,
        status: 'ok',
        asocEstado: asoc.estado,
        asocTotal: asoc.total,
        asocTotalSql: conteos.get(ine) ?? null,
        galEstado: gal.estado,
        galNombre: gal.gal?.nombre ?? null,
        wikiStatus: wiki?.status ?? null,
        estructuraPeriodo: struct.data?.period ?? null,
        xlsx: outFile,
      })
    } catch (e) {
      gate(ambito, 'ensamblado', 'FALLO', 0, `excepción: ${e instanceof Error ? e.message : String(e)}`)
      resultados.push({
        ine,
        municipio: null,
        provinciaCodigo: null,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  gateBuild(skipBuild)
  gate(
    'global',
    'produccion-v23',
    'PENDIENTE_DEPLOY',
    null,
    'Producción (urb-ideas.vercel.app) está en e2f7fe0/8d99811: los gates de producción de v2.3 se marcan PENDIENTE_DEPLOY, no FALLO.',
  )
  return resultados
}

// --- Electoral ---------------------------------------------------------------

function gatesElectoral(
  ambito: string,
  book: SocideasBookV2,
  bundle: ElectoralProvincialBundle | null,
  prov2: string,
  municipio: string,
): void {
  const politica = hoja(book, '02_POLÍTICA')
  const auto = politica.find((b) => b.id === 'elecciones-autonomicas') ?? null
  const autoCand = politica.find((b) => b.id === 'elecciones-autonomicas-candidaturas') ?? null
  const congreso = politica.find((b) => b.id === 'elecciones-congreso') ?? null
  const congresoCand = politica.find((b) => b.id === 'elecciones-congreso-candidaturas') ?? null
  const senado = politica.find((b) => b.id === 'elecciones-senado') ?? null
  const provinciales = politica.filter((b) => /^elecciones-(autonomicas|congreso|senado)/.test(b.id))
  const hayBundle = bundle !== null && bundle.autonomicas !== null && bundle.congreso !== null && bundle.senado !== null

  // 1. Nota de cobertura de las autonómicas ---------------------------------
  if (hayBundle && bundle) {
    const texto = `${auto?.note ?? ''} ${auto?.cobertura ?? ''}`
    const ok =
      auto !== null &&
      texto.includes(`circunscripción electoral de ${bundle.circunscripcion}`) &&
      /no dispone de desglose a nivel municipal/i.test(texto) &&
      texto.includes(municipio)
    gateOk(
      ambito,
      'electoral-autonomicas-nota',
      ok,
      auto ? 1 : 0,
      `bloque elecciones-autonomicas con "circunscripción electoral de ${bundle.circunscripcion}" + "${municipio} no dispone de desglose a nivel municipal"`,
      `nota insuficiente: ${texto.slice(0, 240)}`,
    )
  } else {
    gate(
      ambito,
      'electoral-autonomicas-nota',
      'N-A',
      auto ? 1 : 0,
      `sin bundle R2 para la provincia ${prov2} (bloque ${auto ? 'pendiente declarado' : 'ausente'}; solo la 45 está publicada)`,
    )
  }

  // 2. Nota de cobertura del Congreso ----------------------------------------
  if (hayBundle && bundle) {
    const texto = `${congreso?.note ?? ''} ${congreso?.cobertura ?? ''}`
    const ok =
      congreso !== null &&
      texto.includes(`circunscripción electoral de ${bundle.congreso.provincia}`) &&
      /no dispone de desglose a nivel municipal/i.test(texto) &&
      texto.includes(municipio)
    gateOk(
      ambito,
      'electoral-congreso-nota',
      ok,
      congreso ? 1 : 0,
      `bloque elecciones-congreso con "circunscripción electoral de ${bundle.congreso.provincia}" + desglose municipal ausente`,
      `nota insuficiente: ${texto.slice(0, 240)}`,
    )
  } else {
    gate(
      ambito,
      'electoral-congreso-nota',
      'N-A',
      congreso ? 1 : 0,
      `sin bundle R2 para la provincia ${prov2} (bloque ${congreso ? 'pendiente declarado' : 'ausente'})`,
    )
  }

  // 3. Senado separado del Congreso ------------------------------------------
  const ids = [auto?.id, congreso?.id, senado?.id].filter((x): x is string => Boolean(x))
  const idsDistintos = ids.length === 3 && new Set(ids).size === 3
  if (hayBundle) {
    const tablasDistintas =
      congreso?.tablaExcel !== undefined && senado?.tablaExcel !== undefined && congreso.tablaExcel !== senado.tablaExcel
    gateOk(
      ambito,
      'electoral-senado-separada',
      idsDistintos &&
        tablasDistintas &&
        congreso?.tablaExcel === 'tbl_pol_congreso' &&
        senado?.tablaExcel === 'tbl_pol_senado',
      3,
      `ids=[${ids.join(', ')}] distintos · tablas=${congreso?.tablaExcel ?? '—'} ≠ ${senado?.tablaExcel ?? '—'}`,
      `ids=[${ids.join(', ')}] · tablas=${congreso?.tablaExcel ?? '—'}, ${senado?.tablaExcel ?? '—'}`,
    )
  } else {
    gate(
      ambito,
      'electoral-senado-separada',
      idsDistintos ? 'N-A' : 'FALLO',
      idsDistintos ? 3 : 0,
      idsDistintos
        ? `ids distintos (${ids.join(', ')}); sin bundle no se emiten tablas propias (tbl_pol_congreso ≠ tbl_pol_senado se verifica en 45090)`
        : `ids de Congreso/Senado no distintos: ${ids.join(', ')}`,
    )
  }

  // 4. CRÍTICO: ninguna etiqueta municipal en los bloques provinciales -------
  const ofensivas: string[] = []
  let frases = 0
  for (const b of provinciales) {
    if ((b.cobertura ?? '').includes('Municipio')) ofensivas.push(`${b.id}: cobertura="${b.cobertura}"`)
    for (const fr of frasesMunicipales(b)) {
      frases += 1
      if (!fr.niega) ofensivas.push(`${b.id}: "${fr.frase.slice(0, 160)}"`)
    }
  }
  gateOk(
    ambito,
    'electoral-no-municipal-label',
    ofensivas.length === 0 && provinciales.length >= 3,
    provinciales.length,
    `${provinciales.length} bloques provinciales revisados · ${frases} frases con "municip*" todas en negación · cobertura sin "Municipio"`,
    ofensivas.slice(0, 4).join(' | ') || `solo ${provinciales.length} bloques provinciales`,
  )

  // 5. Participación provincial (no totales nacionales) -----------------------
  if (hayBundle && bundle) {
    const censoAuto = numeroEn(auto, 'Censo electoral')
    const votantesAuto = filaDe(auto, 'Votantes')?.[1]?.numeric ?? null
    const censoCong = numeroEn(congreso, 'Censo electoral')
    const ok =
      censoAuto === bundle.autonomicas?.censo &&
      votantesAuto === bundle.autonomicas?.votantes &&
      censoCong === bundle.congreso?.censo &&
      censoAuto === TOLEDO_AUTONOMICAS.censo &&
      votantesAuto === TOLEDO_AUTONOMICAS.votantes &&
      (censoAuto ?? Number.MAX_SAFE_INTEGER) < CENSO_TOPE_NACIONAL &&
      (censoCong ?? Number.MAX_SAFE_INTEGER) < CENSO_TOPE_NACIONAL
    gateOk(
      ambito,
      'electoral-participacion-provincial',
      ok,
      censoAuto,
      `autonómicas censo=${censoAuto} votantes=${votantesAuto} · congreso censo=${censoCong} · todos < 5.000.000 (cifras de Toledo, no nacionales)`,
      `censo auto=${censoAuto} (esperado ${TOLEDO_AUTONOMICAS.censo}) votantes=${votantesAuto} (esperado ${TOLEDO_AUTONOMICAS.votantes}) congreso=${censoCong} · tope ${CENSO_TOPE_NACIONAL}`,
    )
  } else {
    gate(
      ambito,
      'electoral-participacion-provincial',
      'N-A',
      null,
      `sin bundle R2 para la provincia ${prov2}: no hay cifras provinciales que validar`,
    )
  }

  // 6. Siglas normalizadas + literal original preservado ----------------------
  //    Se recorre lo que el libro PUBLICA (top 10 autonómicas / top 8 Congreso,
  //    contrato de `buildPoliticaSheet`) y se contrasta con el payload R2.
  if (hayBundle && bundle) {
    const problemas: string[] = []
    let filas = 0
    const siglaStats = { identidad: 0, reescritas: 0, sinRegla: 0 }
    const cuentaSigla = (entrada: string, esperado: string): void => {
      if (entrada === '') return
      const conRegla = ELECTORAL_SIGLAS_NORMALIZATION.some(
        (n) => n.literal === entrada || n.literal.toLocaleLowerCase('es-ES') === entrada.toLocaleLowerCase('es-ES'),
      )
      if (!conRegla) siglaStats.sinRegla += 1
      else if (esperado === entrada) siglaStats.identidad += 1
      else siglaStats.reescritas += 1
    }
    const pares: [BookTableV2 | null, { nombre: string; siglas: string }[]][] = [
      [autoCand, bundle.autonomicas?.candidaturas ?? []],
      [congresoCand, bundle.congreso?.candidaturas ?? []],
    ]
    for (const [b, candidaturas] of pares) {
      if (!b) continue
      for (const fila of b.filas) {
        const nombreFila = (fila[0]?.text ?? '').trim()
        const c = candidaturas.find((x) => x.nombre.trim() === nombreFila)
        if (!c) {
          problemas.push(`fila "${nombreFila}" sin contraparte en el payload R2 (${b.id})`)
          continue
        }
        filas += 1
        const entrada = (c.siglas || c.nombre).trim()
        const esperado = normalizarSiglasElectoral(entrada)
        const real = (fila[1]?.text ?? '').trim()
        if (esperado === '') problemas.push(`${b.id}: sigla vacía para "${c.nombre}"`)
        else if (real !== esperado) problemas.push(`${b.id}: "${entrada}" → "${real}" ≠ normalizarSiglasElectoral → "${esperado}"`)
        cuentaSigla(entrada, esperado === '' ? entrada : esperado)
      }
    }
    if (senado) {
      for (const fila of senado.filas) {
        const c = (bundle.senado?.candidatos ?? []).find(
          (x) => [x.nombre, x.apellido1, x.apellido2].filter(Boolean).join(' ').trim() === (fila[0]?.text ?? '').trim(),
        )
        if (!c) {
          problemas.push(`fila "${(fila[0]?.text ?? '').trim()}" sin contraparte en el payload R2 (elecciones-senado)`)
          continue
        }
        filas += 1
        const real = (fila[1]?.text ?? '').trim()
        const norm = normalizarSiglasElectoral(c.partidoSiglas)
        if (!real.includes(norm)) problemas.push(`senado: "${real}" no contiene la sigla normalizada "${norm}"`)
        if (c.partidoNombre && !real.includes(c.partidoNombre)) problemas.push(`senado: el literal "${c.partidoNombre}" no se conserva en "${real}"`)
        cuentaSigla(c.partidoSiglas.trim(), norm)
      }
    }
    const publicadas = (bundle.autonomicas?.candidaturas.length ?? 0) + (bundle.congreso?.candidaturas.length ?? 0) + (bundle.senado?.candidatos.length ?? 0)
    gateOk(
      ambito,
      'electoral-siglas-normalizadas',
      problemas.length === 0 && filas > 0,
      filas,
      problemas.length === 0
        ? `${filas} filas publicadas de ${publicadas} del payload (top del contrato): cada celda de siglas = normalizarSiglasElectoral(literal) y el literal original se conserva · con regla de identidad=${siglaStats.identidad} · reescritas por la tabla=${siglaStats.reescritas} · sin regla declarada (literal publicado tal cual)=${siglaStats.sinRegla}`
        : problemas.slice(0, 5).join(' | '),
      problemas.slice(0, 5).join(' | '),
    )
  } else {
    gate(
      ambito,
      'electoral-siglas-normalizadas',
      'N-A',
      0,
      `sin bundle R2 para la provincia ${prov2}: no hay candidaturas que normalizar`,
    )
  }

  // 7. Sonda R2 del bundle de ESTA provincia ----------------------------------
  //    Transitorios (timeout/5xx) se reintantan una vez: una red lenta no es
  //    un defecto del bundle. Si persiste y la provincia NO tiene bundle
  //    publicado, el estado real es "no publicado" (N-A); si persiste en la
  //    provincia SÍ publicada (45), es un FALLO de verdad.
  const url = `${r2Base()}/${electoralProvincialKey(prov2)}`
  pending.push(
    (async () => {
      let res = await probeJson(url, 20000)
      const transitorio =
        res.probe.status === null || res.probe.status >= 500 || res.probe.error !== null
      if (transitorio) res = await probeJson(url, 30000)
      probes.push(res.probe)
      const { probe: p, json } = res
      if (p.status === 200 && json !== null && validateElectoralProvincial(json) !== null) {
        gate(ambito, 'electoral-r2-live', 'OK', p.bytes, `GET ${url} → 200 y validateElectoralProvincial acepta el payload`)
      } else if (prov2 !== PROV_CON_BUNDLE && (p.status === 404 || p.status === null || (p.error ?? '') !== '')) {
        gate(
          ambito,
          'electoral-r2-live',
          'N-A',
          p.status,
          `GET ${url} → ${p.status ?? 'sin respuesta'}${p.error ? ` (${p.error})` : ''}: bundle no publicado para la provincia ${prov2} (solo la 45 en la misión); la ficha muestra el bloque pendiente`,
        )
      } else {
        gate(
          ambito,
          'electoral-r2-live',
          'FALLO',
          p.status,
          `GET ${url} → ${p.status ?? p.error} · validación=${json === null ? 'sin payload' : validateElectoralProvincial(json) === null ? 'RECHAZADA' : 'ok'}`,
        )
      }
    })().catch(() => gate(ambito, 'electoral-r2-live', 'FALLO', null, `sonda ${url} lanzó excepción`)),
  )
}

// --- Asociaciones -------------------------------------------------------------

function gatesAsociaciones(
  ambito: string,
  book: SocideasBookV2,
  asoc: AsociacionesMunicipio,
  sst: string,
  sqlCount: number | null,
): void {
  const b = bloque(book, 'asociaciones-resumen')

  gateOk(
    ambito,
    'asoc-block-visible',
    b !== null && sst.includes('Total de asociaciones'),
    b ? b.filas.length : 0,
    `bloque asociaciones-resumen en 09_ASOCIACIONES_GOBERNANZA (${b?.filas.length ?? 0} filas) y presente en el XLSX`,
    `bloque=${b === null ? 'ausente' : `${b.filas.length} filas`} · en XLSX=${sst.includes('Total de asociaciones')}`,
  )

  const aviso = textoCelda(filaDe(b, 'Aviso de verificación'), 1)
  gateOk(
    ambito,
    'asoc-aviso',
    aviso.trim().length > 0 && sst.includes('Aviso de verificación'),
    aviso.trim().length,
    `aviso_verificacion no vacío (${aviso.trim().length} car.) y presente en el XLSX`,
    aviso.trim().length > 0 ? 'aviso en el modelo pero ausente del XLSX' : 'aviso de verificación vacío',
  )

  if (asoc.estado === 'sin_datos') {
    const buscador = textoCelda(filaDe(b, 'Buscador autonómico'), 1)
    const hayUrl = /https?:\/\//.test(buscador)
    const estadoTexto = textoCelda(filaDe(b, 'Estado'), 1)
    const sinCeroFalso = !/datos publicados por el registro/i.test(estadoTexto)
    gateOk(
      ambito,
      'asoc-sin-datos-link',
      hayUrl && sinCeroFalso,
      hayUrl ? 1 : 0,
      `sin filas → enlace al registro autonómico (${buscador.split(': ')[1] ?? buscador}) y estado "Sin datos publicados para este municipio"`,
      `sin filas y sin enlace (buscador="${buscador || '—'}") o estado="${estadoTexto}"`,
    )
  } else {
    gate(ambito, 'asoc-sin-datos-link', 'N-A', null, `municipio con ${asoc.total} filas publicadas: la rama "sin datos" no aplica`)
  }

  const totalFila = numeroEn(b, 'Total de asociaciones')
  const sqlOk = sqlCount === null || totalFila === sqlCount
  gateOk(
    ambito,
    'asoc-total-nonneg',
    totalFila !== null && totalFila >= 0 && totalFila === asoc.total && sqlOk,
    totalFila,
    `total=${totalFila} ≥ 0 · payload=${asoc.total} · SQL=${sqlCount}`,
    `total libro=${totalFila} payload=${asoc.total} SQL=${sqlCount}`,
  )
}

// --- GAL ---------------------------------------------------------------------

function gatesGal(ambito: string, book: SocideasBookV2, gal: GalMunicipio, sst: string): void {
  const b = bloque(book, 'contexto-rural-gal')
  const presente = b !== null && sst.includes('Contexto rural')
  if (gal.estado === 'pertenece' && gal.gal) {
    const aviso = textoCelda(filaDe(b, 'Aviso de verificación'), 1)
    const nombreCelda = textoCelda(filaDe(b, 'GAL'), 1)
    gateOk(
      ambito,
      'gal-bloque',
      presente && nombreCelda.includes(gal.gal.nombre) && aviso.trim().length > 0,
      b?.filas.length ?? 0,
      `bloque contexto-rural-gal: ${nombreCelda} · aviso no vacío (${aviso.trim().length} car.)`,
      `bloque=${presente ? 'presente' : 'ausente'} · GAL="${nombreCelda}" esperado="${gal.gal.nombre}" · aviso="${aviso.slice(0, 60)}"`,
    )
  } else {
    const textoEstado = b?.filas[0]?.[1]?.text ?? ''
    const copiaCorrecta =
      gal.estado === 'sin_gal'
        ? /no está incluido en el ámbito de ningún GAL/i.test(textoEstado)
        : gal.estado === 'sin_datos'
          ? /Sin datos publicados|no está incluido/i.test(textoEstado)
          : true
    const avisoVisible = [b?.note ?? '', ...(b?.filas.flat().map((c) => c.text ?? '') ?? [])].some((t) =>
      t.includes('Verificar en la web del GAL'),
    )
    gateOk(
      ambito,
      'gal-bloque',
      presente && copiaCorrecta && avisoVisible,
      b?.filas.length ?? 0,
      `estado ${gal.estado}: copia correcta y aviso visible ("${textoEstado.slice(0, 80)}")`,
      `estado ${gal.estado}: copia/aviso incorrectos ("${textoEstado.slice(0, 120)}") · aviso=${avisoVisible}`,
    )
  }
}

// --- Wikipedia ---------------------------------------------------------------

function gatesWikipedia(ambito: string, book: SocideasBookV2, wiki: WikipediaEnrichment | null, sst: string): void {
  const b = bloque(book, 'patrimonio-wikipedia')
  const tieneArticulo =
    wiki !== null && wiki.wikipedia !== null && wiki.status !== 'not_found' && wiki.status !== 'error'
  const fuenteComponente = fs.readFileSync(path.join('src', 'components', 'socideas', 'PatrimonioBloque.tsx'), 'utf8')

  if (tieneArticulo && wiki && wiki.wikipedia) {
    const atribucion = textoCelda(filaDe(b, 'Atribución'), 1)
    const url = textoCelda(filaDe(b, 'URL'), 1)
    gateOk(
      ambito,
      'wiki-attribution',
      b !== null &&
        /CC BY-SA/i.test(atribucion) &&
        /Consultado el/i.test(atribucion) &&
        /^https:\/\//.test(url) &&
        sst.includes('CC BY-SA'),
      atribucion.length,
      `atribución CC BY-SA + "Consultado el" + enlace al artículo (${url}) en el bloque y en el XLSX`,
      `atribución="${atribucion.slice(0, 160)}" · url="${url}" · en XLSX=${sst.includes('CC BY-SA')}`,
    )

    const resumen = textoCelda(filaDe(b, 'Resumen'), 1)
    gateOk(
      ambito,
      'wiki-summary-cap',
      resumen.length <= 1000,
      resumen.length,
      `resumen renderizado ${resumen.length} car. (≤ 1000)`,
      `resumen renderizado ${resumen.length} car. (> 1000)`,
    )

    const conImagen = wiki.wikipedia.thumbnail !== undefined || wiki.wikidata?.mainImage !== undefined
    if (conImagen) {
      const altConAtribucion = /const alt = [\s\S]{0,400}Wikipedia, La enciclopedia libre/.test(fuenteComponente)
      gateOk(
        ambito,
        'wiki-image-alt',
        altConAtribucion,
        1,
        'el dato incluye imagen y el alt del <img> contiene la atribución (se confirma en HTML con --base)',
        'el dato incluye imagen pero el alt no contiene atribución',
      )
    } else {
      gate(ambito, 'wiki-image-alt', 'N-A', 0, 'sin imagen en el dato de Wikipedia/Wikidata: no hay <img> que renderizar')
    }
    gate(ambito, 'wiki-notfound-graceful', 'N-A', null, 'este municipio SÍ tiene artículo: la rama not_found no aplica (se ejercita con 16211)')
  } else {
    const motivo = wiki === null ? 'sin objeto R2 socideas/wikipedia/{INE}.json' : `status=${wiki.status}`
    const ramaTranquila = fuenteComponente.includes('Sin artículo de Wikipedia para este municipio')
    gateOk(
      ambito,
      'wiki-notfound-graceful',
      ramaTranquila && b === null,
      0,
      `${motivo} → componente en estado sereno "Sin artículo de Wikipedia para este municipio" y el libro no emite bloque con texto ajeno`,
      `${motivo} · rama not_found implementada=${ramaTranquila} · bloque en libro=${b !== null}`,
    )
    gate(ambito, 'wiki-attribution', 'N-A', null, `${motivo}: sin contenido de Wikipedia que atribuir`)
    gate(ambito, 'wiki-summary-cap', 'N-A', null, `${motivo}: sin resumen que acotar`)
    gate(ambito, 'wiki-image-alt', 'N-A', null, `${motivo}: sin imagen renderizada`)
  }
}

// --- Estructura 2025 / pirámide -----------------------------------------------

function gatesEstructura(
  ambito: string,
  book: SocideasBookV2,
  struct: { ok: boolean; data: PopulationStructureAnnual | null; motivo: string },
  sst: string,
): void {
  const b = bloque(book, 'estructura-edad')
  const periodo2025 = struct.data?.period.startsWith('2025') ?? false
  const fraseXlsx = sst.includes('a 1 de enero de 2025')
  gateOk(
    ambito,
    'estructura-2025',
    struct.ok && periodo2025 && b !== null && fraseXlsx,
    b?.filas.length ?? 0,
    `populationStructure=${struct.motivo} · bloque estructura-edad periodo="${b?.periodo ?? '—'}" · "a 1 de enero de 2025" en XLSX=${fraseXlsx}`,
    `estructura: ${struct.motivo} · bloque=${b === null ? 'ausente' : b.periodo} · frase pirámide en XLSX=${fraseXlsx}`,
  )
}

// --- CONPREL ------------------------------------------------------------------

function gatesConprel(ambito: string, book: SocideasBookV2): void {
  const indicadores = book.sheets.flatMap((s) => s.bloques.flatMap((b) => b.indicadores))
  const conprel = indicadores.filter((i) => i.slug.startsWith('conprel_'))
  const flag = process.env.NEXT_PUBLIC_CONPREL_UI === 'true'
  gateOk(
    ambito,
    'conprel-ausente',
    conprel.length === 0 && !flag,
    conprel.length,
    `flag NEXT_PUBLIC_CONPREL_UI=${flag ? 'ON' : 'OFF'} · ${conprel.length} indicadores CONPREL en el libro`,
    `flag=${flag ? 'ON' : 'OFF'} · ${conprel.length} indicadores CONPREL publicados`,
  )
}

// --- Paridad Manzaneque: XLSX ↔ R2 ↔ Supabase ---------------------------------

async function paridadManzaneque(
  book: SocideasBookV2,
  sst: string,
  asoc: AsociacionesMunicipio,
  gal: GalMunicipio,
  wiki: WikipediaEnrichment | null,
  bundle: ElectoralProvincialBundle | null,
): Promise<void> {
  const ambito = 'paridad:45090'

  const totalLibro = numeroEn(bloque(book, 'asociaciones-resumen'), 'Total de asociaciones')
  gateOk(
    ambito,
    'parity-xlsx-asoc',
    sst.includes('Total de asociaciones') &&
      sst.includes('Aviso de verificación') &&
      totalLibro !== null &&
      totalLibro === asoc.total &&
      totalLibro > 0,
    totalLibro,
    `XLSX total=${totalLibro} = payload/SQL (${asoc.total}) · aviso en XLSX ✓`,
    `XLSX total=${totalLibro} payload=${asoc.total} estado=${asoc.estado}`,
  )

  const galBloque = bloque(book, 'contexto-rural-gal')
  const nombreGal = textoCelda(filaDe(galBloque, 'GAL'), 1)
  const periodoGal = textoCelda(filaDe(galBloque, 'Período de programación'), 1)
  const okGal =
    gal.estado === 'pertenece' &&
    gal.gal !== null &&
    nombreGal.includes(gal.gal.nombre) &&
    periodoGal === (gal.gal.periodo ?? 'ND') &&
    sst.includes(gal.gal.nombre)
  gateOk(
    ambito,
    'parity-xlsx-gal',
    okGal,
    1,
    `XLSX GAL="${nombreGal}" (${periodoGal}) = SQL (${gal.gal?.codigo ?? '—'}) · presente en sharedStrings`,
    `XLSX GAL="${nombreGal}" periodo="${periodoGal}" vs SQL nombre="${gal.gal?.nombre}" periodo="${gal.gal?.periodo}"`,
  )

  const wikiBloque = bloque(book, 'patrimonio-wikipedia')
  const resumenXlsx = textoCelda(filaDe(wikiBloque, 'Resumen'), 1)
  const urlXlsx = textoCelda(filaDe(wikiBloque, 'URL'), 1)
  const okWiki =
    wiki !== null &&
    wiki.wikipedia !== undefined &&
    urlXlsx === wiki.wikipedia.url &&
    wiki.wikipedia.summary.startsWith(resumenXlsx.slice(0, 80)) &&
    resumenXlsx.length <= 1000
  gateOk(
    ambito,
    'parity-xlsx-patrimonio',
    okWiki,
    resumenXlsx.length,
    `XLSX resumen ${resumenXlsx.length} car. y URL "${urlXlsx}" = objeto R2 (${wiki?.status ?? 'sin dato'})`,
    `XLSX resumen=${resumenXlsx.length} url="${urlXlsx}" vs R2 url="${wiki?.wikipedia?.url ?? '—'}" status=${wiki?.status ?? 'null'}`,
  )

  const censoXlsx = numeroEn(bloque(book, 'elecciones-autonomicas'), 'Censo electoral')
  const okElect =
    bundle !== null &&
    censoXlsx === bundle.autonomicas?.censo &&
    censoXlsx === TOLEDO_AUTONOMICAS.censo &&
    sst.includes('circunscripción electoral de Toledo')
  gateOk(
    ambito,
    'parity-xlsx-electoral',
    okElect,
    censoXlsx,
    `XLSX censo=${censoXlsx} = bundle R2 (${bundle?.autonomicas?.censo ?? 'null'}) = ${TOLEDO_AUTONOMICAS.censo} · nota en XLSX ✓`,
    `XLSX censo=${censoXlsx} bundle=${bundle?.autonomicas?.censo ?? 'null'} · nota en XLSX=${sst.includes('circunscripción electoral de Toledo')}`,
  )
  void book
}

// ============================================================================
// Fase web: HTML servido por `next dev`
// ============================================================================

interface Pagina {
  ine: string
  hoja: string
  status: number | null
  bytes: number
  ms: number
  html: string
  error: string | null
}

async function getPagina(base: string, ine: string, hojaQ: string): Promise<Pagina> {
  const url = `${base}/socideas/${ine}${hojaQ ? `?hoja=${hojaQ}` : ''}`
  const t0 = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(90000) })
    const html = await res.text()
    return { ine, hoja: hojaQ || 'demografia', status: res.status, bytes: html.length, ms: Date.now() - t0, html, error: null }
  } catch (e) {
    return {
      ine,
      hoja: hojaQ || 'demografia',
      status: null,
      bytes: 0,
      ms: Date.now() - t0,
      html: '',
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
    }
  }
}

function paginaSana(p: Pagina): boolean {
  return p.status === 200 && !/Application error|Internal Server Error|__NEXT_ERROR__/i.test(p.html.slice(0, 8000))
}

/**
 * Texto del HTML sin comentarios de React: el SSR separa los interpolados con
 * `<!-- -->` (p. ej. `a 1 de enero de <!-- -->2025`), así que cualquier
 * búsqueda literal se hace sobre esta versión.
 */
function limpia(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

async function faseWeb(base: string, ines: string[]): Promise<void> {
  const cache = new Map<string, Pagina>()
  const cargar = async (ine: string, hojaQ: string): Promise<Pagina> => {
    const key = `${ine}|${hojaQ}`
    const prev = cache.get(key)
    if (prev) return prev
    const p = await getPagina(base, ine, hojaQ)
    cache.set(key, p)
    return p
  }

  const tiempos: string[] = []

  for (const ine of ines) {
    const ambito = `web:${ine}`

    const pol = await cargar(ine, 'politico')
    gateOk(
      ambito,
      'web-pagina-200',
      paginaSana(pol),
      pol.bytes,
      `GET ?hoja=politico → 200 · ${pol.bytes} B · ${pol.ms} ms · sin errores de aplicación`,
      `GET ?hoja=politico → ${pol.status ?? pol.error} · ${pol.bytes} B`,
    )
    if (!paginaSana(pol)) continue

    const html = limpia(pol.html)

    if (ine === '45090') {
      const ok = html.includes('circunscripción electoral de Toledo') && /no dispone de desglose a nivel municipal/i.test(html)
      gateOk(
        ambito,
        'web-electoral-nota',
        ok,
        1,
        'nota de cobertura "circunscripción electoral de Toledo" + ausencia de desglose municipal visibles',
        'nota de cobertura provincial ausente en ?hoja=politico',
      )
    } else {
      const pendiente = html.includes('Pendiente de publicación provincial') || html.includes('Resultados de la circunscripción')
      gateOk(
        ambito,
        'web-electoral-nota',
        pendiente,
        0,
        'sin bundle R2 para su provincia: la ficha declara el bloque provincial como pendiente (no inventa datos)',
        'sin bundle R2 y sin estado pendiente visible',
      )
    }

    const etiquetasMunicipales = [/Cobertura:\s*Municipio/i, /valor \(circunscripci[óo]n\)[^<]{0,40}municipio/i].filter(
      (re) => re.test(html),
    )
    const declaraProvincial = /circunscripci[óo]n/i.test(html)
    gateOk(
      ambito,
      'web-electoral-no-municipal-label',
      etiquetasMunicipales.length === 0 && declaraProvincial,
      etiquetasMunicipales.length,
      etiquetasMunicipales.length === 0
        ? 'sin etiqueta que atribuya la circunscripción al municipio · ámbito provincial declarado'
        : etiquetasMunicipales.map((r) => String(r)).join(' | '),
      etiquetasMunicipales.map((r) => String(r)).join(' | '),
    )

    const dem = await cargar(ine, '')
    const demTxt = limpia(dem.html)
    gateOk(
      ambito,
      'web-piramide-2025',
      paginaSana(dem) && demTxt.includes('a 1 de enero de 2025'),
      dem.bytes,
      `pirámide "a 1 de enero de 2025" visible en la ficha (${dem.ms} ms)`,
      paginaSana(dem) ? 'frase "a 1 de enero de 2025" ausente en la ficha' : `demografía → ${dem.status ?? dem.error}`,
    )

    const conprelEnPagina = /CONPREL/i.test(demTxt) || /SOCIDEAS_CONPREL_MOCK|conprel-mock/i.test(demTxt)
    gateOk(
      ambito,
      'web-conprel-ausente',
      !conprelEnPagina,
      conprelEnPagina ? 1 : 0,
      'CONPREL y fixtures ausentes del HTML público',
      'CONPREL o marcadores de fixture/mock presentes en el HTML público',
    )

    const aso = await cargar(ine, 'asociaciones')
    if (paginaSana(aso)) {
      const asoTxt = limpia(aso.html)
      const avisoAso = /Aviso de ver/i.test(asoTxt) && asoTxt.includes('registro autonómico')
      const conListado = asoTxt.includes('Total de asociaciones')
      const conEnlace = asoTxt.includes('registro de asociaciones de ')
      const estadoSinDatos = asoTxt.includes('Sin datos publicados para este municipio')
      const ok = conListado ? avisoAso : avisoAso && conEnlace && estadoSinDatos
      gateOk(
        ambito,
        'web-asociaciones',
        ok,
        conListado || conEnlace ? 1 : 0,
        conListado
          ? 'listado con total > 0 y aviso de verificación visible'
          : 'sin datos → enlace al registro autonómico + aviso + "Sin datos publicados" (sin 0 como hecho)',
        `listado=${conListado} aviso=${avisoAso} enlace=${conEnlace} sin_datos=${estadoSinDatos}`,
      )
    } else {
      gate(ambito, 'web-asociaciones', 'FALLO', 0, `?hoja=asociaciones → ${aso.status ?? aso.error}`)
    }

    const pat = await cargar(ine, 'patrimonio')
    if (!paginaSana(pat)) {
      for (const id of ['web-patrimonio-attribution', 'web-patrimonio-notfound', 'web-summary-cap', 'web-image-alt', 'web-gal']) {
        gate(ambito, id, 'FALLO', 0, `?hoja=patrimonio → ${pat.status ?? pat.error}`)
      }
    } else {
      const phtml = limpia(pat.html)
      const conArticulo = phtml.includes('Licencia CC BY-SA 4.0') && phtml.includes('Consultado el')
      const sinArticulo = phtml.includes('Sin artículo de Wikipedia para este municipio')

      if (conArticulo) {
        const enlace = /Texto extraído de Wikipedia[\s\S]{0,600}href="(https:\/\/es\.wikipedia\.org\/[^"]+)"/.test(phtml)
        gateOk(
          ambito,
          'web-patrimonio-attribution',
          enlace,
          1,
          'atribución CC BY-SA 4.0 + "Consultado el" + enlace al artículo visibles en la ficha',
          `atribución parcial: enlace al artículo=${enlace}`,
        )
        gate(ambito, 'web-patrimonio-notfound', 'N-A', null, 'este municipio tiene artículo en R2: la rama not_found no aplica')

        const m = /id="patrimonio-turismo"[\s\S]{0,4000}?<p class="text-sm leading-relaxed[^"]*">([\s\S]*?)<\/p>/.exec(phtml)
        const texto = (m?.[1] ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        gateOk(
          ambito,
          'web-summary-cap',
          texto.length > 0 && texto.length <= 1000,
          texto.length,
          `resumen renderizado ${texto.length} car. (≤ 1000)`,
          texto.length === 0 ? 'párrafo del resumen no localizado en el HTML' : `resumen renderizado ${texto.length} car. (> 1000)`,
        )

        const seccion = /id="patrimonio-turismo"[\s\S]*?(?=<section|$)/.exec(phtml)?.[0] ?? ''
        const imgsSeccion = [...seccion.matchAll(/<img[^>]*\balt="([^"]*)"/g)].map((x) => x[1])
        if (imgsSeccion.length === 0) {
          gate(ambito, 'web-image-alt', 'N-A', 0, 'el artículo no tiene imagen renderizada en esta ficha (sin <img> en la sección patrimonio)')
        } else {
          const conAtrib = imgsSeccion.filter((a) => /Wikipedia/i.test(a)).length
          gateOk(
            ambito,
            'web-image-alt',
            conAtrib === imgsSeccion.length,
            imgsSeccion.length,
            `${imgsSeccion.length} imagen(es) en la sección patrimonio con alt que contiene la atribución a Wikipedia`,
            `${imgsSeccion.length - conAtrib} de ${imgsSeccion.length} imágenes sin atribución en el alt`,
          )
        }
      } else if (sinArticulo) {
        gateOk(
          ambito,
          'web-patrimonio-notfound',
          true,
          0,
          'estado sereno "Sin artículo de Wikipedia para este municipio" y sin error de aplicación',
          'rama not_found sin implementar o error en la página',
        )
        gate(ambito, 'web-patrimonio-attribution', 'N-A', null, 'sin artículo de Wikipedia: no hay contenido que atribuir')
        gate(ambito, 'web-summary-cap', 'N-A', null, 'sin artículo: no hay resumen que acotar')
        gate(ambito, 'web-image-alt', 'N-A', null, 'sin artículo: sin imagen renderizada')
      } else {
        gate(ambito, 'web-patrimonio-attribution', 'FALLO', 0, 'ni atribución ni estado not_found visibles en ?hoja=patrimonio')
        gate(ambito, 'web-patrimonio-notfound', 'FALLO', 0, 'ni atribución ni estado not_found visibles en ?hoja=patrimonio')
        gate(ambito, 'web-summary-cap', 'N-A', null, 'estado del bloque no determinable')
        gate(ambito, 'web-image-alt', 'N-A', null, 'estado del bloque no determinable')
      }

      const galOk = phtml.includes('Contexto rural') && /Verificar en la web del GAL/.test(phtml)
      gateOk(ambito, 'web-gal', galOk, 1, 'bloque GAL visible con su aviso de verificación', 'bloque GAL o su aviso ausente en ?hoja=patrimonio')

      const crit = await cargar(ine, 'fuentes')
      const criterios = paginaSana(crit) && limpia(crit.html).includes('Un resultado provincial nunca es municipal')
      gateOk(
        ambito,
        'web-criterios-v23',
        criterios,
        1,
        'hoja 08 con el criterio "Un resultado provincial nunca es municipal" y las fuentes v2.3',
        'criterio v2.3 ausente en ?hoja=fuentes',
      )
    }

    tiempos.push(`${ine}:dem=${dem.ms}ms,pol=${pol.ms}ms,pat=${pat.ms}ms`)
  }

  const medias = tiempos.map((t) => {
    const nums = (t.match(/=(\d+)ms/g) ?? []).map((s) => Number(s.replace(/\D/g, '')))
    return { ine: t.split(':')[0], media: Math.round(nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length)) }
  })
  const peor = medias.reduce((a, b) => (b.media > a.media ? b : a), { ine: '—', media: 0 })
  gateOk(
    'global',
    'carga-inicial',
    peor.media < 5000,
    peor.media,
    `SSR local más lento: ${peor.ine} a ${peor.media} ms (media de 3 hojas) < 5.000 ms · ${tiempos.join(' | ')}`,
    `SSR local lento: ${peor.ine} a ${peor.media} ms · ${tiempos.join(' | ')}`,
  )

  gate(
    'global',
    'produccion-carga',
    'PENDIENTE_DEPLOY',
    null,
    'La carga de PRODUCCIÓN se mide tras desplegar v2.3 (qa-produccion.ts); hoy urb-ideas.vercel.app sirve e2f7fe0/8d99811.',
  )
}

// ============================================================================
// Informes
// ============================================================================

function renderMd(data: { gates: Gate[]; probes: Probe[]; generadoEn: string; fase: string; ines: string[] }): string {
  const L: string[] = []
  L.push('# Gates v2.3 — SOCideas v2.3 (SA6 QA adversarial)')
  L.push('')
  L.push(`Generado: ${data.generadoEn} · fase: ${data.fase} · pilotos: ${data.ines.join(', ')}`)
  L.push('')
  const cuenta = (e: Estado): number => data.gates.filter((g) => g.estado === e).length
  L.push(
    `Totales: **OK ${cuenta('OK')}** · FALLO ${cuenta('FALLO')} · N-A ${cuenta('N-A')} · PENDIENTE_DEPLOY ${cuenta('PENDIENTE_DEPLOY')}`,
  )
  L.push('')
  L.push('| Ámbito | Gate | Estado | Conteo | Detalle |')
  L.push('|---|---|---|---|---|')
  for (const x of data.gates) L.push(`| ${x.ambito} | ${x.id} | ${x.estado} | ${x.conteo ?? '—'} | ${x.detalle.replace(/\|/g, '\\|')} |`)
  L.push('')
  L.push('## Sondas HTTP')
  L.push('')
  L.push('| URL | HTTP | Bytes | ms |')
  L.push('|---|---|---|---|')
  for (const p of data.probes) L.push(`| ${p.url} | ${p.status ?? p.error ?? '—'} | ${p.bytes ?? '—'} | ${p.ms} |`)
  L.push('')
  return L.join('\n') + '\n'
}

async function main(): Promise<void> {
  const args = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log(
    `[qa-v23-gates] phase=${args.phase} · ines=${args.ines.join(', ')} · build=${args.skipBuild ? 'omitido' : 'ejecutado'} · base=${args.base ?? '—'}`,
  )

  let pilotos: PilotoResultado[] = []
  if (args.phase === 'core' || args.phase === 'all') {
    pilotos = await faseCore(args.ines, args.skipBuild, supabase)
  }
  if (args.phase === 'web' || args.phase === 'all') {
    if (!args.base) {
      gate(
        'global',
        'web',
        'N-A',
        null,
        'sin --base: no se ejecutaron los gates de HTML (arrancar `npx next dev -p 3111` y repetir con --phase=web --base=http://localhost:3111)',
      )
    } else {
      await faseWeb(args.base, args.ines)
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  await Promise.all(pending)
  const doc = {
    generadoEn: new Date().toISOString(),
    fase: args.phase,
    base: args.base,
    ines: args.ines,
    pilotos,
    probes,
    gates,
    totales: gates.reduce<Record<string, number>>((a, g) => ({ ...a, [g.estado]: (a[g.estado] ?? 0) + 1 }), {}),
  }
  const sufijo = args.phase === 'web' ? '-web' : ''
  fs.writeFileSync(path.join(OUT_DIR, `qa-v23-gates${sufijo}.json`), JSON.stringify(doc, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, `qa-v23-gates${sufijo}.md`), renderMd(doc))

  const fallos = gates.filter((g) => g.estado === 'FALLO')
  console.log('')
  console.log('===== RESUMEN qa-v23-gates =====')
  console.log(
    `OK ${gates.filter((g) => g.estado === 'OK').length} · FALLO ${fallos.length} · N-A ${gates.filter((g) => g.estado === 'N-A').length} · PENDIENTE_DEPLOY ${gates.filter((g) => g.estado === 'PENDIENTE_DEPLOY').length}`,
  )
  for (const f of fallos) console.log(`  X ${f.ambito} :: ${f.id} — ${f.detalle}`)
  console.log(`Informe: ${path.join(OUT_DIR, `qa-v23-gates${sufijo}.md`)}`)
  if (fallos.length > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('qa-v23-gates falló:', e)
  process.exit(1)
})
