/**
 * Caché LRU ACOTADA de datasets de secciones censales, del lado del cliente.
 *
 * POR QUÉ EXISTE
 * El contrato nuevo sirve los valores bloque a bloque (un indicador, un periodo),
 * pero el cliente los iba PEGANDO en un único acumulador
 * `Record<seccion, Record<indicador, Record<periodo, observacion>>>`. Recorrer los
 * 127 indicadores de Madrid en su periodo por defecto deja 312 674
 * observaciones retenidas: ~130 MB de estado vivo (medido, ver
 * `tmp/audit/fixes-secciones-production/client-memory-report.json`) que ya no
 * se pintan nunca, porque el mapa, la tabla y el PNG solo leen UN indicador y
 * UN periodo cada vez.
 *
 * QUÉ HACE ESTE MÓDULO
 * Retiene la forma COMPACTA que sirvió el servidor (`{seccion: [{p,v,s,n?}]}`) y
 * la deja acotada por DOS criterios que se aplican juntos, el que se alcance
 * primero:
 *   · `LIMITE_CACHE_DATASETS` entradas (número de bloques distintos leídos), y
 *   · `LIMITE_CACHE_DATASETS_BYTES` bytes medidos del estado retenido.
 * Cuando se supera uno, expulsa la entrada MENOS RECIENTEMENTE USADA. Es un LRU
 * real, no un FIFO: la marca de uso se renueva en `tocar()`, no al insertar.
 *
 * QUÉ NO HACE
 *  · No reimplementa la expansión: eso es `expandirIndicadorCompacto`, en
 *    `@/lib/socideas-secciones-dataset`, el mismo camino que usa el servidor.
 *    Este módulo no sabe qué es una observación.
 *  · No guarda geometría ni catálogo: no son datasets, no se downloads desde
 *    `data.dataset.endpoint` y no se pueden repedir aquí. Estructuralmente
 *    quedan fuera de la caché (ver `ENSAYO_GEOMETRIA_Y_CATALOGO_FUERA_DE_LA_CACHE`).
 *  · No decide el color de nada. Una clasificación —cuantil, Jenks, intervalos
 *    iguales, cortes manuales— se calcula en el render sobre los MISMOS valores.
 *
 * ── POR QUÉ LA CLASIFICACIÓN NO ES UN EJE DE LA CLAVE ────────────────────────
 * La clave se compone de los ejes que cambian el CONTENIDO REMOTO, y solo de
 * esos. La clasificación visual NO lo es, por tres razones independientes, y
 * por eso está deliberadamente ausente de `EjesDataset`:
 *
 *  1. No viaja. `urlDeBloque()` del atlas construye la consulta con
 *     `dominio`, `bloque`, `ind`, `periodo` y `convocatoria`. No existe un
 *     parámetro de modo, de número de clases ni de cortes: el endpoint no lo
 *     lee, así que no puede cambiar la respuesta.
 *  2. No cambia el endpoint. `data.dataset.endpoint` sale del bootstrap y es
 *     el mismo para todos los modos de clasificación del municipio. La
 *     clasificación se aplica DESPUÉS, en `clasificar()`, sobre el vector de
 *     valores que ya está en memoria.
 *  3. Es una proyección, no un dato. Cuantil, Jenks, intervalos iguales y
 *     cortes manuales reposicionan los mismos `nSecciones` valores en `clases`
 *     clases distintas. Con los mismos datos, la misma entrada de caché sirve
 *     para las cuatro; incluirla en la clave haría que un simple cambio de
 *     leyenda provocara una descarga que el servidor no puede responder con
 *     nada nuevo.
 *
 * Consecuencia operativa: cambiar de clasificación NO crea entrada, NO
 * dispara `fetch` y NO evicts nada. La caché es ciega a la presentación, que es
 * exactamente lo que debe ser: la presentación no es un dataset.
 *
 * ── TAMAÑOS MEDIDOS (Madrid, 2 462 secciones) ───────────────────────────────
 * Un dataset de valores es 1 indicador × 1 periodo, así que su coste no depende
 * del número de indicadores que el municipio declare sino de sus secciones. Los
 * números salen de `tmp/audit/fixes-secciones-production/client-memory-report.json`,
 * que los mide con `JSON.stringify` en el mismo código que corre aquí:
 *
 *   · 1 indicador × 1 periodo, forma compacta retenida ........... 0,13 MB
 *   · 1 indicador × 1 periodo con notas metodológicas ............ 0,14 MB
 *   · 1 indicador × 9 periodos (cota patológica) ................. 0,90 MB
 *   · bloque electoral con candidaturas y notas .................. 0,14 MB
 *   · el MISMO bloque forma EXPANDIDA, que es lo que se retenía ... 1,11 MB
 *   · bloque `ganadoras` electoral (NO entra aquí, ver más abajo) . 0,23 MB
 *
 * Con los topes de producción, el caso NORMAL retiene 1,48 MB (3 series + la
 * expansión del activo): el tope que actúa es el de ENTRADAS, y el de bytes
 * ni se acerca. El de bytes está para el caso patológico: 3 bloques de 9
 * periodos más la expansión son 3,73 MB, que entra en 8 MiB con más del doble de
 * holgura y sigue poniendo techo a la pestaña. Con 1 MiB se expulsarían
 * datasets normales, y con 12 MiB pasaría demasiado.
 *
 * El límite de ENTRADAS responde a «cuántos indicadores alterna una persona» y
 * es una decisión de producto, no un hecho del contrato. El de BYTES está
 * porque los datasets NO pesan igual: uno político con candidaturas y uno
 * económico son un indicador cada uno sobre las mismas 2 462 secciones y pesan
 * distinto. Sin cota de peso, el límite de entradas dejaría pasar un bloque
 * desproporcionado.
 *
 * ── POR QUÉ `ganadoras` NO ENTRA EN ESTA CACHÉ ───────────────────────────────
 * El bloque electoral `ganadoras` no produce observaciones: su carga útil
 * vive en un estado de UNA sola ranura que el atlas reemplaza entero
 * (`setGanadoras(bloque.ganadoras)`), así que ya está acotado a la última
 * convocatoria visitada. Meterlo aquí sería una mentira de contabilidad:
 * expulsarlo de la caché no liberaría nada, porque los datos seguirían en ese
 * estado. Se deduplica con su propio conjunto de claves ya servidas.
 *
 * ── UN SUELO, DECLARADO ─────────────────────────────────────────────────────
 * Si el dataset ACTIVE pesa por sí solo más que el tope de bytes, la caché no
 * puede bajarse de él sin dejar a la vista sin el único dataset que puede
 * pintar. Se queda por encima del umbral y lo dice, en vez de soltar los datos:
 * pasarse un número es menos malo que pintar un plano de contornos. El tope de
 * ENTRADAS no tiene este problema: el dataset activo es uno, y con un límite de
 * 3 siempre cabe.
 *
 * Hay además un instante en que hay DOS claves fijadas —la que se pintaba y la
 * que acaba de llegar— porque el atlas registra la respuesta nueva antes de
 * mover la clave activa. Es deliberado: protege el dataset activo durante el
 * hueco entre la respuesta y el efecto que materializa la nueva, que es
 * justamente cuando un error de orden dejaría el mapa en blanco. En cuanto el
 * efecto corre, `fijar()` reescribe el conjunto entero y queda uno solo.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Ejes y clave
// ─────────────────────────────────────────────────────────────────────────────

import type { DominioSecciones } from './socideas-secciones-dataset'
import type { SeccionIndicador, SeccionesSeriesDeIndicador } from './socideas-secciones'

/**
 * Los ejes que cambian el contenido remoto de un bloque, y SOLO ellos.
 *
 * Ausente a propósito: la clasificación (modo, número de clases, cortes
 * manuales) y cualquier otro ajuste de presentación. Ver el bloque de
 * comentario de la cabecera para el porqué, punto por punto.
 */
