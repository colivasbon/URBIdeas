// Pruebas del recorrido paginado de PostgREST para la carga nacional de atlas.
// Uso: npx tsx --test scripts/tests/paginacion-postgrest.test.ts
//
// El fallo que motivó esto: PostgREST devuelve SOLO 1.000 filas si no se pide
// un `Range`, y lo hace con HTTP 200. Una consulta sin paginar publicaba 1.000
// municipios de 8.132 sin fallar, de modo que la carga parecía completa.
//
// No se usa red, Supabase ni R2: el recorrido es una función pura que recibe
// un `pedirPagina` y devuelve filas. Los municipios son sintéticos y solo
// existen en memoria.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ErrorPaginacion,
  recorrerRangoPostgrest,
  totalDesdeContentRange,
  type PaginaRespuesta,
} from '../lib/paginacion-postgrest'

interface Municipio {
  codigo_ine: string
}

/** 8.132 municipios sintéticos con códigos únicos y ordenados. */
function municipiosSinteticos(n: number): Municipio[] {
  return Array.from({ length: n }, (_, i) => ({
    codigo_ine: String(i + 1).padStart(5, '0'),
  }))
}

/**
 * Servidor falso que respeta el contrato de PostgREST: corta en `PAGINA` y
 * devuelve `Content-Range` con el total real.
 */
function servidorFalso(
  datos: Municipio[],
  opciones: { call?: (n: number) => void } = {},
): (desde: number, hasta: number) => Promise<PaginaRespuesta<Municipio>> {
  return async (desde, hasta) => {
    opciones.call?.(hasta - desde + 1)
    const lote = datos.slice(desde, hasta + 1)
    return { filas: lote, total: datos.length }
  }
}

const TOTAL = 8132

test('8.132 municipios: llega enteros, sin duplicados y sin omitir ninguno', async () => {
  const datos = municipiosSinteticos(TOTAL)
  const pedir = servidorFalso(datos)
  const res = await recorrerRangoPostgrest<Municipio>(pedir, {
    pagina: 1000,
    clave: (m) => m.codigo_ine,
    totalEsperado: TOTAL,
  })

  assert.equal(res.length, TOTAL)
  assert.equal(new Set(res.map((m) => m.codigo_ine)).size, TOTAL, 'ningún duplicado')
  assert.deepEqual(
    res.map((m) => m.codigo_ine).sort(),
    datos.map((m) => m.codigo_ine),
    'ningún código omitido ni añadido',
  )
})

test('primera, páginas intermedias y última parcial: 9 peticiones sobre 8.132', async () => {
  const datos = municipiosSinteticos(TOTAL)
  const recibidas: number[] = []
  const rangos: string[] = []
  const res = await recorrerRangoPostgrest<Municipio>(
    async (desde, hasta) => {
      rangos.push(`${desde}-${hasta}`)
      const lote = datos.slice(desde, hasta + 1)
      recibidas.push(lote.length)
      return { filas: lote, total: TOTAL }
    },
    { pagina: 1000, clave: (m) => m.codigo_ine },
  )

  assert.equal(res.length, TOTAL)
  // Se piden 8 rangos completos de 1.000 y un noveno también de 1.000
  // (el servidor no sabe que solo quedan 132).
  assert.equal(rangos.length, 9, 'debe pedir 9 páginas')
  assert.equal(rangos[0], '0-999', 'primera página')
  assert.equal(rangos[8], '8000-8999', 'novena petición, rango de 1.000')

  // Pero se RECIBEN 8 páginas completas y una última parcial de 132.
  assert.deepEqual(
    recibidas,
    [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 132],
    'primera e intermedias completas, última parcial de 132',
  )
  assert.equal(recibidas[8], TOTAL - 8000, 'la última página parcial cierra el total')
})

test('se detiene al alcanzar el total real, sin pedir una página de más', async () => {
  let peticiones = 0
  const pedir = servidorFalso(municipiosSinteticos(TOTAL), { call: () => peticiones++ })
  await recorrerRangoPostgrest<Municipio>(pedir, { pagina: 1000, clave: (m) => m.codigo_ine })

  // Si no respectara el total, pediría una décima página.
  assert.equal(peticiones, 9)
})

test('sin Content-Range: termina en la primera página parcial', async () => {
  // Un servidor que no declara total: el fin normal es `filas.length < pagina`.
  const datos = municipiosSinteticos(1500)
  const res = await recorrerRangoPostgrest<Municipio>(async (desde, hasta) => {
    return { filas: datos.slice(desde, hasta + 1), total: null }
  }, { pagina: 1000, clave: (m) => m.codigo_ine })

  assert.equal(res.length, 1500)
})

