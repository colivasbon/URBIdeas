// Validación programática del libro XLSX municipal comparativo SOCideas.
// Nivel librería (sin servidor, sin red). Construye el libro para los municipios
// de prueba (02003 Albacete, 07010 Bunyola, 02069 La Roda, 28079 Madrid,
// 31193 Cendea de Olza / Olza Zendea, uno con nombre muy largo y 28143 parcial)
// y lo relee con ExcelJS.
//
// CAMBIO DE CONTRATO (v2 `socideas-book@2`, 11 hojas): "sin celdas fusionadas",
// "sin freeze", "sin autofilter", "sin enlaces internos", "columnas ≤24 /
// Año = 10" y "cero hojas de trazabilidad" quedan SUPERSEDIDOS. Ahora se EXIGE
// freeze en todas las hojas, tablas con filtro, navegación interna, fusiones de
// título/fuente/nota (para no truncar) y tope de columna 42.
//
// Falla (exit 1) si:
//  - no hay exactamente 11 hojas en el orden contractual `socideas-book@2`;
//  - existe alguna hoja oculta o falta freeze/autofilter/fusiones;
//  - existe cualquier URL externa fuera del allowlist oficial (R2, Supabase,
//    Vercel, GitHub, localhost, CSV masivo, etc.) o no https;
//  - el texto visible de un enlace externo no es SOURCE_LINK_LABEL;
//  - una banda verde sobrepasa la última columna real de un bloque o se pinta
//    una celda verde vacía posterior a la última columna;
//  - alguna columna supera ancho 42 o algún texto/altura queda truncado;
//  - aparece un suprimido serializado como 0 (salvo conteos de pirámide);
//  - la hoja de asociaciones contiene teléfonos, emails, direcciones o nombres
//    de contacto;
//  - se inventan datos de otro municipio, datos censales como anuales o datos
//    personales.
//
// Uso: npx tsx scripts/verify-xlsx-comparative-book.ts
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { writeFileSync, readFileSync } from 'node:fs'
import {
  buildDemografiaTables,
  buildEconomiaTables,
} from '../src/lib/socideas-export'
import { buildDemographicDimensionTables } from '../src/lib/socideas-demographic-export'
import {
  buildMunicipioWorkbook,
  SOURCE_LINK_LABEL,
  XLSX_BRAND,
  type LegacyComparativeSheetInput,
} from '../src/lib/socideas-xlsx'
import { SOCIDEAS_BOOK_SHEET_IDS } from '../src/lib/socideas-book-contract'
import { findLayoutProblems, MAX_ALLOWED_COLUMN_WIDTH } from './xlsx-layout-assert'
import {
  AEAT_EDM_IRPF,
  SOCIDEAS_SOURCE_REGISTRY,
  isAllowedSourceUrl,
} from '../src/lib/socideas-source-registry'
import type { IndicatorValue } from '../src/lib/socideas'
import type { DemographicPresentationData } from '../src/lib/socideas-demographic-summary'
import type { MunicipalIneLayersV1 } from '../src/lib/socideas-ine-layers'

const EXPORT_DIR = 'tmp'
const EXPECTED_SHEETS = [...SOCIDEAS_BOOK_SHEET_IDS]
const FORBIDDEN_HOSTS = /(cloudflarestorage|supabase\.co|vercel\.app|cloudflare\.com|github\.com|localhost|127\.0\.0\.1|0\.0\.0\.0)/i
const FORBIDDEN_CSV = /\.csv(\?|$)/i

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

// ---------- Helpers de lectura ----------

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown
  if (v && typeof v === 'object') {
    const o = v as { text?: unknown; richText?: { text: string }[] }
    if (typeof o.text === 'string') return o.text
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('')
    if (v instanceof Date) return v.toISOString()
    return ''
  }
  return v === null || v === undefined ? '' : String(v)
}

function cellHyperlink(cell: ExcelJS.Cell): string | null {
  const v = cell.value as unknown
  if (v && typeof v === 'object') {
    const h = (v as { hyperlink?: unknown }).hyperlink
    if (typeof h === 'string' && h.length > 0) return h
  }
  const own = (cell as unknown as { hyperlink?: unknown }).hyperlink
  return typeof own === 'string' && own.length > 0 ? own : null
}

