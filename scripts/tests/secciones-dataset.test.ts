// Tests del CONTRATO BAJO DEMANDA de las secciones censales.
//
// Qué se comprueba aquí, y por qué estos ficheros:
//
//  - `socideas-secciones.ts`: la validación fail-closed de la forma compacta
//    (`validarAtlasCompacto`), que sustituye a la del expandido en la ruta.
//  - `socideas-secciones-dataset.ts`: el contrato nuevo. El bootstrap no lleva
//    observaciones ni geometría duplicada; el bloque es columnar `{p,v,s}` y se
//    rehidrata sin pérdida contra el catálogo.
//  - `socideas-secciones-extension.ts`: el filtro de indicador de
//    `fusionarEducacion` y `fusionarPolitica`, que es lo que hace que el arreglo
//    sirva de algo (sin él, los dominios seguían materializando ~40 MB).
//  - `socideas-secciones-store.ts`: que `expandirAtlas` sigue produciendo el
//    contrato completo y ya no recorre las series una vez por indicador.
//
// Nada de red: todo se monta con objetos en memoria. No hay peticiones a R2, ni
// a Supabase, ni a producción.
//
// Uso: npx tsx --test scripts/tests/secciones-dataset.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  expandirObservaciones,
  validarAtlasCompacto,
  validarSeccionesAtlas,
  type SeccionFeature,
  type SeccionesAtlasR2V1,
  type SeccionesSeriesCompactas,
} from '../../src/lib/socideas-secciones'
import { expandirAtlas, LIMITE_DATA_CACHE } from '../../src/lib/socideas-secciones-store'
import {
  SECCIONES_BOOTSTRAP_SCHEMA,
  SECCIONES_DATASET_SCHEMA,
  atlasBootstrapDe,
  construirBloqueDataset,
  compactarObservacionesIndicador,
  esDominioSecciones,
  estimarBytesBloque,
  expandirIndicadorCompacto,
  extraerSerieIndicador,
  featuresComoGeoJson,
  periodoPorDefectoDe,
  validarGanadoras,
  validarSerieBloque,
} from '../../src/lib/socideas-secciones-dataset'
import {
  POLITICAL_INDICATOR_IDS,
  fusionarCatalogos,
  fusionarEducacion,
  fusionarPolitica,
  idIndicadorCandidatura,
} from '../../src/lib/socideas-secciones-extension'
import {
  EDUCATION_INDICATORS,
  type EducationMunicipalObject,
} from '../../src/lib/socideas-secciones-education'
import {
  type PoliticalCatalog,
  type PoliticalMunicipalObject,
} from '../../src/lib/socideas-secciones-political'

// ─────────────────────────────────────────────────────────────────────────────
// Municipio PEQUEÑO: 02001 (Abén) con 3 secciones censales
// ─────────────────────────────────────────────────────────────────────────────

const INE = '02001'
const SECCIONES = ['0200101001', '0200101002', '0200101003']
const RENTA = 'renta_neta_media_persona'
const GINI = 'gini_p80_p20'

function feature(cusec: string): SeccionFeature {
  return {
    type: 'Feature',
    properties: {
      CUSEC: cusec,
      CSEC: cusec.slice(7),
      CDIS: cusec.slice(5, 7),
      CUDIS: cusec.slice(5, 7),
      CUMUN: INE,
      CMUN: '01',
      CPRO: '02',
      NMUN: 'Abén',
      NPRO: 'Albacete',
      TIPO: null,
    },
    // Polígono cuadrado: la forma da igual, el tamaño del bloque no depende de
    // ella (la geometría va solo en el bootstrap).
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
  }
}

function indicadorBase(id: string, tabla: string): SeccionesAtlasR2V1['indicators'][number] {
  return {
    id,
    etiqueta: id === RENTA ? 'Renta neta media por persona — estrategia' : 'Índice de desigualdad P80−P20 · 90/10',
    municipalityName: 'Abén',
    tema: 'renta',
    operation: '30658',
    operationLabel: 'ADRH provincial',
    sourceTable: tabla,
    sourceLabel: 'Total',
    tableFamily: id === RENTA ? 'renta' : 'gini',
    url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30658',
    unidad: id === RENTA ? 'euros' : 'puntos',
    universo: 'Personas con 16 años o más',
    denominador: id === RENTA ? null : 'Población con ingresos',
    definicion: 'Definición con acentos: educación, población, año, sección.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'ND',
  }
}

/** Objeto compacto tal y como se publica en R2: 2 indicadores × 2 periodos ×
 *  3 secciones, con un ND real en la tercera sección de renta. */
