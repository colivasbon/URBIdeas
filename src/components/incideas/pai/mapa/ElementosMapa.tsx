"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { TileLayer, useMap, useMapEvents } from "react-leaflet";
import { latLngAUtm } from "@/lib/incideas/pai/geo";
import type { FondoMapa } from "./capas";
import styles from "./mapa.module.css";

const MAX_ZOOM = 22;

const esRetina = () => typeof window !== "undefined" && window.devicePixelRatio > 1;

/** Fondo de mapa a máxima nitidez: en pantallas retina pide teselas de un nivel más. */
export function CapasFondo({ fondo }: { fondo: FondoMapa }) {
  const retina = esRetina();
  return (
    <>
      {fondo.capas.map((c, i) => {
        const dobleResolucion = retina && !c.retinaNativa;
        return (
          <TileLayer
            key={`${fondo.id}-${i}`}
            url={c.url}
            attribution={i === 0 ? fondo.atribucion : undefined}
            subdomains={c.subdominios ?? "abc"}
            maxNativeZoom={dobleResolucion ? c.maxNativeZoom - 1 : c.maxNativeZoom}
            maxZoom={MAX_ZOOM}
            detectRetina={dobleResolucion}
            keepBuffer={4}
            updateWhenZooming={false}
            zIndex={1 + i}
          />
        );
      })}
    </>
  );
}

interface WmsProps {
  url: string;
  layers: string;
  opacidad: number;
  orden: number;
}

export function CapaWms({ url, layers, opacidad, orden }: WmsProps) {
  const map = useMap();
  const ref = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    const capa = L.tileLayer.wms(url, {
      layers,
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      detectRetina: true,
      maxZoom: MAX_ZOOM,
      zIndex: 10 + orden,
      opacity: opacidad,
      updateWhenZooming: false,
    });
    capa.addTo(map);
    ref.current = capa;
    return () => {
      capa.remove();
      ref.current = null;
    };
    // La opacidad se actualiza aparte para no recargar las teselas al mover el control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, url, layers, orden]);

  useEffect(() => {
    ref.current?.setOpacity(opacidad);
  }, [opacidad]);

  return null;
}

export function EscalaMapa() {
  const map = useMap();
  useEffect(() => {
    const c = L.control.scale({ metric: true, imperial: false, position: "bottomleft", maxWidth: 140 }).addTo(map);
    return () => {
      c.remove();
    };
  }, [map]);
  return null;
}

/** Mantiene el tamaño del mapa al cambiar el contenedor (pantalla completa, paneles, ventana). */
export function Redimensionador() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Coordenadas del puntero en WGS84 y UTM ETRS89, y zoom actual. */
export function CoordenadasRaton() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const pendiente = useRef<L.LatLng | null>(null);
  const raf = useRef(0);
  const map = useMapEvents({
    mousemove(e) {
      pendiente.current = e.latlng;
      if (!raf.current)
        raf.current = requestAnimationFrame(() => {
          raf.current = 0;
          if (pendiente.current) setPos({ lat: pendiente.current.lat, lng: pendiente.current.lng });
        });
    },
    mouseout() {
      setPos(null);
    },
    zoomend() {
      setZoom(Math.round(map.getZoom() * 10) / 10);
    },
  });
  useEffect(() => {
    // Valor inicial del zoom una vez montado el mapa.
    const t = setTimeout(() => setZoom(Math.round(map.getZoom() * 10) / 10), 0);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf.current);
    };
  }, [map]);

  const utm = pos ? latLngAUtm(pos.lat, pos.lng) : null;
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-1/2 z-[500] hidden -translate-x-1/2 rounded-[6px] bg-[#3C403E]/85 px-3 py-1 text-[11px] font-medium tabular-nums text-[#F1F1F1] sm:block"
      aria-hidden="true"
    >
      {pos && utm
        ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} · UTM ${utm.huso}N X ${Math.round(utm.x).toLocaleString("es-ES")} Y ${Math.round(utm.y).toLocaleString("es-ES")}`
        : "Mueve el cursor sobre el mapa"}
      {zoom !== null ? ` · z${zoom}` : ""}
    </div>
  );
}

/** Anillos que se expanden desde el centro del ámbito mientras se consulta. */
export function PulsoOrigen({ centro, activo }: { centro: [number, number] | null; activo: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!centro || !activo) return;
    const marcador = L.marker([centro[1], centro[0]], {
      icon: L.divIcon({ className: "", html: `<div class="${styles.origen}"><div class="${styles.origenNucleo}"></div></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -500,
      pmIgnore: true,
    } as L.MarkerOptions).addTo(map);
    return () => {
      marcador.remove();
    };
  }, [map, centro, activo]);
  return null;
}

/** Contenedor para controles superpuestos: evita que sus clics y rueda lleguen al mapa. */
export function SuperpuestoMapa({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