const fillOf = (c: ExcelJS.Cell): string | undefined =>
  (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
const isGreen = (c: ExcelJS.Cell): boolean => fillOf(c) === 'FF3E665C'

// ---------- Datos sintéticos (alineados con verify-xlsx-source-links) ----------

const MUNI = (ine: string, nombre: string) => ({
  codigo_ine: ine,
  nombre,
  poblacion: 5000,
  provincia: 'Provincia Test',
  provincia_codigo_ine: '99',
  comunidad_autonoma: 'CCAA Test',
  centroide_lng: null,
  centroide_lat: null,
})

function indicator(
  slug: string,
  anio: number,
  valor: number | null,
  ambito = 'municipio',
  tableId = '2855',
): IndicatorValue {
  return {
    id: `${slug}-${anio}-${ambito}`,
    municipio_codigo_ine: '99999',
    indicator_id: slug,
    fecha_referencia: `${anio}-01-01`,
    anio_referencia: anio,
    valor_numerico: valor,
    valor_texto: null,
    unidad: 'personas',
    dimensiones: { ambito },
    source_id: 'ine',
    source_url: `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${tableId}`,
    source_table_id: tableId,
    source_series_id: null,
    obtenido_en: '2026-09-06',
    estado_validacion: 'validado',
    indicator: {
      id: slug, slug, nombre: slug, grupo: 'test', descripcion: null, unidad: null,
      metodologia: null, fuente_principal_id: null, periodicidad: null,
      visualizacion_recomendada: null, activo: true,
    },
    source: {
      id: 'ine', slug: 'ine_tempus3', organismo: 'Instituto Nacional de Estadística',
      nombre: 'Cifras oficiales', descripcion: null, url_base: null, api_table_id: null,
      licencia: null, frecuencia_actualizacion: null, activo: true,
    },
  } as unknown as IndicatorValue
}

interface DemoOptions {
  ine: string
  nombre: string
  anio: number
  total: number
  male: number | null
  female: number | null
  evo: number[]
  prov: number[]
  ccaa: number[]
  espana: number[]
  pir: { tramo: string; hombres: number; mujeres: number }[]
  cambios: { c5: number | null; c10: number | null; env: number | null; dep: number | null }
  dpop: string
  adrh: string
}

function demoProfile(o: DemoOptions): unknown {
  const evoStart = o.anio - o.evo.length + 1
  const provStart = o.anio - o.prov.length + 1
  return {
    municipio: MUNI(o.ine, o.nombre),
    sincronizado: true,
    ultima_sincronizacion: null,
    total: indicator('population_total', o.anio, o.total, 'municipio', o.dpop),
    hombres: indicator('population_male', o.anio, o.male, 'municipio', o.dpop),
    mujeres: indicator('population_female', o.anio, o.female, 'municipio', o.dpop),
    evolucion: o.evo.map((x, i) => indicator('population_evolution', evoStart + i, x, 'municipio', o.dpop)),
    comparativas: {
      provincia: o.prov.map((x, i) => ({
        ...indicator('population_total', provStart + i, x, 'provincia', '2855'),
        dimensiones: { ambito: 'provincia', nombre: 'Provincia Test' },
      })),
      ccaa: o.ccaa.map((x, i) => ({
        ...indicator('population_total', provStart + i, x, 'ccaa', '2853'),
        dimensiones: { ambito: 'ccaa', nombre: 'CCAA Test' },
      })),
      espana: o.espana.map((x, i) => ({
        ...indicator('population_total', provStart + i, x, 'espana', '2853'),
        dimensiones: { ambito: 'espana', nombre: 'España' },
      })),
    },
    piramide: o.pir.length > 0 ? { anio: o.anio, grupos: o.pir } : { anio: null, grupos: [] },
    derivados: {
      cambio_5y: o.cambios.c5,
      cambio_10y: o.cambios.c10,
      indice_envejecimiento: o.cambios.env,
      indice_dependencia: o.cambios.dep,
    },
    densidad: { valor: null, pendiente: 'x' },
    valores: [],
    disponibles: {},
    filtros: {},
  }
}

function ecoProfile(o: { ine: string; nombre: string; renta: boolean; gini: boolean; empresas: boolean; agrario: boolean; adrh: string }): unknown {
  const valores: IndicatorValue[] = []
  if (o.renta) {
    valores.push(indicator('irpf_declaraciones', 2023, 3800, 'municipio', '30342'))
    valores.push(indicator('irpf_renta_bruta_media', 2023, 27000, 'municipio', '30342'))
    valores.push(indicator('irpf_renta_disponible_media', 2023, 25000, 'municipio', '30342'))
    valores.push(indicator('renta_neta_media_persona', 2023, 14000, 'municipio', o.adrh))
    valores.push(indicator('renta_neta_media_hogar', 2023, 33000, 'municipio', o.adrh))
  }
  if (o.gini) {
    valores.push(indicator('gini', 2022, 30.8, 'municipio', '37683'))
    valores.push(indicator('gini', 2023, 31.2, 'municipio', '37683'))
    valores.push(indicator('p80_p20', 2023, 5.4, 'municipio', '37683'))
  }
  if (o.empresas) {
    valores.push(indicator('empresas_total', 2025, 320, 'municipio', '4721'))
    valores.push(indicator('empresas_industria', 2025, 40, 'municipio', '4721'))
    valores.push(indicator('empresas_servicios', 2025, 200, 'municipio', '4721'))
    valores.push(indicator('empresas_comercio_hosteleria', 2025, 90, 'municipio', '4721'))
  }
  if (o.agrario) {
    valores.push(indicator('agr_sau_total', 2020, 1500, 'municipio', '29006'))
    valores.push(indicator('agr_explotaciones', 2020, 45, 'municipio', '29006'))
    valores.push(indicator('gan_bovino_exp', 2020, 3, 'municipio', '29006'))
    valores.push(indicator('gan_bovino_cab', 2020, null, 'municipio', '29006'))
  }
  return {
    municipio: MUNI(o.ine, o.nombre),
    sincronizado: true,
    ultima_sincronizacion: null,
    valores,
    ultimoPorIndicador: {},
    disponibles: [],
  }
}

type DimStatus = 'observed' | 'suppressed' | 'missing' | 'partial'

function makeDims(o: {
  period: string
  status: DimStatus
  spanish: number | null
  foreign: number | null
  spain: number | null
  countries: { label: string; value: number | null }[]
  arraigo: { label: string; value: number | null }[]
  birthStatus?: DimStatus
  arraigoStatus?: DimStatus
}): DemographicPresentationData {
  const total = o.spanish !== null && o.foreign !== null ? o.spanish + o.foreign : null
  const pct = (part: number | null): number | null =>
    part === null || total === null || total === 0 ? null : Math.round((part / total) * 1000) / 10
  const arraigoTotal = o.arraigo.every((a) => a.value !== null)
    ? o.arraigo.reduce((acc, a) => acc + (a.value as number), 0)
    : null
  const arraigoPct = (v: number | null): number | null =>
    v === null || arraigoTotal === null || arraigoTotal === 0 ? null : Math.round((v / arraigoTotal) * 1000) / 10
  const catKey = [
    'sameMunicipality',
    'sameProvinceOtherMunicipality',
    'sameAutonomousCommunityOtherProvince',
    'otherAutonomousCommunity',
    'bornAbroad',
  ] as const
  return {
    nationality: {
      period: o.period,
      total,
      spanish: o.spanish,
      foreign: o.foreign,
      spanishPercent: pct(o.spanish),
      foreignPercent: pct(o.foreign),
      status: o.status,
      source: { label: 'Instituto Nacional de Estadística', tableId: '68535' },
    },
    birthCountry: {
      period: o.period,
      spain: o.spain === null ? null : { label: 'España', value: o.spain, status: 'observed' },
      topCountries: o.countries.map((c) => ({
        label: c.label,
        value: c.value,
        status: c.value === null ? 'suppressed' : 'observed',
      })),
      status: o.birthStatus ?? 'observed',
      source: { label: 'Instituto Nacional de Estadística', tableId: '66322' },
      note: 'Categorías de país publicadas por el INE.',
    },
    birthResidenceRelation: {
      period: o.period,
      total: arraigoTotal,
      categories: o.arraigo.map((a, i) => ({
        key: catKey[i],
        label: a.label,
        value: a.value,
        percent: arraigoPct(a.value),
        status: a.value === null ? 'suppressed' : 'observed',
      })),
      status: o.arraigoStatus ?? 'observed',
      source: { label: 'Instituto Nacional de Estadística', tableId: '68540' },
    },
  }
}

const ARRAIGO_LABELS = [
  'Nacida/o en este municipio',
  'Nacida/o en otro municipio de la provincia',
  'Nacida/o en otra provincia de la comunidad autónoma',
  'Nacida/o en otra comunidad autónoma',
  'Nacida/o en el extranjero',
]

interface Scenario {
  ine: string
  nombre: string
  demo: unknown
  eco: unknown
  dims: DemographicPresentationData
  ineLayers: MunicipalIneLayersV1 | null
}

function makeIneLayers(ine: string, nombre: string, periodo: string): MunicipalIneLayersV1 {
  return {
    schemaVersion: 'municipal-ine-layers-v1',
    ineCode: ine,
    municipalityName: nombre,
    generatedAt: '2026-09-11',
    layers: {
      migration: {
        period: periodo,
        annualSeries: [
          { period: '2020', total: { value: 12, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false }, interior: { value: -4, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false }, exterior: { value: 16, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2020', derived: false } },
          { period: '2021', total: { value: 8, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2021', derived: false }, interior: { value: -3, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2021', derived: false }, exterior: { value: 11, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2021', derived: false } },
        ],
        latest: { period: '2021', total: { value: 8, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2021', derived: false }, interior: { value: -3, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2021', derived: false }, exterior: { value: 11, unit: 'personas', status: 'observed', source: 'INE', tableId: '29046', period: '2021', derived: false } },
        status: 'observed',
      },
      education: {
        period: '2021',
        censusYear: 2021,
        total: {
          primaryOrBelow: { value: 1500, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          lowerSecondary: { value: 1200, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          upperSecondaryPostSecondary: { value: 1100, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          higher: { value: 900, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
          notApplicableUnder15: { value: 600, unit: 'personas', status: 'observed', source: 'INE', tableId: '63821', period: '2021', derived: false },
        },
        status: 'observed',
      },
    },
    quality: { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'passed' },
  }
}

function scenarios(): Scenario[] {
  return [
    {
      ine: '02003', nombre: 'Albacete',
      demo: demoProfile({
        ine: '02003', nombre: 'Albacete', anio: 2024, total: 173050, male: 84300, female: 88750,
        evo: [170000, 171000, 172000, 172500, 173050],
        prov: [390000, 391000, 392000, 393000, 394000],
        ccaa: [2040000, 2045000, 2050000],
        espana: [48000000, 48100000, 48200000],
        pir: [{ tramo: '0-4', hombres: 0, mujeres: 4100 }, { tramo: '65-69', hombres: 3900, mujeres: 4100 }],
        cambios: { c5: 1.8, c10: 3.2, env: 98.5, dep: 52.1 },
        dpop: '2855', adrh: '37683',
      }),
      eco: ecoProfile({ ine: '02003', nombre: 'Albacete', renta: true, gini: true, empresas: true, agrario: true, adrh: '37683' }),
      dims: makeDims({
        period: '2025', status: 'observed', spanish: 146450, foreign: 26600, spain: 151000,
        countries: [{ label: 'Rumanía', value: 3200 }, { label: 'Marruecos', value: 2900 }, { label: 'Colombia', value: 2100 }],
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: 92000 },
          { label: ARRAIGO_LABELS[1], value: 25000 },
          { label: ARRAIGO_LABELS[2], value: 18000 },
          { label: ARRAIGO_LABELS[3], value: 22000 },
          { label: ARRAIGO_LABELS[4], value: 16050 },
        ],
      }),
      ineLayers: makeIneLayers('02003', 'Albacete', '2021'),
    },
    {
      ine: '07010', nombre: 'Bunyola',
      demo: demoProfile({
        ine: '07010', nombre: 'Bunyola', anio: 2024, total: 7200, male: 3650, female: 3550,
        evo: [6800, 6900, 7000, 7100, 7200],
        prov: [1120000, 1125000, 1130000, 1135000, 1140000],
        ccaa: [], espana: [],
        pir: [{ tramo: '0-4', hombres: 320, mujeres: 300 }, { tramo: '65-69', hombres: 210, mujeres: 220 }],
        cambios: { c5: 2.4, c10: 4.1, env: 110.2, dep: 58.7 },
        dpop: '2907', adrh: '37683',
      }),
      eco: ecoProfile({ ine: '07010', nombre: 'Bunyola', renta: true, gini: true, empresas: true, agrario: false, adrh: '37683' }),
      dims: makeDims({
        period: '2025', status: 'observed', spanish: 6100, foreign: 1100, spain: 6400,
        countries: [{ label: 'Alemania', value: 260 }, { label: 'Reino Unido', value: 180 }],
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: 3100 },
          { label: ARRAIGO_LABELS[1], value: 1500 },
          { label: ARRAIGO_LABELS[2], value: 900 },
          { label: ARRAIGO_LABELS[3], value: 1200 },
          { label: ARRAIGO_LABELS[4], value: 500 },
        ],
      }),
      ineLayers: makeIneLayers('07010', 'Bunyola', '2021'),
    },
    {
      ine: '02069', nombre: 'La Roda',
      demo: demoProfile({
        ine: '02069', nombre: 'La Roda', anio: 2025, total: 15643, male: 7877, female: 7766,
        evo: [15400, 15450, 15500, 15610, 15643],
        prov: [390000, 391000, 392000, 393000, 394000],
        ccaa: [2040000, 2045000, 2050000],
        espana: [48000000, 48100000, 48200000],
        pir: [{ tramo: '0-4', hombres: 0, mujeres: 410 }, { tramo: '65-69', hombres: 390, mujeres: 410 }],
        cambios: { c5: 1.1, c10: 2.2, env: 101.4, dep: 55.3 },
        dpop: '2855', adrh: '37683',
      }),
      eco: ecoProfile({ ine: '02069', nombre: 'La Roda', renta: true, gini: true, empresas: true, agrario: true, adrh: '37683' }),
      dims: makeDims({
        period: '2025', status: 'observed', spanish: 13800, foreign: 1843, spain: 14200,
        countries: [{ label: 'Marruecos', value: 420 }, { label: 'Rumanía', value: 300 }],
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: 9000 },
          { label: ARRAIGO_LABELS[1], value: 2500 },
          { label: ARRAIGO_LABELS[2], value: 1500 },
          { label: ARRAIGO_LABELS[3], value: 1800 },
          { label: ARRAIGO_LABELS[4], value: 843 },
        ],
      }),
      ineLayers: makeIneLayers('02069', 'La Roda', '2021'),
    },
    {
      ine: '28079', nombre: 'Madrid',
      demo: demoProfile({
        ine: '28079', nombre: 'Madrid', anio: 2024, total: 3332035, male: 1576000, female: 1756035,
        evo: [3300000, 3310000, 3320000, 3325000, 3332035],
        prov: [6800000, 6850000, 6900000, 6950000, 7000000],
        ccaa: [6700000, 6750000, 6800000],
        espana: [48000000, 48100000, 48200000],
        pir: [{ tramo: '0-4', hombres: 120000, mujeres: 115000 }, { tramo: '65-69', hombres: 90000, mujeres: 105000 }],
        cambios: { c5: 0.9, c10: 1.4, env: 120.5, dep: 48.2 },
        dpop: '2855', adrh: '37683',
      }),
      eco: ecoProfile({ ine: '28079', nombre: 'Madrid', renta: true, gini: true, empresas: true, agrario: true, adrh: '37683' }),
      dims: makeDims({
        period: '2025', status: 'observed', spanish: 2800000, foreign: 532035, spain: 2850000,
        countries: [
          { label: 'Venezuela', value: 48000 },
          { label: 'Colombia', value: 42000 },
          { label: 'Perú', value: 30000 },
          { label: 'República Popular China', value: 21000 },
        ],
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: 1500000 },
          { label: ARRAIGO_LABELS[1], value: 350000 },
          { label: ARRAIGO_LABELS[2], value: 420000 },
          { label: ARRAIGO_LABELS[3], value: 700000 },
          { label: ARRAIGO_LABELS[4], value: 362035 },
        ],
      }),
      ineLayers: makeIneLayers('28079', 'Madrid', '2021'),
    },
    {
      ine: '31193', nombre: 'Cendea de Olza / Olza Zendea',
      demo: demoProfile({
        ine: '31193', nombre: 'Cendea de Olza / Olza Zendea', anio: 2024, total: 1900, male: 980, female: 920,
        evo: [1800, 1820, 1850, 1880, 1900],
        prov: [650000, 651000, 652000, 653000, 654000],
        ccaa: [660000, 661000, 662000],
        espana: [48000000, 48100000, 48200000],
        pir: [{ tramo: '0-4', hombres: 80, mujeres: 75 }, { tramo: '65-69', hombres: 55, mujeres: 60 }],
        cambios: { c5: 3.1, c10: 5.2, env: 95.4, dep: 51.8 },
        dpop: '2855', adrh: '37683',
      }),
      eco: ecoProfile({ ine: '31193', nombre: 'Cendea de Olza / Olza Zendea', renta: true, gini: true, empresas: true, agrario: true, adrh: '37683' }),
      dims: makeDims({
        period: '2025', status: 'observed', spanish: 1650, foreign: 250, spain: 1700,
        countries: [{ label: 'Rumanía', value: 60 }, { label: 'Marruecos', value: 45 }],
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: 800 },
          { label: ARRAIGO_LABELS[1], value: 300 },
          { label: ARRAIGO_LABELS[2], value: 200 },
          { label: ARRAIGO_LABELS[3], value: 350 },
          { label: ARRAIGO_LABELS[4], value: 250 },
        ],
      }),
      ineLayers: makeIneLayers('31193', 'Cendea de Olza / Olza Zendea', '2021'),
    },
    {
      ine: '99998',
      nombre: 'San Sebastián de los Ballesteros y Anexos de la Vega del Guadalquivir',
      demo: demoProfile({
        ine: '99998',
        nombre: 'San Sebastián de los Ballesteros y Anexos de la Vega del Guadalquivir',
        anio: 2024, total: 6400, male: 3200, female: 3200,
        evo: [6100, 6200, 6300, 6350, 6400],
        prov: [390000, 391000, 392000, 393000, 394000],
        ccaa: [2040000, 2045000, 2050000],
        espana: [48000000, 48100000, 48200000],
        pir: [{ tramo: '0-4', hombres: 200, mujeres: 190 }, { tramo: '65-69', hombres: 150, mujeres: 170 }],
        cambios: { c5: 2.0, c10: 3.5, env: 102.3, dep: 53.4 },
        dpop: '2855', adrh: '37683',
      }),
      eco: ecoProfile({
        ine: '99998',
        nombre: 'San Sebastián de los Ballesteros y Anexos de la Vega del Guadalquivir',
        renta: true, gini: true, empresas: true, agrario: true, adrh: '37683',
      }),
      dims: makeDims({
        period: '2025', status: 'observed', spanish: 5700, foreign: 700, spain: 5800,
        countries: [{ label: 'Marruecos', value: 180 }, { label: 'Rumanía', value: 120 }],
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: 3200 },
          { label: ARRAIGO_LABELS[1], value: 1200 },
          { label: ARRAIGO_LABELS[2], value: 700 },
          { label: ARRAIGO_LABELS[3], value: 900 },
          { label: ARRAIGO_LABELS[4], value: 400 },
        ],
      }),
      ineLayers: makeIneLayers(
        '99998',
        'San Sebastián de los Ballesteros y Anexos de la Vega del Guadalquivir',
        '2021',
      ),
    },
    {
      ine: '28143', nombre: 'Municipio Pequeño',
      demo: demoProfile({
        ine: '28143', nombre: 'Municipio Pequeño', anio: 2024, total: 420, male: null, female: null,
        evo: [410, 415, 420],
        prov: [], ccaa: [], espana: [],
        pir: [],
        cambios: { c5: null, c10: null, env: null, dep: null },
        dpop: '2868', adrh: '37683',
      }),
      eco: ecoProfile({ ine: '28143', nombre: 'Municipio Pequeño', renta: false, gini: true, empresas: true, agrario: false, adrh: '37683' }),
      dims: makeDims({
        period: '2025', status: 'suppressed', spanish: null, foreign: null, spain: null,
        countries: [{ label: 'Rumanía', value: null }, { label: 'Marruecos', value: null }],
        birthStatus: 'suppressed',
        arraigo: [
          { label: ARRAIGO_LABELS[0], value: null },
          { label: ARRAIGO_LABELS[1], value: null },
          { label: ARRAIGO_LABELS[2], value: null },
          { label: ARRAIGO_LABELS[3], value: null },
          { label: ARRAIGO_LABELS[4], value: null },
        ],
        arraigoStatus: 'suppressed',
      }),
      ineLayers: null,
    },
  ]
}