function atlasCompacto(overrides: Partial<SeccionesAtlasR2V1> = {}): SeccionesAtlasR2V1 {
  const series: SeccionesSeriesCompactas = {
    [SECCIONES[0]]: {
      [RENTA]: [
        { p: 2022, v: 24310.55, s: 'observado' },
        { p: 2023, v: 25744.9, s: 'observado' },
      ],
      [GINI]: [
        { p: 2022, v: 28.4, s: 'observado' },
        { p: 2023, v: 29.1, s: 'observado' },
      ],
    },
    [SECCIONES[1]]: {
      [RENTA]: [
        { p: 2022, v: 23120.1, s: 'observado' },
        // ND con nota: secreto estadístico. NUNCA 0.
        { p: 2023, v: null, s: 'no_difundido', n: 'Secreto estadístico: se proporciona la cota superior.' },
      ],
      [GINI]: [{ p: 2023, v: 31.75, s: 'observado' }],
    },
    [SECCIONES[2]]: {
      [RENTA]: [{ p: 2022, v: 19800, s: 'observado' }],
      [GINI]: [{ p: 2022, v: 33.2, s: 'observado' }],
    },
  }
  return {
    schemaVersion: 'secciones-atlas-r2-v1',
    municipalityIne: INE,
    municipalityName: 'Abén',
    provinceName: 'Albacete',
    geometryYear: 2025,
    geometryCollection: 'Secciones censales 2025',
    geometrySource: 'Seccionado cedido por el Instituto Nacional de Estadística',
    geometryCrs: 'EPSG:4326',
    geometryRetrievedAt: '2026-01-10T00:00:00.000Z',
    statsRetrievedAt: '2026-01-11T00:00:00.000Z',
    generatedAt: '2026-01-12T00:00:00.000Z',
    indicators: [indicadorBase(RENTA, '30658'), indicadorBase(GINI, '37678')],
    cobertura: [
      { indicatorId: RENTA, periodos: [2023, 2022], periodoPorDefecto: 2023, seccionesConDato: 2, seccionesSinDifundir: 1, seccionesSinCobertura: 0 },
      { indicatorId: GINI, periodos: [2023, 2022], periodoPorDefecto: 2023, seccionesConDato: 2, seccionesSinDifundir: 0, seccionesSinCobertura: 0 },
    ],
    sections: SECCIONES.map(feature),
    series,
    municipalReference: { [`${RENTA}|2023`]: 25400, [`${GINI}|2023`]: 29.9 },
    quality: {
      territoryMatch: 'exact',
      seccionesSinFila: [],
      filasSinPoligono: [],
      poligonosInvalidos: [],
      poligonosVacios: [],
      poligonosMulti: [],
      clavesDuplicadas: [],
      hayDesfaseTemporal: false,
      notas: ['Geometría y estadística del mismo periodo.'],
      status: 'passed',
    },
    sourceChecksums: { adrhProvincial: 'a'.repeat(64), censoSexoEdad: 'b'.repeat(64) },
    schemaChecksum: 'c'.repeat(64),
    ...overrides,
  }
}

// ─── Educación ──────────────────────────────────────────────────────────────

const EDU_PERIODO = 2024
const EDU_IND = 'edu_pct_educacion_superior'

function objetoEducativo(): EducationMunicipalObject {
  const seccion = (sectionCode: string, superior: number | null, nd: boolean) => ({
    sectionCode,
    municipalityCode: INE,
    provinceCode: '02',
    sourceLabel: `${sectionCode} Abén sección`,
    values: {
      [EDU_IND]: {
        value: superior,
        numerator: superior === null ? null : 100,
        denominator: superior === null ? null : 1000,
        status: superior === null ? 'no_difundido' : 'observado',
        nd_flag: nd,
        suppression_flag: nd,
        reason: nd ? 'statistical_confidentiality' : null,
      },
      edu_personas_total: {
        value: superior === null ? null : 1000,
        numerator: superior === null ? null : 1000,
        denominator: null,
        status: superior === null ? 'no_difundido' : 'observado',
        nd_flag: nd,
        suppression_flag: nd,
        reason: null,
      },
    },
  })
  return {
    schema_version: 'education-v1',
    domain: 'education',
    period: EDU_PERIODO,
    municipality_code: INE,
    municipality_name: 'Abén',
    province_code: '02',
    parser_version: '1',
    mapping_version: '1',
    source: {
      url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=66645',
      operation: '66707',
      education_table: 66645,
      activity_table: 66647,
      education_sha256: 'd'.repeat(64),
      activity_sha256: 'e'.repeat(64),
      retrieved_at: '2026-01-05T00:00:00.000Z',
    },
    sections: [seccion(SECCIONES[0], 34.2, false), seccion(SECCIONES[1], null, true)],
    coverage: {
      result_sections: 2,
      sections_with_data: 1,
      sections_suppressed: 1,
      indicators: 2,
      observations: 4,
      nd: 1,
      suppressed: 1,
    },
    indicator_availability: {},
    validation: {
      leading_zeros_preserved: true,
      municipalities_matched: true,
      percentages_in_range: true,
      denominators_resolved: true,
      issues: [],
    },
    quality_flags: [],
    content_sha256: 'f'.repeat(64),
  }
}

// ─── Política ───────────────────────────────────────────────────────────────

const CONVOCATORIA = '2023-05-28-mun'
const CAND_A = 'C001'
const CAND_B = 'C002'

function objetoPolitico(): PoliticalMunicipalObject {
  const seccion = (sectionKey: string, votos: Record<string, number>, validos: number) => ({
    sectionKey,
    provinceCode: '02',
    municipalityCode: INE,
    districtCode: sectionKey.slice(5, 7),
    sectionCode: sectionKey.slice(7),
    pollingStations: ['001', '002'],
    census: 1000,
    voters: 800,
    abstentions: 200,
    validVotes: validos,
    blankVotes: 10,
    nullVotes: 5,
    candidacyVotes: validos - 10,
    votes: votos,
    participationPct: 80,
    abstentionPct: 20,
    blankPct: 1.25,
    nullPct: 0.63,
    winnerId: Object.keys(votos)[0] ?? null,
    runnerUpId: Object.keys(votos)[1] ?? null,
    winnerPct: 50,
    runnerUpPct: 30,
    marginPoints: 20,
    top2ConcentrationPct: 80,
    tie: false,
    status: 'observado' as const,
    geometryMatch: true,
    notes: [],
  })
  return {
    schema_version: 'political-v1',
    domain: 'political',
    electionId: CONVOCATORIA,
    electionType: 'municipal',
    electionDate: '2023-05-28',
    territoryCode: null,
    municipalityCode: INE,
    municipalityName: 'Abén',
    provinceCode: '02',
    sourceId: 'interior-05-06',
    parserVersion: '1',
    source: {
      authority: 'Ministerio del Interior',
      url: 'https://infoelectoral.interior.gob.es/',
      fileName: 'municipales.csv',
      sha256: '1'.repeat(64),
      definitive: true,
      licence: 'Uso público',
      retrievedAt: '2026-01-08T00:00:00.000Z',
    },
    candidacies: [
      { id: CAND_A, acronym: 'AAA', name: 'Alternativa de Albacete', type: 'local', sourceCode: 'C001', color: '#111111' },
      { id: CAND_B, acronym: 'BBB', name: 'BloqueNOSPA', type: 'party', sourceCode: 'C002', color: '#222222' },
    ],
    sections: [
      seccion(SECCIONES[0], { [CAND_A]: 300, [CAND_B]: 180 }, 490),
      seccion(SECCIONES[1], { [CAND_A]: 200, [CAND_B]: 260 }, 470),
    ],
    totals: {
      census: 2000,
      voters: 1600,
      validVotes: 960,
      blankVotes: 20,
      nullVotes: 10,
      candidacyVotes: 940,
      votes: { [CAND_A]: 500, [CAND_B]: 440 },
    },
    reconciliation: {
      status: 'exact_match',
      reference: 'interior-05-06',
      sectionTotals: {
        census: 2000,
        voters: 1600,
        validVotes: 960,
        blankVotes: 20,
        nullVotes: 10,
        candidacyVotes: 940,
        votes: { [CAND_A]: 500, [CAND_B]: 440 },
      },
      referenceTotals: null,
      differences: {},
      notes: [],
    },
    geometry: {
      geometryYear: 2023,
      geometrySource: 'Seccionado cedido por el Instituto Nacional de Estadística',
      electionDate: '2023-05-28',
      correspondenceStatus: 'exact',
      resultSections: 2,
      geometrySections: 3,
      matchedSections: 2,
      unmatchedResultSections: [],
      unmatchedGeometrySections: [SECCIONES[2]],
      coveragePercentage: 100,
      notes: [],
    },
    publication: { publishable: true, reason: null, warnings: [] },
    content_sha256: '2'.repeat(64),
  }
}

