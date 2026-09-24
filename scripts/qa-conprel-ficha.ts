/**
 * QA de la experiencia CONPREL en ficha/XLSX (rama feat/conprel-ficha).
 *
 * Verifica sin R2 ni Supabase:
 *  1. Flag OFF por defecto → sin tablas CONPREL, sin entradas de catálogo,
 *     glosario hoja 08 sin la fila CONPREL (no-regresión).
 *  2. Flag ON + fixtures §6 → estados S1–S4 correctos.
 *  3. Textos exactos de ND (nunca «no remitió»/«incumple»/foral individual).
 *  4. Cero publicado ≠ ND (importec=0 del mock).
 *  5. Cobertura congelada 7.345/8.132 y 6.861/8.132 sin recalcular.
 *  6. Sin mezcla AEAT/ADRH: grupo `hacienda_conprel`.
 *
 * Uso: npx tsx scripts/qa-conprel-ficha.ts
 * EXIT 0 = todas las aserciones verdes.
 */

// El flag se lee en cada llamada: se fija ANTES de importar los módulos que
// dependen del entorno en tiempo de ejecución.
process.env.NEXT_PUBLIC_CONPREL_UI = 'true'
process.env.SOCIDEAS_CONPREL_MOCK = 'true'

import {
  buildConprelPresentacion,
  CONPREL_AUSENCIA_TEXTO,
  CONPREL_COBERTURA,
  CONPREL_NOTA_SERIE,
} from '../src/lib/conprel-presentation'
import { CONPREL_MOCK_FIXTURES, conprelMockValores } from '../src/lib/conprel-mock'
import { buildEconomiaTables } from '../src/lib/socideas-export'
import {
  COVERAGE_STATUS_GLOSSARY,
  coverageGlossaryEntries,
  getIndicatorCatalogEntry,
} from '../src/lib/socideas-indicator-catalog'
import { isConprelUiEnabled } from '../src/lib/conprel-flag'
import type { PerfilEconomico } from '../src/lib/socideas'
import type { ConprelCruceEstado } from '../src/lib/conprel-presentation'

const FORBIDDEN = [
  'no remitió',
  'no remitio',
  'incumple',
  'el ayuntamiento no',
  'ausente por régimen foral',
  'ausente por foral',
  'sin datos por foral',
]

let failures = 0
let checks = 0

function assert(cond: boolean, msg: string): void {
  checks += 1
  if (cond) return
  failures += 1
  console.error(`  ✗ ${msg}`)
}

function perfilDe(ine: string, nombre: string): PerfilEconomico {
  const valores = conprelMockValores(ine)
  return {
    municipio: {
      codigo_ine: ine,
      nombre,
      poblacion: null,
      provincia: '—',
      provincia_codigo_ine: null,
      comunidad_autonoma: '—',
      centroide_lng: null,
      centroide_lat: null,
    },
    sincronizado: valores.length > 0 || true,
    ultima_sincronizacion: null,
    valores,
    ultimoPorIndicador: {},
    disponibles: [],
  }
}

const ESPERADO: Record<string, ConprelCruceEstado> = Object.fromEntries(
  CONPREL_MOCK_FIXTURES.map((f) => [f.ine, f.estado]),
)

console.log('=== QA CONPREL ficha/XLSX ===')
assert(isConprelUiEnabled() === true, 'flag ON en este script')

