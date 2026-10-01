"use client";

// Atlas coroplético de secciones censales de SOCideas.
//
// Este es el componente que la página ya importa como `SeccionesMap`; mantiene
// la firma de props original (`{ codigoINE, nombre }`) para no romper nada.
//
// QUÉ HACE
//  - Pide la geometría y el atlas estadístico al proxy del municipio SOLO
//    cuando el usuario lo pide (el texto de la página lo promete así).
//  - Une geometría y estadística por `CUSEC` → `observations[sec][ind][per]`,
//    nunca por resta ni por valor municipal.
//  - Calcula la clasificación con `clasificar()` del contrato compartido.
//  - Mantiene el estado de lectura en la URL (`?ind=`, `?anio=`, `?modo=`,
//    `?clases=`, `?sec=`), validando cada parámetro contra el catálogo y
//    volviendo al valor por defecto si no encaja.
//  - Compone y descarga el PNG con la vista completa, leyenda y atribuciones.
//
// QUÉ NO HACE
//  - No inventa un valor. Si el `atlas` no viene, muestra los contornos y un
//    estado vacío honesto: no hay coropleta que dibujar.
//  - No convierte un ND en 0 ni lo mete en una clase de color.
//  - Ningún control de presentación cambia un dato.

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CLASES_MAXIMO,
  CLASES_MINIMO,
  COLOR_CONTORNO_SIN_DATO,
  COLOR_SIN_DATO,
  RAMPA_SECUENCIAL,
  SECCIONES_ATRIBUCION,
  admiteValor,
  clasificar,
  coberturaDePeriodo,
  esPoligonoDistrito,
  formatearValor,
  isValidSeccionKey,
} from "@/lib/socideas-secciones";
import type {
  ModoClasificacion,
  ResultadoClasificacion,
  ResultadoValidacion,
  SeccionFeature,
  SeccionIndicador,
  SeccionIndicadorCobertura,
  SeccionIndicadorObservaciones,
  SeccionPorPeriodo,
  SeccionValorStatus,
  SeccionesAtlasV1,
} from "@/lib/socideas-secciones";
// Rehidratación del bloque bajo demanda. La expansión NO se reimplementa aquí:
// `expandirIndicadorCompacto` es el mismo camino que usa el servidor para
// publicar, así que un bloque pegado produce exactamente las mismas
// `SeccionObservacion` que habría producido el contrato antiguo.
import { expandirIndicadorCompacto } from "@/lib/socideas-secciones-dataset";
import type {
  DominioSecciones,
  SeccionesAtlasBootstrap,
  SeccionesDatasetBloque,
} from "@/lib/socideas-secciones-dataset";
// Retención ACOTADA de los bloques ya descargados. Antes se acumulaban todos en
// un único `observations` gigante (312 674 observaciones y ~130 MB en Madrid al
// recorrer los 127 indicadores), y el mapa, la tabla y el PNG solo leen uno. La
// clave y los límites, con su medición, están en el propio módulo.
import {
  CacheDatasetsSecciones,
  bytesSerializados,
  claveDataset,
  crearEntradaCacheDataset,
  type EjesDataset,
} from "@/lib/socideas-secciones-cache";
import { componerPngMapa, nombreArchivoPngSecciones, tokenIma, type EscalaPng } from "@/lib/socideas-secciones-png";
import SeccionesAtlasMap, {
  COLOR_CONTORNO_CLASE,
  centroideGeometria,
  type EntradaLeyendaAtlas,
  type FilaAtlas,
  type GeoJsonFeatureLike,
  type HandleAtlas,
  type PresentacionAtlas,
} from "./SeccionesAtlasMap";
import SeccionesAtlasPanel, { avisoDeCortes } from "./SeccionesAtlasPanel";
import SeccionesAtlasTable from "./SeccionesAtlasTable";
import SeccionesAtlasDetalle from "./SeccionesAtlasDetalle";
import SeccionesIndicadorBuscador, {
  GRUPOS_TEMA,
  SeccionesDominioTabs,
  construirItemsIndicadores,
  conteosPorGrupo,
} from "./SeccionesIndicadorBuscador";
import SectionLegend from "./SectionLegend";
import SectionMeta from "./SectionMeta";
import SeccionesPoliticaExtension from "./SeccionesPoliticaExtension";
import type { ConvocatoriaCatalogo } from "./SeccionesPoliticaSelector";
import type { SeccionGanadora } from "@/lib/socideas-secciones-extension";
import type { Candidacy } from "@/lib/socideas-secciones-political";

/** La pestaña Política tiene su propio componente: mapa categórico de la
 *  ganadora, mapas continuos y ficha electoral. El resto de pestañas usan el
 *  motor numérico del atlas. */
const GRUPO_POLITICA = "politica";

type Estado = "idle" | "cargando" | "ok" | "error";

const CLASES_POR_DEFECTO = 5;
const MODO_POR_DEFECTO: ModoClasificacion = "cuantil";
const ETIQUETA_SIN_DATO = "Sin dato / ND";
const MS_ESPERA_MAPA = 4000;

/** Organismo responsable de la estadística seccional: el INE. */
const ORGANISMO_ESTADISTICA = "Instituto Nacional de Estadística (INE)";

/** Cartografía base del mapa: se declara con proveedor, texto y licencia. */
const BASEMAP_PROVEEDOR = "OpenStreetMap";
const BASEMAP_ATRIBUCION = "© OpenStreetMap contributors";
const BASEMAP_LICENCIA = "ODbL 1.0 — Open Database License";
const BASEMAP_URL = "https://www.openstreetmap.org/copyright";

interface RespuestaApi {
  data: {
    codigo_ine: string;
    anio_delimitacion: number;
    fuente: string;
    n_secciones: number;
    via: string;
    geojson: { type: string; features: Array<{ type: string; properties: Record<string, unknown>; geometry: unknown }> };
    /**
     * Cabecera del atlas SIN geometría (va una vez en `geojson`) y SIN
     * `observations` (van en el bloque de dataset). `observations` llega vacío
     * POR CONSTRUCCIÓN: es la señal de que aquí no hay valores que pintar.
     */
    atlas?: SeccionesAtlasBootstrap | null;
    dominios?: {
      educacion?: {
        periodos: number[];
        indicadores: number;
        observaciones?: number;
        nd?: number;
        supresiones?: number;
        secciones_all_nd?: number;
      };
      actividad?: { periodos: number[]; indicadores: number };
      politica?: {
        catalog: ConvocatoriaCatalogo[];
        electionId: string;
        status: string;
        mesas_agregadas: number;
        candidaturas: Candidacy[];
        /** Las ganadoras ya NO vienen aquí: el bootstrap publica dónde pedirlas. */
        ganadoras_endpoint?: string;
      };
    };
    avisos?: string[];
    /** Veredicto fail-closed ejecutado EN EL SERVIDOR. El cliente ya no puede
     *  repetirlo: no recibe `observations`. Misma forma que
     *  `validarSeccionesAtlas`. */
    validacion?: ResultadoValidacion;
    /** Cómo pedir los valores. La ruta se toma de aquí, no del código. */
    dataset?: { endpoint: string; params: Record<string, string>; nota: string };
    config?: {
      dominios?: DominioSecciones[];
      periodos?: number[];
      periodo_por_defecto?: number | null;
      n_indicadores?: number;
    };
  } | null;
  error: string | null;
  count?: number;
}

/** Respuesta de `/api/socideas/secciones-dataset/{ine}`. El bloque va en
 *  `data`; cuando no hay datos, `data` es `null` y `error` lleva el MOTIVO
 *  exacto (404 con la razón por la que ese bloque no existe). */
