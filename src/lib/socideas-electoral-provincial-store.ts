// Persistencia R2 de los resultados electorales POR CIRCUNSCRIPCIÓN (SA1 v2.3).
//
// SOLO SERVIDOR. Sin Supabase, sin escrituras, sin secretos en logs: el único
// mensaje de error es la clave lógica del objeto.
//
// Layout R2:
//   socideas/electoral/provincial/<PROV>.json   (PROV = INE de 2 dígitos)
//
// Reglas de oro (idénticas a las del adaptador puro):
//   - Un resultado de circunscripción NUNCA se etiqueta como municipal: el
//     payload lleva `circunscripcion` y `notaCobertura` obligatorios.
//   - Congreso y Senado viven en claves distintas y jamás se mezclan ni se
//     suman entre sí ni con las Cortes autonómicas.
//   - Ausencia de dato = `null` (se pinta ND), nunca 0.
//   - Fail closed: objeto ausente, ilegible o inválido → `null`. La ficha
//     declara el bloque como pendiente en lugar de publicar datos dudosos.
//
// La validación es estricta y textual: un payload sin `circunscripcion`, sin
// `notaCobertura` o con un `ambito` declarado como municipal se RECHAZA.

import type {
  AutonomicasCircunscripcionPayload,
  SenadoCircunscripcionPayload,
} from './socideas-electoral-provincial'
import type { CongresoProvinciaPayload } from './socideas-book-blocks'

/** Prefijo R2 reservado por este módulo (reexportado para scripts y QA). */
export const ELECTORAL_PROVINCIAL_R2_PREFIX = 'socideas/electoral/provincial'

/** Tag de Data Cache para invalidación selectiva. */
export const ELECTORAL_PROVINCIAL_TAG = 'socideas-electoral-provincial'

/** Ventana de revalidación de la caché (segundos). 1 día: dato electoral fijo. */
export const ELECTORAL_PROVINCIAL_REVALIDATE_SECONDS = 86400

/** Timeout de cada lectura de objeto R2 (ms). */
const R2_TIMEOUT_MS = 12000

const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'

