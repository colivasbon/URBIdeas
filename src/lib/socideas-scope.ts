// Utilidades de ÁMBITO territorial para la ficha SOCideas (puro, sin I/O).
//
// Un único selector `?ambito=municipio|provincia|ccaa|espana` controla el ámbito
// mostrado en cada hoja. Honestidad ante todo: solo se muestra un ámbito donde
// haya filas publicadas; si no las hay, el indicador declara "(sin datos a este
// ámbito)" — nunca 0 ni valores inventados. Disponibilidad = datos del envelope.

import { AMBITOS, type AmbitoTerritorial, type IndicatorValue } from './socideas'

export const AMBITO_LABEL: Record<AmbitoTerritorial, string> = {
  municipio: 'Municipio',
  provincia: 'Provincia',
  ccaa: 'CCAA',
  espana: 'España',
}

/** Orden de presentación del selector (municipio primero: es el valor por defecto). */
export const AMBITO_OPCIONES: AmbitoTerritorial[] = ['municipio', 'provincia', 'ccaa', 'espana']

/** Normaliza el query-param. Acepta el alias histórico `nacional` → `espana`. */
export function normalizarAmbito(v: string | null | undefined): AmbitoTerritorial | null {
  if (!v) return null
  const t = v.trim().toLowerCase()
  const norm = t === 'nacional' ? 'espana' : t
  return (AMBITOS as string[]).includes(norm) ? (norm as AmbitoTerritorial) : null
}

export function ambitoDeValor(v: IndicatorValue): AmbitoTerritorial {
  const a = v.dimensiones?.ambito
  return a && (AMBITOS as string[]).includes(a) ? (a as AmbitoTerritorial) : 'municipio'
}

/** ¿Hay al menos un valor numérico publicado en `ambito` para `slug`? */
export function ambitoTieneDatos(valores: IndicatorValue[], slug: string, ambito: AmbitoTerritorial): boolean {
  return valores.some(
    (v) => slugOf(v) === slug && ambitoDeValor(v) === ambito && typeof v.valor_numerico === 'number',
  )
}

/** Ámbitos con datos para un slug, en orden de presentación. */
export function ambitosConDatos(valores: IndicatorValue[], slug: string): AmbitoTerritorial[] {
  return AMBITO_OPCIONES.filter((a) => ambitoTieneDatos(valores, slug, a))
}

/** Serie anual {anio, valor} de un slug en un ámbito (solo valores publicados). */
export function seriePorAmbito(
  valores: IndicatorValue[],
  slug: string,
  ambito: AmbitoTerritorial,
): { anio: number; valor: number }[] {
  return valores
    .filter((v) => slugOf(v) === slug && ambitoDeValor(v) === ambito && typeof v.valor_numerico === 'number')
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
    .filter((p) => p.anio > 0)
    .sort((a, b) => a.anio - b.anio)
}

export function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
}