interface RespuestaDataset {
  data: (SeccionesDatasetBloque & { bloque?: "ganadoras"; ganadoras?: Record<string, SeccionGanadora> }) | null;
  error: string | null;
  count?: number;
  cache?: { via: string; motivo: string | null; tag: string };
  validacion?: ResultadoValidacion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Valores bajo demanda
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que el motor de coropleta, la tabla y el PNG leen: el atlas del bootstrap
 *  con `observations` sustituido por los bloques YA hidratados. Se distingue del
 *  atlas servido porque este no lleva `sections` (la geometría viaja una vez en
 *  `data.geojson`) y la vista nunca las usa. */
type AtlasParaVista = Omit<SeccionesAtlasV1, "sections">;

/** Bloques ya hidratados: sección → indicador → clave de periodo → observación.
 *  La clave de periodo es el año (`"2023"`) o, en Política, la convocatoria
 *  (`"2023-05-28"`): es lo que el servidor publica como `periodo_clave` y lo
 *  que la vista indexa. */
export type ObservacionesHidrátadas = Record<string, SeccionIndicadorObservaciones>;

/** Un dataset materializado para pintar: el que la vista está leyendo, con sus
 *  filas expandidas y con la clave que lo identifica en la caché. Se SUSTITUYE
 *  entero al cambiar de dataset, nunca se fusiona con el anterior. */
interface Materializacion {
  clave: string;
  /** Con la que se indexó dentro de cada sección, y por la que la vista lee. */
  indicadorId: string;
  observaciones: ObservacionesHidrátadas;
  /** Celdas realmente expandidas. Lo dice el panel de estado, no la vista. */
  nObservaciones: number;
}

/** Un bloque pedido. `periodo` y `convocatoria` pueden faltar: el servidor usa
 *  entonces el `periodo_por_defecto` de la cobertura y la convocatoria más
 *  reciente, y lo dice en la respuesta. */
export interface PeticionBloque {
  dominio: DominioSecciones;
  indicadorId: string;
  periodo?: number | null;
  convocatoria?: string;
  bloque?: "ganadoras";
}

/** Estado de un bloque, para que la UI distinga «cargando valores» de «no hay
 *  datos» y de «el servidor dijo que no». Un mapa vacío sin explicación es
 *  exactamente el defecto que este contrato evita. */
export interface EstadoBloque {
  estado: "cargando" | "ok" | "vacio" | "error";
  /** Motivo literal del servidor cuando el bloque no se pudo servir. */
  error?: string;
  status?: number | null;
  nSecciones?: number;
  nValores?: number;
  /** Con la que el servidor indexa los valores: el año o la fecha de convocatoria. */
  periodoClave?: string | null;
  /** Convocatoria con la que el servidor respondió, si se pidió una distinta. */
  convocatoriaServida?: string | null;
}

/** Tope de reintentos manuales por bloque. Es el interruptor de seguridad: un
 *  fallo reintentado en bucle (por un `?forzar=1` colado en la URL o por un
 *  efecto que se auto-dispara) no puede convertirse en un bucle de
 *  peticiones. Pasado el tope se dice, en vez de seguir golpeando. */
const MAX_INTENTOS_POR_BLOQUE = 3;

/** Clave estable de un bloque. Incluye TODOS los ejes que cambian el contenido
 *  REMOTO (municipio, dominio, bloque, indicador, periodo, convocatoria) para
 *  que la caché de cliente no mezcle dos respuestas distintas, y nada más.
 *
 *  DELIBERADAMENTE NO incluye la clasificación. Cuantil, Jenks, intervalos
 *  iguales y cortes manuales reparten los MISMOS valores en clases distintas, y
 *  la clasificación se aplica en el render, sobre el vector ya en memoria: no
 *  viaja en la consulta (`urlDeBloque` no manda `modo` ni `clases`), no cambia
 *  el endpoint y no puede alterar la respuesta del servidor. Incluirla haría
 *  que abrir la leyenda provocara una descarga que no puede devolver nada
 *  nuevo. El porqué, punto por punto, está en la cabecera de
 *  `socideas-secciones-cache`. */
function ejesDeBloque(p: PeticionBloque, municipio: string): EjesDataset {
  return {
    municipio,
    dominio: p.dominio,
    bloque: p.bloque ?? null,
    indicador: p.indicadorId,
    periodo: p.periodo ?? null,
    convocatoria: p.convocatoria ?? null,
  };
}

function claveDeBloque(p: PeticionBloque, municipio: string): string {
  return claveDataset(ejesDeBloque(p, municipio));
}

/** Dominio al que pertenece un indicador, según el tema que declara el catálogo.
 *  Educación y Actividad salen del MISMO objeto del Censo Anual, así que
 *  `educacion` y `laboral` viajan por `dominio=educacion`; lo electoral va por
 *  `politica` y el resto por el atlas base de R2. Nunca se hardcodea un id. */
function dominioDeIndicador(indicador: SeccionIndicador): DominioSecciones {
  if (indicador.tema === "politica") return "politica";
  if (indicador.tema === "educacion" || indicador.tema === "laboral") return "educacion";
  return "base";
}

/** URL del bloque. El ORIGEN sale de `data.dataset.endpoint` del bootstrap: si
 *  el servidor publica otra ruta, el cliente la sigue. Los nombres de parámetro
 *  son los que documenta `dataset.nota` y lee la ruta (`ind`, no `indicador`;
 *  el `params.indicador` del bootstrap es un marcador de posición, no una
 *  clave de consulta). */
function urlDeBloque(endpoint: string, p: PeticionBloque): string {
  const q = new URLSearchParams();
  q.set("dominio", p.dominio);
  if (p.bloque) {
    // Un bloque como `ganadoras` NO es de un indicador: son las ganadoras de
    // todas las secciones. Mandar `ind` ahí sugeriría un indicador que la ruta
    // ni mira, así que no se manda.
    q.set("bloque", p.bloque);
  } else if (p.indicadorId) {
    q.set("ind", p.indicadorId);
  }
  if (p.periodo != null) q.set("periodo", String(p.periodo));
  if (p.convocatoria) q.set("convocatoria", p.convocatoria);
  const separador = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separador}${q.toString()}`;
}

/** Motivo legible de un fallo HTTP. Un 404 del endpoint de valores NO es «sin
 *  indicadores»: es una razón concreta y el usuario la necesita para saber si
 *  debe consultar otro municipio, reintentar o resignarse. Se muestra literal. */
function causaDeFallo(status: number, mensaje: string | null | undefined): string {
  const motivo = (mensaje ?? "").trim();
  const sufijo = motivo ? `: ${motivo}` : ".";
  if (status === 404) return `Sin bloque de valores (HTTP 404)${sufijo}`;
  if (status === 400) return `Petición no válida (HTTP 400)${sufijo}`;
  if (status === 409 || status === 422) return `Bloque no publicable (HTTP ${status})${sufijo}`;
  if (status >= 500) return `El servidor no ha podido servir ni validar el bloque (HTTP ${status})${sufijo}`;
  return `Fallo inesperado del endpoint de valores (HTTP ${status})${sufijo}`;
}

/** Motivo legible de un fallo del BOOTSTRAP. Un 404 aquí significa una de tres
 *  cosas concretas —municipio sin atlas, sin resultados o inexistente— y cada
 *  una tiene una consecuencia distinta para quien lee. Se enuncia literal. */
function causaDeFalloBootstrap(status: number, mensaje: string | null | undefined, municipio: string): string {
  const motivo = (mensaje ?? "").trim();
  const sufijo = motivo ? `: ${motivo}` : ".";
  if (status === 404) return `No hay nada publicado para ${municipio} (HTTP 404)${sufijo}`;
  if (status === 400) return `El municipio "${municipio}" no tiene un código INE válido (HTTP 400)${sufijo}`;
  if (status === 502) return `El servidor no ha podido resolver la geometría de ${municipio} (HTTP 502)${sufijo}`;
  if (status >= 500) return `Fallo del servidor al preparar ${municipio} (HTTP ${status})${sufijo}`;
  return `No se pudieron cargar las secciones de ${municipio} (HTTP ${status})${sufijo}`;
}

/** Indexa un bloque YA expandido como un dataset, con la forma que lee la
 *  vista: sección → indicador → clave de periodo → observación.
 *
 *  A diferencia de la antigua fusión, esto NO se mezcla con lo anterior: es el
 *  contenido ÍNTEGRO de un solo dataset. La vista lee un indicador y un periodo
 *  cada vez, así que un dataset basta para pintar, y lo que se pinta se puede
 *  soltar entero al cambiar de dataset. Esa es la diferencia entre 312 674
 *  observaciones retenidas y 2 462. */
function indexarBloqueHidrátado(
  indicadorId: string,
  porSeccion: Record<string, SeccionPorPeriodo>,
): ObservacionesHidrátadas {
  const salida: ObservacionesHidrátadas = {};
  for (const [seccion, porPeriodo] of Object.entries(porSeccion)) {
    salida[seccion] = { [indicadorId]: porPeriodo };
  }
  return salida;
}

const PRESENTACION_POR_DEFECTO: PresentacionAtlas = {
  opacidad: 0.85,
  mostrarBordes: true,
  mostrarEtiquetas: false,
  basemap: true,
  divergente: false,
  cortesManuales: null,
  escalaPng: 1,
};

export default function SeccionesMap({ codigoINE, nombre }: { codigoINE: string; nombre: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Prefijo de id de las pestañas de dominio y del panel que labellan. */
  const idDominios = useId().replace(/[^a-zA-Z0-9]/g, "");

  const [estado, setEstado] = useState<Estado>("idle");
  const [datos, setDatos] = useState<RespuestaApi["data"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null);
  /** El bootstrap no trajo veredicto de validación. Se declara, porque un atlas
   *  sin veredicto NO es lo mismo que un atlas validado. */
  const [validacionAusente, setValidacionAusente] = useState(false);
  /** Valores ya hidratados, POR DATASET. El bootstrap llega con
   *  `observations: {}`; esta es la única fuente de valores que pinta el mapa.
   *
   *  No es un acumulador: es SOLO el dataset que la vista está leyendo, y se
   *  sustituye entero al cambiar de indicador, periodo, convocatoria o dominio.
   *  Antes se pegaba cada bloque encima del anterior y recorrerse los 127
   *  indicadores de Madrid dejaba 312 674 observaciones retenidas (~130 MB)
   *  para pintar de dos en dos. */
  const [materializacion, setMaterializacion] = useState<Materializacion | null>(null);
  /** Estado de carga/error POR BLOQUE, indexado por `claveDeBloque`. Vive en el
   *  atlas y no en la pestaña que lo pidió: Política se desmonta al salir de la
   *  pestaña y su bloque debe seguir disponible y legible. */
  const [bloques, setBloques] = useState<Record<string, EstadoBloque>>({});
  /** Ganadoras por sección. No son observaciones (no son un valor del
   *  contrato) y no caben en `observations`: tienen su propio bloque. */
  const [ganadoras, setGanadoras] = useState<Record<string, SeccionGanadora>>({});
  const [presentacion, setPresentacion] = useState<PresentacionAtlas>(PRESENTACION_POR_DEFECTO);
  const [hovered, setHovered] = useState<string | null>(null);
  const [vista, setVista] = useState<"mapa" | "tabla">("mapa");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const mapaRef = useRef<HandleAtlas | null>(null);
  const [aplicando, iniciarTransicion] = useTransition();

  // ── Caché de datasets (acotada, LRU) ───────────────────────────────────
  //
  // Las referencias (`useRef`) son a propósito: mutar la caché NO es un cambio
  // de estado de React, así que insertar o expulsar un dataset no puede
  // provocar un render, ni que un efecto se dispare por un bloque ya
  // descargado, ni un bucle. Lo que sí es estado (y por tanto sí renderiza) es
  // `materializacion`, el único dataset materializado para pintar.
  /** Datasets retenidos, por encima de los topes de entradas y de bytes. */
  const [cache] = useState(() => new CacheDatasetsSecciones());
  /** Clave del dataset que la vista está leyendo. Cambia al pedir un bloque,
   *  incluso si venía de la caché: es lo que dispara la materialización. */
  const [claveActiva, setClaveActiva] = useState<string | null>(null);
  /** Último dataset pedido, para que una respuesta tardía de un dataset que ya
   *  no interesa NO se materialice por encima del actual. */
  const interesRef = useRef<string | null>(null);
  /** Clave ya materializada. Corta la re-expansión: cambiar de render no
   *  vuelve a expandir, y volver al mismo dataset tampoco. */
  const claveMaterializada = useRef<string | null>(null);
  /** Peticiones EN VOLO por clave. Es la deduplicación: dos efectos que piden
   *  el mismo bloque antes de que llegue el primero comparten una sola promesa. */
  const bloquesEnVuelo = useRef<Map<string, { promesa: Promise<void>; control: AbortController }>>(new Map());
  /** Intentos manuales por clave, para el interruptor de seguridad. */
  const intentosPorBloque = useRef<Map<string, number>>(new Map());
  /** Se cancela todo al desmontar: un bloque que llega tarde a un atlas que ya
   *  no existe no debe escribir en un componente desmontado. */
  const vivos = useRef(true);
  useEffect(() => {
    vivos.current = true;
    const enVuelo = bloquesEnVuelo.current;
    return () => {
      vivos.current = false;
      for (const { control } of enVuelo.values()) control.abort();
      enVuelo.clear();
    };
  }, []);

  // ── Carga bajo demanda ──────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setEstado("cargando");
    setError(null);
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const res = await fetch(`/api/socideas/secciones/${codigoINE}`);
      const j = (await res.json().catch(() => null)) as RespuestaApi | null;
      if (!res.ok || !j?.data) {
        // 404 con motivo: «municipio sin atlas», «sin resultados», «municipio no
        // encontrado»… son razones distintas y el usuario necesita la exacta. No
        // se colapsan en un «sin indicadores» genérico.
        throw new Error(causaDeFalloBootstrap(res.status, j?.error, nombre));
      }
      setDatos(j.data);
      // Validación fail-closed: ahora la ejecuta el SERVIDOR, porque el cliente
      // ya no puede repetirla (no recibe `observations`). Misma forma que
      // devolvía `validarSeccionesAtlas`. Si no viniera, se degrada a `null`
      // con aviso explícito, nunca a un error: el atlas sigue siendo legible.
      if (j.data.validacion) {
        setValidacion(j.data.validacion);
      } else {
        setValidacion(null);
        setValidacionAusente(true);
      }
      // Un municipio distinto invalida los valores ya hidratados del anterior.
      // Los bloques que siguieran en vuelo se cancelan: si llegaran después de
      // vaciar el estado, escribirían valores de una carga que ya se descartó.
      for (const { control } of bloquesEnVuelo.current.values()) control.abort();
      // La caché se suelta por municipio, no entera: es la única operación que
      // la vacía por completo, y deja constancia de por qué.
      cache.soltarMunicipio(codigoINE);
      setMaterializacion(null);
      setClaveActiva(null);
      setGanadoras({});
      setBloques({});
      interesRef.current = null;
      claveMaterializada.current = null;
      bloquesEnVuelo.current.clear();
      intentosPorBloque.current.clear();
      setEstado("ok");
      if (process.env.NODE_ENV !== "production") {
        const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
        // Métrica dev-only: sin geometrías ni datos personales.
        console.debug(`[socideas][secciones-atlas] ine=${codigoINE} n=${j.data.n_secciones} ms=${ms}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar las secciones");
      setEstado("error");
    }
  }, [codigoINE, nombre, cache]);

  // ── Materialización: UN dataset expandido, el que se pinta ──────────────
  //
  // La caché guarda la forma COMPACTA que llegó del servidor. Aquí, y solo
  // aquí, se expande un dataset —con `expandirIndicadorCompacto`, el mismo
  // camino que usa el servidor para publicar— y se publica como estado para el
  // render. Al materializar otro se SUELTA el anterior: no se fusiona con él.
  //
  // Por qué la vista no lo nota: mapa, tabla, ficha y PNG leen un indicador y
  // un periodo cada vez (`construirVista` indexa por `observations[seccion]
  // [indicador][año]`, y la capa Política por `[indicador][convocatoria]`), así
  // que con el dataset activo basta y sobra.
  const materializar = useCallback(
    (clave: string): void => {
      if (claveMaterializada.current === clave) return;
      const entrada = cache.tocar(clave);
      if (!entrada) return; // todavía en vuelo: materializará su respuesta
      // Sin ficha ni clave de periodo no hay nada que expandir: un bloque así
      // no se indexa en ninguna parte, así que no puede ser el dataset activo.
      const meta = entrada.indicadorMeta;
      if (!meta || !entrada.periodoClave) return;
      const porSeccion = expandirIndicadorCompacto(entrada.serie, {
        indicador: meta,
        municipalityIne: entrada.ejes.municipio,
        geometryYear: datos?.atlas?.geometryYear ?? datos?.anio_delimitacion ?? 0,
        periodoClave: entrada.periodoClave,
        retrievedAt: datos?.atlas?.statsRetrievedAt ?? "",
      });
      const observaciones = indexarBloqueHidrátado(meta.id, porSeccion);
      let nObservaciones = 0;
      for (const porIndicador of Object.values(observaciones)) {
        for (const porPeriodo of Object.values(porIndicador)) nObservaciones += Object.keys(porPeriodo).length;
      }
      // El peso de la materialización entra en el presupuesto de la caché: son
      // bytes vivos, no una promesa.
      cache.anotarExpandido(clave, bytesSerializados(observaciones));
      // Se suelta la anterior ANTES de publicar la nueva: nunca hay dos
      // materializaciones vivas a la vez.
      const anterior = claveMaterializada.current;
      if (anterior && anterior !== clave) cache.liberarExpandido(anterior);
      // Lo que se está pintando no se expulsa. Se fija aquí, y también en el
      // camino de caché en `pedirBloque`: las dos son idempotentes y están las
      // dos porque entre fijar y materializar hay un render, y en ese render
      // puede llegar otra respuesta.
      cache.fijar([clave]);
      claveMaterializada.current = clave;
      setMaterializacion({ clave, indicadorId: meta.id, observaciones, nObservaciones });
      if (process.env.NODE_ENV !== "production") {
        // Métrica dev-only: sin geometrías ni datos personales. Sirve para ver
        // en el navegador que lo retenido está acotado y no crece con cada
        // indicador que se recorre.
        const s = cache.estadisticas();
        console.debug(
          `[socideas][secciones-cache] ${clave} obs=${nObservaciones} ` +
            `entradas=${s.entradasRetenidas}/${s.maxEntradas} ` +
            `bytes=${(s.bytesRetenidos / 1024).toFixed(0)}KiB/${(s.maxBytes / 1024).toFixed(0)}KiB ` +
            `expulsados=${s.expulsados}`,
        );
      }
    },
    [cache, datos],
  );

  // Un dataset que vuelve a ser el que se lee se materializa desde la caché, sin
  // red. El efecto depende de la CLAVE, no de la respuesta: cambiar de render no
  // vuelve a expandir.
  useEffect(() => {
    if (!claveActiva) return;
    materializar(claveActiva);
  }, [claveActiva, materializar]);

  // ── Petición de un bloque de valores ────────────────────────────────────
  //
  // Reglas que resumen todo el cableado bajo demanda:
  //  · la ruta sale de `data.dataset.endpoint` del bootstrap, no del código;
  //  · un dataset RETENIDO no vuelve a pedirse; uno EXPULSADO sí, porque la
  //    caché es la única que sabe qué sigue en memoria (no hay un conjunto de
  //    «claves servidas» aparte que pudiera desincronizarse y mentir);
  //  · dos peticiones del mismo bloque comparten una sola promesa (deduplicación);
  //  · la expansión la hace `expandirIndicadorCompacto`, el mismo camino que
  //    usa el servidor para publicar: aquí no se reimplementa;
  //  · la respuesta se REGISTRA en la caché (forma compacta, con sus bytes
  //    medidos) y SOLO se materializa si sigue siendo el dataset que interesa;
  //  · el estado se escribe BAJO LA CLAVE del bloque, así que una respuesta
  //    tardía de un indicador anterior no puede pisar la del actual; y el
  //    `AbortController` cancela lo que se queda obsoleto o el componente
  //    desaparece;
  //  · el fallo se conserva con su código y su motivo literal: un 404 del
  //    endpoint de valores es una CAUSA, no un «sin datos» genérico.
  const pedirBloque = useCallback(
    (peticion: PeticionBloque, opciones: { forzar?: boolean } = {}): Promise<void> => {
      const clave = claveDeBloque(peticion, codigoINE);
      const endpoint = datos?.dataset?.endpoint ?? null;

      if (!datos || !endpoint) {
        // Sin `dataset.endpoint` no hay contrato de valores. Se dice, en vez de
        // adivinar una ruta que podría no ser la del servidor.
        setBloques((b) => ({
          ...b,
          [clave]: {
            estado: "error",
            status: null,
            error:
              "El bootstrap de este municipio no publica el endpoint de valores (data.dataset.endpoint), " +
              "así que no hay forma correcta de pedir los datos. Es un fallo del contrato, no una ausencia de dato.",
          },
        }));
        return Promise.resolve();
      }

      // La petición es el interés ACTUAL por este dataset, se atienda o no con
      // red. Se declara antes de cualquier salida temprana: volver a un dataset
      // cacheado tiene que volver a pintarlo, y volver a uno en vuelo tiene que
      // poder ganar la carrera a la respuesta que ya venía de antes.
      interesRef.current = clave;

      if (!opciones.forzar && cache.tiene(clave)) {
        // Servido desde la caché: cero red. Se activa y el efecto lo materializa.
        // Se fija ya, sin esperar al efecto: la entrada que se acaba de pedir es
        // la que se va a pintar y no puede salir en el hueco entre medias.
        cache.fijar([clave]);
        setClaveActiva(clave);
        return Promise.resolve();
      }
      // Reintento explícito: se aborta lo que siguiera en vuelo para que su
      // respuesta tardía no se adjudique el estado del intento nuevo.
      const anterior = bloquesEnVuelo.current.get(clave);
      if (anterior && opciones.forzar) {
        anterior.control.abort();
        bloquesEnVuelo.current.delete(clave);
      } else if (anterior) {
        return anterior.promesa;
      }

      if (opciones.forzar) {
        const usados = intentosPorBloque.current.get(clave) ?? 0;
        if (usados >= MAX_INTENTOS_POR_BLOQUE) {
          setBloques((b) => ({
            ...b,
            [clave]: {
              ...(b[clave] ?? { estado: "error" }),
              estado: "error",
              error:
                (b[clave]?.error ??
                  "El bloque no se pudo cargar.") +
                ` Se han agotado los ${MAX_INTENTOS_POR_BLOQUE} reintentos de este bloque: ` +
                "no se insistirá más automáticamente. Recargue la página o cambie de indicador o de año.",
            },
          }));
          return Promise.resolve();
        }
        intentosPorBloque.current.set(clave, usados + 1);
      }

      const control = new AbortController();
      setBloques((b) => ({ ...b, [clave]: { estado: "cargando", periodoClave: null } }));

      const promesa = (async () => {
        try {
          const res = await fetch(urlDeBloque(endpoint, peticion), {
            signal: control.signal,
            headers: { accept: "application/json" },
          });
          const j = (await res.json().catch(() => null)) as RespuestaDataset | null;
          if (!vivos.current) return;
          if (!res.ok || !j?.data) {
            setBloques((b) => ({
              ...b,
              [clave]: {
                estado: "error",
                status: res.status,
                error: causaDeFallo(res.status, j?.error),
              },
            }));
            return;
          }
          // Fail-closed también aquí: si el bloque llega acompañado de un
          // veredicto `ok:false`, no se pega en el atlas ni se pinta.
          if (j.validacion && !j.validacion.ok) {
            setBloques((b) => ({
              ...b,
              [clave]: {
                estado: "error",
                status: res.status,
                error:
                  `El bloque no supera la validación del servidor (${j.validacion?.errores.length ?? 0} ` +
                  `${j.validacion?.errores.length === 1 ? "error" : "errores"}) y no se ha pintado: ` +
                  (j.validacion?.errores ?? []).slice(0, 3).join(" | "),
              },
            }));
            return;
          }
          const bloque = j.data;
          const esBloqueGanadoras = bloque.bloque === "ganadoras";
          if (esBloqueGanadoras) {
            if (bloque.ganadoras) setGanadoras(bloque.ganadoras);
          }
          const meta = bloque.indicador_meta;
          const periodoClave = bloque.periodo_clave;
          // Un bloque de serie sin `indicador_meta` o sin `periodo_clave` no se
          // puede indexar donde la vista lo busca. No se da por bueno: se cuenta
          // como «sin celdas» con el motivo, porque un `ok` sin nada pegado
          // dejaría un plano de contornos sin explicación.
          const indexable = Boolean(meta && periodoClave);
          if (meta && periodoClave) {
            // Se REGISTRA en la caché en forma compacta, con sus bytes medidos.
            // Aquí no se expande: expandirse es trabajo de `materializar`, que
            // solo lo hace con el dataset que la vista está leyendo. Insertar
            // puede expulsar el menos reciente, y esa es la operación que acota
            // la memoria: por eso va antes de decidir nada de la vista.
            cache.insertar(
              crearEntradaCacheDataset({
                ejes: ejesDeBloque(peticion, bloque.codigo_ine || codigoINE),
                serie: bloque.series ?? {},
                indicadorMeta: meta,
                periodoClave,
                nValores: bloque.n_valores,
                nSecciones: bloque.n_secciones,
              }),
            );
          }
          // Solo se materializa lo que sigue interesando. Una respuesta tardía
          // de un dataset que el usuario ya dejó se queda en la caché (compacto,
          // reutilizable) y no desplaza lo que se está pintando.
          if (indexable && interesRef.current === clave) setClaveActiva(clave);
          const nValores = esBloqueGanadoras ? bloque.n_secciones : bloque.n_valores;
          setBloques((b) => ({
            ...b,
            [clave]: {
              estado: nValores > 0 && (esBloqueGanadoras || indexable) ? "ok" : "vacio",
              status: res.status,
              nSecciones: bloque.n_secciones,
              nValores,
              periodoClave: bloque.periodo_clave,
              convocatoriaServida: bloque.convocatoria ?? null,
              error:
                !esBloqueGanadoras && !indexable && nValores > 0
                  ? "El servidor ha servido celdas sin la ficha del indicador ni la clave de periodo con la que indexarlas, " +
                    "así que no se pueden situar sobre la geometría. Se muestran los contornos."
                  : undefined,
            },
          }));
        } catch (e) {
          // Cancelación: no es un fallo, no se escribe estado.
          if (control.signal.aborted || !vivos.current) return;
          setBloques((b) => ({
            ...b,
            [clave]: {
              estado: "error",
              status: null,
              error: `No se pudo contactar con el endpoint de valores: ${
                e instanceof Error ? e.message : "error de red"
              }`,
            },
          }));
        } finally {
          if (bloquesEnVuelo.current.get(clave)?.control === control) {
            bloquesEnVuelo.current.delete(clave);
          }
        }
      })();

      bloquesEnVuelo.current.set(clave, { promesa, control });
      return promesa;
    },
    [datos, codigoINE, cache],
  );

  /** Estado de un bloque, o `undefined` si nunca se ha pedido. Lo consume la
   *  pestaña Política, que pide sus propios bloques con su convocatoria. */
  const estadoDeBloque = useCallback(
    (peticion: PeticionBloque): EstadoBloque | undefined => bloques[claveDeBloque(peticion, codigoINE)],
    [bloques, codigoINE],
  );

  // ── Geometría normalizada ───────────────────────────────────────────────
  const geometria = useMemo(() => normalizarGeometria(datos), [datos]);

  // ── Catálogo y valores por defecto ──────────────────────────────────────
  const atlas = datos?.atlas ?? null;
  const todosLosIndicadores = useMemo<ReadonlyArray<SeccionIndicador>>(() => {
    if (!atlas) return [];
    return [...atlas.indicators].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  }, [atlas]);

  // ── Pestañas por tema ───────────────────────────────────────────────────
  // El atlas agrupa varias operaciones (ADRH de renta/desigualdad y Censo
  // anual de población). Cada pestaña muestra SOLO los indicadores de su tema:
  // así el selector no mezcla unidades ni años de fuentes distintas.
  const gruposDisponibles = useMemo(() => {
    const conIndicadores = GRUPOS_TEMA.filter((g) => todosLosIndicadores.some((i) => g.temas.includes(i.tema)));
    // La pestaña Política aparece siempre que el CATÁLOGO declare alguma
    // convocatoria, aunque este municipio no tenga objeto: es entonces la
    // vía para ver por qué no hay dato, no un hueco invisible.
    const catalogoPolitico = datos?.dominios?.politica?.catalog ?? [];
    if (catalogoPolitico.length > 0 && !conIndicadores.some((g) => g.id === GRUPO_POLITICA)) {
      return [...conIndicadores, GRUPOS_TEMA.find((g) => g.id === GRUPO_POLITICA)!].filter(Boolean);
    }
    return conIndicadores;
  }, [todosLosIndicadores, datos]);
  const grupoActivo = useMemo(() => {
    const g = searchParams.get("g");
    if (g && gruposDisponibles.some((x) => x.id === g)) return g;
    return gruposDisponibles[0]?.id ?? "economico";
  }, [searchParams, gruposDisponibles]);
  // La pestaña Política se resuelve con su propio componente (`SeccionesPoliticaExtension`):
  // el mapa de la ganadora es CATEGÓRICO (color por candidatura) y no cabe en el
  // motor numérico de clases que usan el resto de pestañas. El booleano se declara
  // aquí, antes de la bifurcación del render, para que las pestañas de dominio
  // puedan saber si su `tabpanel` existe.
  const enPestanaPolitica = grupoActivo === GRUPO_POLITICA;
  const indicadores = useMemo<ReadonlyArray<SeccionIndicador>>(() => {
    const temas = GRUPOS_TEMA.find((g) => g.id === grupoActivo)?.temas ?? [];
    return todosLosIndicadores.filter((i) => temas.includes(i.tema));
  }, [todosLosIndicadores, grupoActivo]);

  // Lo que ve la vista: el dataset materializado, o nada. Nunca la suma de
  // todos los datasets visitados.
  const observaciones = useMemo<ObservacionesHidrátadas>(
    () => materializacion?.observaciones ?? {},
    [materializacion],
  );

  // El atlas con los valores HIDRATADOS. Todo lo que lee valores —mapa, tabla,
  // ficha, PNG, cobertura— pasa por aquí en lugar de por `atlas.observations`,
  // que el bootstrap deja vacío. El tipo es el del atlas completo menos
  // `sections`: la geometría se sirve una vez en `data.geojson` y la vista usa
  // esa, así que el atlas no necesita su copia.
  const atlasValores = useMemo<AtlasParaVista | null>(
    () => (atlas ? { ...atlas, observations: observaciones } : null),
    [atlas, observaciones],
  );

  // Catálogo agrupado por dominio con su estado de dato: alimenta a la vez los
  // badges de las pestañas y el listado del buscador, de una sola cuenta.
  //
  // ND: ya no se puede detectar escaneando observaciones, porque el bootstrap
  // las trae vacías y solo se hidrata un dataset a la vez —escanear daría
  // «sin celdas sin dato» a todos menos al visible, que es una mentira en la
  // dirección contraria. Se usa el dato que el bootstrap SÍ publica:
  // `cobertura[].seccionesSinDifundir` de cada indicador. Cuando el bloque del
  // indicador está hidratado, la cobertura manda igual, así que el distintivo no
  // parpadea al pedir el bloque.
  const items = useMemo(() => {
    if (!atlas) return [];
    const base = construirItemsIndicadores(todosLosIndicadores, atlas.cobertura, observaciones);
    const conNd = new Set(
      (atlas.cobertura ?? [])
        .filter((c: SeccionIndicadorCobertura) => (c.seccionesSinDifundir ?? 0) > 0)
        .map((c: SeccionIndicadorCobertura) => c.indicatorId),
    );
    return base.map((item) =>
      item.estado !== "no" && conNd.has(item.indicador.id) ? { ...item, estado: "nd" as const } : item,
    );
  }, [todosLosIndicadores, atlas, observaciones]);

  const conteos = useMemo(() => conteosPorGrupo(items), [items]);

  const indicadorPorDefecto = useMemo(() => {
    // Indicador inicial por tema: el de referencia del producto en económico y
    // población, y el que la propia fuente señala como principal en Educación
    // (% de educación superior) y Actividad (% de población ocupada). No el
    // primero alfabético: mezclaría denominadores distintos.
    const PREFERIDO: Record<string, string> = {
      demografia: "poblacion_total",
      economico: "renta_neta_media_persona",
      educacion: "edu_pct_educacion_superior",
      laboral: "act_pct_ocupados",
    };
    const preferidoId = PREFERIDO[grupoActivo] ?? PREFERIDO.economico;
    const preferido = indicadores.find(
      (i) => i.id === preferidoId && i.publicadoPorSeccion,
    );
    const conDato = indicadores.find((i) => i.publicadoPorSeccion && (atlas?.cobertura ?? []).some((c) => c.indicatorId === i.id && c.seccionesConDato > 0));
    const publicado = indicadores.find((i) => i.publicadoPorSeccion);
    return (preferido ?? conDato ?? publicado ?? indicadores[0])?.id ?? null;
  }, [indicadores, grupoActivo, atlas]);

  const periodosDe = useCallback(
    (indicatorId: string | null): number[] => {
      if (!atlas || !indicatorId) return [];
      const cob = atlas.cobertura.find((c) => c.indicatorId === indicatorId);
      if (cob && cob.periodos.length) return [...cob.periodos].sort((a, b) => b - a);
      // Sin entrada de cobertura no hay periodos que ofrecer. Antes se deducían
      // del diccionario de observaciones; ya no existe uno en el bootstrap, y
      // derivarlos de los bloques YA hidratados crearía un ciclo: cargar un
      // bloque cambiaría el conjunto de años, que cambiaría el año efectivo,
      // que volvería a pedir el bloque. Con la cobertura no hay ciclo: es un
      // dato del servidor, fijo para todo el municipio. Un indicador sin
      // cobertura tampoco es seleccionable: el buscador lo marca «no disponible».
      return [];
    },
    [atlas],
  );

  const anioPorDefecto = useCallback(
    (indicatorId: string | null): number | null => {
      if (!atlas || !indicatorId) return null;
      const porDefecto = atlas.cobertura.find((c) => c.indicatorId === indicatorId)?.periodoPorDefecto ?? null;
      const periodos = periodosDe(indicatorId);
      if (porDefecto !== null && periodos.includes(porDefecto)) return porDefecto;
      return periodos[0] ?? null;
    },
    [atlas, periodosDe],
  );

  // ── Lectura de la URL, validada contra el catálogo ──────────────────────
  const params = useMemo(() => {
    const bruto = {
      ind: searchParams.get("ind"),
      anio: searchParams.get("anio"),
      modo: searchParams.get("modo"),
      clases: searchParams.get("clases"),
      sec: searchParams.get("sec"),
      g: searchParams.get("g"),
    };
    const indicatorId = indicadores.some((i) => i.id === bruto.ind) ? (bruto.ind as string) : indicadorPorDefecto;
    const periodos = periodosDe(indicatorId);
    const anioNum = Number(bruto.anio);
    const anio = periodos.includes(anioNum) ? anioNum : anioPorDefecto(indicatorId);
    const modo: ModoClasificacion =
      bruto.modo === "intervalos_iguales" ||
      bruto.modo === "cortes_manuales" ||
      bruto.modo === "cuantil" ||
      // `jenks` es un modo del contrato y `clasificar()` lo implementa. Sin
      // esta rama la leyenda ofrecía Jenks pero la URL lo rechazaba y volvía
      // a cuantiles: el método era inaplicable desde el enlace.
      bruto.modo === "jenks"
        ? bruto.modo
        : MODO_POR_DEFECTO;
    const clasesNum = Number(bruto.clases);
    const clases =
      Number.isInteger(clasesNum) && clasesNum >= CLASES_MINIMO && clasesNum <= CLASES_MAXIMO
        ? clasesNum
        : CLASES_POR_DEFECTO;
    const sec = isValidSeccionKey(bruto.sec) ? (bruto.sec as string) : null;
    return {
      indicatorId,
      anio,
      modo,
      clases,
      sec,
      periodos,
      // Qué parámetros no cuadran con el catálogo: se limpian de la URL.
      sucios: {
        ind: bruto.ind !== null && bruto.ind !== indicatorId,
        anio: bruto.anio !== null && String(anio) !== bruto.anio,
        modo: bruto.modo !== null && bruto.modo !== modo,
        clases: bruto.clases !== null && String(clases) !== bruto.clases,
        g: bruto.g !== null && bruto.g !== grupoActivo,
      },
    };
  }, [searchParams, indicadores, indicadorPorDefecto, periodosDe, anioPorDefecto, grupoActivo]);

  const urlDesde = useCallback(
    (parche: {
      ind?: string | null;
      anio?: number | null;
      modo?: ModoClasificacion;
      clases?: number | null;
      sec?: string | null;
      g?: string | null;
    }) => {
      const p = new URLSearchParams();
      const ind = parche.ind !== undefined ? parche.ind : params.indicatorId;
      const anio = parche.anio !== undefined ? parche.anio : params.anio;
      const modo = parche.modo !== undefined ? parche.modo : params.modo;
      const clases = parche.clases !== undefined ? parche.clases : params.clases;
      const sec = parche.sec !== undefined ? parche.sec : params.sec;
      const g = parche.g !== undefined ? parche.g : grupoActivo;
      if (g) p.set("g", g);
      if (ind) p.set("ind", ind);
      if (anio !== null && anio !== undefined) p.set("anio", String(anio));
      if (modo !== MODO_POR_DEFECTO) p.set("modo", modo);
      if (clases !== CLASES_POR_DEFECTO) p.set("clases", String(clases));
      if (sec) p.set("sec", sec);
      const qs = p.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname, grupoActivo],
  );

  const escribirParams = useCallback(
    (parche: Parameters<typeof urlDesde>[0]) =>
      iniciarTransicion(() => router.replace(urlDesde(parche), { scroll: false })),
    [router, urlDesde],
  );

  /** Cambio de dominio temático desde las pestañas.
   *
   *  Escribe con el MISMO helper que el resto de la lectura de estado, así que
   *  conserva `modo`, `clases` y `sec` y descarta lo que no cruza de dominio:
   *  `ind` y `anio` son de otro catálogo y de otros periodos, así que se
   *  vacían EN EL MISMO parche. Si se dejaran, el efecto de limpieza de
   *  parámetros vería `sucios.ind`/`sucios.anio` y dispararía un segundo
   *  `router.replace` para quitar lo que este parche ya previó.
   *
   *  Un grupo que no está disponible en este municipio no escribe nada: la
   *  pestaña llega aquí deshabilitada, pero el guard evita que un `g` que
   *  `grupoActivo` va a rechazar acabe en la URL. */
  const cambiarDominio = useCallback(
    (grupoId: string) => {
      if (grupoId === grupoActivo) return;
      if (!gruposDisponibles.some((x) => x.id === grupoId)) return;
      escribirParams({ g: grupoId, ind: null, anio: null });
    },
    [grupoActivo, gruposDisponibles, escribirParams],
  );

  // Limpieza de parámetros inválidos: una sola pasada, sin bucles.
  //
  // Solo se limpia cuando el catálogo ya está disponible. Antes de eso
  // `params` no puede validar nada (no hay indicadores ni periodos), y
  // borraría un enlace profundo válido como `?ind=…&anio=…` en el primer
  // render, antes de que llegue el atlas.
  const haySucios = estado === "ok" && Object.values(params.sucios).some(Boolean);
  const urlCanonica = urlDesde({});
  useEffect(() => {
    if (haySucios) router.replace(urlCanonica, { scroll: false });
  }, [haySucios, router, urlCanonica]);

  // ── Carga del bloque visible ────────────────────────────────────────────
  //
  // Se dispara al montar y al cambiar de indicador o de periodo. La
  // GEOMETRÍA no se vuelve a pedir: eso es el bootstrap, y ya está en `datos`.
  //
  // El disparador es un objeto memorizado cuyas dependencias son SÓLO datos del
  // servidor y del catálogo (indicador y año). Los estados de bloque, los valores
  // hidratados y el reintento manual NO dependen del disparador, así que pedir un
  // bloque no puede volver a dispararlo: no hay bucle. Y cambiar de periodo tres
  // veces son tres peticiones, una por clave; volver a un año ya pedido no pide
  // nada, porque la caché de cliente responde.
  const validacionFalla = validacion !== null && !validacion.ok;
  const peticionVisible = useMemo<PeticionBloque | null>(() => {
    if (estado !== "ok" || !datos) return null;
    // En la pestaña Política quien pide los valores es SU componente, con la
    // clave de periodo que le corresponde —la convocatoria, no el año—. Pedirlo
    // aquí además duplicaría la petición con una clave distinta, y el bloque
    // indexado por fecha no es el que el motor numérico indexa por año.
    if (enPestanaPolitica) return null;
    if (!params.indicatorId || params.anio === null) return null;
    const ind = todosLosIndicadores.find((i) => i.id === params.indicatorId);
    if (!ind) return null;
    return { dominio: dominioDeIndicador(ind), indicadorId: ind.id, periodo: params.anio };
  }, [estado, datos, enPestanaPolitica, params.indicatorId, params.anio, todosLosIndicadores]);
  const claveVisible = peticionVisible ? claveDeBloque(peticionVisible, codigoINE) : null;
  const estadoVisible = claveVisible ? bloques[claveVisible] : undefined;

  useEffect(() => {
    // Fail-closed: con la validación del servidor en `ok:false` el atlas no es
    // publicable y sus valores tampoco. Se dice arriba y no se pide nada: pedir
    // valores de una fuente que no valida sería pintar lo que se acaba de decir
    // que no se pinta.
    if (!peticionVisible || validacionFalla) return;
    void pedirBloque(peticionVisible);
  }, [peticionVisible, validacionFalla, pedirBloque]);

  // ── Modelo de vista ─────────────────────────────────────────────────────
  const opcionesClasificacion = useMemo(
    () => ({ cortesManuales: presentacion.cortesManuales, divergente: presentacion.divergente }),
    [presentacion.cortesManuales, presentacion.divergente],
  );

  // Un bloque que no ha resuelto todavía no es «el municipio no tiene datos»:
  // la vista tiene que distinguirlo, o pinta una escala de color vacía. Con la
  // validación en `ok:false` no hay nada que esperar —no se va a pedir—, así que
  // ahí no se habla de «cargando»: se habla de que la fuente no es publicable,
  // y lo dice el aviso de bloque y el error de la cabecera.
  const valoresEnCarga =
    !validacionFalla &&
    (claveVisible === null || estadoVisible === undefined || estadoVisible.estado === "cargando");

  const vista_ = useMemo(
    () =>
      construirVista(
        atlasValores,
        geometria,
        nombre,
        params.indicatorId,
        params.anio,
        params.modo,
        params.clases,
        opcionesClasificacion,
        valoresEnCarga,
      ),
    [
      atlasValores,
      geometria,
      nombre,
      params.indicatorId,
      params.anio,
      params.modo,
      params.clases,
      opcionesClasificacion,
      valoresEnCarga,
    ],
  );

  const seleccion = useMemo(
    () => (params.sec && vista_.filas.some((f) => f.key === params.sec) ? params.sec : null),
    [params.sec, vista_.filas],
  );

  // Avisos del servidor (`data.avisos`: lo que la ingesta declara sobre este
  // municipio) primero, y los de la vista después. Se deduplican por texto
  // porque la cabecera los usa como clave de React.
  const avisosCabecera = useMemo(
    () => [...new Set([...(datos?.avisos ?? []), ...vista_.avisos])],
    [datos?.avisos, vista_.avisos],
  );

  // Una selección que ya no existe (cambió la geometría) se retira de la URL
  // en lugar de quedar apuntando a la nada.
  const haySecHuerfana = Boolean(params.sec) && !seleccion;
  useEffect(() => {
    if (haySecHuerfana) escribirParams({ sec: null });
  }, [haySecHuerfana, escribirParams]);

  const indicador = useMemo(
    () => indicadores.find((i) => i.id === params.indicatorId) ?? null,
    [indicadores, params.indicatorId],
  );

  // ── Exportación PNG ─────────────────────────────────────────────────────
  const esperarMapa = useCallback(async (): Promise<boolean> => {
    const limite = Date.now() + MS_ESPERA_MAPA;
    while (Date.now() < limite) {
      if (mapaRef.current?.puedeCapturar()) return true;
      await new Promise<void>((r) => window.setTimeout(r, 120));
    }
    return false;
  }, []);

  const exportarVista = useCallback(
    async (plano: boolean) => {
      setExportError(null);
      setExportNotice(plano ? "Componiendo el plano de secciones…" : "Componiendo el mapa…");
      setExportando(true);
      try {
        // Si el usuario está en la vista de tabla el mapa no está montado: se
        // vuelve a la vista de mapa y se espera a que Leaflet esté listo.
        if (vista !== "mapa") setVista("mapa");
        await new Promise<void>((r) => window.setTimeout(r, 0));
        if (!(await esperarMapa())) {
          throw new Error("El mapa no ha podido inicializarse a tiempo. Vuelva a la vista de mapa e inténtelo de nuevo.");
        }
        const handle = mapaRef.current;
        if (!handle) throw new Error("El mapa todavía no está listo.");

        const escalaPng = presentacion.escalaPng as EscalaPng;
        const captura = await handle.capturarParaPng(escalaPng);
        const enlazado = await componerPngMapa({
          base: captura.canvas,
          indicador: plano
            ? "Plano de secciones · sin indicadores cargados"
            : (indicador?.etiqueta ?? "Sin indicadores cargados"),
          municipio: nombre,
          provincia: atlas?.provinceName ?? null,
          anio: plano ? null : params.anio,
          unidad: plano ? "" : (indicador?.unidad ?? ""),
          modoClasificacion: plano ? "Sin clasificación" : etiquetaModo(params.modo),
          clasificacion: plano ? null : vista_.clasificacion,
          entradasLeyenda: vista_.entradasLeyenda.map((e) => ({
            etiqueta: e.etiqueta,
            color: e.color,
            secciones: e.secciones,
            esSinDato: Boolean(e.esSinDato),
          })),
          colorSinDato: COLOR_SIN_DATO,
          colorContornoSinDato: COLOR_CONTORNO_SIN_DATO,
          fuente: atlas?.geometrySource ?? datos?.fuente ?? SECCIONES_ATRIBUCION,
          // `operationLabel` ya incluye el rótulo de la operación con su ID, así
          // que aquí solo se antepone la tabla: concatenarlo dos veces duplicaba
          // "(operación …) (operación …)" en el pie del PNG.
          tabla: plano
            ? "Sin indicadores cargados en SOCideas: solo geometría oficial del INE"
            : indicador
              ? `${indicador.sourceTable} · ${indicador.operationLabel}`
              : "No consta: el municipio no tiene indicadores publicados por sección",
          urlTabla: indicador?.url ?? null,
          anioGeometria: atlas?.geometryYear ?? datos?.anio_delimitacion ?? null,
          coleccionGeometria: atlas?.geometryCollection ?? null,
          periodo: plano ? null : params.anio,
          fechaGeometria: atlas?.geometryRetrievedAt ?? null,
          fechaEstadistica: atlas?.statsRetrievedAt ?? null,
          seccionesRepresentadas: vista_.nConDato,
          seccionesTotales: vista_.nSecciones,
          seccionesSinDato: vista_.nSinDato,
          coberturaPct: vista_.coberturaPct,
          escala: escalaPng,
          baseOmitida: captura.baseOmitida,
          // El PNG es un documento: solo lleva el desfase temporal, que afecta a
          // la lectura del dato. Los avisos internos de ingestión se omiten aquí
          // (siguen en la ficha y en el XLSX) para no convertir el pie en un
          // volcado técnico.
          avisos: vista_.avisos.filter((a) => /desfase temporal/i.test(a)),
          notaLectura: plano ? null : vista_.descripcionMapa,
        });
        const blob = await blobDeLienzo(enlazado);
        if (!blob) throw new Error("El navegador no ha podido generar el archivo PNG.");
        const archivo = plano
          ? nombreArchivoPngSecciones(codigoINE, "plano-secciones", atlas?.geometryYear ?? datos?.anio_delimitacion ?? null)
          : nombreArchivoPngSecciones(codigoINE, params.indicatorId ?? "sin-indicador", params.anio);
        descargar(blob, archivo);
        setExportNotice(
          plano
            ? `${archivo} descargado: plano del seccionado, sin valores. No es una coropleta.`
            : captura.baseOmitida
              ? `${archivo} descargado SIN cartografía de fondo. ${captura.motivoBaseOmitida ?? ""} Se conservan seccionado, escala, leyenda, fuente y atribuciones.`
              : `${archivo} descargado con la leyenda completa y las atribuciones del INE y de OpenStreetMap.`,
        );
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "No se ha podido generar el PNG.");
      } finally {
        setExportando(false);
      }
    },
    [
      atlas,
      codigoINE,
      datos,
      esperarMapa,
      indicador,
      nombre,
      params.anio,
      params.indicatorId,
      params.modo,
      presentacion.escalaPng,
      vista,
      vista_,
    ],
  );

  const exportarPng = useCallback(() => exportarVista(false), [exportarVista]);
  const exportarPlano = useCallback(() => exportarVista(true), [exportarVista]);

  const restablecer = useCallback(() => {
    setPresentacion({ ...PRESENTACION_POR_DEFECTO });
    setHovered(null);
    setExportError(null);
    setExportNotice(null);
    router.replace(urlDesde({ sec: null, modo: MODO_POR_DEFECTO, clases: CLASES_POR_DEFECTO }), { scroll: false });
  }, [router, urlDesde]);

  const featuresGeo: GeoJsonFeatureLike[] = useMemo(
    () => geometria.secciones.map((f) => ({ key: f.properties.CUSEC, geometry: f.geometry })),
    [geometria.secciones],
  );

  /** Vuelve a la vista de mapa (si hace falta) y acerca a una sección. */
  const irASeccion = useCallback(
    (key: string) => {
      if (vista !== "mapa") setVista("mapa");
      window.setTimeout(() => mapaRef.current?.ajustarVistaSeccion(key), 60);
    },
    [vista],
  );

  // ── Estados previos a la carga ──────────────────────────────────────────
  if (estado === "idle") {
    return (
      <div className="ideas-status" data-state="pending">
        <div className="ideas-status__head">
          <p className="ideas-status__title">Geometría bajo demanda</p>
          <span className="ideas-status__badge">Pendiente</span>
        </div>
        <div className="ideas-status__body">
          <p>
            La geometría oficial de secciones (INE) y, si están publicados, los indicadores con dato a
            ese grano se cargan solo para este municipio cuando usted lo solicita. No se descarga
            ninguna capa nacional.
          </p>
          <button type="button" onClick={cargar} className={`${BOTON_PRINCIPAL} mt-4`}>
            Cargar secciones de {nombre}
          </button>
        </div>
      </div>
    );
  }

  if (estado === "cargando") {
    return (
      <div role="status" className="ideas-status flex items-center gap-3" data-state="pending">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 flex-none animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--moss-ink)] motion-reduce:animate-none"
        />
        <p className="type-body-sm text-[var(--text-secondary)]">Cargando secciones oficiales de {nombre}…</p>
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="ideas-status" data-state="error" role="alert">
        <div className="ideas-status__head">
          <p className="ideas-status__title">No se pudieron cargar las secciones</p>
          <span className="ideas-status__badge">No disponible</span>
        </div>
        <div className="ideas-status__body">
          <p>{error}</p>
          <button type="button" onClick={cargar} className={`${BOTON_PRINCIPAL} mt-4`}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const sinAtlas = !atlas;
  // Pestañas de dominio: por ENCIMA de la bifurcación entre Política y el motor
  // numérico. Antes vivían dentro del panel lateral, así que al entrar en
  //  Política desaparecían y no había forma de volver sin editar la URL. Al
  //  subir aquí, el nodo de la pestaña enfocada sobrevive al cambio de
  //  contenido y el foco se conserva.
  //
  //  Sin catálogo no hay nada que cambiar de dominio y todas las pestañas
  //  quedarían en 0: no se pintan.
  const pestanasDominio = atlas ? (
    <SeccionesDominioTabs
      idBase={idDominios}
      // En Política el `tabpanel` de indicadores no existe: apuntar a él sería
      // un `aria-controls` colgado.
      panelId={enPestanaPolitica ? undefined : `${idDominios}-panel`}
      grupoActivo={grupoActivo}
      gruposDisponibles={gruposDisponibles}
      conteos={conteos}
      onGrupo={cambiarDominio}
    />
  ) : null;

  // Aviso de carga o de fallo del bloque VISIBLE. Sin él, un mapa que aún no
  // tiene valores y un mapa de un municipio sin valores se ven idénticos, y lo
  // segundo se lee como un fallo del primero.
  const avisoBloqueVisible =
    !enPestanaPolitica && peticionVisible
      ? <AvisoCargaBloque
          estado={estadoVisible}
          bloqueado={validacionFalla}
          indicador={indicador?.etiqueta ?? peticionVisible.indicadorId}
          periodo={peticionVisible.periodo ?? null}
          municipioNombre={nombre}
          reintentos={intentosPorBloque.current.get(claveVisible ?? "") ?? 0}
          reintentosMax={MAX_INTENTOS_POR_BLOQUE}
          onReintentar={() => void pedirBloque(peticionVisible, { forzar: true })}
        />
      : null;

  if (enPestanaPolitica) {
    return (
      <div className="flex flex-col gap-8">
        {pestanasDominio}
        <SeccionesPoliticaExtension
          codigoINE={codigoINE}
          nombre={nombre}
          catalog={datos?.dominios?.politica?.catalog ?? []}
          eleccionInicial={datos?.dominios?.politica?.electionId ?? ""}
          observaciones={observaciones}
          ganadoras={ganadoras}
          pedirBloque={pedirBloque}
          estadoDeBloque={estadoDeBloque}
        />
      </div>
    );
  }

  const sinPeriodos = sinAtlas || params.periodos.length === 0;
  // Sin valores observados no hay coropleta que dibujar ni exportar: el mapa es
  // un plano de contornos y los controles de escala se retiran. Estar AÚN
  // CARGANDO no es lo mismo que no haber nada: por eso el estado del bloque se
  // dice aparte y no se disables nada por estar cargando.
  const sinValoresObservados = vista_.modoMapa === "plano" || vista_.nConDato === 0;
  const filaSeleccionada = seleccion ? (vista_.filas.find((f) => f.key === seleccion) ?? null) : null;

  // El desfase temporal solo se declara cuando AMBOS años constan y difieren.
  // Nunca se infiere a partir de un indicador con otro periodo.
  const anioGeometria = atlas?.geometryYear ?? datos?.anio_delimitacion ?? null;
  const avisoDeDesfase =
    anioGeometria !== null && params.anio !== null && anioGeometria !== params.anio
      ? `Desfase temporal: la geometría es de ${anioGeometria} y el dato es de ${params.anio}. No son contemporáneos.`
      : null;

  return (
    <div className="flex flex-col gap-8">
      {pestanasDominio}
      <CabeceraAtlas
        municipioNombre={nombre}
        provincia={atlas?.provinceName ?? null}
        geometriaYear={atlas?.geometryYear ?? datos?.anio_delimitacion ?? null}
        fuente={datos?.fuente ?? SECCIONES_ATRIBUCION}
        nSecciones={vista_.nSecciones}
        nConDato={vista_.nConDato}
        nSinDato={vista_.nSinDato}
        nAgregados={geometria.agregadosDistrito.length}
        nDescartadas={geometria.descartadas.length}
        coberturaPct={vista_.coberturaPct}
        indicadorEtiqueta={indicador?.etiqueta ?? null}
        anio={params.anio}
        avisos={avisosCabecera}
        sinAtlas={sinAtlas}
        plano={sinValoresObservados}
        validacion={validacion}
        validacionAusente={validacionAusente}
      />

      {avisoBloqueVisible}


      {sinAtlas && (
        <div className="ideas-status" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">Todavía no hemos cargado los indicadores de {nombre}</p>
            <span className="ideas-status__badge">Solo contornos</span>
          </div>
          <div className="ideas-status__body">
            <p>
              La geometría oficial del INE está disponible ({vista_.nSecciones} secciones). Lo que falta
              es la estadística por sección: aún no se ha cargado en SOCideas para este municipio. Es un
              estado de carga, no una afirmación de que el INE no publique el indicador a escala de
              sección. Se muestran los contornos y las claves oficiales; no se pinta ninguna escala de
              color porque no hay valores que repartir, y una coropleta sin dato sería una imagen
              inventada.
            </p>
          </div>
        </div>
      )}

      {!sinAtlas && sinPeriodos && (
        <div className="ideas-status" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">Este indicador no tiene periodos publicados aquí</p>
            <span className="ideas-status__badge">Sin escala</span>
          </div>
          <div className="ideas-status__body">
            <p>
              La fuente difunde «{indicador?.etiqueta}», pero no publica ningún periodo con dato a
              nivel de sección para {nombre}. Se muestran los contornos y el estado de cada sección; no
              se proyecta ningún año sobre la geometría.
            </p>
          </div>
        </div>
      )}

      {/* Maquetación: el mapa manda. En escritorio, mapa y tabla a la izquierda
          y panel lateral fijo a la derecha; en móvil, el panel se apila bajo el
          mapa y la tabla queda al final. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Vista principal"
              className="inline-flex overflow-hidden rounded-[6px] border border-[var(--border-default)]"
            >
              <BotonVista activo={vista === "mapa"} onClick={() => setVista("mapa")}>
                Mapa
              </BotonVista>
              <BotonVista activo={vista === "tabla"} onClick={() => setVista("tabla")} separado>
                Tabla de secciones
              </BotonVista>
            </div>
          </div>

          {vista === "mapa" ? (
            /* Leyenda SIEMPRE debajo del mapa y fuentes debajo de la leyenda:
               nunca hay columna lateral para la leyenda. */
            <div className="flex flex-col">
              <div className="relative min-w-0">
                <SeccionesAtlasMap
                  ref={mapaRef}
                  features={featuresGeo}
                  filas={vista_.filas}
                  municipioNombre={nombre}
                  tituloLeyenda={vista_.tituloLeyenda}
                  subtituloLeyenda={vista_.subtituloLeyenda}
                  entradasLeyenda={vista_.entradasLeyenda}
                  descripcion={vista_.descripcionMapa}
                  presentacion={presentacion}
                  seleccion={seleccion}
                  hovered={hovered}
                  onSeleccionar={(key) => escribirParams({ sec: key })}
                  onHover={setHovered}
                  sinLeyenda
                />
                {aplicando && (
                  <div
                    role="status"
                    className="absolute inset-0 z-[800] flex items-center justify-center bg-[var(--bg-canvas)]/80"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--moss-ink)] motion-reduce:animate-none"
                    />
                    <span className="sr-only">Aplicando indicador…</span>
                  </div>
                )}
              </div>
              <SectionLegend
                titulo={indicador?.etiqueta ?? vista_.tituloLeyenda}
                unidad={indicador?.unidad ?? ""}
                anio={params.anio}
                entradas={vista_.entradasLeyenda}
                modo={params.modo}
                onModo={(m) => escribirParams({ modo: m })}
                sinValores={sinValoresObservados}
              />

              {indicador && !sinValoresObservados ? (
                <SectionMeta
                  indicador={indicador.etiqueta}
                  unidad={indicador.unidad}
                  organismo={ORGANISMO_ESTADISTICA}
                  operacion={indicador.operation}
                  operacionEtiqueta={indicador.operationLabel}
                  tabla={indicador.sourceTable}
                  tablaEtiqueta={indicador.sourceLabel}
                  urlIneBase={indicador.url}
                  universo={indicador.universo || null}
                  definicion={indicador.definicion || null}
                  geometriaYear={atlas?.geometryYear ?? datos?.anio_delimitacion ?? null}
                  geometriaColeccion={atlas?.geometryCollection ?? null}
                  geometriaFuente={atlas?.geometrySource ?? datos?.fuente ?? null}
                  geometriaConsultada={atlas?.geometryRetrievedAt ?? null}
                  geometriaCrs={atlas?.geometryCrs ?? null}
                  periodo={params.anio}
                  fechaEstadistica={atlas?.statsRetrievedAt ?? null}
                  nSecciones={vista_.nSecciones}
                  nConDato={vista_.nConDato}
                  nSinDato={vista_.nSinDato}
                  coberturaPct={vista_.coberturaPct}
                  basemapProveedor={BASEMAP_PROVEEDOR}
                  basemapAtribucion={BASEMAP_ATRIBUCION}
                  basemapLicencia={BASEMAP_LICENCIA}
                  basemapUrl={BASEMAP_URL}
                  desfase={avisoDeDesfase}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <aside
          id="atlas-panel"
          aria-label="Controles del atlas"
          className="min-w-0 border-t border-[var(--border-strong)] pt-5 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          <SeccionesAtlasPanel
            codigoINE={codigoINE}
            selectorIndicador={
              atlas ? (
                <SeccionesIndicadorBuscador
                  codigoINE={codigoINE}
                  municipioNombre={nombre}
                  idBase={idDominios}
                  items={items}
                  conteos={conteos}
                  indicadorId={params.indicatorId}
                  grupoActivo={grupoActivo}
                  cargando={aplicando}
                  onSeleccionar={(ind, g) => escribirParams({ g, ind: ind.id, anio: null })}
                />
              ) : undefined
            }
            indicadores={indicadores}
            indicadorId={params.indicatorId}
            periodos={params.periodos}
            anio={params.anio}
            modo={params.modo}
            clases={params.clases}
            presentacion={presentacion}
            sinIndicadores={sinPeriodos}
            plano={sinValoresObservados}
            avisoCortes={avisoDeCortes(
              presentacion.cortesManuales ? presentacion.cortesManuales.join(", ") : "",
              params.modo === "cortes_manuales",
            )}
            exporting={exportando}
            exportError={exportError}
            exportNotice={exportNotice}
            onIndicador={(id) => escribirParams({ ind: id })}
            onAnio={(a) => escribirParams({ anio: a })}
            onModo={(m) => escribirParams({ modo: m })}
            onClases={(c) => escribirParams({ clases: c })}
            onPresentacion={(patch) => setPresentacion((p) => ({ ...p, ...patch }))}
            onRestablecer={restablecer}
            onExportarPng={exportarPng}
            onExportarPlano={exportarPlano}
            ajustesAbiertos={panelAbierto}
            onAlternarAjustes={() => setPanelAbierto((v) => !v)}
            urlXlsx={
              atlas
                ? `/api/socideas/secciones-descarga/${codigoINE}` +
                  (params.indicatorId ? `?ind=${encodeURIComponent(params.indicatorId)}` : '') +
                  (params.anio ? `&anio=${params.anio}` : '')
                : null
            }
            lectura={
              <>
                <SeccionesAtlasDetalle
                  fila={filaSeleccionada}
                  indicador={indicador}
                  municipioNombre={nombre}
                  anio={params.anio}
                  unidad={indicador?.unidad ?? ""}
                  geometryYear={atlas?.geometryYear ?? datos?.anio_delimitacion ?? null}
                  referenciaMunicipal={vista_.referenciaMunicipal}
                  escalaSimple={vista_.escalaSimple}
                  valoresDistintos={vista_.valoresDistintos}
                  onAcercar={irASeccion}
                  onQuitar={() => escribirParams({ sec: null })}
                />
              </>
            }
          />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <SeccionesAtlasTable
            filas={vista_.filas}
            entradasLeyenda={vista_.entradasLeyenda}
            indicadorEtiqueta={indicador?.etiqueta ?? "Sin indicadores cargados"}
            municipioNombre={nombre}
            anio={params.anio}
            unidad={indicador?.unidad ?? ""}
            coberturaPct={vista_.coberturaPct}
            referenciaMunicipal={vista_.referenciaMunicipal}
            seleccion={seleccion}
            hovered={hovered}
            onSeleccionar={(key) => escribirParams({ sec: key })}
            onHover={setHovered}
            onAcercar={irASeccion}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de la respuesta del proxy
// ─────────────────────────────────────────────────────────────────────────────

interface GeometriaNormalizada {
  secciones: SeccionFeature[];
  /** Polígonos agregados de distrito (CSEC 000): NO son secciones. */
  agregadosDistrito: string[];
  /** Polígonos sin CUSEC válido o sin geometría: se cuentan, no se pintan. */
  descartadas: string[];
}

function normalizarGeometria(datos: RespuestaApi["data"]): GeometriaNormalizada {
  const secciones: SeccionFeature[] = [];
  const agregadosDistrito: string[] = [];
  const descartadas: string[] = [];
  for (const f of datos?.geojson?.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const cusec = String(p.CUSEC ?? "").trim();
    if (!isValidSeccionKey(cusec) || !f.geometry) {
      descartadas.push(cusec || "(sin CUSEC)");
      continue;
    }
    if (esPoligonoDistrito(cusec)) {
      agregadosDistrito.push(cusec);
      continue;
    }
    secciones.push({
      type: "Feature",
      properties: {
        CUSEC: cusec,
        CSEC: String(p.CSEC ?? cusec.slice(7)),
        CDIS: String(p.CDIS ?? cusec.slice(5, 7)),
        CUDIS: String(p.CUDIS ?? cusec.slice(5)),
        CUMUN: String(p.CUMUN ?? cusec.slice(0, 5)),
        CMUN: String(p.CMUN ?? ""),
        CPRO: String(p.CPRO ?? cusec.slice(0, 2)),
        NMUN: String(p.NMUN ?? ""),
        NPRO: String(p.NPRO ?? ""),
        TIPO: p.TIPO === null || p.TIPO === undefined ? null : String(p.TIPO),
      },
      geometry: f.geometry,
    });
  }
  secciones.sort((a, b) => a.properties.CUSEC.localeCompare(b.properties.CUSEC));
  return { secciones, agregadosDistrito, descartadas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de vista del atlas
// ─────────────────────────────────────────────────────────────────────────────

interface VistaAtlas {
  filas: FilaAtlas[];
  entradasLeyenda: EntradaLeyendaAtlas[];
  clasificacion: ResultadoClasificacion | null;
  valoresDistintos: number;
  escalaSimple: boolean;
  nSecciones: number;
  nConDato: number;
  nSinDato: number;
  coberturaPct: number;
  referenciaMunicipal: number | null;
  tituloLeyenda: string;
  subtituloLeyenda: string;
  descripcionMapa: string;
  avisos: string[];
  /** `coropleta`: hay valores observados que pintar. `plano`: solo contornos,
   *  sin relleno ni trama porque no hay nada que representar. */
  modoMapa: "coropleta" | "plano";
}

const MOTIVO_NO_CARGADO = "Todavía no cargado en SOCideas";
const MOTIVO_SIN_SELECCION = "Sin indicador seleccionado";
const MOTIVO_SIN_PERIODO = "Sin periodo publicado para este indicador";
const MOTIVO_CARGANDO = "Cargando los valores";

function construirVista(
  atlas: AtlasParaVista | null,
  geometria: GeometriaNormalizada,
  municipioNombre: string,
  indicatorId: string | null,
  anio: number | null,
  modo: ModoClasificacion,
  clases: number,
  opciones: { cortesManuales: number[] | null; divergente: boolean },
  cargandoValores: boolean,
): VistaAtlas {
  const secciones = geometria.secciones;
  const nSecciones = secciones.length;
  const indicador = atlas && indicatorId ? (atlas.indicators.find((i) => i.id === indicatorId) ?? null) : null;
  const unidad = indicador?.unidad ?? "";
  const avisos: string[] = [];

  // Estado «plano»: no hay NADA que pintar (municipio sin cargar, sin indicador
  // o sin periodo). Se dibujan solo los contornos —sin relleno ni trama— y la
  // leyenda no finge una escala. Es distinto de ND, que es ausencia acreditada
  // de valor para un indicador concreto y sí lleva trama por polígono.
  const plano = (
    motivo: string,
    textoFila: string,
    titulo: string,
    subtitulo: string,
    descripcion: string,
    aviso: string,
  ): VistaAtlas => ({
    filas: secciones.map((f) => filaVacia(f, motivo, textoFila)),
    entradasLeyenda: [],
    clasificacion: null,
    valoresDistintos: 0,
    escalaSimple: true,
    nSecciones,
    nConDato: 0,
    nSinDato: nSecciones,
    coberturaPct: 0,
    referenciaMunicipal: null,
    tituloLeyenda: titulo,
    subtituloLeyenda: subtitulo,
    descripcionMapa: descripcion,
    avisos: [aviso],
    modoMapa: "plano",
  });

  if (!atlas) {
    return plano(
      MOTIVO_NO_CARGADO,
      "Sin indicadores cargados",
      "Seccionado sin indicadores cargados",
      "Solo contornos. Los indicadores de este municipio todavía no se han cargado en SOCideas.",
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. No se representa ningún valor porque los indicadores aún no se han cargado en SOCideas para este municipio. Es un estado de CARGA, no una afirmación de que el INE no los publique.`,
      "Indicadores todavía no cargados en SOCideas: el mapa muestra solo los contornos, sin valores.",
    );
  }

  if (!indicador) {
    return plano(
      MOTIVO_SIN_SELECCION,
      "Sin indicador seleccionado",
      "Seccionado sin indicador seleccionado",
      "Elija un indicador del catálogo para ver la escala.",
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. No hay indicador seleccionado, así que no se representa ningún valor.`,
      "Sin indicador seleccionado: el mapa muestra solo los contornos, sin valores.",
    );
  }

  if (anio === null) {
    return plano(
      MOTIVO_SIN_PERIODO,
      "Sin periodo publicado",
      `${indicador.etiqueta} · sin periodo publicado`,
      "La fuente no publica este indicador con periodo para este municipio.",
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. El indicador «${indicador.etiqueta}» no tiene ningún periodo publicado para este municipio, así que no se representa ningún valor.`,
      `El indicador «${indicador.etiqueta}» no tiene periodos publicados a nivel de sección para este municipio.`,
    );
  }

  // El bloque de valores aún no ha llegado. Se devuelve el plano de contornos, sin
  // escala: con `observations` vacías, `clasificar()` construiría una clase
  // única «0 – 0» que se leería como un valor real. Un plano honesto en el que
  // cabe un texto es mejor que una escala ficticia, y el motivo que se declara es
  // el que corresponde: aún no se sabe si habrá dato.
  if (cargandoValores) {
    return plano(
      MOTIVO_CARGANDO,
      "Cargando valores…",
      `${indicador.etiqueta} · cargando valores`,
      `Se están pidiendo los valores de ${anio}. Hasta que lleguen, se muestran solo los contornos.`,
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. Los valores del indicador «${indicador.etiqueta}» para ${anio} se están cargando: todavía no hay nada que repartir y no se proyecta ningún valor sobre la geometría.`,
      `Cargando los valores de «${indicador.etiqueta}» para ${anio}. El mapa muestra los contornos y no una escala, porque una coropleta sin dato sería una imagen inventada.`,
    );
  }

  // Observaciones de UN indicador: sección → periodo → observación.
  const porSeccion: Record<string, SeccionPorPeriodo> = {};
  for (const s of secciones) {
    porSeccion[s.properties.CUSEC] = atlas.observations?.[s.properties.CUSEC]?.[indicador.id] ?? {};
  }

  const claves = secciones.map((s) => s.properties.CUSEC);
  // Regla de la fuente, no del rótulo: entra en la escala toda observación cuyo
  // estado ADMITE número (`admiteValor`), sea `observado` o
  // `derivado_verificable`. Filtrar solo por `observado` vaciaba el mapa de
  // todos los porcentajes del Censo Anual, que son precisamente los derivados
  // con numerador y denominador de la misma sección.
  const admitida = (o: SeccionPorPeriodo[string] | undefined): boolean =>
    !!o && admiteValor(o.status) && typeof o.value === "number" && Number.isFinite(o.value);
  const valores = claves.map((k) => {
    const o = porSeccion[k]?.[String(anio)];
    return o && admitida(o) ? o.value : null;
  });

  const modoEfectivo: ModoClasificacion =
    modo === "cortes_manuales" && !opciones.cortesManuales ? "intervalos_iguales" : modo;

  const brutas = clasificar(valores, {
    modo: modoEfectivo,
    clases,
    cortesManuales: opciones.cortesManuales,
    divergente: opciones.divergente,
    unidad,
  });

  // Con muy pocos valores distintos una escala de color no dice nada. Se
  // sustituye por un color plano y se declara, en vez de fingir una rampa.
  const escalaSimple = brutas.valoresDistintos < 3;
  const cortes = escalaSimple
    ? [
        {
          min: brutas.min,
          max: brutas.max,
          etiqueta:
            brutas.min === brutas.max
              ? `Valor único: ${formatearValor(brutas.min, "observado", unidad)}`
              : `${formatearValor(brutas.min, "observado", unidad)} – ${formatearValor(brutas.max, "observado", unidad)}`,
          // musgo-500: el color institucional, tomado de la rampa del contrato.
          color: RAMPA_SECUENCIAL[4],
          secciones: brutas.nObservados,
        },
      ]
    : brutas.cortes;

  const entradasLeyenda: EntradaLeyendaAtlas[] = cortes.map((c) => ({
    etiqueta: c.etiqueta,
    color: c.color,
    secciones: c.secciones,
  }));

  const nSinDato = valores.filter((v) => v === null).length;
  if (nSinDato > 0) {
    entradasLeyenda.push({ etiqueta: ETIQUETA_SIN_DATO, color: COLOR_SIN_DATO, secciones: nSinDato, esSinDato: true });
  }

  const filas: FilaAtlas[] = secciones.map((s) => {
    const key = s.properties.CUSEC;
    return construirFila(key, s.geometry, porSeccion[key]?.[String(anio)], cortes, unidad, indicador);
  });

  const nConDato = valores.filter((v) => v !== null).length;
  const cobertura = coberturaDePeriodo(secciones, porSeccion, anio);
  const coberturaPct = cobertura.pctObservados;

  if (escalaSimple) {
    avisos.push(
      `Escala simplificada: ${brutas.valoresDistintos} ${
        brutas.valoresDistintos === 1 ? "valor distinto" : "valores distintos"
      } entre ${brutas.nObservados} secciones con dato. El mapa usa un solo color; los valores exactos están en la tabla.`,
    );
  }
  if (nSinDato > 0) {
    avisos.push(
      `${nSinDato} de ${nSecciones} secciones no tienen dato en la fuente para este indicador y este periodo. Se muestran con trama diagonal y fuera de la escala: no son cero.`,
    );
  }
  if (atlas.quality?.hayDesfaseTemporal && anio !== atlas.geometryYear) {
    // El aviso se refiere al indicador y año SELECCIONADOS, no a un flag
    // global: el ADRH llega a 2023 y el censo a 2025, así que un desfase
    // global producía mensajes sin sentido («geometría 2025 y dato 2025»).
    avisos.push(
      `Desfase temporal: la geometría es de ${atlas.geometryYear} y el dato de «${indicador.etiqueta}» es de ${anio}. No son contemporáneos.`,
    );
  }
  // Los avisos internos de ingestión (tolerancia de simplificación, páginas
  // descargadas, filas del CSV, polígonos excluidos) NO se muestran como
  // leyenda: son diagnóstico técnico y saturaban la vista. La trazabilidad
  // completa sigue en `quality` y en el XLSX. Solo se declara si la validación
  // de calidad viene en estado «failed».
  if (atlas.quality?.status === "failed") {
    avisos.push(
      "La validación de calidad de esta fuente está en estado «failed»: revise la trazabilidad antes de usar el dato.",
    );
  }

  const referenciaMunicipal = atlas.municipalReference?.[`${indicador.id}|${anio}`] ?? null;
  const tituloLeyenda = `${indicador.etiqueta}${unidad ? ` (${unidad})` : ""} · ${anio}`;
  const subtituloLeyenda = `${etiquetaModo(modo)} · ${cortes.length} ${
    cortes.length === 1 ? "clase" : "clases"
  } · ${nConDato} de ${nSecciones} secciones con dato (${coberturaPct.toLocaleString("es-ES", {
    maximumFractionDigits: 1,
  })} % de cobertura). Las clases se calculan solo con los valores observados.`;

  const descripcionMapa = [
    `Mapa coroplético de las ${nSecciones} secciones censales de ${municipioNombre}${
      atlas.provinceName ? `, provincia de ${atlas.provinceName}` : ""
    }.`,
    `Indicador: ${indicador.etiqueta}${unidad ? `, en ${unidad}` : ""}, periodo ${anio}.`,
    escalaSimple
      ? `Con ${brutas.valoresDistintos} ${
          brutas.valoresDistintos === 1 ? "valor distinto" : "valores distintos"
        } entre las secciones con dato no se usa una escala de color: el mapa es de un solo color.`
      : `Escala de ${cortes.length} clases, de ${cortes[0]?.etiqueta ?? ""} a ${cortes[cortes.length - 1]?.etiqueta ?? ""}.`,
    `${nConDato} secciones con dato y ${nSinDato} sin dato (${coberturaPct.toLocaleString("es-ES", {
      maximumFractionDigits: 1,
    })} % de cobertura).`,
    "Las secciones sin dato se distinguen con trama diagonal y no entran en la escala.",
    "Los mismos valores, ordenables y filtrables, están en la tabla de secciones.",
  ].join(" ");

  return {
    filas,
    entradasLeyenda,
    clasificacion: brutas,
    valoresDistintos: brutas.valoresDistintos,
    escalaSimple,
    nSecciones,
    nConDato,
    nSinDato,
    coberturaPct,
    referenciaMunicipal,
    tituloLeyenda,
    subtituloLeyenda,
    descripcionMapa,
    avisos,
    modoMapa: "coropleta",
  };
}


function filaVacia(feature: SeccionFeature, motivo: string, texto = "Sin dato"): FilaAtlas {
  return {
    key: feature.properties.CUSEC,
    value: null,
    status: "sin_cobertura",
    texto,
    clase: -1,
    color: COLOR_SIN_DATO,
    // Contorno legible sobre el mapa base: en modo plano es lo único que se
    // dibuja, así que no puede quedar tenue.
    colorContorno: tokenIma("--carbon-600"),
    esSinDato: true,
    sinRelleno: true,
    esAgregadoDistrito: false,
    motivoSinDato: motivo,
    centroide: centroideGeometria(feature.geometry),
    nota: null,
    methodologyNote: null,
    fuenteUrl: "",
    sourceTable: "",
    operation: "",
    publishedAt: null,
    retrievedAt: "",
    dimensiones: {},
  };
}

function construirFila(
  key: string,
  geometry: unknown,
  observacion:
    | {
        value: number | null;
        status: SeccionValorStatus;
        sourceUrl: string;
        sourceTable: string;
        operation: string;
        publishedAt: string | null;
        retrievedAt: string;
        dimensions: Record<string, string>;
        methodologyNote: string | null;
        unit: string;
      }
    | undefined,
  cortes: ResultadoClasificacion["cortes"],
  unidad: string,
  indicador: SeccionIndicador,
): FilaAtlas {
  const status: SeccionValorStatus = observacion?.status ?? "sin_cobertura";
  const bruto = observacion?.value ?? null;
  // Regla dura: entra en la escala toda observación cuyo estado ADMITE número
  // (`observado` o `derivado_verificable`). Un ND —secreto estadístico, celda
  // vacía, sin cobertura, error— es estado sin número y NUNCA entra.
  const esSinDato =
    !observacion ||
    bruto === null ||
    !Number.isFinite(bruto) ||
    !admiteValor(status);

  let clase = -1;
  let color = COLOR_SIN_DATO;
  if (!esSinDato && bruto !== null) {
    clase = indiceDeClase(bruto, cortes);
    color = cortes[clase]?.color ?? COLOR_SIN_DATO;
  }

  return {
    key,
    value: esSinDato ? null : bruto,
    status,
    texto: formatearValor(bruto, status, observacion?.unit || unidad),
    clase,
    color,
    // Filete hueso entre secciones con dato: separa clases contiguas sin
    // competir con el relleno. El ND conserva su contorno limo oscuro, así que
    // se distingue también por la línea, no solo por la trama.
    colorContorno: esSinDato ? COLOR_CONTORNO_SIN_DATO : COLOR_CONTORNO_CLASE,
    esSinDato,
    sinRelleno: false,
    esAgregadoDistrito: esPoligonoDistrito(key),
    motivoSinDato: null,
    centroide: centroideGeometria(geometry),
    nota: esSinDato && indicador.etiquetaNoDifundido ? `La fuente etiqueta estas celdas como «${indicador.etiquetaNoDifundido}».` : null,
    methodologyNote: observacion?.methodologyNote ?? null,
    fuenteUrl: observacion?.sourceUrl ?? indicador.url,
    sourceTable: observacion?.sourceTable ?? indicador.sourceTable,
    operation: observacion?.operation ?? indicador.operation,
    publishedAt: observacion?.publishedAt ?? null,
    retrievedAt: observacion?.retrievedAt ?? "",
    dimensiones: observacion?.dimensions ?? {},
  };
}

/** Índice de clase sobre una escala ya calculada. Misma regla de extremos que
 *  el contrato: la última clase incluye su propio límite superior. */
function indiceDeClase(valor: number, cortes: ResultadoClasificacion["cortes"]): number {
  for (let i = 0; i < cortes.length; i++) {
    const esUltima = i === cortes.length - 1;
    if (valor < cortes[i].max || (esUltima && valor <= cortes[i].max)) return i;
  }
  return cortes.length - 1;
}

function etiquetaModo(modo: ModoClasificacion): string {
  if (modo === "cuantil") return "Clasificación por cuantiles";
  if (modo === "intervalos_iguales") return "Clasificación por intervalos iguales";
  if (modo === "jenks") return "Clasificación de Jenks (rupturas naturales)";
  return "Clasificación por cortes manuales";
}

function blobDeLienzo(lienzo: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    lienzo.toBlob((b) => resolve(b), "image/png");
  });
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const BOTON_PRINCIPAL =
  "inline-flex min-h-[44px] items-center justify-center rounded-[6px] bg-[var(--action-primary-bg)] px-5 py-2 text-sm font-semibold text-[var(--action-primary-fg)] transition-colors hover:bg-[var(--action-primary-hover)]";

function BotonVista({
  activo,
  onClick,
  separado = false,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  separado?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-[44px] px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--border-focus)] ${
        separado ? "border-l border-[var(--border-default)]" : ""
      } ${
        // Seleccionada: fondo + peso + filete interior. No depende solo del
        // color y no altera el ancho dentro del grupo con `overflow-hidden`.
        activo
          ? "bg-[var(--musgo)] font-bold text-[var(--hueso)] shadow-[inset_0_0_0_1px_var(--border-strong)]"
          : "bg-[var(--bg-surface)] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)] hover:text-[var(--text-primary)]"
      }`}

    >
      {children}
    </button>
  );
}

/**
 * Estado de carga o de fallo del bloque de valores que se está viendo.
 *
 * Es lo que distingue las tres situaciones que antes se confundían en un mismo
 * mapa vacío: «aún no ha llegado», «no hay nada publicado» y «el servidor ha
 * dicho por qué no». Sin esto, un fallo de red y un municipio sin cobertura se
 * leen igual, y la única defensa —no pintar una coropleta inventada— acaba
 * pareciendo un fallo de la herramienta.
 *
 * No aparece en el caso `ok`: el bloque descargado no necesita Holmes. Añadirlo
 * solo cuando hay algo que decir es también lo que mantiene intacto el diseño
 * visual del atlas en su estado normal.
 */
function AvisoCargaBloque({
  estado,
  bloqueado,
  indicador,
  periodo,
  municipioNombre,
  reintentos,
  reintentosMax,
  onReintentar,
}: {
  estado: EstadoBloque | undefined;
  /** La validación del servidor vino `ok:false`: no se piden valores. */
  bloqueado?: boolean;
  indicador: string;
  periodo: number | null;
  municipioNombre: string;
  reintentos: number;
  reintentosMax: number;
  onReintentar: () => void;
}) {
  const cargando = estado?.estado === "cargando";
  const fallo = estado?.estado === "error";
  const vacio = estado?.estado === "vacio";
  // Un bloque que se ha pedido una vez y aún no ha resuelto no es «sin datos».
  const nuncaPedido = estado === undefined;
  if (bloqueado) {
    return (
      <div className="ideas-status" data-state="error" role="alert">
        <div className="ideas-status__head">
          <p className="ideas-status__title">
            No se piden los valores de «{indicador}»: la fuente no supera la validación
          </p>
          <span className="ideas-status__badge">Sin publicar</span>
        </div>
        <div className="ideas-status__body">
          <p>
            El servidor ha validado el objeto publicado de {municipioNombre} y no lo ha servido. Los motivos
            están arriba. Fallar de forma cerrada es lo correcto: pintar estos valores sería mostrar un dato
            que la propia ingesta ha marcado como no publicable. El mapa se queda en contornos, sin escala de
            color.
          </p>
          <button type="button" onClick={onReintentar} className={`${BOTON_PRINCIPAL} mt-4`}>
            Pedir el bloque igualmente
          </button>
        </div>
      </div>
    );
  }
  if (!cargando && !fallo && !vacio) return null;
  const agotado = fallo && reintentos >= reintentosMax;

  if (cargando || nuncaPedido) {
    return (
      <div role="status" className="ideas-status flex items-center gap-3" data-state="pending">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 flex-none animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--moss-ink)] motion-reduce:animate-none"
        />
        <p className="type-body-sm text-[var(--text-secondary)]">
          Cargando los valores de «{indicador}»
          {periodo !== null ? ` para ${periodo}` : ""} de {municipioNombre}… La geometría ya está cargada; se
          pide solo este indicador y este año.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`ideas-status ${fallo ? "border-[var(--danger-ink)]" : ""}`}
      data-state={fallo ? "error" : "pending"}
      role={fallo ? "alert" : "status"}
    >
      <div className="ideas-status__head">
        <p className="ideas-status__title">
          {fallo
            ? `No se pudieron cargar los valores de «${indicador}»`
            : `«${indicador}» no tiene ninguna celda publicada`}
        </p>
        <span className="ideas-status__badge">
          {fallo ? (estado?.status ? `HTTP ${estado.status}` : "Sin conexión") : "Sin dato"}
        </span>
      </div>
      <div className="ideas-status__body">
        {fallo ? (
          <p>
            {estado?.error}
            {agotado
              ? ` (${reintentos} de ${reintentosMax} reintentos agotados para este bloque.)`
              : ""}
          </p>
        ) : (
          <p>
            {estado?.error ??
              `La fuente no difunde ninguna celda de «${indicador}»${periodo !== null ? ` para ${periodo}` : ""} a nivel de sección en ${municipioNombre}.`}{" "}
            No es un cero: no hay valor que repartir, así que el mapa muestra solo los contornos y no se pinta
            una escala de color. Es una ausencia de dato en la fuente, no un fallo de la aplicación.
            {estado?.nSecciones !== undefined ? ` Bloque recibido con ${estado.nSecciones} secciones.` : ""}
          </p>
        )}
        <button type="button" onClick={onReintentar} disabled={agotado} className={`${BOTON_PRINCIPAL} mt-4`}>
          {agotado ? "Sin más reintentos" : "Reintentar este bloque"}
        </button>
      </div>
    </div>
  );
}

function CabeceraAtlas({
  municipioNombre,
  provincia,
  geometriaYear,
  fuente,
  nSecciones,
  nConDato,
  nSinDato,
  nAgregados,
  nDescartadas,
  coberturaPct,
  indicadorEtiqueta,
  anio,
  avisos,
  sinAtlas,
  plano,
  validacion,
  validacionAusente,
}: {
  municipioNombre: string;
  provincia: string | null;
  geometriaYear: number | null;
  fuente: string;
  nSecciones: number;
  nConDato: number;
  nSinDato: number;
  nAgregados: number;
  nDescartadas: number;
  coberturaPct: number;
  indicadorEtiqueta: string | null;
  anio: number | null;
  avisos: string[];
  sinAtlas: boolean;
  plano: boolean;
  validacion: ResultadoValidacion | null;
  /** El bootstrap no trajo veredicto. No es «validado»: es «sin comprobar». */
  validacionAusente?: boolean;
}) {
  return (
    <section aria-label="Resumen del atlas">
      <dl className="grid grid-cols-2 gap-px border-y border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-4">
        <DatoCabecera etiqueta="Municipio" valor={municipioNombre} detalle={provincia ?? undefined} />
        <DatoCabecera
          etiqueta="Secciones con dato"
          valor={plano ? "—" : `${nConDato} de ${nSecciones}`}
          detalle={plano ? "Sin valores observados" : `${nSinDato} sin dato`}
        />
        <DatoCabecera
          etiqueta="Cobertura del indicador"
          valor={plano ? "—" : `${coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`}
          detalle={
            plano
              ? sinAtlas
                ? "Indicadores sin cargar"
                : "Sin valores observados"
              : indicadorEtiqueta && anio !== null
                ? `${indicadorEtiqueta} · ${anio}`
                : "Sin indicador cargado"
          }
        />
        <DatoCabecera
          etiqueta="Seccionado (geometría)"
          valor={String(geometriaYear ?? "—")}
          detalle={`Fuente: ${fuente}`}
        />
      </dl>

      {(nAgregados > 0 || nDescartadas > 0) && (
        <p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-[var(--text-muted)]">
          {nAgregados > 0 ? (
            <>
              Se han excluido {nAgregados} polígonos agregados de distrito (clave de sección terminada
              en 000). El INE los incluye en la misma capa, pero no son secciones: publicarlos sería
              inventar una fila que la fuente no da.
            </>
          ) : null}
          {nDescartadas > 0 ? (
            <>
              {nAgregados > 0 ? " " : null}
              Se han descartado {nDescartadas} polígonos sin clave de sección válida o sin geometría
              utilizable.
            </>
          ) : null}
        </p>
      )}

      {validacionAusente && (
        <div className="mt-4 rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Esta respuesta no incluye el veredicto de validación del servidor
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            La validación fail-closed se ejecuta en el servidor, sobre el objeto publicado, y no viaja en el
            bootstrap. Al no venir, no se puede afirmar que estos datos estén validados; se muestran como
            «sin comprobar», no como «correctos».
          </p>
        </div>
      )}

      {validacion && !validacion.ok && (
        <div
          className="mt-4 rounded-[6px] border border-[var(--danger-ink)] bg-[var(--status-danger-bg)] p-4"
          role="alert"
        >
          <p className="text-sm font-semibold text-[var(--status-danger-fg)]">
            La validación de la fuente no pasa ({validacion.errores.length}{" "}
            {validacion.errores.length === 1 ? "error" : "errores"})
          </p>
          <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {/* El índice forma parte de la clave: el mismo texto de error puede
                repetirse para varias secciones y una clave por texto duplicaría
                nodos en React. */}
            {validacion.errores.slice(0, 8).map((e, i) => (
              <li key={`${i}-${e}`}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!sinAtlas && avisos.length > 0 && (
        <div className="mt-4 rounded-[6px] bg-[var(--bg-surface-sunken)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Avisos de lectura</h2>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DatoCabecera({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  // Casilla del cajetín: el filete entre casillas es el hueco de 1 px de la
  // rejilla sobre el color de borde, como en el cajetín de una hoja impresa.
  return (
    <div className="min-w-0 bg-[var(--bg-canvas)] px-4 py-4 max-sm:odd:pl-0 sm:first:pl-0">
      <dt className="type-label text-[var(--text-muted)]">{etiqueta}</dt>
      <dd className="type-h4 tnum mt-1 text-[var(--text-primary)]">{valor}</dd>
      {detalle ? <dd className="mt-0.5 break-words text-xs leading-snug text-[var(--text-muted)]">{detalle}</dd> : null}
    </div>
  );
}