// --- 1. Fixtures: estados S1–S4 + textos ---
console.log('\n[1] Estados de cruce por fixture (§6)')
for (const fx of CONPREL_MOCK_FIXTURES) {
  const perfil = perfilDe(fx.ine, fx.nombre)
  const pres = buildConprelPresentacion(perfil.valores, fx.ine)
  assert(pres !== null, `${fx.ine}: presentación no nula`)
  if (!pres) continue
  assert(pres.cruce === ESPERADO[fx.ine], `${fx.ine}: cruce ${pres.cruce} === ${ESPERADO[fx.ine]}`)
  assert(pres.ppto.presente === fx.ppto, `${fx.ine}: ppto.presente=${pres.ppto.presente} === ${fx.ppto}`)
  assert(pres.liq.presente === fx.liq, `${fx.ine}: liq.presente=${pres.liq.presente} === ${fx.liq}`)

  const blob = JSON.stringify(pres)
  for (const bad of FORBIDDEN) {
    assert(!blob.toLowerCase().includes(bad.toLowerCase()), `${fx.ine}: sin «${bad}»`)
  }
  // Familia ausente ⇒ filas ND con texto aprobado, jamás 0.
  if (!fx.ppto) {
    assert(pres.ppto.filas.every((f) => f.ausente && f.valor === null), `${fx.ine}: ppto ND sin 0`)
    assert(
      pres.ppto.filas.every((f) => f.concepto === CONPREL_AUSENCIA_TEXTO),
      `${fx.ine}: texto ND de ausencia exacto en ppto`,
    )
    assert(pres.ppto.estadoFamilia === (fx.liq ? 'ausente_fichero_ppto2025' : 'ausente_ambos_definitivos'), `${fx.ine}: estado ppto ${pres.ppto.estadoFamilia}`)
  }
  if (!fx.liq) {
    assert(pres.liq.filas.every((f) => f.ausente && f.valor === null), `${fx.ine}: liq ND sin 0`)
    assert(
      pres.liq.filas.every((f) => f.concepto === CONPREL_AUSENCIA_TEXTO),
      `${fx.ine}: texto ND de ausencia exacto en liq`,
    )
    assert(pres.liq.estadoFamilia === (fx.ppto ? 'ausente_fichero_liq2024' : 'ausente_ambos_definitivos'), `${fx.ine}: estado liq ${pres.liq.estadoFamilia}`)
  }
  // Familia presente ⇒ valores reales (incl. cero publicado).
  if (fx.ppto) {
    assert(pres.ppto.filas.some((f) => !f.ausente && isNum(f.valor)), `${fx.ine}: ppto con valores`)
    assert(pres.ppto.filas.every((f) => f.estado === 'presente' || f.ausente), `${fx.ine}: estados ppto`)
  }
  if (fx.liq) {
    const ceros = pres.liq.filas.filter((f) => f.esCeroPublicado)
    assert(ceros.length > 0, `${fx.ine}: liq incluye cero publicado (importec)`)
    assert(
      ceros.every((f) => f.valor === 0 && !f.ausente),
      `${fx.ine}: cero publicado no es ND`,
    )
  }
  // Cobertura congelada.
  assert(
    pres.ppto.coberturaTexto.includes('7.345 de 8.132') && pres.ppto.coberturaTexto.includes('90,3'),
    `${fx.ine}: cobertura ppto 7.345/8.132 (90,3 %)`,
  )
  assert(
    pres.liq.coberturaTexto.includes('6.861 de 8.132') && pres.liq.coberturaTexto.includes('84,4'),
    `${fx.ine}: cobertura liq 6.861/8.132 (84,4 %)`,
  )
  assert(pres.notaSerie === CONPREL_NOTA_SERIE, `${fx.ine}: nota de serie §4a exacta`)
  assert(pres.notaNd.includes('no consta registro municipal en el fichero consultado'), `${fx.ine}: nota ND §4b`)
  assert(CONPREL_COBERTURA.ppto.presentes === 7345 && CONPREL_COBERTURA.liq.presentes === 6861, 'coberturas congeladas')
}

// --- 2. Territoriales: Ceuta/Melilla, Álava, Navarra ---
console.log('\n[2] Contexto territorial')
{
  const ceuta = buildConprelPresentacion(conprelMockValores('51001'), '51001')
  assert(ceuta !== null && ceuta.notasTerritoriales.some((n) => n.includes('ZZ')), 'Ceuta: nota ZZ')
  const melilla = buildConprelPresentacion(conprelMockValores('52001'), '52001')
  assert(melilla !== null && melilla.notasTerritoriales.some((n) => n.includes('ZZ')), 'Melilla: nota ZZ')
  // Vitoria (Álava, S3): hecho provincial medido, sin causa individual.
  const vitoria = buildConprelPresentacion(conprelMockValores('01059'), '01059')
  assert(vitoria !== null && vitoria.cruce === 'S3', 'Vitoria S3')
  assert(
    vitoria !== null && vitoria.notasTerritoriales.some((n) => n.includes('0 de 51') && n.includes('No se imputa causa individual')),
    'Álava: hecho medido 0/51 sin causa individual',
  )
  const vblob = JSON.stringify(vitoria)
  for (const bad of FORBIDDEN) {
    assert(!vblob.toLowerCase().includes(bad.toLowerCase()), `Vitoria sin «${bad}»`)
  }
  // Pamplona (Navarra, S4): presente — Navarra no es bloque uniformemente ausente.
  const pamplona = buildConprelPresentacion(conprelMockValores('31201'), '31201')
  assert(pamplona !== null && pamplona.cruce === 'S4', 'Pamplona S4 pese a cobertura baja navarra')
}

