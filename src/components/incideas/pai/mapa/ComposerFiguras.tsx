"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { circuloAPoligono, ETIQUETA_TIPO, type Figura, type TipoFigura } from "./figuras";
import styles from "./mapa.module.css";

export type ModoMapa = "punto" | "linea" | "poligono" | "rectangulo" | "circulo" | "editar" | "mover" | "rotar" | "recortar" | "borrar";

export interface ApiFiguras {
  activarModo: (modo: ModoMapa | null) => void;
  /** Añade las geometrías de un archivo como figuras; devuelve las creadas. */
  agregarGeoJSON: (fc: GeoJSON.FeatureCollection, nombreArchivo: string) => Figura[];
  eliminar: (id: string) => void;
  zoomA: (id: string) => void;
  encuadrarTodas: () => void;
}

interface Props {
  figuras: Figura[];
  resaltada: string | null;
  apiRef: MutableRefObject<ApiFiguras | null>;
  onCrear: (f: Figura) => void;
  onGeometria: (id: string, geometry: GeoJSON.Geometry, radio?: number) => void;
  onEliminar: (id: string) => void;
  onModo: (cambio: { modo: ModoMapa; activo: boolean }) => void;
}

type CapaFigura = L.Layer & { __figuraId?: string };
type EventoPM = L.LeafletEvent & { shape?: string; layer?: L.Layer; originalLayer?: L.Layer; enabled?: boolean };

const ESTILO_INCLUIDA: L.PathOptions = { color: "#3E665C", weight: 3, opacity: 1, fillColor: "#86B73D", fillOpacity: 0.28, dashArray: undefined };
const ESTILO_EXCLUIDA: L.PathOptions = { color: "#8A968A", weight: 2, opacity: 0.9, fillColor: "#B0BDB0", fillOpacity: 0.08, dashArray: "6 6" };
const ESTILO_RESALTADA: L.PathOptions = { color: "#86B73D", weight: 5, opacity: 1, fillColor: "#86B73D", fillOpacity: 0.4, dashArray: undefined };

const FORMA_A_MODO: Record<string, ModoMapa> = { Marker: "punto", Line: "linea", Polygon: "poligono", Rectangle: "rectangulo", Circle: "circulo" };
const MAX_INDIVIDUALES = 40;

function describir(layer: L.Layer): { tipo: TipoFigura; geometry: GeoJSON.Geometry; radio?: number } | null {
  if (layer instanceof L.Circle) {
    const c = layer.getLatLng();
    const r = layer.getRadius();
    return { tipo: "circulo", geometry: circuloAPoligono(c.lat, c.lng, r), radio: r };
  }
  if (layer instanceof L.Marker) return { tipo: "punto", geometry: layer.toGeoJSON().geometry };
  if (layer instanceof L.Rectangle) return { tipo: "rectangulo", geometry: layer.toGeoJSON().geometry };
  if (layer instanceof L.Polygon) return { tipo: "poligono", geometry: layer.toGeoJSON().geometry };
  if (layer instanceof L.Polyline) return { tipo: "linea", geometry: layer.toGeoJSON().geometry };
  return null;
}

function hojas(layer: L.Layer): L.Layer[] {
  return layer instanceof L.LayerGroup ? layer.getLayers().flatMap(hojas) : [layer];
}