const CATALOGO: PoliticalCatalog = {
  schema_version: 'political-v1',
  domain: 'political',
  synced_at: '2026-01-08T00:00:00.000Z',
  elections: [
    {
      electionId: CONVOCATORIA,
      electionType: 'municipal',
      electionDate: '2023-05-28',
      label: 'Municipales 2023',
      territoryCode: null,
      sourceIds: ['interior-05-06'],
      definitive: true,
      municipalities: 8131,
      publishableMunicipalities: 8120,
      sections: 57600,
      pollingStations: 231000,
      municipalityCodes: [INE],
    },
  ],
}

// ─── Madrid sintético ────────────────────────────────────────────────────────

/** Réplica de tamaño: 2 462 secciones, 127 indicadores, 9 periodos. Solo se
 *  usan los contadores y el coste por celda, que es lo que se mide. */
const N_MADRID = 2462
const N_INDICADORES_MADRID = 127
const N_PERIODOS_MADRID = 9

function cusecMadrid(i: number): string {
  // 28079 + distrito + sección, siempre 10 dígitos y nunca agregado (slice≠000).
  return `28079${String(Math.floor(i / 1000) + 1).padStart(2, '0')}${String((i % 1000) + 1).padStart(3, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validación fail-closed de la forma compacta
// ─────────────────────────────────────────────────────────────────────────────

test('el atlas compacto válido pasa la validación del servidor', () => {
  const v = validarAtlasCompacto(atlasCompacto())
  assert.equal(v.ok, true, `errores: ${v.errores.join(' | ')}`)
  assert.deepEqual(v.errores, [])
})

test('un ND con número es un error: nunca un 0 disfrazado', () => {
  const c = atlasCompacto()
  c.series[SECCIONES[0]]![RENTA] = [{ p: 2023, v: 0, s: 'no_difundido' }]
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, false)
  assert.ok(v.errores.some((e) => e.includes('un ND nunca lleva número')))
})

test('un observado sin valor es un error', () => {
  const c = atlasCompacto()
  c.series[SECCIONES[0]]![RENTA] = [{ p: 2023, v: null, s: 'observado' }]
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, false)
  assert.ok(v.errores.some((e) => e.includes('Estado "observado" sin valor')))
})

test('un estado fuera del vocabulario es un error', () => {
  const c = atlasCompacto()
  c.series[SECCIONES[0]]![RENTA] = [{ p: 2023, v: 1, s: 'inventado' as never }]
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, false)
  assert.ok(v.errores.some((e) => e.includes('desconocido')))
})

test('una sección que no es del municipio es un error', () => {
  const c = atlasCompacto()
  c.series['0300199001'] = { [RENTA]: [{ p: 2023, v: 1, s: 'observado' }] }
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, false)
  assert.ok(v.errores.some((e) => e.includes('otro municipio')))
})

test('el polígono agregado de distrito no es una sección', () => {
  const c = atlasCompacto()
  c.sections = [...c.sections, feature('0200101000')]
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, false)
  assert.ok(v.errores.some((e) => e.includes('agregado de distrito')))
})

test('un indicador desconocido en series es un error', () => {
  const c = atlasCompacto()
  c.series[SECCIONES[0]]!['indicador_inventado'] = [{ p: 2023, v: 1, s: 'observado' }]
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, false)
  assert.ok(v.errores.some((e) => e.includes('indicador desconocido')))
})

test('sin cobertura es aviso, no error: el periodo se deduce del bloque', () => {
  const c = atlasCompacto()
  // @ts-expect-error se borra a propósito para probar el aviso
  delete c.cobertura
  const v = validarAtlasCompacto(c)
  assert.equal(v.ok, true)
  assert.ok(v.avisos.some((a) => a.includes('cobertura ausente')))
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. El bootstrap: sin observaciones y sin geometría duplicada
// ─────────────────────────────────────────────────────────────────────────────

test('el atlas del bootstrap no lleva observaciones ni secciones', () => {
  const b = atlasBootstrapDe(atlasCompacto())
  assert.deepEqual(b.observations, {}, 'observations debe llegar vacío, no ausente')
  assert.equal('sections' in b, false, 'la geometría no se duplica dentro del atlas')
  assert.equal(b.schemaVersion, 'secciones-atlas-v1')
  assert.equal(b.indicators.length, 2)
  assert.equal(b.cobertura.length, 2)
  assert.equal(b.quality.status, 'passed')
  assert.equal(b.schemaChecksum, 'c'.repeat(64))
})

test('la geometría viaja UNA vez en el bootstrap', () => {
  const c = atlasCompacto()
  const bootstrap = {
    schemaVersion: SECCIONES_BOOTSTRAP_SCHEMA,
    geojson: featuresComoGeoJson(c.sections, () => true),
    atlas: atlasBootstrapDe(c),
  }
  const json = JSON.stringify(bootstrap)
  for (const cusec of SECCIONES) {
    const apariciones = json.split(`"CUSEC":"${cusec}"`).length - 1
    assert.equal(apariciones, 1, `${cusec} aparece ${apariciones} veces: la geometría está duplicada`)
  }
  // Y el atlas del bootstrap no contiene ninguna coordenada.
  assert.equal(JSON.stringify(bootstrap.atlas).includes('coordinates'), false)
})

test('el filtro de geometría descarta lo que no es sección', () => {
  const c = atlasCompacto()
  const geojson = featuresComoGeoJson(
    [...c.sections, feature('0200101000'), { type: 'Feature', properties: { CUSEC: 'basura' }, geometry: null } as never],
    (f) => /^\d{10}$/.test(f.properties.CUSEC) && f.properties.CUSEC.slice(7) !== '000',
  )
  assert.equal(geojson.features.length, 3)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. El bloque de dataset: columnar, sin rehidratar
// ─────────────────────────────────────────────────────────────────────────────

test('el bloque trae solo el indicador y el periodo pedidos', () => {
  const c = atlasCompacto()
  const { series, nValores } = extraerSerieIndicador(c.series, RENTA, { periodo: 2023 })
  assert.deepEqual(Object.keys(series), [SECCIONES[0], SECCIONES[1]])
  assert.equal(nValores, 2)
  for (const valores of Object.values(series)) {
    assert.equal(valores.length, 1, 'no se envían los dos años')
    assert.equal(valores[0]!.p, 2023)
  }
})

test('el bloque es la forma {p,v,s}: ni una propiedad de metadato', () => {
  const { series } = extraerSerieIndicador(atlasCompacto().series, RENTA, { periodo: 2023 })
  const celda = series[SECCIONES[1]]![0]!
  assert.deepEqual(Object.keys(celda).sort(), ['p', 's', 'v', 'n'].sort())
  assert.equal(celda.v, null)
  assert.equal(celda.s, 'no_difundido')
  assert.match(String(celda.n), /cota superior/)
})

test('el bloque se rehidrata sin pérdida contra el catálogo', () => {
  const c = atlasCompacto()
  const meta = c.indicators.find((i) => i.id === RENTA)!
  const { series } = extraerSerieIndicador(c.series, RENTA, { periodo: 2023 })

  const rehidratado = expandirIndicadorCompacto(series, {
    indicador: meta,
    municipalityIne: INE,
    geometryYear: c.geometryYear,
    periodoClave: '2023',
    retrievedAt: c.statsRetrievedAt,
    checksum: c.sourceChecksums.adrhProvincial,
  })

  // Lo mismo que habría producido la expansión completa del servidor.
  const expandido = expandirObservaciones(c.series, {
    municipalityIne: INE,
    geometryYear: c.geometryYear,
    operation: meta.operation,
    sourceTable: meta.sourceTable,
    unit: meta.unidad,
    denominator: meta.denominador,
    sourceUrl: meta.url,
    publishedAt: null,
    retrievedAt: c.statsRetrievedAt,
    checksum: c.sourceChecksums.adrhProvincial,
  }, { anio: 2023, indicadores: [RENTA] })

  const esperado: Record<string, Record<string, unknown>> = {}
  for (const [seccion, porInd] of Object.entries(expandido)) {
    esperado[seccion] = porInd[RENTA]!
  }
  assert.deepEqual(rehidratado, esperado)
})

test('el ND sobrevive el viaje compacto → expandido', () => {
  const c = atlasCompacto()
  const meta = c.indicators.find((i) => i.id === RENTA)!
  const { series } = extraerSerieIndicador(c.series, RENTA, { periodo: 2023 })
  const obs = expandirIndicadorCompacto(series, {
    indicador: meta,
    municipalityIne: INE,
    geometryYear: c.geometryYear,
    periodoClave: '2023',
  })[SECCIONES[1]]!['2023']!
  assert.equal(obs.value, null)
  assert.equal(obs.status, 'no_difundido')
  assert.equal(admite(obs.status), false)
  assert.equal(obs.referencePeriod, 2023)
  assert.equal(obs.sectionKey, SECCIONES[1])
})

function admite(status: string): boolean {
  return status !== 'no_difundido' && status !== 'sin_cobertura' && status !== 'no_aplicable' && status !== 'error_ingesta'
}

test('el bloque se valida con las mismas reglas que el objeto publicado', () => {
  const ok = validarSerieBloque(extraerSerieIndicador(atlasCompacto().series, RENTA, { periodo: 2023 }).series, {
    municipalityIne: INE,
    indicatorId: RENTA,
  })
  assert.equal(ok.ok, true, ok.errores.join(' | '))

  const roto = validarSerieBloque(
    { [SECCIONES[0]]: [{ p: 2023, v: 3, s: 'no_difundido' }] },
    { municipalityIne: INE, indicatorId: RENTA },
  )
  assert.equal(roto.ok, false)
  assert.ok(roto.errores.some((e) => e.includes('un ND nunca lleva número')))
})

test('el bloque cuenta secciones y valores sin rehidratar', () => {
  const extraido = extraerSerieIndicador(atlasCompacto().series, GINI, { periodo: null })
  const bloque = construirBloqueDataset({
    codigoIne: INE,
    dominio: 'base',
    indicador: GINI,
    periodo: null,
    periodoClave: null,
    indicadorMeta: atlasCompacto().indicators[1]!,
    series: extraido.series,
    nValores: extraido.nValores,
  })
  assert.equal(bloque.schemaVersion, SECCIONES_DATASET_SCHEMA)
  assert.equal(bloque.n_secciones, 3)
  assert.equal(bloque.n_valores, 4)
  assert.equal(bloque.indicador, GINI)
})

test('el periodo por defecto sale de la cobertura, nunca se inventa', () => {
  const c = atlasCompacto()
  assert.equal(periodoPorDefectoDe(RENTA, c.cobertura, c.series), 2023)
  assert.equal(periodoPorDefectoDe('no_existe', c.cobertura, c.series), null)
  // Sin cobertura, se deduce de las propias celdas (y sigue siendo un año real).
  assert.equal(periodoPorDefectoDe('tampoco', undefined, c.series), null)
})

test('solo los dominios conocidos se aceptan', () => {
  assert.equal(esDominioSecciones('base'), true)
  assert.equal(esDominioSecciones('educacion'), true)
  assert.equal(esDominioSecciones('politica'), true)
  assert.equal(esDominioSecciones('nacional'), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tamaño: el motivo de todo el contrato
// ─────────────────────────────────────────────────────────────────────────────

test('Madrid, un indicador y un año: el bloque cabe de sobra en el Data Cache', () => {
  const claves: string[] = []
  for (let i = 0; i < N_MADRID; i++) claves.push(cusecMadrid(i))
  const series: Record<string, Array<{ p: number; v: number; s: 'observado' }>> = {}
  for (const c of claves) {
    series[c] = [
      // Incluye decimales largos y ND, que es el caso caro.
      { p: 2023, v: 32451.78, s: 'observado' },
    ]
  }
  const extraido = extraerSerieIndicador(
    Object.fromEntries(claves.map((c) => [c, { [RENTA]: series[c]! }])),
    RENTA,
    { periodo: 2023 },
  )
  const bloque = construirBloqueDataset({
    codigoIne: '28079',
    dominio: 'base',
    indicador: RENTA,
    periodo: 2023,
    periodoClave: '2023',
    indicadorMeta: atlasCompacto().indicators[0]!,
    series: extraido.series,
    nValores: extraido.nValores,
  })
  const bytes = Buffer.byteLength(JSON.stringify(bloque), 'utf8')
  assert.equal(bloque.n_secciones, N_MADRID)
  // Medido en producción: ~0,15 MB. El presupuesto del enunciado es 0,2 MB.
  assert.ok(bytes < 200_000, `el bloque ocupa ${bytes} B, más de lo previsto`)
  assert.ok(bytes < LIMITE_DATA_CACHE, 'el bloque tiene que caber en el Data Cache')
  assert.ok(bytes / N_MADRID < 85, `cada celda ocupa ${(bytes / N_MADRID).toFixed(1)} B, el previsto era ≤85`)
  // Y la estimación que decide la caché tiene que ser una cota: nunca menor.
  assert.ok(estimarBytesBloque(bloque.n_secciones, bloque.n_valores) >= bytes)
})

test('el bloque compacto es ~6× más pequeño que las observaciones expandidas', () => {
  const c = atlasCompacto()
  const { series } = extraerSerieIndicador(c.series, RENTA, { periodo: 2023 })
  const celda = series[SECCIONES[0]]![0]!
  const bytesCompactos = Buffer.byteLength(JSON.stringify(celda), 'utf8')
  const bytesExpandidos = Buffer.byteLength(
    JSON.stringify({
      sectionKey: SECCIONES[0],
      municipalityIne: INE,
      geometryYear: c.geometryYear,
      referencePeriod: celda.p,
      operation: '30658',
      sourceTable: '30658',
      indicatorId: RENTA,
      dimensions: { ambito: 'seccion_censal' },
      value: celda.v,
      unit: 'euros',
      denominator: null,
      status: celda.s,
      sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30658',
      publishedAt: null,
      retrievedAt: c.statsRetrievedAt,
      checksum: c.sourceChecksums.adrhProvincial,
      methodologyNote: null,
    }),
    'utf8',
  )
  assert.ok(bytesCompactos <= 60, `celda compacta ${bytesCompactos} B`)
  assert.ok(bytesExpandidos >= 400, `observación expandida ${bytesExpandidos} B`)
  assert.ok(bytesExpandidos / bytesCompactos >= 5)
})

test('el atlas entero de Madrid son cientos de megabytes; el bloque, cientos de KB', () => {
  // Cuenta de celdas del objeto publicado: 2 462 secciones × 127 indicadores ×
  // 9 periodos. Se usa el coste por celda medido, no se materializa nada.
  const celdas = N_MADRID * N_INDICADORES_MADRID * N_PERIODOS_MADRID
  const bytesPorCelda = 530
  const mbAtlas = Math.round((celdas * bytesPorCelda) / 1024 / 1024)
  assert.ok(mbAtlas > 250, `el atlas expandido debería pesar cientos de MB (${mbAtlas} MB)`)
  // El cliente solo lee 1 indicador y 1 periodo: 2 462 celdas de esas 2,8 M.
  const fraccionUtil = (N_MADRID * 1 * 1) / celdas
  assert.ok(fraccionUtil < 0.001, 'lo que se sirve es menos del 0,1 % de lo que se enviaba')
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. UTF-8 válido (etiquetas, avisos y notas con acentos y símbolos)
// ─────────────────────────────────────────────────────────────────────────────

test('el bootstrap y el bloque son JSON UTF-8 válido y con acentos intactos', () => {
  const c = atlasCompacto()
  const bootstrap = JSON.stringify({
    schemaVersion: SECCIONES_BOOTSTRAP_SCHEMA,
    geojson: featuresComoGeoJson(c.sections, () => true),
    atlas: atlasBootstrapDe(c),
    avisos: ['Secreto estadístico: se proporciona la cota superior. Año 2023 — sección nº 1.'],
  })
  const bloque = JSON.stringify(
    construirBloqueDataset({
      codigoIne: INE,
      dominio: 'base',
      indicador: RENTA,
      periodo: 2023,
      periodoClave: '2023',
      indicadorMeta: c.indicators[0],
      series: extraerSerieIndicador(c.series, RENTA, { periodo: 2023 }).series,
      nValores: 2,
    }),
  )

  for (const [nombre, texto] of [['bootstrap', bootstrap], ['bloque', bloque]] as const) {
    const bytes = Buffer.from(texto, 'utf8')
    const decodificado = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    assert.equal(decodificado, texto, `${nombre} no decodifica como UTF-8`)
    assert.equal(Buffer.byteLength(decodificado, 'utf8'), bytes.byteLength)
  }
  assert.ok(bootstrap.includes('Renta neta media por persona —'))
  assert.ok(bootstrap.includes('estrategia'))
  assert.ok(bootstrap.includes('Abén'))
  assert.ok(bootstrap.includes('Seccionado cedido por el Instituto Nacional'))
  // El ND con acentos viaja dentro del bloque, no se pierde ni se escapa.
  assert.ok(bloque.includes('cota superior'))
  assert.ok(bloque.includes('\\u00ed') === false, 'no debe haber escapes Unicode: el JSON es legible')
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. El filtro de indicador de las fusiones (sin esto el arreglo no sirve)
// ─────────────────────────────────────────────────────────────────────────────

function contarCeldas(observaciones: Record<string, Record<string, Record<string, unknown>>>): number {
  let n = 0
  for (const porInd of Object.values(observaciones)) {
    for (const porPeriodo of Object.values(porInd)) n += Object.keys(porPeriodo).length
  }
  return n
}

test('fusionarEducacion: el filtro deja 1 indicador y reduce las celdas', () => {
  const objetos = [objetoEducativo()]
  const completa = fusionarEducacion(INE, objetos)
  const filtrada = fusionarEducacion(INE, objetos, { indicadores: [EDU_IND] })

  assert.ok(completa.indicadores.length >= 2, 'sin filtro salen los indicadores con datos del Censo')
  assert.equal(filtrada.indicadores.length, 1)
  assert.equal(filtrada.indicadores[0]!.id, EDU_IND)
  assert.equal(filtrada.cobertura.length, 1)
  assert.equal(filtrada.cobertura[0]!.indicatorId, EDU_IND)

  const celdasCompletas = contarCeldas(completa.observaciones)
  const celdasFiltradas = contarCeldas(filtrada.observaciones)
  assert.ok(celdasFiltradas < celdasCompletas, `${celdasFiltradas} no es menor que ${celdasCompletas}`)
  assert.equal(celdasFiltradas, 2, 'una celda por sección del indicador pedido')
  // Toda celda materializada es del indicador pedido: nada más se cuela.
  for (const porInd of Object.values(filtrada.observaciones)) {
    assert.deepEqual(Object.keys(porInd), [EDU_IND])
  }
  assert.ok(EDUCATION_INDICATORS.length > 5, 'el catálogo tiene más indicadores que el que se pide')
})

test('fusionarEducacion: sin observaciones, el catálogo y la cobertura no cambian', () => {
  const objetos = [objetoEducativo()]
  const completa = fusionarEducacion(INE, objetos)
  const sinObs = fusionarEducacion(INE, objetos, { conObservaciones: false })

  assert.equal(contarCeldas(sinObs.observaciones), 0, 'no debe materializar ni una celda')
  assert.deepEqual(sinObs.indicadores.map((i) => i.id), completa.indicadores.map((i) => i.id))
  assert.deepEqual(sinObs.cobertura, completa.cobertura)
  // Los contadores que el bootstrap publica siguen siendo ciertos.
  assert.equal(sinObs.nd, completa.nd)
  assert.equal(sinObs.suppressed, completa.suppressed)
  assert.equal(sinObs.observations, completa.observations)
  assert.deepEqual(sinObs.seccionesConDato, completa.seccionesConDato)
  assert.deepEqual(sinObs.seccionesConDato, [SECCIONES[0]])
})

test('fusionarEducacion: filtro + sin observaciones para el bootstrap', () => {
  const r = fusionarEducacion(INE, [objetoEducativo()], { conObservaciones: false })
  assert.equal(contarCeldas(r.observaciones), 0)
  assert.ok(r.indicadores.length > 0, 'sigue habiendo catálogo que servir')
  assert.equal(r.seccionesConDato.length, 1)
})

test('fusionarPolitica: el filtro deja 1 indicador de los 5+N', () => {
  const obj = objetoPolitico()
  const completa = fusionarPolitica(obj, { catalog: CATALOGO, coverage: null, electionId: CONVOCATORIA })
  const filtrada = fusionarPolitica(obj, {
    catalog: CATALOGO,
    coverage: null,
    electionId: CONVOCATORIA,
    indicadores: [POLITICAL_INDICATOR_IDS.participation],
  })

  const nCandidaturas = obj.candidacies.length
  assert.equal(completa.indicadores.length, 5 + nCandidaturas)
  assert.equal(filtrada.indicadores.length, 1)
  assert.equal(filtrada.indicadores[0]!.id, POLITICAL_INDICATOR_IDS.participation)
  assert.equal(filtrada.cobertura.length, 1)
  const celdasCompletas = contarCeldas(completa.observaciones)
  const celdasFiltradas = contarCeldas(filtrada.observaciones)
  assert.equal(celdasFiltradas, obj.sections.length, 'una celda por sección')
  assert.equal(celdasCompletas, obj.sections.length * (5 + nCandidaturas))
  assert.ok(celdasFiltradas * (5 + nCandidaturas) === celdasCompletas)
})

test('fusionarPolitica: se puede pedir UNA candidatura suelta', () => {
  const obj = objetoPolitico()
  const idCand = idIndicadorCandidatura(CAND_B)
  const r = fusionarPolitica(obj, { catalog: CATALOGO, coverage: null, electionId: CONVOCATORIA, indicadores: [idCand] })
  assert.equal(r.indicadores.length, 1)
  assert.equal(r.indicadores[0]!.id, idCand)
  assert.equal(r.indicadores[0]!.unidad, '%')
  assert.equal(contarCeldas(r.observaciones), obj.sections.length)
  const obs = r.observaciones[SECCIONES[1]]![idCand]!['2023-05-28']!
  assert.equal(obs.status, 'observado')
  assert.ok(Math.abs((obs.value as number) - (260 / 470) * 100) < 1e-9)
})

test('fusionarPolitica: sin observaciones, el estado y las mesas siguen ciertos', () => {
  const obj = objetoPolitico()
  const completa = fusionarPolitica(obj, { catalog: CATALOGO, coverage: null, electionId: CONVOCATORIA })
  const sinObs = fusionarPolitica(obj, {
    catalog: CATALOGO,
    coverage: null,
    electionId: CONVOCATORIA,
    conObservaciones: false,
  })
  assert.equal(contarCeldas(sinObs.observaciones), 0)
  assert.equal(sinObs.status, 'available')
  assert.equal(sinObs.status, completa.status)
  assert.equal(sinObs.mesas, completa.mesas)
  assert.equal(sinObs.mesas, obj.sections.length * 2, 'dos mesas por sección')
  assert.deepEqual(sinObs.indicadores.map((i) => i.id), completa.indicadores.map((i) => i.id))
  assert.deepEqual(sinObs.cobertura, completa.cobertura)
})

test('fusionarPolitica: sin objeto, el estado explica por qué no hay dato', () => {
  const r = fusionarPolitica(null, { catalog: CATALOGO, coverage: null, electionId: CONVOCATORIA })
  assert.equal(r.indicadores.length, 0)
  assert.equal(contarCeldas(r.observaciones), 0)
  assert.equal(r.status, 'object_missing')
  assert.deepEqual(r.seccionesConDato, [])
})

test('fusionarCatalogos: el base gana y los dominios se añaden', () => {
  const base = atlasCompacto()
  const propio = { ...base.indicators[0]!, etiqueta: 'Etiqueta del base' }
  const r = fusionarCatalogos({
    indicadoresBase: [propio],
    coberturaBase: base.cobertura,
    checksumsBase: base.sourceChecksums,
    dominios: [
      { indicadores: [propio, { ...propio, id: 'nuevo_del_dominio', etiqueta: 'Nuevo' }], cobertura: [{ indicatorId: 'nuevo_del_dominio', periodos: [2024], periodoPorDefecto: 2024, seccionesConDato: 1, seccionesSinDifundir: 0, seccionesSinCobertura: 0 }] },
    ],
  })
  assert.equal(r.indicadores.length, 2, 'el duplicado no se repite')
  assert.equal(r.indicadores[0]!.etiqueta, 'Etiqueta del base')
  assert.equal(r.indicadores[1]!.id, 'nuevo_del_dominio')
  assert.equal(r.cobertura.length, 3)
  assert.equal(r.sourceChecksums.adrhProvincial, 'a'.repeat(64))
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Educación → bloque columnar (el camino que hace la ruta)
// ─────────────────────────────────────────────────────────────────────────────

test('el bloque educativo sale de las fusiones en forma {p,v,s}', () => {
  const fusion = fusionarEducacion(INE, [objetoEducativo()], { indicadores: [EDU_IND] })
  const meta = fusion.indicadores[0]!
  const periodo = fusion.cobertura[0]!.periodoPorDefecto!
  const compacto = compactarObservacionesIndicador(fusion.observaciones, { indicadorId: EDU_IND, periodo })

  assert.equal(compacto.periodoClave, String(periodo))
  assert.equal(compacto.nValores, 2)
  const celda = compacto.series[SECCIONES[0]]![0]!
  assert.deepEqual(Object.keys(celda).sort(), ['p', 's', 'v'])
  assert.equal(celda.p, periodo)
  assert.equal(celda.v, 34.2)
  assert.equal(celda.s, 'observado')

  const validacion = validarSerieBloque(compacto.series, { municipalityIne: INE, indicatorId: EDU_IND })
  assert.equal(validacion.ok, true, validacion.errores.join(' | '))

  const rehidratado = expandirIndicadorCompacto(compacto.series, {
    indicador: meta,
    municipalityIne: INE,
    geometryYear: fusion.observaciones[SECCIONES[0]]![EDU_IND]![String(periodo)]!.geometryYear,
    periodoClave: compacto.periodoClave,
    retrievedAt: objetoEducativo().source.retrieved_at,
  })
  assert.equal(rehidratado[SECCIONES[0]]![String(periodo)]!.value, 34.2)
  assert.equal(rehidratado[SECCIONES[0]]![String(periodo)]!.methodologyNote, null)
  // El ND con nota metodológica conserva la nota: no se pierde al compactar.
  assert.match(String(rehidratado[SECCIONES[1]]![String(periodo)]!.methodologyNote), /confidencialidad|cota|confidentiality/)
})

test('el bloque político indexa por convocatoria, no solo por año', () => {
  const fusion = fusionarPolitica(objetoPolitico(), {
    catalog: CATALOGO,
    coverage: null,
    electionId: CONVOCATORIA,
    indicadores: [POLITICAL_INDICATOR_IDS.participation],
  })
  const periodo = fusion.cobertura[0]!.periodoPorDefecto!
  const compacto = compactarObservacionesIndicador(fusion.observaciones, {
    indicadorId: POLITICAL_INDICATOR_IDS.participation,
    periodo,
    periodoClave: '2023-05-28',
  })
  assert.equal(compacto.periodoClave, '2023-05-28')
  assert.equal(compacto.series[SECCIONES[0]]![0]!.p, periodo, 'p sigue siendo el año estadístico')
  const v = validarSerieBloque(compacto.series, {
    municipalityIne: INE,
    indicatorId: POLITICAL_INDICATOR_IDS.participation,
  })
  assert.equal(v.ok, true, v.errores.join(' | '))
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Ganadoras: el bloque que sale del bootstrap, y su validación
// ─────────────────────────────────────────────────────────────────────────────

test('las ganadoras se validan por sección y por estado', () => {
  const ganadoras = {
    [SECCIONES[0]]: { sectionKey: SECCIONES[0], distrito: '01', mesas: 2, mesasIds: ['001', '002'], censo: 1000, votantes: 800, validos: 490, blancos: 10, nulos: 5, ganadoraId: CAND_A, ganadoraVotos: 300, ganadoraPct: 61.2, segundaId: CAND_B, segundaVotos: 180, segundaPct: 36.7, margen: 24.5, participacion: 80, abstencion: 20, empate: false, estado: 'observado' as const },
    [SECCIONES[1]]: { sectionKey: SECCIONES[1], distrito: '01', mesas: 2, mesasIds: ['001', '002'], censo: 1000, votantes: 800, validos: 470, blancos: 10, nulos: 5, ganadoraId: CAND_B, ganadoraVotos: 260, ganadoraPct: 55.3, segundaId: CAND_A, segundaVotos: 200, segundaPct: 42.6, margen: 12.7, participacion: 80, abstencion: 20, empate: false, estado: 'observado' as const },
  }
  const ok = validarGanadoras(ganadoras, INE)
  assert.equal(ok.ok, true, ok.errores.join(' | '))

  const deOtro = { ...ganadoras, '0300199001': { ...ganadoras[SECCIONES[0]]!, sectionKey: '0300199001' } }
  assert.equal(validarGanadoras(deOtro, INE).ok, false)
  const claveMala = { ...ganadoras, 'basura': { estado: 'observado' } }
  assert.equal(validarGanadoras(claveMala, INE).ok, false)
  const estadoMalo = { ...ganadoras, [SECCIONES[0]]: { ...ganadoras[SECCIONES[0]]!, estado: 'inventado' } }
  assert.equal(validarGanadoras(estadoMalo, INE).ok, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. `expandirAtlas` sigue dando el contrato completo, y ya no es O(n²)
// ─────────────────────────────────────────────────────────────────────────────

test('expandirAtlas produce el contrato completo y valida', () => {
  const c = atlasCompacto()
  const atlas = expandirAtlas(c, {})
  assert.equal(atlas.schemaVersion, 'secciones-atlas-v1')
  assert.equal(atlas.sections.length, 3)
  assert.deepEqual(Object.keys(atlas.observations).sort(), [...SECCIONES].sort())
  // 2 indicadores × 2 periodos para la primera sección.
  assert.equal(contarCeldas(atlas.observations), 9)
  const v = validarSeccionesAtlas(atlas)
  assert.equal(v.ok, true, v.errores.join(' | '))
})

test('expandirAtlas con filtro de año e indicador', () => {
  const atlas = expandirAtlas(atlasCompacto(), { anio: 2023, indicadores: [GINI] })
  assert.equal(contarCeldas(atlas.observations), 2, 'solo GINI de 2023')
  for (const porInd of Object.values(atlas.observations)) {
    assert.deepEqual(Object.keys(porInd), [GINI])
  }
  const v = validarSeccionesAtlas(atlas)
  assert.equal(v.ok, true, v.errores.join(' | '))
})

test('expandirAtlas recorre cada celda una vez (el O(n²) desapareció)', () => {
  // El coste del recorrido antiguo era indicadores × secciones × indicadores:
  // llamaba a `expandirObservaciones` sobre TODAS las secciones una vez por
  // indicador. Con un catálogo de 1 500 indicadores y 40 secciones eso son
  // 90 000 pasos de verdad; medido en esta máquina: 12,8 s. Con el índice por
  // indicador son 1 500 × 40 = 60 000 pasos: 90 ms. El umbral está en medio,
  // con un orden de margen por cada lado para que no sea una prueba de reloj.
  const nSecciones = 40
  const nIndicadores = 1500
  const series: SeccionesSeriesCompactas = {}
  const indicadores: SeccionesAtlasR2V1['indicators'] = []
  const claves: string[] = []
  for (let s = 0; s < nSecciones; s++) {
    const cusec = `28079${String(s + 1).padStart(5, '0')}`
    claves.push(cusec)
    const porInd: Record<string, Array<{ p: number; v: number; s: 'observado' }>> = {}
    for (let i = 0; i < nIndicadores; i++) {
      porInd[`ind_${i}`] = [{ p: 2023, v: i + 1, s: 'observado' }]
    }
    series[cusec] = porInd
  }
  for (let i = 0; i < nIndicadores; i++) indicadores.push(indicadorBase(`ind_${i}`, `t${i}`))

  const grande: SeccionesAtlasR2V1 = {
    ...atlasCompacto(),
    municipalityIne: '28079',
    indicators: indicadores,
    sections: claves.map((c) => feature(c)),
    series,
    cobertura: [],
  }

  const t0 = Date.now()
  const atlas = expandirAtlas(grande, { anio: 2023 })
  const ms = Date.now() - t0
  assert.equal(contarCeldas(atlas.observations), nSecciones * nIndicadores)
  assert.equal(atlas.observations[claves[0]!]!['ind_1499']!['2023']!.value, 1500)
  assert.ok(ms < 3000, `expandirAtlas tardó ${ms} ms: parece que vuelve a recorrer por indicador`)
})