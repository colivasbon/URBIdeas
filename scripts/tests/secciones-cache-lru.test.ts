// Caché LRU ACOTADA de datasets del atlas de secciones censales.
//
// Qué demuestra, sin red y sin navegador:
//  · que recorrer los 127 indicadores de Madrid deja un estado retenido
//    ACOTADO, y que el tope no depende de cuántos indicadores se hayan visto;
//  · que la expulsión es LRU de verdad y no una cola FIFO;
//  · que volver a un dataset cacheado no cuesta red, y que volver a uno
//    expulsado sí la cuesta (porque ya no está, y eso es lo correcto);
//  · que la clasificación visual no es un eje del dataset: cambiarla no crea
//    entrada, no expulsa nada y no pide nada a la red.
//
// El escenario se monta con una `Sesion` que reproduce el cableado del atlas
// (`pedirBloque` -> `cache.insertar` -> `materializar`) contra la caché REAL de
// `src/lib/socideas-secciones-cache.ts` y contra `expandirIndicadorCompacto`,
// el mismo camino que usa el servidor para publicar. La forma del bloque es la
// que sirve `/api/socideas/secciones-dataset`: 2 462 secciones de Madrid,
// celdas `{p,v,s}` y nada de metadato por celda.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  CacheDatasetsSecciones,
  ENSAYO_GEOMETRIA_Y_CATALOGO_FUERA_DE_LA_CACHE,
  LIMITE_CACHE_DATASETS,
  LIMITE_CACHE_DATASETS_BYTES,
  bytesSerializados,
  claveDataset,
  crearEntradaCacheDataset,
  type EjesDataset,
} from '../../src/lib/socideas-secciones-cache'
import { expandirIndicadorCompacto } from '../../src/lib/socideas-secciones-dataset'
import type { DominioSecciones, SeccionesDatasetBloque } from '../../src/lib/socideas-secciones-dataset'
import type {
  SeccionIndicador,
  SeccionPorPeriodo,
  SeccionValorStatus,
  SeccionesSeriesDeIndicador,
} from '../../src/lib/socideas-secciones'

// ─────────────────────────────────────────────────────────────────────────────
// Madrid sintetico: 2 462 secciones, la cifra real de Madrid capital
// ─────────────────────────────────────────────────────────────────────────────

const INE_MADRID = '28079'
const N_MADRID = 2462
const N_INDICADORES_MADRID = 127
const GEOMETRY_YEAR = 2025
const RETRIEVED_AT = '2025-03-01T00:00:00.000Z'
const ANIO = 2023
const MB = 1024 * 1024

/** CUSEC de Madrid: `28079` + distrito + seccion, 10 digitos, nunca agregado. */
function cusecMadrid(i: number): string {
  return `${INE_MADRID}${String(Math.floor(i / 1000) + 1).padStart(2, '0')}${String((i % 1000) + 1).padStart(3, '0')}`
}

const SECCIONES_MADRID: string[] = Array.from({ length: N_MADRID }, (_, i) => cusecMadrid(i))

function ficha(id: string, tema: SeccionIndicador['tema'], unidad: string): SeccionIndicador {
  return {
    id,
    etiqueta: `Indicador ${id}`,
    tema,
    unidad,
    denominador: null,
    operation: '30658',
    sourceTable: '30658',
    url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30658',
    publicadoPorSeccion: true,
    decimals: 2,
  } as unknown as SeccionIndicador
}

interface PerfilTema {
  dominio: DominioSecciones
  tema: SeccionIndicador['tema']
  unidad: string
  etiqueta: string
}

/** Los dominios que se alternan en las pruebas, con su perfil de peso real. Un
 *  bloque economico trae decimales largos; uno politico, valores enteros, notas
 *  y mas periodos. Que pesen distinto es el motivo de que el limite de entradas
 *  vaya acompanado de un limite de bytes. */
const PERFILES: {
  economico: PerfilTema
  actividad: PerfilTema
  educacion: PerfilTema
  politica: PerfilTema
} = {
  economico: { dominio: 'base', tema: 'renta', unidad: 'euros', etiqueta: 'Economico' },
  actividad: { dominio: 'educacion', tema: 'laboral', unidad: '%', etiqueta: 'Actividad' },
  educacion: { dominio: 'educacion', tema: 'educacion', unidad: '%', etiqueta: 'Educacion' },
  politica: { dominio: 'politica', tema: 'politica', unidad: '%', etiqueta: 'Politica' },
}

const ORDEN_PERFILES: ReadonlyArray<keyof typeof PERFILES> = ['economico', 'actividad', 'educacion', 'politica']

/**
 * Serie de un indicador como la sirve el servidor: columna a columna, sin el id
 * repetido por seccion y sin los 17 campos de la observacion expandida.
 */
function serieDe(
  perfil: PerfilTema,
  periodo: number,
  opts: { periodos?: number; ndCada?: number; nota?: boolean } = {},
): SeccionesSeriesDeIndicador {
  const periodos = opts.periodos ?? 1
  const ndCada = opts.ndCada ?? 37
  const serie: SeccionesSeriesDeIndicador = {}
  for (let i = 0; i < SECCIONES_MADRID.length; i++) {
    serie[SECCIONES_MADRID[i]!] = Array.from({ length: periodos }, (_, k) => {
      const esNd = (i + k) % ndCada === 0
      const celda: { p: number; v: number | null; s: SeccionValorStatus; n?: string } = esNd
        ? { p: periodo - k, v: null, s: 'no_difundido' }
        : {
            p: periodo - k,
            v: perfil.dominio === 'politica' ? 1000 + i + k : 32451.78 + i * 3 + k,
            s: 'observado',
          }
      if (opts.nota && i % 11 === 0) celda.n = 'Cota superior por secreto estadistico, metodo 2024.'
      return celda
    })
  }
  return serie
}

/** Ejes de una peticion, tal como los arma `ejesDeBloque` en el atlas. */
function ejes(perfil: PerfilTema, indicadorId: string, periodo: number | null, convocatoria?: string): EjesDataset {
  return {
    municipio: INE_MADRID,
    dominio: perfil.dominio,
    bloque: null,
    indicador: indicadorId,
    periodo,
    convocatoria: convocatoria ?? null,
  }
}

type RespuestaServida = { ejes: EjesDataset; bloque: SeccionesDatasetBloque }

/** El bloque completo tal como lo devuelve el endpoint. `periodoSolicitado` es
 *  el que se PIDIO y puede ser `null` (el servidor aplica su
 *  `periodo_por_defecto`); las celdas se generan con el ano que si se sirvio. */
function bloqueServido(
  perfil: PerfilTema,
  indicadorId: string,
  periodoSolicitado: number | null,
  convocatoria?: string,
): RespuestaServida {
  const e = ejes(perfil, indicadorId, periodoSolicitado, convocatoria)
  const servido = periodoSolicitado ?? ANIO
  const serie = serieDe(perfil, servido)
  let nValores = 0
  for (const celdas of Object.values(serie)) nValores += celdas.length
  return {
    ejes: e,
    bloque: {
      schemaVersion: 'secciones-dataset-v1',
      codigo_ine: INE_MADRID,
      dominio: perfil.dominio,
      indicador: indicadorId,
      periodo: servido,
      periodo_clave: convocatoria ?? String(servido),
      convocatoria: convocatoria ?? null,
      indicador_meta: ficha(indicadorId, perfil.tema, perfil.unidad),
      n_secciones: Object.keys(serie).length,
      n_valores: nValores,
      bytes_estimados: nValores * 96 + Object.keys(serie).length * 16,
      series: serie,
    },
  }
}

/** Indexa un bloque expandido como lo publica el atlas: seccion -> indicador ->
 *  clave de periodo -> observacion. */