export interface EjesDataset {
  /** INE del municipio (5 dígitos). Aísla la caché aunque se reutilice. */
  municipio: string
  dominio: DominioSecciones
  /** Bloque sin indicador (`ganadoras`). `null` para un bloque de serie. */
  bloque: string | null
  /** Id del indicador. `null` en un bloque sin indicador. */
  indicador: string | null
  /** Año pedido. `null` = el `periodo_por_defecto` que aplica el servidor. */
  periodo: number | null
  /** Convocatoria electoral. `null` fuera del dominio político. */
  convocatoria: string | null
}

/** Marcador estable para «el servidor lo decide». No es un valor de la URL:
 *  aparece en la clave para que un pedido sin periodo y otro con el periodo por
 *  defecto NO se confundan, que son el mismo contenido pero dos peticiones
 *  distintas que el usuario ha hecho explícitamente. */
const DEFECTO = 'defecto'
/** Marcador para «este eje no aplica». */
const NINGUNO = '-'

/**
 * Clave estable y compuesta de un dataset.
 *
 * Estable: sale de los valores, nunca de la posición de un objeto, de un
 * contador ni de la hora. Dos peticiones con los mismos ejes producen
 * exactamente la misma cadena, en cualquier orden de ejecución y en cualquier
 * municipio, que es lo que permite reutilizar un dataset cacheado sin red.
 *
 * Compuesta: los seis ejes van en la clave, cada uno en su posición fija. Un
 * indicador con dos periodos son dos claves; dos dominios del mismo indicador
 * son dos claves; dos candidaturas son dos claves.
 */
