// Fusión server-side de Educación + Actividad (INE Censo Anual) y Política
// (resultados electorales) en el CONTRATO COMPARTIDO del atlas de secciones.
//
// Aquí ocurre la unión temática:
//   - formación y nivel educativo  → tema `educacion`  (pestaña Educación)
//   - relación con la actividad    → tema `laboral`    (pestaña Actividad)
//   - resultados electorales        → tema `politica`   (pestaña Política)
//
// REGLAS QUE ESTE MÓDULO HACE CUMPLIR
//  - La unión es por CUSEC de 10 dígitos. Nunca por nombre, ni por superficie,
//    ni por población, ni por proximidad.
//  - Un ND del INE sigue siendo ND: `value: null` con `status: 'no_difundido'`.
//    Nunca 0.
//  - Un municipio `all_nd` (todas las celdas suprimidas) publica el objeto con
//    cobertura cero, no con ceros.
//  - La política no reparte votos: cada sección lleva lo que la fuente publica
//    para esa sección. Los estados no disponibles se nombran, no se colapsan.
//  - No se escribe nada en R2: este módulo es de lectura y composición.

import {
  SECCIONES_ATLAS_SCHEMA,
  SECCIONES_ATRIBUCION,
  esPoligonoDistrito,
  type SeccionFeature,
  type SeccionIndicador,
  type SeccionIndicadorCobertura,
  type SeccionIndicadorObservaciones,
  type SeccionObservacion,
  type SeccionPorPeriodo,
  type SeccionesAtlasV1,
  type SeccionesCalidad,
} from './socideas-secciones'
import {
  EDUCATION_INDICATORS,
  educationIndicatorsWithData,
  type EducationCatalog,
  type EducationMunicipalObject,
  type EducationObservation,
} from './socideas-secciones-education'
import {
  ELECTION_TYPE_LABEL,
  type ElectionType,
  type PoliticalMunicipalObject,
} from './socideas-secciones-political'

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades puras
// ─────────────────────────────────────────────────────────────────────────────


function indicadorEducativo(ind: (typeof EDUCATION_INDICATORS)[number]): SeccionIndicador {
  return {
    id: ind.id,
    etiqueta: ind.etiqueta,
    // La separación temática es explícita: formación a Educación, relación con
    // la actividad a Actividad (tema laboral). Nunca se mezclan en una pestaña.
    tema: ind.group === 'actividad' ? 'laboral' : 'educacion',
    operation: ind.operation,
    operationLabel: ind.operationLabel,
    sourceTable: ind.sourceTable,
    sourceLabel: ind.sourceLabel,
    tableFamily: 'censo_educacion',
    url: ind.url,
    unidad: ind.unidad,
    universo: ind.universo,
    denominador: ind.denominador,
    definicion: ind.definicion,
    publicadoPorSeccion: ind.publicadoPorSeccion,
    etiquetaNoDifundido: ind.etiquetaNoDifundido,
  }
}

const STATUS_EDUCACION: Record<EducationObservation['status'], SeccionObservacion['status']> = {
  observado: 'observado',
  derivado_verificable: 'derivado_verificable',
  no_difundido: 'no_difundido',
  sin_cobertura: 'sin_cobertura',
  error_ingesta: 'error_ingesta',
}

