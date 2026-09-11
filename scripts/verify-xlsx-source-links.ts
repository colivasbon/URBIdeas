// Validación programática de los enlaces de fuente oficial del XLSX municipal.
// Nivel librería (sin servidor ni credenciales): construye el libro con datos
// sintéticos para los cuatro municipios de prueba y lo relee con ExcelJS.
//
// Falla (exit 1) si:
//  - falta un hipervínculo en una tabla con fuente pública atribuible;
//  - el enlace no tiene texto visible o la URL no es https;
//  - el dominio no está en el allowlist oficial;
//  - hay URL R2/Supabase/Vercel/Cloudflare/localhost/GitHub o CSV masivo;
//  - el enlace cae fuera del rango real del bloque o pisa una celda fusionada;
//  - la fuente o el enlace ensanchan columnas de datos;
//  - hay fill verde fuera del rango real;
//  - se crean hojas o columnas adicionales, autofilter, freeze panes, macros,
//    ActiveX o VBA;
//  - un suprimido se serializa como 0 (salvo conteos reales de pirámide);
//  - los formatos/alineaciones por rol cambian.
//
// Uso: npx tsx scripts/verify-xlsx-source-links.ts
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { writeFileSync, readFileSync } from 'node:fs'
import {
  buildDemografiaTables,
  buildEconomiaTables,
  demografiaExcluidas,
  economiaExcluidas,
  seccionesExcluidas,
  type ExportTable,
} from '../src/lib/socideas-export'
import { buildDemographicDimensionTables } from '../src/lib/socideas-demographic-export'
import { buildMunicipioWorkbook, SOURCE_LINK_LABEL } from '../src/lib/socideas-xlsx'
import {
  AEAT_EDM_IRPF,
  SOCIDEAS_SOURCE_REGISTRY,
  isAllowedSourceUrl,
} from '../src/lib/socideas-source-registry'
import type { IndicatorValue } from '../src/lib/socideas'
import type { DemographicPresentationData } from '../src/lib/socideas-demographic-summary'

const MAIN_SHEETS = ['00_Resumen', '01_Demografía', '02_Economía']
const EXPORT_DIR = 'tmp'

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

// ---------- Datos sintéticos ----------

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
}

