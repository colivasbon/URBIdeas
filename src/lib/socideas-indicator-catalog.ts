// Catálogo único de indicadores, cobertura y metodología SOCideas.
// Fuente de verdad compartida por UI (ficha), exportación XLSX y auditoría:
// no duplicar textos de estados ni de ausencias en componentes.
//
// Reglas de oro:
//  - No inventa fuentes, indicadores ni valores: solo documenta lo cargado
//    y los límites verificados de la fuente.
//  - AEAT y ADRH son series separadas; nunca se mezclan ni se calculan
//    comparadores cruzados.
//  - Ausencia de dato ≠ 0. Bloqueo de fuente ≠ pendiente de cálculo.
import type { CoverageEntry, IndicatorAvailability } from './socideas-availability'

export type CoverageStatus = IndicatorAvailability

export interface IndicatorCatalogEntry {
  slug: string
  label: string
  block: string
  sourceName: string
  sourceUrl?: string
  period?: string
  geographicScope?: string
  coverageStatus: CoverageStatus
  coverageNotes?: string
  methodologyNotes?: string[]
  missingReason?: string
  comparabilityGroup?: string
  isOfficial: boolean
  updatedAt?: string
}

/** Textos contractuales de cobertura (ficha + XLSX + catálogo). */
export const AEAT_FORAL_NOTICE =
  'La AEAT estatal no publica esta serie para País Vasco y Navarra; el dato no se estima ni se sustituye.'
export const AEAT_BLOCKED_NOTICE =
  'La variable no se incorpora porque la fuente oficial no ofrece una descarga nacional estructurada verificable.'
export const AEAT_VS_ADRH_COMPARABILITY =
  'La renta de declarantes AEAT (por declaración) no equivale a la renta por persona o hogar del ADRH: son operaciones distintas y nunca se mezclan series ni comparadores.'

/** Provincias de régimen foral según códigos INE (2 dígitos): Álava 01,
 * Gipuzkoa 20, Bizkaia 48 (País Vasco) y Navarra 31. */
export const FORAL_PROVINCIAS: ReadonlySet<string> = new Set(['01', '20', '48', '31'])

/** Ceuta (51) y Melilla (52): la AEAT los publica con códigos propios que no
 * coinciden con INE-5 y no existe puente oficial validado → sin unión. */
export const AEAT_SIN_PUENTE_INE5: ReadonlySet<string> = new Set(['51', '52'])

export function esTerritorioForal(codigoINE: string): boolean {
  return FORAL_PROVINCIAS.has(codigoINE.slice(0, 2))
}

export function sinPuenteAeatIne5(codigoINE: string): boolean {
  return AEAT_SIN_PUENTE_INE5.has(codigoINE.slice(0, 2))
}

/**
 * Aviso foral específico del municipio consultado (solo territorios forales).
 * Para Ceuta/Melilla devuelve el motivo de código AEAT↔INE-5 sin puente.
 */
export function avisoCoberturaAeatTerritorio(codigoINE: string): string | null {
  if (esTerritorioForal(codigoINE)) return AEAT_FORAL_NOTICE
  if (sinPuenteAeatIne5(codigoINE)) {
    return 'AEAT publica este territorio con código propio que no coincide con INE-5 y no existe un puente oficial validado: el dato no se incorpora.'
  }
  return null
}

