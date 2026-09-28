"use client";

// Atlas coroplético de secciones censales de SOCideas.
//
// Este es el componente que la página ya importa como `SeccionesMap`; mantiene
// la firma de props original (`{ codigoINE, nombre }`) para no romper nada.
//
// QUÉ HACE
//  - Pide la geometría y el atlas estadístico al proxy del municipio SOLO
//    cuando el usuario lo pide (el texto de la página lo promete así).
//  - Une geometría y estadística por `CUSEC` → `observations[sec][ind][per]`,
//    nunca por resta ni por valor municipal.
//  - Calcula la clasificación con `clasificar()` del contrato compartido.
//  - Mantiene el estado de lectura en la URL (`?ind=`, `?anio=`, `?modo=`,
//    `?clases=`, `?sec=`), validando cada parámetro contra el catálogo y
//    volviendo al valor por defecto si no encaja.
//  - Compone y descarga el PNG con la vista completa, leyenda y atribuciones.
//
// QUÉ NO HACE
//  - No inventa un valor. Si el `atlas` no viene, muestra los contornos y un
//    estado vacío honesto: no hay coropleta que dibujar.
//  - No convierte un ND en 0 ni lo mete en una clase de color.
//  - Ningún control de presentación cambia un dato.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CLASES_MAXIMO,
  CLASES_MINIMO,
  COLOR_CONTORNO_SIN_DATO,
  COLOR_SIN_DATO,
  RAMPA_SECUENCIAL,
  SECCIONES_ATRIBUCION,
  admiteValor,
  clasificar,
  coberturaDePeriodo,
  esPoligonoDistrito,
  formatearValor,
  isValidSeccionKey,
  validarSeccionesAtlas,
} from "@/lib/socideas-secciones";
import type {
  ModoClasificacion,
  ResultadoClasificacion,
  ResultadoValidacion,
  SeccionFeature,
  SeccionIndicador,
  SeccionPorPeriodo,
  SeccionValorStatus,
  SeccionesAtlasV1,
} from "@/lib/socideas-secciones";
import { componerPngMapa, nombreArchivoPngSecciones, tokenIma, type EscalaPng } from "@/lib/socideas-secciones-png";
import SeccionesAtlasMap, {
  centroideGeometria,
  type EntradaLeyendaAtlas,
  type FilaAtlas,
  type GeoJsonFeatureLike,
  type HandleAtlas,
  type PresentacionAtlas,
} from "./SeccionesAtlasMap";
import SeccionesAtlasPanel, { avisoDeCortes } from "./SeccionesAtlasPanel";
import SeccionesAtlasTable from "./SeccionesAtlasTable";
import SeccionesAtlasDetalle from "./SeccionesAtlasDetalle";

type Estado = "idle" | "cargando" | "ok" | "error";

const CLASES_POR_DEFECTO = 5;
const MODO_POR_DEFECTO: ModoClasificacion = "cuantil";
const ETIQUETA_SIN_DATO = "Sin dato / ND";
const MS_ESPERA_MAPA = 4000;

interface RespuestaApi {
  data: {
    codigo_ine: string;
    anio_delimitacion: number;
    fuente: string;
    n_secciones: number;
    geojson: { type: string; features: Array<{ type: string; properties: Record<string, unknown>; geometry: unknown }> };
    atlas?: SeccionesAtlasV1 | null;
  } | null;
  error: string | null;
  count?: number;
}

const PRESENTACION_POR_DEFECTO: PresentacionAtlas = {
  opacidad: 0.85,
  mostrarBordes: true,
  mostrarEtiquetas: false,
  basemap: true,
  divergente: false,
  cortesManuales: null,
  escalaPng: 1,
};

