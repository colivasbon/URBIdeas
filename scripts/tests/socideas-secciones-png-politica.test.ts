// Pruebas del exportador PNG del mapa POLÍTICO de secciones censales.
// Uso: npx tsx --test scripts/tests/socideas-secciones-png-politica.test.ts
//
// El defecto que motivó esto (D3): el exportador genérico no llevaba ninguna
// identidad del dataset, así que un PNG «político» puede salir como copia byte a
// byte del económico y nada lo detecta. Estas pruebas comprueban que el contrato
// político lleva esa identidad, que va FIRMADA, y que la validación rechaza
// cualquier contrato que no la cumpla ANTES de componer nada.
//
// No se usa red, Supabase ni R2: todo es memoria y funciones puras. Los dos
// casos que necesitan lienzo se comprueban por su DELEGADO al compositor, que
// en Node lanza antes de dibujar.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DOMINIO_PNG_POLITICA,
  FUENTE_DATOS_POLITICA,
  ORGANISMO_ESTADISTICA_POLITICA,
  PREFIJO_FIRMA_POLITICA,
  anioElectoral,
  calcularCoberturaPolitica,
  construirContratoPngPolitica,
  construirLeyendaCategoricaPolitica,
  construirLeyendaContinuaPolitica,
  candidaturaIdDeIndicador,
  componerPngPolitica,
  contratoExportable,
  cuerpoFirmable,
  descriptorEscalaPolitica,
  descriptorIndicadorPolitica,
  detectarTerminosEconomicos,
  esIndicadorCandidaturaPolitica,
  esIndicadorEconomico,
  esIndicadorPolitico,
  estadoSeccionPng,
  firmarContratoPolitica,
  nombreArchivoPngPolitica,
  opcionesComponerDesdeContrato,
  tituloDeContratoPolitica,
  validarContratoPngPolitica,
  type CandidaturaLeyendaPng,
  type ContratoPngPolitica,
  type EntradaContratoPngPolitica,
  type GanadoraSeccionPng,
  type LeyendaCategoricaPng,
  type SeccionSeriePng,
} from '../../src/lib/socideas-secciones-png-politica'
import type { Candidacy } from '../../src/lib/socideas-secciones-political'
import type { CorteClase } from '../../src/lib/socideas-secciones'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function candidatura(over: Partial<Candidacy> & Pick<Candidacy, 'id'>): Candidacy {
  return {
    acronym: over.acronym ?? over.id.toUpperCase(),
    name: over.name ?? `Candidatura ${over.id}`,
    type: 'party',
    sourceCode: over.id,
    aggregationCode: null,
    color: over.color ?? '#123456',
    ...over,
  }
}

const CANDIDATURAS: Candidacy[] = [
  candidatura({ id: 'A', acronym: 'PP', name: 'Partido Popular', color: '#1D4E89' }),
  candidatura({ id: 'B', acronym: 'PSOE', name: 'Partido Socialista', color: '#B32B2B' }),
  candidatura({ id: 'C', acronym: 'PP', name: 'Agrupación local PP', color: '#2E7D32' }),
]

/** Cuatro secciones: dos gana A, una gana B (con empate), una sin dato. */
const SECCIONES: SeccionSeriePng[] = [
  { sectionKey: '2807900001', valor: null, estado: 'observado' },
  { sectionKey: '2807900002', valor: null, estado: 'observado' },
  { sectionKey: '2807900003', valor: null, estado: 'observado' },
  { sectionKey: '2807900004', valor: null, estado: 'no_difundido' },
]

const GANADORAS: Record<string, GanadoraSeccionPng> = {
  '2807900001': { ganadoraId: 'A', empate: false, estado: 'observado' },
  '2807900002': { ganadoraId: 'A', empate: false, estado: 'observado' },
  '2807900003': { ganadoraId: 'B', empate: true, estado: 'observado' },
  '2807900004': { ganadoraId: null, empate: false, estado: 'no_difundido' },
}

const CORTES: CorteClase[] = [
  { min: 40, max: 55, etiqueta: '40,00 % – 55,00 %', color: '#D5EDE6', secciones: 2 },
  { min: 55, max: 70, etiqueta: '55,00 % – 70,00 %', color: '#3E665C', secciones: 1 },
]

