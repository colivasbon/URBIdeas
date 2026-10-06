"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { parseFile } from "@/components/mapa/fileLayerUtils";
import { GRUPOS } from "@/lib/incideas/pai/grupos";
import { CAPAS_OFICIALES, FONDOS } from "./mapa/capas";
import {
  CapaWms,
  CapasFondo,
  CoordenadasRaton,
  EscalaMapa,
  PulsoOrigen,
  Redimensionador,
} from "./mapa/ElementosMapa";
import ComposerFiguras, {
  type ApiFiguras,
  type ModoMapa,
} from "./mapa/ComposerFiguras";
import MedicionesMapa from "./mapa/MedicionesMapa";
import BuscadorMapa from "./mapa/BuscadorMapa";
import BotonesMapa from "./mapa/BotonesMapa";
import { descargar, medicionesAGeoJSON, medicionesAKML } from "./mapa/exportar";
import {
  ambitoDeFiguras,
  firmaAmbito,
  limitesGeometria,
  resumenAmbito,
  type Figura,
} from "./mapa/figuras";
import styles from "./mapa/mapa.module.css";
import PanelCapas, { type EstadoCapa } from "./PanelCapas";
import PanelDistancias, { type FiltrosMedicion } from "./PanelDistancias";
import PanelFiguras from "./PanelFiguras";
import ResultadoEntornoPAI from "./ResultadoEntornoPAI";
import { useAnalisisEntorno } from "./useAnalisisEntorno";

type Pestana = "figuras" | "capas" | "distancias";

const TODOS_LOS_GRUPOS = () => new Set(GRUPOS.map((g) => g.id));
const CAPAS_INICIALES = (): Record<string, EstadoCapa> =>
  Object.fromEntries(
    CAPAS_OFICIALES.map((c) => [c.id, { activa: false, opacidad: c.opacidad }]),
  );