export const INDICATOR_CATALOG: readonly IndicatorCatalogEntry[] = [
  {
    slug: 'irpf_declaraciones',
    label: 'Número de declaraciones de IRPF',
    block: 'economia',
    sourceName: 'Agencia Estatal de Administración Tributaria',
    sourceUrl:
      'https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfmunicipios_ccaa/2023',
    period: '2023',
    geographicScope: 'Municipio (territorio fiscal común; sin País Vasco ni Navarra)',
    coverageStatus: 'partial',
    coverageNotes:
      'Carga nacional AEAT EDM 2023: 7.600 municipios desde 17 ficheros oficiales por CCAA. País Vasco y Navarra: missing_by_design por régimen foral (ausentes de los 17 ficheros). Ceuta y Melilla: no incorporados por falta de puente oficial validado entre códigos AEAT e INE-5.',
    methodologyNotes: [
      'Cuenta el número de declaraciones presentadas, no la renta de toda la población.',
      AEAT_VS_ADRH_COMPARABILITY,
      'Secreto estadístico AEAT ("S.E.") se almacena como null, nunca como 0.',
    ],
    missingReason: AEAT_FORAL_NOTICE,
    comparabilityGroup: 'aeat_declarantes',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'irpf_renta_bruta_media',
    label: 'Renta bruta media por declaración',
    block: 'economia',
    sourceName: 'Agencia Estatal de Administración Tributaria',
    period: '2023 (no integrado)',
    geographicScope: 'Municipio',
    coverageStatus: 'blocked_source',
    coverageNotes: AEAT_BLOCKED_NOTICE,
    methodologyNotes: [
      'AEAT publica esta variable en XHTML municipal por municipio; no existe descarga nacional estructurada CSV/XLSX verificada.',
      'No se realiza scraping masivo ni se inventa una ingestión.',
      AEAT_VS_ADRH_COMPARABILITY,
    ],
    missingReason: AEAT_BLOCKED_NOTICE,
    comparabilityGroup: 'aeat_declarantes',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'irpf_renta_disponible_media',
    label: 'Renta disponible media por declaración',
    block: 'economia',
    sourceName: 'Agencia Estatal de Administración Tributaria',
    period: '2023 (no integrado)',
    geographicScope: 'Municipio',
    coverageStatus: 'blocked_source',
    coverageNotes: AEAT_BLOCKED_NOTICE,
    methodologyNotes: [
      'AEAT publica esta variable en XHTML municipal por municipio; no existe descarga nacional estructurada CSV/XLSX verificada.',
      'No se realiza scraping masivo ni se inventa una ingestión.',
      AEAT_VS_ADRH_COMPARABILITY,
    ],
    missingReason: AEAT_BLOCKED_NOTICE,
    comparabilityGroup: 'aeat_declarantes',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'renta_neta_media_persona',
    label: 'Renta neta media por persona (ADRH)',
    block: 'economia',
    sourceName: 'Instituto Nacional de Estadística · Atlas de Distribución de Renta de los Hogares (ADRH)',
    sourceUrl: 'https://www.ine.es/daco/daco42/renta/adrh_municipios.htm',
    geographicScope: 'Municipio (≥100 residentes para desigualdad; ADRH con umbral propio por tabla)',
    coverageStatus: 'available',
    coverageNotes:
      'Serie propia ADRH, separada de AEAT. En municipios con muy pocos residentes la fuente no difunde por secreto estadístico.',
    methodologyNotes: [
      'Renta por persona u hogar; no equivale a la renta por declaración de la AEAT.',
      AEAT_VS_ADRH_COMPARABILITY,
    ],
    comparabilityGroup: 'adrh_hogares',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'renta_neta_media_hogar',
    label: 'Renta neta media por hogar (ADRH)',
    block: 'economia',
    sourceName: 'Instituto Nacional de Estadística · Atlas de Distribución de Renta de los Hogares (ADRH)',
    sourceUrl: 'https://www.ine.es/daco/daco42/renta/adrh_municipios.htm',
    geographicScope: 'Municipio',
    coverageStatus: 'available',
    coverageNotes: 'Serie propia ADRH, separada de AEAT.',
    methodologyNotes: ['Renta por hogar; nunca se mezcla con declarantes AEAT.'],
    comparabilityGroup: 'adrh_hogares',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'gini',
    label: 'Índice de Gini (ADRH)',
    block: 'economia',
    sourceName: 'Instituto Nacional de Estadística · ADRH',
    geographicScope: 'Municipio (≥100 residentes)',
    coverageStatus: 'available',
    coverageNotes: 'Secreto estadístico: en municipios de menos de 100 residentes no se difunde.',
    methodologyNotes: ['SOCideas no calcula el indicador: lo reproduce de la fuente oficial.'],
    comparabilityGroup: 'adrh_hogares',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'nivel_educativo',
    label: 'Nivel educativo (Censo 2021)',
    block: 'sociocultural',
    sourceName: 'Instituto Nacional de Estadística · Censo de Población y Viviendas 2021',
    sourceUrl: 'https://www.ine.es/jaxi/Tabla.htm?tpx=55249',
    period: '2021',
    geographicScope: 'Municipio (carga nacional validada: 8.131 municipios)',
    coverageStatus: 'available',
    coverageNotes:
      'Carga nacional PC-Axis 55249 (Censo 2021) sobre capa INE lateral; el periodo real es 2021, no se infiere otro.',
    methodologyNotes: [
      'Dato censo decenal, no serie anual.',
      'Secreto estadístico del INE se presenta como ND, nunca como 0.',
    ],
    comparabilityGroup: 'ine_censo_2021',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'agr_sau_total',
    label: 'Sector agrario (Censo Agrario 2020)',
    block: 'economia',
    sourceName: 'Instituto Nacional de Estadística · Censo Agrario 2020',
    sourceUrl: 'https://www.ine.es/jaxi/Tabla.htm?tpx=52071',
    period: '2020 (estructural, decenal)',
    geographicScope: 'Municipio (carga nacional validada: 8.131 municipios)',
    coverageStatus: 'available',
    coverageNotes:
      'Carga nacional PC-Axis 52071/52076/52081/52082. Umbral de la fuente: explotaciones con SAU ≥ 5 ha.',
    methodologyNotes: [
      'Año real 2020 (censo decenal): no se presenta como serie anual.',
      'Secreto estadístico → ND. Una explotación inexistente solo puede afirmarse si la fuente publica 0 explícito: ausencia de dato no es ausencia de explotación.',
      'Unidades separadas: hectáreas ≠ explotaciones ≠ personas.',
    ],
    comparabilityGroup: 'ine_censo_agrario_2020',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'saldo_migratorio_neto',
    label: 'Saldo migratorio neto (INE 69767)',
    block: 'demografia',
    sourceName: 'Instituto Nacional de Estadística · Estadística de Migraciones y Cambios de Residencia',
    sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69767',
    period: '2021–2024 (serie anual cargada)',
    geographicScope: 'Municipio (cobertura nacional 8.132/8.132 verificada)',
    coverageStatus: 'available',
    methodologyNotes: [
      'Saldo neto (total/exterior/interior): producto distinto de los flujos primarios 69711/69743/69746; no se presentan como intercambiables.',
      'Ausencia temporal de un periodo nunca se presenta como valor 0.',
    ],
    comparabilityGroup: 'ine_emcr',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
  {
    slug: 'flujos_migratorios',
    label: 'Flujos migratorios (INE 69711/69743/69746)',
    block: 'demografia',
    sourceName: 'Instituto Nacional de Estadística · Estadística de Migraciones y Cambios de Residencia',
    sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69711',
    period: 'Serie anual cargada (tablas 69711/69743/69746)',
    geographicScope: 'Municipio (cobertura nacional verificada en la carga)',
    coverageStatus: 'available',
    methodologyNotes: [
      'Flujos primarios (entradas/salidas por nacionalidad): se muestran separados del saldo neto 69767.',
      'Ausencia temporal de un periodo nunca se presenta como valor 0.',
    ],
    comparabilityGroup: 'ine_emcr',
    isOfficial: true,
    updatedAt: '2026-09-22',
  },
]

const BY_SLUG = new Map(INDICATOR_CATALOG.map((e) => [e.slug, e]))

export function getIndicatorCatalogEntry(slug: string): IndicatorCatalogEntry | null {
  return BY_SLUG.get(slug) ?? null
}

/** Entradas del catálogo que explican una ausencia/no-comparabilidad relevante. */
export function catalogCoverageEntries(
  slugs: readonly string[],
  opts: { codigoINE?: string } = {},
): CoverageEntry[] {
  const out: CoverageEntry[] = []
  const seen = new Set<string>()
  for (const slug of slugs) {
    if (seen.has(slug)) continue
    seen.add(slug)
    const entry = BY_SLUG.get(slug)
    if (!entry) continue
    const status = entry.coverageStatus
    if (status === 'available') continue
    out.push({
      titulo: entry.label,
      estado: status as CoverageEntry['estado'],
      detalle: entry.coverageNotes ?? entry.missingReason ?? '',
      fuente: entry.sourceName,
      periodo: entry.period,
    })
  }
  // Aviso territorial AEAT (foral / Ceuta-Melilla) cuando aplique.
  if (opts.codigoINE) {
    const territorial = avisoCoberturaAeatTerritorio(opts.codigoINE)
    if (territorial && slugs.some((s) => s.startsWith('irpf_'))) {
      out.push({
        titulo: 'IRPF municipal AEAT en este territorio',
        estado: 'missing_by_design',
        detalle: territorial,
        fuente: 'Agencia Estatal de Administración Tributaria',
        periodo: '2023',
      })
    }
  }
  return out
}

/** Glosario de estados de cobertura para la hoja XLSX "Criterios y fuentes". */
export const COVERAGE_STATUS_GLOSSARY: ReadonlyArray<{ estado: string; texto: string }> = [
  {
    estado: 'partial',
    texto: 'Cobertura parcial: la fuente oficial no llega a todo el territorio (p. ej. AEAT EDM 2023 con 7.600 municipios cargados; ausentes por régimen foral o falta de puente de código).',
  },
  {
    estado: 'missing_by_design',
    texto: `Sin dato por diseño de la fuente: ${AEAT_FORAL_NOTICE}`,
  },
  {
    estado: 'Sin puente AEAT ↔ INE-5',
    texto:
      'Ceuta y Melilla: la AEAT estatal publica estos territorios con código propio (55001/56001) sin correspondencia oficial validada frente al INE-5 municipal (51001/52001). El dato no se une por nombre ni por equivalencia no documentada; no se estima ni se sustituye.',
  },
  {
    estado: 'blocked_source',
    texto: `Bloqueado por falta de fuente estructurada: ${AEAT_BLOCKED_NOTICE}`,
  },
  {
    estado: 'pending',
    texto: 'Pendiente de integración: falta incorporar una fuente oficial aún no conectada.',
  },
  {
    estado: 'temporary_error',
    texto: 'Error operativo temporal: fallo puntual de obtención, sin alterar el histórico.',
  },
  {
    estado: 'available',
    texto: 'Dato presente y consolidado publicado por la fuente oficial.',
  },
  {
    estado: 'Regla de oro',
    texto: 'La ausencia de dato nunca equivale a 0. AEAT y ADRH se publican como series separadas y no se mezclan.',
  },
]
