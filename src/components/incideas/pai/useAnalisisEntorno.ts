"use client";

import { useCallback, useReducer, useRef } from "react";
import type { EventoEntorno, EstadoFuente, Medicion, ResultadoEntorno } from "@/lib/incideas/pai/entorno";
import { CAPAS_IEPNB, IDS_IEPNB, paramsWfsIepnb, type IdIepnb } from "@/lib/incideas/pai/iepnbCapas";

const URL_WFS_IEPNB = "https://geoserver.iepnb.es/geoserver/wfs";

export interface FuenteProgreso {
  id: string;
  nombre: string;
  estado: EstadoFuente | "pendiente";
  ms?: number;
  detalle?: string;
}

export interface EstadoAnalisis {
  fase: "reposo" | "cargando" | "listo" | "error";
  fuentes: FuenteProgreso[];
  mediciones: Medicion[];
  ubicacion: Partial<ResultadoEntorno["ubicacion"]>;
  resultado: ResultadoEntorno | null;
  error: string | null;
  inicio: number | null;
  duracionMs: number | null;
}

const VACIO: EstadoAnalisis = { fase: "reposo", fuentes: [], mediciones: [], ubicacion: {}, resultado: null, error: null, inicio: null, duracionMs: null };

type Accion = { tipo: "empezar"; ahora: number } | { tipo: "evento"; evento: EventoEntorno; ahora: number } | { tipo: "error"; mensaje: string } | { tipo: "reiniciar" };

function reducir(estado: EstadoAnalisis, a: Accion): EstadoAnalisis {
  switch (a.tipo) {
    case "reiniciar":
      return VACIO;
    case "empezar":
      return { ...VACIO, fase: "cargando", inicio: a.ahora };
    case "error":
      return { ...estado, fase: "error", error: a.mensaje };
    case "evento": {
      const e = a.evento;
      switch (e.tipo) {
        case "inicio":
          return { ...estado, fuentes: e.fuentes.map((f) => ({ ...f, estado: "pendiente" as const })) };
        case "fuente":
          return { ...estado, fuentes: estado.fuentes.map((f) => (f.id === e.id ? { ...f, estado: e.estado, ms: e.ms ?? f.ms, detalle: e.detalle } : f)) };
        case "ubicacion":
          return { ...estado, ubicacion: { ...estado.ubicacion, ...e.datos } };
        case "mediciones":
          return { ...estado, mediciones: [...estado.mediciones, ...e.items] };
        case "actualizar":
          return { ...estado, mediciones: estado.mediciones.map((m) => (m.id === e.id ? { ...m, ...e.parche } : m)) };
        case "fin":
          return { ...estado, fase: "listo", resultado: e.resultado, duracionMs: estado.inicio ? a.ahora - estado.inicio : null };
      }
    }
  }
}

const GRADOS_M = 111_000;

function bboxGeometria(g: GeoJSON.Geometry): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90;
  const rec = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1] as number); n = Math.max(n, c[1] as number);
    } else if (Array.isArray(c)) c.forEach(rec);
  };
  if (g.type === "GeometryCollection") g.geometries.forEach((x) => rec((x as { coordinates?: unknown }).coordinates));
  else rec(g.coordinates);
  return [w, s, e, n];
}

async function descargarIepnb(ids: IdIepnb[], g: GeoJSON.Geometry, signal: AbortSignal) {
  const [w, s, e, n] = bboxGeometria(g);
  const cos = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const salida: Partial<Record<IdIepnb, GeoJSON.Feature[]>> = {};
  await Promise.all(
    ids.map(async (id) => {
      const c = CAPAS_IEPNB[id];
      const dLat = c.radio / GRADOS_M;
      const dLng = c.radio / (GRADOS_M * cos);
      try {
        const r = await fetch(`${URL_WFS_IEPNB}?${paramsWfsIepnb(c, [w - dLng, s - dLat, e + dLng, n + dLat])}`, { signal });
        if (r.ok) salida[id] = ((await r.json()) as GeoJSON.FeatureCollection).features ?? [];
      } catch {
        // Se mantiene el aviso del servidor para esa capa.
      }
    })
  );
  return salida;
}

/** Lanza el análisis y va aplicando los eventos NDJSON del servidor según llegan. */
export function useAnalisisEntorno() {
  const [estado, dispatch] = useReducer(reducir, VACIO);
  const controlador = useRef<AbortController | null>(null);

  const cancelar = useCallback(() => {
    controlador.current?.abort();
    controlador.current = null;
  }, []);

  const reiniciar = useCallback(() => {
    cancelar();
    dispatch({ tipo: "reiniciar" });
  }, [cancelar]);

  const analizar = useCallback(
    async (geometry: GeoJSON.Geometry, iepnb?: Partial<Record<IdIepnb, GeoJSON.Feature[]>>) => {
      cancelar();
      const ctl = new AbortController();
      controlador.current = ctl;
      dispatch({ tipo: "empezar", ahora: Date.now() });
      try {
        const r = await fetch("/api/incideas/pai/entorno?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry, iepnb }),
          signal: ctl.signal,
        });
        if (!r.ok || !r.body) {
          const j = await r.json().catch(() => null);
          throw new Error(j?.error ?? `Error ${r.status} en el análisis`);
        }
        const lector = r.body.getReader();
        const decodificador = new TextDecoder();
        let resto = "";
        let terminado = false;
        const fallidasIepnb: IdIepnb[] = [];
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += decodificador.decode(value, { stream: true });
          let i: number;
          while ((i = resto.indexOf("\n")) >= 0) {
            const linea = resto.slice(0, i).trim();
            resto = resto.slice(i + 1);
            if (!linea) continue;
            const ev = JSON.parse(linea) as EventoEntorno | { tipo: "error"; mensaje: string };
            if (ev.tipo === "error") throw new Error(ev.mensaje);
            if (ev.tipo === "fin") terminado = true;
            if (ev.tipo === "fuente" && ev.estado === "error" && (IDS_IEPNB as string[]).includes(ev.id)) fallidasIepnb.push(ev.id as IdIepnb);
            dispatch({ tipo: "evento", evento: ev, ahora: Date.now() });
          }
        }
        if (!terminado) throw new Error("La conexión se cerró antes de terminar el análisis");
        // El geoserver del IEPNB rechaza (403) a algunos servidores: se descargan esas capas desde el
        // navegador (CORS abierto) y se repite el análisis con ellas.
        if (fallidasIepnb.length && !iepnb) {
          const capas = await descargarIepnb(fallidasIepnb, geometry, ctl.signal);
          if (Object.keys(capas).length) {
            analizar(geometry, capas);
          }
        }
      } catch (err) {
        if (ctl.signal.aborted) return;
        dispatch({ tipo: "error", mensaje: err instanceof Error ? err.message : "Error en el análisis" });
      }
    },
    [cancelar]
  );

  return { estado, analizar, cancelar, reiniciar };
}
