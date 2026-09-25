// Adaptador electoral PROVINCIAL / DE CIRCUNSCRIPCIÓN (solo lectura, puro).
//
// Ámbito distinto del municipal (`socideas-elections.ts`): aquí los resultados
// son de la circunscripción, nunca del municipio. Reglas de oro:
//   - Congreso y Senado NUNCA comparten tabla ni se suman (cámaras separadas).
//   - Los escaños de ámbitos distintos (Cortes de CLM, Congreso, Senado) NUNCA
//     se suman entre sí.
//   - La ausencia de dato es `null` (se pinta ND), jamás 0.
//   - La homologación de siglas se hace SOLO con la tabla declarada y
//     `normalizarSiglasElectoral`; el literal original de la fuente se conserva
//     en el nombre de la candidatura.
//
// Sin I/O, sin red, sin R2/Supabase: este módulo solo tipa payloads, normaliza
// siglas y parsea texto ya descargado (los parsers son puros y deterministas).
//
// Fuentes oficiales verificadas (2026-09-25):
//   - Senado 23-J-2023 por circunscripción (candidato a candidato):
//     https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/03202307_TOTA.zip
//     (fijos MIR 03/04/07/08, desagregación de candidatos y elegidos)
//   - Cortes de Castilla-La Mancha 28-M-2023 (circunscripción de Toledo):
//     https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/Resultados_CLM_2023.xlsx
//     (votos por candidatura y municipio) + acuerdo de la Junta Electoral de
//     CLM publicado en DOCM 2023/5411 (participación provincial, escaños y
//     relación de procuradores electos).
//   - Congreso 23-J-2023 por circunscripción:
//     https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-Congreso.xlsx

/** Candidatura con votos y, si corresponde, escaños en su ámbito. */
export interface CircunsCandidatura {
  nombre: string
  siglas: string
  votos: number | null
  /** Escaños del ámbito (Cortes provinciales / Congreso). En Senado, null. */
  escanos: number | null
}

/** Autonómicas: circunscripción provincial de las Cortes. */
export interface AutonomicasCircunscripcionPayload {
  anio: number
  fecha: string
  camara: string
  circunscripcion: string
  censo: number | null
  votantes: number | null
  validos: number | null
  nulos: number | null
  blancos: number | null
  /** Escaños de la circunscripción en la cámara (total, no del municipio). */
  escanosTotal: number | null
  candidaturas: CircunsCandidatura[]
  fuenteLabel: string
  fuenteUrl: string
  fuenteLicencia: string
  fuenteSha256: string
  /** Nota de cobertura obligatoria (desglose autonómico municipal inexistente). */
  notaCobertura: string
}

/** Senado: voto a candidatos individuales en circunscripción provincial. */
export interface SenadoCandidato {
  nombre: string
  apellido1: string
  apellido2: string
  partidoSiglas: string
  partidoNombre: string
  votos: number | null
  elegido: boolean
}

export interface SenadoCircunscripcionPayload {
  anio: number
  fecha: string
  camara: string
  circunscripcion: string
  censo: number | null
  nulos: number | null
  blancos: number | null
  votosACandidaturas: number | null
  candidatos: SenadoCandidato[]
  fuenteLabel: string
  fuenteUrl: string
  fuenteLicencia: string
  fuenteSha256: string
}

/**
 * Tabla explícita y auditable de homologación de siglas (no inferencia).
 * Es la única fuente de verdad: `normalizarSiglasElectoral` no adivina.
 */
