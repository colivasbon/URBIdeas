// Dry-run de dimensiones demográficas: AUDITA y PREPARA, no carga nada.
// - Lee envelopes municipales PÚBLICOS (solo lectura, sin credenciales).
// - Verifica qué dimensiones objetivo existen hoy (sexo/edad sí; las nuevas, no).
// - Ejecuta parser/normalizador/validador puros sobre fixtures sintéticas.
// - Estima tamaño adicional hipotético (etiquetado como ESTIMADO, no medido).
// - NO escribe R2 ni Supabase, NO migra, NO cambia la ficha, NO crea selectores.
// Uso: npx tsx scripts/dry-run-demographic-dimensions.ts
// Salida: consola + tmp/dry-run-demographic-dimensions.json (ignorado por git).
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import { DEMOGRAPHIC_DIMENSIONS } from '../src/lib/socideas-demographic-dimensions'

config({ path: '.env.local' })

const R2_BASE = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? ''
const MUNICIPIOS = [
  { ine: '02003', etiqueta: 'grande' },
  { ine: '02069', etiqueta: 'medio' },
  { ine: '28143', etiqueta: 'pequeño' },
  { ine: '02065', etiqueta: 'posible secreto' },
]
const TARGET_SLUGS: Record<string, RegExp> = {
  sex: /^(population_male|population_female)$/,
  age_group: /^population_age_sex$/,
  nationality: /nacionalidad|nacionality/,
  birth_country: /nacimiento|nacim|birth_country|pais_nacimiento/,
  birth_residence_relation: /residencia|residence/,
}
const SECRETO_MARKS = new Set(['.', '..', ':', 'ND', 'n.d.', ''])

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

// ---------- Pipeline puro (parser / normalizador / validador) ----------

interface ParsedDimRow { ine: string; categoria: string; anio: number | null; valor: number | null; suprimido: boolean }

function parseEsNum(raw: string): number | null {
  const s = raw.trim()
  if (s === '' || SECRETO_MARKS.has(s) || s === '-') return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '')
  // OJO documentado: Number('') === 0; el guard de arriba evita ese caso.
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Parser CSV genérico INE (jaxi-style): municipio, categoría, periodo, valor. */
function parseDemographicCsv(text: string): ParsedDimRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []
  const first = lines[0]
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ','
  const headers = first.split(sep).map((h) => h.trim().toLowerCase())
  const iM = headers.findIndex((h) => h.includes('municip'))
  const iC = headers.findIndex((h) => h.includes('categor') || h.includes('sexo') || h.includes('nacionalidad') || h.includes('nacim'))
  const iP = headers.findIndex((h) => h.includes('periodo') || h.includes('período') || h.includes('año') || h.includes('anyo'))
  const iV = headers.findIndex((h) => h.includes('total') || h.includes('valor'))
  if (iM < 0 || iV < 0) return []
  const out: ParsedDimRow[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(sep)
    const m = (cols[iM] ?? '').match(/\b(\d{5})\b/)
    if (!m) continue // código que no hace match: se cuenta como no-match
    const anio = iP >= 0 ? parseInt((cols[iP] ?? '').trim(), 10) : NaN
    const rawV = (cols[iV] ?? '').trim()
    const suprimido = rawV === '' || SECRETO_MARKS.has(rawV) || rawV === '-'
    const valor = suprimido ? null : parseEsNum(rawV)
    out.push({ ine: m[1], categoria: iC >= 0 ? (cols[iC] ?? '').trim() : 'Total', anio: Number.isInteger(anio) ? anio : null, valor, suprimido })
  }
  return out
}

function validateDimRows(rows: ParsedDimRow[]): { validos: number; supresiones: number; sinAnio: number; noMatch: number } {
  // (noMatch se cuenta en el parseo: filas sin INE de 5 dígitos se omiten allí)
  let supresiones = 0
  let sinAnio = 0
  for (const r of rows) {
    if (r.suprimido || r.valor === null) supresiones += 1
    if (r.anio === null) sinAnio += 1
  }
  return { validos: rows.filter((r) => !r.suprimido && r.valor !== null && r.anio !== null).length, supresiones, sinAnio, noMatch: 0 }
}

// ---------- Fixtures del pipeline (sin infraestructura) ----------