// ---------- Validación del registro ----------

function verifyRegistry(): void {
  console.log('\n=== Registro central de fuentes ===')
  const entries: [string, { publicUrl?: string; shortLabel: string; tableId?: string }][] = [
    ...Object.entries(SOCIDEAS_SOURCE_REGISTRY),
    ['aeat_edm_irpf', AEAT_EDM_IRPF],
  ]
  for (const [key, ref] of entries) {
    check(`registro ${key} con shortLabel`, typeof ref.shortLabel === 'string' && ref.shortLabel.length > 0)
    check(`registro ${key} con URL https autorizada`, isAllowedSourceUrl(ref.publicUrl), ref.publicUrl ?? 'sin URL')
    check(`registro ${key} sin CSV masivo`, !(ref.publicUrl ?? '').toLowerCase().endsWith('.csv'))
  }
}

// ---------- Análisis por escenario ----------

interface Built { file: string; buffer: Buffer }

async function buildScenario(s: Scenario): Promise<Built> {
  const demografia = [
    ...buildDemografiaTables(s.demo as never),
    ...buildDemographicDimensionTables(s.dims),
  ]
  const economia = buildEconomiaTables(s.eco as never)
  const hojas: LegacyComparativeSheetInput[] = [
    { id: '01_PERFIL_DEMOGRÁFICO', titulo: 'Perfil demográfico', bloques: demografia },
    { id: '03_CONTEXTO_ECONÓMICO', titulo: 'Contexto económico', bloques: economia },
  ]
  const buffer = await buildMunicipioWorkbook({
    municipio: s.nombre,
    codigoINE: s.ine,
    provincia: 'Provincia Test',
    comunidadAutonoma: 'CCAA Test',
    fechaGeneracion: '2026-09-11',
    hojas,
    ineLayers: s.ineLayers,
  })
  return { file: `${EXPORT_DIR}/xlsx-comparative-${s.ine}.xlsx`, buffer }
}

