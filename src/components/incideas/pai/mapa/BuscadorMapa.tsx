"use client";

import { useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { SuperpuestoMapa } from "./ElementosMapa";

interface Resultado {
  nombre: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
}

/** «39.9168, -2.826» o «39,9168 -2,826» (latitud, longitud) en WGS84. */
function leerCoordenadas(texto: string): { lat: number; lng: number } | null {
  const m = texto.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lng = Number(m[2].replace(",", "."));
  return lat >= 27 && lat <= 44.5 && lng >= -19 && lng <= 5 ? { lat, lng } : null;
}

export default function BuscadorMapa() {
  const map = useMap();
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ir = (r: Resultado) => {
    if (r.bbox) map.flyToBounds(L.latLngBounds([r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]), { maxZoom: 16, duration: 0.8 });
    else map.flyTo([r.lat, r.lng], 15, { duration: 0.8 });
    setResultados(null);
  };

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const coords = leerCoordenadas(texto);
    if (coords) {
      map.flyTo([coords.lat, coords.lng], 16, { duration: 0.8 });
      setResultados(null);
      return;
    }
    if (texto.trim().length < 3) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/incideas/pai/buscar?q=${encodeURIComponent(texto.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo buscar");
      setResultados(j.resultados as Resultado[]);
      if (!j.resultados.length) setError("Sin resultados en España.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo buscar");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <SuperpuestoMapa className="absolute left-3 top-3 z-[1000] w-[min(20rem,calc(100%-9rem))]">
      <form onSubmit={buscar} role="search" className="flex overflow-hidden rounded-[6px] bg-[#F1F1F1] shadow-[0_1px_6px_rgba(0,0,0,0.3)]">
        <label htmlFor="pai-buscar" className="sr-only">Buscar un lugar o coordenadas</label>
        <input
          id="pai-buscar"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Municipio, paraje o 39.91, -2.82"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[#3C403E] placeholder:text-[#3C403E]/55 focus:outline-none"
          autoComplete="off"
        />
        <button type="submit" className="bg-[#3E665C] px-3 text-sm font-medium text-[#F1F1F1] hover:bg-[#355850] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FBE122]" disabled={buscando}>
          {buscando ? "…" : "Ir"}
        </button>
      </form>
      {error && <p role="alert" className="mt-1 rounded-[6px] bg-[#643335] px-3 py-1.5 text-xs text-[#F1F1F1]">{error}</p>}
      {resultados && resultados.length > 0 && (
        <ul className="mt-1 max-h-60 overflow-auto rounded-[6px] bg-[#F1F1F1] shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          {resultados.map((r, i) => (
            <li key={`${r.lat}${r.lng}${i}`}>
              <button type="button" onClick={() => ir(r)} className="block w-full px-3 py-2 text-left text-xs text-[#3C403E] hover:bg-[#C2E189]/60">
                {r.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SuperpuestoMapa>
  );
}