export function claveDataset(ejes: EjesDataset): string {
  return [
    ejes.municipio,
    ejes.dominio,
    ejes.bloque ?? NINGUNO,
    ejes.indicador ?? NINGUNO,
    ejes.periodo == null ? DEFECTO : String(ejes.periodo),
    ejes.convocatoria ?? NINGUNO,
  ].join('|')
}

/** Bytes UTF-8 de un valor ya serializado en memoria. Se mide, no se estima:
 *  el umbral de la caché tiene que poner la cuenta sobre lo que de verdad
 *  ocupa, y una estimación por celda se desvía justo en los casos caros
 *  (notas metodológicas largas, periodas con decimales). */
export function bytesSerializados(valor: unknown): number {
  return JSON.stringify(valor ?? null).length
}

// ─────────────────────────────────────────────────────────────────────────────
// Límites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Máximo de datasets RETENIDOS a la vez.
 *
 * Tres es lo que una persona llega a leer mientras recuerda qué estaba
 * mirando: el que ve, el que vio hace un momento y el anterior de la otra
 * pestaña. Medido con Madrid, 3 entradas pesan 0,40 MB en forma compacta, así
 * que el número —y no el peso— es lo que hace de tope en el uso normal. Es
 * configurable por constante porque es una decisión de producto, no un hecho
 * del contrato: subirlo no cuesta ancho de banda, cuesta memoria.
 */
export const LIMITE_CACHE_DATASETS = 3

/**
 * Máximo de BYTES del estado de datasets retenido, y se aplica el que se
 * alcance primero con el de entradas.
 *
 * 8 MB. La justificación está en la cabecera, con la medición: el peor caso
 * medido son 3 bloques patológicos (2,6 MB) más la materialización activa del
 * dataset que se está pintando (1,07 MB) = 3,6 MB. 8 MB deja más del doble de
 * holgura sobre ese caso y aun así acota la pestaña si un municipio trajera
 * bloques desproporcionados.
 *
 * Se cuenta la materialización activa porque es memoria viva de verdad: son
 * ~1,07 MB de observaciones expandidas que existen mientras se pintan.
 */
export const LIMITE_CACHE_DATASETS_BYTES = 8 * 1024 * 1024

