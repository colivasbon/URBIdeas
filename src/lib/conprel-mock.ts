// Fixtures CONPREL de desarrollo/QA — envelope mock con los estados S1–S4
// de docs/conprel-producto-textos.md §6. SOLO lectura local de UI:
// no escribe R2 ni Supabase y solo se inyecta con SOCIDEAS_CONPREL_MOCK=true
// (junto a NEXT_PUBLIC_CONPREL_UI=true). En producción no hay datos CONPREL
// cargados: este módulo no se ejecuta.
import type { IndicatorValue } from './socideas'
import {
  CONPREL_LIQ_2024,
  CONPREL_PPTO_2025,
  CONPREL_SOURCE_NOMBRE,
  CONPREL_SOURCE_ORGANISMO,
} from './conprel-contracts'
import { conprelSlugsForFamilia } from './conprel-slugs'
import type { ConprelFamilia } from './conprel-contracts'

/** Presencia por familia esperada en cada fixture (§6). */
export interface ConprelMockFixture {
  ine: string
  nombre: string
  /** Estado de cruce esperado (S1–S4). */
  estado: 'S1' | 'S2' | 'S3' | 'S4'
  ppto: boolean
  liq: boolean
}

/** Fixtures aprobadas: 9 del enunciado + 06161 (S1 rural) + 05188 (S2 inverso). */
export const CONPREL_MOCK_FIXTURES: readonly ConprelMockFixture[] = [
  { ine: '28079', nombre: 'Madrid', estado: 'S4', ppto: true, liq: true },
  { ine: '02003', nombre: 'Albacete', estado: 'S4', ppto: true, liq: true },
  { ine: '48020', nombre: 'Bilbao', estado: 'S4', ppto: true, liq: true },
  { ine: '15078', nombre: 'Santiago de Compostela', estado: 'S4', ppto: true, liq: true },
  { ine: '31201', nombre: 'Pamplona/Iruña', estado: 'S4', ppto: true, liq: true },
  { ine: '01059', nombre: 'Vitoria-Gasteiz', estado: 'S3', ppto: false, liq: false },
  { ine: '48044', nombre: 'Getxo', estado: 'S1', ppto: true, liq: false },
  { ine: '51001', nombre: 'Ceuta', estado: 'S4', ppto: true, liq: true },
  { ine: '52001', nombre: 'Melilla', estado: 'S4', ppto: true, liq: true },
  { ine: '06161', nombre: 'Zarza-Capilla', estado: 'S1', ppto: true, liq: false },
  { ine: '05188', nombre: 'Poveda', estado: 'S2', ppto: false, liq: true },
]

const BY_INE = new Map(CONPREL_MOCK_FIXTURES.map((f) => [f.ine, f]))

export function conprelMockFixture(codigoINE: string): ConprelMockFixture | null {
  return BY_INE.get(codigoINE) ?? null
}

const SOURCE = {
  id: 'hacienda_conprel',
  slug: 'hacienda_conprel',
  organismo: CONPREL_SOURCE_ORGANISMO,
  nombre: CONPREL_SOURCE_NOMBRE,
  descripcion: null,
  url_base: null,
  api_table_id: null,
  licencia: null,
  frecuencia_actualizacion: 'anual',
  activo: true,
} as const

/** Importes de muestra (euros). El 0 de importec/cap1 es CERO PUBLICADO. */
const VALORES_PPTO: Record<string, number> = { '1:I': 1_250_000, '2:G': 1_180_000 }
const VALORES_LIQ: Record<string, Record<string, number>> = {
  '1:I': {
    conprel_liq_prevision_definitivos_importe: 1_250_000,
    conprel_liq_reconocidos_importe: 980_000,
    conprel_liq_recaudacion_corriente_importe: 940_000,
    // Cero real de la fuente (ejercicios cerrados): debe verse como 0, no ND.
    conprel_liq_recaudacion_cerrados_importe: 0,
  },
  '2:G': {
    conprel_liq_prevision_definitivos_importe: 1_180_000,
    conprel_liq_reconocidos_importe: 1_050_000,
    conprel_liq_recaudacion_corriente_importe: 1_010_000,
    conprel_liq_recaudacion_cerrados_importe: 0,
  },
}

function mockRow(
  ine: string,
  slug: string,
  nombre: string,
  familia: ConprelFamilia,
  valor: number,
  cdcta: string,
  tipreig: string,
): IndicatorValue {
  const def = familia === 'ppto' ? CONPREL_PPTO_2025 : CONPREL_LIQ_2024
  return {
    id: `conprel-mock-${ine}-${familia}-${cdcta}${tipreig}-${slug}`,
    municipio_codigo_ine: ine,
    indicator_id: slug,
    fecha_referencia: `${def.ejercicio}-01-01`,
    anio_referencia: def.ejercicio,
    valor_numerico: valor,
    valor_texto: null,
    unidad: 'euros',
    dimensiones: { ambito: 'municipio', cdcta, tipreig, familia: def.familia },
    source_id: SOURCE.id,
    source_url: def.url,
    source_table_id: def.tableId,
    source_series_id: null,
    obtenido_en: new Date().toISOString(),
    estado_validacion: 'validado',
    indicator: {
      id: slug,
      slug,
      nombre,
      grupo: 'economia',
      descripcion: null,
      unidad: 'euros',
      metodologia: null,
      fuente_principal_id: SOURCE.id,
      periodicidad: 'anual',
      visualizacion_recomendada: null,
      activo: true,
    },
    source: { ...SOURCE },
  }
}

/**
 * Filas mock para un municipio fixture. Devuelve [] si el INE no está en la
 * muestra (y no debe inventarse cobertura para el resto de España).
 */
export function conprelMockValores(codigoINE: string): IndicatorValue[] {
  const fx = conprelMockFixture(codigoINE)
  if (!fx) return []
  const out: IndicatorValue[] = []
  if (fx.ppto) {
    for (const def of conprelSlugsForFamilia('ppto')) {
      for (const [key, valor] of Object.entries(VALORES_PPTO)) {
        const [cdcta, tipreig] = key.split(':')
        out.push(mockRow(codigoINE, def.slug, def.nombre, 'ppto', valor, cdcta, tipreig))
      }
    }
  }
  if (fx.liq) {
    for (const def of conprelSlugsForFamilia('liq')) {
      for (const [key, porSlug] of Object.entries(VALORES_LIQ)) {
        const valor = porSlug[def.slug]
        if (valor === undefined) continue
        const [cdcta, tipreig] = key.split(':')
        out.push(mockRow(codigoINE, def.slug, def.nombre, 'liq', valor, cdcta, tipreig))
      }
    }
  }
  return out
}
