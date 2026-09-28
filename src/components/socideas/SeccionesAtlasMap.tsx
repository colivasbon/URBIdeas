"use client";

// Mapa coroplético de secciones censales (Leaflet bajo demanda) + leyenda.
//
// Este archivo es la hoja más baja del atlas: no conoce la URL, ni el estado
// global, ni la ficha. Recibe un modelo de vista YA resuelto y se limita a
// pintarlo. Aquí viven además los tipos compartidos por el panel, la tabla y la
// ficha de detalle, para que el resto de hojas no dependan entre sí.
//
// Dos garantías estructurales:
//
//  1. ND nunca es cero ni parece el mínimo. Una sección sin dato se pinta con
//     `COLOR_SIN_DATO`, con contorno `COLOR_CONTORNO_SIN_DATO` y con TRAMA
//     DIAGONAL (SVG en pantalla, `CanvasPattern` en la captura). La trama es
//     el mismo patrón en ambos casos, así que la leyenda, el mapa y el PNG
//     enseñan exactamente lo mismo.
//
//  2. La captura para el PNG NO se lee del lienzo interno de Leaflet: se
//     REDIBUJA sobre un lienzo propio con `map.project()`. Motivos: el renderer
//     por defecto de Leaflet es SVG (no hay `getContext`) y la proyección nos
//     da control total de la trama, del grosor de línea y del tamaño de salida.
//     El `preserveDrawingBuffer` se pide igualmente en el lienzo de salida para
//     que el llamante pueda releerlo.

import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { COLOR_CONTORNO_SIN_DATO, COLOR_SIN_DATO, SECCIONES_ATRIBUCION } from "@/lib/socideas-secciones";
import type { SeccionValorStatus } from "@/lib/socideas-secciones";
import { patronTramaSinDato, tokenIma, type EscalaPng } from "@/lib/socideas-secciones-png";

/** Teselado del mapa base. Con `crossOrigin` para que el lienzo no se manche. */
export const TILE_URL_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATRIBUCION_TILES_OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)';

/** Filete entre secciones con dato (hueso): separa clases contiguas sin
 *  competir con el relleno. Lo usan el mapa y el PNG a través de `colorContorno`. */
export const COLOR_CONTORNO_CLASE = "#F1F1F1";
/** Contorno de la sección seleccionada (carbón), igual en mapa y PNG. */
export const COLOR_SELECCION = "#3C403E";

const VISTA_INICIAL: [number, number] = [40.4, -3.7];
const MS_ESPERA_TESELAS = 7000;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartidos
// ─────────────────────────────────────────────────────────────────────────────

/** Una sección del municipio con su observación ya resuelta. `clase === -1`
 *  significa «sin dato»: la fila existe (el polígono existe) pero no entra en
 *  ninguna clase. */
export interface FilaAtlas {
  key: string;
  value: number | null;
  status: SeccionValorStatus;
  /** Texto ya formateado por `formatearValor` del contrato. */
  texto: string;
  /** Índice de clase, o -1 si es ND. */
  clase: number;
  color: string;
  colorContorno: string;
  esSinDato: boolean;
  /** `true` cuando NO hay ningún indicador que pintar (municipio sin cargar,
   *  sin indicador seleccionado o sin periodo): el polígono se dibuja SOLO con
   *  su contorno, sin relleno ni trama. Es distinto de ND: ND es ausencia
   *  acreditada de valor para un indicador concreto y SÍ lleva trama. */
  sinRelleno: boolean;
  esAgregadoDistrito: boolean;
  /** Por qué no hay dato, cuando el motivo no es el propio estado de la fuente
   *  (por ejemplo: el municipio no tiene indicadores publicados por sección). */
  motivoSinDato: string | null;
  /** `[lon, lat]` del centroide (o null si la geometría no lo permite). */
  centroide: [number, number] | null;
  nota: string | null;
  methodologyNote: string | null;
  fuenteUrl: string;
  sourceTable: string;
  operation: string;
  publishedAt: string | null;
  retrievedAt: string;
  dimensiones: Record<string, string>;
}

/** Una entrada de la leyenda, ya resuelta. La de sin dato SIEMPRE está. */
export interface EntradaLeyendaAtlas {
  etiqueta: string;
  color: string;
  secciones: number | null;
  esSinDato?: boolean;
}

/** Ajustes de presentación. NO tocan ningún valor: solo cómo se ven. */
export interface PresentacionAtlas {
  opacidad: number;
  mostrarBordes: boolean;
  mostrarEtiquetas: boolean;
  basemap: boolean;
  divergente: boolean;
  cortesManuales: number[] | null;
  escalaPng: EscalaPng;
}

export type ClaveOrdenAtlas = "seccion" | "valor" | "estado" | "clase";