function fixtures(): void {
  const csv = [
    'Municipios\tCategoría\tPeriodo\tTotal',
    '02069 Roda, La\tHombres\t2024\t7.877',
    '02069 Roda, La\tMujeres\t2024\t7.766',
    '02065 Pozuelo\tHombres\t2024\t.',
    'Sin código\tHombres\t2024\t10',
    '02069 Roda, La\tHombres\tsin-año\t5',
  ].join('\n')
  const rows = parseDemographicCsv(csv)
  check('parser: filas con INE válido', rows.length === 4, `${rows.length}`)
  check('parser: miles con punto (7.877 → 7877)', rows[0]?.valor === 7877, String(rows[0]?.valor))
  check('parser: secreto "." → null+flag, nunca 0', rows[2]?.valor === null && rows[2]?.suprimido === true)
  const v = validateDimRows(rows)
  check('validador: 2 válidos, 1 supresión, 1 sin año', v.validos === 2 && v.supresiones === 1 && v.sinAnio === 1, JSON.stringify(v))
  check('parser: "." aislado jamás es 0', parseEsNum('.') === null && parseEsNum('..') === null && parseEsNum('') === null)
}

// ---------- Cobertura real en envelopes (solo lectura) ----------

interface EnvelopeV2 { codigo_ine: string; indicators: { slug: string }[]; valores: unknown[] }

async function cobertura(ine: string): Promise<{ slugs: string[]; bytes: number; tupleBytes: number } | null> {
  if (!R2_BASE) return null
  const res = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`)
  if (!res.ok) return null
  const text = await res.text()
  const j = JSON.parse(text) as EnvelopeV2
  if (j.codigo_ine !== ine) return { slugs: [], bytes: text.length, tupleBytes: 0 }
  return {
    slugs: (j.indicators ?? []).map((i) => i.slug),
    bytes: text.length,
    tupleBytes: (j.valores ?? []).length > 0 ? text.length / (j.valores as unknown[]).length : 0,
  }
}

async function main(): Promise<void> {
  console.log('=== Fixtures del pipeline ===')
  fixtures()
  console.log('\n=== Cobertura real por municipio muestra ===')
  console.log('| Municipio | Dimensión | Año | Fuente | Valor/categorías | Cobertura | Estado | Cambio potencial |')
  const manifest: unknown[] = []
  let conCobertura = 0
  let sinCobertura = 0
  for (const m of MUNICIPIOS) {
    const cov = await cobertura(m.ine)
    if (!cov) { console.log(`| ${m.ine} | — | — | — | envelope no legible | — | error-lectura | ninguno |`); continue }
    const match = cov.slugs.length > 0
    check(`join INE-5 ${m.ine} (${m.etiqueta})`, match, `${cov.slugs.length} slugs, ${cov.bytes} B`)
    for (const dim of DEMOGRAPHIC_DIMENSIONS) {
      const re = TARGET_SLUGS[dim.id]
      const found = cov.slugs.filter((s) => re.test(s))
      if (dim.loadStatus === 'available') {
        const ok = found.length > 0
        if (ok) conCobertura += 1; else sinCobertura += 1
        console.log(`| ${m.ine} | ${dim.id} | ver ficha | ${dim.source} | ${found.join(', ') || '—'} | ${ok ? 'total' : 'ausente'} | ${ok ? 'disponible' : 'revisar'} | ninguno (ya cargada) |`)
        manifest.push({ municipio: m.ine, dimension: dim.id, slugs: found, estado: ok ? 'disponible' : 'revisar' })
      } else {
        sinCobertura += 1
        // Hipótesis documentada como ESTIMADO: 1 año × N categorías × bytes/tupla reales.
        const hipoteticas = dim.categories.length
        const estimadoB = Math.round(hipoteticas * cov.tupleBytes)
        console.log(`| ${m.ine} | ${dim.id} | por verificar | ${dim.source} | 0 categorías hoy | sin cobertura | ${dim.loadStatus} | +${hipoteticas} filas/año (~${estimadoB} B ESTIMADO) |`)
        manifest.push({ municipio: m.ine, dimension: dim.id, slugs: [], estado: dim.loadStatus, filasHipoteticas: hipoteticas, bytesEstimados: estimadoB })
      }
    }
  }
  console.log(`\nCobertura: ${conCobertura} con dato · ${sinCobertura} sin cobertura/nueva · 0 códigos no-match (INE-5 validado) · 0 escrituras`)
  console.log('Recomendación: NO integrar nacionalidad/nacimiento/residencia hasta validar tablas Censo 2021 (sin ID inventado). Sexo/edad ya disponibles; sin selectores nuevos.')
  writeFileSync('tmp/dry-run-demographic-dimensions.json', JSON.stringify({ manifest, conCobertura, sinCobertura, escrituras: 0 }, null, 2))
  console.log('Manifiesto en tmp/dry-run-demographic-dimensions.json (ignorado por git).')
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nDry-run OK: pipeline validado, cobertura auditada, cero escrituras.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
