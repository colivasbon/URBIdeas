// Normalización de celdas y claves territoriales del CSV educativo del INE.
// Funciones puras: sin E/S, sin estado.
//
// Marcas observadas en los 104 CSV oficiales (edición 2024, columna Total):
//   '9', '9.999'  → recuento en formato es-ES ('.' = separador de millares)
//   '.'           → no difundido por secreto estadístico (sección < 50 hab.)
//   '""'          → celda vacía entrecomillada. En TODOS los casos comprobados
//                   contra la geometría INE del año, la sección NO existe en el
//                   seccionado de ese periodo (sección creada o suprimida).
//   ''            → no aparece en la edición 2024; se trata igual que '""'.

export type Celda =
  | { kind: 'numero'; value: number }
  /** No difundido por secreto estadístico. */
  | { kind: 'nd'; marker: string }
  /** Celda vacía en origen: sin valor publicado para ese periodo. */
  | { kind: 'vacio'; marker: string }

export const MARCAS_SECRETO: readonly string[] = ['.', '..', '...']
export const MARCAS_VACIO: readonly string[] = ['', '""']

const RE_ENTERO = /^\d+$/
const RE_MILLARES = /^\d{1,3}(\.\d{3})+$/

/**
 * Normaliza el valor de la columna Total. Nunca convierte una marca en cero.
 * Devuelve null si el valor no es ninguna forma conocida: el llamador debe
 * fallar (fail-closed), no adivinar.
 */
export function normalizarCelda(bruto: string): Celda | null {
  const v = bruto.trim()
  if (MARCAS_SECRETO.includes(v)) return { kind: 'nd', marker: v }
  if (MARCAS_VACIO.includes(v)) return { kind: 'vacio', marker: v }
  if (RE_ENTERO.test(v)) return { kind: 'numero', value: Number(v) }
  if (RE_MILLARES.test(v)) return { kind: 'numero', value: Number(v.replace(/\./g, '')) }
  return null
}

export interface CusecParseado {
  /** CUSEC de 10 dígitos, como texto. */
  cusec: string
  provincia: string
  municipio: string
  distrito: string
  seccion: string
  /** Denominación literal que sigue al código ("Albacete sección 01001"). */
  etiqueta: string
}

const RE_CUSEC = /^(\d{10})(?:\s+(.*))?$/

/** Extrae el CUSEC de la columna "Secciones" ("0200301001 Albacete sección 01001"). */
export function parsearCusec(texto: string): CusecParseado | null {
  const m = RE_CUSEC.exec(texto.trim())
  if (!m) return null
  const cusec = m[1]
  return {
    cusec,
    provincia: cusec.slice(0, 2),
    municipio: cusec.slice(0, 5),
    distrito: cusec.slice(5, 7),
    seccion: cusec.slice(7, 10),
    etiqueta: (m[2] ?? '').trim(),
  }
}

const RE_COD_NOMBRE = (n: number) => new RegExp(`^(\\d{${n}})(?:\\s+(.*))?$`)
const RE_MUN = RE_COD_NOMBRE(5)
const RE_PROV = RE_COD_NOMBRE(2)

/** "02003 Albacete" → { code: '02003', name: 'Albacete' }. */
export function parsearMunicipioColumna(texto: string): { code: string; name: string } | null {
  const m = RE_MUN.exec(texto.trim())
  return m ? { code: m[1], name: (m[2] ?? '').trim() } : null
}

/** "02 Albacete" → { code: '02', name: 'Albacete' }. */
export function parsearProvinciaColumna(texto: string): { code: string; name: string } | null {
  const m = RE_PROV.exec(texto.trim())
  return m ? { code: m[1], name: (m[2] ?? '').trim() } : null
}

/** true si el CUSEC tiene 10 dígitos, empieza por el INE de 5 dígitos y éste por la provincia de 2. */
export function claveTerritorialCoherente(cusec: string, municipio: string, provincia: string): boolean {
  return (
    /^\d{10}$/.test(cusec) &&
    /^\d{5}$/.test(municipio) &&
    /^\d{2}$/.test(provincia) &&
    cusec.startsWith(municipio) &&
    municipio.startsWith(provincia)
  )
}

/**
 * Normaliza un código INE municipal recibido por CLI. PowerShell convierte
 * '08019' en el número 8019: se repone el cero. Rechaza lo que no sean 1–5 dígitos
 * o una provincia fuera de 01–52.
 */
export function normalizarCodigoMunicipio(bruto: string): string {
  const v = bruto.trim()
  if (!/^\d{1,5}$/.test(v)) throw new Error(`código INE municipal inválido: "${bruto}"`)
  const code = v.padStart(5, '0')
  const prov = Number(code.slice(0, 2))
  if (prov < 1 || prov > 52) throw new Error(`código INE municipal con provincia inexistente: "${bruto}" → ${code}`)
  return code
}

/** Normaliza un código de provincia recibido por CLI ('2' → '02'). */
export function normalizarCodigoProvincia(bruto: string): string {
  const v = bruto.trim()
  if (!/^\d{1,2}$/.test(v)) throw new Error(`código de provincia inválido: "${bruto}"`)
  const code = v.padStart(2, '0')
  const n = Number(code)
  if (n < 1 || n > 52) throw new Error(`código de provincia fuera de 01–52: "${bruto}"`)
  return code
}