/** Lo que el mapa necesita saber para hablar con el PNG. */
export interface CapturaAtlas {
  canvas: HTMLCanvasElement;
  baseOmitida: boolean;
  motivoBaseOmitida: string | null;
}

export interface HandleAtlas {
  ajustarVistaMunicipio: () => void;
  ajustarVistaSeccion: (key: string) => boolean;
  capturarParaPng: (escala: EscalaPng) => Promise<CapturaAtlas>;
  /** `true` cuando Leaflet ya está instanciado y la captura puede empezar. */
  puedeCapturar: () => boolean;
  invalidate: () => void;
}

export interface SeccionesAtlasMapProps {
  /** Geometría ya filtrada: solo secciones reales (nada de agregados de distrito). */
  features: ReadonlyArray<GeoJsonFeatureLike>;
  filas: ReadonlyArray<FilaAtlas>;
  municipioNombre: string;
  tituloLeyenda: string;
  subtituloLeyenda: string;
  entradasLeyenda: ReadonlyArray<EntradaLeyendaAtlas>;
  /** Texto alternativo largo del mapa. Va también como resumen visible. */
  descripcion: string;
  presentacion: PresentacionAtlas;
  seleccion: string | null;
  hovered: string | null;
  onSeleccionar: (key: string) => void;
  onHover: (key: string | null) => void;
  /** `true` si la leyenda se pinta fuera del mapa (en el panel lateral). */
  sinLeyenda?: boolean;
  ref?: React.Ref<HandleAtlas>;
}

/** Forma mínima de un feature GeoJSON que necesita este archivo. */
export interface GeoJsonFeatureLike {
  key: string;
  geometry: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría: recorrido y centroide (puro, sin dependencias)
// ─────────────────────────────────────────────────────────────────────────────

type Anillo = number[][];

function anillosDeGeometria(geometry: unknown): { anillos: Anillo[]; tipo: string } {
  const g = geometry as
    | { type?: string; coordinates?: unknown; geometries?: unknown[] }
    | null
    | undefined;
  if (!g || typeof g !== "object") return { anillos: [], tipo: "" };
  const tipo = typeof g.type === "string" ? g.type : "";
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return { anillos: (g.coordinates as unknown[]).filter(Array.isArray) as Anillo[], tipo };
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    const anillos: Anillo[] = [];
    for (const poli of g.coordinates as unknown[]) {
      if (Array.isArray(poli)) {
        for (const anillo of poli) if (Array.isArray(anillo)) anillos.push(anillo as Anillo);
      }
    }
    return { anillos, tipo };
  }
  return { anillos: [], tipo };
}

function lineasDeGeometria(geometry: unknown): Anillo[] {
  const g = geometry as { type?: string; coordinates?: unknown } | null | undefined;
  if (!g || typeof g !== "object" || !Array.isArray(g.coordinates)) return [];
  if (g.type === "LineString") return [g.coordinates as Anillo];
  if (g.type === "MultiLineString") return (g.coordinates as unknown[]).filter(Array.isArray) as Anillo[];
  return [];
}

/** Centroide del anillo exterior más grande (área porCoords en coordenadas de
 *  plano). Sirve para anclar la etiqueta; no se usa para calcular nada. */
