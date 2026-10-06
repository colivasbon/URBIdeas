"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { parseFile } from "@/components/mapa/fileLayerUtils";
import type { ElementoCercano, ResultadoEntorno } from "@/lib/incideas/pai/entorno";
import ResultadoEntornoPAI from "./ResultadoEntornoPAI";

// ── Capas ──────────────────────────────────────────────────────────────────────────────────

const BASES = {
  ign: {
    nombre: "Mapa IGN",
    url: "https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0&layer=IGNBaseTodo&style=default&tilematrixset=EPSG%3A3857&tilematrix={z}&tilecol={x}&tilerow={y}&format=image/jpeg",
    atribucion: "© Instituto Geográfico Nacional",
  },
  pnoa: {
    nombre: "Ortofoto PNOA",
    url: "https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=EPSG%3A3857&tilematrix={z}&tilecol={x}&tilerow={y}&format=image/jpeg",
    atribucion: "PNOA © Instituto Geográfico Nacional",
  },
  osm: {
    nombre: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    atribucion: "© colaboradores de OpenStreetMap",
  },
} as const;
type Base = keyof typeof BASES;

const IEPNB_WMS = "https://geoserver.iepnb.es/geoserver/wms";
const CAPAS = [
  { id: "enp", nombre: "Espacios Naturales Protegidos", url: IEPNB_WMS, layers: "ENP:enp", fuente: "IEPNB" },
  { id: "rn2000", nombre: "Red Natura 2000", url: IEPNB_WMS, layers: "RN2000:rn2000", fuente: "IEPNB" },
  { id: "mfe", nombre: "Mapa Forestal de España", url: IEPNB_WMS, layers: "foto_fija_mfe:ff_uso", fuente: "IEPNB" },
  { id: "montes", nombre: "Montes (MUP y públicos)", url: IEPNB_WMS, layers: "propiedad_montes:propiedad_montes", fuente: "IEPNB" },
  { id: "inundables", nombre: "Zonas inundables T=500 (ARPSI)", url: "https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones", layers: "NZ.Flood.FluvialT500", fuente: "SNCZI · IGN" },
  { id: "hidro", nombre: "Red hidrográfica", url: "https://servicios.idee.es/wms-inspire/hidrografia", layers: "HY.Network", fuente: "IGN" },
  { id: "incendios", nombre: "Frecuencia de incendios 2006-2015", url: IEPNB_WMS, layers: "incendios_forestales:frec_incend_2006_2015", fuente: "IEPNB" },
  { id: "catastro", nombre: "Catastro", url: "https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx", layers: "Catastro", fuente: "DG Catastro" },
] as const;

const COLOR_GRUPO: Record<string, string> = {
  nucleos: "#3C403E",
  infraestructuras: "#643335",
  generacion: "#86B73D",
  espacios: "#3E665C",
  forestal: "#3E665C",
  cauces: "#2F6F8F",
  medios: "#643335",
};

function CapaWms({ url, layers, opacidad }: { url: string; layers: string; opacidad: number }) {
  const map = useMap();
  useEffect(() => {
    const capa = L.tileLayer.wms(url, { layers, format: "image/png", transparent: true, opacity: opacidad, version: "1.1.1" });
    capa.addTo(map);
    return () => {
      map.removeLayer(capa);
    };
  }, [map, url, layers, opacidad]);
  return null;
}

function CapaAmbito({ geometry }: { geometry: GeoJSON.Geometry | null }) {
  const map = useMap();
  useEffect(() => {
    if (!geometry) return;
    const capa = L.geoJSON(geometry as GeoJSON.GeoJsonObject, {
      style: { color: "#3E665C", weight: 3, fillColor: "#86B73D", fillOpacity: 0.25 },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 8, color: "#F1F1F1", weight: 2, fillColor: "#3E665C", fillOpacity: 1 }),
    });
    capa.addTo(map);
    const b = capa.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [60, 60], maxZoom: 15 });
    return () => {
      map.removeLayer(capa);
    };
  }, [map, geometry]);
  return null;
}