export default function ComposerFiguras({ figuras, resaltada, apiRef, onCrear, onGeometria, onEliminar, onModo }: Props) {
  const map = useMap();
  const capas = useRef<Map<string, CapaFigura>>(new Map());
  const cuenta = useRef<Partial<Record<TipoFigura, number>>>({});
  const secuencia = useRef(0);
  const cb = useRef({ onCrear, onGeometria, onEliminar, onModo });

  useEffect(() => {
    cb.current = { onCrear, onGeometria, onEliminar, onModo };
  });

  useEffect(() => {
    const mapaCapas = capas.current;
    const iconoPunto = L.divIcon({ className: styles.punto, iconSize: [18, 18], iconAnchor: [9, 9] });
    const manejadores: [string, L.LeafletEventHandlerFn][] = [];

    const conectar = (layer: CapaFigura) => {
      const refrescar = () => {
        const id = layer.__figuraId;
        const d = id ? describir(layer) : null;
        if (id && d) cb.current.onGeometria(id, d.geometry, d.radio);
      };
      layer.on("pm:edit", refrescar);
      layer.on("pm:dragend", refrescar);
      layer.on("pm:rotateend", refrescar);
    };

    const registrar = (layer: CapaFigura, nombre?: string): Figura | null => {
      const d = describir(layer);
      if (!d) return null;
      const id = `f${++secuencia.current}${Date.now().toString(36)}`;
      layer.__figuraId = id;
      mapaCapas.set(id, layer);
      conectar(layer);
      const n = (cuenta.current[d.tipo] = (cuenta.current[d.tipo] ?? 0) + 1);
      return { id, tipo: d.tipo, nombre: nombre || `${ETIQUETA_TIPO[d.tipo]} ${n}`, geometry: d.geometry, radio: d.radio, incluida: true };
    };

    const apagar = () => {
      const pm = map.pm;
      pm.disableDraw();
      pm.disableGlobalEditMode();
      pm.disableGlobalDragMode();
      pm.disableGlobalRemovalMode();
      pm.disableGlobalCutMode();
      pm.disableGlobalRotateMode();
    };

    const api: ApiFiguras = {
      activarModo: (modo) => {
        if (!map.pm) return;
        apagar();
        if (!modo) return;
        const pm = map.pm;
        switch (modo) {
          case "punto":
            pm.enableDraw("Marker");
            break;
          case "linea":
            pm.enableDraw("Line", { finishOn: "dblclick" } as never);
            break;
          case "poligono":
            pm.enableDraw("Polygon", { finishOn: "dblclick" } as never);
            break;
          case "rectangulo":
            pm.enableDraw("Rectangle");
            break;
          case "circulo":
            pm.enableDraw("Circle");
            break;
          case "editar":
            pm.enableGlobalEditMode({ allowSelfIntersection: false });
            break;
          case "mover":
            pm.enableGlobalDragMode();
            break;
          case "rotar":
            pm.enableGlobalRotateMode();
            break;
          case "recortar":
            pm.enableGlobalCutMode({ allowSelfIntersection: false });
            break;
          case "borrar":
            pm.enableGlobalRemovalMode();
            break;
        }
      },

      agregarGeoJSON: (fc, nombreArchivo) => {
        const feats = fc.features.filter((f) => f.geometry);
        const creadas: Figura[] = [];
        const estilo = () => ESTILO_INCLUIDA;
        const puntoALayer = (_: GeoJSON.Feature, ll: L.LatLng) => L.marker(ll, { icon: iconoPunto });
        if (feats.length > MAX_INDIVIDUALES) {
          // Demasiados elementos para gestionarlos uno a uno: se importan como una sola figura fija.
          const grupo = L.geoJSON({ type: "FeatureCollection", features: feats } as GeoJSON.FeatureCollection, { style: estilo, pointToLayer: puntoALayer, pmIgnore: true } as L.GeoJSONOptions);
          grupo.addTo(map);
          const id = `f${++secuencia.current}${Date.now().toString(36)}`;
          (grupo as CapaFigura).__figuraId = id;
          mapaCapas.set(id, grupo as CapaFigura);
          const geometries = feats.flatMap((f) => (f.geometry.type === "GeometryCollection" ? f.geometry.geometries : [f.geometry]));
          creadas.push({ id, tipo: "archivo", nombre: `${nombreArchivo} (${feats.length} elementos)`, geometry: { type: "GeometryCollection", geometries }, incluida: true });
        } else {
          feats.forEach((f, i) => {
            const nombreProp = (f.properties?.name ?? f.properties?.Name ?? f.properties?.nombre) as string | undefined;
            const capa = L.geoJSON(f, { style: estilo, pointToLayer: puntoALayer });
            for (const leaf of hojas(capa)) {
              leaf.addTo(map);
              const fig = registrar(leaf as CapaFigura, nombreProp || (feats.length > 1 ? `${nombreArchivo} ${i + 1}` : nombreArchivo));
              if (fig) creadas.push(fig);
            }
          });
        }
        if (creadas.length) api.encuadrarTodas();
        return creadas;
      },

      eliminar: (id) => {
        const l = mapaCapas.get(id);
        if (l) l.remove();
        mapaCapas.delete(id);
      },

      zoomA: (id) => {
        const l = mapaCapas.get(id);
        if (!l) return;
        if (l instanceof L.Marker) map.flyTo(l.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 });
        else if ("getBounds" in l) map.flyToBounds((l as L.Polygon).getBounds(), { padding: [60, 60], maxZoom: 17, duration: 0.6 });
      },

      encuadrarTodas: () => {
        const b = L.latLngBounds([]);
        mapaCapas.forEach((l) => {
          if (l instanceof L.Marker) b.extend(l.getLatLng());
          else if ("getBounds" in l) b.extend((l as L.Polygon).getBounds());
        });
        if (b.isValid()) map.flyToBounds(b, { padding: [70, 70], maxZoom: 16, duration: 0.7 });
      },
    };
    apiRef.current = api;

    if (map.pm) {
      const pm = map.pm;
      pm.setLang("es");
      pm.setGlobalOptions({
        snappable: true,
        snapDistance: 16,
        allowSelfIntersection: false,
        continueDrawing: false,
        tooltips: true,
        pathOptions: ESTILO_INCLUIDA,
        templineStyle: { color: "#3E665C", weight: 3 },
        hintlineStyle: { color: "#3E665C", weight: 2, dashArray: [6, 6] },
        markerStyle: { icon: iconoPunto },
      } as never);

      const en = (tipo: string, fn: (e: EventoPM) => void) => {
        const h = fn as unknown as L.LeafletEventHandlerFn;
        map.on(tipo, h);
        manejadores.push([tipo, h]);
      };
      en("pm:create", (e) => {
        if (!e.layer) return;
        const fig = registrar(e.layer as CapaFigura);
        if (fig) cb.current.onCrear(fig);
      });
      en("pm:remove", (e) => {
        const id = (e.layer as CapaFigura | undefined)?.__figuraId;
        if (!id) return;
        mapaCapas.delete(id);
        cb.current.onEliminar(id);
      });
      en("pm:cut", (e) => {
        const original = e.originalLayer as CapaFigura | undefined;
        const resultado = e.layer as CapaFigura | undefined;
        const id = original?.__figuraId;
        if (!id || !resultado) return;
        if (resultado !== original) {
          resultado.__figuraId = id;
          mapaCapas.set(id, resultado);
          conectar(resultado);
        }
        const d = describir(resultado);
        if (d) cb.current.onGeometria(id, d.geometry, d.radio);
      });
      en("pm:drawstart", (e) => e.shape && FORMA_A_MODO[e.shape] && cb.current.onModo({ modo: FORMA_A_MODO[e.shape], activo: true }));
      en("pm:drawend", (e) => e.shape && FORMA_A_MODO[e.shape] && cb.current.onModo({ modo: FORMA_A_MODO[e.shape], activo: false }));
      const global: [string, ModoMapa][] = [
        ["pm:globaleditmodetoggled", "editar"],
        ["pm:globaldragmodetoggled", "mover"],
        ["pm:globalrotatemodetoggled", "rotar"],
        ["pm:globalcutmodetoggled", "recortar"],
        ["pm:globalremovalmodetoggled", "borrar"],
      ];
      for (const [evento, modo] of global) en(evento, (e) => cb.current.onModo({ modo, activo: !!e.enabled }));
    }

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") apagar();
    };
    window.addEventListener("keydown", alTeclear);

    return () => {
      window.removeEventListener("keydown", alTeclear);
      manejadores.forEach(([t, h]) => map.off(t, h));
      if (map.pm) apagar();
      mapaCapas.forEach((l) => l.remove());
      mapaCapas.clear();
      apiRef.current = null;
    };
  }, [map, apiRef]);

  // El estilo sigue al estado: figuras excluidas del ámbito en gris discontinuo, la resaltada en grande.
  useEffect(() => {
    for (const f of figuras) {
      const l = capas.current.get(f.id);
      if (!l) continue;
      if (l instanceof L.Marker) l.setOpacity(f.incluida ? 1 : 0.4);
      else if ("setStyle" in l) (l as L.Path).setStyle(f.id === resaltada ? ESTILO_RESALTADA : f.incluida ? ESTILO_INCLUIDA : ESTILO_EXCLUIDA);
    }
  }, [figuras, resaltada]);

  return null;
}