function scenarios(): Scenario[] {
  return [
    {
      ine: '02003',
      nombre: 'Albacete',
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
    },
    {
      ine: '07010',
      nombre: 'Bunyola',
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
    },
    {
      ine: '02069',
      nombre: 'La Roda',
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
    },
    {
      ine: '28143',
      nombre: 'Municipio Pequeño',
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
  check('Nacionalidad → INE 68535', SOCIDEAS_SOURCE_REGISTRY.ine_nationality_68535.publicUrl.endsWith('t=68535'))
  check('Lugar de nacimiento → INE 66322', SOCIDEAS_SOURCE_REGISTRY.ine_birth_country_66322.publicUrl.endsWith('t=66322'))
  check('Arraigo territorial → INE 68540', SOCIDEAS_SOURCE_REGISTRY.ine_birth_residence_68540.publicUrl.endsWith('t=68540'))
}

// ---------- Construcción y comprobaciones ----------

interface Built {
  file: string
  buffer: Buffer
  tables: ExportTable[]
  ecoTables: ExportTable[]
}

function stripSources(tables: ExportTable[]): ExportTable[] {
  return tables.map((t) => ({ ...t, source: undefined }))
}

async function buildScenario(s: Scenario): Promise<Built> {
  const demografia = [
    ...buildDemografiaTables(s.demo as never),
    ...buildDemographicDimensionTables(s.dims),
  ]
  const economia = buildEconomiaTables(s.eco as never)
  const buffer = await buildMunicipioWorkbook({
    municipio: s.nombre,
    codigoINE: s.ine,
    provincia: 'Provincia Test',
    comunidadAutonoma: 'CCAA Test',
    fechaGeneracion: '2026-09-11',
    demografia,
    economia,
    excluidasDemografia: demografiaExcluidas(),
    excluidasEconomia: economiaExcluidas(economia.some((t) => t.id === 'renta')),
    excluidasSecciones: seccionesExcluidas(),
  })
  return { file: `${EXPORT_DIR}/xlsx-source-links-${s.ine}.xlsx`, buffer, tables: demografia, ecoTables: economia }
}

async function analyze(s: Scenario, built: Built): Promise<void> {
  console.log(`\n=== ${s.ine} (${s.nombre}) ===`)
  writeFileSync(built.file, built.buffer)
  check('firma ZIP', built.buffer.length > 0 && built.buffer[0] === 0x50 && built.buffer[1] === 0x4b, `${built.buffer.length} B`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(built.file))
  const names = wb.worksheets.map((w) => w.name)
  check('tres hojas exactas', JSON.stringify(names) === JSON.stringify(MAIN_SHEETS), names.join(','))
  check('sin hojas adicionales', names.length === 3)

  // Control sin fuentes para probar que la procedencia no altera anchos.
  const controlBuffer = await (async () => {
    const demografia = stripSources([...buildDemografiaTables(s.demo as never), ...buildDemographicDimensionTables(s.dims)])
    const economia = stripSources(buildEconomiaTables(s.eco as never))
    return buildMunicipioWorkbook({
      municipio: s.nombre, codigoINE: s.ine, provincia: 'Provincia Test',
      comunidadAutonoma: 'CCAA Test', fechaGeneracion: '2026-09-11',
      demografia, economia,
      excluidasDemografia: demografiaExcluidas(),
      excluidasEconomia: economiaExcluidas(economia.some((t) => t.id === 'renta')),
      excluidasSecciones: seccionesExcluidas(),
    })
  })()
  const wbControl = new ExcelJS.Workbook()
  await wbControl.xlsx.load(controlBuffer)

  let frozen = false
  let filtered = false
  let internalLinks = 0
  let greenOutside = 0
  let mergedCells = 0
  let withLink = 0
  let missingLink = 0
  const linkUrls: string[] = []
  const dimUrls = { '68535': false, '66322': false, '68540': false }
  const textProblems: string[] = []
  const linkProblems: string[] = []
  const widthProblems: string[] = []
  const alignProblems: string[] = []
  const zeroProblems: string[] = []
  const expectedBlocks = { '01_Demografía': built.tables.length, '02_Economía': built.ecoTables.length }

  for (const ws of wb.worksheets) {
    for (const v of ws.views ?? []) {
      if (v.state === 'frozen' || v.xSplit || v.ySplit) frozen = true
    }
    if (ws.autoFilter) filtered = true
    if (ws.name === '00_Resumen') continue

    let detectedBlocks = 0
    ws.eachRow((row, rn) => {
      const first = cellText(row.getCell(1))
      if (first.startsWith('Fuente:')) {
        detectedBlocks += 1
        const headerRow = ws.getRow(rn + 1)
        let nCols = 0
        for (let ci = 1; ci <= ws.columnCount; ci += 1) {
          if (isGreen(headerRow.getCell(ci))) nCols = ci
          else break
        }
        // Fill verde fuera del rango real.
        for (let ci = nCols + 1; ci <= ws.columnCount; ci += 1) {
          if (isGreen(headerRow.getCell(ci))) greenOutside += 1
        }
        // Localiza enlace en la fila de fuente.
        let linkCol = -1
        let linkUrl: string | null = null
        for (let ci = 1; ci <= ws.columnCount; ci += 1) {
          const l = cellHyperlink(row.getCell(ci))
          if (l) {
            linkCol = ci
            linkUrl = l
          }
        }
        if (!linkUrl) {
          missingLink += 1
          linkProblems.push(`${ws.name} R${rn}: fuente sin enlace`)
          return
        }
        withLink += 1
        linkUrls.push(linkUrl)
        // Texto visible corto y sin URL.
        const linkText = cellText(row.getCell(nCols))
        if (linkText !== SOURCE_LINK_LABEL) {
          textProblems.push(`${ws.name} R${rn}: texto enlace "${linkText}"`)
        }
        if (/https?:\/\/|www\./i.test(linkText)) textProblems.push(`${ws.name} R${rn}: URL visible`)
        // URL https + dominio autorizado + sin CSV.
        if (!linkUrl.startsWith('https://')) linkProblems.push(`${ws.name} R${rn}: no https (${linkUrl})`)
        if (!isAllowedSourceUrl(linkUrl)) linkProblems.push(`${ws.name} R${rn}: dominio no autorizado (${linkUrl})`)
        if (/\.csv(\?|$)/i.test(linkUrl)) linkProblems.push(`${ws.name} R${rn}: CSV masivo (${linkUrl})`)
        // Enlace dentro del rango real y no en celda fusionada.
        if (nCols < 2 || linkCol > nCols) linkProblems.push(`${ws.name} R${rn}: enlace C${linkCol} fuera de rango (nCols ${nCols})`)
        if (row.getCell(linkCol).isMerged) linkProblems.push(`${ws.name} R${rn}: enlace en celda fusionada`)
        for (const key of Object.keys(dimUrls) as (keyof typeof dimUrls)[]) {
          if (linkUrl.endsWith(`t=${key}`)) dimUrls[key] = true
        }
        // Datos de la tabla: alineación y ceros.
        const isPiramide = first.includes('Estructura por edad y sexo') ||
          cellText(ws.getRow(rn - 1).getCell(1)).includes('Estructura por edad y sexo')
        for (let r = rn + 2; r <= ws.rowCount; r += 1) {
          const dr = ws.getRow(r)
          const firstData = cellText(dr.getCell(1))
          if (firstData === '') break
          if (isGreen(dr.getCell(1))) break
          for (let ci = 1; ci <= nCols; ci += 1) {
            const cell = dr.getCell(ci)
            const h = cellText(headerRow.getCell(ci))
            const exp = h === 'Año' ? 'center' : ci === 1 ? 'left' : 'right'
            if ((typeof cell.value === 'number' || h === 'Año') && cell.alignment?.horizontal !== exp) {
              alignProblems.push(`${ws.name} R${r}C${ci} ${cell.alignment?.horizontal ?? '?'}≠${exp}`)
            }
            if (typeof cell.value === 'number' && cell.value === 0 && !isPiramide) {
              zeroProblems.push(`${ws.name} R${r}C${ci}`)
            }
          }
        }
      }
    })
    const expected = expectedBlocks[ws.name as keyof typeof expectedBlocks]
    if (expected !== undefined) {
      check(`${ws.name}: ${expected} bloques con procedencia`, detectedBlocks === expected, `${detectedBlocks}`)
    }
    // Anchos: Año = 10, tope 24, y sin cambios respecto al control.
    const ctrl = wbControl.getWorksheet(ws.name)
    for (let ci = 1; ci <= ws.columnCount; ci += 1) {
      const w = ws.getColumn(ci).width ?? 0
      const cw = ctrl?.getColumn(ci).width ?? 0
      if (w > 24) widthProblems.push(`${ws.name} C${ci}=${w}`)
      if (Math.abs(w - cw) > 0.001) widthProblems.push(`${ws.name} C${ci} fuente altera ancho ${cw}→${w}`)
    }
    ws.eachRow((row) => {
      row.eachCell((cell, cn) => {
        if (cellText(cell) === 'Año') {
          const w = ws.getColumn(cn).width ?? 0
          if (w !== 10) widthProblems.push(`${ws.name} Año C${cn}=${w}`)
        }
      })
    })
  }

  // Enlaces internos y celdas fusionadas.
  for (const ws of wb.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const l = cellHyperlink(cell)
        if (l && l.startsWith('#')) internalLinks += 1
        if (cell.isMerged) mergedCells += 1
      })
    })
  }

  // Macros/ActiveX/VBA en el contenedor OOXML.
  const zip = await JSZip.loadAsync(built.buffer)
  const macroEntries = Object.keys(zip.files).filter((f) => /vbaProject|activeX|macrosheet/i.test(f))
  const hasVba = Object.keys(zip.files).some((f) => f.toLowerCase().endsWith('.bin'))

  check('sin freeze panes', !frozen)
  check('sin autofilter', !filtered)
  check('sin enlaces internos', internalLinks === 0, `${internalLinks}`)
  check('sin celdas fusionadas', mergedCells === 0, `${mergedCells}`)
  check('sin macros/ActiveX/VBA', macroEntries.length === 0 && !hasVba, macroEntries.join(','))
  check('toda fuente atribuible tiene enlace', missingLink === 0 && withLink > 0, `${withLink} enlaces / ${missingLink} sin`)
  check('texto visible de enlace', textProblems.length === 0, textProblems.slice(0, 2).join(' | '))
  check('URL https y dominio permitido', linkProblems.length === 0, linkProblems.slice(0, 3).join(' | '))
  check('sin URL técnica visible', textProblems.length === 0)
  check('sin enlace a CSV masivo', !linkUrls.some((u) => /\.csv(\?|$)/i.test(u)))
  check('sin R2/Supabase/Vercel/Cloudflare/GitHub', !linkUrls.some((u) => /cloudflarestorage|supabase\.co|vercel\.app|cloudflare\.com|github\.com|localhost|127\.0\.0\.1/i.test(u)))
  check('Nacionalidad → INE 68535', dimUrls['68535'])
  check('Lugar de nacimiento → INE 66322', dimUrls['66322'])
  check('Arraigo territorial → INE 68540', dimUrls['68540'])
  check('enlaces dentro del rango real del bloque', linkProblems.length === 0)
  check('sin barra verde sobrante', greenOutside === 0, `${greenOutside}`)
  check('sin columnas extra', widthProblems.length === 0, widthProblems.slice(0, 3).join(' | '))
  check('anchos intactos (Año=10, tope 24, sin efecto de fuente)', widthProblems.length === 0)
  check('alineación por rol intacta', alignProblems.length === 0, alignProblems.slice(0, 3).join(' | '))
  check('suprimidos nunca como 0', zeroProblems.length === 0, zeroProblems.slice(0, 3).join(' | '))
}

async function main(): Promise<void> {
  verifyRegistry()
  for (const s of scenarios()) {
    const built = await buildScenario(s)
    await analyze(s, built)
  }
  console.log(`\n${failures === 0 ? 'OK' : failures} comprobaciones ${failures === 0 ? 'superadas' : 'FALLIDAS'}`)
  if (failures > 0) process.exit(1)
  console.log('Enlaces de fuente oficial verificados: 3 hojas, dominios autorizados y anchos intactos.')
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
