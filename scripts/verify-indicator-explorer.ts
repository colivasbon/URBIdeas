// Verificación del sistema unificado de selectores (sin infraestructura).
// Datos sintéticos con casos null/secreto/serie-corta. Afirma:
//  - capacidades solo desde valores reales (sin filas → sin selector);
//  - AEAT y ADRH nunca se mezclan (fuentes separadas por indicador);
//  - un punto → snapshot sin gráfico; serie → gráfico;
//  - URL inválida → estado seguro (sin errores técnicos);
//  - null/ND jamás se convierten en 0 ni generan puntos.
// Uso: npx tsx scripts/verify-indicator-explorer.ts
import {
  capabilityPoints,
  demoCapabilities,
  ecoCapabilities,
  explorerQueryString,
  validateExplorerQuery,
} from '../src/lib/socideas-indicator-capabilities'
import type { IndicatorValue } from '../src/lib/socideas'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function v(slug: string, anio: number, valor: number | null, ambito = 'municipio'): IndicatorValue {
  return {
    id: `${slug}-${anio}-${ambito}`, municipio_codigo_ine: '99999', indicator_id: slug,
    fecha_referencia: `${anio}-01-01`, anio_referencia: anio, valor_numerico: valor,
    valor_texto: null, unidad: 'x', dimensiones: { ambito }, source_id: 's',
    source_url: 'https://www.ine.es/', source_table_id: '1', source_series_id: null,
    obtenido_en: '2026-09-06', estado_validacion: 'validado',
    indicator: { slug } as never, source: { organismo: 'INE', nombre: 'T' } as never,
  } as unknown as IndicatorValue
}

const MUNI = { codigo_ine: '99999', nombre: 'Test', poblacion: 1, provincia: 'P', provincia_codigo_ine: '99', comunidad_autonoma: 'C', centroide_lng: null, centroide_lat: null }

function main(): void {
  // --- Demografía sintética ---
  const demo = {
    municipio: MUNI, sincronizado: true, ultima_sincronizacion: null,
    total: v('population_total', 2024, 1000),
    hombres: v('population_male', 2024, 490),
    mujeres: v('population_female', 2024, null), // secreto → sin capacidad
    evolucion: [2020, 2021, 2022, 2023, 2024].map((a, i) => v('population_evolution', a, 900 + i * 25)),
    comparativas: {
      provincia: [2020, 2021, 2022, 2023, 2024].map((a, i) => ({ ...v('population_total', a, 50000 + i * 100, 'provincia'), dimensiones: { ambito: 'provincia' } })),
      ccaa: [2019, 2020, 2021].map((a) => ({ ...v('population_total', a, 800000, 'ccaa'), dimensiones: { ambito: 'ccaa' } })),
      espana: [],
    },
    piramide: { anio: null, grupos: [] },
    derivados: { cambio_5y: null, cambio_10y: null, indice_envejecimiento: null, indice_dependencia: null },
    densidad: { valor: null, pendiente: 'x' }, valores: [], disponibles: {}, filtros: {},
  }
  const dcaps = demoCapabilities(demo as never)
  const total = dcaps.find((c) => c.id === 'poblacion_total')
  check('demo: total con 3 ámbitos reales', !!total && total.scopes.length === 3, total?.scopes.map((s) => s.id).join(','))
  check('demo: nota de rezago CCAA documentada', !!total?.comparisonNote?.includes('2021'), total?.comparisonNote?.slice(0, 60))
  check('demo: total es serie con gráfico', total?.kind === 'series' && total?.supportsChart === true)
  check('demo: hombres snapshot sin gráfico', dcaps.find((c) => c.id === 'poblacion_hombres')?.kind === 'snapshot' && dcaps.find((c) => c.id === 'poblacion_hombres')?.supportsChart === false)
  check('demo: mujeres con secreto no genera capacidad', !dcaps.some((c) => c.id === 'poblacion_mujeres'))
  check('demo: sin dimensiones inventadas (nacionalidad/edad)', !JSON.stringify(dcaps).includes('nacionalidad'))

  // --- Economía sintética ---
  const ecoVals = [
    v('renta_neta_media_persona', 2022, 12000), v('renta_neta_media_persona', 2023, 12500),
    v('irpf_renta_bruta_media', 2023, 24000), // un punto → snapshot
    v('gini', 2022, 30.5), v('gini', 2023, 31.0),
    v('gini', 2022, 29.0, 'provincia'), v('gini', 2023, 29.5, 'provincia'),
    v('paro_registrado', 2023, null), // nulo → sin capacidad
  ]
  const ecaps = ecoCapabilities({ municipio: MUNI, sincronizado: true, ultima_sincronizacion: null, valores: ecoVals, ultimoPorIndicador: {}, disponibles: [] } as never)
  const ids = ecaps.map((c) => c.id)
  check('eco: solo slugs con filas reales', JSON.stringify(ids) === JSON.stringify(['renta_neta_media_persona', 'irpf_renta_bruta_media', 'gini']), ids.join(','))
  const aeat = ecaps.find((c) => c.id === 'irpf_renta_bruta_media')
  const adrh = ecaps.find((c) => c.id === 'renta_neta_media_persona')
  check('eco: AEAT snapshot sin gráfico, ADRH serie con gráfico', aeat?.kind === 'snapshot' && aeat?.supportsChart === false && adrh?.kind === 'series' && adrh?.supportsChart === true)
  check('eco: AEAT etiquetada por declaración', !!aeat?.label.includes('declaración'))
  check('eco: fuentes separadas (sin mezcla)', aeat?.source !== adrh?.source, `${aeat?.source} vs ${adrh?.source}`)
  const gini = ecaps.find((c) => c.id === 'gini')
  check('eco: gini con 2 ámbitos homogéneos', !!gini && gini.scopes.length === 2, gini?.scopes.map((s) => s.id).join(','))
  check('eco: paro nulo no genera capacidad', !ids.includes('paro_registrado'))
  check('puntos: nulls filtrados, sin ceros fabricados',
    capabilityPoints(ecoVals, 'paro_registrado').length === 0 &&
    capabilityPoints(ecoVals, 'gini', 'municipio').length === 2)

  // --- URL validada ---
  const q1 = validateExplorerQuery({ x_ind: 'gini', x_desde: '2022', x_hasta: '2023', x_ambitos: 'municipio,provincia,xx' }, ecaps)
  check('url: válida aceptada, ámbito inválido descartado',
    q1?.indId === 'gini' && q1?.desde === 2022 && q1?.hasta === 2023 && JSON.stringify(q1?.scopes) === JSON.stringify(['municipio', 'provincia']),
    explorerQueryString(q1!))
  const q2 = validateExplorerQuery({ x_ind: 'inexistente', x_desde: '2030', x_hasta: '2000' }, ecaps)
  check('url: inválida → estado seguro (primer indicador, sin rango)', q2?.indId === 'renta_neta_media_persona' && q2?.desde === null && q2?.hasta === null)
  const q3 = validateExplorerQuery({ x_ind: 'irpf_renta_bruta_media', x_anio: '1999' }, ecaps)
  check('url: año fuera de cobertura → último disponible', q3?.anio === 2023, String(q3?.anio))
  check('url: sin secretos ni payloads', !explorerQueryString(q1!).includes('token') && explorerQueryString(q1!).length < 120)
  check('url: vacía en catálogo vacío', validateExplorerQuery({}, []) === null)

  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nExplorador verificado: capacidades reales, series homogéneas y URL segura OK.')
}

main()