function ClicPunto({ activo, onPunto }: { activo: boolean; onPunto: (lng: number, lat: number) => void }) {
  const map = useMapEvents({
    click(e) {
      if (activo) onPunto(e.latlng.lng, e.latlng.lat);
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = activo ? "crosshair" : "";
  }, [map, activo]);
  return null;
}

/** Une las geometrías de un archivo en una sola: prioriza polígonos, después líneas y puntos. */
function geometriaDeArchivo(fcs: GeoJSON.FeatureCollection[]): GeoJSON.Geometry | null {
  const polis: GeoJSON.Position[][][] = [];
  const lineas: GeoJSON.Position[][] = [];
  const puntos: GeoJSON.Position[] = [];
  const plano = (p: GeoJSON.Position) => [p[0], p[1]];
  const visitar = (g: GeoJSON.Geometry | null) => {
    if (!g) return;
    switch (g.type) {
      case "Polygon":
        polis.push(g.coordinates.map((r) => r.map(plano)));
        break;
      case "MultiPolygon":
        g.coordinates.forEach((p) => polis.push(p.map((r) => r.map(plano))));
        break;
      case "LineString":
        lineas.push(g.coordinates.map(plano));
        break;
      case "MultiLineString":
        g.coordinates.forEach((l) => lineas.push(l.map(plano)));
        break;
      case "Point":
        puntos.push(plano(g.coordinates));
        break;
      case "MultiPoint":
        g.coordinates.forEach((p) => puntos.push(plano(p)));
        break;
      case "GeometryCollection":
        g.geometries.forEach(visitar);
        break;
    }
  };
  fcs.forEach((fc) => fc.features.forEach((f) => visitar(f.geometry)));
  if (polis.length) return polis.length === 1 ? { type: "Polygon", coordinates: polis[0] } : { type: "MultiPolygon", coordinates: polis };
  if (lineas.length) return lineas.length === 1 ? { type: "LineString", coordinates: lineas[0] } : { type: "MultiLineString", coordinates: lineas };
  if (puntos.length) return puntos.length === 1 ? { type: "Point", coordinates: puntos[0] } : { type: "MultiPoint", coordinates: puntos };
  return null;
}

const ll = (p: [number, number]): [number, number] => [p[1], p[0]];

const MENSAJES_ESPERA = [
  "Consultando OpenStreetMap…",
  "Consultando ENP, Red Natura 2000 y montes (IEPNB)…",
  "Leyendo el Mapa Forestal de España…",
  "Muestreando zonas inundables del SNCZI…",
  "Calculando distancias y rumbos…",
  "Estimando tiempos de llegada de los medios externos…",
];

export default function AnalisisEntornoPAI() {
  const [base, setBase] = useState<Base>("ign");
  const [capas, setCapas] = useState<Set<string>>(new Set());
  const [opacidad, setOpacidad] = useState(0.6);
  const [modoPunto, setModoPunto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ambito, setAmbito] = useState<{ geometry: GeoJSON.Geometry; origen: string } | null>(null);
  const [resultado, setResultado] = useState<ResultadoEntorno | null>(null);
  const [cargando, setCargando] = useState(false);
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cargando) return;
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, MENSAJES_ESPERA.length - 1)), 7000);
    return () => clearInterval(t);
  }, [cargando]);

  async function cargarArchivo(file: File) {
    setError(null);
    try {
      const capasArchivo = await parseFile(file);
      const g = geometriaDeArchivo(capasArchivo.map((c) => c.geojson));
      if (!g) throw new Error("El archivo no contiene geometrías utilizables.");
      setAmbito({ geometry: g, origen: file.name });
      setResultado(null);
      setModoPunto(false);
      if (!nombre) setNombre(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    }
  }

  async function analizar() {
    if (!ambito) return;
    setPaso(0);
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const r = await fetch("/api/incideas/pai/entorno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: ambito.geometry }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Error en el análisis");
      setResultado(j as ResultadoEntorno);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en el análisis");
    } finally {
      setCargando(false);
    }
  }

  const mediciones = useMemo(() => {
    if (!resultado) return [] as { el: ElementoCercano; color: string }[];
    const grupos: [string, ElementoCercano[]][] = [
      ["nucleos", resultado.nucleos],
      ["infraestructuras", resultado.infraestructuras],
      ["generacion", resultado.generacion],
      ["espacios", resultado.espacios.elementos],
      ["forestal", resultado.masaForestal.elementos],
      ["cauces", resultado.cauces.elementos],
      ["medios", resultado.mediosExternos.filter((m) => m.distancia < 30000)],
    ];
    return grupos.flatMap(([g, els]) => els.filter((e) => e.distancia > 0).map((el) => ({ el, color: COLOR_GRUPO[g] })));
  }, [resultado]);

  const toggleCapa = (id: string) =>
    setCapas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="self-start overflow-hidden rounded-[6px] border border-[var(--border-subtle)]">
          <MapContainer center={[40.2, -3.6]} zoom={6} style={{ height: 600, width: "100%" }} scrollWheelZoom>
            <TileLayer key={base} url={BASES[base].url} attribution={BASES[base].atribucion} maxZoom={19} />
            {CAPAS.filter((c) => capas.has(c.id)).map((c) => (
              <CapaWms key={c.id} url={c.url} layers={c.layers} opacidad={opacidad} />
            ))}
            <CapaAmbito geometry={ambito?.geometry ?? null} />
            <ClicPunto
              activo={modoPunto}
              onPunto={(lng, lat) => {
                setAmbito({ geometry: { type: "Point", coordinates: [lng, lat] }, origen: "Punto en el mapa" });
                setResultado(null);
                setModoPunto(false);
              }}
            />
            {mediciones.map(({ el, color }, i) => (
              <Polyline key={`l${i}`} positions={[ll(el.linea[0]), ll(el.linea[1])]} pathOptions={{ color, weight: 2, dashArray: "6 6", opacity: 0.9 }} />
            ))}
            {mediciones.map(({ el, color }, i) => (
              <CircleMarker key={`m${i}`} center={ll(el.linea[1])} radius={5} pathOptions={{ color: "#F1F1F1", weight: 1.5, fillColor: color, fillOpacity: 1 }}>
                <Tooltip>{el.frase}</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">1. Ámbito de la instalación</h2>
            <div className="mt-4">
              <label htmlFor="pai-nombre" className="field-label">Nombre del proyecto</label>
              <input id="pai-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="PSF Talega" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={`btn btn-sm ${modoPunto ? "btn-primary" : "btn-secondary"}`} aria-pressed={modoPunto} onClick={() => setModoPunto((m) => !m)}>
                {modoPunto ? "Haz clic en el mapa…" : "Marcar un punto"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputArchivo.current?.click()}>
                Cargar KMZ / KML / SHP
              </button>
              <input
                ref={inputArchivo}
                type="file"
                accept=".kmz,.kml,.geojson,.json,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) cargarArchivo(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {ambito ? (
                <>
                  Ámbito: <span className="font-medium text-[var(--text-primary)]">{ambito.origen}</span>
                  {ambito.geometry.type === "Point" && (
                    <> ({(ambito.geometry.coordinates as number[])[1].toFixed(5)}, {(ambito.geometry.coordinates as number[])[0].toFixed(5)})</>
                  )}
                </>
              ) : (
                "Carga el vallado o la implantación (KMZ, KML, GeoJSON o shapefile en ZIP) o marca un punto. Con polígono las distancias se miden desde el perímetro."
              )}
            </p>
            <button type="button" className="btn btn-primary mt-5 w-full" onClick={analizar} disabled={!ambito || cargando}>
              {cargando ? "Analizando…" : "2. Analizar entorno"}
            </button>
            {cargando && (
              <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">
                {MENSAJES_ESPERA[paso]} <span className="text-[var(--text-muted)]">(30-60 s)</span>
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-[6px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">
                {error}
              </p>
            )}
          </div>

          <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Capas</h2>
            <fieldset className="mt-3">
              <legend className="field-label">Mapa base</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(BASES) as Base[]).map((b) => (
                  <button key={b} type="button" className={`btn btn-sm ${base === b ? "btn-primary" : "btn-ghost"}`} aria-pressed={base === b} onClick={() => setBase(b)}>
                    {BASES[b].nombre}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="field-label">Capas oficiales</legend>
              <ul className="space-y-1.5">
                {CAPAS.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--moss-ink)]" checked={capas.has(c.id)} onChange={() => toggleCapa(c.id)} />
                      <span>{c.nombre}</span>
                      <span className="text-xs text-[var(--text-muted)]">{c.fuente}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <label htmlFor="pai-opacidad" className="field-label mt-4">Opacidad de capas: {Math.round(opacidad * 100)} %</label>
            <input id="pai-opacidad" type="range" min={0.2} max={1} step={0.1} value={opacidad} onChange={(e) => setOpacidad(Number(e.target.value))} className="w-full accent-[var(--moss-ink)]" />
          </div>
        </aside>
      </div>

      {resultado && <ResultadoEntornoPAI resultado={resultado} nombre={nombre} />}
    </div>
  );
}
