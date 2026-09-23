/**
 * Tests unitarios del parser/loader CONPREL con CSVs sintéticos en tmp.
 *
 * Sin red, sin R2, sin Supabase. Cubre el contrato obligatorio del encargo:
 *   1. cero real conservado (0,00 → tupla valor 0)
 *   2. ausencia de fila/campo → SIN tupla (ND, nunca 0)
 *   3. coma decimal estricta
 *   4. miles con punto
 *   5. negativos (regla: permitidos y contabilizados; doc. en parser)
 *   6. fila corrupta → ConprelParseError
 *   7. cabecera alterada → fallo
 *   8. duplicado (idente,cdcta,tipreig) o codente → BLOQUEO (exit≠0)
 *   9. ZV/ZO (y otros no AA/ZZ) FUERA del municipal
 *  10. test id-grup negativo: idente de grupo/dependiente NO publica
 *      (solo el idente del inventario AA/ZZ)
 *  11. gate de escritura: dry-run por defecto; confirm sin env → abort
 *
 * Uso: npx tsx scripts/verify-conprel-loader.ts
 * Código de salida: 0 = todos OK · ≠0 = fallos.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  CONPREL_LIQ_2024,
  CONPREL_PPTO_2025,
  esMunicipalCodente,
  prefijoIne5,
} from '../src/lib/conprel-contracts'
import {
  ConprelBloqueoError,
  ConprelParseError,
  assertHeader,
  buildTuplasFamilia,
  cabeEnvelope,
  cargarEconomica,
  cargarInventario,
  identesFueraDeContrato,
  mergeConprelTuplas,
  parseImporteEs,
  resolveWriteGate,
} from '../src/lib/conprel-parser'
import type { EnvV2 } from '../src/lib/conprel-parser'
import { CONPREL_SLUGS } from '../src/lib/conprel-slugs'

const TMP = path.join(process.cwd(), 'tmp', 'conprel-verify')
let failures = 0
let passes = 0

function check(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) {
    passes++
    console.log(`  OK  ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } else {
    failures++
    console.error(`FAIL  ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  }
}

function write(name: string, content: string): string {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

function expectError(fn: () => unknown, kinds: Array<new (...a: never[]) => Error>, label: string): string | null {
  try {
    fn()
    return `${label}: esperaba error, no lanzó`
  } catch (e) {
    if (e instanceof Error && kinds.some((K) => e instanceof K)) return null
    return `${label}: tipo de error inesperado → ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`
  }
}

const INV_HEADER = 'codente|estado|id|idente|nombreente|nsec|poblacion'
const ECO_HEADER_P = 'idente|cdcta|tipreig|importe'
const ECO_HEADER_L = 'idente|cdcta|tipreig|imported|importer|importel|importec'

function main(): void {
  fs.mkdirSync(TMP, { recursive: true })
  console.log(`=== verify-conprel-loader · CSVs sintéticos en ${TMP} ===\n`)

  // ── 1–5. parseImporteEs (locale ES estricto) ─────────────────────────────
  console.log('— parseImporteEs —')
  check('coma decimal simple', parseImporteEs('1234,56') === 1234.56)
  check('cero explícito 0,00', parseImporteEs('0,00') === 0)
  check('cero sin decimales 0', parseImporteEs('0') === 0)
  check('miles con punto', parseImporteEs('1.234.567,89') === 1234567.89)
  check('negativo con coma', parseImporteEs('-12,34') === -12.34)
  check('negativo con miles', parseImporteEs('-1.234,50') === -1234.5)
  check('vacío → null (ND)', parseImporteEs('') === null)
  check('undefined → null (ND)', parseImporteEs(undefined) === null)
  check(
    'decimal anglo RECHAZADO',
    expectError(() => parseImporteEs('1,234.56'), [ConprelParseError], 'US') === null,
  )
  check(
    'decimal con punto RECHAZADO',
    expectError(() => parseImporteEs('123.456'), [ConprelParseError], 'dot') === null,
  )
  check(
    'basura RECHAZADA',
    expectError(() => parseImporteEs('abc'), [ConprelParseError], 'abc') === null,
  )

  // ── 7. cabecera alterada ────────────────────────────────────────────────
  console.log('\n— cabecera estricta —')
  check(
    'cabecera PPTO correcta pasa',
    (() => {
      try {
        assertHeader(
          ECO_HEADER_P.split('|'),
          CONPREL_PPTO_2025.ecoColumns,
          'test',
        )
        return true
      } catch {
        return false
      }
    })(),
  )
  check(
    'cabecera alterada falla',
    expectError(
      () => assertHeader(['idente', 'cdcta', 'tipreig', 'importe_extra'], CONPREL_PPTO_2025.ecoColumns, 'test'),
      [ConprelParseError],
      'header',
    ) === null,
  )
  check(
    'orden alterado falla',
    expectError(
      () => assertHeader(['cdcta', 'idente', 'tipreig', 'importe'], CONPREL_PPTO_2025.ecoColumns, 'test'),
      [ConprelParseError],
      'order',
    ) === null,
  )

  // ── Inventario: municipal + ZV/ZO fuera + id-grup negativo ──────────────
  console.log('\n— inventario AA|ZZ y exclusión de dependientes —')
  const invPath = write(
    'inv_ok.csv',
    [
      INV_HEADER,
      // 28079AA000 Madrid — idente 17037 (corporación)
      `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|3200000`,
      // 51001ZZ000 Ceuta municipal
      `51001ZZ000|C|2|90001|${'Ceuta'.padEnd(60)}|1|84000`,
      // 51001ZV003 dependiente Ceuta — NO municipal
      `51001ZV003|C|3|90003|${'Dep Ceuta ZV'.padEnd(60)}|1|0`,
      // 51001ZO001 dependiente Ceuta — NO municipal
      `51001ZO001|C|4|90004|${'Dep Ceuta ZO'.padEnd(60)}|1|0`,
      // 01000DD000 Diputación Foral — NO municipal
      `01000DD000|C|5|50001|${'Diputacion Alava'.padEnd(60)}|1|0`,
      // 48020AA000 Bilbao
      `48020AA000|C|6|48020|${'Bilbao'.padEnd(60)}|1|346000`,
    ].join('\n') + '\n',
  )
  const inv = cargarInventario(invPath, CONPREL_PPTO_2025)
  check('municipales AA+ZZ = 3', inv.municipales.length === 3, `n=${inv.municipales.length}`)
  check(
    'ZV/ZO/ DD fuera del municipal',
    inv.municipales.every((m) => esMunicipalCodente(m.codente)) &&
      !inv.municipales.some((m) => m.codente.includes('ZV') || m.codente.includes('ZO') || m.codente.includes('DD')),
  )
  check(
    'lista noMunicipalesCeutaMelilla = 2',
    inv.noMunicipalesCeutaMelilla.length === 2,
    inv.noMunicipalesCeutaMelilla.join(','),
  )
  check('INE-5 de Madrid = 28079', inv.municipales[0]!.ine === '28079')
  check('prefijoIne5 51001ZZ000 = 51001', prefijoIne5('51001ZZ000') === '51001')

  // duplicado codente → bloqueo
  const invDup = write(
    'inv_dup.csv',
    [INV_HEADER, `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`, `28079AA000|C|1|17038|${'Madrid2'.padEnd(60)}|1|1`].join('\n') + '\n',
  )
  check(
    'duplicado codente → BLOQUEO',
    expectError(() => cargarInventario(invDup, CONPREL_PPTO_2025), [ConprelBloqueoError], 'dup-codente') === null,
  )

  // duplicado INE municipal (dos tipos AA distintos mismo prefijo) → bloqueo
  const invDupIne = write(
    'inv_dupine.csv',
    [INV_HEADER, `28079AA000|C|1|17037|${'Madrid'.padEnd(60)}|1|1`, `28079AA001|C|2|17038|${'Madrid B'.padEnd(60)}|1|1`].join('\n') + '\n',
  )
  check(
    'duplicado INE-5 municipal → BLOQUEO',
    expectError(() => cargarInventario(invDupIne, CONPREL_PPTO_2025), [ConprelBloqueoError], 'dup-ine') === null,
  )

  // fila corrupta (codente corto)
  const invBad = write('inv_bad.csv', [INV_HEADER, `2807|C|1|17037|${'x'.padEnd(60)}|1|1`].join('\n') + '\n')
  check(
    'fila corrupta codente → PARSE ERROR',
    expectError(() => cargarInventario(invBad, CONPREL_PPTO_2025), [ConprelParseError], 'corrupt') === null,
  )

  // cabecera inventario alterada
  const invHdr = write('inv_hdr.csv', `codente|estado|idente|nombreente\n28079AA000|C|1|x\n`)
  check(
    'cabecera inventario alterada → fallo',
    expectError(() => cargarInventario(invHdr, CONPREL_PPTO_2025), [ConprelParseError], 'inv-hdr') === null,
  )

  // ── Económica PPTO: cero real, nulos, negativos, miles, duplicado ────────
  console.log('\n— económica PPTO —')
  const ecoP = write(
    'eco_p.csv',
    [
      ECO_HEADER_P,
      // Madrid (idente 17037): capítulo 1 con cero explícito; capítulo 2 con valor; negativo
      '17037|1|I|0,00',
      '17037|2|G|1.234.567,89',
      '17037|3|G|-12,34',
      // Ceuta: campo nulo (ausencia) → sin tupla
      '90001|1|I|',
      // Bilbao
      '48020|1|I|100,50',
      // dependiente ZV con eco (NO debe publicarse como municipio)
      '90003|1|I|999999,00',
      // diputación DD
      '50001|1|I|888888,00',
    ].join('\n') + '\n',
  )
  const eco = cargarEconomica(ecoP, CONPREL_PPTO_2025, {})
  check('eco filas = 7', eco.filas.length === 7, `n=${eco.filas.length}`)
  check('ceros explícitos contados = 1', eco.cerosExplicitos === 1, String(eco.cerosExplicitos))
  check('negativos contados = 1', eco.negativos === 1, String(eco.negativos))
  check('nulos contados = 1', eco.nulos === 1, String(eco.nulos))

  const res = buildTuplasFamilia('ppto', inv.municipales, eco, { url: CONPREL_PPTO_2025.url })
  const madridMun = inv.municipales.find((m) => m.ine === '28079')!
  const ceutaMun = inv.municipales.find((m) => m.ine === '51001')!
  const bilbaoMun = inv.municipales.find((m) => m.ine === '48020')!
  const resMadrid = buildTuplasFamilia('ppto', [madridMun], eco, { url: CONPREL_PPTO_2025.url })
  const madridTuplas = resMadrid.tuplas
  const madridCero = madridTuplas.find((t) => t.dim.cdcta === '1' && t.dim.tipreig === 'I')
  const madridMiles = madridTuplas.find((t) => t.dim.cdcta === '2')
  const madridNeg = madridTuplas.find((t) => t.dim.cdcta === '3')
  const resCeuta = buildTuplasFamilia('ppto', [ceutaMun], eco, { url: CONPREL_PPTO_2025.url })
  const resBilbao = buildTuplasFamilia('ppto', [bilbaoMun], eco, { url: CONPREL_PPTO_2025.url })

  check('cero real 0,00 → tupla valor 0', madridCero?.valor === 0, `valor=${madridCero?.valor}`)
  check(
    'miles 1.234.567,89 conservados',
    madridMiles?.valor === 1234567.89,
    String(madridMiles?.valor),
  )
  check('negativo -12,34 conservado y contado', madridNeg?.valor === -12.34, String(madridNeg?.valor))
  check(
    'ausencia de campo nulo → SIN tupla (Ceuta cap1)',
    resCeuta.tuplas.length === 0 && resCeuta.municipiosSinFilas.length === 0,
    `tuplas=${resCeuta.tuplas.length} sinFilas=${resCeuta.municipiosSinFilas.join(',')}`,
  )
  check('Bilbao con dato → tupla presente', resBilbao.tuplas.length === 1, `n=${resBilbao.tuplas.length}`)

  // test id-grup negativo: solo identes de inventario AA/ZZ publican.
  const identesMun = new Set(inv.municipales.map((m) => m.idente))
  check(
    'test id-grup negativo: ZV/ZO/ DD (grupo/dependiente) NO publican',
    !res.tuplas.some((t) => t.valor === 999999) &&
      !res.tuplas.some((t) => t.valor === 888888) &&
      eco.filas.every((f) => {
        if (f.valores.importe === 999999 || f.valores.importe === 888888) {
          return !res.tuplas.some((t) => t.valor === f.valores.importe)
        }
        return true
      }) &&
      [resMadrid, resCeuta, resBilbao].every((r) =>
        r.tuplas.every((t) => {
          const f = eco.filas.find(
            (x) => x.cdcta === t.dim.cdcta && x.tipreig === t.dim.tipreig && x.valores.importe === t.valor,
          )
          return f ? identesMun.has(f.idente) : false
        }),
      ),
    `tuplas=${res.tuplas.length}`,
  )
  const fuera = identesFueraDeContrato(inv, eco)
  check(
    'identesFueraDeContrato: ZV/ZO listados y otros no-municipales ≥1',
    fuera.zvZo.length === 2 && fuera.otrosNoMunicipales >= 1,
    `zvZo=${fuera.zvZo.length} otros=${fuera.otrosNoMunicipales}`,
  )

  // municipio ausente del inventario → candidato sin tupla (ND)
  const sinFilaInv = buildTuplasFamilia(
    'ppto',
    [{ codente: '01059AA000', ine: '01059', idente: '1059', nombre: 'Vitoria', estado: 'C', nsec: '1' }],
    eco,
    { url: '' },
  )
  check(
    'municipio con idente sin filas eco → SIN tuplas (ND ≠ 0)',
    sinFilaInv.tuplas.length === 0 && sinFilaInv.municipiosSinFilas.includes('01059'),
    `tuplas=${sinFilaInv.tuplas.length}`,
  )

  // duplicado eco → bloqueo
  const ecoDup = write(
    'eco_dup.csv',
    [ECO_HEADER_P, '17037|1|I|10,00', '17037|1|I|20,00'].join('\n') + '\n',
  )
  check(
    'duplicado (idente,cdcta,tipreig) → BLOQUEO',
    expectError(() => cargarEconomica(ecoDup, CONPREL_PPTO_2025, {}), [ConprelBloqueoError], 'dup-eco') === null,
  )

  // fila corrupta: idente no numérico
  const ecoBad = write('eco_bad.csv', [ECO_HEADER_P, 'abc|1|I|10,00'].join('\n') + '\n')
  check(
    'fila corrupta (idente no numérico) → PARSE ERROR',
    expectError(() => cargarEconomica(ecoBad, CONPREL_PPTO_2025, {}), [ConprelParseError], 'bad-idente') === null,
  )

  // tipreig inesperado
  const ecoTip = write('eco_tip.csv', [ECO_HEADER_P, '17037|1|X|10,00'].join('\n') + '\n')
  check(
    'tipreig inesperado → PARSE ERROR',
    expectError(() => cargarEconomica(ecoTip, CONPREL_PPTO_2025, {}), [ConprelParseError], 'tip') === null,
  )

  // formato no ES en eco → bloquea parse
  const ecoUS = write('eco_us.csv', [ECO_HEADER_P, '17037|1|I|1,234.56'].join('\n') + '\n')
  check(
    'importe US en eco → PARSE ERROR (locale)',
    expectError(() => cargarEconomica(ecoUS, CONPREL_PPTO_2025, {}), [ConprelParseError], 'us') === null,
  )

  // ── LIQ: 4 magnitudes, nulos por columna ────────────────────────────────
  console.log('\n— económica LIQ —')
  const ecoL = write(
    'eco_l.csv',
    [
      ECO_HEADER_L,
      '631|1|I|235600,00|211693,90|170562,79|0,00',
      '631|1|G|400000,00|299527,85|299527,85|0,00',
      '631|2|I||10,00|20,00|30,00', // imported nulo → sin tupla para ese slug
    ].join('\n') + '\n',
  )
  const ecoLiq = cargarEconomica(ecoL, CONPREL_LIQ_2024, {})
  check('liq filas = 3', ecoLiq.filas.length === 3)
  check('liq nulos = 1 (imported vacío)', ecoLiq.nulos === 1, String(ecoLiq.nulos))
  const invLiq = write(
    'inv_l.csv',
    [INV_HEADER, `04004AA000|C|10|631|${'Albanchez'.padEnd(60)}|1|1300`].join('\n') + '\n',
  )
  const invL = cargarInventario(invLiq, CONPREL_LIQ_2024)
  const resL = buildTuplasFamilia('liq', invL.municipales, ecoLiq, { url: CONPREL_LIQ_2024.url })
  check('liq tuplas = 11 (3+4+4 -1 nulo)', resL.tuplas.length === 11, `n=${resL.tuplas.length}`)
  check(
    'liq: fila con imported nulo no genera slug prevision en cap2',
    !resL.tuplas.some((t) => t.slug === 'conprel_liq_prevision_definitivos_importe' && t.dim.cdcta === '2'),
  )
  check(
    'liq: imported presente genera tupla prevision (cap1-I 235600)',
    resL.tuplas.some(
      (t) => t.slug === 'conprel_liq_prevision_definitivos_importe' && t.dim.cdcta === '1' && t.valor === 235600,
    ),
  )
  check(
    'liq: cero importec 0,00 → tupla 0 real (recaudacion_cerrados)',
    resL.tuplas.some((t) => t.slug === 'conprel_liq_recaudacion_cerrados_importe' && t.valor === 0),
  )
  check(
    'liq: importel recaudacion corriente 170562,79 exacto',
    resL.tuplas.some((t) => t.slug === 'conprel_liq_recaudacion_corriente_importe' && t.valor === 170562.79),
  )
  check(
    'liq: reconocidos 211693,90 exacto',
    resL.tuplas.some((t) => t.slug === 'conprel_liq_reconocidos_importe' && t.valor === 211693.9),
  )

  // ── merge + gate 150 KB + preservación slugs ────────────────────────────
  console.log('\n— merge envelope + gate 150 KB —')
  const env: EnvV2 = {
    version: 2,
    codigo_ine: '28079',
    generado_en: new Date().toISOString(),
    indicators: [{ slug: 'irpf_media', nombre: 'IRPF', unidad: 'euros' }],
    sources: [],
    source_urls: [],
    dimensiones: [],
    valores: [[0, 2023, 100, 'euros', 0, 0, 'AEAT-IRPF', null, 'validado']],
  }
  const slugsPpto = new Set(CONPREL_SLUGS.filter((s) => s.familia === 'ppto').map((s) => s.slug))
  const merge = mergeConprelTuplas(env, madridTuplas, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'Ministerio de Hacienda',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  check('merge no pierde slugs preexistentes', merge.slugsPerdidos.length === 0, merge.slugsPerdidos.join(','))
  check('merge escribe tuplas', merge.tuplasEscritas === madridTuplas.length, String(merge.tuplasEscritas))
  check('slug irpf intacto tras merge', env.indicators.some((i) => i.slug === 'irpf_media'))
  const json = JSON.stringify(env)
  const gate = cabeEnvelope(json)
  check('envelope de prueba <150 KB', gate.ok, `${gate.bytes} B`)
  const big = { ...env, valores: Array.from({ length: 5000 }, () => [0, 2025, 1, 'euros', 0, 0, 'X', null, 's']) }
  check('envelope gigante NO cabe', cabeEnvelope(JSON.stringify(big)).ok === false)

  // idempotencia: segundo merge con mismas tuplas no duplica slugs indicators
  const antes = env.indicators.length
  mergeConprelTuplas(env, madridTuplas, {
    sourceSlug: 'hacienda_conprel',
    organismo: 'Ministerio de Hacienda',
    nombreFuente: 'CONPREL',
    slugsARemplazar: slugsPpto,
  })
  check('segundo merge no duplica indicators', env.indicators.length === antes, `${antes} → ${env.indicators.length}`)

  // ── 11. gate de escritura ───────────────────────────────────────────────
  console.log('\n— gate de escritura —')
  check(
    'sin flag → dry-run (defecto)',
    resolveWriteGate({ confirmFlag: false, envValue: undefined }).mode === 'dry-run',
  )
  check(
    'confirm sin env → abort',
    resolveWriteGate({ confirmFlag: true, envValue: undefined }).mode === 'abort',
  )
  check(
    'confirm con env erróneo → abort',
    resolveWriteGate({ confirmFlag: true, envValue: 'si' }).mode === 'abort',
  )
  check(
    'confirm + env=autorizado → write',
    resolveWriteGate({ confirmFlag: true, envValue: 'autorizado' }).mode === 'write',
  )
  check(
    'solo env=autorizado sin flag → abort',
    resolveWriteGate({ confirmFlag: false, envValue: 'autorizado' }).mode === 'abort',
  )
  check(
    '--dry-run explícito solo → dry-run',
    resolveWriteGate({ confirmFlag: false, envValue: undefined, dryRunExplicit: true }).mode === 'dry-run',
  )
  check(
    '--dry-run + confirm + env → abort (conflicto)',
    resolveWriteGate({ confirmFlag: true, envValue: 'autorizado', dryRunExplicit: true }).mode === 'abort',
  )

  // ── resumen ─────────────────────────────────────────────────────────────
  console.log(`\n=== RESULTADO: ${passes} OK · ${failures} FAIL ===`)
  if (failures > 0) process.exit(1)
  process.exit(0)
}

main()