const SECCIONES_CONTINUAS: SeccionSeriePng[] = [
  { sectionKey: '2807900001', valor: 48.2, estado: 'observado' },
  { sectionKey: '2807900002', valor: 61.5, estado: 'observado' },
  { sectionKey: '2807900003', valor: 66.1, estado: 'observado' },
  { sectionKey: '2807900004', valor: null, estado: 'no_difundido' },
]

const GEOMETRIA = {
  year: 2020,
  collection: null,
  source: 'Instituto Nacional de Estadística (INE)',
  retrievedAt: '2024-03-01T10:00:00.000Z',
}

function entrada(over: Partial<EntradaContratoPngPolitica> = {}): EntradaContratoPngPolitica {
  return {
    domain: 'political',
    municipalityCode: '28079',
    municipalityName: 'Madrid',
    electionId: 'municipal-2023-05-28',
    electionType: 'municipal',
    electionDate: '2023-05-28',
    indicatorId: 'pol_ganadora',
    candidacyId: null,
    candidaturas: CANDIDATURAS,
    secciones: SECCIONES,
    ganadoras: GANADORAS,
    cortes: null,
    escala: null,
    metodo: null,
    divergente: false,
    geometria: GEOMETRIA,
    conciliacion: null,
    correspondencia: null,
    avisos: [],
    notaLectura: 'Mapa de prueba.',
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
    generadoEn: '2026-01-02T03:04:05.000Z',
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tipado del contrato
// ─────────────────────────────────────────────────────────────────────────────

test('el dominio del contrato es el literal political, no un parámetro', () => {
  const c = construirContratoPngPolitica(entrada())
  assert.equal(DOMINIO_PNG_POLITICA, 'political')
  assert.equal(c.domain, 'political')
})

test('el catálogo de indicadores políticos acepta los suyos y rechaza los económicos', () => {
  assert.equal(esIndicadorPolitico('pol_ganadora'), true)
  assert.equal(esIndicadorPolitico('pol_participacion'), true)
  assert.equal(esIndicadorPolitico('pol_candidatura_A'), true)
  assert.equal(esIndicadorPolitico('pol_candidatura_'), false)
  assert.equal(esIndicadorPolitico('renta_neta_media_persona'), false)
  assert.equal(esIndicadorEconomico('p80_p20'), true)
  assert.equal(esIndicadorEconomico('renta_media_unidad_consumo'), true)
  assert.equal(esIndicadorEconomico('pol_margen'), false)
})

test('un identificador fuera del catálogo político lanza al pedir su descriptor', () => {
  assert.throws(() => descriptorIndicadorPolitica('indice_gini', null), /catálogo político/)
  assert.throws(() => descriptorIndicadorPolitica('p80_p20', null), /catálogo político/)
  assert.equal(descriptorIndicadorPolitica('pol_ganadora', null).type, 'winner')
  assert.equal(descriptorIndicadorPolitica('pol_participacion', null).unit, '%')
  assert.equal(descriptorIndicadorPolitica('pol_candidatura_A', 'Partido Popular').label, 'Voto a Partido Popular')
  assert.equal(candidaturaIdDeIndicador('pol_candidatura_B'), 'B')
  assert.equal(candidaturaIdDeIndicador('pol_ganadora'), null)
  assert.equal(esIndicadorCandidaturaPolitica('pol_candidatura_B'), true)
})

test('el vocabulario de estados del atlas se reduce a tres estados del contrato', () => {
  assert.equal(estadoSeccionPng('observado'), 'observado')
  assert.equal(estadoSeccionPng('derivado_verificable'), 'observado')
  assert.equal(estadoSeccionPng('sin_cobertura'), 'sin_cobertura')
  assert.equal(estadoSeccionPng('no_difundido'), 'no_difundido')
  assert.equal(estadoSeccionPng('error_ingesta'), 'no_difundido')
  assert.equal(estadoSeccionPng('no_aplicable'), 'no_difundido')
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Leyenda categórica
// ─────────────────────────────────────────────────────────────────────────────

test('la leyenda categórica cuenta por identidad y ordena por secciones ganadas', () => {
  const leyenda: LeyendaCategoricaPng = construirLeyendaCategoricaPolitica({
    secciones: SECCIONES,
    ganadoras: GANADORAS,
    candidaturas: CANDIDATURAS,
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
  })
  assert.equal(leyenda.kind, 'categorical')
  assert.deepEqual(
    leyenda.entradas.map((e) => [e.candidaturaId, e.seccionesGanadas]),
    [['A', 2], ['B', 1]],
  )
  assert.deepEqual(leyenda.entradas.map((e) => e.sigla), ['PP', 'PSOE'])
  assert.equal(leyenda.entradas[1]?.empates, 1)
  assert.equal(leyenda.entradas[0]?.empates, 0)
  assert.equal(leyenda.sinDato?.secciones, 1)
})

test('una leyenda categórica NO declara método, clases ni unidad', () => {
  const leyenda = construirLeyendaCategoricaPolitica({
    secciones: SECCIONES,
    ganadoras: GANADORAS,
    candidaturas: CANDIDATURAS,
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
  })
  assert.equal(leyenda.metodo, null)
  assert.equal(leyenda.clases, null)
  assert.equal(leyenda.escalaNumerica, null)
  assert.equal(leyenda.unidad, null)
  assert.deepEqual(leyenda.entradas.map((e) => Object.keys(e).sort()), [
    ['candidaturaId', 'color', 'empates', 'nombre', 'seccionesGanadas', 'sigla'].sort(),
    ['candidaturaId', 'color', 'empates', 'nombre', 'seccionesGanadas', 'sigla'].sort(),
  ])
})

test('el color sale de la candidatura por id aunque dos compartan sigla', () => {
  // A y C comparten sigla «PP». Un color buscado por TEXTO colapsaría ambas.
  const secciones: SeccionSeriePng[] = [
    { sectionKey: '1', valor: null, estado: 'observado' },
    { sectionKey: '2', valor: null, estado: 'observado' },
  ]
  const ganadoras: Record<string, GanadoraSeccionPng> = {
    '1': { ganadoraId: 'A', empate: false, estado: 'observado' },
    '2': { ganadoraId: 'C', empate: false, estado: 'observado' },
  }
  const leyenda = construirLeyendaCategoricaPolitica({
    secciones,
    ganadoras,
    candidaturas: CANDIDATURAS,
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
  })
  const porId = new Map<string, CandidaturaLeyendaPng>(leyenda.entradas.map((e) => [e.candidaturaId, e]))
  assert.equal(porId.size, 2)
  assert.equal(leyenda.entradas[0]?.sigla, leyenda.entradas[1]?.sigla)
  assert.notEqual(porId.get('A')?.color, porId.get('C')?.color)
  assert.equal(porId.get('A')?.color, '#1D4E89')
  assert.equal(porId.get('C')?.color, '#2E7D32')
  // Las etiquetas del compositor también se distinguen por el nombre largo.
  const conNombre = leyenda.entradas.filter((e) => e.sigla !== e.nombre)
  assert.equal(conNombre.length, 2)
})

test('una candidatura sin color declarado en la fuente recibe uno por defecto, no `null`', () => {
  const sinColor: Candidacy[] = [candidatura({ id: 'Z', acronym: 'ZX', color: null as unknown as string })]
  const leyenda = construirLeyendaCategoricaPolitica({
    secciones: [{ sectionKey: '1', valor: null, estado: 'observado' }],
    ganadoras: { '1': { ganadoraId: 'Z', empate: false, estado: 'observado' } },
    candidaturas: sinColor,
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
  })
  assert.match(String(leyenda.entradas[0]?.color), /^#[0-9a-fA-F]{6}$/)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Leyenda continua
// ─────────────────────────────────────────────────────────────────────────────

test('la leyenda continua declara método, unidad, escala y sin dato', () => {
  const leyenda = construirLeyendaContinuaPolitica({
    cortes: CORTES,
    escala: {
      min: 48.2,
      max: 66.1,
      nObservados: 3,
      valoresDistintos: 3,
      reducidoPorValoresDistintos: false,
    },
    metodo: 'cuantil',
    unidad: '%',
    divergente: false,
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
    seccionesSinDato: 1,
  })
  assert.equal(leyenda.kind, 'continuous')
  assert.equal(leyenda.metodo, 'Cuantil')
  assert.equal(leyenda.unidad, '%')
  assert.deepEqual(leyenda.entradas.map((e) => e.etiqueta), CORTES.map((c) => c.etiqueta))
  assert.equal(leyenda.clases?.nObservados, 3)
  assert.equal(leyenda.clases?.min, 48.2)
  assert.equal(leyenda.sinDato?.secciones, 1)
})

test('una leyenda con paleta divergente se declara divergente, no continua', () => {
  const leyenda = construirLeyendaContinuaPolitica({
    cortes: CORTES,
    escala: { min: -5, max: 5, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: false },
    metodo: 'intervalos_iguales',
    unidad: 'p. p.',
    divergente: true,
    colorSinDato: '#E9E9E4',
    colorContornoSinDato: '#9A9A93',
    seccionesSinDato: 1,
  })
  assert.equal(leyenda.kind, 'diverging')
  assert.equal(leyenda.metodo, 'Intervalos iguales')
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cobertura
// ─────────────────────────────────────────────────────────────────────────────

test('la cobertura se calcula sobre las secciones representadas, no sobre la correspondencia', () => {
  const cov = calcularCoberturaPolitica(SECCIONES_CONTINUAS)
  assert.deepEqual(cov, {
    seccionesRepresentadas: 3,
    seccionesTotales: 4,
    seccionesSinDato: 1,
    coberturaPct: 75,
  })
})

test('una cobertura declarada que no cuadra con su definición se rechaza', () => {
  const c = construirContratoPngPolitica(entrada())
  const roto: ContratoPngPolitica = {
    ...c,
    coverage: { ...c.coverage, coberturaPct: 99.9 },
    signature: firmarContratoPolitica({ ...c, coverage: { ...c.coverage, coberturaPct: 99.9 } }),
  }
  const fallos = validarContratoPngPolitica(roto)
  assert.ok(fallos.some((f) => f.codigo === 'cobertura'))
})

test('un municipio sin secciones no divide por cero', () => {
  const cov = calcularCoberturaPolitica([])
  assert.equal(cov.coberturaPct, 0)
  assert.equal(cov.seccionesTotales, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Firma de contenido
// ─────────────────────────────────────────────────────────────────────────────

test('la firma lleva el prefijo de dominio y cambia con cualquier campo', () => {
  const a = construirContratoPngPolitica(entrada())
  assert.ok(a.signature.startsWith(PREFIJO_FIRMA_POLITICA))
  // Otra convocatoria: firma distinta.
  const b = construirContratoPngPolitica(entrada({ electionDate: '2019-05-26', electionId: 'municipal-2019-05-26' }))
  assert.notEqual(a.signature, b.signature)
  // Otra sección con dato: firma distinta.
  const c = construirContratoPngPolitica(
    entrada({
      secciones: SECCIONES_CONTINUAS,
      indicatorId: 'pol_participacion',
      metodo: 'cuantil',
      cortes: CORTES,
      escala: { min: 48.2, max: 66.1, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: false },
    }),
  )
  assert.notEqual(a.signature, c.signature)
  // El mismo contenido exacto produce la misma firma (determinista).
  assert.equal(a.signature, construirContratoPngPolitica(entrada()).signature)
})

test('la firma no depende del ORDEN de las claves ni de la identidad del objeto', () => {
  const c = construirContratoPngPolitica(entrada())
  const desordenado = JSON.parse(JSON.stringify(c)) as ContratoPngPolitica
  assert.equal(cuerpoFirmable(c), cuerpoFirmable(desordenado))
  assert.equal(firmarContratoPolitica(c), c.signature)
})

test('un contrato manipulado DESPUÉS de firmar no supera la validación', () => {
  const c = construirContratoPngPolitica(
    entrada({
      secciones: SECCIONES_CONTINUAS,
      indicatorId: 'pol_participacion',
      cortes: CORTES,
      metodo: 'cuantil',
      escala: { min: 48.2, max: 66.1, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: false },
    }),
  )
  assert.equal(c.sectionValues[0]?.valor, 48.2)
  // Se cambia un valor sin volver a firmar: la firma ya no describe el contenido.
  const manipulado: ContratoPngPolitica = {
    ...c,
    sectionValues: c.sectionValues.map((s) => ({ ...s, valor: 999 })),
  }
  assert.equal(manipulado.sectionValues[0]?.valor, 999)
  const fallos = validarContratoPngPolitica(manipulado)
  assert.ok(fallos.some((f) => f.codigo === 'firma'))
})

test('cambiar la firma a mano también falla: la firma se recalcula', () => {
  const c = construirContratoPngPolitica(entrada())
  const conFirmaAjena: ContratoPngPolitica = { ...c, signature: `${PREFIJO_FIRMA_POLITICA}00000000-deadbeef` }
  assert.ok(validarContratoPngPolitica(conFirmaAjena).some((f) => f.codigo === 'firma'))
})

test('un dataset económico NO puede llevar la firma política ni el prefijo de dominio', () => {
  const c = construirContratoPngPolitica(entrada())
  // El constructor refuses el dataset económico: lanza antes de firmar nada.
  assert.throws(() => construirContratoPngPolitica(entrada({ indicatorId: 'renta_neta_media_persona' })), /catálogo político/)
  // Y si alguien fabrica el contrato a mano, la validación lo rechaza por dos vías.
  const firmadoComoElectoral: ContratoPngPolitica = {
    ...c,
    indicatorId: 'indice_gini',
    indicatorType: 'winner',
    signature: firmarContratoPolitica({ ...c, indicatorId: 'indice_gini', indicatorType: 'winner' }),
  }
  const codigos = validarContratoPngPolitica(firmadoComoElectoral).map((f) => f.codigo)
  assert.ok(codigos.includes('dataset'))
  assert.ok(codigos.includes('terminos-economicos'))
  assert.equal(contratoExportable(firmadoComoElectoral), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Validación:Dataset y fuente
// ─────────────────────────────────────────────────────────────────────────────

test('un contrato bien construido pasa y es exportable', () => {
  assert.deepEqual(validarContratoPngPolitica(construirContratoPngPolitica(entrada())), [])
  assert.equal(contratoExportable(construirContratoPngPolitica(entrada())), true)
})

test('un contrato bien construido también pasa en la rama continua', () => {
  const c = construirContratoPngPolitica(
    entrada({
      secciones: SECCIONES_CONTINUAS,
      indicatorId: 'pol_participacion',
      cortes: CORTES,
      metodo: 'cuantil',
      escala: { min: 48.2, max: 66.1, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: false },
    }),
  )
  assert.equal(c.valueType, 'continuous')
  assert.equal(c.classificationMethod, 'Cuantil')
  assert.equal(c.classes, 2)
  assert.equal(c.categoricalLegend, null)
  assert.ok(c.continuousLegend)
  assert.deepEqual(validarContratoPngPolitica(c), [])
})

test('rechaza un dominio distinto de political', () => {
  const c = construirContratoPngPolitica(entrada())
  const fallos = validarContratoPngPolitica({ ...c, domain: 'economic' as unknown as 'political' })
  assert.ok(fallos.some((f) => f.codigo === 'dominio'))
})

test('rechaza una fecha de convocatoria ausente o mal formada', () => {
  const c = construirContratoPngPolitica(entrada())
  for (const mala of ['', '2023', '28/05/2023', 'mayo de 2023']) {
    const fallos = validarContratoPngPolitica({ ...c, electionDate: mala })
    assert.ok(
      fallos.some((f) => f.codigo === 'electionDate'),
      `debería rechazar «${mala}»`,
    )
  }
})

test('rechaza un dataset que no es político', () => {
  const c = construirContratoPngPolitica(entrada())
  const fallos = validarContratoPngPolitica({ ...c, indicatorId: 'renta_bruta_media_hogar' })
  assert.ok(fallos.some((f) => f.codigo === 'dataset'))
  assert.deepEqual(validarContratoPngPolitica({ ...c, indicatorId: '   ' }).filter((f) => f.codigo === 'dataset').length, 1)
})

test('rechaza al INE como autoridad de los DATOS, aunque la geometría sí sea del INE', () => {
  const c = construirContratoPngPolitica(entrada())
  const conIne = {
    ...c,
    source: { ...c.source, authority: 'Instituto Nacional de Estadística (INE)' },
  }
  const firmado = { ...conIne, signature: firmarContratoPolitica(conIne) }
  const fallos = validarContratoPngPolitica(firmado)
  assert.ok(fallos.some((f) => f.codigo === 'fuente'))
  // La geometría del INE NO se toca: nominar al INE ahí es lo cierto.
  assert.equal(c.geometryReference.source, 'Instituto Nacional de Estadística (INE)')
  assert.deepEqual(validarContratoPngPolitica(c), [])
  assert.equal(c.source.authority, ORGANISMO_ESTADISTICA_POLITICA)
  assert.equal(c.source.dataset, FUENTE_DATOS_POLITICA)
})

test('rechaza una leyenda que no casa con el tipo de valor', () => {
  const c = construirContratoPngPolitica(entrada())
  // Categórico con leyenda continua además: se declaran dos datasets.
  const dosLeyendas = {
    ...c,
    continuousLegend: construirLeyendaContinuaPolitica({
      cortes: CORTES,
      escala: { min: 1, max: 2, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: false },
      metodo: 'jenks',
      unidad: '%',
      divergente: false,
      colorSinDato: '#E9E9E4',
      colorContornoSinDato: '#9A9A93',
      seccionesSinDato: 1,
    }),
  }
  const firmadas = { ...dosLeyendas, signature: firmarContratoPolitica(dosLeyendas) }
  assert.ok(validarContratoPngPolitica(firmadas).some((f) => f.codigo === 'leyenda'))
})

test('rechaza que una leyenda categórica declare un método o clases numéricas', () => {
  const c = construirContratoPngPolitica(entrada())
  const cat = c.categoricalLegend as LeyendaCategoricaPng
  const conMetodo = {
    ...c,
    categoricalLegend: { ...cat, metodo: 'Cuantil' },
    classes: 5,
    classificationMethod: 'Cuantil',
  } as unknown as ContratoPngPolitica
  const codigos = validarContratoPngPolitica(conMetodo).map((f) => f.codigo)
  assert.ok(codigos.includes('metodo'))
  assert.ok(codigos.includes('firma'))
})

test('rechaza que la leyenda no sume las secciones del mapa', () => {
  const c = construirContratoPngPolitica(entrada())
  const cat = c.categoricalLegend as LeyendaCategoricaPng
  const truncada = {
    ...c,
    categoricalLegend: { ...cat, entradas: cat.entradas.slice(0, 1) },
  }
  const firmado = { ...truncada, signature: firmarContratoPolitica(truncada) }
  assert.ok(validarContratoPngPolitica(firmado).some((f) => f.codigo === 'leyenda'))
})

test('rechaza una leyenda continua sin unidad o sin método', () => {
  const base = construirContratoPngPolitica(
    entrada({
      secciones: SECCIONES_CONTINUAS,
      indicatorId: 'pol_participacion',
      cortes: CORTES,
      metodo: 'cuantil',
      escala: { min: 48.2, max: 66.1, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: false },
    }),
  )
  const cont = base.continuousLegend!
  const sinUnidad = { ...base, continuousLegend: { ...cont, unidad: '  ' } }
  assert.ok(
    validarContratoPngPolitica({ ...sinUnidad, signature: firmarContratoPolitica(sinUnidad) }).some(
      (f) => f.codigo === 'leyenda',
    ),
  )
  const sinMetodo = { ...base, continuousLegend: { ...cont, metodo: null }, classificationMethod: null }
  assert.ok(
    validarContratoPngPolitica({ ...sinMetodo, signature: firmarContratoPolitica(sinMetodo) }).some(
      (f) => f.codigo === 'metodo',
    ),
  )
})

test('rechaza un título sin tipo de proceso ni fecha de convocatoria', () => {
  const c = construirContratoPngPolitica(entrada())
  const titulo = tituloDeContratoPolitica(c)
  assert.ok(titulo.includes('Candidatura ganadora'))
  assert.ok(titulo.includes('Madrid'))
  assert.ok(titulo.includes('Municipales'))
  assert.ok(titulo.includes('2023-05-28'))
  // Sin fecha, el título ya no identifica la convocatoria → hay fallo por la fecha.
  const sinFecha = construirContratoPngPolitica(entrada({ electionDate: 'x' }))
  assert.ok(validarContratoPngPolitica(sinFecha).some((f) => f.codigo === 'electionDate'))
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Vocabulario económico
// ─────────────────────────────────────────────────────────────────────────────

test('detecta el vocabulario económico en rótulos, unidades y notas', () => {
  assert.deepEqual(detectarTerminosEconomicos('Candidatura ganadora · 2023-05-28 · %'), [])
  assert.equal(detectarTerminosEconomicos('Renta neta media por persona').length, 1)
  assert.ok(detectarTerminosEconomicos('Índice de Gini').length > 0)
  assert.ok(detectarTerminosEconomicos('1.234 €').length > 0)
  assert.ok(detectarTerminosEconomicos('ADRH').length > 0)
  assert.ok(detectarTerminosEconomicos('p80/p20').length > 0)
  // Los identificadores llegan con guiones bajos: hay que encontrarlos ahí.
  assert.ok(detectarTerminosEconomicos('indice_gini').length > 0)
  assert.ok(detectarTerminosEconomicos('renta_neta_media_hogar').length > 0)
  assert.ok(detectarTerminosEconomicos('renta_media_unidad_consumo').length > 0)
  // Falsos positivos que NO pueden darse: «presente» no es «renta».
  assert.deepEqual(detectarTerminosEconomicos('Sin presencia de exportar'), [])
  // Una ficha electoral completa, con lo que la fuente publica, es limpia.
  assert.deepEqual(
    detectarTerminosEconomicos(
      [
        'Candidatura ganadora',
        'Municipales 2023-05-28 · municipal-2023-05-28',
        'pol_candidatura_A',
        'Dato por sección censal, mesas agregadas',
        'Empareja registrada por la fuente',
        'Conciliación municipal',
        'Sección 2807900001',
        'Censo electoral',
        'Votos válidos',
        'Sin dato / ND',
      ].join(' · '),
    ),
    [],
  )
})

test('un contrato contaminado con vocabulario económico no se exporta', () => {
  const c = construirContratoPngPolitica(entrada())
  const contaminado = { ...c, indicatorLabel: 'Renta neta media por persona' }
  const firmado = { ...contaminado, signature: firmarContratoPolitica(contaminado) }
  const codigos = validarContratoPngPolitica(firmado).map((f) => f.codigo)
  assert.ok(codigos.includes('terminos-economicos'))
  assert.equal(contratoExportable(firmado), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Mapeo al compositor genérico
// ─────────────────────────────────────────────────────────────────────────────

test('el periodo del PNG es el AÑO como número, nunca la fecha completa', () => {
  assert.equal(anioElectoral('2023-05-28'), 2023)
  assert.equal(anioElectoral('no consta'), null)
  const c = construirContratoPngPolitica(entrada())
  const o = opcionesComponerDesdeContrato(c, { base: lienzoFalso(), baseOmitida: false, escala: 1 })
  assert.equal(o.periodo, 2023)
  assert.equal(typeof o.periodo, 'number')
  assert.equal(o.anio, 2023)
  assert.equal(o.convocatoria, 'Municipales 2023-05-28 · municipal-2023-05-28')
})

test('la autoridad de los datos y la del seccionado van en su propia línea', () => {
  const c = construirContratoPngPolitica(entrada())
  const o = opcionesComponerDesdeContrato(c, { base: lienzoFalso(), baseOmitida: false, escala: 1 })
  assert.equal(o.fuente, FUENTE_DATOS_POLITICA)
  assert.equal(o.organismo, ORGANISMO_ESTADISTICA_POLITICA)
  assert.ok(/Interior/.test(String(o.organismo)))
  assert.equal(o.organismoGeometria, 'Instituto Nacional de Estadística (INE)')
  assert.equal(o.encabezado?.includes('Resultados electorales'), true)
  assert.equal(o.titulo?.includes('Municipales 2023-05-28'), true)
})

test('un mapa categórico NO pide escala numérica al compositor', () => {
  const c = construirContratoPngPolitica(entrada())
  const o = opcionesComponerDesdeContrato(c, { base: lienzoFalso(), baseOmitida: false, escala: 2 })
  assert.equal(o.clasificacion, null)
  assert.equal(o.escala, 2)
  assert.equal(o.escalaLeyenda?.tipo, 'cualitativa')
  // El descriptor NO puede afirmar «sin escala» ni «0 clases».
  const desc = descriptorEscalaPolitica(c)
  assert.equal(desc.tipo, 'cualitativa')
  if (desc.tipo !== 'cualitativa') throw new Error('debería ser cualitativa')
  assert.equal(/clase/i.test(desc.rotuloCabecera), false)
  assert.equal(/0 clases/.test(desc.rotuloLeyenda), false)
  assert.equal(desc.rotuloLeyenda.includes('2'), true)
  assert.equal(desc.lineaEscala.includes('candidatura'), true)
  for (const metodo of ['Cuantil', 'Jenks', 'Intervalos iguales', 'Cortes manuales']) {
    assert.equal(desc.rotuloCabecera.includes(metodo), false, `no debe mencionar ${metodo}`)
    assert.equal(desc.lineaEscala.includes(metodo), false, `no debe mencionar ${metodo}`)
    assert.equal(desc.rotuloLeyenda.includes(metodo), false, `no debe mencionar ${metodo}`)
  }
})

test('un mapa continuo SÍ entrega la escala observada completa al compositor', () => {
  const c = construirContratoPngPolitica(
    entrada({
      secciones: SECCIONES_CONTINUAS,
      indicatorId: 'pol_participacion',
      cortes: CORTES,
      metodo: 'cuantil',
      escala: { min: 48.2, max: 66.1, nObservados: 3, valoresDistintos: 3, reducidoPorValoresDistintos: true },
    }),
  )
  const o = opcionesComponerDesdeContrato(c, { base: lienzoFalso(), baseOmitida: false, escala: 1 })
  assert.ok(o.clasificacion)
  assert.equal(o.clasificacion.nObservados, 3)
  assert.equal(o.clasificacion.min, 48.2)
  assert.equal(o.clasificacion.max, 66.1)
  assert.equal(o.clasificacion.reducidoPorValoresDistintos, true)
  assert.equal(o.clasificacion.nNoDifundidos, 1)
  assert.equal(o.unidad, '%')
  assert.equal(o.modoClasificacion, 'Cuantil')
  assert.equal(o.escalaLeyenda?.tipo, 'numerica')
  assert.equal(o.coberturaPct, 75)
})

test('cada fila de leyenda lleva su color por identidad, también la de sin dato', () => {
  const c = construirContratoPngPolitica(entrada())
  const o = opcionesComponerDesdeContrato(c, { base: lienzoFalso(), baseOmitida: false, escala: 1 })
  assert.equal(o.entradasLeyenda.length, 3)
  for (const e of o.entradasLeyenda) {
    assert.equal(e.colorMuestra, e.color, `«${e.etiqueta}» debe traer su propio color`)
  }
  const nd = o.entradasLeyenda.find((e) => e.esSinDato)
  assert.ok(nd)
  assert.equal(nd.etiqueta, 'Sin dato / ND')
  assert.equal(nd.secciones, 1)
})

test('el nombre del archivo lleva el dominio político y el año, no la fecha completa', () => {
  assert.equal(
    nombreArchivoPngPolitica('28079', 'pol_ganadora', '2023-05-28'),
    'SOCideas_Politica_28079_pol_ganadora_2023.png',
  )
  assert.equal(
    nombreArchivoPngPolitica('28079', 'pol_candidatura/A B', '2023-05-28'),
    'SOCideas_Politica_28079_pol_candidatura-A-B_2023.png',
  )
  assert.equal(nombreArchivoPngPolitica('28079', 'x', 'nada').endsWith('_sindato.png'), true)
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Nada se compone si el contrato no pasa
// ─────────────────────────────────────────────────────────────────────────────

test('componerPngPolitica lanza con el motivo y NO llama al compositor genérico', async () => {
  // Contrato bien construido y luego manipulado: la firma ya no describe el
  // contenido. La validación corre ANTES de `componerPngMapa`, así que el
  // error es el de la validación y no el del entorno (Node no tiene `document`).
  const bueno = construirContratoPngPolitica(entrada())
  const manipulado: ContratoPngPolitica = { ...bueno, signature: `${PREFIJO_FIRMA_POLITICA}00000000-deadbeef` }
  await assert.rejects(
    () => componerPngPolitica({ contrato: manipulado, base: lienzoFalso(), baseOmitida: false, escala: 1 }),
    (e: unknown) => {
      assert.ok(e instanceof Error)
      assert.match(e.message, /No se ha exportado el PNG/)
      assert.match(e.message, /\[firma\]/)
      assert.equal(/navegador/.test(e.message), false)
      return true
    },
  )
})

test('con el contrato válido, la única razón para fallar aquí es que no hay navegador', async () => {
  // En Node no hay `document`: el fallo debe ser el del entorno, no el de la
  // validación. Si fuera la validación, el mensaje llevaría «No se ha exportado».
  const bueno = construirContratoPngPolitica(entrada())
  await assert.rejects(
    () => componerPngPolitica({ contrato: bueno, base: lienzoFalso(), baseOmitida: false, escala: 1 }),
    (e: unknown) => {
      assert.ok(e instanceof Error)
      assert.match(e.message, /navegador/)
      assert.equal(/No se ha exportado/.test(e.message), false)
      return true
    },
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Utilidad
// ─────────────────────────────────────────────────────────────────────────────

/** Objeto con la FORMA de un lienzo. Solo se pasa de través: en Node no se
 *  dibuja nada, pero el tipo del contrato lo exige. */
function lienzoFalso(): HTMLCanvasElement {
  return { width: 100, height: 80 } as unknown as HTMLCanvasElement
}