async function analyze(s: Scenario, built: Built): Promise<void> {
  console.log(`\n=== ${s.ine} (${s.nombre}) ===`)
  writeFileSync(built.file, built.buffer)
  check('firma ZIP', built.buffer.length > 0 && built.buffer[0] === 0x50 && built.buffer[1] === 0x4b, `${built.buffer.length} B`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(built.file))
  const names = wb.worksheets.map((w) => w.name)
  check('11 hojas exactas en orden contractual (socideas-book@2)', JSON.stringify(names) === JSON.stringify(EXPECTED_SHEETS), names.join(','))
  check('sin hojas adicionales', names.length === EXPECTED_SHEETS.length)

  let frozenSheets = 0
  let filterOrTableSheets = 0
  let mergedCells = 0
  let greenOutside = 0
  const widthProblems: string[] = []
  const linkProblems: string[] = []
  const linkLabelProblems: string[] = []
  const externalLinks: string[] = []
  const forbiddenFound: string[] = []

  for (const ws of wb.worksheets) {
    if ((ws.views ?? []).some((v) => v.state === 'frozen' || v.xSplit || v.ySplit)) frozenSheets += 1
    if (ws.autoFilter || ws.getTables().length > 0) filterOrTableSheets += 1
    if ((ws as unknown as { state?: string }).state === 'hidden') {
      check(`hoja visible: ${ws.name}`, false, 'estado hidden')
    }

    ws.eachRow((row, rn) => {
      row.eachCell((cell, ci) => {
        const l = cellHyperlink(cell)
        // Los enlaces internos de navegación del contrato v2 (`location="…"`)
        // no llegan como hipervínculo a ExcelJS; se cuentan del XML. Todo
        // hipervínculo visible aquí es externo y debe cumplir la allowlist.
        if (l && !l.startsWith('#')) {
          externalLinks.push(l)
          if (FORBIDDEN_HOSTS.test(l)) linkProblems.push(`${ws.name} R${rn}C${ci} host prohibido (${l})`)
          if (!l.startsWith('https://')) linkProblems.push(`${ws.name} R${rn}C${ci} no https (${l})`)
          if (FORBIDDEN_CSV.test(l)) linkProblems.push(`${ws.name} R${rn}C${ci} CSV masivo (${l})`)
          if (!isAllowedSourceUrl(l)) linkProblems.push(`${ws.name} R${rn}C${ci} dominio no autorizado (${l})`)
          if (cellText(cell) !== SOURCE_LINK_LABEL) {
            linkLabelProblems.push(`${ws.name} R${rn}C${ci} "${cellText(cell).slice(0, 32)}"`)
          }
        }
        if (cell.isMerged) mergedCells += 1
        const s = cellText(cell)
        for (const t of ['#VALUE!', 'ERROR', 'Hojas detalladas', '03_Secciones']) {
          if (s.includes(t)) forbiddenFound.push(`${ws.name} R${rn}: ${t}`)
        }
      })
    })
  }

  // Validación por hoja (se excluyen las hojas meta 00/10: índice y catálogo).
  for (const ws of wb.worksheets) {
    if (ws.name === '00_RESUMEN' || ws.name === '10_METODOLOGÍA_FUENTES') continue

    ws.eachRow((row, rn) => {
      let ncols = 0
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        if (isGreen(row.getCell(ci))) ncols = ci
        else break
      }
      if (ncols < 2) return
      for (let ci = ncols + 1; ci <= ws.columnCount; ci += 1) {
        if (isGreen(row.getCell(ci))) greenOutside += 1
      }
      // Enlaces en fila fuente deben estar dentro de ncols.
      row.eachCell((cell, ci) => {
        if (cellHyperlink(cell) && ci > ncols) {
          linkProblems.push(`${ws.name} R${rn}C${ci} enlace fuera de rango (ncols=${ncols})`)
        }
      })
    })

    for (let ci = 1; ci <= ws.columnCount; ci += 1) {
      const w = ws.getColumn(ci).width ?? 0
      if (w > MAX_ALLOWED_COLUMN_WIDTH) widthProblems.push(`${ws.name} C${ci}=${w}`)
    }
    // La columna A es unificada; "Año" ya no se fuerza a 10 (convive con
    // etiquetas largas), pero nunca debe quedar por debajo del mínimo legible.
    ws.eachRow((row) => {
      row.eachCell((cell, cn) => {
        if (cellText(cell) === 'Año') {
          const w = ws.getColumn(cn).width ?? 0
          if (w < 10) widthProblems.push(`${ws.name} Año C${cn}=${w} (mínimo 10)`)
        }
      })
    })
  }

  // Ceros prohibidos en hojas temáticas de datos (01–09) salvo los recuentos
  // reales de la pirámide (01_DEMOGRAFÍA). Los ceros-contador del índice de
  // 00_RESUMEN no son valores suprimidos y quedan fuera del barrido.
  const zeroProblems: string[] = []
  let piramideRows: { sheet: string; start: number; end: number } | null = null
  for (const ws of wb.worksheets) {
    if (ws.name !== '01_DEMOGRAFÍA') continue
    let pirStart = -1
    let pirEnd = -1
    ws.eachRow((row, rn) => {
      const first = cellText(row.getCell(1))
      if (first.startsWith('Estructura por edad y sexo')) pirStart = rn
      else if (pirStart > 0 && pirEnd < 0 && first === '') pirEnd = rn
    })
    if (pirStart > 0) piramideRows = { sheet: ws.name, start: pirStart, end: pirEnd > 0 ? pirEnd : 9999 }
  }
  for (const ws of wb.worksheets) {
    if (!/^0[1-9]_/.test(ws.name)) continue
    ws.eachRow((row, rn) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'number' && cell.value === 0) {
          if (piramideRows && ws.name === piramideRows.sheet && rn > piramideRows.start && rn < piramideRows.end) return
          zeroProblems.push(`${ws.name} R${rn}`)
        }
      })
    })
  }

  // Datos personales prohibidos en asociaciones.
  const personalFound: string[] = []
  for (const ws of wb.worksheets) {
    if (ws.name !== '09_ASOCIACIONES_GOBERNANZA') continue
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const t = cellText(cell)
        // Email real (la cabecera de ámbito contiene el esquema `socideas-book@2`
        // y no es un dato personal), teléfono de 9 dígitos y prefijo +34.
        if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t) || /\b\d{9}\b/.test(t) || /\b\d{3}\s\d{3}\s\d{3}\b/.test(t) || /\+34/.test(t)) {
          personalFound.push(`${ws.name}: ${t.slice(0, 60)}`)
        }
      })
    })
  }

  // Macros/ActiveX/VBA y enlaces internos (solo visibles en el XML).
  const zip = await JSZip.loadAsync(built.buffer)
  const macroEntries = Object.keys(zip.files).filter((f) => /vbaProject|activeX|macrosheet/i.test(f))
  const hasVba = Object.keys(zip.files).some((f) => f.toLowerCase().endsWith('.bin'))
  let internalLinks = 0
  for (const file of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    const xml = (await zip.file(file)?.async('string')) ?? ''
    internalLinks += (xml.match(/location="/g) ?? []).length
  }

  // Maquetación: relectura con el comprobador compartido. Exige fusiones
  // (títulos/fuente/notas) y que NINGÚN texto quede truncado.
  const { problems: layoutProblems, stats: layoutStats } = findLayoutProblems(wb)

  check('freeze panes en TODAS las hojas', frozenSheets === EXPECTED_SHEETS.length, `${frozenSheets}/${EXPECTED_SHEETS.length}`)
  check('autofilter o tabla nativa en cada hoja', filterOrTableSheets === EXPECTED_SHEETS.length, `${filterOrTableSheets}/${EXPECTED_SHEETS.length}`)
  check('enlaces internos de navegación ≥8', internalLinks >= 8, `${internalLinks}`)
  check(
    'fusiones presentes para títulos/fuente/notas (contrato v2)',
    mergedCells > 0,
    `${mergedCells} celdas fusionadas`,
  )
  check('sin macros/ActiveX/VBA', macroEntries.length === 0 && !hasVba, macroEntries.join(','))
  check('sin barra verde fuera de tabla', greenOutside === 0, `${greenOutside}`)
  check(
    `sin columna >${MAX_ALLOWED_COLUMN_WIDTH} (autoajuste)`,
    widthProblems.length === 0,
    widthProblems.slice(0, 3).join(' | '),
  )
  check(
    'sin texto truncado (ni cabeceras ni etiquetas de columna A)',
    layoutProblems.length === 0,
    layoutProblems.slice(0, 4).map((p) => `${p.sheet} R${p.row}C${p.col} [${p.kind}] ${p.detail}`).join(' | ') +
      ` (${layoutStats.cellsChecked} celdas, ${layoutStats.wrappedCells} con wrap, ${layoutStats.notesChecked} notas)`,
  )

  // Marca: la completa (XLSX_BRAND) vive en las propiedades del libro y, a lo
  // sumo, en 00/10; el resto de hojas usa el título corto "SOCideas · <hoja>".
  const brandLeaks: string[] = []
  if (wb.creator !== XLSX_BRAND) brandLeaks.push(`creator=${String(wb.creator)}`)
  for (const ws of wb.worksheets) {
    const title = cellText(ws.getRow(1).getCell(1))
    if (!title.startsWith('SOCideas ·')) brandLeaks.push(`${ws.name}: sin marca corta`)
    if (ws.name !== '00_RESUMEN' && ws.name !== '10_METODOLOGÍA_FUENTES' && title.includes(XLSX_BRAND)) {
      brandLeaks.push(`${ws.name}: marca completa fuera de 00/10`)
    }
  }
  check('marca completa solo en 00/10 y corta en el resto', brandLeaks.length === 0, brandLeaks.slice(0, 2).join(' | '))

  // 00: índice con las 11 hojas (00 + 9 temáticas 01–09 + 10) y, por fila, el
  // título de la hoja y el recuento de bloques (el contrato v2 sustituye al
  // listado "nombre/descripción en filas separadas" del v1).
  const summary = wb.getWorksheet('00_RESUMEN')
  const sheetIds = new Set<string>(EXPECTED_SHEETS)
  let listed = 0
  const indexProblems: string[] = []
  summary?.eachRow((row) => {
    const a = cellText(row.getCell(1))
    if (!sheetIds.has(a)) return
    listed += 1
    if (cellText(row.getCell(2)).length === 0) indexProblems.push(`${a}: sin título en la misma fila`)
    if (typeof row.getCell(3).value !== 'number') indexProblems.push(`${a}: sin recuento de bloques`)
  })
  check(
    '00: índice con las 11 hojas (9 temáticas 01-09 + 10)',
    listed === EXPECTED_SHEETS.length && indexProblems.length === 0,
    `listadas ${listed}/${EXPECTED_SHEETS.length} ${indexProblems.slice(0, 2).join(' | ')}`,
  )
  check('sin enlaces prohibidos', linkProblems.length === 0, linkProblems.slice(0, 3).join(' | '))
  check('sin URL técnica visible (#VALUE!, ERROR, etc.)', forbiddenFound.length === 0, forbiddenFound.slice(0, 3).join(' | '))
  check('suprimidos nunca como 0', zeroProblems.length === 0, zeroProblems.slice(0, 3).join(' | '))
  check('asociaciones sin datos personales', personalFound.length === 0, personalFound.slice(0, 3).join(' | '))
  check(
    `texto del enlace externo correcto (${SOURCE_LINK_LABEL})`,
    linkLabelProblems.length === 0,
    `${externalLinks.length} enlaces externos; ${linkLabelProblems.slice(0, 2).join(' | ')}`,
  )
}

async function main(): Promise<void> {
  verifyRegistry()
  for (const s of scenarios()) {
    const built = await buildScenario(s)
    await analyze(s, built)
  }
  console.log(`\n${failures === 0 ? 'OK' : failures} comprobaciones ${failures === 0 ? 'superadas' : 'FALLIDAS'}`)
  if (failures > 0) process.exit(1)
  console.log('Libro XLSX municipal comparativo verificado: 11 hojas del contrato socideas-book@2.')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