// --- 3. XLSX/tablas con flag ON ---
console.log('\n[3] buildEconomiaTables con flag ON + mock')
{
  const madrid = perfilDe('28079', 'Madrid')
  const tablas = buildEconomiaTables(madrid)
  const ids = tablas.map((t) => t.id)
  assert(ids.includes('conprel-ppto') && ids.includes('conprel-liq'), 'tablas conprel-ppto y conprel-liq presentes')
  const ppto = tablas.find((t) => t.id === 'conprel-ppto')
  assert(ppto !== undefined && ppto.columnas.join('|') === 'Ejercicio|cdcta|Concepto cuenta|Magnitud|Valor €|Estado', 'columnas §5')
  assert(ppto !== undefined && ppto.filas.length > 0, 'ppto con filas')
  assert(
    ppto !== undefined && ppto.filas.every((f) => f[4].text !== '0' || f[4].numeric === 0),
    'cero numérico solo si publicado',
  )
  const getxo = buildEconomiaTables(perfilDe('48044', 'Getxo'))
  const liqGetxo = getxo.find((t) => t.id === 'conprel-liq')
  assert(liqGetxo !== undefined, 'S1: tabla liq emitida')
  assert(
    liqGetxo !== undefined && liqGetxo.filas.every((f) => f[4].text === 'ND' && f[4].numeric === null),
    'S1: celdas liq son ND (nunca 0 numérico)',
  )
  assert(
    liqGetxo !== undefined && liqGetxo.filas.every((f) => f[5].text === 'ausente_fichero_liq2024'),
    'S1: estado ausente_fichero_liq2024',
  )
  const vitoria = buildEconomiaTables(perfilDe('01059', 'Vitoria'))
  const pptoV = vitoria.find((t) => t.id === 'conprel-ppto')
  assert(
    pptoV !== undefined && pptoV.filas.every((f) => f[5].text === 'ausente_ambos_definitivos'),
    'S3: estado ausente_ambos_definitivos',
  )
}

// --- 4. Glosario y catálogo ---
console.log('\n[4] Hoja 08 + catálogo')
{
  const gloss = coverageGlossaryEntries()
  assert(gloss.length === COVERAGE_STATUS_GLOSSARY.length + 1, 'glosario +1 fila CONPREL con flag ON')
  assert(gloss.some((g) => g.estado === 'partial (CONPREL)'), 'fila partial (CONPREL)')
  const entry = getIndicatorCatalogEntry('conprel_ppto_importe')
  assert(entry !== null && entry.coverageStatus === 'partial', 'entrada conprel_ppto partial')
  assert(entry !== null && entry.comparabilityGroup === 'hacienda_conprel', 'grupo propio (no AEAT/ADRH)')
  const aeat = getIndicatorCatalogEntry('irpf_declaraciones')
  assert(aeat !== null && aeat.comparabilityGroup === 'aeat_declarantes', 'AEAT intacto')
}

// --- 5. Flag OFF: sin fugas ---
console.log('\n[5] Flag OFF (no-regresión)')
{
  process.env.NEXT_PUBLIC_CONPREL_UI = 'false'
  assert(isConprelUiEnabled() === false, 'flag OFF')
  const tablas = buildEconomiaTables(perfilDe('28079', 'Madrid'))
  assert(!tablas.some((t) => t.id.startsWith('conprel-')), 'sin tablas conprel con flag OFF')
  assert(getIndicatorCatalogEntry('conprel_ppto_importe') === null, 'catálogo CONPREL oculto con flag OFF')
  const gloss = coverageGlossaryEntries()
  assert(gloss.length === COVERAGE_STATUS_GLOSSARY.length, 'glosario idéntico con flag OFF')
  // buildConprelPresentacion se invoca desde la UI solo con flag ON; aquí
  // forzamos la lectura del flag a false para el mock:
  process.env.SOCIDEAS_CONPREL_MOCK = 'false'
  const pres = buildConprelPresentacion(conprelMockValores('28079'), '28079')
  // Con mock OFF y flag OFF no hay dataset en un envelope real vacío…
  // (las filas mock siguen en memoria, por eso comprobamos el flag de UI en
  //  buildEconomiaTables, que es el punto de inserción del XLSX).
  assert(pres === null || pres.datasetCargado, 'presentación coherente sin mock')
  process.env.SOCIDEAS_CONPREL_MOCK = 'true'
  process.env.NEXT_PUBLIC_CONPREL_UI = 'true'
}

function isNum(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

console.log(`\n=== ${checks - failures}/${checks} aserciones OK · ${failures} fallos ===`)
if (failures > 0) {
  process.exitCode = 1
  console.error('QA CONPREL: FALLIDO')
} else {
  console.log('QA CONPREL: OK')
}