function notaEducacion(obs: EducationObservation): string | null {
  if (obs.reason) return obs.reason
  if (obs.suppression_flag) return 'Secreto estadístico: el INE no difunde la celda.'
  if (obs.nd_flag) return 'Celda vacía en la fuente: dato no difundido.'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Educación + Actividad
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoFusionEducacion {
  indicadores: SeccionIndicador[]
  cobertura: SeccionIndicadorCobertura[]
  observaciones: Record<string, SeccionIndicadorObservaciones>
  periodos: number[]
  municipalitiesWithData: number
  allNdSections: number
  nd: number
  suppressed: number
  observations: number
}

/**
 * Convierte los objetos educativos de un municipio (uno por periodo) en
 * indicadores + observaciones del contrato compartido. Solo se publica un
 * indicador si el municipio tiene AL MENOS UNA sección observada o derivada.
 */
export function fusionarEducacion(
  codigoIne: string,
  objetos: EducationMunicipalObject[],
): ResultadoFusionEducacion {
  const periods = [...new Set(objetos.map((o) => o.period))].sort((a, b) => b - a)
  const conDatoPorIndicador = new Map<string, Set<number>>()
  const porSeccionPorPeriodo = new Set<string>()
  const observaciones: Record<string, SeccionIndicadorObservaciones> = {}
  let nd = 0
  let suppressed = 0
  let total = 0

  for (const obj of objetos) {
    const ctx = {
      municipalityIne: codigoIne,
      geometryYear: obj.period,
      operation: obj.source.operation,
      sourceTable: `jaxiT3:${obj.source.education_table} (formación) / ${obj.source.activity_table} (actividad)`,
      unit: '',
      denominator: null as string | null,
      sourceUrl: obj.source.url,
      publishedAt: null,
      retrievedAt: obj.source.retrieved_at,
      checksum: obj.content_sha256,
    }
    const indicatoresDelMunicipio = educationIndicatorsWithData(obj)
    for (const seccion of obj.sections) {
      if (seccion.municipalityCode !== codigoIne) continue
      if (esPoligonoDistrito(seccion.sectionCode)) continue
      let algunaConDato = false
      for (const ind of EDUCATION_INDICATORS) {
        const obs = seccion.values[ind.id]
        if (!obs) continue
        total += 1
        if (obs.nd_flag) nd += 1
        if (obs.suppression_flag) suppressed += 1
        const estado = STATUS_EDUCACION[obs.status] ?? 'error_ingesta'
        const conNumero = obs.value !== null && (estado === 'observado' || estado === 'derivado_verificable')
        if (conNumero) {
          algunaConDato = true
          const set = conDatoPorIndicador.get(ind.id) ?? new Set<number>()
          set.add(obj.period)
          conDatoPorIndicador.set(ind.id, set)
        }
        const observacion: SeccionObservacion = {
          sectionKey: seccion.sectionCode,
          municipalityIne: codigoIne,
          geometryYear: obj.period,
          referencePeriod: obj.period,
          operation: ind.operation,
          sourceTable: ctx.sourceTable,
          indicatorId: ind.id,
          dimensions: { ambito: 'seccion_censal', grupo: ind.group, base: ind.populationBase },
          value: conNumero ? obs.value : null,
          unit: ind.unidad,
          denominator: obs.denominator === null ? null : String(obs.denominator),
          status: estado,
          sourceUrl: ind.url,
          publishedAt: null,
          retrievedAt: obj.source.retrieved_at,
          checksum: obj.content_sha256,
          methodologyNote: notaEducacion(obs),
        }
        const porIndicador = (observaciones[seccion.sectionCode] ??= {})
        const porPeriodo: SeccionPorPeriodo =
          porIndicador[ind.id] ?? (porIndicador[ind.id] = {})
        porPeriodo[String(obj.period)] = observacion
      }
      if (algunaConDato) porSeccionPorPeriodo.add(`${seccion.sectionCode}|${obj.period}`)
    }
  }

  const indicadores: SeccionIndicador[] = []
  const cobertura: SeccionIndicadorCobertura[] = []
  for (const ind of EDUCATION_INDICATORS) {
    const periodos = [...(conDatoPorIndicador.get(ind.id) ?? [])].sort((a, b) => b - a)
    if (periodos.length === 0) continue // Sin ninguna sección observada: no se publica.
    indicadores.push(indicadorEducativo(ind))
    let conDato = 0
    let sinDifundir = 0
    let sinCobertura = 0
    for (const obj of objetos) {
      if (!periodos.includes(obj.period)) continue
      for (const s of obj.sections) {
        const o = s.values[ind.id]
        if (!o) {
          sinCobertura += 1
          continue
        }
        if (o.status === 'observado' || o.status === 'derivado_verificable') conDato += 1
        else if (o.status === 'sin_cobertura') sinCobertura += 1
        else sinDifundir += 1
      }
    }
    cobertura.push({
      indicatorId: ind.id,
      periodos,
      periodoPorDefecto: periodos[0] ?? null,
      seccionesConDato: conDato,
      seccionesSinDifundir: sinDifundir,
      seccionesSinCobertura: sinCobertura,
    })
  }

  const allNd = objetos.reduce(
    (a, o) => a + o.sections.filter((s) => Object.values(s.values).every((v) => v.status === 'no_difundido')).length,
    0,
  )

  return {
    indicadores,
    cobertura,
    observaciones,
    periodos: periods,
    municipalitiesWithData: conDatoPorIndicador.size > 0 ? 1 : 0,
    allNdSections: allNd,
    nd,
    suppressed,
    observations: total,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Política
// ─────────────────────────────────────────────────────────────────────────────

/** Indicadores políticos que el atlas sabe representar. */
export const POLITICAL_INDICATOR_IDS = {
  participation: 'pol_participacion',
  abstention: 'pol_abstencion',
  margin: 'pol_margen',
  blank: 'pol_blancos',
  null: 'pol_nulos',
  winner: 'pol_ganadora',
} as const

export const PREFIJO_CANDIDATURA = 'pol_candidatura_'

export interface ResultadoFusionPolitica {
  indicadores: SeccionIndicador[]
  cobertura: SeccionIndicadorCobertura[]
  observaciones: Record<string, SeccionIndicadorObservaciones>
  /** Candidaturas de la convocatoria en el municipio, para el selector. */
  candidacies: PoliticalMunicipalObject['candidacies']
  electionId: string
  electionType: ElectionType
  electionDate: string
  /** Estado de disponibilidad REAL. Nunca se colapsa en «sin indicadores». */
  status: PoliticalStatus
  notes: string[]
  mesas: number
}

export type PoliticalStatus =
  | 'available'
  | 'partial_coverage'
  | 'source_not_ingested'
  | 'no_polling_station_breakdown'
  | 'geometry_unresolved'
  | 'reconciliation_unresolved'
  | 'object_missing'
  | 'validation_error'

export const POLITICAL_STATUS_LABEL: Record<PoliticalStatus, string> = {
  available: 'Disponible',
  partial_coverage: 'Cobertura parcial',
  source_not_ingested: 'Convocatoria no ingerida',
  no_polling_station_breakdown: 'La fuente no desglosa por mesa',
  geometry_unresolved: 'Geometría sin correspondencia',
  reconciliation_unresolved: 'Conciliación sin resolver',
  object_missing: 'Objeto no disponible',
  validation_error: 'Error de validación',
}

function indicadorPolitico(
  id: string,
  etiqueta: string,
  unidad: string,
  denominador: string | null,
  definicion: string,
  electionLabel: string,
  url: string,
): SeccionIndicador {
  return {
    id,
    etiqueta,
    tema: 'politica',
    operation: electionLabel,
    operationLabel: electionLabel,
    sourceTable: electionLabel,
    sourceLabel: electionLabel,
    tableFamily: 'electoral',
    url,
    unidad,
    universo: 'Votantes de la sección censal',
    denominador,
    definicion,
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'ND — la fuente no publica este valor para la sección',
  }
}

/**
 * Estado de disponibilidad de un municipio para una convocatoria, a partir del
 * catálogo, la cobertura y el objeto. Cada causa tiene su propio nombre.
 */
export function estadoPolitico(args: {
  catalog: { elections: Array<{ electionId: string; municipalities: number; publishableMunicipalities: number }> } | null
  /** Entrada de cobertura de ESTE municipio en ESTA convocatoria, o null. */
  coverage: { publishable: boolean; reason: string | null; correspondenceStatus: string; reconciliationStatus: string; coveragePercentage: number } | null
  object: PoliticalMunicipalObject | null
  electionId: string
}): PoliticalStatus {
  if (args.object) {
    if (!args.object.publication.publishable) {
      if (args.object.geometry.correspondenceStatus === 'unresolved') return 'geometry_unresolved'
      if (args.object.reconciliation.status === 'unresolved') return 'reconciliation_unresolved'
      return 'validation_error'
    }
    if (args.object.geometry.coveragePercentage < 99.9) return 'partial_coverage'
    return 'available'
  }
  const cov = args.coverage
  if (cov) {
    const motivo = cov.reason ?? ''
    if (cov.reconciliationStatus === 'unresolved' || /conciliaci/i.test(motivo)) return 'reconciliation_unresolved'
    if (cov.correspondenceStatus === 'unresolved') return 'geometry_unresolved'
    if (/sin mesas|no hay datos|no desglosa|sin total/i.test(motivo)) return 'no_polling_station_breakdown'
    if (motivo) return 'object_missing'
    return 'partial_coverage'
  }
  const enCatalogo = args.catalog?.elections.find((e) => e.electionId === args.electionId) ?? null
  if (enCatalogo) return enCatalogo.municipalities === 0 ? 'source_not_ingested' : 'object_missing'
  return 'source_not_ingested'
}

function valorEleccion(
  obj: PoliticalMunicipalObject,
  s: PoliticalMunicipalObject['sections'][number],
  id: string,
): { value: number | null; nota: string | null } {
  switch (id) {
    case POLITICAL_INDICATOR_IDS.participation:
      return { value: s.participationPct, nota: null }
    case POLITICAL_INDICATOR_IDS.abstention:
      return { value: s.abstentionPct, nota: null }
    case POLITICAL_INDICATOR_IDS.margin:
      return { value: s.marginPoints, nota: s.tie ? 'Empate: margen 0' : null }
    case POLITICAL_INDICATOR_IDS.blank:
      return { value: s.blankPct, nota: null }
    case POLITICAL_INDICATOR_IDS.null:
      return { value: s.nullPct, nota: null }
    default:
      return { value: null, nota: null }
  }
}

const PREFIJOS_INDICADOR_POLITICA = new Set<string>(Object.values(POLITICAL_INDICATOR_IDS))

export function esIndicadorCandidatura(id: string): boolean {
  return id.startsWith(PREFIJO_CANDIDATURA)
}

export function idIndicadorCandidatura(candidacyId: string): string {
  return `${PREFIJO_CANDIDATURA}${candidacyId}`
}

/**
 * Convierte el objeto electoral municipal en indicadores + observaciones.
 * `incluirCandidaturas` añade un indicador por candidatura, para que el mapa
 * pueda pintar el voto a una lista concreta sin hardcodear partidos.
 */
export function fusionarPolitica(
  obj: PoliticalMunicipalObject | null,
  args: {
    catalog: { elections: Array<{ electionId: string; municipalities: number; publishableMunicipalities: number }> } | null
    /** Entrada de cobertura de este municipio para esta convocatoria, o null. */
    coverage: { publishable: boolean; reason: string | null; correspondenceStatus: string; reconciliationStatus: string; coveragePercentage: number } | null
    incluirCandidaturas?: boolean
    /** Convocatoria que ha pedido el usuario. Da el contexto aunque no haya objeto. */
    electionId?: string
  },
): ResultadoFusionPolitica {
  const electionLabel = obj
    ? `${ELECTION_TYPE_LABEL[obj.electionType]} ${obj.electionDate}`
    : 'Convocatoria no disponible'
  const url = obj?.source.url ?? 'https://infoelectoral.interior.gob.es/'
    // El `electionId` lo decide el llamador (la convocatoria que ha pedido el
    // usuario), NO el objeto: si el municipio no tiene objeto —porque la fuente
    // no lo cubre, o porque no es publicable— el catálogo sigue sabiendo si esa
    // convocatoria existe. Pasarlo vacío haría que todo municipio sin objeto
    // saliera como `source_not_ingested`, que es falso.
    const status = estadoPolitico({ ...args, object: obj, electionId: args.electionId ?? obj?.electionId ?? '' })
  const notes: string[] = []
  if (obj) notes.push(...obj.geometry.notes, ...obj.reconciliation.notes, ...obj.publication.warnings)

  if (!obj) {
    return {
      indicadores: [],
      cobertura: [],
      observaciones: {},
      candidacies: [],
      electionId: args.catalog?.elections[0]?.electionId ?? '',
      electionType: 'municipal',
      electionDate: '',
      status,
      notes,
      mesas: 0,
    }
  }

  const indicadores: SeccionIndicador[] = []
  const cobertura: SeccionIndicadorCobertura[] = []
  const observaciones: Record<string, SeccionIndicadorObservaciones> = {}
  const conDato = new Map<string, number>()
  const sinDato = new Map<string, number>()
  const mesas = new Set<string>()

  const idsBase: string[] = [
    POLITICAL_INDICATOR_IDS.participation,
    POLITICAL_INDICATOR_IDS.abstention,
    POLITICAL_INDICATOR_IDS.margin,
    POLITICAL_INDICATOR_IDS.blank,
    POLITICAL_INDICATOR_IDS.null,
  ]
  if (args.incluirCandidaturas !== false) {
    for (const c of obj.candidacies) idsBase.push(idIndicadorCandidatura(c.id))
  }

  for (const id of idsBase) {
    if (id !== POLITICAL_INDICATOR_IDS.winner && PREFIJOS_INDICADOR_POLITICA.has(id)) {
      indicadores.push(
        id === POLITICAL_INDICATOR_IDS.participation
          ? indicadorPolitico(id, 'Participación', '%', 'Censo electoral', 'Votantes de la sección dividido por el censo electoral de la sección.', electionLabel, url)
          : id === POLITICAL_INDICATOR_IDS.abstention
            ? indicadorPolitico(id, 'Abstención', '%', 'Censo electoral', 'Censo electoral menos votantes, dividido por el censo electoral de la sección.', electionLabel, url)
            : id === POLITICAL_INDICATOR_IDS.margin
              ? indicadorPolitico(id, 'Margen ganador − segundo', 'p. p.', 'Votos válidos', 'Diferencia en puntos porcentuales entre la candidatura ganadora y la segunda más votada, sobre votos válidos.', electionLabel, url)
              : id === POLITICAL_INDICATOR_IDS.blank
                ? indicadorPolitico(id, 'Votos en blanco', '%', 'Votos válidos', 'Votos en blanco dividido por los votos válidos de la sección.', electionLabel, url)
                : indicadorPolitico(id, 'Votos nulos', '%', 'Votantes', 'Votos nulos dividido por los votantes de la sección.', electionLabel, url),
      )
    }
  }

  // Candidaturas: un indicador por lista, sin hardcodear partidos.
  if (args.incluirCandidaturas !== false) {
    for (const c of obj.candidacies) {
      const cid = idIndicadorCandidatura(c.id)
      indicadores.push(
        indicadorPolitico(
          cid,
          `${c.acronym || c.name}`,
          '%',
          'Votos válidos',
          `Votos a ${c.name} dividido por los votos válidos de la sección.`,
          electionLabel,
          url,
        ),
      )
    }
  }

  for (const s of obj.sections) {
    for (const p of s.pollingStations) mesas.add(`${s.sectionKey}|${p}`)
    for (const id of idsBase) {
      let value: number | null = null
      let nota: string | null = null
      let estado: SeccionObservacion['status'] = 'no_difundido'
      if (esIndicadorCandidatura(id)) {
        const candId = id.slice(PREFIJO_CANDIDATURA.length)
        const votos = s.votes[candId]
        if (votos !== undefined) {
          const pct = s.validVotes ? (votos / s.validVotes) * 100 : null
          value = pct === null ? null : pct
          estado = pct === null ? 'no_difundido' : 'observado'
          nota = s.validVotes === 0 ? 'Sin votos válidos en la sección: el porcentaje no está definido.' : null
        } else {
          estado = 'sin_cobertura'
          nota = 'La candidatura no se publica en esta sección.'
        }
      } else {
        const v = valorEleccion(obj, s, id)
        value = v.value
        nota = v.nota
        estado = value === null ? 'no_difundido' : 'observado'
      }
      if (estado === 'observado') conDato.set(id, (conDato.get(id) ?? 0) + 1)
      else sinDato.set(id, (sinDato.get(id) ?? 0) + 1)
      const observacion: SeccionObservacion = {
        sectionKey: s.sectionKey,
        municipalityIne: obj.municipalityCode,
        geometryYear:
          obj.geometry.geometryYear ?? Number.parseInt(obj.electionDate.slice(0, 4), 10),
        referencePeriod: Number.parseInt(obj.electionDate.slice(0, 4), 10),
        operation: electionLabel,
        sourceTable: electionLabel,
        indicatorId: id,
        dimensions: {
          ambito: 'seccion_censal',
          convocatoria: obj.electionId,
          distrito: s.districtCode,
          mesas: String(s.pollingStations.length),
        },
        value,
        unit: indicadores.find((i) => i.id === id)?.unidad ?? '',
        denominator: indicadores.find((i) => i.id === id)?.denominador ?? null,
        status: estado,
        sourceUrl: url,
        publishedAt: null,
        retrievedAt: obj.source.retrievedAt,
        checksum: obj.content_sha256,
        methodologyNote: nota,
      }
      const porIndicador = (observaciones[s.sectionKey] ??= {})
      const porPeriodo: SeccionPorPeriodo = porIndicador[id] ?? (porIndicador[id] = {})
      porPeriodo[obj.electionDate] = observacion
    }
  }

  for (const ind of indicadores) {
    const n = conDato.get(ind.id) ?? 0
    if (n === 0) continue
    cobertura.push({
      indicatorId: ind.id,
      periodos: [Number.parseInt(obj.electionDate.slice(0, 4), 10)],
      periodoPorDefecto: Number.parseInt(obj.electionDate.slice(0, 4), 10),
      seccionesConDato: n,
      seccionesSinDifundir: sinDato.get(ind.id) ?? 0,
      seccionesSinCobertura: 0,
    })
  }

  return {
    indicadores: indicadores.filter((i) => cobertura.some((c) => c.indicatorId === i.id)),
    cobertura,
    observaciones,
    candidacies: obj.candidacies,
    electionId: obj.electionId,
    electionType: obj.electionType,
    electionDate: obj.electionDate,
    status,
    notes,
    mesas: mesas.size,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Atlas mínimo para municipios SIN atlas base
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaMinima {
  indicador: SeccionIndicador
  periodo: number
  fuente: string
  sourceTable: string
  operation: string
  operationLabel: string
  url: string
  retrievedAt: string
  checksum: string
  universo: string
  denominador: string | null
  definicion: string
  unidad: string
}

/**
 * Construye un atlas MÍNIMO y honesto para un municipio que no tiene objeto
 * publicado en `socideas/secciones/v1/municipal/`. La geometría es la oficial
 * del INE del mismo año; los valores vienen del dominio que sí se ha cargado.
 * No se escribe este atlas en R2: es una composición de lectura.
 */
export function construirAtlasMinimo(args: {
  municipioIne: string
  municipioNombre: string
  provinciaNombre: string | null
  features: SeccionFeature[]
  geometryYear: number
  geometryCollection: string
  geometrySource: string
  geometryCrs: string
  geometryRetrievedAt: string
  indicadores: SeccionIndicador[]
  cobertura: SeccionIndicadorCobertura[]
  observaciones: Record<string, SeccionIndicadorObservaciones>
  entradas: EntradaMinima[]
  statsRetrievedAt: string
}): SeccionesAtlasV1 {
  const claves = args.features.map((f) => f.properties.CUSEC)
  const conFila = claves.filter((k) => {
    const porIndicador = args.observaciones[k]
    if (!porIndicador) return false
    return Object.values(porIndicador).some((porPeriodo) =>
      Object.values(porPeriodo).some((o) => typeof o.value === 'number'),
    )
  })
  const checksums: Record<string, string> = {}
  for (const e of args.entradas) if (e.checksum) checksums[e.indicador.id] = e.checksum
  return {
    schemaVersion: SECCIONES_ATLAS_SCHEMA,
    municipalityIne: args.municipioIne,
    municipalityName: args.municipioNombre,
    provinceName: args.provinciaNombre ?? '',
    geometryYear: args.geometryYear,
    geometryCollection: args.geometryCollection,
    geometrySource: args.geometrySource,
    geometryCrs: args.geometryCrs,
    geometryRetrievedAt: args.geometryRetrievedAt,
    statsRetrievedAt: args.statsRetrievedAt,
    indicators: args.indicadores,
    cobertura: args.cobertura,
    sections: args.features,
    observations: args.observaciones,
    municipalReference: {},
    quality: {
      territoryMatch: 'exact',
      seccionesSinFila: claves.filter((k) => !conFila.includes(k)),
      filasSinPoligono: [],
      poligonosInvalidos: [],
      poligonosVacios: [],
      poligonosMulti: [],
      clavesDuplicadas: [],
      hayDesfaseTemporal: false,
      notas: [
        'Atlas compuesto en lectura: geometría oficial del INE del año del dato más los dominios cargados.',
        'No existe objeto propio de este municipio en socideas/secciones/v1/municipal/.',
      ],
      status: conFila.length > 0 ? 'partial' : 'failed',
    },
    sourceChecksums: checksums,
    generatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadatos de dominio: qué se ha cargado, de dónde y con qué definición
// ─────────────────────────────────────────────────────────────────────────────

/** Ficha de un dominio cargado. Alimenta el bloque «de dónde sale esto» de la
 *  interfaz y el `sourceTable` que se imprime junto a cada indicador. */
export interface MetadatosDominio {
  domain: 'education' | 'political'
  label: string
  organism: string
  sourceTable: string
  sourceUrl: string
  /** Periodos realmente publicados para ESTE municipio, no los del catálogo. */
  periods: number[]
  method: string
  licence: string
  indicators: Array<{ id: string; label: string; unit: string; definition: string }>
}

/** Metadatos educativos. `null` si el municipio no tiene nada publicado. */
export function metadatosEducacion(
  objetos: EducationMunicipalObject[],
  catalogo: EducationCatalog | null,
): MetadatosDominio[] {
  if (objetos.length === 0 || !catalogo) return []
  const primero = objetos[0]!
  const periodos = [...new Set(objetos.map((o) => o.period))].sort((a, b) => a - b)
  const porGrupo = (grupo: 'formacion' | 'actividad', label: string): MetadatosDominio => {
    const ids = catalogo.indicators.filter((i) => i.group === grupo).map((i) => i.id)
    const tablas = [...new Set(objetos.flatMap((o) => ids.map((id) => (grupo === 'formacion' ? o.source.education_table : o.source.activity_table))))].sort(
      (a, b) => a - b,
    )
    const cat = new Map(catalogo.indicators.map((i) => [i.id, i]))
    return {
      domain: 'education',
      label,
      organism: catalogo.source.organism,
      sourceTable: tablas.join(', '),
      sourceUrl: catalogo.source.url,
      periods: periodos,
      method:
        grupo === 'formacion'
          ? 'Censo Anual de Población, distribución por sección censal. Recuentos por nivel de formación alcanzado.'
          : 'Censo Anual de Población, distribución por sección censal. Recuentos por relación con la actividad.',
      licence: catalogo.source.licence,
      indicators: ids.map((id) => {
        const i = cat.get(id)
        return { id, label: i?.label ?? id, unit: i?.unit ?? '', definition: i?.definition ?? '' }
      }),
    }
  }
  return [porGrupo('formacion', 'Educación'), porGrupo('actividad', 'Actividad')]
}

/** Metadatos políticos. `null` si no hay convocatoria para este municipio. */
export function metadatosPolitica(pol: ResultadoFusionPolitica): MetadatosDominio | null {
  if (!pol.electionId || pol.status === 'source_not_ingested' || pol.status === 'object_missing') return null
  return {
    domain: 'political',
    label: 'Resultados electorales por sección censal',
    organism: 'Ministerio del Interior · Infoelectoral (APLIXTR)',
    sourceTable: 'resultados por mesa, agregados a sección censal',
    sourceUrl: 'https://infoelectoral.interior.gob.es/',
    periods: [],
    method:
      'Mesas agregadas por suma de recuentos; los porcentajes se calculan después de la suma. Sin datos individuales, sin dominios y sin inferencias sobre personas.',
    licence: 'Uso público con atribución al Ministerio del Interior.',
    indicators: pol.indicadores.map((i) => ({
      id: i.id,
      label: i.etiqueta,
      unit: i.unidad,
      definition: i.definicion ?? '',
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ganadoras por sección, para la vista política
// ─────────────────────────────────────────────────────────────────────────────

/** Fila electoral de una sección, tal y como la pinta la interfaz política. */
export interface SeccionGanadora {
  sectionKey: string
  distrito: string
  mesas: number
  mesasIds: string[]
  censo: number | null
  votantes: number | null
  validos: number | null
  blancos: number | null
  nulos: number | null
  ganadoraId: string | null
  ganadoraVotos: number | null
  ganadoraPct: number | null
  segundaId: string | null
  segundaVotos: number | null
  segundaPct: number | null
  margen: number | null
  participacion: number | null
  abstencion: number | null
  empate: boolean
  estado: 'observado' | 'no_difundido' | 'sin_cobertura'
}

/**
 * Ganadora de cada sección. Se toma del propio objeto publicado y NO se recalcula
 * con las candidaturas: si la fuente marcó empate, `ganadoraId` es `null` y así
 * se respeta; inventar una ganadora en un empate sería fabrication.
 */
export function ganadorasPorSeccion(
  obj: PoliticalMunicipalObject | null,
): Record<string, SeccionGanadora> {
  const salida: Record<string, SeccionGanadora> = {}
  if (!obj) return salida
  for (const s of obj.sections) {
    salida[s.sectionKey] = {
      sectionKey: s.sectionKey,
      distrito: s.districtCode,
      mesas: s.pollingStations.length,
      mesasIds: s.pollingStations,
      censo: s.census,
      votantes: s.voters,
      validos: s.validVotes,
      blancos: s.blankVotes,
      nulos: s.nullVotes,
      ganadoraId: s.winnerId,
      ganadoraVotos: s.winnerId ? (s.votes[s.winnerId] ?? null) : null,
      ganadoraPct: s.winnerPct,
      segundaId: s.runnerUpId,
      segundaVotos: s.runnerUpId ? (s.votes[s.runnerUpId] ?? null) : null,
      segundaPct: s.runnerUpPct,
      margen: s.marginPoints,
      participacion: s.participationPct,
      abstencion: s.abstentionPct,
      empate: s.tie,
      estado: s.status === 'observado' ? 'observado' : 'sin_cobertura',
    }
  }
  return salida
}

// ─────────────────────────────────────────────────────────────────────────────
// Fusión con el atlas base
// ─────────────────────────────────────────────────────────────────────────────

/** Un dominio ya fusionado a indicadores del contrato compartido. */
export interface DominioFusion {
  indicadores: SeccionIndicador[]
  cobertura: SeccionIndicadorCobertura[]
  observaciones: Record<string, SeccionIndicadorObservaciones>
}

function pegObservaciones(
  destino: Record<string, SeccionIndicadorObservaciones>,
  seccion: string,
  indicadorId: string,
  periodo: string,
  observacion: SeccionObservacion,
): void {
  const porSeccion = (destino[seccion] ??= {})
  const porIndicador = (porSeccion[indicadorId] ??= {})
  porIndicador[periodo] = observacion
}

/**
 * Une el atlas base de R2 con los dominios cargados. El atlas base NO se
 * modifica: solo se le añaden indicadores, cobertura y observaciones de los
 * dominios. Un indicador que ya exista en el base gana el base (es el mismo
 * contrato y la misma fuente), salvo que el dominio traiga un valor.
 */
export function fusionarAtlas(base: SeccionesAtlasV1, dominios: DominioFusion[]): SeccionesAtlasV1 {
  const indicadores = [...base.indicators]
  const cobertura = [...base.cobertura]
  const observaciones: Record<string, SeccionIndicadorObservaciones> = {}
  for (const [sec, porIndicador] of Object.entries(base.observations ?? {})) {
    observaciones[sec] = { ...porIndicador }
  }
  const checksums: Record<string, string> = { ...(base.sourceChecksums ?? {}) }

  for (const d of dominios) {
    const nuevos: SeccionIndicador[] = []
    for (const ind of d.indicadores) {
      if (indicadores.some((x) => x.id === ind.id)) continue
      indicadores.push(ind)
      nuevos.push(ind)
    }
    for (const c of d.cobertura) {
      if (cobertura.some((x) => x.indicatorId === c.indicatorId)) continue
      cobertura.push(c)
    }
    for (const [sec, porIndicador] of Object.entries(d.observaciones ?? {})) {
      for (const [indId, porPeriodo] of Object.entries(porIndicador)) {
        for (const [periodo, obs] of Object.entries(porPeriodo)) {
          pegObservaciones(observaciones, sec, indId, periodo, obs)
        }
      }
    }
    void nuevos
  }

  return {
    ...base,
    indicators: indicadores,
    cobertura,
    observations: observaciones,
    sourceChecksums: checksums,
  }
}