export interface OpcionesCacheDatasets {
  maxEntradas?: number
  maxBytes?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Entradas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un dataset retenido. Guarda la forma COMPACTA que llegó del servidor, que es
 * entre 6 y 8 veces más pequeña que la expandida y se puede reexpandir sin
 * red. Las filas expandidas NO viven aquí: las materializa el atlas solo para
 * el dataset que está pintando y las suelta al cambiar.
 */
export interface EntradaCacheDataset {
  readonly clave: string
  readonly ejes: EjesDataset
  /** Forma columnar tal cual la sirvió el servidor. */
  readonly serie: SeccionesSeriesDeIndicador
  /**
   * Ficha del indicador (`indicador_meta` del bloque). Se guarda porque es lo
   * que `expandirIndicadorCompacto` necesita para rehidratar SIN red: unidad,
   * denominador, `sourceTable`, `operation` y `url`. Es un objeto por dataset,
   * no por celda, así que no pesa nada al lado de la serie, y es la misma
   * referencia que envió el servidor: no se duplica.
   */
  readonly indicadorMeta: SeccionIndicador | null
  /**
   * Clave con la que el servidor indexa los valores: el año (`"2023"`) o, en
   * política, la fecha de convocatoria (`"2023-05-28"`). No se deduce del
   * periodo pedido: son dos llamadas distintas y el servidor puede haber
   * servido otra convocatoria.
   */
  readonly periodoClave: string | null
  /** Secciones con al menos una celda. */
  readonly nSecciones: number
  /** Celdas servidas. */
  readonly nValores: number
  /** Bytes MEDIDOS de `serie` serializado. */
  bytesSerie: number
  /**
   * Bytes medidos de las filas EXPANDIDAS de esta entrada, o `null` si no está
   * materializada. Lo anota quien expande y lo libera quien cambia de dataset:
   * es la forma de que el presupuesto de bytes describa la memoria viva y no
   * una suma de promesas.
   */
  bytesExpandido: number | null
  /**
   * Marca de uso, monótona y creciente. Es la autoridad del LRU: expulsar es
   * quedarse con el mínimo acceso, nunca con el más antiguo en insertarse.
   */
  accesos: number
}

export type MotivoExpulsion = 'entradas' | 'bytes' | 'municipio' | 'reinicio'

export interface Expulsion {
  clave: string
  motivo: MotivoExpulsion
}

/** Ensayo de la regla estructural: la geometría y el catálogo no son datasets.
 *  Existe para que quede escrito y para que la prueba pueda citarlo. */
export const ENSAYO_GEOMETRIA_Y_CATALOGO_FUERA_DE_LA_CACHE =
  'geometría y catálogo no se guardan en esta caché: no se piden al endpoint de ' +
  'valores, no se repedirían aquí y su ciclo de vida es el del municipio entero'

/**
 * Caché LRU de datasets, con tope de entradas y de bytes.
 *
 * Es una estructura pura: no sabe de React, de red ni de fetch. Eso es
 * deliberado — la lógica de expulsión es lo que hay que poder medir sin
 * navegador — y quien la usa decide qué hacer con una entrada.
 */
export class CacheDatasetsSecciones {
  private readonly entradas = new Map<string, EntradaCacheDataset>()
  private readonly ejesPorClave = new Map<string, EjesDataset>()
  /** Marcas de uso por clave. Separado del `Map` para que la introspección sea
   *  explícita y para no depender del orden de inserción de un `Map`. */
  private readonly accesos = new Map<string, number>()
  private readonly byteSeriePorClave = new Map<string, number>()
  private readonly byteExpandidoPorClave = new Map<string, number | null>()
  /** Lecturas (materializaciones) por clave. Solo informativo. */
  private readonly lecturas = new Map<string, number>()

  /** Claves que no se pueden expulsar: la que la vista está pintando. */
  private fijadas = new Set<string>()

  /** Reloj monótono de uso. NUNCA se reinicia al limpiar, para que una entrada
   *  nueva sea siempre «más reciente» que una que lo era antes. */
  private reloj = 0
  private contadorExpulsados = 0

  readonly maxEntradas: number
  readonly maxBytes: number

  constructor(opciones: OpcionesCacheDatasets = {}) {
    this.maxEntradas = Math.max(1, Math.floor(opciones.maxEntradas ?? LIMITE_CACHE_DATASETS))
    this.maxBytes = Math.max(1, Math.floor(opciones.maxBytes ?? LIMITE_CACHE_DATASETS_BYTES))
  }

  /** Entradas retenidas. */
  get entradasRetenidas(): number {
    return this.entradas.size
  }

  /** Bytes MEDIDOS de todo lo retenido: series compactas + materializaciones
   *  expandidas vivas. Es la cifra que el umbral acota. */
  get bytesRetenidos(): number {
    let total = 0
    for (const clave of this.entradas.keys()) {
      total += this.byteSeriePorClave.get(clave) ?? 0
      total += this.byteExpandidoPorClave.get(clave) ?? 0
    }
    return total
  }

  /** Bytes de las series compactas, sin las materializaciones. */
  get bytesSeries(): number {
    let total = 0
    for (const clave of this.entradas.keys()) total += this.byteSeriePorClave.get(clave) ?? 0
    return total
  }

  /** Cuántos datasets se han expulsado desde que existe esta caché. */
  get expulsados(): number {
    return this.contadorExpulsados
  }

  /** Cuántas veces se ha LEÍDO (materializado) cada clave retenida. Distingue
   *  «más reciente» de «más antiguo en insertarse», que es justo la diferencia
   *  entre un LRU y una cola. */
  lecturasDe(clave: string): number {
    return this.lecturas.get(clave) ?? 0
  }

  /** Claves con filas EXPANDIDAS vivas. Tiene que haber como mucho una, y tiene
   *  que ser la que la vista está pintando: es la garantía de que cambiar de
   *  dataset no acumula, comprobable sin recalcular ningún byte. */
  clavesMaterializadas(): string[] {
    return this.claves().filter((clave) => (this.byteExpandidoPorClave.get(clave) ?? null) !== null)
  }

