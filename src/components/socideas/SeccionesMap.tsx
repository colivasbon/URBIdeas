"use client";

import { useEffect, useRef, useState } from "react";

interface SeccionFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: unknown;
}

interface SeccionesData {
  codigo_ine: string;
  anio_delimitacion: number;
  fuente: string;
  n_secciones: number;
  geojson: { type: string; features: SeccionFeature[] };
}

type Estado = "idle" | "cargando" | "ok" | "error";

function codigoSeccion(f: SeccionFeature): string {
  const p = f.properties ?? {};
  return String(p.CUSEC ?? p.CSEC ?? "?");
}

/** Mapa ligero de secciones (Leaflet bajo demanda) + listado seleccionable.
 * La geometría se pide al proxy solo cuando el usuario pulsa "Cargar". */
export default function SeccionesMap({ codigoINE, nombre }: { codigoINE: string; nombre: string }) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [datos, setDatos] = useState<SeccionesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<{ remove: () => void } | null>(null);
  const mapObj = useRef<{ remove: () => void } | null>(null);

  const cargar = async () => {
    setEstado("cargando");
    setError(null);
    // Medición dev-only de la carga bajo demanda (sin geometrías ni datos).
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const res = await fetch(`/api/socideas/secciones/${codigoINE}`);
      const j = (await res.json()) as { data: SeccionesData | null; error: string | null };
      if (!res.ok || !j.data) throw new Error(j.error ?? "Error al cargar las secciones");
      setDatos(j.data);
      setEstado("ok");
      if (process.env.NODE_ENV !== "production") {
        const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
        console.debug(`[socideas][secciones] ine=${codigoINE} n=${j.data.n_secciones} ms=${ms}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar las secciones");
      setEstado("error");
    }
  };

  useEffect(() => {
    if (estado !== "ok" || !datos || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapRef.current) return;
      layerRef.current?.remove();
      mapObj.current?.remove();
      const map = L.map(mapRef.current).setView([40.4, -3.7], 12);
      mapObj.current = map as unknown as { remove: () => void };
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap · Seccionado cedido por el INE",
        maxZoom: 18,
      }).addTo(map);
      const layer = L.geoJSON(datos.geojson as never, {
        style: { color: "#86B73D", weight: 1.5, fillOpacity: 0.15 },
        onEachFeature: (feat, l) => {
          const code = codigoSeccion(feat as unknown as SeccionFeature);
          l.bindPopup(`Sección ${code}`);
          l.on("click", () => setSeleccion(code));
        },
      }).addTo(map);
      layerRef.current = layer as unknown as { remove: () => void };
      try {
        map.fitBounds((layer as unknown as { getBounds: () => L.LatLngBounds }).getBounds(), { padding: [16, 16] });
      } catch {
        // Sin geometría válida: se mantiene la vista inicial.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [estado, datos]);

  useEffect(() => () => {
    layerRef.current?.remove();
    mapObj.current?.remove();
  }, []);

  return (
    <div>
      {estado === "idle" && (
        <div className="ideas-status premium-card" data-state="pending">
          <div className="ideas-status__head">
            <p className="editorial-eyebrow">Secciones censales · INE</p>
          </div>
          <div className="ideas-status__head mt-2">
            <p className="ideas-status__title">Geometría bajo demanda</p>
            <span className="ideas-status__badge">Pendiente</span>
          </div>
          <div className="ideas-status__body">
            <p>
              La geometría oficial de secciones (INE) se carga solo para este municipio cuando usted lo
              solicita. No se descarga ninguna capa nacional.
            </p>
            <button type="button" onClick={cargar} className="ideas-btn-primary mt-4">
              Cargar secciones de {nombre}
            </button>
          </div>
        </div>
      )}
      {estado === "cargando" && (
        <p role="status" className="text-sm font-semibold text-[var(--color-secondary)]">
          Cargando secciones oficiales…
        </p>
      )}
      {estado === "error" && (
        <div className="ideas-status premium-card" data-state="error" role="alert">
          <div className="ideas-status__head">
            <p className="ideas-status__title">No se pudieron cargar las secciones</p>
            <span className="ideas-status__badge">No disponible</span>
          </div>
          <div className="ideas-status__body">
            <p>{error}</p>
            <button type="button" onClick={cargar} className="ideas-btn-primary mt-4">
              Reintentar
            </button>
          </div>
        </div>
      )}
      {estado === "ok" && datos && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <div ref={mapRef} className="h-[22rem] w-full overflow-hidden rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] sm:h-[28rem]" role="img" aria-label={`Mapa de las ${datos.n_secciones} secciones censales de ${nombre}`} />
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {datos.n_secciones} secciones · Delimitación {datos.anio_delimitacion} · Fuente: {datos.fuente}
            </p>
          </div>
          <div className="xl:col-span-2">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Listado de secciones</h2>
            <ul className="mt-3 grid max-h-96 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3 xl:grid-cols-2">
              {datos.geojson.features.map((f) => {
                const code = codigoSeccion(f);
                const active = seleccion === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => setSeleccion(code)}
                      aria-pressed={active}
                      className="w-full rounded-lg border px-3 py-2 text-left font-mono text-xs tabular-nums transition-colors"
                      style={{
                        borderColor: active ? "var(--color-secondary)" : "var(--color-border-subtle)",
                        background: active ? "var(--color-input-bg-hover)" : "var(--color-card-bg)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {code}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="ideas-status mt-4" data-state="pending" aria-live="polite">
              <div className="ideas-status__body">
                {seleccion ? (
                  <p>
                    Sección <strong className="font-mono">{seleccion}</strong> · Delimitación{" "}
                    {datos.anio_delimitacion} · Fuente: {datos.fuente}. Datos específicos por sección:
                    pendientes de fuente oficial a este nivel territorial.
                  </p>
                ) : (
                  <p>Seleccione una sección para ver su código oficial y su disponibilidad de datos.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