export default function SeccionesMap({ codigoINE, nombre }: { codigoINE: string; nombre: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [estado, setEstado] = useState<Estado>("idle");
  const [datos, setDatos] = useState<RespuestaApi["data"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null);
  const [presentacion, setPresentacion] = useState<PresentacionAtlas>(PRESENTACION_POR_DEFECTO);
  const [hovered, setHovered] = useState<string | null>(null);
  const [vista, setVista] = useState<"mapa" | "tabla">("mapa");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const mapaRef = useRef<HandleAtlas | null>(null);

  // ── Carga bajo demanda ──────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setEstado("cargando");
    setError(null);
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const res = await fetch(`/api/socideas/secciones/${codigoINE}`);
      const j = (await res.json()) as RespuestaApi;
      if (!res.ok || !j.data) throw new Error(j.error ?? "Error al cargar las secciones");
      setDatos(j.data);
      // Validación fail-closed del contrato: si la fuente no pasa, se declara.
      setValidacion(j.data.atlas ? validarSeccionesAtlas(j.data.atlas) : null);
      setEstado("ok");
      if (process.env.NODE_ENV !== "production") {
        const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
        // Métrica dev-only: sin geometrías ni datos personales.
        console.debug(`[socideas][secciones-atlas] ine=${codigoINE} n=${j.data.n_secciones} ms=${ms}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar las secciones");
      setEstado("error");
    }
  }, [codigoINE]);

  // ── Geometría normalizada ───────────────────────────────────────────────
  const geometria = useMemo(() => normalizarGeometria(datos), [datos]);

  // ── Catálogo y valores por defecto ──────────────────────────────────────
  const atlas = datos?.atlas ?? null;
  const indicadores = useMemo<ReadonlyArray<SeccionIndicador>>(() => {
    if (!atlas) return [];
    return [...atlas.indicators].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  }, [atlas]);

  const indicadorPorDefecto = useMemo(() => {
    const publicado = indicadores.find((i) => i.publicadoPorSeccion);
    return (publicado ?? indicadores[0])?.id ?? null;
  }, [indicadores]);

  const periodosDe = useCallback(
    (indicatorId: string | null): number[] => {
      if (!atlas || !indicatorId) return [];
      const cob = atlas.cobertura.find((c) => c.indicatorId === indicatorId);
      if (cob && cob.periodos.length) return [...cob.periodos].sort((a, b) => b - a);
      // Sin entrada de cobertura: se deduce del propio diccionario de observaciones.
      const vistos = new Set<number>();
      for (const porIndicador of Object.values(atlas.observations ?? {})) {
        for (const periodo of Object.keys(porIndicador?.[indicatorId] ?? {})) {
          const n = Number(periodo);
          if (Number.isFinite(n)) vistos.add(n);
        }
      }
      return [...vistos].sort((a, b) => b - a);
    },
    [atlas],
  );

  const anioPorDefecto = useCallback(
    (indicatorId: string | null): number | null => {
      if (!atlas || !indicatorId) return null;
      const porDefecto = atlas.cobertura.find((c) => c.indicatorId === indicatorId)?.periodoPorDefecto ?? null;
      const periodos = periodosDe(indicatorId);
      if (porDefecto !== null && periodos.includes(porDefecto)) return porDefecto;
      return periodos[0] ?? null;
    },
    [atlas, periodosDe],
  );

  // ── Lectura de la URL, validada contra el catálogo ──────────────────────
  const params = useMemo(() => {
    const bruto = {
      ind: searchParams.get("ind"),
      anio: searchParams.get("anio"),
      modo: searchParams.get("modo"),
      clases: searchParams.get("clases"),
      sec: searchParams.get("sec"),
    };
    const indicatorId = indicadores.some((i) => i.id === bruto.ind) ? (bruto.ind as string) : indicadorPorDefecto;
    const periodos = periodosDe(indicatorId);
    const anioNum = Number(bruto.anio);
    const anio = periodos.includes(anioNum) ? anioNum : anioPorDefecto(indicatorId);
    const modo: ModoClasificacion =
      bruto.modo === "intervalos_iguales" || bruto.modo === "cortes_manuales" || bruto.modo === "cuantil"
        ? bruto.modo
        : MODO_POR_DEFECTO;
    const clasesNum = Number(bruto.clases);
    const clases =
      Number.isInteger(clasesNum) && clasesNum >= CLASES_MINIMO && clasesNum <= CLASES_MAXIMO
        ? clasesNum
        : CLASES_POR_DEFECTO;
    const sec = isValidSeccionKey(bruto.sec) ? (bruto.sec as string) : null;
    return {
      indicatorId,
      anio,
      modo,
      clases,
      sec,
      periodos,
      // Qué parámetros no cuadran con el catálogo: se limpian de la URL.
      sucios: {
        ind: bruto.ind !== null && bruto.ind !== indicatorId,
        anio: bruto.anio !== null && String(anio) !== bruto.anio,
        modo: bruto.modo !== null && bruto.modo !== modo,
        clases: bruto.clases !== null && String(clases) !== bruto.clases,
      },
    };
  }, [searchParams, indicadores, indicadorPorDefecto, periodosDe, anioPorDefecto]);

  const urlDesde = useCallback(
    (parche: {
      ind?: string | null;
      anio?: number | null;
      modo?: ModoClasificacion;
      clases?: number | null;
      sec?: string | null;
    }) => {
      const p = new URLSearchParams();
      const ind = parche.ind !== undefined ? parche.ind : params.indicatorId;
      const anio = parche.anio !== undefined ? parche.anio : params.anio;
      const modo = parche.modo !== undefined ? parche.modo : params.modo;
      const clases = parche.clases !== undefined ? parche.clases : params.clases;
      const sec = parche.sec !== undefined ? parche.sec : params.sec;
      if (ind) p.set("ind", ind);
      if (anio !== null && anio !== undefined) p.set("anio", String(anio));
      if (modo !== MODO_POR_DEFECTO) p.set("modo", modo);
      if (clases !== CLASES_POR_DEFECTO) p.set("clases", String(clases));
      if (sec) p.set("sec", sec);
      const qs = p.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname],
  );

  const escribirParams = useCallback(
    (parche: Parameters<typeof urlDesde>[0]) => router.replace(urlDesde(parche), { scroll: false }),
    [router, urlDesde],
  );

  // Limpieza de parámetros inválidos: una sola pasada, sin bucles.
  const haySucios = Object.values(params.sucios).some(Boolean);
  const urlCanonica = urlDesde({});
  useEffect(() => {
    if (haySucios) router.replace(urlCanonica, { scroll: false });
  }, [haySucios, router, urlCanonica]);

  // ── Modelo de vista ─────────────────────────────────────────────────────
  const opcionesClasificacion = useMemo(
    () => ({ cortesManuales: presentacion.cortesManuales, divergente: presentacion.divergente }),
    [presentacion.cortesManuales, presentacion.divergente],
  );

  const vista_ = useMemo(
    () =>
      construirVista(
        atlas,
        geometria,
        nombre,
        params.indicatorId,
        params.anio,
        params.modo,
        params.clases,
        opcionesClasificacion,
      ),
    [atlas, geometria, nombre, params.indicatorId, params.anio, params.modo, params.clases, opcionesClasificacion],
  );

  const seleccion = useMemo(
    () => (params.sec && vista_.filas.some((f) => f.key === params.sec) ? params.sec : null),
    [params.sec, vista_.filas],
  );

  // Una selección que ya no existe (cambió la geometría) se retira de la URL
  // en lugar de quedar apuntando a la nada.
  const haySecHuerfana = Boolean(params.sec) && !seleccion;
  useEffect(() => {
    if (haySecHuerfana) escribirParams({ sec: null });
  }, [haySecHuerfana, escribirParams]);

  const indicador = useMemo(
    () => indicadores.find((i) => i.id === params.indicatorId) ?? null,
    [indicadores, params.indicatorId],
  );

  // ── Exportación PNG ─────────────────────────────────────────────────────
  const esperarMapa = useCallback(async (): Promise<boolean> => {
    const limite = Date.now() + MS_ESPERA_MAPA;
    while (Date.now() < limite) {
      if (mapaRef.current?.puedeCapturar()) return true;
      await new Promise<void>((r) => window.setTimeout(r, 120));
    }
    return false;
  }, []);

  const exportarVista = useCallback(
    async (plano: boolean) => {
      setExportError(null);
      setExportNotice(plano ? "Componiendo el plano de secciones…" : "Componiendo el mapa…");
      setExportando(true);
      try {
        // Si el usuario está en la vista de tabla el mapa no está montado: se
        // vuelve a la vista de mapa y se espera a que Leaflet esté listo.
        if (vista !== "mapa") setVista("mapa");
        await new Promise<void>((r) => window.setTimeout(r, 0));
        if (!(await esperarMapa())) {
          throw new Error("El mapa no ha podido inicializarse a tiempo. Vuelva a la vista de mapa e inténtelo de nuevo.");
        }
        const handle = mapaRef.current;
        if (!handle) throw new Error("El mapa todavía no está listo.");

        const escalaPng = presentacion.escalaPng as EscalaPng;
        const captura = await handle.capturarParaPng(escalaPng);
        const enlazado = await componerPngMapa({
          base: captura.canvas,
          indicador: plano
            ? "Plano de secciones · sin indicadores cargados"
            : (indicador?.etiqueta ?? "Sin indicadores cargados"),
          municipio: nombre,
          provincia: atlas?.provinceName ?? null,
          anio: plano ? null : params.anio,
          unidad: plano ? "" : (indicador?.unidad ?? ""),
          modoClasificacion: plano ? "Sin clasificación" : etiquetaModo(params.modo),
          clasificacion: plano ? null : vista_.clasificacion,
          entradasLeyenda: vista_.entradasLeyenda.map((e) => ({
            etiqueta: e.etiqueta,
            color: e.color,
            secciones: e.secciones,
            esSinDato: Boolean(e.esSinDato),
          })),
          colorSinDato: COLOR_SIN_DATO,
          colorContornoSinDato: COLOR_CONTORNO_SIN_DATO,
          fuente: atlas?.geometrySource ?? datos?.fuente ?? SECCIONES_ATRIBUCION,
          // `operationLabel` ya incluye el rótulo de la operación con su ID, así
          // que aquí solo se antepone la tabla: concatenarlo dos veces duplicaba
          // "(operación …) (operación …)" en el pie del PNG.
          tabla: plano
            ? "Sin indicadores cargados en SOCideas: solo geometría oficial del INE"
            : indicador
              ? `${indicador.sourceTable} · ${indicador.operationLabel}`
              : "No consta: el municipio no tiene indicadores publicados por sección",
          anioGeometria: atlas?.geometryYear ?? datos?.anio_delimitacion ?? null,
          coleccionGeometria: atlas?.geometryCollection ?? null,
          periodo: plano ? null : params.anio,
          fechaGeometria: atlas?.geometryRetrievedAt ?? null,
          fechaEstadistica: atlas?.statsRetrievedAt ?? null,
          seccionesRepresentadas: vista_.nConDato,
          seccionesTotales: vista_.nSecciones,
          seccionesSinDato: vista_.nSinDato,
          coberturaPct: vista_.coberturaPct,
          escala: escalaPng,
          baseOmitida: captura.baseOmitida,
          avisos: vista_.avisos,
        });
        const blob = await blobDeLienzo(enlazado);
        if (!blob) throw new Error("El navegador no ha podido generar el archivo PNG.");
        const archivo = plano
          ? nombreArchivoPngSecciones(codigoINE, "plano-secciones", atlas?.geometryYear ?? null)
          : nombreArchivoPngSecciones(codigoINE, params.indicatorId ?? "sin-indicador", params.anio);
        descargar(blob, archivo);
        setExportNotice(
          plano
            ? `${archivo} descargado: plano del seccionado, sin valores. No es una coropleta.`
            : captura.baseOmitida
              ? `${archivo} descargado SIN cartografía de fondo. ${captura.motivoBaseOmitida ?? ""} Se conservan seccionado, escala, leyenda, fuente y atribuciones.`
              : `${archivo} descargado con la leyenda completa y las atribuciones del INE y de OpenStreetMap.`,
        );
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "No se ha podido generar el PNG.");
      } finally {
        setExportando(false);
      }
    },
    [
      atlas,
      codigoINE,
      datos,
      esperarMapa,
      indicador,
      nombre,
      params.anio,
      params.indicatorId,
      params.modo,
      presentacion.escalaPng,
      vista,
      vista_,
    ],
  );

  const exportarPng = useCallback(() => exportarVista(false), [exportarVista]);
  const exportarPlano = useCallback(() => exportarVista(true), [exportarVista]);

  const restablecer = useCallback(() => {
    setPresentacion({ ...PRESENTACION_POR_DEFECTO });
    setHovered(null);
    setExportError(null);
    setExportNotice(null);
    router.replace(urlDesde({ sec: null, modo: MODO_POR_DEFECTO, clases: CLASES_POR_DEFECTO }), { scroll: false });
  }, [router, urlDesde]);

  const featuresGeo: GeoJsonFeatureLike[] = useMemo(
    () => geometria.secciones.map((f) => ({ key: f.properties.CUSEC, geometry: f.geometry })),
    [geometria.secciones],
  );

  /** Vuelve a la vista de mapa (si hace falta) y acerca a una sección. */
  const irASeccion = useCallback(
    (key: string) => {
      if (vista !== "mapa") setVista("mapa");
      window.setTimeout(() => mapaRef.current?.ajustarVistaSeccion(key), 60);
    },
    [vista],
  );

  // ── Estados previos a la carga ──────────────────────────────────────────
  if (estado === "idle") {
    return (
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
            La geometría oficial de secciones (INE) y, si están publicados, los indicadores con dato a
            ese grano se cargan solo para este municipio cuando usted lo solicita. No se descarga
            ninguna capa nacional.
          </p>
          <button type="button" onClick={cargar} className="ideas-btn-primary mt-4">
            Cargar secciones de {nombre}
          </button>
        </div>
      </div>
    );
  }

  if (estado === "cargando") {
    return (
      <p role="status" className="text-sm font-semibold text-[var(--color-secondary)]">
        Cargando secciones oficiales de {nombre}…
      </p>
    );
  }

  if (estado === "error") {
    return (
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
    );
  }

  const sinAtlas = !atlas;
  const sinPeriodos = sinAtlas || params.periodos.length === 0;
  // Sin valores observados no hay coropleta que dibujar ni exportar: el mapa es
  // un plano de contornos y los controles de escala se retiran.
  const sinValoresObservados = vista_.modoMapa === "plano" || vista_.nConDato === 0;
  const filaSeleccionada = seleccion ? (vista_.filas.find((f) => f.key === seleccion) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <CabeceraAtlas
        municipioNombre={nombre}
        provincia={atlas?.provinceName ?? null}
        geometriaYear={atlas?.geometryYear ?? datos?.anio_delimitacion ?? null}
        fuente={datos?.fuente ?? SECCIONES_ATRIBUCION}
        nSecciones={vista_.nSecciones}
        nConDato={vista_.nConDato}
        nSinDato={vista_.nSinDato}
        nAgregados={geometria.agregadosDistrito.length}
        nDescartadas={geometria.descartadas.length}
        coberturaPct={vista_.coberturaPct}
        indicadorEtiqueta={indicador?.etiqueta ?? null}
        anio={params.anio}
        avisos={vista_.avisos}
        sinAtlas={sinAtlas}
        plano={sinValoresObservados}
        validacion={validacion}
      />

      {sinAtlas && (
        <div className="ideas-status" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">Todavía no hemos cargado los indicadores de {nombre}</p>
            <span className="ideas-status__badge">Solo contornos</span>
          </div>
          <div className="ideas-status__body">
            <p>
              La geometría oficial del INE está disponible ({vista_.nSecciones} secciones). Lo que falta
              es la estadística por sección: aún no se ha cargado en SOCideas para este municipio. Es un
              estado de carga, no una afirmación de que el INE no publique el indicador a escala de
              sección. Se muestran los contornos y las claves oficiales; no se pinta ninguna escala de
              color porque no hay valores que repartir, y una coropleta sin dato sería una imagen
              inventada.
            </p>
          </div>
        </div>
      )}

      {!sinAtlas && sinPeriodos && (
        <div className="ideas-status" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">Este indicador no tiene periodos publicados aquí</p>
            <span className="ideas-status__badge">Sin escala</span>
          </div>
          <div className="ideas-status__body">
            <p>
              La fuente difunde «{indicador?.etiqueta}», pero no publica ningún periodo con dato a
              nivel de sección para {nombre}. Se muestran los contornos y el estado de cada sección; no
              se proyecta ningún año sobre la geometría.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Vista principal" className="flex flex-wrap gap-2">
              <BotonVista activo={vista === "mapa"} onClick={() => setVista("mapa")}>
                Mapa
              </BotonVista>
              <BotonVista activo={vista === "tabla"} onClick={() => setVista("tabla")}>
                Tabla de secciones
              </BotonVista>
            </div>
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-expanded={panelAbierto}
              aria-controls="atlas-panel"
              className="min-h-[44px] rounded-[6px] border border-[var(--color-border)] bg-[var(--color-card-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] lg:hidden"
            >
              {panelAbierto ? "Ocultar controles" : "Controles"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {vista === "mapa" ? (
              <SeccionesAtlasMap
                ref={mapaRef}
                features={featuresGeo}
                filas={vista_.filas}
                municipioNombre={nombre}
                tituloLeyenda={vista_.tituloLeyenda}
                subtituloLeyenda={vista_.subtituloLeyenda}
                entradasLeyenda={vista_.entradasLeyenda}
                descripcion={vista_.descripcionMapa}
                presentacion={presentacion}
                seleccion={seleccion}
                hovered={hovered}
                onSeleccionar={(key) => escribirParams({ sec: key })}
                onHover={setHovered}
              />
            ) : null}

            <SeccionesAtlasDetalle
              fila={filaSeleccionada}
              indicador={indicador}
              municipioNombre={nombre}
              anio={params.anio}
              unidad={indicador?.unidad ?? ""}
              geometryYear={atlas?.geometryYear ?? datos?.anio_delimitacion ?? null}
              referenciaMunicipal={vista_.referenciaMunicipal}
              escalaSimple={vista_.escalaSimple}
              valoresDistintos={vista_.valoresDistintos}
              onAcercar={irASeccion}
              onQuitar={() => escribirParams({ sec: null })}
            />

            <SeccionesAtlasTable
              filas={vista_.filas}
              entradasLeyenda={vista_.entradasLeyenda}
              indicadorEtiqueta={indicador?.etiqueta ?? "Sin indicadores cargados"}
              municipioNombre={nombre}
              anio={params.anio}
              unidad={indicador?.unidad ?? ""}
              coberturaPct={vista_.coberturaPct}
              referenciaMunicipal={vista_.referenciaMunicipal}
              seleccion={seleccion}
              hovered={hovered}
              onSeleccionar={(key) => escribirParams({ sec: key })}
              onHover={setHovered}
              onAcercar={irASeccion}
            />
          </div>
        </div>

        <aside
          id="atlas-panel"
          aria-label="Controles del atlas"
          className={`premium-card p-4 sm:p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto ${
            panelAbierto ? "block" : "hidden lg:block"
          }`}
        >
          <SeccionesAtlasPanel
            codigoINE={codigoINE}
            indicadores={indicadores}
            indicadorId={params.indicatorId}
            periodos={params.periodos}
            anio={params.anio}
            modo={params.modo}
            clases={params.clases}
            presentacion={presentacion}
            sinIndicadores={sinPeriodos}
            plano={sinValoresObservados}
            avisoCortes={avisoDeCortes(
              presentacion.cortesManuales ? presentacion.cortesManuales.join(", ") : "",
              params.modo === "cortes_manuales",
            )}
            exporting={exportando}
            exportError={exportError}
            exportNotice={exportNotice}
            onIndicador={(id) => escribirParams({ ind: id })}
            onAnio={(a) => escribirParams({ anio: a })}
            onModo={(m) => escribirParams({ modo: m })}
            onClases={(c) => escribirParams({ clases: c })}
            onPresentacion={(patch) => setPresentacion((p) => ({ ...p, ...patch }))}
            onRestablecer={restablecer}
            onExportarPng={exportarPng}
            onExportarPlano={exportarPlano}
            urlXlsx={
              atlas
                ? `/api/socideas/secciones-descarga/${codigoINE}` +
                  (params.indicatorId ? `?ind=${encodeURIComponent(params.indicatorId)}` : '') +
                  (params.anio ? `&anio=${params.anio}` : '')
                : null
            }
          />
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de la respuesta del proxy
// ─────────────────────────────────────────────────────────────────────────────

interface GeometriaNormalizada {
  secciones: SeccionFeature[];
  /** Polígonos agregados de distrito (CSEC 000): NO son secciones. */
  agregadosDistrito: string[];
  /** Polígonos sin CUSEC válido o sin geometría: se cuentan, no se pintan. */
  descartadas: string[];
}

function normalizarGeometria(datos: RespuestaApi["data"]): GeometriaNormalizada {
  const secciones: SeccionFeature[] = [];
  const agregadosDistrito: string[] = [];
  const descartadas: string[] = [];
  for (const f of datos?.geojson?.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const cusec = String(p.CUSEC ?? "").trim();
    if (!isValidSeccionKey(cusec) || !f.geometry) {
      descartadas.push(cusec || "(sin CUSEC)");
      continue;
    }
    if (esPoligonoDistrito(cusec)) {
      agregadosDistrito.push(cusec);
      continue;
    }
    secciones.push({
      type: "Feature",
      properties: {
        CUSEC: cusec,
        CSEC: String(p.CSEC ?? cusec.slice(7)),
        CDIS: String(p.CDIS ?? cusec.slice(5, 7)),
        CUDIS: String(p.CUDIS ?? cusec.slice(5)),
        CUMUN: String(p.CUMUN ?? cusec.slice(0, 5)),
        CMUN: String(p.CMUN ?? ""),
        CPRO: String(p.CPRO ?? cusec.slice(0, 2)),
        NMUN: String(p.NMUN ?? ""),
        NPRO: String(p.NPRO ?? ""),
        TIPO: p.TIPO === null || p.TIPO === undefined ? null : String(p.TIPO),
      },
      geometry: f.geometry,
    });
  }
  secciones.sort((a, b) => a.properties.CUSEC.localeCompare(b.properties.CUSEC));
  return { secciones, agregadosDistrito, descartadas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de vista del atlas
// ─────────────────────────────────────────────────────────────────────────────

interface VistaAtlas {
  filas: FilaAtlas[];
  entradasLeyenda: EntradaLeyendaAtlas[];
  clasificacion: ResultadoClasificacion | null;
  valoresDistintos: number;
  escalaSimple: boolean;
  nSecciones: number;
  nConDato: number;
  nSinDato: number;
  coberturaPct: number;
  referenciaMunicipal: number | null;
  tituloLeyenda: string;
  subtituloLeyenda: string;
  descripcionMapa: string;
  avisos: string[];
  /** `coropleta`: hay valores observados que pintar. `plano`: solo contornos,
   *  sin relleno ni trama porque no hay nada que representar. */
  modoMapa: "coropleta" | "plano";
}

const MOTIVO_NO_CARGADO = "Todavía no cargado en SOCideas";
const MOTIVO_SIN_SELECCION = "Sin indicador seleccionado";
const MOTIVO_SIN_PERIODO = "Sin periodo publicado para este indicador";

function construirVista(
  atlas: SeccionesAtlasV1 | null,
  geometria: GeometriaNormalizada,
  municipioNombre: string,
  indicatorId: string | null,
  anio: number | null,
  modo: ModoClasificacion,
  clases: number,
  opciones: { cortesManuales: number[] | null; divergente: boolean },
): VistaAtlas {
  const secciones = geometria.secciones;
  const nSecciones = secciones.length;
  const indicador = atlas && indicatorId ? (atlas.indicators.find((i) => i.id === indicatorId) ?? null) : null;
  const unidad = indicador?.unidad ?? "";
  const avisos: string[] = [];

  // Estado «plano»: no hay NADA que pintar (municipio sin cargar, sin indicador
  // o sin periodo). Se dibujan solo los contornos —sin relleno ni trama— y la
  // leyenda no finge una escala. Es distinto de ND, que es ausencia acreditada
  // de valor para un indicador concreto y sí lleva trama por polígono.
  const plano = (
    motivo: string,
    textoFila: string,
    titulo: string,
    subtitulo: string,
    descripcion: string,
    aviso: string,
  ): VistaAtlas => ({
    filas: secciones.map((f) => filaVacia(f, motivo, textoFila)),
    entradasLeyenda: [],
    clasificacion: null,
    valoresDistintos: 0,
    escalaSimple: true,
    nSecciones,
    nConDato: 0,
    nSinDato: nSecciones,
    coberturaPct: 0,
    referenciaMunicipal: null,
    tituloLeyenda: titulo,
    subtituloLeyenda: subtitulo,
    descripcionMapa: descripcion,
    avisos: [aviso],
    modoMapa: "plano",
  });

  if (!atlas) {
    return plano(
      MOTIVO_NO_CARGADO,
      "Sin indicadores cargados",
      "Seccionado sin indicadores cargados",
      "Solo contornos. Los indicadores de este municipio todavía no se han cargado en SOCideas.",
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. No se representa ningún valor porque los indicadores aún no se han cargado en SOCideas para este municipio. Es un estado de CARGA, no una afirmación de que el INE no los publique.`,
      "Indicadores todavía no cargados en SOCideas: el mapa muestra solo los contornos, sin valores.",
    );
  }

  if (!indicador) {
    return plano(
      MOTIVO_SIN_SELECCION,
      "Sin indicador seleccionado",
      "Seccionado sin indicador seleccionado",
      "Elija un indicador del catálogo para ver la escala.",
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. No hay indicador seleccionado, así que no se representa ningún valor.`,
      "Sin indicador seleccionado: el mapa muestra solo los contornos, sin valores.",
    );
  }

  if (anio === null) {
    return plano(
      MOTIVO_SIN_PERIODO,
      "Sin periodo publicado",
      `${indicador.etiqueta} · sin periodo publicado`,
      "La fuente no publica este indicador con periodo para este municipio.",
      `Plano de los contornos de las ${nSecciones} secciones censales de ${municipioNombre}. El indicador «${indicador.etiqueta}» no tiene ningún periodo publicado para este municipio, así que no se representa ningún valor.`,
      `El indicador «${indicador.etiqueta}» no tiene periodos publicados a nivel de sección para este municipio.`,
    );
  }

  // Observaciones de UN indicador: sección → periodo → observación.
  const porSeccion: Record<string, SeccionPorPeriodo> = {};
  for (const s of secciones) {
    porSeccion[s.properties.CUSEC] = atlas.observations?.[s.properties.CUSEC]?.[indicador.id] ?? {};
  }

  const claves = secciones.map((s) => s.properties.CUSEC);
  const valores = claves.map((k) => {
    const o = porSeccion[k]?.[String(anio)];
    return o && o.status === "observado" && typeof o.value === "number" && Number.isFinite(o.value) ? o.value : null;
  });

  const modoEfectivo: ModoClasificacion =
    modo === "cortes_manuales" && !opciones.cortesManuales ? "intervalos_iguales" : modo;

  const brutas = clasificar(valores, {
    modo: modoEfectivo,
    clases,
    cortesManuales: opciones.cortesManuales,
    divergente: opciones.divergente,
    unidad,
  });

  // Con muy pocos valores distintos una escala de color no dice nada. Se
  // sustituye por un color plano y se declara, en vez de fingir una rampa.
  const escalaSimple = brutas.valoresDistintos < 3;
  const cortes = escalaSimple
    ? [
        {
          min: brutas.min,
          max: brutas.max,
          etiqueta:
            brutas.min === brutas.max
              ? `Valor único: ${formatearValor(brutas.min, "observado", unidad)}`
              : `${formatearValor(brutas.min, "observado", unidad)} – ${formatearValor(brutas.max, "observado", unidad)}`,
          // musgo-500: el color institucional, tomado de la rampa del contrato.
          color: RAMPA_SECUENCIAL[4],
          secciones: brutas.nObservados,
        },
      ]
    : brutas.cortes;

  const entradasLeyenda: EntradaLeyendaAtlas[] = cortes.map((c) => ({
    etiqueta: c.etiqueta,
    color: c.color,
    secciones: c.secciones,
  }));

  const nSinDato = valores.filter((v) => v === null).length;
  if (nSinDato > 0) {
    entradasLeyenda.push({ etiqueta: ETIQUETA_SIN_DATO, color: COLOR_SIN_DATO, secciones: nSinDato, esSinDato: true });
  }

  const filas: FilaAtlas[] = secciones.map((s) => {
    const key = s.properties.CUSEC;
    return construirFila(key, s.geometry, porSeccion[key]?.[String(anio)], cortes, unidad, indicador);
  });

  const nConDato = valores.filter((v) => v !== null).length;
  const cobertura = coberturaDePeriodo(secciones, porSeccion, anio);
  const coberturaPct = cobertura.pctObservados;

  if (escalaSimple) {
    avisos.push(
      `Escala simplificada: ${brutas.valoresDistintos} ${
        brutas.valoresDistintos === 1 ? "valor distinto" : "valores distintos"
      } entre ${brutas.nObservados} secciones con dato. El mapa usa un solo color; los valores exactos están en la tabla.`,
    );
  }
  if (nSinDato > 0) {
    avisos.push(
      `${nSinDato} de ${nSecciones} secciones no tienen dato en la fuente para este indicador y este periodo. Se muestran con trama diagonal y fuera de la escala: no son cero.`,
    );
  }
  if (atlas.quality?.hayDesfaseTemporal) {
    avisos.push(
      `Desfase temporal declarado por la fuente: la geometría es de ${atlas.geometryYear} y el dato es de ${anio}. No son contemporáneos.`,
    );
  }
  for (const nota of (atlas.quality?.notas ?? []).slice(0, 4)) avisos.push(nota);
  if (atlas.quality?.status === "failed") {
    avisos.push(
      "La validación de calidad de esta fuente está en estado «failed»: sus avisos se transmiten aquí sin filtrar.",
    );
  }

  const referenciaMunicipal = atlas.municipalReference?.[`${indicador.id}|${anio}`] ?? null;
  const tituloLeyenda = `${indicador.etiqueta}${unidad ? ` (${unidad})` : ""} · ${anio}`;
  const subtituloLeyenda = `${etiquetaModo(modo)} · ${cortes.length} ${
    cortes.length === 1 ? "clase" : "clases"
  } · ${nConDato} de ${nSecciones} secciones con dato (${coberturaPct.toLocaleString("es-ES", {
    maximumFractionDigits: 1,
  })} % de cobertura). Las clases se calculan solo con los valores observados.`;

  const descripcionMapa = [
    `Mapa coroplético de las ${nSecciones} secciones censales de ${municipioNombre}${
      atlas.provinceName ? `, provincia de ${atlas.provinceName}` : ""
    }.`,
    `Indicador: ${indicador.etiqueta}${unidad ? `, en ${unidad}` : ""}, periodo ${anio}.`,
    escalaSimple
      ? `Con ${brutas.valoresDistintos} ${
          brutas.valoresDistintos === 1 ? "valor distinto" : "valores distintos"
        } entre las secciones con dato no se usa una escala de color: el mapa es de un solo color.`
      : `Escala de ${cortes.length} clases, de ${cortes[0]?.etiqueta ?? ""} a ${cortes[cortes.length - 1]?.etiqueta ?? ""}.`,
    `${nConDato} secciones con dato y ${nSinDato} sin dato (${coberturaPct.toLocaleString("es-ES", {
      maximumFractionDigits: 1,
    })} % de cobertura).`,
    "Las secciones sin dato se distinguen con trama diagonal y no entran en la escala.",
    "Los mismos valores, ordenables y filtrables, están en la tabla de secciones.",
  ].join(" ");

  return {
    filas,
    entradasLeyenda,
    clasificacion: brutas,
    valoresDistintos: brutas.valoresDistintos,
    escalaSimple,
    nSecciones,
    nConDato,
    nSinDato,
    coberturaPct,
    referenciaMunicipal,
    tituloLeyenda,
    subtituloLeyenda,
    descripcionMapa,
    avisos,
    modoMapa: "coropleta",
  };
}

const STATUS_SIN_NUMERO: ReadonlySet<SeccionValorStatus> = new Set<SeccionValorStatus>([
  "no_difundido",
  "sin_cobertura",
  "no_aplicable",
  "error_ingesta",
]);

function filaVacia(feature: SeccionFeature, motivo: string, texto = "Sin dato"): FilaAtlas {
  return {
    key: feature.properties.CUSEC,
    value: null,
    status: "sin_cobertura",
    texto,
    clase: -1,
    color: COLOR_SIN_DATO,
    // Contorno legible sobre el mapa base: en modo plano es lo único que se
    // dibuja, así que no puede quedar tenue.
    colorContorno: tokenIma("--carbon-600"),
    esSinDato: true,
    sinRelleno: true,
    esAgregadoDistrito: false,
    motivoSinDato: motivo,
    centroide: centroideGeometria(feature.geometry),
    nota: null,
    methodologyNote: null,
    fuenteUrl: "",
    sourceTable: "",
    operation: "",
    publishedAt: null,
    retrievedAt: "",
    dimensiones: {},
  };
}

function construirFila(
  key: string,
  geometry: unknown,
  observacion:
    | {
        value: number | null;
        status: SeccionValorStatus;
        sourceUrl: string;
        sourceTable: string;
        operation: string;
        publishedAt: string | null;
        retrievedAt: string;
        dimensions: Record<string, string>;
        methodologyNote: string | null;
        unit: string;
      }
    | undefined,
  cortes: ResultadoClasificacion["cortes"],
  unidad: string,
  indicador: SeccionIndicador,
): FilaAtlas {
  const status: SeccionValorStatus = observacion?.status ?? "sin_cobertura";
  const bruto = observacion?.value ?? null;
  // Regla dura: solo `observado` con número entra en la escala. Todo lo demás
  // es ND, con su propio color, su propio contorno y su propia trama.
  const esSinDato =
    !observacion ||
    status !== "observado" ||
    bruto === null ||
    !Number.isFinite(bruto) ||
    STATUS_SIN_NUMERO.has(status) ||
    !admiteValor(status);

  let clase = -1;
  let color = COLOR_SIN_DATO;
  if (!esSinDato && bruto !== null) {
    clase = indiceDeClase(bruto, cortes);
    color = cortes[clase]?.color ?? COLOR_SIN_DATO;
  }

  return {
    key,
    value: esSinDato ? null : bruto,
    status,
    texto: formatearValor(bruto, status, observacion?.unit || unidad),
    clase,
    color,
    // El contorno de una clase observada es el carbón del sistema, para que la
    // clase más clara se separe del fondo hueso del mapa y del PNG.
    colorContorno: esSinDato ? COLOR_CONTORNO_SIN_DATO : tokenIma("--carbon-600"),
    esSinDato,
    sinRelleno: false,
    esAgregadoDistrito: esPoligonoDistrito(key),
    motivoSinDato: null,
    centroide: centroideGeometria(geometry),
    nota: esSinDato && indicador.etiquetaNoDifundido ? `La fuente etiqueta estas celdas como «${indicador.etiquetaNoDifundido}».` : null,
    methodologyNote: observacion?.methodologyNote ?? null,
    fuenteUrl: observacion?.sourceUrl ?? indicador.url,
    sourceTable: observacion?.sourceTable ?? indicador.sourceTable,
    operation: observacion?.operation ?? indicador.operation,
    publishedAt: observacion?.publishedAt ?? null,
    retrievedAt: observacion?.retrievedAt ?? "",
    dimensiones: observacion?.dimensions ?? {},
  };
}

/** Índice de clase sobre una escala ya calculada. Misma regla de extremos que
 *  el contrato: la última clase incluye su propio límite superior. */
function indiceDeClase(valor: number, cortes: ResultadoClasificacion["cortes"]): number {
  for (let i = 0; i < cortes.length; i++) {
    const esUltima = i === cortes.length - 1;
    if (valor < cortes[i].max || (esUltima && valor <= cortes[i].max)) return i;
  }
  return cortes.length - 1;
}

function etiquetaModo(modo: ModoClasificacion): string {
  if (modo === "cuantil") return "Clasificación por cuantiles";
  if (modo === "intervalos_iguales") return "Clasificación por intervalos iguales";
  return "Clasificación por cortes manuales";
}

function blobDeLienzo(lienzo: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    lienzo.toBlob((b) => resolve(b), "image/png");
  });
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function BotonVista({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-[44px] rounded-[6px] border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] ${
        activo
          ? "border-[var(--color-secondary)] bg-[var(--color-input-bg-hover)] text-[var(--color-text-primary)]"
          : "border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}

function CabeceraAtlas({
  municipioNombre,
  provincia,
  geometriaYear,
  fuente,
  nSecciones,
  nConDato,
  nSinDato,
  nAgregados,
  nDescartadas,
  coberturaPct,
  indicadorEtiqueta,
  anio,
  avisos,
  sinAtlas,
  plano,
  validacion,
}: {
  municipioNombre: string;
  provincia: string | null;
  geometriaYear: number | null;
  fuente: string;
  nSecciones: number;
  nConDato: number;
  nSinDato: number;
  nAgregados: number;
  nDescartadas: number;
  coberturaPct: number;
  indicadorEtiqueta: string | null;
  anio: number | null;
  avisos: string[];
  sinAtlas: boolean;
  plano: boolean;
  validacion: ResultadoValidacion | null;
}) {
  return (
    <section aria-label="Resumen del atlas" className="premium-card p-4 sm:p-5">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DatoCabecera etiqueta="Municipio" valor={municipioNombre} detalle={provincia ?? undefined} />
        <DatoCabecera
          etiqueta="Secciones con dato"
          valor={plano ? "—" : `${nConDato} de ${nSecciones}`}
          detalle={plano ? "Sin valores observados" : `${nSinDato} sin dato`}
        />
        <DatoCabecera
          etiqueta="Cobertura del indicador"
          valor={plano ? "—" : `${coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`}
          detalle={
            plano
              ? sinAtlas
                ? "Indicadores sin cargar"
                : "Sin valores observados"
              : indicadorEtiqueta && anio !== null
                ? `${indicadorEtiqueta} · ${anio}`
                : "Sin indicador cargado"
          }
        />
        <DatoCabecera
          etiqueta="Seccionado (geometría)"
          valor={String(geometriaYear ?? "—")}
          detalle={`Fuente: ${fuente}`}
        />
      </dl>

      {(nAgregados > 0 || nDescartadas > 0) && (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {nAgregados > 0 ? (
            <>
              Se han excluido {nAgregados} polígonos agregados de distrito (clave de sección terminada
              en 000). El INE los incluye en la misma capa, pero no son secciones: publicarlos sería
              inventar una fila que la fuente no da.
            </>
          ) : null}
          {nDescartadas > 0 ? (
            <>
              {nAgregados > 0 ? " " : null}
              Se han descartado {nDescartadas} polígonos sin clave de sección válida o sin geometría
              utilizable.
            </>
          ) : null}
        </p>
      )}

      {validacion && !validacion.ok && (
        <div
          className="mt-4 rounded-[6px] border border-[var(--color-error)] bg-[var(--color-input-bg)] p-3"
          role="alert"
        >
          <p className="text-xs font-bold text-[var(--color-text-primary)]">
            La validación de la fuente no pasa ({validacion.errores.length}{" "}
            {validacion.errores.length === 1 ? "error" : "errores"})
          </p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {validacion.errores.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!sinAtlas && avisos.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-3">
          <h3 className="text-xs font-bold text-[var(--color-text-primary)]">Avisos de lectura</h3>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DatoCabecera({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{etiqueta}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-text-primary)]">{valor}</dd>
      {detalle ? <dd className="text-[11px] text-[var(--color-text-muted)]">{detalle}</dd> : null}
    </div>
  );
}