function indexar(ind: SeccionIndicador, serie: SeccionesSeriesDeIndicador, periodoClave: string): Record<string, unknown> {
  const porSeccion: Record<string, SeccionPorPeriodo> = expandirIndicadorCompacto(serie, {
    indicador: ind,
    municipalityIne: INE_MADRID,
    geometryYear: GEOMETRY_YEAR,
    periodoClave,
    retrievedAt: RETRIEVED_AT,
  })
  const salida: Record<string, unknown> = {}
  for (const [seccion, porPeriodo] of Object.entries(porSeccion)) salida[seccion] = { [ind.id]: porPeriodo }
  return salida
}

/** Bytes de la forma COMPACTA de un dataset de Madrid: lo que se retiene. */
function bytesDeSerie(perfil: PerfilTema = PERFILES.economico, periodos = 1): number {
  return bytesSerializados(serieDe(perfil, ANIO, { periodos }))
}

/** Bytes de un dataset ya MATERIALIZADO, con la forma que lee la vista. El
 *  `id` importa: va repetido en cada una de las 2 462 observaciones. */
function bytesDeExpandido(perfil: PerfilTema = PERFILES.economico, periodos = 1, id = 'medida'): number {
  const ind = ficha(id, perfil.tema, perfil.unidad)
  return bytesSerializados(indexar(ind, serieDe(perfil, ANIO, { periodos }), String(ANIO)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesion: el mismo cableado que el atlas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reproduce lo que hace `SeccionesAtlas` con los bloques, contra la cache real.
 *
 *  · `visitar` = `pedirBloque(peticion)` seguido del efecto que materializa
 *    `claveActiva`. La red se simula con un contador: «cero red» es una
 *    asercion, no una suposicion.
 *  · La materializacion usa `expandirIndicadorCompacto`, el mismo camino que
 *    usa el servidor: aqui no se reimplementa la rehidratacion.
 *  · `cambiarClasificacion` es un acto de PRESENTACION y no llama a `visitar`,
 *    porque no debe: no hay ningun eje que cambiar.
 */
class Sesion {
  readonly cache: CacheDatasetsSecciones
  /** Peticiones efectivamente hechas a la red. */
  peticiones = 0
  /** Peticiones servidas desde la cache: las que NO tocaron la red. */
  servidasDesdeCache = 0
  /** Cuantas veces se ha descargado la geometria. Es 1, y solo 1. */
  cargasGeometria = 0
  /** Estado de presentacion, que no es un eje del dataset. */
  clasificacion: { modo: string; clases: number; cortes: number[] | null } = {
    modo: 'cuantil',
    clases: 5,
    cortes: null,
  }
  /** Lo que la vista tiene publicado: UN dataset, no la suma de todos. */
  publicado: {
    clave: string
    indicadorId: string
    perfil: PerfilTema
    observaciones: Record<string, unknown>
  } | null = null
  /** Topes observados durante toda la sesion, para la asercion de no crecimiento. */
  maxEntradasVisto = 0
  maxBytesVisto = 0
  maxObservacionesRetenidas = 0
  /** Expulsiones observadas, en orden. */
  readonly expulsiones: string[] = []

  private interest: string | null = null
  private materializada: string | null = null
  /** Peticiones hechas cuya respuesta no ha llegado todavia. */
  private readonly pendientes = new Map<
    string,
    { perfil: PerfilTema; indicadorId: string; periodo: number | null; convocatoria?: string }
  >()

  constructor(opciones: { maxEntradas?: number; maxBytes?: number } = {}) {
    this.cache = new CacheDatasetsSecciones(opciones)
  }

  /** La geometria y el catalogo se piden al bootstrap, no al endpoint de
   *  valores, y no se repedirian por cambiar de indicador. */
  cargarGeometria(): void {
    this.cargasGeometria += 1
  }

  /** Cambiar la clasificacion es un acto de presentacion: no pide nada. */
  cambiarClasificacion(modo: string, clases = 5, cortes: number[] | null = null): void {
    this.clasificacion = { modo, clases, cortes }
  }

  /** Bytes de las filas expandidas vivas. La cache solo lleva la cuenta; este es
   *  el numero que se compara con la expansion de un dataset. */
  bytesMaterializados(): number {
    return this.cache.bytesRetenidos - this.cache.bytesSeries
  }

  /**
   * Pide un dataset y materializa el que queda activo. `servir` permite simular
   * la red; por defecto responde de inmediato, como el `fetch` de un bloque que
   * el Data Cache ya tiene caliente. Devolver `null` deja la peticion PENDIENTE
   * en vez de responder, que es como se modela una respuesta que llega tarde.
   */
  visitar(
    perfil: PerfilTema,
    indicadorId: string,
    periodo: number | null,
    servir?: (e: EjesDataset) => RespuestaServida | null,
    convocatoria?: string,
  ): string {
    const e = ejes(perfil, indicadorId, periodo, convocatoria)
    const clave = claveDataset(e)
    this.interest = clave

    if (this.cache.tiene(clave)) {
      this.servidasDesdeCache += 1
      this.cache.fijar([clave])
      this.activar(clave)
      return clave
    }

    const respuesta = servir ? servir(e) : bloqueServido(perfil, indicadorId, periodo, convocatoria)
    if (!respuesta) {
      this.pendientes.set(clave, { perfil, indicadorId, periodo, convocatoria })
      return clave
    }
    this.entregar(clave, respuesta)
    return clave
  }

  /** Entrega la respuesta de una peticion PENDIENTE. Es el `await fetch` del
   *  atlas: registra en la cache y solo materializa si el interes sigue ahi. */
  llegar(clave: string): void {
    const p = this.pendientes.get(clave)
    assert.ok(p, `no hay ninguna peticion pendiente para "${clave}"`)
    this.pendientes.delete(clave)
    this.entregar(clave, bloqueServido(p.perfil, p.indicadorId, p.periodo, p.convocatoria))
  }

  /** El registro en cache mas la materializacion condicionada al interes. */
  private entregar(clave: string, respuesta: RespuestaServida): void {
    this.peticiones += 1
    const expulsadas = this.cache.insertar(
      crearEntradaCacheDataset({
        ejes: respuesta.ejes,
        serie: respuesta.bloque.series,
        indicadorMeta: respuesta.bloque.indicador_meta,
        periodoClave: respuesta.bloque.periodo_clave,
        nValores: respuesta.bloque.n_valores,
        nSecciones: respuesta.bloque.n_secciones,
      }),
    )
    for (const expulsada of expulsadas) this.expulsiones.push(expulsada.clave)
    if (this.interest === clave) this.activar(clave)
    this.medir()
  }

  /** Lo que hace el atlas cuando llega la respuesta o cambia la clave activa. */
  private activar(clave: string): void {
    if (this.materializada === clave) return
    const entrada = this.cache.tocar(clave)
    if (!entrada) return
    const meta = entrada.indicadorMeta
    if (!meta || !entrada.periodoClave) return
    const observaciones = indexar(meta, entrada.serie, entrada.periodoClave)
    this.cache.anotarExpandido(clave, bytesSerializados(observaciones))
    const anterior = this.materializada
    if (anterior && anterior !== clave) this.cache.liberarExpandido(anterior)
    this.cache.fijar([clave])
    this.materializada = clave
    this.publicado = {
      clave,
      indicadorId: meta.id,
      perfil: PERFILES[ORDEN_PERFILES.find((n) => PERFILES[n].dominio === entrada.ejes.dominio) ?? 'economico']!,
      observaciones,
    }
    this.medir()
  }

  /** Volver a render con lo mismo no debe re-expandir. */
  rerender(): void {
    if (this.publicado) this.activar(this.publicado!.clave)
    this.medir()
  }

  private medir(): void {
    this.maxEntradasVisto = Math.max(this.maxEntradasVisto, this.cache.entradasRetenidas)
    this.maxBytesVisto = Math.max(this.maxBytesVisto, this.cache.bytesRetenidos)
    if (this.publicado) {
      let n = 0
      for (const porIndicador of Object.values(this.publicado.observaciones)) {
        for (const porPeriodo of Object.values(porIndicador as Record<string, unknown>)) {
          n += Object.keys(porPeriodo as object).length
        }
      }
      this.maxObservacionesRetenidas = Math.max(this.maxObservacionesRetenidas, n)
    }
  }
}

function idsDeIndicadores(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `ind_${String(i).padStart(3, '0')}`)
}

function perfilDe(i: number): PerfilTema {
  return PERFILES[ORDEN_PERFILES[i % ORDEN_PERFILES.length]!]!
}

/** Recorre `n` indicadores distintos, uno a uno, como quien va pinchando. */
function recorrerIndicadores(n: number, opciones: { maxEntradas?: number; maxBytes?: number } = {}): Sesion {
  const s = new Sesion(opciones)
  s.cargarGeometria()
  for (const id of idsDeIndicadores(n)) {
    s.visitar(perfilDe(Number(id.slice(4))), id, ANIO)
  }
  return s
}

/** El escenario que habia ANTES del LRU: sin topes, fusionando bloque a bloque
 *  en un unico `Record<sec, Record<ind, Record<per, obs>>>`. */
function recorrerAcumulando(n: number): Record<string, Record<string, Record<string, unknown>>> {
  const retenido: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const id of idsDeIndicadores(n)) {
    const { bloque } = bloqueServido(perfilDe(Number(id.slice(4))), id, ANIO)
    const porSeccion = expandirIndicadorCompacto(bloque.series, {
      indicador: bloque.indicador_meta!,
      municipalityIne: INE_MADRID,
      geometryYear: GEOMETRY_YEAR,
      periodoClave: String(ANIO),
      retrievedAt: RETRIEVED_AT,
    })
    for (const [seccion, porPeriodo] of Object.entries(porSeccion)) {
      const porIndicador = (retenido[seccion] ??= {})
      porIndicador[id] = { ...porPeriodo }
    }
  }
  return retenido
}

function contarObservaciones(retenido: Record<string, Record<string, Record<string, unknown>>>): number {
  let n = 0
  for (const porIndicador of Object.values(retenido)) {
    for (const porPeriodo of Object.values(porIndicador)) n += Object.keys(porPeriodo).length
  }
  return n
}

/** Las comprobaciones que se repiten en 10, 50 y 127: la property central.
 *  Los topes que se comprueban son los de la sesión, que en los escenarios de
 *  Madrid son los de producción; que lo sean se afirma aparte, en el bloque 7. */
function afirmarInvariantes(s: Sesion, etiqueta: string): void {
  const stats = s.cache.estadisticas()

  // 1. El número de datasets retenidos nunca supera el límite.
  assert.ok(
    stats.entradasRetenidas <= s.cache.maxEntradas,
    `${etiqueta}: ${stats.entradasRetenidas} datasets retenidos, el límite es ${s.cache.maxEntradas}`,
  )
  assert.ok(s.maxEntradasVisto <= s.cache.maxEntradas, `${etiqueta}: el máximo observado pasó el límite`)

  // 2. Los bytes retenidos quedan por debajo del umbral.
  assert.ok(
    s.maxBytesVisto <= s.cache.maxBytes,
    `${etiqueta}: ${s.maxBytesVisto} B retenidos, el umbral es ${s.cache.maxBytes}`,
  )

  // 3. La geometría se cargó UNA sola vez y no se cuenta como dataset.
  assert.equal(s.cargasGeometria, 1, `${etiqueta}: la geometría se cargó ${s.cargasGeometria} veces`)
  assert.match(
    ENSAYO_GEOMETRIA_Y_CATALOGO_FUERA_DE_LA_CACHE,
    /geometría y catálogo no se guardan/,
    'el ensayo de que geometría y catálogo quedan fuera debe seguir escrito',
  )
  for (const clave of s.cache.claves()) {
    const partes = clave.split('|')
    assert.equal(partes.length, 6, `${etiqueta}: "${clave}" no es una clave de dataset de seis ejes`)
    assert.equal(partes[0], INE_MADRID, `${etiqueta}: "${clave}" no es un dataset de valores`)
    assert.ok(
      ['base', 'educacion', 'politica'].includes(partes[1]!),
      `${etiqueta}: "${clave}" declara un dominio que no es de valores`,
    )
    assert.ok(!['geojson', 'catalogo', 'atlas', 'secciones'].includes(partes[2]!))
  }

  // 4. El dataset activo está siempre disponible.
  assert.ok(s.publicado !== null, `${etiqueta}: no se publicó ningún dataset`)
  assert.ok(s.cache.tiene(s.publicado!.clave), `${etiqueta}: el dataset publicado no está en la caché`)
  assert.ok(s.cache.fijadasActivas().includes(s.publicado!.clave), `${etiqueta}: el dataset activo no está fijado`)

  // 5. No hay claves duplicadas.
  const claves = s.cache.claves()
  assert.equal(new Set(claves).size, claves.length, `${etiqueta}: hay claves duplicadas en la caché`)

  // 6. No quedan observaciones huérfanas: nada publicado apunta a lo expulsado, y
  //    lo publicado es de UN indicador, no de los recorridos.
  if (s.publicado) {
    assert.ok(s.cache.tiene(s.publicado.clave), `${etiqueta}: se publicó un dataset que ya no está en la caché`)
    const indicadoresPublicados = new Set<string>()
    for (const porIndicador of Object.values(s.publicado.observaciones)) {
      for (const id of Object.keys(porIndicador as object)) indicadoresPublicados.add(id)
    }
    assert.equal(indicadoresPublicados.size, 1, `${etiqueta}: lo publicado tiene más de un indicador`)
    assert.equal(s.publicado.indicadorId, [...indicadoresPublicados][0])
  }

  // 7. Hay UNA sola materialización viva, y es la del dataset que se pinta.
  //    Comprobación estructural: no hay que recalcular ningún byte para saberlo.
  assert.deepEqual(
    s.cache.clavesMaterializadas(),
    [s.publicado!.clave],
    `${etiqueta}: las materializaciones vivas son ${JSON.stringify(s.cache.clavesMaterializadas())}`,
  )

  // 8. Lo que se PINTA es un dataset, no el catálogo recorrido.
  assert.ok(
    s.maxObservacionesRetenidas <= N_MADRID,
    `${etiqueta}: ${s.maxObservacionesRetenidas} observaciones retenidas, un dataset son ${N_MADRID}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. La clave
// ─────────────────────────────────────────────────────────────────────────────

test('la clave es estable: los mismos ejes producen siempre la misma cadena', () => {
  const e = ejes(PERFILES.economico, 'renta_neta_media_persona', ANIO)
  const primera = claveDataset(e)
  for (let i = 0; i < 50; i++) {
    // El mismo objeto, construido con las claves en otro orden y otra vez.
    const gemela: EjesDataset = {
      convocatoria: e.convocatoria,
      periodo: e.periodo,
      indicador: e.indicador,
      bloque: e.bloque,
      dominio: e.dominio,
      municipio: e.municipio,
    }
    assert.equal(claveDataset(gemela), primera)
  }
})

test('la clave separa los seis ejes: municipio, dominio, bloque, indicador, periodo y convocatoria', () => {
  const base = ejes(PERFILES.economico, 'renta_neta_media_persona', ANIO)
  const primera = claveDataset(base)
  const otras: Array<[string, EjesDataset]> = [
    ['municipio', { ...base, municipio: '28080' }],
    ['dominio', { ...base, dominio: 'educacion' }],
    ['bloque', { ...base, bloque: 'ganadoras' }],
    ['indicador', { ...base, indicador: 'gini_p80_p20' }],
    ['periodo', { ...base, periodo: 2022 }],
    ['convocatoria', { ...base, convocatoria: '2023-05-28' }],
  ]
  for (const [eje, variante] of otras) {
    assert.notEqual(claveDataset(variante), primera, `cambiar "${eje}" tiene que dar otra clave`)
  }
  // Un bloque sin indicador (el electoral) no se confunde con uno que lo tiene.
  assert.notEqual(claveDataset({ ...base, indicador: null }), primera)
})

test('un pedido sin periodo y el mismo periodo por defecto son claves distintas', () => {
  // No es el mismo contenido servido de dos maneras: son dos peticiones
  // explicitas, y la cache no puede suponer que el servidor resuelva «defecto»
  // igual en las dos.
  assert.notEqual(
    claveDataset(ejes(PERFILES.economico, 'renta_neta_media_persona', null)),
    claveDataset(ejes(PERFILES.economico, 'renta_neta_media_persona', ANIO)),
  )
})

test('la clasificacion NO es un eje de la clave: no hay forma de meterla', () => {
  // `EjesDataset` no declara un campo de clasificacion, asi que no se puede
  // construir una clave que dependa de ella. Y 127 datasets distintos producen
  // 127 claves: la clave discrimina por indicador, no por nada de presentacion.
  const e = ejes(PERFILES.economico, 'renta_neta_media_persona', ANIO)
  const clave = claveDataset(e)
  for (const modo of ['cuantil', 'jenks', 'intervalos_iguales', 'cortes_manuales']) {
    assert.equal(claveDataset({ ...e }), clave, `el modo ${modo} no puede cambiar la clave`)
    assert.ok(!clave.includes(modo), `la clave no debe contener el modo "${modo}"`)
  }
  const serie = new Set(
    idsDeIndicadores(N_INDICADORES_MADRID).map((id) => claveDataset(ejes(PERFILES.economico, id, ANIO))),
  )
  assert.equal(serie.size, N_INDICADORES_MADRID)
})

test('la URL que pide un bloque no lleva la clasificacion: el servidor no la lee', () => {
  // Guarda contra una regresion silenciosa: si algun dia `urlDeBloque` mandara
  // `modo` o `clases`, la clasificacion pasaria a ser un eje del dataset sin que
  // nadie lo decidiera, y cada cambio de leyenda costaria una descarga.
  const fuente = readFileSync(
    path.join(process.cwd(), 'src', 'components', 'socideas', 'SeccionesAtlas.tsx'),
    'utf8',
  )
  const desde = fuente.indexOf('function urlDeBloque')
  assert.ok(desde > 0, 'no se encuentra urlDeBloque en SeccionesAtlas.tsx')
  const cuerpo = fuente.slice(desde, fuente.indexOf('/** Motivo legible de un fallo HTTP', desde))
  for (const parametro of ['modo', 'clases', 'cortes', 'clasificacion', 'cortesManuales']) {
    assert.ok(!cuerpo.includes(parametro), `urlDeBloque no debe mandar "${parametro}"`)
  }
  for (const parametro of ['dominio', 'bloque', 'ind', 'periodo', 'convocatoria']) {
    assert.ok(cuerpo.includes(parametro), `urlDeBloque debe seguir mandando "${parametro}"`)
  }
})

test('cambiar de clasificacion no crea entrada, no expulsa y no pide nada', () => {
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c', 'd']) s.visitar(PERFILES.economico, id, ANIO)

  const antes = {
    peticiones: s.peticiones,
    claves: s.cache.claves().sort(),
    bytes: s.cache.bytesRetenidos,
    expansiones: s.cache.expulsados,
    publicada: s.publicado?.clave ?? null,
  }
  // Cuatro cambios de presentacion sobre el mismo dataset activo, y un render
  // mas. Ni una descarga, ni una entrada, ni una expulsion.
  s.cambiarClasificacion('jenks', 7)
  s.cambiarClasificacion('intervalos_iguales', 3)
  s.cambiarClasificacion('cortes_manuales', 5, [1000, 2000, 3000])
  s.cambiarClasificacion('cuantil', 5)
  s.rerender()

  assert.equal(s.peticiones, antes.peticiones, 'cambiar de clasificacion no puede pedir nada a la red')
  assert.equal(s.cache.expulsados, antes.expansiones, 'cambiar de clasificacion no puede expulsar nada')
  assert.deepEqual(s.cache.claves().sort(), antes.claves, 'cambiar de clasificacion no puede crear entradas')
  assert.equal(s.cache.bytesRetenidos, antes.bytes, 'cambiar de clasificacion no puede cambiar los bytes')
  assert.equal(s.publicado?.clave ?? null, antes.publicada, 'el dataset pintado no cambia al reclasificar')
  assert.equal(s.clasificacion.modo, 'cuantil')
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Los tres escenarios: 10, 50 y 127 indicadores de Madrid
// ─────────────────────────────────────────────────────────────────────────────

test('Madrid, 10 indicadores: todo dentro de los topes y sin huerfanos', () => {
  const s = recorrerIndicadores(10)
  afirmarInvariantes(s, '10 indicadores')
  // Los topes que se comprueban son los de producción, no unos de laboratorio.
  assert.equal(s.cache.maxEntradas, LIMITE_CACHE_DATASETS)
  assert.equal(s.cache.maxBytes, LIMITE_CACHE_DATASETS_BYTES)
  assert.equal(s.peticiones, 10, 'cada indicador distinto se pide una vez')
  assert.equal(s.servidasDesdeCache, 0)
  assert.equal(s.expulsiones.length, 10 - LIMITE_CACHE_DATASETS)
  assert.ok(s.maxBytesVisto < 3 * MB, `10 indicadores dejaron ${(s.maxBytesVisto / MB).toFixed(2)} MB`)
})

test('Madrid, 50 indicadores: todo dentro de los topes y sin huerfanos', () => {
  const s = recorrerIndicadores(50)
  afirmarInvariantes(s, '50 indicadores')
  assert.equal(s.peticiones, 50)
  assert.equal(s.expulsiones.length, 50 - LIMITE_CACHE_DATASETS)
})

test('Madrid, 127 indicadores: todo dentro de los topes y sin huerfanos', () => {
  const s = recorrerIndicadores(127)
  afirmarInvariantes(s, '127 indicadores')
  assert.equal(s.peticiones, N_INDICADORES_MADRID, 'se piden los 127: el acumulador no servia de mas')
  assert.equal(s.expulsiones.length, N_INDICADORES_MADRID - LIMITE_CACHE_DATASETS)
  assert.ok(
    s.maxBytesVisto < 4 * MB,
    `127 indicadores dejaron ${(s.maxBytesVisto / MB).toFixed(1)} MB retenidos, no deberia llegar a 4`,
  )
})

test('no hay crecimiento lineal: el maximo con 127 es el mismo que con 20', () => {
  const s20 = recorrerIndicadores(20)
  const s127 = recorrerIndicadores(127)
  assert.equal(
    s127.maxEntradasVisto,
    s20.maxEntradasVisto,
    'el numero de datasets retenidos no puede depender de cuantos se hayan recorrido',
  )
  assert.equal(s127.maxEntradasVisto, LIMITE_CACHE_DATASETS)
  assert.equal(
    s127.maxBytesVisto,
    s20.maxBytesVisto,
    `los bytes retenidos no pueden depender del recorrido: ${s20.maxBytesVisto} con 20 y ${s127.maxBytesVisto} con 127`,
  )
  assert.equal(s127.maxObservacionesRetenidas, s20.maxObservacionesRetenidas)
  assert.equal(s127.maxObservacionesRetenidas, N_MADRID, 'lo retenido es un dataset, y solo uno')
})

test('lo retenido es una fraccion minuscula del acumulador que habia', () => {
  const antes = recorrerAcumulando(N_INDICADORES_MADRID)
  const nAntes = contarObservaciones(antes)
  const bytesAntes = JSON.stringify(antes).length

  const s = recorrerIndicadores(N_INDICADORES_MADRID)
  assert.equal(nAntes, N_MADRID * N_INDICADORES_MADRID, 'el acumulador guardaba 2 462 x 127 = 312 674')
  assert.ok(bytesAntes > 100 * MB, `el acumulador medido pesa ${(bytesAntes / MB).toFixed(0)} MB`)

  const factorObs = nAntes / s.maxObservacionesRetenidas
  const factorBytes = bytesAntes / s.maxBytesVisto
  assert.ok(factorObs > 100, `las observaciones retenidas bajaron x${factorObs.toFixed(0)}`)
  assert.ok(factorBytes > 50, `los bytes retenidos bajaron x${factorBytes.toFixed(0)}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. La expulsion es LRU de verdad
// ─────────────────────────────────────────────────────────────────────────────

test('la expulsion es LRU, no FIFO: releer el mas antiguo lo salva', () => {
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c']) s.visitar(PERFILES.economico, id, ANIO)
  const claveA = claveDataset(ejes(PERFILES.economico, 'a', ANIO))
  const claveB = claveDataset(ejes(PERFILES.economico, 'b', ANIO))
  const claveC = claveDataset(ejes(PERFILES.economico, 'c', ANIO))

  // Se relee «a», el MAS ANTIGUO: pasa a ser el mas reciente. Con una cola FIFO
  // seguiria siendo el primero en salir, y este es justo el caso que distingue
  // una cosa de la otra.
  s.visitar(PERFILES.economico, 'a', ANIO)
  assert.equal(s.peticiones, 3, 'volver a un dataset cacheado no cuesta red')
  assert.equal(s.cache.lecturasDe(claveA), 2, '«a» se ha leido dos veces')

  s.visitar(PERFILES.economico, 'd', ANIO)
  assert.deepEqual(s.expulsiones, [claveB], 'sale la MENOS reciente («b»), no la mas antigua insertada («a»)')
  assert.ok(s.cache.tiene(claveA), '«a» sobrevivio porque se acaba de usar')
  assert.ok(s.cache.tiene(claveC), '«c» sobrevivio: es mas reciente que «b»')
  assert.equal(s.publicado?.clave, claveDataset(ejes(PERFILES.economico, 'd', ANIO)))
  afirmarInvariantes(s, 'LRU')
})

test('el patron FIFO y el LRU se distinguen con la misma secuencia de uso', () => {
  // a, b, c, [vuelve a a], d: con FIFO saldria «a»; con LRU sale «b».
  const lru = new Sesion()
  for (const id of ['a', 'b', 'c', 'a', 'd']) lru.visitar(PERFILES.economico, id, ANIO)
  assert.equal(lru.expulsiones.at(-1), claveDataset(ejes(PERFILES.economico, 'b', ANIO)))
  assert.equal(lru.peticiones, 4, 'la quinta visita fue a la cache: cero red')

  // La misma secuencia sin releer «a»: entonces si sale «a», porque pasa a ser el
  // mas antiguo por antiguedad de insercion.
  const sinReleer = new Sesion()
  for (const id of ['a', 'b', 'c', 'd']) sinReleer.visitar(PERFILES.economico, id, ANIO)
  assert.equal(sinReleer.expulsiones.at(-1), claveDataset(ejes(PERFILES.economico, 'a', ANIO)))
  assert.equal(sinReleer.peticiones, 4)
})

test('nunca se expulsa el dataset que la vista esta leyendo, en 11 pasos', () => {
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']) {
    s.visitar(PERFILES.economico, id, ANIO)
    afirmarInvariantes(s, `tras ${id}`)
  }
  assert.equal(s.cache.entradasRetenidas, LIMITE_CACHE_DATASETS)
  assert.ok(s.cache.tiene(s.publicado!.clave))
  assert.equal(s.cache.fijadasActivas().length, 1, 'solo se fija el dataset que se esta pintando')
})

test('una entrada fijada no se expulsa aunque sea la menos reciente', () => {
  // La garantía vive en la caché, así que se prueba ahí: se fija la entrada con
  // menos accesos y se inserta otra. La fijada tiene que sobrevivir y el tope se
  // cumple igual.
  const serie = serieDe(PERFILES.economico, ANIO)
  const meter = (cache: CacheDatasetsSecciones, id: string) =>
    cache.insertar(
      crearEntradaCacheDataset({
        ejes: ejes(PERFILES.economico, id, ANIO),
        serie,
        indicadorMeta: ficha(id, 'renta', 'euros'),
        periodoClave: String(ANIO),
        nValores: N_MADRID,
      }),
    )
  const cache = new CacheDatasetsSecciones({ maxEntradas: 2 })
  meter(cache, 'a')
  meter(cache, 'b')
  const claveA = claveDataset(ejes(PERFILES.economico, 'a', ANIO))
  cache.fijar([claveA]) // «a» es la menos reciente y, aun así, está fijada
  meter(cache, 'c')
  assert.ok(cache.tiene(claveA), 'la fijada sobrevive: es la que la vista está leyendo')
  assert.ok(!cache.tiene(claveDataset(ejes(PERFILES.economico, 'b', ANIO))), 'sale la menos reciente no fijada')
  assert.equal(cache.entradasRetenidas, 2, 'y el tope se cumple igualmente')
})

test('el dataset activo se mantiene mientras se inserta el siguiente', () => {
  // El atlas inserta la respuesta nueva ANTES de mover la clave activa, así que
  // durante ese instante hay dos claves fijadas: la que se pintaba y la que
  // acaba de llegar. Ambas se salvan, y en cuanto el efecto materializa la
  // nueva, la vieja queda suelta. Nunca hay un instante sin dataset que pintar.
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) s.visitar(PERFILES.economico, id, ANIO)
  assert.equal(s.cache.fijadasActivas().length, 1)
  assert.ok(s.publicado !== null)
  assert.ok(s.cache.tiene(s.publicado!.clave))
  assert.ok(s.cache.entradasRetenidas <= LIMITE_CACHE_DATASETS)
  afirmarInvariantes(s, 'traslapo de fijadas')
})

test('una respuesta tardia de un dataset que ya no interesa no desplaza al activo', () => {
  const s = new Sesion()
  s.cargarGeometria()
  // «lento» se pide y su respuesta NO llega; mientras tanto llega «rapido».
  const claveLento = s.visitar(PERFILES.economico, 'lento', ANIO, () => null)
  s.visitar(PERFILES.economico, 'rapido', ANIO)
  const claveRapido = s.publicado!.clave
  assert.equal(claveRapido, claveDataset(ejes(PERFILES.economico, 'rapido', ANIO)))

  // Ahora llega la respuesta de «lento», con el interes ya en otro sitio: se
  // registra en la cache —compacta y reutilizable— pero NO se materializa.
  s.llegar(claveLento)
  assert.equal(s.publicado!.clave, claveRapido, 'la respuesta tardia no se materializa encima de la activa')
  assert.ok(s.cache.tiene(claveLento), 'pero si queda disponible sin volver a pedirla')
  assert.ok(s.cache.tiene(s.publicado!.clave))
  assert.equal(s.peticiones, 2, 'dos peticiones, dos entregas: ninguna en cadena')
  afirmarInvariantes(s, 'respuesta tardia')
})

test('se liberan los arrays expandidos de la entrada expulsada', () => {
  const s = new Sesion()
  s.cargarGeometria()
  s.visitar(PERFILES.economico, 'a', ANIO)
  const claveA = s.publicado!.clave
  s.visitar(PERFILES.economico, 'b', ANIO)
  s.visitar(PERFILES.economico, 'c', ANIO)
  assert.ok(s.bytesMaterializados() > 0, 'con el dataset activo materializado hay bytes expandidos')
  const seriesAntes = s.cache.bytesSeries

  s.visitar(PERFILES.economico, 'd', ANIO)
  assert.ok(!s.cache.tiene(claveA), '«a» ha sido expulsada por el límite')
  // Lo que se va son sus bytes de serie compacta: el total de series se queda
  // igual porque «d» ocupa su lugar, y la expulsada arrastra cero expandido
  // porque su materialización ya se había suelto al cambiar de dataset.
  assert.equal(s.cache.bytesSeries, seriesAntes, '«d» ocupa el hueco de la serie expulsada')
  assert.equal(
    s.bytesMaterializados(),
    bytesDeExpandido(PERFILES.economico, 1, 'd'),
    'y lo único expandido que queda es el dataset activo',
  )
  assert.equal(s.cache.estadisticas().entradasRetenidas, LIMITE_CACHE_DATASETS)
})

test('solo hay UNA materialización viva, y su peso es el de un dataset expandido', () => {
  const bytesSerie = bytesDeSerie()
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    s.visitar(PERFILES.economico, id, ANIO)
    // Invariante en cada paso: series de 3 datasets + la expansión de UNO, la
    // del dataset que se acaba de pintar.
    assert.deepEqual(s.cache.clavesMaterializadas(), [s.publicado!.clave], `tras "${id}"`)
    assert.equal(
      s.bytesMaterializados(),
      bytesDeExpandido(PERFILES.economico, 1, id),
      `tras "${id}" hay más de una materialización viva`,
    )
  }
  assert.ok(bytesDeExpandido(PERFILES.economico, 1, 'a') > bytesSerie, 'la expandida pesa más que la compacta')
  // Volver a un dataset de la caché no cambia el peso: se re-expande, pero solo
  // se suelta la anterior, así que la suma es la de una. «e» es de los tres que
  // quedan en la caché con el límite de 3.
  s.visitar(PERFILES.economico, 'e', ANIO)
  assert.equal(s.servidasDesdeCache, 1)
  assert.equal(s.peticiones, 7, 'volver a «e» no ha costado red')
  assert.deepEqual(s.cache.clavesMaterializadas(), [s.publicado!.clave])
  assert.equal(s.bytesMaterializados(), bytesDeExpandido(PERFILES.economico, 1, 'e'))
  assert.equal(s.cache.bytesSeries, bytesSerie * LIMITE_CACHE_DATASETS)
})

