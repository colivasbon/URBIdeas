"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { Medicion } from "@/lib/incideas/pai/entorno";
import { fmtDistancia } from "@/lib/incideas/pai/geo";
import { GRUPO_POR_ID } from "@/lib/incideas/pai/grupos";
import styles from "./mapa.module.css";

interface Props {
  items: Medicion[];
  resaltado: string | null;
  seleccionado: string | null;
  etiquetas: boolean;
  onHover: (id: string | null) => void;
  onSeleccion: (id: string) => void;
}

interface Entrada {
  item: Medicion;
  casing: L.Polyline;
  linea: L.Polyline;
  marcador: L.CircleMarker;
  cancelar: () => void;
}

const facil = (p: number) => 1 - Math.pow(1 - p, 3);

const reducido = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Anima de 0 a 1 con retraso y cancelación; sin animación si el usuario lo ha desactivado. */
function animar(duracion: number, retraso: number, paso: (t: number) => void, fin?: () => void): () => void {
  if (reducido()) {
    paso(1);
    fin?.();
    return () => {};
  }
  let raf = 0;
  const espera = setTimeout(() => {
    const t0 = performance.now();
    const tick = (ahora: number) => {
      const p = Math.min(1, (ahora - t0) / duracion);
      paso(facil(p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fin?.();
    };
    raf = requestAnimationFrame(tick);
  }, retraso);
  return () => {
    clearTimeout(espera);
    cancelAnimationFrame(raf);
  };
}

const textoCorto = (m: Medicion) => fmtDistancia(m.distancia, m.distancia >= 1000);

/** Contenido DOM (nunca HTML) para no inyectar nombres externos. */
function contenidoLargo(m: Medicion): HTMLElement {
  const div = document.createElement("div");
  const n = document.createElement("strong");
  n.textContent = m.nombre;
  const d = document.createElement("div");
  const ruta = m.ruta ? ` · ${m.ruta.minutos} min por carretera` : "";
  d.textContent = `${fmtDistancia(m.distancia, true)}${m.rumbo ? ` al ${m.rumbo}` : ""}${ruta}`;
  div.append(n, d);
  return div;
}

const contenidoCorto = (m: Medicion): HTMLElement => {
  const s = document.createElement("span");
  s.textContent = textoCorto(m);
  return s;
};

/** Mediciones del ámbito al entorno: cada línea se dibuja con animación según llega. */
export default function MedicionesMapa({ items, resaltado, seleccionado, etiquetas, onHover, onSeleccion }: Props) {
  const map = useMap();
  const grupo = useRef<L.LayerGroup | null>(null);
  const entradas = useRef<Map<string, Entrada>>(new Map());
  const callbacks = useRef({ onHover, onSeleccion });
  const etiquetasRef = useRef(etiquetas);

  useEffect(() => {
    callbacks.current = { onHover, onSeleccion };
    etiquetasRef.current = etiquetas;
  });

  useEffect(() => {
    const g = L.layerGroup().addTo(map);
    grupo.current = g;
    const mapaEntradas = entradas.current;
    return () => {
      mapaEntradas.forEach((e) => e.cancelar());
      mapaEntradas.clear();
      g.remove();
      grupo.current = null;
    };
  }, [map]);

  const vincularTooltip = (e: Entrada) => {
    e.marcador.unbindTooltip();
    if (etiquetasRef.current) {
      e.marcador.bindTooltip(contenidoCorto(e.item), { permanent: true, direction: "top", offset: [0, -7], className: `${styles.etiqueta} ${styles.corta}`, opacity: 1 });
    } else {
      e.marcador.bindTooltip(contenidoLargo(e.item), { direction: "top", offset: [0, -7], className: styles.etiqueta, opacity: 1 });
    }
  };

  // Altas, bajas y actualizaciones de datos (p. ej. tiempos de llegada).
  useEffect(() => {
    const g = grupo.current;
    if (!g) return;
    const actuales = entradas.current;
    const ids = new Set(items.map((m) => m.id));
    for (const [id, e] of actuales) {
      if (!ids.has(id)) {
        e.cancelar();
        g.removeLayer(e.casing).removeLayer(e.linea).removeLayer(e.marcador);
        actuales.delete(id);
      }
    }
    let lote = 0;
    for (const m of items) {
      const existente = actuales.get(m.id);
      if (existente) {
        existente.item = m;
        continue;
      }
      if (m.distancia <= 0 || (m.linea[0][0] === m.linea[1][0] && m.linea[0][1] === m.linea[1][1])) continue;
      const color = GRUPO_POR_ID[m.grupo].color;
      const a = L.latLng(m.linea[0][1], m.linea[0][0]);
      const b = L.latLng(m.linea[1][1], m.linea[1][0]);
      const casing = L.polyline([a, a], { color: "#f1f1f1", weight: 6, opacity: 0.9, lineCap: "round", interactive: false, pmIgnore: true });
      const linea = L.polyline([a, a], { color, weight: 3, opacity: 1, dashArray: "9 7", lineCap: "round", interactive: false, pmIgnore: true });
      const marcador = L.circleMarker(b, { radius: 0, color: "#f1f1f1", weight: 2.5, fillColor: color, fillOpacity: 1, pmIgnore: true });
      casing.addTo(g);
      linea.addTo(g);
      const entrada: Entrada = { item: m, casing, linea, marcador, cancelar: () => {} };
      actuales.set(m.id, entrada);
      marcador.on("mouseover", () => callbacks.current.onHover(m.id));
      marcador.on("mouseout", () => callbacks.current.onHover(null));
      marcador.on("click", () => callbacks.current.onSeleccion(m.id));

      const retraso = Math.min(lote * 110, 1500);
      lote++;
      const dur = Math.min(1500, 650 + Math.sqrt(m.distancia) * 8);
      let cancelarMarcador = () => {};
      const cancelarLinea = animar(dur, retraso, (t) => {
        const p = L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
        casing.setLatLngs([a, p]);
        linea.setLatLngs([a, p]);
      }, () => {
        marcador.addTo(g);
        vincularTooltip(entrada);
        cancelarMarcador = animar(320, 0, (t) => marcador.setRadius(7 * t));
      });
      entrada.cancelar = () => {
        cancelarLinea();
        cancelarMarcador();
      };
    }
  }, [items, map]);

  // Etiquetas permanentes o información al pasar el ratón.
  useEffect(() => {
    entradas.current.forEach((e) => {
      if (grupo.current?.hasLayer(e.marcador)) vincularTooltip(e);
    });
  }, [etiquetas]);

  // Resaltado desde la lista o el propio mapa.
  useEffect(() => {
    const foco = resaltado ?? seleccionado;
    entradas.current.forEach((e, id) => {
      const normal = foco === null;
      const activo = id === foco;
      e.linea.setStyle({ weight: activo ? 5 : 3, opacity: normal || activo ? 1 : 0.22 });
      e.casing.setStyle({ weight: activo ? 8 : 6, opacity: normal || activo ? 0.9 : 0.12 });
      const visible = grupo.current?.hasLayer(e.marcador) ?? false;
      e.marcador.setStyle({ fillOpacity: normal || activo ? 1 : 0.3, opacity: normal || activo ? 1 : 0.3, ...(visible ? { radius: activo ? 9 : 7 } : {}) } as L.PathOptions);
      if (activo) {
        e.linea.bringToFront();
        e.marcador.bringToFront();
        if (resaltado === id && !etiquetasRef.current) e.marcador.openTooltip();
      } else if (!etiquetasRef.current) e.marcador.closeTooltip();
    });
  }, [resaltado, seleccionado]);

  return null;
}

