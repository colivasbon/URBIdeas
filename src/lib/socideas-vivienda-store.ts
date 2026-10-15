// Lectura del agregado municipal de vivienda y hogares (Censo 2021) desde R2.
// SOLO SERVIDOR.
//
// Fuente de verdad: `socideas/vivienda/v1/{ine}.json`, publicado por
// `scripts/publish-vivienda-municipal.ts` agregando por secciones censales las
// columnas absolutas del fichero INE `C2021_Indicadores.csv`. Los medios
// (superficie, antigüedad) y la separación vacías/secundarias no los publica ese
// fichero, así que viajan como `null` (ND), nunca como 0. Si el municipio tiene
// secciones suprimidas (< 100 hab.), el agregado es cota inferior (`cotaInferior`).

import type { ViviendaPayload } from './socideas-book-blocks'

export const VIVIENDA_R2_PREFIX = 'socideas/vivienda/v1'
export const VIVIENDA_SCHEMA_VERSION = 'censo2021_vivienda_hogares'

export function viviendaR2Key(codigoIne: string): string {
  return `${VIVIENDA_R2_PREFIX}/${codigoIne}.json`
}

function r2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

async function leerJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Payload de vivienda de UN municipio. `null` si no está publicado. */
export async function leerVivienda(codigoIne: string, timeoutMs = 12000): Promise<ViviendaPayload | null> {
  const obj = await leerJson(`${r2Base()}/${viviendaR2Key(codigoIne)}`, timeoutMs)
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Partial<Record<string, unknown>>
  const n = (k: string): number | null => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : null)
  // Validación mínima: es de vivienda y trae al menos un conteo absoluto.
  if (o.domain !== VIVIENDA_SCHEMA_VERSION || !(n('total') !== null || n('principales') !== null)) {
    return null
  }
  return {
    periodo: typeof o.periodo === 'string' ? o.periodo : '2021',
    fuenteLabel: typeof o.fuenteLabel === 'string' ? o.fuenteLabel : 'INE · Censo 2021 · vivienda y hogares',
    tableId: typeof o.tableId === 'string' ? o.tableId : null,
    total: n('total'),
    principales: n('principales'),
    noPrincipales: n('noPrincipales'),
    vacias: n('vacias'),
    secundarias: n('secundarias'),
    hogaresTotales: n('hogaresTotales'),
    hogaresUnipersonales: n('hogaresUnipersonales'),
    superficieMediaM2: n('superficieMediaM2'),
    antiguedadMedia: n('antiguedadMedia'),
    secciones: n('secciones'),
    seccionesSuprimidas: n('seccionesSuprimidas'),
    cotaInferior: typeof o.cotaInferior === 'boolean' ? o.cotaInferior : null,
    notaAgregacion: typeof o.notaAgregacion === 'string' ? o.notaAgregacion : null,
  }
}
