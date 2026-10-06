"use client";

import { useCallback, useReducer, useRef } from "react";
import type { EventoEntorno, EstadoFuente, Medicion, ResultadoEntorno } from "@/lib/incideas/pai/entorno";

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
    async (geometry: GeoJSON.Geometry) => {
      cancelar();
      const ctl = new AbortController();
      controlador.current = ctl;
      dispatch({ tipo: "empezar", ahora: Date.now() });
      try {
        const r = await fetch("/api/incideas/pai/entorno?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry }),
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
            dispatch({ tipo: "evento", evento: ev, ahora: Date.now() });
          }
        }
        if (!terminado) throw new Error("La conexión se cerró antes de terminar el análisis");
      } catch (err) {
        if (ctl.signal.aborted) return;
        dispatch({ tipo: "error", mensaje: err instanceof Error ? err.message : "Error en el análisis" });
      }
    },
    [cancelar]
  );

  return { estado, analizar, cancelar, reiniciar };
}