  /** Claves retenidas, de la más reciente a la menos. */
  claves(): string[] {
    return [...this.entradas.keys()].sort((a, b) => (this.accesos.get(b) ?? 0) - (this.accesos.get(a) ?? 0))
  }

  ejesDe(clave: string): EjesDataset | null {
    return this.ejesPorClave.get(clave) ?? null
  }

  /** ¿Está retenido este dataset? NO toca la marca de uso: preguntar no es usar. */
  tiene(clave: string): boolean {
    return this.entradas.has(clave)
  }

  /**
   * Devuelve la entrada RENOVANDO su marca de uso. Esto es lo que hace LRU de
   * verdad: releer un dataset cacheado lo convierte en el más reciente, de modo
   * que sobrevive a la siguiente expansión.
   */
  tocar(clave: string): EntradaCacheDataset | null {
    const entrada = this.entradas.get(clave)
    if (!entrada) return null
    entrada.accesos = this.renovar(clave)
    this.lecturas.set(clave, (this.lecturas.get(clave) ?? 0) + 1)
    return entrada
  }

  /** Fija las claves que no se pueden expulsar. Se reescribe entero en cada
   *  cambio: es el conjunto de lo que la vista está leyendo AHORA. */
  fijar(claves: Iterable<string>): void {
    this.fijadas = new Set(claves)
  }

  fijadasActivas(): string[] {
    return [...this.fijadas]
  }

  /**
   * Registra las filas expandidas de una entrada y sus bytes medidos. La
   * materialización es memoria viva y entra en el presupuesto por eso.
   */
  anotarExpandido(clave: string, bytes: number): void {
    if (!this.entradas.has(clave)) return
    this.byteExpandidoPorClave.set(clave, Math.max(0, Math.floor(bytes)))
  }

  /**
   * Libera las filas expandidas de una entrada. Es lo que hace que cambiar de
   * dataset no acumule: la anterior se queda solo con su forma compacta, que
   * se puede volver a expandir sin red.
   */
  liberarExpandido(clave: string): void {
    if (this.byteExpandidoPorClave.has(clave)) this.byteExpandidoPorClave.set(clave, null)
  }

  /**
   * Inserta (o sustituye) un dataset y aplica los dos límites. Devuelve lo que
   * se expulsó, para que quien lo usa pueda acusar recibo y la prueba pueda
   * comprobarlo.
   *
   * La entrada que se acaba de insertar es siempre la más reciente, así que
   * queda fuera de su propio alcance de expulsión; las fijadas tampoco salen.
   */
  insertar(entrada: EntradaCacheDataset): Expulsion[] {
    const { clave } = entrada
    this.entradas.set(clave, entrada)
    this.ejesPorClave.set(clave, entrada.ejes)
    this.byteSeriePorClave.set(clave, Math.max(0, Math.floor(entrada.bytesSerie)))
    if (!this.byteExpandidoPorClave.has(clave)) this.byteExpandidoPorClave.set(clave, entrada.bytesExpandido)
    entrada.accesos = this.renovar(clave)
    return this.aplicarLimites(clave)
  }

  /** Suelta solo los datasets de un municipio. Lo usa el cambio de municipio:
   *  sus valores no sirven para el siguiente. */
  soltarMunicipio(municipio: string): Expulsion[] {
    return this.soltar((ejes) => ejes.municipio === municipio, 'municipio')
  }

  /** Vacía la caché entera. */
  limpiar(): Expulsion[] {
    return this.soltar(() => true, 'reinicio')
  }

  // ── Interno ────────────────────────────────────────────────────────────

  private soltar(predicado: (ejes: EjesDataset) => boolean, motivo: MotivoExpulsion): Expulsion[] {
    const salidas: Expulsion[] = []
    for (const clave of [...this.entradas.keys()]) {
      const ejes = this.ejesPorClave.get(clave)
      if (!ejes || !predicado(ejes)) continue
      this.descartar(clave)
      salidas.push({ clave, motivo })
    }
    return salidas
  }