export function centroideGeometria(geometry: unknown): [number, number] | null {
  const { anillos, tipo } = anillosDeGeometria(geometry);
  if (!anillos.length || (tipo !== "Polygon" && tipo !== "MultiPolygon")) {
    const lineas = lineasDeGeometria(geometry);
    if (!lineas.length) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const l of lineas) {
      for (const p of l) {
        if (Array.isArray(p) && p.length >= 2) {
          sx += Number(p[0]) || 0;
          sy += Number(p[1]) || 0;
          n++;
        }
      }
    }
    return n ? [sx / n, sy / n] : null;
  }
  let mejor: Anillo | null = null;
  let mejorArea = -1;
  for (const anillo of anillos) {
    let area = 0;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const a = anillo[i];
      const b = anillo[j];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      area += (Number(b[0]) || 0) * (Number(a[1]) || 0) - (Number(a[0]) || 0) * (Number(b[1]) || 0);
    }
    const abs = Math.abs(area) / 2;
    if (abs > mejorArea) {
      mejorArea = abs;
      mejor = anillo;
    }
  }
  if (!mejor || mejorArea <= 0) return null;
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  for (let i = 0, j = mejor.length - 1; i < mejor.length; j = i++) {
    const a = mejor[i];
    const b = mejor[j];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const x1 = Number(b[0]) || 0;
    const y1 = Number(b[1]) || 0;
    const x2 = Number(a[0]) || 0;
    const y2 = Number(a[1]) || 0;
    const f = x1 * y2 - x2 * y1;
    a2 += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (!a2) return null;
  return [cx / (3 * a2), cy / (3 * a2)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Definición SVG de la trama de «sin dato», compartida por mapa y leyenda
// ─────────────────────────────────────────────────────────────────────────────

const ID_TRAMA = "ima-socideas-trama-sindato";

function AsegurarTramaSvg(): void {
  if (typeof document === "undefined" || document.getElementById(ID_TRAMA)) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
  pattern.setAttribute("id", ID_TRAMA);
  pattern.setAttribute("width", "8");
  pattern.setAttribute("height", "8");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("patternTransform", "rotate(45)");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "8");
  rect.setAttribute("height", "8");
  rect.setAttribute("fill", COLOR_SIN_DATO);
  const linea = document.createElementNS("http://www.w3.org/2000/svg", "line");
  linea.setAttribute("x1", "0");
  linea.setAttribute("y1", "0");
  linea.setAttribute("x2", "0");
  linea.setAttribute("y2", "8");
  linea.setAttribute("stroke", COLOR_CONTORNO_SIN_DATO);
  linea.setAttribute("stroke-width", "2");
  pattern.appendChild(rect);
  pattern.appendChild(linea);
  defs.appendChild(pattern);
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export default function SeccionesAtlasMap({
  features,
  filas,
  municipioNombre,
  tituloLeyenda,
  subtituloLeyenda,
  entradasLeyenda,
  descripcion,
  presentacion,
  seleccion,
  hovered,
  onSeleccionar,
  onHover,
  sinLeyenda = false,
  ref,
}: SeccionesAtlasMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const capaRef = useRef<Leaflet.GeoJSON | null>(null);
  const tramaRef = useRef<Leaflet.GeoJSON | null>(null);
  const teselasRef = useRef<Leaflet.TileLayer | null>(null);
  const [etiquetasVisibles, setEtiquetasVisibles] = useState<Array<{ key: string; x: number; y: number; texto: string }>>([]);
  const [listo, setListo] = useState(false);

  const porClave = useMemo(() => new Map(filas.map((f) => [f.key, f])), [filas]);
  const porClaveRef = useRef(porClave);
  const seleccionRef = useRef<string | null>(seleccion);
  const presentacionRef = useRef(presentacion);
  // Los callbacks llegan como props nuevas en cada render; la capa de Leaflet
  // se crea una sola vez, así que guarda referencias actualizadas para no
  // disparar eventos con un `escribirParams` viejo.
  const onSeleccionarRef = useRef(onSeleccionar);
  const onHoverRef = useRef(onHover);

  // Las props se reflejan en refs dentro de efectos, nunca durante el render.
  // Se declaran ANTES que los efectos que ya las leen, para que un cambio llegue
  // a tiempo a `estiloDe`.
  useEffect(() => {
    porClaveRef.current = porClave;
  }, [porClave]);
  useEffect(() => {
    seleccionRef.current = seleccion;
  }, [seleccion]);
  useEffect(() => {
    presentacionRef.current = presentacion;
  }, [presentacion]);
  useEffect(() => {
    onSeleccionarRef.current = onSeleccionar;
  }, [onSeleccionar]);
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  // Estilo de una sección: el ND nunca se pinta con un color de la rampa.
  const estiloDe = useCallback((key: string): Leaflet.PathOptions => {
    const p = presentacionRef.current;
    const fila = porClaveRef.current.get(key);
    if (!fila) {
      return { color: COLOR_CONTORNO_SIN_DATO, weight: 1, fillColor: COLOR_SIN_DATO, fillOpacity: 0.35 * p.opacidad };
    }
    // Sin indicador cargado: plano de contornos, sin relleno ni trama. No se
    // disfraza de ND porque no hay ND: no hay nada que representar.
    const seleccionada = key === seleccionRef.current;
    if (fila.sinRelleno) {
      const peso = seleccionada ? 2 : 1;
      return {
        color: seleccionada ? COLOR_SELECCION : fila.colorContorno,
        weight: peso,
        opacity: 1,
        fillColor: "transparent",
        fillOpacity: 0,
        lineJoin: "round",
      };
    }
    // Filete fino entre secciones; la seleccionada, en carbón a 2 px.
    const peso = seleccionada ? 2 : p.mostrarBordes ? 0.8 : 0;
    return {
      color: seleccionada ? COLOR_SELECCION : fila.colorContorno,
      weight: peso,
      opacity: peso === 0 ? 0 : 1,
      fillColor: fila.color,
      fillOpacity: Math.max(0.08, Math.min(1, p.opacidad)),
      lineJoin: "round",
    };
  }, []);

  // ── Creación del mapa (una sola vez) ────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const mod = (await import("leaflet")) as unknown as typeof Leaflet & { default?: typeof Leaflet };
      await import("leaflet/dist/leaflet.css");
      if (cancelado || !hostRef.current) return;
      const L = mod.default ?? mod;
      LRef.current = L;
      AsegurarTramaSvg();

      const mapa = L.map(hostRef.current, {
        center: VISTA_INICIAL,
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: false,
      });
      mapRef.current = mapa;

      // Objetivo táctil del zoom: los botones de Leaflet vienen a 30x30 px, por
      // debajo del mínimo de 44 px que exige WCAG 2.2 AA (2.5.8). Se agrandan
      // SOLO dentro del atlas, con un selector acotado al contenedor del mapa:
      // `.leaflet-control-zoom a` es un estilo GLOBAL compartido con el visor de
      // URBideas y no debe cambiar de tamaño por culpa de esta pantalla.
      try {
        mapa.getContainer().classList.add("socideas-atlas-map");
      } catch {
        // Si el contenedor no está listo, se continúa: es una mejora de tamaño,
        // nunca un requisito funcional del mapa.
      }

      const teselas = L.tileLayer(TILE_URL_OSM, {
        attribution: `${ATRIBUCION_TILES_OSM} · ${SECCIONES_ATRIBUCION}`,
        maxZoom: 18,
        crossOrigin: "anonymous",
      });
      teselasRef.current = teselas;

      // El paso de «esperando teselas» a «listo» es también lo que dispara la
      // espera real antes de cualquier captura.
      mapa.whenReady(() => setListo(true));
      window.setTimeout(() => setListo(true), 400);
    })();
    return () => {
      cancelado = true;
      capaRef.current = null;
      tramaRef.current = null;
      teselasRef.current = null;
      const mapa = mapRef.current;
      mapRef.current = null;
      if (mapa) mapa.remove();
    };
  }, []);

  // ── Capa coroplética (se reconstruye al cambiar la geometría) ──────────
  useEffect(() => {
    const mapa = mapRef.current;
    const L = LRef.current;
    if (!mapa || !L || !features.length) return;
    let cancelado = false;

    (async () => {
      await Promise.resolve();
      if (cancelado || !mapRef.current) return;
      capaRef.current?.remove();
      tramaRef.current?.remove();

      const fc = {
        type: "FeatureCollection" as const,
        features: features.map((f) => ({ type: "Feature" as const, properties: { CUSEC: f.key }, geometry: f.geometry })),
      };

      capaRef.current = L.geoJSON(fc as unknown as Parameters<typeof L.geoJSON>[0], {
        style: (feat) => estiloDe(String((feat as { properties?: { CUSEC?: string } })?.properties?.CUSEC ?? "")),
        onEachFeature: (feat, layer) => {
          const key = String((feat as { properties?: { CUSEC?: string } })?.properties?.CUSEC ?? "");
          const fila = porClaveRef.current.get(key);
          const texto = fila ? `${key} · ${fila.texto}` : key;
          layer.bindTooltip(texto, { sticky: true, direction: "top", opacity: 1 });
          layer.on("mouseover", () => onHoverRef.current(key));
          layer.on("mouseout", () => onHoverRef.current(null));
          layer.on("click", () => onSeleccionarRef.current(key));
        },
      });
      capaRef.current.addTo(mapa);

      // Segunda capa, no interactiva: la trama diagonal del ND. Si el navegador
      // no resuelve el patrón, la de abajo (relleno sólido) ya se ve bien.
      tramaRef.current = L.geoJSON(fc as unknown as Parameters<typeof L.geoJSON>[0], {
        interactive: false,
        style: (feat) => {
          const key = String((feat as { properties?: { CUSEC?: string } })?.properties?.CUSEC ?? "");
          const fila = porClaveRef.current.get(key);
          if (!fila || !fila.esSinDato || fila.sinRelleno) return { opacity: 0, fillOpacity: 0, stroke: false, color: "transparent", fillColor: "transparent" };
          return {
            color: "transparent",
            weight: 0,
            opacity: 0,
            fillColor: `url(#${ID_TRAMA})`,
            fillOpacity: 1,
          };
        },
      });
      tramaRef.current.addTo(mapa);

      if (presentacionRef.current.basemap && teselasRef.current && !mapa.hasLayer(teselasRef.current)) {
        teselasRef.current.addTo(mapa);
      }
      try {
        mapa.fitBounds(capaRef.current.getBounds(), { padding: [18, 18] });
      } catch {
        // Sin geometría utilizable: se mantiene la vista inicial.
      }
      setListo(true);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, listo]);

  // ── Reestilado cuando cambian los ajustes de presentación o el estado ──
  useEffect(() => {
    const capa = capaRef.current;
    if (!capa) return;
    capa.setStyle((feat) => estiloDe(String((feat as { properties?: { CUSEC?: string } })?.properties?.CUSEC ?? "")));
    const esSeleccion = (key: string) => key === seleccion || key === hovered;
    if (seleccion) {
      mapRef.current?.eachLayer((l: Leaflet.Layer) => {
        const ruta = l as unknown as {
          feature?: { properties?: { CUSEC?: string } };
          bringToFront?: () => void;
        };
        const key = ruta.feature?.properties?.CUSEC;
        if (typeof key !== "string") return;
        if (!esSeleccion(key)) return;
        ruta.bringToFront?.();
      });
    }
  }, [presentacion, seleccion, hovered, estiloDe, listo]);

  // ── Mapa base: encendido / apagado ──────────────────────────────────────
  useEffect(() => {
    const mapa = mapRef.current;
    const teselas = teselasRef.current;
    if (!mapa || !teselas) return;
    if (presentacion.basemap) {
      if (!mapa.hasLayer(teselas)) teselas.addTo(mapa);
    } else if (mapa.hasLayer(teselas)) {
      mapa.removeLayer(teselas);
    }
  }, [presentacion.basemap, listo]);

  // ── Etiquetas: capa HTML sobre el mapa, reposicionada al terminar el zoom ─
  useEffect(() => {
    const mapa = mapRef.current;
    if (!mapa) return;
    const calcular = () => {
      if (!presentacionRef.current.mostrarEtiquetas) {
        setEtiquetasVisibles([]);
        return;
      }
      const c = mapa.getSize();
      const salida: Array<{ key: string; x: number; y: number; texto: string }> = [];
      for (const f of features) {
        const fila = porClaveRef.current.get(f.key);
        if (!fila?.centroide) continue;
        const p = mapa.latLngToContainerPoint([fila.centroide[1], fila.centroide[0]]);
        if (p.x < -40 || p.y < -20 || p.x > c.x + 40 || p.y > c.y + 20) continue;
        salida.push({ key: f.key, x: Math.round(p.x), y: Math.round(p.y), texto: f.key });
      }
      setEtiquetasVisibles(salida);
    };
    calcular();
    // `zoomend` y `moveend` solo recalculan posiciones: `invalidateSize` se
    // llama una vez, al asentarse el contenedor, para no encadenar eventos.
    mapa.on("zoomend", calcular);
    mapa.on("moveend", calcular);
    const t1 = window.setTimeout(() => {
      mapa.invalidateSize();
      calcular();
    }, 250);
    return () => {
      mapa.off("zoomend", calcular);
      mapa.off("moveend", calcular);
      window.clearTimeout(t1);
    };
  }, [features, presentacion.mostrarEtiquetas, listo]);

  // ── API imperativa ──────────────────────────────────────────────────────

  const ajustarVistaMunicipio = useCallback(() => {
    const mapa = mapRef.current;
    const capa = capaRef.current;
    if (!mapa) return;
    try {
      if (capa && capa.getLayers().length) {
        mapa.fitBounds(capa.getBounds(), { padding: [18, 18] });
      }
    } catch {
      // Sin límites: no se mueve la vista.
    }
  }, []);

  const ajustarVistaSeccion = useCallback((key: string) => {
    const mapa = mapRef.current;
    const L = LRef.current;
    const fila = porClaveRef.current.get(key);
    if (!mapa || !L || !fila?.centroide) return false;
    const objetivo: [number, number] = [fila.centroide[1], fila.centroide[0]];
    if (mapa.getZoom() < 15) mapa.setView(objetivo, 15, { animate: false });
    else mapa.panTo(objetivo, { animate: false });
    return true;
  }, []);

  const esperarTeselas = useCallback(async (): Promise<boolean> => {
    const host = hostRef.current;
    const teselas = teselasRef.current;
    if (!host || !teselas) return false;
    const pendientes = (): HTMLImageElement[] =>
      Array.from(host.querySelectorAll<HTMLImageElement>("img.leaflet-tile")).filter(
        (img) => !img.complete || img.naturalWidth === 0,
      );
    const limite = Date.now() + MS_ESPERA_TESELAS;
    while (pendientes().length > 0 && Date.now() < limite) {
      await new Promise<void>((r) => window.setTimeout(r, 150));
    }
    return pendientes().length === 0;
  }, []);

  /**
   * Redibuja el mapa en un lienzo propio y lo devuelve listo para componer.
   *
   * Si el mapa base no se puede leer (CORS, tinte, red) se rehace el lienzo
   * sobre `--hueso` con coropleta, contornos y etiquetas, y se informa con
   * `baseOmitida: true`. Nunca se devuelve un PNG en blanco sin decirlo.
   */
  const capturarParaPng = useCallback(
    async (escala: EscalaPng): Promise<CapturaAtlas> => {
      const host = hostRef.current;
      const mapa = mapRef.current;
      const L = LRef.current;
      if (!host || !mapa || !L) {
        throw new Error("El mapa todavía no está listo para la captura.");
      }
      if (presentacionRef.current.basemap) await esperarTeselas();
      // El tamaño se mide DESPUÉS de asentar el contenedor: si no, las teselas
      // se volcarían desplazadas respecto al marco del PNG.
      mapa.invalidateSize({ animate: false });
      const logico = mapa.getSize();
      const wLog = Math.max(1, Math.round(logico.x));
      const hLog = Math.max(1, Math.round(logico.y));

      const dibujar = (conBase: boolean): HTMLCanvasElement => {
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(wLog * escala);
        lienzo.height = Math.round(hLog * escala);
        // `preserveDrawingBuffer` no está en `CanvasRenderingContext2DSettings`
        // de la lib de TypeScript, pero sí lo admite el navegador: se pide
        // explícitamente para que el lienzo devuelto se pueda releer.
        const ctx = lienzo.getContext("2d", {
          alpha: false,
          preserveDrawingBuffer: true,
        } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
        if (!ctx) throw new Error("No hay contexto 2D para la captura del mapa.");
        ctx.setTransform(escala, 0, 0, escala, 0, 0);
        // Fondo opaco: el PNG nunca sale con transparencia.
        ctx.fillStyle = tokenIma("--hueso");
        ctx.fillRect(0, 0, wLog, hLog);
        if (conBase) dibujarTeselas(ctx, host);
        dibujarSecciones(ctx, mapa, features, porClaveRef.current, {
          opacidad: presentacionRef.current.opacidad,
          mostrarBordes: presentacionRef.current.mostrarBordes,
          mostrarEtiquetas: presentacionRef.current.mostrarEtiquetas,
          seleccion: seleccionRef.current,
        });
        return lienzo;
      };

      const manchado = (c: HTMLCanvasElement): boolean => {
        try {
          c.getContext("2d")?.getImageData(0, 0, 1, 1);
          return false;
        } catch {
          return true;
        }
      };

      if (!presentacionRef.current.basemap) {
        return { canvas: dibujar(false), baseOmitida: true, motivoBaseOmitida: "El mapa base estaba desactivado en la vista." };
      }

      const primerIntento = dibujar(true);
      if (!manchado(primerIntento)) {
        return { canvas: primerIntento, baseOmitida: false, motivoBaseOmitida: null };
      }
      // Segundo intento: sin cartografía de fondo, pero con TODO el texto.
      return {
        canvas: dibujar(false),
        baseOmitida: true,
        motivoBaseOmitida:
          "El navegador no permitió leer las teselas de OpenStreetMap (CORS o tinte del lienzo). La exportación incluye el seccionado, los límites, las etiquetas, la escala y la leyenda, pero no el mapa base.",
      };
    },
    [esperarTeselas, features],
  );

  useImperativeHandle(
    ref,
    (): HandleAtlas => ({
      ajustarVistaMunicipio,
      ajustarVistaSeccion,
      capturarParaPng,
      puedeCapturar: () => Boolean(mapRef.current && LRef.current),
      invalidate: () => mapRef.current?.invalidateSize(),
    }),
    [ajustarVistaMunicipio, ajustarVistaSeccion, capturarParaPng],
  );

  const haySeleccion = Boolean(seleccion);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={ajustarVistaMunicipio} className={BOTON_MAPA}>
            Zoom al municipio
          </button>
          <button
            type="button"
            onClick={() => {
              if (seleccion) ajustarVistaSeccion(seleccion);
            }}
            disabled={!haySeleccion}
            className={BOTON_MAPA}
          >
            Zoom a sección seleccionada
          </button>
        </div>
        <p className="type-body-sm tnum text-[var(--text-muted)]">
          {features.length} {features.length === 1 ? "sección representada" : "secciones representadas"} en{" "}
          {municipioNombre}
        </p>
      </div>

      <div
        ref={hostRef}
        role="img"
        aria-label={descripcion}
        className="relative h-[62vh] min-h-[22rem] w-full overflow-hidden rounded-[6px] border border-[var(--border-default)] bg-[var(--hueso)] sm:min-h-[28rem] lg:h-[36rem]"
      >
        {presentacion.mostrarEtiquetas && etiquetasVisibles.length > 0 && (
          <ul aria-hidden="true" className="pointer-events-none absolute inset-0 z-[400] m-0 list-none p-0">
            {etiquetasVisibles.map((e) => {
              const activa = e.key === seleccion || e.key === hovered;
              return (
                <li
                  key={e.key}
                  className="tnum absolute -translate-x-1/2 -translate-y-1/2 px-1 py-px text-[10px] font-semibold leading-tight"
                  style={{
                    left: `${e.x}px`,
                    top: `${e.y}px`,
                    // Rótulo cartográfico: colores fijos de la paleta, porque el
                    // soporte es el mapa (claro) y no el tema de la interfaz.
                    background: activa ? COLOR_SELECCION : COLOR_CONTORNO_CLASE,
                    color: activa ? COLOR_CONTORNO_CLASE : COLOR_SELECCION,
                    border: `1px solid ${COLOR_SELECCION}`,
                  }}
                >
                  {e.texto}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sinLeyenda ? null : (
        <div className="mt-4">
          <LeyendaAtlas titulo={tituloLeyenda} subtitulo={subtituloLeyenda} entradas={entradasLeyenda} />
        </div>
      )}
    </div>
  );
}

const BOTON_MAPA =
  "min-h-[44px] rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--border-default)] disabled:hover:bg-[var(--bg-surface)]";

// ─────────────────────────────────────────────────────────────────────────────
// Leyenda: lista de texto. Nunca solo color.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Leyenda del atlas: símbolos escalonados (cuadros de 14 px) con los límites de
 * clase en cifras tabulares y el recuento de secciones. La entrada de ND usa la
 * misma trama que el mapa y el PNG. Se exporta para que el panel lateral la
 * coloque junto al selector de indicador.
 */
export function LeyendaAtlas({
  titulo,
  subtitulo,
  entradas,
  fuente,
}: {
  titulo: string;
  subtitulo: string;
  entradas: ReadonlyArray<EntradaLeyendaAtlas>;
  /** Fuente y periodo del indicador, al pie de la leyenda. */
  fuente?: string | null;
}) {
  const idTrama = `atlas${useId().replace(/[^a-zA-Z0-9]/g, "")}-trama`;
  const hayND = entradas.some((e) => e.esSinDato);
  return (
    <section aria-label="Leyenda del mapa">
      <p className="type-body-sm font-semibold text-[var(--text-primary)]">{titulo}</p>
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        <defs>
          <pattern id={idTrama} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={COLOR_SIN_DATO} />
            <line x1="0" y1="0" x2="0" y2="8" stroke={COLOR_CONTORNO_SIN_DATO} strokeWidth="2" />
          </pattern>
        </defs>
      </svg>
      {entradas.length > 0 ? (
        <ul className="tnum mt-3 flex flex-col">
          {entradas.map((e, i) => (
            <li
              key={`${e.etiqueta}-${e.esSinDato ? "nd" : i}`}
              className={`grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-3 py-1 text-[13px] leading-snug text-[var(--text-secondary)] ${
                e.esSinDato ? "mt-1.5 border-t border-[var(--border-subtle)] pt-2.5" : ""
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" className="block">
                <rect
                  x="0.5"
                  y="0.5"
                  width="13"
                  height="13"
                  fill={e.esSinDato ? `url(#${idTrama})` : e.color}
                  stroke={e.esSinDato ? COLOR_CONTORNO_SIN_DATO : undefined}
                  style={e.esSinDato ? undefined : { stroke: "var(--border-default)" }}
                  strokeWidth="1"
                />
              </svg>
              <span className="min-w-0 text-[var(--text-primary)]">{e.etiqueta}</span>
              {e.secciones !== null ? (
                <span className="text-right text-[var(--text-muted)]">
                  {e.secciones} {e.secciones === 1 ? "sección" : "secciones"}
                </span>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{subtitulo}</p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        {hayND
          ? "Las secciones con trama diagonal no tienen dato en la fuente: se muestran como «Sin dato / ND», nunca como cero y fuera de la escala de colores."
          : entradas.length > 0
            ? "No hay secciones sin dato para este indicador y este periodo."
            : "Sin escala de color: no hay valores observados que representar."}
      </p>
      {fuente ? <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{fuente}</p> : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Volcado a lienzo (proyección con `map.project`, sin dependencias)
// ─────────────────────────────────────────────────────────────────────────────

function dibujarTeselas(ctx: CanvasRenderingContext2D, host: HTMLElement): void {
  const contenedor = host.getBoundingClientRect();
  const imagenes = Array.from(host.querySelectorAll<HTMLImageElement>("img.leaflet-tile"));
  for (const img of imagenes) {
    if (!img.complete || img.naturalWidth === 0) continue;
    const r = img.getBoundingClientRect();
    const x = r.left - contenedor.left;
    const y = r.top - contenedor.top;
    if (r.width < 1 || r.height < 1) continue;
    try {
      ctx.drawImage(img, x, y, r.width, r.height);
    } catch {
      // Tesela ilegible: se omite. El resto del mapa sigue saliendo.
    }
  }
}

function dibujarSecciones(
  ctx: CanvasRenderingContext2D,
  mapa: Leaflet.Map,
  features: ReadonlyArray<GeoJsonFeatureLike>,
  porClave: Map<string, FilaAtlas>,
  opciones: {
    opacidad: number;
    mostrarBordes: boolean;
    mostrarEtiquetas: boolean;
    seleccion: string | null;
  },
): void {
  // Coordenadas RELATIVAS AL CONTENEDOR, igual que las teselas (que se colocan
  // con `getBoundingClientRect`). `map.project()` devuelve píxeles ABSOLUTOS del
  // mundo en ese zoom, así que las secciones caían fuera del lienzo y el PNG
  // salía solo con el mapa base. `latLngToContainerPoint` sí comparte sistema
  // con el volcado de teselas.
  const aPx = (lonlat: [number, number]): Leaflet.Point =>
    mapa.latLngToContainerPoint([lonlat[1], lonlat[0]]);
  const trama = patronTramaSinDato(ctx, COLOR_SIN_DATO, COLOR_CONTORNO_SIN_DATO, 8);
  const opacidad = Math.max(0.08, Math.min(1, opciones.opacidad));
  const t = {
    hueso: tokenIma("--hueso"),
    texto: tokenIma("--carbon-600"),
    textoSuave: tokenIma("--carbon-400"),
  };

  for (const f of features) {
    const fila = porClave.get(f.key);
    const plano = Boolean(fila?.sinRelleno);
    const { anillos, tipo } = anillosDeGeometria(f.geometry);
    if (anillos.length && (tipo === "Polygon" || tipo === "MultiPolygon")) {
      // `evenodd` para que los anillos internos (agujeros) no se rellenen.
      // En modo plano (sin indicador cargado) no se rellena ni se traman los
      // polígonos: solo contorno, para que el callejero y los límites se lean.
      if (!plano) {
        ctx.save();
        ctx.globalAlpha = opacidad;
        ctx.beginPath();
        for (const anillo of anillos) {
          trazarAnillo(ctx, anillo, aPx);
        }
        ctx.fillStyle = fila?.color ?? COLOR_SIN_DATO;
        ctx.fill("evenodd");
        if (fila?.esSinDato) {
          ctx.fillStyle = trama;
          ctx.fill("evenodd");
        }
        ctx.restore();
      }
      if (!plano && (opciones.mostrarBordes || (opciones.seleccion && f.key === opciones.seleccion))) {
        ctx.beginPath();
        for (const anillo of anillos) trazarAnillo(ctx, anillo, aPx);
        ctx.strokeStyle = f.key === opciones.seleccion ? t.texto : (fila?.colorContorno ?? COLOR_CONTORNO_SIN_DATO);
        ctx.lineWidth = f.key === opciones.seleccion ? 2 : 0.8;
        ctx.lineJoin = "round";
        ctx.stroke();
      } else if (plano) {
        ctx.beginPath();
        for (const anillo of anillos) trazarAnillo(ctx, anillo, aPx);
        ctx.strokeStyle = f.key === opciones.seleccion ? t.texto : (fila?.colorContorno ?? COLOR_CONTORNO_SIN_DATO);
        ctx.lineWidth = f.key === opciones.seleccion ? 2 : 1;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    } else {
      const lineas = lineasDeGeometria(f.geometry);
      if (lineas.length) {
        ctx.beginPath();
        for (const l of lineas) trazarAnillo(ctx, l, aPx);
        ctx.strokeStyle = fila?.colorContorno ?? COLOR_CONTORNO_SIN_DATO;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // La sección seleccionada se repasa al final: si no, el filete hueso de las
  // vecinas, dibujadas después, taparía la mitad de su contorno carbón.
  if (opciones.seleccion) {
    const sel = features.find((f) => f.key === opciones.seleccion);
    const { anillos, tipo } = sel ? anillosDeGeometria(sel.geometry) : { anillos: [], tipo: "" };
    if (anillos.length && (tipo === "Polygon" || tipo === "MultiPolygon")) {
      ctx.beginPath();
      for (const anillo of anillos) trazarAnillo(ctx, anillo, aPx);
      ctx.strokeStyle = t.texto;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }

  // Etiquetas: se dibujan al final para que queden por encima de los rellenos.
  if (opciones.mostrarEtiquetas) {
    ctx.font = `600 10px "Poppins", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of features) {
      const centro = porClave.get(f.key)?.centroide;
      if (!centro) continue;
      const p = aPx(centro);
      const ancho = ctx.measureText(f.key).width + 6;
      const activo = f.key === opciones.seleccion;
      ctx.fillStyle = activo ? t.texto : t.hueso;
      ctx.fillRect(p.x - ancho / 2, p.y - 7, ancho, 14);
      ctx.strokeStyle = t.textoSuave;
      ctx.lineWidth = 0.6;
      ctx.strokeRect(p.x - ancho / 2, p.y - 7, ancho, 14);
      ctx.fillStyle = activo ? t.hueso : t.texto;
      ctx.fillText(f.key, p.x, p.y + 0.5);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

function trazarAnillo(
  ctx: CanvasRenderingContext2D,
  anillo: Anillo,
  aPx: (lonlat: [number, number]) => Leaflet.Point,
): void {
  let primero = true;
  for (const punto of anillo) {
    if (!Array.isArray(punto) || punto.length < 2) continue;
    const p = aPx([Number(punto[0]) || 0, Number(punto[1]) || 0]);
    if (primero) {
      ctx.moveTo(p.x, p.y);
      primero = false;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  if (!primero) ctx.closePath();
}