export default function AnalisisEntornoPAI() {
  const [fondoId, setFondoId] = useState("ign");
  const [capas, setCapas] =
    useState<Record<string, EstadoCapa>>(CAPAS_INICIALES);
  const [figuras, setFiguras] = useState<Figura[]>([]);
  const [modo, setModo] = useState<ModoMapa | null>(null);
  const [pestana, setPestana] = useState<Pestana>("figuras");
  const [nombre, setNombre] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [figuraResaltada, setFiguraResaltada] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosMedicion>({
    grupos: TODOS_LOS_GRUPOS(),
    maxKm: null,
    texto: "",
  });
  const [etiquetas, setEtiquetas] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [firmaAnalizada, setFirmaAnalizada] = useState<string | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [geomanListo, setGeomanListo] = useState(false);

  const { estado, analizar, reiniciar } = useAnalisisEntorno();
  const mapaRef = useRef<L.Map | null>(null);
  const apiRef = useRef<ApiFiguras | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  // geoman solo se engancha a los mapas creados después de cargarlo y espera la global `L`,
  // que el build ESM de Leaflet no registra por sí mismo.
  useEffect(() => {
    (window as unknown as { L?: typeof L }).L ??= L;
    let activo = true;
    void import("@geoman-io/leaflet-geoman-free").then(
      () => activo && setGeomanListo(true),
    );
    return () => {
      activo = false;
    };
  }, []);

  const fondo = FONDOS.find((f) => f.id === fondoId) ?? FONDOS[0];
  const ambito = useMemo(() => ambitoDeFiguras(figuras), [figuras]);
  const cargando = estado.fase === "cargando";
  const ambitoCambiado =
    estado.fase === "listo" &&
    firmaAnalizada !== null &&
    firmaAnalizada !== firmaAmbito(figuras);

  const visibles = useMemo(() => {
    const t = filtros.texto.trim().toLowerCase();
    return estado.mediciones.filter(
      (m) =>
        filtros.grupos.has(m.grupo) &&
        (filtros.maxKm === null || m.distancia <= filtros.maxKm * 1000) &&
        (!t || m.nombre.toLowerCase().includes(t)),
    );
  }, [estado.mediciones, filtros]);

  // ── Encuadres ──
  const encuadrarFiguras = useCallback(() => {
    const b = ambito ? limitesGeometria(ambito) : null;
    if (b && mapaRef.current)
      mapaRef.current.flyToBounds(b, {
        padding: [90, 90],
        maxZoom: 16,
        duration: 0.7,
      });
  }, [ambito]);

  const encuadrarMediciones = useCallback(
    (soloCercanas: boolean) => {
      const mapa = mapaRef.current;
      if (!mapa) return;
      const b = L.latLngBounds([]);
      const base = ambito ? limitesGeometria(ambito) : null;
      if (base) b.extend(base);
      const candidatas = visibles.filter((m) => m.distancia > 0);
      const cercanas = soloCercanas
        ? candidatas.filter((m) => m.distancia <= 12000)
        : candidatas;
      for (const m of cercanas.length ? cercanas : candidatas)
        b.extend([m.linea[1][1], m.linea[1][0]]);
      if (b.isValid())
        mapa.flyToBounds(b, { padding: [70, 70], maxZoom: 16, duration: 0.9 });
    },
    [ambito, visibles],
  );

  // Al terminar el análisis se encuadran el ámbito y las mediciones cercanas.
  const faseAnterior = useRef(estado.fase);
  useEffect(() => {
    if (faseAnterior.current === "cargando" && estado.fase === "listo")
      encuadrarMediciones(true);
    faseAnterior.current = estado.fase;
  }, [estado.fase, encuadrarMediciones]);

  // ── Pantalla completa ──
  useEffect(() => {
    const alCambiar = () =>
      setPantallaCompleta(document.fullscreenElement === contenedor.current);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  const alternarPantalla = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await contenedor.current?.requestFullscreen();
    } catch {
      // El navegador puede denegar la pantalla completa; el visor sigue funcionando.
    }
  };

  // ── Figuras ──
  const cambioModo = useCallback(
    (c: { modo: ModoMapa; activo: boolean }) =>
      setModo((m) => (c.activo ? c.modo : m === c.modo ? null : m)),
    [],
  );
  const elegirModo = (m: ModoMapa) =>
    apiRef.current?.activarModo(modo === m ? null : m);

  const cargarArchivo = async (file: File) => {
    setErrorArchivo(null);
    try {
      const capasArchivo = await parseFile(file);
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: capasArchivo.flatMap((c) => c.geojson.features),
      };
      const base = file.name.replace(/\.[^.]+$/, "");
      const nuevas = apiRef.current?.agregarGeoJSON(fc, base) ?? [];
      if (!nuevas.length)
        throw new Error("El archivo no contiene geometrías utilizables.");
      setFiguras((f) => [...f, ...nuevas]);
      setNombre((n) => n || base);
    } catch (err) {
      setErrorArchivo(
        err instanceof Error ? err.message : "No se pudo leer el archivo.",
      );
    }
  };

  const eliminarFigura = (id: string) => {
    apiRef.current?.eliminar(id);
    setFiguras((fs) => fs.filter((f) => f.id !== id));
  };
  const quitarTodas = () => {
    figuras.forEach((f) => apiRef.current?.eliminar(f.id));
    setFiguras([]);
    reiniciar();
    setFirmaAnalizada(null);
  };

  // ── Análisis ──
  const lanzarAnalisis = () => {
    if (!ambito) return;
    apiRef.current?.activarModo(null);
    setFirmaAnalizada(firmaAmbito(figuras));
    setSeleccion(null);
    setHover(null);
    setFiltros((f) => ({ ...f, grupos: TODOS_LOS_GRUPOS(), texto: "" }));
    setPestana("distancias");
    encuadrarFiguras();
    void analizar(ambito);
  };

  const seleccionar = useCallback(
    (id: string, desdeMapa = false) => {
      setSeleccion(id);
      if (desdeMapa) setPestana("distancias");
      const m = estado.mediciones.find((x) => x.id === id);
      if (m && !desdeMapa && m.distancia > 0) {
        mapaRef.current?.flyToBounds(
          [
            [m.linea[0][1], m.linea[0][0]],
            [m.linea[1][1], m.linea[1][0]],
          ],
          { padding: [110, 110], maxZoom: 16, duration: 0.7 },
        );
      }
    },
    [estado.mediciones],
  );

  const exportar = (formato: "geojson" | "kml") => {
    const slug = (nombre || "entorno").replace(/[^\wáéíóúñü-]+/gi, "_");
    if (formato === "geojson")
      descargar(
        `mediciones_${slug}.geojson`,
        JSON.stringify(medicionesAGeoJSON(visibles)),
        "application/geo+json",
      );
    else
      descargar(
        `mediciones_${slug}.kml`,
        medicionesAKML(visibles, `Mediciones ${nombre || "entorno"}`),
        "application/vnd.google-earth.kml+xml",
      );
  };

  const centroOrigen: [number, number] | null =
    typeof estado.ubicacion.lng === "number" &&
    typeof estado.ubicacion.lat === "number"
      ? [estado.ubicacion.lng, estado.ubicacion.lat]
      : null;

  const capasActivas = CAPAS_OFICIALES.filter((c) => capas[c.id]?.activa);
  const altura = pantallaCompleta
    ? "lg:h-[calc(100vh-24px)]"
    : "lg:h-[clamp(600px,calc(100vh-190px),920px)]";

  const pestanas: { id: Pestana; etiqueta: string; contador?: number }[] = [
    {
      id: "figuras",
      etiqueta: "Figuras",
      contador: figuras.length || undefined,
    },
    {
      id: "capas",
      etiqueta: "Capas",
      contador: capasActivas.length || undefined,
    },
    {
      id: "distancias",
      etiqueta: "Distancias",
      contador: estado.mediciones.length || undefined,
    },
  ];

  return (
    <div
      ref={contenedor}
      className={`space-y-8 ${pantallaCompleta ? styles.pantallaCompleta : ""}`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div
          className={`relative h-[68vh] min-h-[440px] overflow-hidden rounded-[6px] border border-[var(--border-subtle)] ${altura} ${styles.mapa}`}
        >
          {!geomanListo ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              Cargando mapa…
            </div>
          ) : (
            <MapContainer
              ref={mapaRef}
              center={[40.2, -3.6]}
              zoom={6}
              minZoom={4}
              maxZoom={22}
              zoomControl={false}
              zoomSnap={0.25}
              zoomDelta={0.5}
              wheelPxPerZoomLevel={100}
              style={{ height: "100%", width: "100%", background: "#dfe3df" }}
            >
              <CapasFondo fondo={fondo} />
              {capasActivas.map((c, i) => (
                <CapaWms
                  key={c.id}
                  url={c.url}
                  layers={c.layers}
                  opacidad={capas[c.id].opacidad}
                  orden={i}
                />
              ))}
              <ComposerFiguras
                figuras={figuras}
                resaltada={figuraResaltada}
                apiRef={apiRef}
                onCrear={(f) => setFiguras((fs) => [...fs, f])}
                onGeometria={(id, geometry, radio) =>
                  setFiguras((fs) =>
                    fs.map((f) =>
                      f.id === id
                        ? { ...f, geometry, radio: radio ?? f.radio }
                        : f,
                    ),
                  )
                }
                onEliminar={(id) =>
                  setFiguras((fs) => fs.filter((f) => f.id !== id))
                }
                onModo={cambioModo}
              />
              <MedicionesMapa
                items={visibles}
                resaltado={hover}
                seleccionado={seleccion}
                etiquetas={etiquetas}
                onHover={setHover}
                onSeleccion={(id) => seleccionar(id, true)}
              />
              <PulsoOrigen centro={centroOrigen} activo={cargando} />
              <EscalaMapa />
              <ZoomControl position="bottomright" />
              <Redimensionador />
              <CoordenadasRaton />
              <BuscadorMapa />
              <BotonesMapa
                pantallaCompleta={pantallaCompleta}
                hayFiguras={!!ambito}
                hayMediciones={visibles.length > 0}
                onPantallaCompleta={alternarPantalla}
                onEncuadrarFiguras={encuadrarFiguras}
                onEncuadrarMediciones={() => encuadrarMediciones(false)}
              />
            </MapContainer>
          )}
        </div>

        <aside
          className={`flex min-h-[520px] flex-col overflow-hidden rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${altura}`}
        >
          <div
            role="tablist"
            aria-label="Paneles del visor"
            className="flex border-b border-[var(--border-subtle)]"
          >
            {pestanas.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={pestana === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setPestana(t.id)}
                className={`flex-1 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  pestana === t.id
                    ? "border-[var(--moss-ink)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {t.etiqueta}
                {t.contador ? (
                  <span className="ml-1.5 rounded-[6px] bg-[var(--surface-note)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                    {t.contador}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div
            id={`panel-${pestana}`}
            role="tabpanel"
            aria-labelledby={`tab-${pestana}`}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {pestana === "figuras" && (
              <PanelFiguras
                figuras={figuras}
                modo={modo}
                nombreProyecto={nombre}
                errorArchivo={errorArchivo}
                onNombreProyecto={setNombre}
                onModo={elegirModo}
                onArchivo={cargarArchivo}
                onRenombrar={(id, n) =>
                  setFiguras((fs) =>
                    fs.map((f) => (f.id === id ? { ...f, nombre: n } : f)),
                  )
                }
                onIncluir={(id, v) =>
                  setFiguras((fs) =>
                    fs.map((f) => (f.id === id ? { ...f, incluida: v } : f)),
                  )
                }
                onZoom={(id) => apiRef.current?.zoomA(id)}
                onEliminar={eliminarFigura}
                onResaltar={setFiguraResaltada}
                onLimpiar={quitarTodas}
              />
            )}
            {pestana === "capas" && (
              <PanelCapas
                fondo={fondoId}
                capas={capas}
                onFondo={setFondoId}
                onToggle={(id) =>
                  setCapas((c) => ({
                    ...c,
                    [id]: { ...c[id], activa: !c[id].activa },
                  }))
                }
                onOpacidad={(id, v) =>
                  setCapas((c) => ({ ...c, [id]: { ...c[id], opacidad: v } }))
                }
                onLimpiar={() => setCapas(CAPAS_INICIALES())}
              />
            )}
            {pestana === "distancias" && (
              <PanelDistancias
                estado={estado}
                visibles={visibles}
                filtros={filtros}
                etiquetas={etiquetas}
                resaltado={hover}
                seleccionado={seleccion}
                onFiltros={setFiltros}
                onEtiquetas={setEtiquetas}
                onHover={setHover}
                onSeleccion={(id) => seleccionar(id)}
                onEncuadrar={() => encuadrarMediciones(false)}
                onExportar={exportar}
              />
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                Ámbito:
              </span>{" "}
              {resumenAmbito(figuras)}
            </p>
            {ambitoCambiado && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                El ámbito ha cambiado desde el último análisis.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={lanzarAnalisis}
                disabled={!ambito || cargando}
              >
                {cargando
                  ? "Analizando…"
                  : estado.fase === "listo"
                    ? "Analizar de nuevo"
                    : "Analizar entorno"}
              </button>
              {cargando && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => reiniciar()}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {estado.resultado && (
        <ResultadoEntornoPAI resultado={estado.resultado} nombre={nombre} />
      )}
    </div>
  );
}