  /** Borra una entrada y todos sus contadores. Es el punto único de expulsión:
   *  no puede quedar un byte de una entrada que ya no está en el registro, que
   *  es como una fuga se esconde en una caché. */
  private descartar(clave: string): void {
    this.entradas.delete(clave)
    this.ejesPorClave.delete(clave)
    this.accesos.delete(clave)
    this.byteSeriePorClave.delete(clave)
    this.byteExpandidoPorClave.delete(clave)
    this.lecturas.delete(clave)
    this.fijadas.delete(clave)
    this.contadorExpulsados += 1
  }

  private renovar(clave: string): number {
    this.reloj += 1
    this.accesos.set(clave, this.reloj)
    return this.reloj
  }

  /** Aplica los dos topes. Se aplica el que se alcance primero, y siempre
   *  desde la entrada menos recientemente usada, saltando las fijadas. */
  private aplicarLimites(recienInsertada: string): Expulsion[] {
    const expulsadas: Expulsion[] = []
    for (;;) {
      const porEntradas = this.entradas.size > this.maxEntradas
      const porBytes = this.bytesRetenidos > this.maxBytes
      if (!porEntradas && !porBytes) break
      const victima = this.menosRecienteExpulsable(recienInsertada)
      if (victima === null) break
      // El motivo se declara por el criterio que habría que cumplir aunque esta
      // entrada no se hubiera soltado: si las dos cosas se exceden, las dos son
      // verdad y se dice la que explica la decisión.
      const motivo: MotivoExpulsion = porEntradas ? 'entradas' : 'bytes'
      this.descartar(victima)
      expulsadas.push({ clave: victima, motivo })
    }
    return expulsadas
  }

  /** La entrada con menos accesos de entre las que se pueden expulsar. Devuelve
   *  `null` cuando no queda ninguna: entonces la caché está por encima del tope
   *  solo por lo que está fijada, y eso es un suelo aceptable — un único
   *  dataset activo es el mínimo que la vista necesita para pintar. */
  private menosRecienteExpulsable(recienInsertada: string): string | null {
    let victima: string | null = null
    let accesoVictima = Number.POSITIVE_INFINITY
    for (const clave of this.entradas.keys()) {
      if (clave === recienInsertada) continue
      if (this.fijadas.has(clave)) continue
      const acceso = this.accesos.get(clave) ?? 0
      if (acceso < accesoVictima) {
        accesoVictima = acceso
        victima = clave
      }
    }
    return victima
  }

  /** Radiografía de la caché. La consumen el informe de memoria y la prueba. */
  estadisticas(): EstadisticasCacheDatasets {
    const lecturasPorClave: Record<string, number> = {}
    for (const clave of this.entradas.keys()) lecturasPorClave[clave] = this.lecturas.get(clave) ?? 0
    return {
      entradasRetenidas: this.entradas.size,
      maxEntradas: this.maxEntradas,
      bytesRetenidos: this.bytesRetenidos,
      bytesSeries: this.bytesSeries,
      maxBytes: this.maxBytes,
      expansiones: [...this.accesos.values()].length,
      expulsados: this.contadorExpulsados,
      fijadas: this.claves().filter((c) => this.fijadas.has(c)),
      lecturasPorClave,
    }
  }
}

/**
 * Ensambla una entrada de caché a partir de un bloque servido. Mide los bytes de
 * la serie aquí, una sola vez, con `JSON.stringify`: es el mismo número que usa
 * el informe de memoria, de modo que la caché y la auditoría no pueden
 * discrepar.
 */
export function crearEntradaCacheDataset(args: {
  ejes: EjesDataset
  serie: SeccionesSeriesDeIndicador
  indicadorMeta: SeccionIndicador | null
  periodoClave: string | null
  nValores: number
  nSecciones?: number
}): EntradaCacheDataset {
  const claves = Object.keys(args.serie)
  return {
    clave: claveDataset(args.ejes),
    ejes: args.ejes,
    serie: args.serie,
    indicadorMeta: args.indicadorMeta,
    periodoClave: args.periodoClave,
    nSecciones: args.nSecciones ?? claves.length,
    nValores: args.nValores,
    bytesSerie: bytesSerializados(args.serie),
    bytesExpandido: null,
    accesos: 0,
  }
}

/** Estado de la caché para el informe de memoria y para la prueba. */
export interface EstadisticasCacheDatasets {
  entradasRetenidas: number
  maxEntradas: number
  bytesRetenidos: number
  bytesSeries: number
  maxBytes: number
  expansiones: number
  expulsados: number
  fijadas: string[]
  /** Serie de lecturas por clave, para contrastar LRU con FIFO. */
  lecturasPorClave: Record<string, number>
}