export const ELECTORAL_SIGLAS_NORMALIZATION: ReadonlyArray<{ literal: string; normalizada: string; criterio: string }> = [
  { literal: 'PSOE', normalizada: 'PSOE', criterio: 'Sigla oficial mantenida entre convocatorias.' },
  { literal: 'PSOE-A', normalizada: 'PSOE', criterio: 'Federación autonómica del mismo partido.' },
  { literal: 'PARTIDO SOCIALISTA OBRERO ESPAÑOL', normalizada: 'PSOE', criterio: 'Denominación completa de la misma candidatura.' },
  { literal: 'PP', normalizada: 'PP', criterio: 'Sigla oficial mantenida entre convocatorias.' },
  { literal: 'PP-', normalizada: 'PP', criterio: 'Variante tipográfica del literal publicado.' },
  { literal: 'PARTIDO POPULAR', normalizada: 'PP', criterio: 'Denominación completa de la misma candidatura.' },
  { literal: 'VOX', normalizada: 'VOX', criterio: 'Sigla oficial mantenida.' },
  { literal: 'IU', normalizada: 'IU', criterio: 'Sigla oficial mantenida.' },
  { literal: 'IU-ICAM', normalizada: 'IU', criterio: 'Coalición con la misma raíz; se documenta la federación.' },
  { literal: 'PODEMOS', normalizada: 'PODEMOS', criterio: 'Sigla oficial mantenida.' },
  { literal: 'UNIDAS PODEMOS', normalizada: 'PODEMOS', criterio: 'Coalición sucesora declarada; el literal original se conserva.' },
  { literal: 'UNIDAS PODEMOS CLM', normalizada: 'PODEMOS', criterio: 'Coalición de Unidas Podemos en Castilla-La Mancha (28-M-2023).' },
  { literal: 'UNIDAS PODEMOS CASTILLA LA MANCHA', normalizada: 'PODEMOS', criterio: 'Denominación completa de la coalición en CLM.' },
  { literal: 'CS', normalizada: 'CS', criterio: 'Sigla oficial mantenida.' },
  { literal: 'C\u2019s', normalizada: 'CS', criterio: 'Variante tipográfica del literal publicado.' },
  { literal: 'Cs', normalizada: 'CS', criterio: 'Variante de caja del literal publicado.' },
  { literal: 'CIUDADANOS-PARTIDO DE LA CIUDADANIA', normalizada: 'CS', criterio: 'Denominación completa de Ciudadanos.' },
  { literal: 'SUMAR', normalizada: 'SUMAR', criterio: 'Coalición de ámbito estatal (23-J-2023); sigla propia.' },
  { literal: 'PACMA', normalizada: 'PACMA', criterio: 'Sigla oficial mantenida.' },
  { literal: 'PARTIDO ANIMALISTA CON EL MEDIO AMBIENTE', normalizada: 'PACMA', criterio: 'Denominación completa de PACMA.' },
  { literal: 'PUM+J', normalizada: 'PUM+J', criterio: 'Sigla oficial mantenida.' },
  { literal: 'POR UN MUNDO MÁS JUSTO', normalizada: 'PUM+J', criterio: 'Denominación completa de PUM+J.' },
  { literal: 'FO', normalizada: 'FO', criterio: 'Sigla oficial mantenida (Frente Obrero).' },
  { literal: 'FRENTE OBRERO', normalizada: 'FO', criterio: 'Denominación completa de Frente Obrero.' },
  { literal: 'FE de las JONS', normalizada: 'FE de las JONS', criterio: 'Sigla oficial mantenida.' },
  { literal: 'FALANGE ESPAÑOLA DE LAS J.O.N.S.', normalizada: 'FE de las JONS', criterio: 'Denominación completa de Falange.' },
  { literal: 'RECORTES CERO', normalizada: 'RECORTES CERO', criterio: 'Sigla oficial mantenida.' },
  { literal: 'ESPAÑA VACIADA', normalizada: 'ESPAÑA VACIADA', criterio: 'Agrupación de electores; sigla propia.' },
  { literal: 'P.C.P.E.', normalizada: 'P.C.P.E.', criterio: 'Sigla oficial mantenida (Partido Comunista de los Pueblos de España).' },
  { literal: 'PAIS CON GESTORES', normalizada: 'PAIS CON GESTORES', criterio: 'Agrupación de electores; sigla propia.' },
  { literal: 'AQUÍ AHORA', normalizada: 'AQUÍ AHORA', criterio: 'Agrupación de electores; sigla propia.' },
  { literal: 'PCAS-TC-RC', normalizada: 'PCAS-TC-RC', criterio: 'Coalición PCAS-Tierra Comunera-Recortes Cero.' },
  { literal: 'PARTIDO CASTELLANO-TIERRA COMUNERA-RECORTES CERO', normalizada: 'PCAS-TC-RC', criterio: 'Denominación completa de la coalición PCAS-TC-RC.' },
  { literal: 'TÚPATRIA', normalizada: 'TÚPATRIA', criterio: 'Sigla oficial mantenida.' },
  { literal: '+CU-EV', normalizada: '+CU-EV', criterio: 'Coalición +Cuenca-España Vaciada.' },
]

/** Sigla homologada para un literal; si no hay regla, se devuelve el literal. */
export function normalizarSiglasElectoral(literal: string | null | undefined): string {
  const raw = (literal ?? '').trim()
  if (raw === '') return ''
  const exact = ELECTORAL_SIGLAS_NORMALIZATION.find((n) => n.literal === raw)
  if (exact) return exact.normalizada
  const ci = ELECTORAL_SIGLAS_NORMALIZATION.find(
    (n) => n.literal.toLocaleLowerCase('es-ES') === raw.toLocaleLowerCase('es-ES'),
  )
  return ci ? ci.normalizada : raw
}

// ============================================================================
// Parser puro del fichero TOTA del Senado (formato fijo MIR 03/04/07/08)
// ============================================================================