/** Bundle completo de una circunscripción provincial. */
export interface ElectoralProvincialBundle {
  /** INE de provincia de 2 dígitos ('45'). */
  provinciaCodigo: string
  /** Nombre oficial de la circunscripción ('Toledo'). */
  circunscripcion: string
  /** Nota de cobertura textual, obligatoria en TODOS los bloques. */
  notaCobertura: string
  /** Fecha de publicación del objeto (ISO). */
  publicadoEl: string
  /** Autonómicas (Cortes) por circunscripción. */
  autonomicas: AutonomicasCircunscripcionPayload | null
  /** Congreso por circunscripción (cámara propia). */
  congreso: CongresoProvinciaPayload | null
  /** Senado por circunscripción, voto a candidatos (cámara propia). */
  senado: SenadoCircunscripcionPayload | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/**
 * Valida un bundle electoral provincial.
 *
 * Rechaza (devuelve null) cuando:
 *  - no es un objeto con `provinciaCodigo` de 2 dígitos;
 *  - falta `notaCobertura` o `circunscripcion`;
 *  - los tres bloques son null (objeto vacío);
 *  - algún bloque declara un `ambito`/`cobertura` municipal (defecto crítico
 *    de v2.3: presentar resultados provinciales como municipales).
 */
export function validateElectoralProvincial(raw: unknown): ElectoralProvincialBundle | null {
  if (!isRecord(raw)) return null
  const provinciaCodigo = strOrNull(raw.provinciaCodigo)
  if (!provinciaCodigo || !/^\d{2}$/.test(provinciaCodigo)) return null
  const circunscripcion = strOrNull(raw.circunscripcion)
  if (!circunscripcion) return null
  const notaCobertura = strOrNull(raw.notaCobertura)
  if (!notaCobertura) return null
  if (!/circunscripci/i.test(notaCobertura)) return null

  const autonomicas = validateAutonomicas(raw.autonomicas)
  const congreso = validateCongreso(raw.congreso)
  const senado = validateSenado(raw.senado)
  if (!autonomicas && !congreso && !senado) return null

  // Congreso y Senado deben ser cámaras distintas: nunca el mismo literal.
  if (autonomicas && congreso && autonomicas.circunscripcion !== congreso.provincia) return null
  if (senado && congreso && senado.circunscripcion !== congreso.provincia) return null
  if (autonomicas && senado && autonomicas.circunscripcion !== senado.circunscripcion) return null

  return {
    provinciaCodigo,
    circunscripcion,
    notaCobertura,
    publicadoEl: strOrNull(raw.publicadoEl) ?? '',
    autonomicas,
    congreso,
    senado,
  }
}

function validateAutonomicas(raw: unknown): AutonomicasCircunscripcionPayload | null {
  if (!isRecord(raw)) return null
  const circunscripcion = strOrNull(raw.circunscripcion)
  const camara = strOrNull(raw.camara)
  const nota = strOrNull(raw.notaCobertura)
  if (!circunscripcion || !camara || !nota) return null
  if (!Array.isArray(raw.candidaturas) || raw.candidaturas.length === 0) return null
  if (isMunicipalLiteral(JSON.stringify(raw).slice(0, 4000))) return null
  return {
    anio: numOrNull(raw.anio) ?? 0,
    fecha: strOrNull(raw.fecha) ?? '',
    camara,
    circunscripcion,
    censo: numOrNull(raw.censo),
    votantes: numOrNull(raw.votantes),
    validos: numOrNull(raw.validos),
    nulos: numOrNull(raw.nulos),
    blancos: numOrNull(raw.blancos),
    escanosTotal: numOrNull(raw.escanosTotal),
    candidaturas: (raw.candidaturas as unknown[]).flatMap((c) => {
      if (!isRecord(c)) return []
      const nombre = strOrNull(c.nombre)
      if (!nombre) return []
      return [
        {
          nombre,
          siglas: strOrNull(c.siglas) ?? '',
          votos: numOrNull(c.votos),
          escanos: numOrNull(c.escanos),
        },
      ]
    }),
    fuenteLabel: strOrNull(raw.fuenteLabel) ?? '',
    fuenteUrl: strOrNull(raw.fuenteUrl) ?? '',
    fuenteLicencia: strOrNull(raw.fuenteLicencia) ?? '',
    fuenteSha256: strOrNull(raw.fuenteSha256) ?? '',
    notaCobertura: nota,
  }
}

function validateCongreso(raw: unknown): CongresoProvinciaPayload | null {
  if (!isRecord(raw)) return null
  const provincia = strOrNull(raw.provincia)
  if (!provincia) return null
  if (!Array.isArray(raw.candidaturas) || raw.candidaturas.length === 0) return null
  if (isMunicipalLiteral(JSON.stringify(raw).slice(0, 4000))) return null
  return {
    anio: numOrNull(raw.anio) ?? 0,
    fecha: strOrNull(raw.fecha) ?? '',
    provincia,
    censo: numOrNull(raw.censo),
    votantes: numOrNull(raw.votantes),
    validos: numOrNull(raw.validos),
    nulos: numOrNull(raw.nulos),
    blancos: numOrNull(raw.blancos),
    candidaturas: (raw.candidaturas as unknown[]).flatMap((c) => {
      if (!isRecord(c)) return []
      const nombre = strOrNull(c.nombre)
      if (!nombre) return []
      return [
        {
          nombre,
          siglas: strOrNull(c.siglas) ?? '',
          votos: numOrNull(c.votos),
          escanos: numOrNull(c.escanos),
        },
      ]
    }),
    fuenteLabel: strOrNull(raw.fuenteLabel) ?? '',
  }
}

function validateSenado(raw: unknown): SenadoCircunscripcionPayload | null {
  if (!isRecord(raw)) return null
  const circunscripcion = strOrNull(raw.circunscripcion)
  const camara = strOrNull(raw.camara)
  if (!circunscripcion || !camara) return null
  if (!Array.isArray(raw.candidatos) || raw.candidatos.length === 0) return null
  if (isMunicipalLiteral(JSON.stringify(raw).slice(0, 4000))) return null
  return {
    anio: numOrNull(raw.anio) ?? 0,
    fecha: strOrNull(raw.fecha) ?? '',
    camara,
    circunscripcion,
    censo: numOrNull(raw.censo),
    nulos: numOrNull(raw.nulos),
    blancos: numOrNull(raw.blancos),
    votosACandidaturas: numOrNull(raw.votosACandidaturas),
    candidatos: (raw.candidatos as unknown[]).flatMap((c) => {
      if (!isRecord(c)) return []
      const apellido1 = strOrNull(c.apellido1) ?? ''
      const nombre = strOrNull(c.nombre)
      if (!nombre) return []
      return [
        {
          nombre,
          apellido1,
          apellido2: strOrNull(c.apellido2) ?? '',
          partidoSiglas: strOrNull(c.partidoSiglas) ?? '',
          partidoNombre: strOrNull(c.partidoNombre) ?? '',
          votos: numOrNull(c.votos),
          elegido: c.elegido === true,
        },
      ]
    }),
    fuenteLabel: strOrNull(raw.fuenteLabel) ?? '',
    fuenteUrl: strOrNull(raw.fuenteUrl) ?? '',
    fuenteLicencia: strOrNull(raw.fuenteLicencia) ?? '',
    fuenteSha256: strOrNull(raw.fuenteSha256) ?? '',
  }
}

/** Detecta etiquetas que presentan dato provincial como municipal (defecto v2.3). */
function isMunicipalLiteral(head: string): boolean {
  return (
    /"cobertura"\s*:\s*"Municipio/i.test(head) ||
    /"ambito"\s*:\s*"municipio"/i.test(head) ||
    /ámbito municipal"?\s*$/i.test(head)
  )
}

/** Clave lógica del objeto para una provincia. */
export function electoralProvincialKey(provinciaCodigo: string): string {
  return `${ELECTORAL_PROVINCIAL_R2_PREFIX}/${provinciaCodigo}.json`
}

function r2PublicBase(): string {
  // Mismo orden de resolución que `socideas-r2.ts` (base pública del bucket).
  // `SOCIDEAS_REVALIDATE_BASE_URL` NO va aquí: es la URL de la API de
  // revalidación, no la base pública de objetos.
  const base =
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    process.env.SOCIDEAS_R2_PUBLIC_BASE ||
    R2_PUBLIC_BASE_FALLBACK
  return base.replace(/\/$/, '')
}

/**
 * Lee el bundle de una circunscripción desde R2 (base pública).
 *
 * Nunca lanza: 404, timeout, JSON inválido o payload que no valida → `null`
 * (la ficha declara los bloques como pendientes en lugar de fallar).
 */
export async function readElectoralProvincial(
  provinciaCodigo: string,
): Promise<ElectoralProvincialBundle | null> {
  if (!/^\d{2}$/.test(provinciaCodigo)) return null
  const base = r2PublicBase()
  const key = electoralProvincialKey(provinciaCodigo)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), R2_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/${key}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      // Nunca servir un bundle caducado como si fuera actual: el dato electoral
      // no cambia, pero el objeto sí puede reemplazarse.
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json: unknown = await res.json()
    return validateElectoralProvincial(json)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
