// Paginación de PostgREST (Supabase REST) para cargas nacionales.
//
// Motivo: PostgREST devuelve SOLO la primera página (1.000 filas por defecto) y
// lo declara en la cabecera `Content-Range: <desde>-<hasta>/<total>`. Una
// consulta sin cabecera `Range` NO avisa: devuelve 1.000 filas y responde 200.
// Una carga nacional que usara esa consulta publicaría 1.000 municipios de
// 8.132 y no fallaría, de modo que parecería completa.
//
// Reglas que aplica este recorrido, todas verificadas por
// `scripts/tests/paginacion-postgrest.test.ts`:
//  - Recorre el rango entero con cabeceras `Range` sucesivas.
//  - Se detiene al alcanzar el total real declarado en `Content-Range`.
//  - FALLA si una página llega incompleta sin haber alcanzado el total, en vez
//    de dar por buena una carga truncada.
//  - FALLA si se leen más filas que las declaradas.
//  - FALLA si una página llega vacía antes de tiempo.
//  - FALLA si aparece un elemento duplicado, comparando por clave.
//  - FALLA al terminar si el número de filas leídas no cuadra con el total.
//
// Es una función pura respecto de la red: recibe un `pedirPagina` y no sabe
// nada de Supabase, de fetch ni de R2. Así se puede probar con 8.132
// municipios sintéticos, sin tocar la red ni escribir en ningún sitio.

export class ErrorPaginacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorPaginacion'
  }
}

export interface PaginaRespuesta<T> {
  /** Filas devueltas por esta página. */
  filas: T[]
  /** Total declarado en `Content-Range`, o `null` si el servidor no lo envía. */
  total: number | null
}

export interface OpcionesRecorrerRango<T> {
  /** Tamaño de página. Por defecto 1.000, el máximo cómodo de PostgREST. */
  pagina?: number
  /** Clave de identidad; si se pasa, se detectan duplicados entre páginas. */
  clave?: (fila: T) => string
  /** Total que el llamante espera recibir. Si se pasa, se verifica. */
  totalEsperado?: number
}

export interface TrazaRango {
  /** Rangos pedidos, en orden. p. ej. `['0-999', '1000-1999', …]`. */
  rangosPedidos: string[]
  /** Filas por página, en orden. La última suele ser parcial. */
  filasPorPagina: number[]
  total: number | null
  filas: number
}

/** Convierte el `Content-Range` de PostgREST en el total declarado. */
export function totalDesdeContentRange(
  contentRange: string | null | undefined,
): number | null {
  if (!contentRange) return null
  const total = Number(contentRange.split('/')[1] ?? '')
  return Number.isFinite(total) && total >= 0 ? total : null
}

/**
 * Recorre todas las páginas de una consulta PostgREST y devuelve todas las
 * filas. Falla en cerrado ante cualquier recorte que no se pueda explicar por
 * el total declarado: preferible un error a una carga nacional incompleta que
 * parece correcta.
 */
export async function recorrerRangoPostgrest<T>(
  pedirPagina: (desde: number, hasta: number) => Promise<PaginaRespuesta<T>>,
  opciones: OpcionesRecorrerRango<T> = {},
): Promise<T[]> {
  const pagina = opciones.pagina ?? 1000
  if (!Number.isInteger(pagina) || pagina <= 0) {
    throw new ErrorPaginacion(`tamaño de página inválido: ${pagina}`)
  }
  const clave = opciones.clave
  const traza: TrazaRango = { rangosPedidos: [], filasPorPagina: [], total: null, filas: 0 }

  const todas: T[] = []
  const vistas = new Set<string>()
  let desde = 0
  let numeroPagina = 0

  for (;;) {
    numeroPagina += 1
    const hasta = desde + pagina - 1
    traza.rangosPedidos.push(`${desde}-${hasta}`)

    const res = await pedirPagina(desde, hasta)
    if (traza.total === null && res.total !== null) traza.total = res.total
    const recibidas = res.filas.length
    traza.filasPorPagina.push(recibidas)
    const total = traza.total

    if (total !== null && todas.length + recibidas > total) {
      throw new ErrorPaginacion(
        `página ${numeroPagina}: se leerían ${todas.length + recibidas} filas de un total declarado de ${total}`,
      )
    }

    if (recibidas === 0) {
      if (total === null) break
      if (todas.length >= total) break
      throw new ErrorPaginacion(
        `página ${numeroPagina} vacía: solo ${todas.length} de ${total} filas leídas`,
      )
    }

    if (clave) {
      for (const fila of res.filas) {
        const k = clave(fila)
        if (vistas.has(k)) {
          throw new ErrorPaginacion(`elemento duplicado entre páginas: "${k}"`)
        }
        vistas.add(k)
      }
    }

    todas.push(...res.filas)

    if (total !== null && todas.length >= total) break

    if (recibidas < pagina) {
      // Página parcial. Solo es legítima si ya hemos leído el total entero.
      if (total !== null) {
        throw new ErrorPaginacion(
          `página ${numeroPagina} incompleta (${recibidas} de ${pagina}) con ${todas.length} de ${total} leídas`,
        )
      }
      break
    }

    desde += pagina
  }

  traza.filas = todas.length

  if (traza.total !== null && todas.length !== traza.total) {
    throw new ErrorPaginacion(
      `lectura incompleta: ${todas.length} filas de ${traza.total} declaradas`,
    )
  }
  if (opciones.totalEsperado !== undefined && todas.length !== opciones.totalEsperado) {
    throw new ErrorPaginacion(
      `total inesperado: ${todas.length} filas, se esperaban ${opciones.totalEsperado}`,
    )
  }

  return todas
}
