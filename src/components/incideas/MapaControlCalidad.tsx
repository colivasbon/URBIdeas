"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CATEGORIAS_INCIDEAS } from "@/lib/incideas/categorias";

interface Registro {
  id: string;
  nombre_oficial: string;
  categoria: string;
  subcategoria?: string;
  fuente_principal: string;
  estado_validacion: string;
  estado_espacial?: string;
  direccion?: string;
  fecha_dato?: string;
  coordenadas?: { lat: number; lng: number } | null;
}

interface Props {
  codigoINE: string;
}

function colorPunto(r: Registro): string {
  if (r.estado_validacion === "validado_tecnicamente" || r.estado_validacion === "validado_ayuntamiento")
    return "#86B73D";
  if (r.estado_espacial === "fuera_municipio") return "#643335";
  if (r.estado_espacial === "proximo_limite") return "#C9A227";
  if (r.estado_espacial === "coordenadas_sospechosas") return "#966162";
  return "#3E665C";
}

function AjustarALimite({ boundary }: { boundary: GeoJSON.Geometry | null }) {
  const map = useMap();
  useEffect(() => {
    if (!boundary) {
      map.setView([38.5342, -0.1316], 13);
      return;
    }
    try {
      const layer = L.geoJSON(boundary);
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
    } catch {
      map.setView([38.5342, -0.1316], 13);
    }
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [boundary, map]);
  return null;
}

async function obtenerPuntos(
  codigoINE: string,
  categoria: string,
  estado: string
): Promise<{ data: Registro[]; total: number }> {
  const params = new URLSearchParams({ codigo_ine: codigoINE, limit: "200" });
  if (categoria) params.set("categoria", categoria);
  if (estado) params.set("estado", estado);
  const r = await fetch(`/api/incideas/registros?${params.toString()}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Error al cargar registros");
  return j as { data: Registro[]; total: number };
}

function anillosDe(geometry: GeoJSON.Geometry | null): [number, number][][] {
  if (!geometry) return [];
  const toLatLng = (ring: number[][]): [number, number][] =>
    ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  if (geometry.type === "Polygon") {
    return [toLatLng((geometry.coordinates as number[][][])[0])];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).map((p) => toLatLng(p[0]));
  }
  return [];
}

export default function MapaControlCalidad({ codigoINE }: Props) {
  const [boundary, setBoundary] = useState<GeoJSON.Geometry | null>(null);
  const [puntos, setPuntos] = useState<Registro[]>([]);
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/incideas/exportar?codigo_ine=${codigoINE}&categoria=territorio&formato=geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (!fc?.features?.length) return;
        const conGeom = fc.features.find(
          (f: { geometry?: GeoJSON.Geometry }) =>
            f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
        );
        if (conGeom) setBoundary(conGeom.geometry as GeoJSON.Geometry);
      })
      .catch(() => {});
  }, [codigoINE]);

  useEffect(() => {
    let activo = true;
    obtenerPuntos(codigoINE, categoria, estado)
      .then((j) => {
        if (!activo) return;
        setPuntos((j.data ?? []) as Registro[]);
        setAviso(
          j.total > (j.data?.length ?? 0) ? `Mostrando ${j.data?.length ?? 0} de ${j.total}` : null
        );
        setError(null);
      })
      .catch((e) => {
        if (activo) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [codigoINE, categoria, estado]);

  const conCoords = useMemo(
    () => puntos.filter((p) => p.coordenadas && Number.isFinite(p.coordenadas.lat)),
    [puntos]
  );
  const anillos = useMemo(() => anillosDe(boundary), [boundary]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="mapa-categoria" className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
            Categoría
          </label>
          <select
            id="mapa-categoria"
            value={categoria}
            onChange={(e) => {
              setCargando(true);
              setCategoria(e.target.value);
            }}
            className="input"
          >
            <option value="">Todas</option>
            {CATEGORIAS_INCIDEAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mapa-estado" className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
            Estado de validación
          </label>
          <select
            id="mapa-estado"
            value={estado}
            onChange={(e) => {
              setCargando(true);
              setEstado(e.target.value);
            }}
            className="input"
          >
            <option value="">Todos</option>
            <option value="automatico_sin_revisar">Automático sin revisar</option>
            <option value="validado_tecnicamente">Validado técnicamente</option>
            <option value="validado_ayuntamiento">Validado por ayuntamiento</option>
            <option value="conflictivo">Conflictivo</option>
            <option value="potencialmente_obsoleto">Potencialmente obsoleto</option>
          </select>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {cargando ? "Cargando…" : `${conCoords.length} puntos en el mapa`}
          {aviso ? ` · ${aviso}` : ""}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[6px] bg-[var(--rupestre-50)] p-3 text-sm text-[var(--rupestre)]">
          {error}
        </p>
      )}

      <div className="h-[520px] overflow-hidden rounded-[6px] border border-[var(--border-subtle)]">
        <MapContainer center={[38.5342, -0.1316]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <AjustarALimite boundary={boundary} />
          {anillos.map((ring, i) => (
            <Polygon
              key={i}
              positions={ring}
              pathOptions={{ color: "#3E665C", weight: 2, fill: false, dashArray: "4 3" }}
            />
          ))}
          {conCoords.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.coordenadas!.lat, p.coordenadas!.lng]}
              radius={5}
              pathOptions={{ color: colorPunto(p), fillColor: colorPunto(p), fillOpacity: 0.85, weight: 1 }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <strong>{p.nombre_oficial}</strong>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <div>Categoría: {p.categoria}{p.subcategoria ? ` / ${p.subcategoria}` : ""}</div>
                    <div>Fuente: {p.fuente_principal}</div>
                    <div>Estado: {p.estado_validacion}</div>
                    {p.estado_espacial && <div>Espacial: {p.estado_espacial}</div>}
                    {p.fecha_dato && <div>Fecha: {p.fecha_dato}</div>}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <ul className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]" aria-label="Leyenda">
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#3E665C" }} /> Automático sin revisar</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#86B73D" }} /> Validado</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#643335" }} /> Fuera del municipio</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#C9A227" }} /> Próximo al límite</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#966162" }} /> Coordenadas sospechosas</li>
      </ul>
    </div>
  );
}
