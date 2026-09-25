// Lectura de Grupos de Acción Local (GAL/GDR · LEADER-FEADER-PAC) para la
// ficha municipal. SOLO servidor (cliente Supabase inyectado por el caller).
//
// Fuente: tabla `grupos_accion_local` (migración 034), poblada por
// scripts/sync-gal.ts desde dos fuentes ESTRUCTURADAS:
//   · Red PAC · MAPA (WFS RRN:MUN + RRN:GAL) — cobertura nacional, sin periodo publicado
//   · Datos Abiertos CLM (PEPAC 2023-2027)     — cobertura Castilla-La Mancha
//
// Contrato de estados (muy importante para el copy de la UI):
//   · `sin_datos` → la tabla está vacía o no es consultable (la ficha NUNCA se
//     rompe). El bloque debe decir «Sin datos publicados de GAL para este
//     municipio» y NO «no pertenece».
//   · `sin_gal`   → sí hay datos publicados, pero este municipio no está en el
//     ámbito de ningún GAL. Copia: «no está incluido en el ámbito de ningún GAL
//     con datos publicados».
//   · `pertenece` → hay fila cuyo `municipios_codigo_ine` contiene el INE.
//
// Esta función NUNCA lanza: cualquier error se degrada a `sin_datos`.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface GalInfo {
  nombre: string
  codigo: string | null
  ambito: string | null
  periodo: string | null
  web: string | null
  email: string | null
  telefono: string | null
  aviso: string
  fuenteUrl: string
  fuenteFecha: string
}

export interface GalMunicipio {
  estado: 'pertenece' | 'sin_gal' | 'sin_datos'
  gal: GalInfo | null
  totalGalEnTerritorio: number
}

/** Mismo texto que el DEFAULT de la columna `aviso` (migración 034). */
export const GAL_AVISO_POR_DEFECTO =
  'Verificar en la web del GAL la vigencia de la información y los municipios incluidos en el ámbito territorial actual.'

const SELECT_GAL =
  'nombre, codigo_gal, ambito_territorial, periodo_programacion, web_oficial, ' +
  'email, telefono, aviso, fuente_url, fuente_fecha'

const SIN_DATOS: GalMunicipio = { estado: 'sin_datos', gal: null, totalGalEnTerritorio: 0 }

interface GalRow {
  nombre: string | null
  codigo_gal: string | null
  ambito_territorial: string | null
  periodo_programacion: string | null
  web_oficial: string | null
  email: string | null
  telefono: string | null
  aviso: string | null
  fuente_url: string | null
  fuente_fecha: string | null
}

function aGalInfo(row: GalRow): GalInfo {
  return {
    nombre: row.nombre ?? 'GAL sin nombre publicado',
    codigo: row.codigo_gal,
    ambito: row.ambito_territorial,
    periodo: row.periodo_programacion,
    web: row.web_oficial,
    email: row.email,
    telefono: row.telefono,
    aviso: row.aviso || GAL_AVISO_POR_DEFECTO,
    fuenteUrl: row.fuente_url || '',
    fuenteFecha: row.fuente_fecha || '',
  }
}

/**
 * Devuelve el GAL del municipio `codigoINE` (5 dígitos) sin lanzar nunca.
 * Usa `.contains('municipios_codigo_ine', [ine])` sobre el Índice GIN.
 */
export async function readGalMunicipio(
  supabase: SupabaseClient,
  codigoINE: string,
): Promise<GalMunicipio> {
  const ine = (codigoINE ?? '').trim()
  if (!/^\d{5}$/.test(ine)) return SIN_DATOS
  try {
    // 1. ¿Hay datos publicados? (tabla ausente/vacía → `sin_datos`)
    const { count, error: countError } = await supabase
      .from('grupos_accion_local')
      .select('id', { count: 'exact', head: true })
    if (countError || count === null) return SIN_DATOS
    if (count === 0) return SIN_DATOS

    // 2. ¿Este municipio está en el ámbito de algún GAL?
    const { data, error } = await supabase
      .from('grupos_accion_local')
      .select(SELECT_GAL)
      .contains('municipios_codigo_ine', [ine])
      .limit(1)
    if (error) return SIN_DATOS
    const row = (data ?? [])[0] as unknown as GalRow | undefined
    if (!row) return { estado: 'sin_gal', gal: null, totalGalEnTerritorio: count }
    return { estado: 'pertenece', gal: aGalInfo(row), totalGalEnTerritorio: count }
  } catch {
    return SIN_DATOS
  }
}