function sub(s: string, a: number, b: number): string {
  return s.slice(a - 1, b)
}

function intOrNull(s: string): number | null {
  const t = s.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function partidosPorCodigo(candidaturasDat: string[]): Map<string, { siglas: string; nombre: string }> {
  const map = new Map<string, { siglas: string; nombre: string }>()
  for (const l of candidaturasDat) {
    if (l.length < 64) continue
    const codigo = sub(l, 9, 14)
    const siglas = sub(l, 15, 64).trim()
    const nombre = sub(l, 65, 214).trim()
    map.set(codigo, { siglas, nombre })
  }
  return map
}

interface SenadoDatParse {
  censo: number | null
  nulos: number | null
  blancos: number | null
  votosACandidaturas: number | null
  candidatos: SenadoCandidato[]
}

/**
 * Parsea los ficheros 03/04/07/08 ya descomprimidos y devuelve los candidatos
 * de una provincia + agregados de participación. `provinciaCodigo` es el INE de
 * 2 dígitos (p. ej. '45').
 */
export function parseSenadoTotaDat(
  provinciaCodigo: string,
  dat: { candidaturas: string[]; candidatos: string[]; global: string[]; candidatoVotos: string[] },
): SenadoDatParse {
  const partidos = partidosPorCodigo(dat.candidaturas)

  // 08: código de 6 dígitos = provincia(2)+distrito(1)+orden(3); votos por código.
  const votosPorSenador = new Map<string, number>()
  for (const l of dat.candidatoVotos) {
    if (l.length < 28) continue
    const prov = sub(l, 12, 13)
    if (prov !== provinciaCodigo) continue
    const distrito = sub(l, 14, 14)
    if (distrito !== '9') continue
    const code = sub(l, 15, 20)
    const votos = intOrNull(sub(l, 21, 28))
    if (votos !== null) votosPorSenador.set(code, votos)
  }

  // 04: relación de candidatos (nombre, apellidos, partido, elegido).
  const candidatos: SenadoCandidato[] = []
  for (const l of dat.candidatos) {
    if (l.length < 120) continue
    const prov = sub(l, 10, 11)
    if (prov !== provinciaCodigo) continue
    const distrito = sub(l, 12, 12)
    if (distrito !== '9') continue
    const tipo = sub(l, 25, 25)
    if (tipo !== 'T') continue
    const senador = sub(l, 13, 15)
    const fileCode = sub(l, 16, 21)
    const partido = partidos.get(fileCode) ?? { siglas: '', nombre: '' }
    candidatos.push({
      nombre: sub(l, 26, 50).trim(),
      apellido1: sub(l, 51, 75).trim(),
      apellido2: sub(l, 76, 100).trim(),
      partidoSiglas: partido.siglas,
      partidoNombre: partido.nombre,
      votos: votosPorSenador.get(`${provinciaCodigo}9${senador}`) ?? null,
      elegido: sub(l, 120, 120).toUpperCase() === 'S',
    })
  }

  // 07: agregados de ámbito superior (censo, nulos, blancos, a candidaturas).
  let censo: number | null = null
  let nulos: number | null = null
  let blancos: number | null = null
  let votosACandidaturas: number | null = null
  for (const l of dat.global) {
    if (l.length < 149) continue
    const prov = sub(l, 12, 13)
    if (prov !== provinciaCodigo) continue
    censo = intOrNull(sub(l, 86, 93)) ?? intOrNull(sub(l, 78, 85))
    blancos = intOrNull(sub(l, 126, 133))
    nulos = intOrNull(sub(l, 134, 141))
    votosACandidaturas = intOrNull(sub(l, 142, 149))
    break
  }

  return { censo, nulos, blancos, votosACandidaturas, candidatos }
}

/** Agrega votos por candidatura de la circunscripción a partir del dataset CLM. */
export function agregarClmCircunscripcion(
  rows: (string | number | null)[][],
  provinciaCodigo: string,
): CircunsCandidatura[] {
  const map = new Map<string, CircunsCandidatura>()
  for (const r of rows) {
    if (String(r[0] ?? '') !== provinciaCodigo) continue
    const codigo = String(r[3] ?? '')
    if (codigo === '') continue
    const siglas = String(r[4] ?? '').trim()
    const nombre = String(r[5] ?? '').trim()
    const votos = typeof r[6] === 'number' && Number.isFinite(r[6]) ? r[6] : null
    const key = `${codigo}|${siglas}|${nombre}`
    const prev = map.get(key) ?? { nombre, siglas, votos: 0, escanos: null }
    if (votos !== null) prev.votos = (prev.votos ?? 0) + votos
    map.set(key, prev)
  }
  return [...map.values()].sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
}
