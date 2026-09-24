// DTO de presentación para el Client Component de la ficha demográfica.
//
// El Server Component mantiene el perfil COMPLETO (toolbar, hoja político,
// exportaciones y empty-states leen `perfil.*` sin serializar al navegador).
// Aquí solo se recorta lo que viaja como `initial` a `FichaFiltros`:
//   1. Filas de `valores` a los slugs que el cliente realmente deriva.
//   2. Campos por fila que `derivarPerfil`/`Traceability` no leen.
//   3. Series precalculadas que el cliente recalcula desde `valores`.
//
// Garantías: sin I/O, sin cambiar el contrato de `PerfilDemografico`
// (tipos intactos; los campos vacíos se rellenan en el cliente).
import type { IndicatorValue, PerfilDemografico } from './socideas'
import { AREA_SLUG } from './socideas-density'
import type { MunicipalIneLayersV1 } from './socideas-ine-layers'

/**
 * Slugs necesarios en el navegador para la hoja de Demografía:
 * - población total/H/M y evolución (tarjetas, serie, comparativas por ámbito);
 * - pirámide por edad y sexo;
 * - superficie IGN (`area_km2`) para recalcular densidad con el año filtrado.
 *
 * No viajan: economía, laboral, electoral, variaciones 5/10 años (el cliente
 * las deriva de la serie) ni `density_per_km2` (el cliente recalcula densidad
 * desde `area_km2`; ver `derivarPerfil`).
 */
const FICHA_DEMO_SLUGS: ReadonlySet<string> = new Set([
  'population_total',
  'population_male',
  'population_female',
  'population_evolution',
  'population_age_sex',
  AREA_SLUG,
])

/** Claves de `dimensiones` que consume la ficha cliente. */
const FICHA_DIM_KEYS: ReadonlySet<string> = new Set(['ambito', 'tramo_edad', 'sexo'])

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
}

/** Conserva solo las claves de dimensión usadas; reutiliza el objeto si ya es mínimo. */
function slimDims(d: Record<string, string> | undefined): Record<string, string> {
  if (!d) return {}
  const keys = Object.keys(d)
  let needsCopy = false
  for (const k of keys) {
    if (!FICHA_DIM_KEYS.has(k)) {
      needsCopy = true
      break
    }
  }
  if (!needsCopy) return d
  const out: Record<string, string> = {}
  for (const k of keys) {
    if (FICHA_DIM_KEYS.has(k)) out[k] = d[k] as string
  }
  return out
}

/**
 * Fila mínima para `derivarPerfil` + `Traceability`.
 *
 * - `population_age_sex` (pirámide): solo año/valor/dimensiones; la
 *   trazabilidad se cubre con las filas de población/evolución.
 * - Resto demográfico: además procedencia para `Traceability`/`FuenteOficial`.
 */
function slimValor(v: IndicatorValue): IndicatorValue {
  const slug = slugOf(v)
  if (slug === 'population_age_sex') {
    return {
      anio_referencia: v.anio_referencia,
      valor_numerico: v.valor_numerico,
      dimensiones: slimDims(v.dimensiones),
      indicator: { slug } as unknown as IndicatorValue['indicator'],
    } as unknown as IndicatorValue
  }
  const organismo = (v.source as unknown as { organismo?: string } | undefined)?.organismo
  const nombre = (v.source as unknown as { nombre?: string } | undefined)?.nombre
  return {
    anio_referencia: v.anio_referencia,
    valor_numerico: v.valor_numerico,
    dimensiones: slimDims(v.dimensiones),
    source_url: v.source_url,
    source_table_id: v.source_table_id,
    source_series_id: v.source_series_id,
    obtenido_en: v.obtenido_en,
    source_id: v.source_id,
    indicator: slug ? ({ slug } as unknown as IndicatorValue['indicator']) : undefined,
    source:
      organismo !== undefined || nombre !== undefined
        ? ({ organismo, nombre } as unknown as IndicatorValue['source'])
        : undefined,
  } as unknown as IndicatorValue
}

/**
 * Perfil listo para `initial={...}` de `FichaFiltros`.
 *
 * - `valores`: solo slugs demográficos, filas slim.
 * - `disponibles.ultimo_por_indicador`: vacío (la ficha no lo lee; lo usa el
 *   catálogo de capacidades en otras rutas).
 * - Series derivadas (`total`…`densidad`): vacías; el cliente las recalcula
 *   con `derivarPerfil` durante el SSR del Client Component y en hidratación.
 */
export function toFichaInitial(perfil: PerfilDemografico): PerfilDemografico {
  const valores = []
  for (const v of perfil.valores) {
    if (FICHA_DEMO_SLUGS.has(slugOf(v))) valores.push(slimValor(v))
  }
  return {
    municipio: perfil.municipio,
    sincronizado: perfil.sincronizado,
    ultima_sincronizacion: perfil.ultima_sincronizacion,
    total: null,
    hombres: null,
    mujeres: null,
    evolucion: [],
    comparativas: { provincia: [], ccaa: [], espana: [] },
    piramide: { anio: null, grupos: [] },
    derivados: {
      cambio_5y: null,
      cambio_10y: null,
      indice_envejecimiento: null,
      indice_dependencia: null,
    },
    densidad: { valor: null, pendiente: null },
    valores,
    disponibles: {
      ...perfil.disponibles,
      ultimo_por_indicador: {},
    },
    filtros: perfil.filtros,
  }
}

/**
 * Capas INE proyectadas a lo que usa la hoja de Demografía (flujos + saldos).
 * Educación/agrario viajan solo en sus hojas; aquí se omiten del flight.
 */
export function slimIneLayersForDemografia(
  layers: MunicipalIneLayersV1 | null,
): MunicipalIneLayersV1 | null {
  if (!layers) return null
  const { migration, migrationBalance } = layers.layers
  if (!migration && !migrationBalance) return null
  return {
    ...layers,
    layers: { migration, migrationBalance },
  }
}