test('FALLA si una página llega incompleta sin alcanzar el total', async () => {
  // Página 2 truncada a la mitad: el recorrido NO debe darlo por bueno.
  const datos = municipiosSinteticos(TOTAL)
  const pedir = async (desde: number, hasta: number): Promise<PaginaRespuesta<Municipio>> => {
    if (desde === 1000) return { filas: datos.slice(desde, desde + 500), total: TOTAL }
    return { filas: datos.slice(desde, hasta + 1), total: TOTAL }
  }

  await assert.rejects(
    () => recorrerRangoPostgrest<Municipio>(pedir, { pagina: 1000, clave: (m) => m.codigo_ine }),
    (e: unknown) =>
      e instanceof ErrorPaginacion && /incompleta/.test((e as Error).message),
  )
})

test('FALLA si una página llega vacía antes de tiempo', async () => {
  const datos = municipiosSinteticos(TOTAL)
  const pedir = async (desde: number, hasta: number): Promise<PaginaRespuesta<Municipio>> => {
    if (desde === 2000) return { filas: [], total: TOTAL }
    return { filas: datos.slice(desde, hasta + 1), total: TOTAL }
  }

  await assert.rejects(
    () => recorrerRangoPostgrest<Municipio>(pedir, { pagina: 1000, clave: (m) => m.codigo_ine }),
    (e: unknown) => e instanceof ErrorPaginacion && /vacía/.test((e as Error).message),
  )
})

test('FALLA si el mismo municipio aparece en dos páginas', async () => {
  // Escenario real si dos peticiones corrieran en paralelo o el `order` no fuera estable.
  const datos = municipiosSinteticos(TOTAL)
  const pedir = async (desde: number, hasta: number): Promise<PaginaRespuesta<Municipio>> => {
    if (desde === 1000) {
      return { filas: [...datos.slice(1000, hasta + 1), datos[1000]], total: TOTAL }
    }
    return { filas: datos.slice(desde, hasta + 1), total: TOTAL }
  }

  await assert.rejects(
    () => recorrerRangoPostgrest<Municipio>(pedir, { pagina: 1000, clave: (m) => m.codigo_ine }),
    (e: unknown) => e instanceof ErrorPaginacion && /duplicado/.test((e as Error).message),
  )
})

test('FALLA si se leen más filas de las declaradas', async () => {
  // Servidor inconsistente: declara 1.500 pero entrega 1.000 en cada página.
  const a = municipiosSinteticos(1000)
  const b = municipiosSinteticos(1000).map((m) => ({ codigo_ine: `X${m.codigo_ine}` }))
  const pedir = async (desde: number): Promise<PaginaRespuesta<Municipio>> => {
    if (desde === 0) return { filas: a, total: 1500 }
    return { filas: b, total: 1500 }
  }

  await assert.rejects(
    () => recorrerRangoPostgrest<Municipio>(pedir, { pagina: 1000 }),
    (e: unknown) => e instanceof ErrorPaginacion && /total declarado/.test((e as Error).message),
  )
})

test('FALLA si el total recibido no es el esperado por el llamante', async () => {
  const datos = municipiosSinteticos(TOTAL)
  await assert.rejects(
    () =>
      recorrerRangoPostgrest<Municipio>(servidorFalso(datos), {
        pagina: 1000,
        clave: (m) => m.codigo_ine,
        totalEsperado: 8131,
      }),
    (e: unknown) => e instanceof ErrorPaginacion && /total inesperado/.test((e as Error).message),
  )
})

test('el fallo de una página aborta, no produce una carga parcial', async () => {
  const datos = municipiosSinteticos(TOTAL)
  const pedir = async (desde: number, hasta: number): Promise<PaginaRespuesta<Municipio>> => {
    if (desde === 2000) throw new Error('Supabase 500: error interno')
    return { filas: datos.slice(desde, hasta + 1), total: TOTAL }
  }

  await assert.rejects(
    () => recorrerRangoPostgrest<Municipio>(pedir, { pagina: 1000, clave: (m) => m.codigo_ine }),
    /Supabase 500/,
  )
})

test('totalDesdeContentRange lee el total y tolera cabeceras ausentes', () => {
  assert.equal(totalDesdeContentRange('0-999/8132'), 8132)
  assert.equal(totalDesdeContentRange('8000-8131/8132'), 8132)
  assert.equal(totalDesdeContentRange(null), null)
  assert.equal(totalDesdeContentRange(undefined), null)
  assert.equal(totalDesdeContentRange('0-999/*'), null)
  assert.equal(totalDesdeContentRange(''), null)
})

test('un tamaño de página inválido falla antes de pedir nada', async () => {
  let peticiones = 0
  const pedir = async (desde: number, hasta: number): Promise<PaginaRespuesta<Municipio>> => {
    peticiones++
    return { filas: municipiosSinteticos(hasta - desde + 1), total: null }
  }
  await assert.rejects(
    () => recorrerRangoPostgrest<Municipio>(pedir, { pagina: 0 }),
    (e: unknown) => e instanceof ErrorPaginacion,
  )
  assert.equal(peticiones, 0, 'no debe pedir ninguna página')
})