test('la rehidratacion no se repite en cada render', () => {
  const s = new Sesion()
  s.cargarGeometria()
  s.visitar(PERFILES.economico, 'a', ANIO)
  const clave = s.publicado!.clave
  assert.equal(s.cache.lecturasDe(clave), 1, 'la primera visita expande una vez')
  for (let i = 0; i < 25; i++) s.rerender()
  assert.equal(s.cache.lecturasDe(clave), 1, '25 renders mas no re-expanden')
  // Y cambiar de dataset si expande el nuevo: la rehidratacion sigue pasando
  // por `expandirIndicadorCompacto`, no por una copia memorizada a mano.
  s.visitar(PERFILES.economico, 'b', ANIO)
  assert.equal(s.cache.lecturasDe(s.publicado!.clave), 1)
  assert.equal(s.peticiones, 2)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. El limite de bytes, por separado del de entradas
// ─────────────────────────────────────────────────────────────────────────────

test('el limite de bytes expulsa aunque el de entradas no se haya tocado', () => {
  // Un dataset de Madrid ronda los 135 KB y su materializacion ronda 1,1 MB, asi
  // que con un tope de 2 MiB dejan pasar varias series por numero y el peso las
  // echa antes. Por eso hace falta el segundo criterio: los datasets NO pesan
  // igual y contar no basta.
  const tope = 2 * MB
  const s = new Sesion({ maxEntradas: 100, maxBytes: tope })
  s.cargarGeometria()
  for (const id of idsDeIndicadores(20)) {
    s.visitar(PERFILES.economico, id, ANIO)
    afirmarInvariantes(s, `con tope de peso, tras ${id}`)
  }
  const stats = s.cache.estadisticas()
  assert.ok(stats.entradasRetenidas < 100, 'el tope de entradas no es el que actua')
  assert.ok(stats.bytesRetenidos <= tope, `se quedaron ${stats.bytesRetenidos} B, el tope eran 2 MiB`)
  assert.ok(s.expulsiones.length >= 10, `el peso tiene que expulsar de verdad, solo expulsaron ${s.expulsiones.length}`)
})

test('con el tope del tope de bytes de produccion manda el de entradas', () => {
  // Al revés del caso anterior: con 8 MiB, 3 datasets normales caben de sobra y
  // el que actua es el de entradas. Los dos topes se aplican; el que aprieta es
  // el que decide, y aqui se puede ver cuál es cuál.
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of idsDeIndicadores(20)) s.visitar(PERFILES.economico, id, ANIO)
  assert.equal(s.cache.entradasRetenidas, LIMITE_CACHE_DATASETS, 'manda el de entradas')
  assert.ok(s.cache.bytesRetenidos < LIMITE_CACHE_DATASETS_BYTES)
  assert.ok(s.cache.estadisticas().entradasRetenidas < s.cache.maxEntradas + 1)
})

test('un dataset politico con candidaturas pesa mas que uno economico con el mismo numero de indicadores', () => {
  const serieEco = serieDe(PERFILES.economico, ANIO)
  // El bloque electoral trae identificadores de candidatura, notas y mas
  // periodos: mismo numero de indicadores, mismas 2 462 secciones, y pesa
  // claramente distinto. Por eso el criterio de peso no puede ser «numero de
  // indicadores».
  const seriePol = serieDe(PERFILES.politica, ANIO, { nota: true, ndCada: 500, periodos: 2 })
  const bytesEco = bytesSerializados(serieEco)
  const bytesPol = bytesSerializados(seriePol)
  assert.equal(Object.keys(serieEco).length, Object.keys(seriePol).length, 'las mismas 2 462 secciones')
  assert.ok(bytesPol > bytesEco, `el politico (${bytesPol} B) tiene que pesar mas que el economico (${bytesEco} B)`)

  // Con el tope puesto en dos datasets economicos, caben dos y el tercero no.
  const meter = (cache: CacheDatasetsSecciones, id: string, perfil: PerfilTema, serie: SeccionesSeriesDeIndicador) =>
    cache.insertar(
      crearEntradaCacheDataset({
        ejes: ejes(perfil, id, ANIO),
        serie,
        indicadorMeta: ficha(id, perfil.tema, perfil.unidad),
        periodoClave: String(ANIO),
        nValores: Object.keys(serie).length,
      }),
    )
  const soloEconomicos = new CacheDatasetsSecciones({ maxEntradas: 100, maxBytes: bytesEco * 2 })
  meter(soloEconomicos, 'eco_1', PERFILES.economico, serieEco)
  meter(soloEconomicos, 'eco_2', PERFILES.economico, serieEco)
  assert.equal(soloEconomicos.entradasRetenidas, 2, 'dos economicos justos caben')
  meter(soloEconomicos, 'eco_3', PERFILES.economico, serieEco)
  assert.equal(soloEconomicos.entradasRetenidas, 2, 'el tercero no: pesa mas de lo que queda')

  // Con el MISMO tope, un solo bloque politico se lleva el presupuesto entero.
  const conPolitico = new CacheDatasetsSecciones({ maxEntradas: 100, maxBytes: bytesEco * 2 })
  meter(conPolitico, 'pol_1', PERFILES.politica, seriePol)
  assert.equal(conPolitico.entradasRetenidas, 1, 'un solo bloque politico donde cabian dos economicos')
})

test('un bloque patologico de 9 periodos se acota igual que uno de 1', () => {
  // El endpoint acepta `periodo` opcional, asi que un dataset puede traer los
  // nueve anos de un indicador. Pesa mucho mas, y el limite lo detecta.
  const normal = new Sesion()
  normal.cargarGeometria()
  for (const id of idsDeIndicadores(6)) normal.visitar(PERFILES.economico, id, ANIO)

  const patologico = new Sesion()
  patologico.cargarGeometria()
  for (const id of idsDeIndicadores(6)) {
    patologico.visitar(PERFILES.economico, id, ANIO, () => {
      const { bloque, ejes: e } = bloqueServido(PERFILES.economico, id, ANIO)
      const serie = serieDe(PERFILES.economico, ANIO, { periodos: 9 })
      let n = 0
      for (const c of Object.values(serie)) n += c.length
      return { ejes: e, bloque: { ...bloque, series: serie, n_valores: n, n_secciones: Object.keys(serie).length } }
    })
    afirmarInvariantes(patologico, `bloque patologico, tras ${id}`)
  }
  assert.ok(
    patologico.cache.bytesSeries > normal.cache.bytesSeries * 2,
    'el bloque de 9 periodos tiene que pesar mucho mas que el de 1',
  )
  assert.equal(patologico.maxEntradasVisto, LIMITE_CACHE_DATASETS)
  assert.ok(patologico.maxBytesVisto <= LIMITE_CACHE_DATASETS_BYTES, 'y se respeta el de bytes')
})

test('los dos topes se aplican los dos, y el que aprieta es el que manda', () => {
  // Topes holgados: el de entradas manda.
  const porEntradas = new CacheDatasetsSecciones({ maxEntradas: 2, maxBytes: 1024 * MB })
  for (const id of ['a', 'b', 'c']) {
    const { bloque, ejes: e } = bloqueServido(PERFILES.economico, id, ANIO)
    porEntradas.insertar(
      crearEntradaCacheDataset({
        ejes: e,
        serie: bloque.series,
        indicadorMeta: bloque.indicador_meta,
        periodoClave: bloque.periodo_clave,
        nValores: bloque.n_valores,
      }),
    )
  }
  assert.equal(porEntradas.entradasRetenidas, 2, 'el de entradas manda cuando el de bytes no aprieta')
  assert.equal(porEntradas.expulsados, 1)

  // Topes justos: el de bytes manda mucho antes de llegar a 100 entradas, y
  // retiene exactamente las que caben en el presupuesto.
  const bytes = bytesDeSerie()
  const presupuesto = bytes * 3 + Math.floor(bytes / 4)
  const porBytes = new CacheDatasetsSecciones({ maxEntradas: 100, maxBytes: presupuesto })
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    porBytes.insertar(
      crearEntradaCacheDataset({
        ejes: ejes(PERFILES.economico, id, ANIO),
        serie: serieDe(PERFILES.economico, ANIO),
        indicadorMeta: ficha(id, 'renta', 'euros'),
        periodoClave: String(ANIO),
        nValores: N_MADRID,
      }),
    )
  }
  assert.equal(porBytes.entradasRetenidas, 3, 'con 3,25 veces el peso de un dataset caben tres')
  assert.ok(porBytes.bytesRetenidos <= presupuesto, 'y el de bytes se respeta igualmente')
  assert.equal(porBytes.expulsados, 2, 'las otras dos han salido por peso, no por numero')
  assert.ok(porBytes.entradasRetenidas < 100, 'el tope de entradas no se ha tocado')
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cambiar de dominio, de periodo y de candidatura
// ─────────────────────────────────────────────────────────────────────────────

test('alternar entre los cuatro dominios respeta el limite y no pierde el activo', () => {
  const s = new Sesion()
  s.cargarGeometria()
  for (let vuelta = 0; vuelta < 9; vuelta++) {
    for (const nombre of ORDEN_PERFILES) {
      s.visitar(PERFILES[nombre], `${nombre}_${vuelta}`, ANIO)
      afirmarInvariantes(s, `${nombre} vuelta ${vuelta}`)
    }
  }
  assert.equal(s.peticiones, 36, 'cada combinacion dominio+indicador es un dataset distinto')
  assert.equal(s.cache.entradasRetenidas, LIMITE_CACHE_DATASETS)
  assert.equal(s.maxEntradasVisto, LIMITE_CACHE_DATASETS)
  // Los dominios retenidos son de valores, nunca geometria ni catalogo.
  for (const clave of s.cache.claves()) {
    assert.ok(['base', 'educacion', 'politica'].includes(clave.split('|')[1]!))
  }
})

test('cambiar de periodo abre datasets distintos y respeta el limite', () => {
  const s = new Sesion()
  s.cargarGeometria()
  const periodos = [2019, 2020, 2021, 2022, 2023, 2021, 2019, 2020]
  for (const anio of periodos) {
    s.visitar(PERFILES.economico, 'renta_neta_media_persona', anio)
    afirmarInvariantes(s, `periodo ${anio}`)
  }
  // Con el limite de 3, de 8 visitas solo 1 sale de la cache servida: «2021»,
  // que vuelve a estar. «2019» y «2020» se habian expulsado y reentran: 5 + 2.
  assert.equal(s.servidasDesdeCache, 1, 'volver a 2021, que seguia retenida, no cuesta red')
  assert.equal(s.peticiones, 7, '2019 y 2020 se habian expulsado y vuelven a pedir: 5 + 2 = 7')
  assert.equal(s.cache.entradasRetenidas, LIMITE_CACHE_DATASETS)
  assert.equal(s.publicado?.clave, claveDataset(ejes(PERFILES.economico, 'renta_neta_media_persona', 2020)))
  // Cada ano es su propia clave: cinco anos son cinco datasets.
  assert.equal(new Set(periodos).size, 5)
})

test('cambiar de candidatura abre datasets distintos y respeta el limite', () => {
  const s = new Sesion()
  s.cargarGeometria()
  const MI = '2023-05-28'
  const pares: Array<[string, string]> = [
    ['C001', MI],
    ['C002', MI],
    ['C001', '2024-05-26'],
    ['C002', '2024-05-26'],
    ['C001', MI],
    ['C003', '2021-05-23'],
  ]
  for (const [candidatura, convocatoria] of pares) {
    s.visitar(PERFILES.politica, `pol_candidatura_${candidatura}`, null, undefined, convocatoria)
    afirmarInvariantes(s, `${candidatura}/${convocatoria}`)
  }
  // Hay 5 combinaciones (candidatura, convocatoria) distintas, pero con el límite
  // de 3 la quinta visita (C001/MI, la primera) ya no está y reentra: 6
  // peticiones. Lo que demuestra el límite es justo eso — no es «cuántos he
  // visto» sino «cuántos caben».
  assert.equal(s.peticiones, 6, 'seis peticiones: la quinta combinación se había expulsado')
  assert.equal(s.servidasDesdeCache, 0)
  assert.equal(s.cache.entradasRetenidas, LIMITE_CACHE_DATASETS)
  // Volver a una de las que SIGUE en la caché sí es gratis.
  s.visitar(PERFILES.politica, 'pol_candidatura_C002', null, undefined, '2024-05-26')
  assert.equal(s.servidasDesdeCache, 1, 'C002 en 2024-05-26 seguía en la caché: cero red')
  assert.equal(s.peticiones, 6, 'y no se ha pedido nada más')
  // Misma candidatura, distinta convocatoria, son datasets distintos: la
  // convocatoria es un eje de la clave.
  const misma = claveDataset(ejes(PERFILES.politica, 'pol_candidatura_C001', null, MI))
  const otraConvocatoria = claveDataset(ejes(PERFILES.politica, 'pol_candidatura_C001', null, '2024-05-26'))
  assert.notEqual(misma, otraConvocatoria)
  // Y toda clave política lleva convocatoria.
  for (const clave of s.cache.claves()) {
    const partes = clave.split('|')
    if (partes[1] === 'politica') assert.ok(partes[5] !== '-', `una clave política sin convocatoria: ${clave}`)
  }
  afirmarInvariantes(s, 'tras la revisita')
})

test('volver por todo lo recorrido no dispara peticiones en cadena', () => {
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c', 'd', 'e']) s.visitar(PERFILES.economico, id, ANIO)
  assert.equal(s.peticiones, 5, 'cinco indicadores, cinco peticiones: ninguna se ha duplicado')
  // Con el limite de 3 quedan «c», «d» y «e».
  assert.equal(s.servidasDesdeCache, 0)

  // Ida y vuelta por lo que sigue en la cache: cero red y cero cadenas.
  const antes = s.peticiones
  for (const id of ['c', 'd', 'e']) s.visitar(PERFILES.economico, id, ANIO)
  assert.equal(s.peticiones, antes, 'volver a lo retenido no cuesta red')
  assert.equal(s.servidasDesdeCache, 3)

  // Volver a lo que ya no esta se reintenta UNA vez por dataset, no en cadena:
  // cada respuesta materializa su propio dataset y no dispara la siguiente.
  s.visitar(PERFILES.economico, 'b', ANIO)
  s.visitar(PERFILES.economico, 'a', ANIO)
  assert.equal(s.peticiones, antes + 2, 'dos datasets expulsados, dos peticiones: una cada uno')
  afirmarInvariantes(s, 'ida y vuelta sin cadena')
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cache hit / miss: que pasa al volver
// ─────────────────────────────────────────────────────────────────────────────

test('volver a un dataset cacheado se sirve SIN red y se vuelve a pintar', () => {
  const s = new Sesion()
  s.cargarGeometria()
  s.visitar(PERFILES.economico, 'a', ANIO)
  const primera = s.publicado!
  s.visitar(PERFILES.economico, 'b', ANIO)
  s.visitar(PERFILES.economico, 'c', ANIO)
  assert.equal(s.peticiones, 3)

  s.visitar(PERFILES.economico, 'a', ANIO)
  assert.equal(s.peticiones, 3, '«a» estaba en la cache: cero peticiones')
  assert.equal(s.servidasDesdeCache, 1)
  assert.equal(s.publicado?.clave, primera.clave, 'y se vuelve a pintar')
  assert.equal(s.publicado?.indicadorId, primera.indicadorId)
  assert.equal(
    Object.keys(s.publicado!.observaciones).length,
    Object.keys(primera.observaciones).length,
    'con los mismos datos, las mismas secciones',
  )
})

test('volver a un dataset EXPULSADO vuelve a pedirlo, y lo vuelve a tener', () => {
  const s = new Sesion()
  s.cargarGeometria()
  s.visitar(PERFILES.economico, 'a', ANIO)
  const claveA = s.publicado!.clave
  s.visitar(PERFILES.economico, 'b', ANIO)
  s.visitar(PERFILES.economico, 'c', ANIO)
  s.visitar(PERFILES.economico, 'd', ANIO) // expulsa «a»
  assert.ok(!s.cache.tiene(claveA), '«a» ya no esta')
  assert.equal(s.peticiones, 4)

  s.visitar(PERFILES.economico, 'a', ANIO)
  assert.equal(s.peticiones, 5, '«a» se vuelve a pedir: se habia expulsado')
  assert.ok(s.cache.tiene(claveA), 'y vuelve a estar disponible')
  assert.equal(s.publicado?.clave, claveA)
  afirmarInvariantes(s, 'revisita tras expulsion')
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Los topes, con su numero y su justificacion
// ─────────────────────────────────────────────────────────────────────────────

test('el tope de entradas son 3 datasets y el de bytes 8 MiB, con la medicion que los sostiene', () => {
  assert.equal(LIMITE_CACHE_DATASETS, 3)
  assert.equal(LIMITE_CACHE_DATASETS_BYTES, 8 * MB)

  const bytesUno = bytesDeSerie()
  const bytesPatologico = bytesDeSerie(PERFILES.economico, 9)
  const bytesExpandido = bytesDeExpandido()

  // El caso NORMAL (3 datasets de un periodo + la materializacion activa) queda
  // holgadamente debajo del umbral: por eso el tope que actua en el uso diario
  // es el de entradas, y el de bytes es la red de seguridad.
  const casoNormal = bytesUno * LIMITE_CACHE_DATASETS + bytesExpandido
  assert.ok(casoNormal < LIMITE_CACHE_DATASETS_BYTES, `caso normal ${(casoNormal / MB).toFixed(2)} MB`)

  // El caso PATOLOGICO (3 bloques de 9 periodos + la materializacion activa) es
  // el que justifica el numero: por eso el umbral son 8 MiB y no 1. Con 1 MiB
  // expulsaria datasets normales; con 8 MiB, el peor caso medido entra con mas
  // del doble de holgura y sigue poniendo techo a la pestana.
  const casoPatologico = bytesPatologico * LIMITE_CACHE_DATASETS + bytesExpandido
  assert.ok(casoPatologico < LIMITE_CACHE_DATASETS_BYTES, `caso patologico ${(casoPatologico / MB).toFixed(2)} MB`)
  assert.ok(
    casoPatologico > LIMITE_CACHE_DATASETS_BYTES / 4,
    `el peor caso medido (${(casoPatologico / MB).toFixed(2)} MB) deberia acercarse al umbral, ` +
      'no quedarse en la nada: es un tope, no una decoracion',
  )
  assert.ok(
    casoPatologico > casoNormal * 2,
    'y tiene que pesar bastante mas que el caso normal, que es justo lo que el tope de entradas no ve',
  )
  // Un tope de 1 MiB expulsaria el caso normal: por eso no se puso ahi.
  assert.ok(casoNormal > MB, `el caso normal pesa ${(casoNormal / MB).toFixed(2)} MB: 1 MiB lo echaria`)
})

test('cambiar de municipio suelta sus datasets y no deja bytes', () => {
  const s = new Sesion()
  s.cargarGeometria()
  for (const id of ['a', 'b', 'c']) s.visitar(PERFILES.economico, id, ANIO)
  assert.equal(s.cache.entradasRetenidas, LIMITE_CACHE_DATASETS)

  const salidas = s.cache.soltarMunicipio(INE_MADRID)
  assert.equal(salidas.length, LIMITE_CACHE_DATASETS)
  assert.ok(salidas.every((x) => x.motivo === 'municipio'))
  assert.equal(s.cache.entradasRetenidas, 0)
  assert.equal(s.cache.bytesRetenidos, 0, 'no queda ni un byte del municipio anterior')
  assert.equal(s.cache.bytesSeries, 0)
  assert.deepEqual(s.cache.fijadasActivas(), [], 'ni una clave fijada colgando')
  assert.equal(s.cache.ejesDe(claveDataset(ejes(PERFILES.economico, 'a', ANIO))), null)
})
