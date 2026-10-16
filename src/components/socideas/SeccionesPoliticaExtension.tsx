"use client";

// Capa Política del atlas de secciones censales.
//
// QUÉ HACE
//  - Mapa CATEGÓRICO de la candidatura ganadora por sección: colores estables
//    de la fuente, sin cuantiles, sin Jenks, sin intervalos, sin cortes manuales.
//  - Mapa CONTINUO para participación, abstención, margen, blancos, nulos y
//    voto a una candidatura: cuantiles, intervalos iguales, Jenks y manual.
//  - Variación entre convocatorias: tipo divergente, centro en cero, en puntos
//    porcentuales, solo cuando la geometría es comparable.
//  - Tooltip y tabla con el detalle que publica la fuente: distrito, mesas
//    agregadas, ganador, votos, porcentaje, segunda, margen, participación,
//    blancos, nulos, convocatoria, fuente y advertencias.
//
// QUÉ NO HACE
//  - No inventa una categoría, no reparte votos, no reparte ni atribuye dos veces.
//  - No colapsa los estados de disponibilidad en «sin indicadores».
//  - No pintaSections sin geometría.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CLASES_MAXIMO,
  CLASES_MINIMO,
  COLOR_CONTORNO_SIN_DATO,
  COLOR_SIN_DATO,
  RAMPA_DIVERGENTE,
  RAMPA_SECUENCIAL,
  SECCIONES_ATRIBUCION,
  admiteValor,
  clasificar,
  formatearValor,
  type ModoClasificacion,
  type SeccionFeature,
  type SeccionIndicador,
  type SeccionPorPeriodo,
  type SeccionValorStatus,
  type SeccionesAtlasV1,
} from "@/lib/socideas-secciones";
import { ELECTION_TYPE_LABEL, type Candidacy, type ElectionType } from "@/lib/socideas-secciones-political";
import { POLITICAL_INDICATOR_IDS, PREFIJO_CANDIDATURA, esIndicadorCandidatura, idIndicadorCandidatura } from "@/lib/socideas-secciones-extension";
import type { EscalaPng } from "@/lib/socideas-secciones-png";
import {
  PREFIJO_FIRMA_POLITICA,
  blobDeLienzo,
  construirContratoPngPolitica,
  componerPngPolitica,
  descargar,
  estadoSeccionPng,
  nombreArchivoPngPolitica,
  validarContratoPngPolitica,
  type ConciliacionPng,
  type CorrespondenciaPng,
  type EntradaContratoPngPolitica,
  type EscalaNumericaPng,
  type GanadoraSeccionPng,
  type SeccionSeriePng,
} from "@/lib/socideas-secciones-png-politica";
import SeccionesAtlasMap, { COLOR_CONTORNO_CLASE, type EntradaLeyendaAtlas, type FilaAtlas, type GeoJsonFeatureLike, type HandleAtlas } from "./SeccionesAtlasMap";
import SeccionesPoliticaSelector, { ETIQUETA_ESTADO, type ConvocatoriaCatalogo } from "./SeccionesPoliticaSelector";
// Tipos del ATLAS, no valores: el atlas importa este componente, así que
// importar aquí sería un ciclo en runtime. Con `import type` no se emite nada.
import type { EstadoBloque, ObservacionesHidrátadas, PeticionBloque } from "./SeccionesAtlas";

type Estado = "idle" | "cargando" | "ok" | "error";

/** Margen para que Leaflet termine de instanciarse antes de capturar. */
const MS_ESPERA_MAPA_POLITICA = 4000;

/** Etiqueta de la organización del PNG: el botón no puede confundir dominios. */
const DESCARGAS_TITULO = 'Descargas · mapa electoral';

export interface SeccionGanadoraUI {
  sectionKey: string;
  distrito: string;
  mesas: number;
  mesasIds: string[];
  censo: number | null;
  votantes: number | null;
  validos: number | null;
  blancos: number | null;
  nulos: number | null;
  ganadoraId: string | null;
  ganadoraVotos: number | null;
  ganadoraPct: number | null;
  segundaId: string | null;
  segundaVotos: number | null;
  segundaPct: number | null;
  margen: number | null;
  participacion: number | null;
  abstencion: number | null;
  empate: boolean;
  estado: "observado" | "no_difundido" | "sin_cobertura";
}

export interface RespuestaPolitica {
  data: {
    codigo_ine: string;
    anio_delimitacion: number;
    fuente: string;
    n_secciones: number;
    via: string;
    geojson: { type: "FeatureCollection"; features: Array<{ type: string; properties: Record<string, unknown>; geometry: unknown }> };
    atlas?: SeccionesAtlasV1 | null;
    dominios: {
      politica: {
        catalog: ConvocatoriaCatalogo[];
        electionId: string;
        electionType: ElectionType;
        electionDate: string;
        status: string;
        mesas_agregadas: number;
        indicadores: number;
        candidaturas: Candidacy[];
        /** Las ganadoras por sección ya NO vienen en el bootstrap (0,9 MB en
         *  Madrid, con votos que además están en el bloque de dataset). El
         *  bootstrap publica aquí dónde pedirlas; el atlas pide ese bloque y
         *  entrega el resultado ya hidratado en la prop `ganadoras`. */
        ganadoras_endpoint?: string;
        totales: Record<string, number | null> | null;
        conciliacion: { status: string; reference: string | null; differences: Record<string, number>; notes: string[] } | null;
        geometria: {
          year: number | null;
          correspondenceStatus: string;
          resultSections: number;
          geometrySections: number;
          matchedSections: number;
          coveragePercentage: number;
          notes: string[];
        } | null;
        publicacion: { publishable: boolean; reason: string | null; warnings: string[] } | null;
        notas: string[];
      };
    };
    avisos: string[];
  } | null;
  error: string | null;
  count?: number;
}

/** Indicadores políticos continuos (los que sí admiten escala de color). */
const CONTINUOS: ReadonlyArray<{ id: string; etiqueta: string; unidad: string; denominador: string }> = [
  { id: POLITICAL_INDICATOR_IDS.participation, etiqueta: 'Participación', unidad: '%', denominador: 'Censo electoral' },
  { id: POLITICAL_INDICATOR_IDS.abstention, etiqueta: 'Abstención', unidad: '%', denominador: 'Censo electoral' },
  { id: POLITICAL_INDICATOR_IDS.margin, etiqueta: 'Margen ganador − segundo', unidad: 'p. p.', denominador: 'Votos válidos' },
  { id: POLITICAL_INDICATOR_IDS.blank, etiqueta: 'Votos en blanco', unidad: '%', denominador: 'Votos válidos' },
  { id: POLITICAL_INDICATOR_IDS.null, etiqueta: 'Votos nulos', unidad: '%', denominador: 'Votantes' },
];

const ID_GANADORA = 'pol_ganadora';
const CLASES_POR_DEFECTO = 5;

export default function SeccionesPoliticaExtension({
  codigoINE,
  nombre,
  catalog,
  eleccionInicial,
  observaciones,
  ganadoras: ganadorasBloque,
  pedirBloque,
  estadoDeBloque,
}: {
  codigoINE: string;
  nombre: string;
  catalog: ReadonlyArray<ConvocatoriaCatalogo>;
  eleccionInicial: string;
  /** Bloques YA hidratados por el atlas: sección → indicador → convocatoria →
   *  observación. El bootstrap llega con `observations: {}`, así que la rama
   *  continua de este mapa lee de aquí y no de `datos.atlas.observations`. */
  observaciones: ObservacionesHidrátadas;
  /** Ganadoras por sección del bloque `?bloque=ganadoras`, ya hydrateado por el
   *  atlas. Vive en el atlas, no aquí: esta pestaña se desmonta al salir y el
   *  bloque debe sobrevivir. */
  ganadoras: Record<string, SeccionGanadoraUI>;
  /** Pide un bloque. Deduplica, cachea por clave y entrega el estado por
   *  bloque, igual que el motor numérico: una sola implementación. `forzar`
   *  ignora la caché y es lo que usa el botón de reintentar. */
  pedirBloque: (peticion: PeticionBloque, opciones?: { forzar?: boolean }) => Promise<void>;
  estadoDeBloque: (peticion: PeticionBloque) => EstadoBloque | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // La pestaña Política carga sola al entrar, así que el estado nace ya en
  // «cargando»: pedirlo desde un efecto provocaba un `setState` síncrono y, con
  // él, una pasada de render de más antes de que empiece la petición.
  const [estado, setEstado] = useState<Estado>('cargando');
  const [datos, setDatos] = useState<RespuestaPolitica['data']>(null);
  const [error, setError] = useState<string | null>(null);
  const [eleccion, setEleccion] = useState<string>(eleccionInicial);
  const [indicador, setIndicador] = useState<string>(ID_GANADORA);
  const [candidaturaId, setCandidaturaId] = useState<string>('');
  const [modo, setModo] = useState<ModoClasificacion>('cuantil');
  const [clases, setClases] = useState<number>(CLASES_POR_DEFECTO);
  const [divergente, setDivergente] = useState(false);
  const [cortes, setCortes] = useState<string>('');
  // La sección seleccionada vive en la URL (`?sec=`), igual que la convocatoria,
  // el indicador y la clasificación: así el enlace es compartible y el botón
  // «atrás» del navegador funciona. Se lee de ahí en cada render en vez de
  // guardarse en estado, que se quedaría desincronizado al navegar.
  const seleccion: string | null = searchParams.get('sec');
  const [hovered, setHovered] = useState<string | null>(null);
  const [, iniciarTransicion] = useTransition();
  // ── Exportación PNG ──────────────────────────────────────────────────────
  // El estado de la exportación vive AQUÍ, en el panel político, y no se
  // comparte con el atlas económico: son dos datasets distintos y un único
  // botón de descarga que los mezclara es exactamente el defecto que se
  // corrigió. El dataset se identifica en el propio contrato, firmado.
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [escalaPng, setEscalaPng] = useState<EscalaPng>(1);
  /** Handle del mapa, para poder capturarlo y componer el PNG. */
  const mapaRef = useRef<HandleAtlas>(null);
  /** Guarda que la carga inicial ya se pidió: cambiar de convocatoria en la URL
   *  no debe volver a dispararla, porque la elige el usuario de forma explícita. */
  const arrancado = useRef(false);

  const cargar = useCallback(
    async (electionId: string) => {
      setEstado('cargando');
      setError(null);
      try {
        const qs = electionId ? `?eleccion=${encodeURIComponent(electionId)}&cand=1` : '';
        const res = await fetch(`/api/socideas/secciones/${codigoINE}${qs}`);
        const j = (await res.json().catch(() => null)) as RespuestaPolitica | null;
        if (!res.ok || !j?.data) {
          // El motivo del servidor se muestra literal: «sin resultados para
          // este municipio», «municipio no encontrado» y «ninguna convocatoria
          // publicada» son tres hechos distintos y el usuario puede actuar sobre
          // ellos de forma distinta.
          const motivo = (j?.error ?? '').trim();
          throw new Error(
            `${motivo ? motivo : 'No se pudieron cargar los resultados electorales'}` +
              ` (HTTP ${res.status})`,
          );
        }
        setDatos(j.data);
        setEleccion(j.data.dominios.politica.electionId || electionId);
        setEstado('ok');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar los resultados electorales');
        setEstado('error');
      }
    },
    [codigoINE],
  );

  useEffect(() => {
    if (!arrancado.current) {
      arrancado.current = true;
      void cargar(eleccionInicial);
    }
    // Solo al entrar: las recargas posteriores son explícitas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleccionInicial, codigoINE]);

  const escribirUrl = useCallback(
    (parche: { ind?: string; modo?: ModoClasificacion; clases?: number; sec?: string | null; cand?: string }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (parche.ind !== undefined) p.set('g', 'politica'), p.set('ind', parche.ind);
      if (parche.modo !== undefined) p.set('modo', parche.modo);
      if (parche.clases !== undefined) p.set('clases', String(parche.clases));
      if (parche.sec !== undefined) {
        if (parche.sec === null) p.delete('sec');
        else p.set('sec', parche.sec);
      }
      if (parche.cand !== undefined) {
        if (parche.cand) p.set('cand', parche.cand);
        else p.delete('cand');
      }
      const qs = p.toString();
      iniciarTransicion(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  // ── Geometría ───────────────────────────────────────────────────────────
  const features: GeoJsonFeatureLike[] = useMemo(() => {
    const out: GeoJsonFeatureLike[] = [];
    for (const f of datos?.geojson?.features ?? []) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const cusec = String(p.CUSEC ?? '').trim();
      if (!/^\d{10}$/.test(cusec)) continue;
      if (cusec.slice(7, 10) === '000') continue; // agregado de distrito
      if (!f.geometry) continue;
      out.push({ key: cusec, geometry: f.geometry });
    }
    return out;
  }, [datos]);

  const pol = datos?.dominios?.politica ?? null;
  // Ganadoras por sección. Ya no vienen en el bootstrap: salen del bloque
  // `?bloque=ganadoras` que el atlas pide, y llegan por prop. `useMemo` porque
  // una expresión lógica devolvería un objeto nuevo en cada render y dispararía
  // los `useMemo` de filas y de la vista.
  const ganadoras = useMemo(() => ganadorasBloque, [ganadorasBloque]);
  const porCandidatura = useMemo(() => {
    const m = new Map<string, Candidacy>();
    for (const c of pol?.candidaturas ?? []) m.set(c.id, c);
    return m;
  }, [pol?.candidaturas]);

  // Candidaturas con al menos una sección ganada o con votos: la lista es
  // dinámica y sale de la fuente, nunca de una constante.
  const candidaturasVisibles = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of Object.values(ganadoras)) {
      if (g.ganadoraId) counts.set(g.ganadoraId, (counts.get(g.ganadoraId) ?? 0) + 1)
    }
    return [...(pol?.candidaturas ?? [])]
      .map((c) => ({ c, secciones: counts.get(c.id) ?? 0 }))
      .sort((a, b) => b.secciones - a.secciones || (a.c.acronym || a.c.name).localeCompare(b.c.acronym || b.c.name, 'es'))
  }, [ganadoras, pol?.candidaturas])

  // El indicador efectivo: si se elige una candidatura, el mapa pinta SU voto.
  const indicadorEfectivo = useMemo(() => {
    if (candidaturaId) return idIndicadorCandidatura(candidaturaId);
    return indicador;
  }, [candidaturaId, indicador]);

  const esCategorico = indicadorEfectivo === ID_GANADORA;
  const esVariacion = indicadorEfectivo === 'pol_variacion_ganadora';

  // El indicador declarado por el atlas, leído UNA vez: lo usan tanto el cálculo
  // de filas como el contrato de exportación, y si viviera dentro del `useMemo`
  // de filas el exportador no podría alcanzar su unidad ni su etiqueta.
  const indBase = useMemo(
    () => (datos?.atlas?.indicators ?? []).find((i) => i.id === indicadorEfectivo) ?? null,
    [datos, indicadorEfectivo],
  );

  // ── Bloques de valores de esta pestaña ──────────────────────────────────
  //
  // Política tiene su propio bloque porque necesita su convocatoria: la clave de
  // periodo electoral es la FECHA («2023-05-28»), no el año, y dos convocatorias
  // pueden compartirlo. Se piden al entrar y al cambiar de convocatoria, con el
  // mismo `pedirBloque` del atlas: deduplicado, cacheado por clave y con estado
  // de carga y de error por bloque.
  //
  //  · El categórico (ganadora) necesita SOLO el bloque `ganadoras`: los votos ya
  //    están en el bloque del dataset, así que no se piden dos veces.
  //  · Un indicador continuo necesita su propio bloque de serie, indexado por
  //    la fecha de convocatoria, que es lo que lee el mapa más abajo.
  const peticionGanadoras = useMemo<PeticionBloque | null>(
    () => (pol ? { dominio: 'politica', indicadorId: ID_GANADORA, bloque: 'ganadoras', convocatoria: pol.electionId } : null),
    [pol],
  );
  const peticionSerie = useMemo<PeticionBloque | null>(
    () =>
      esCategorico || !pol
        ? null
        : { dominio: 'politica', indicadorId: indicadorEfectivo, convocatoria: pol.electionId },
    [esCategorico, pol, indicadorEfectivo],
  );

  useEffect(() => {
    if (peticionGanadoras) void pedirBloque(peticionGanadoras);
  }, [peticionGanadoras, pedirBloque]);
  useEffect(() => {
    if (peticionSerie) void pedirBloque(peticionSerie);
  }, [peticionSerie, pedirBloque]);

  /** Estado de carga/error de lo que esta pestaña está pintando ahora. */
  const estadoBloqueActivo = useMemo<EstadoBloque | undefined>(() => {
    if (peticionSerie) return estadoDeBloque(peticionSerie);
    if (peticionGanadoras) return estadoDeBloque(peticionGanadoras);
    return undefined;
  }, [peticionSerie, peticionGanadoras, estadoDeBloque]);

  // El servidor puede responder con otra convocatoria si la pedida no está en el
  // catálogo. Se dice, en vez de pintar resultados de una convocatoria con el
  // título de otra.
  const convocatoriaServida = estadoBloqueActivo?.convocatoriaServida ?? null;
  const avisoConvocatoria =
    convocatoriaServida !== null && pol && convocatoriaServida !== pol.electionId
      ? `Se pidieron los resultados de la convocatoria ${pol.electionId} y el servidor ha servido la ${convocatoriaServida}, que es la más reciente publicada.`
      : null;

  // ── Filas del mapa ──────────────────────────────────────────────────────
  interface Fila extends FilaAtlas {
    ganadora?: SeccionGanadoraUI;
    etiquetaCategoria?: string;
  }

  const { filas, entradasLeyenda, nConDato, nSinDato, cortesUsados, escalaObservada, modoEfectivoExport, nSecciones, titulo, subtitulo, descripcion, avisos, escalaSimple } =
    useMemo(() => {
      const secs = features.map((f) => f.key);
      const n = secs.length;
      const avisosLoc: string[] = [];
      const lista: Fila[] = [];

      if (esCategorico) {
        // Mapa CATEGÓRICO: un color estable por candidatura, sin cortes.
        const cuenta = new Map<string, number>();
        for (const g of Object.values(ganadoras)) {
          if (g.ganadoraId) cuenta.set(g.ganadoraId, (cuenta.get(g.ganadoraId) ?? 0) + 1)
        }
        const orden = [...cuenta.keys()].sort(
          (a, b) => (cuenta.get(b) ?? 0) - (cuenta.get(a) ?? 0) || a.localeCompare(b),
        );
        const colorDe = (id: string): string => porCandidatura.get(id)?.color ?? '#6B7280';
        const leyenda: EntradaLeyendaAtlas[] = orden.map((id) => {
          const c = porCandidatura.get(id);
          return {
            etiqueta: c ? `${c.acronym || c.name}${c.acronym && c.name !== c.acronym ? ` — ${c.name}` : ''}` : id,
            color: colorDe(id),
            secciones: cuenta.get(id) ?? 0,
          };
        });
        let conDato = 0;
        let sinDato = 0;
        for (const f of features) {
          const g = ganadoras[f.key];
          const obs = g?.estado === 'observado' && g.ganadoraId;
          if (obs) conDato += 1;
          else sinDato += 1;
          const clase = obs ? Math.max(0, orden.indexOf(g?.ganadoraId as string)) : -1;
          const c = obs ? porCandidatura.get(g?.ganadoraId as string) : null;
          lista.push({
            key: f.key,
            value: null,
            status: obs ? 'observado' : g ? 'no_difundido' : 'sin_cobertura',
            texto: obs ? `${c?.acronym || c?.name || g?.ganadoraId}${g?.empate ? ' (empate)' : ''}` : 'ND',
            clase,
            color: obs ? colorDe(g?.ganadoraId as string) : COLOR_SIN_DATO,
            colorContorno: obs ? COLOR_CONTORNO_CLASE : COLOR_CONTORNO_SIN_DATO,
            esSinDato: !obs,
            sinRelleno: false,
            esAgregadoDistrito: false,
            motivoSinDato: obs ? null : g ? 'ND — la fuente no publica candidatura ganadora para esta sección' : 'Sin resultado en esta sección',
            centroide: null,
            nota: null,
            methodologyNote: g?.empate ? 'Empate registrado por la fuente entre dos candidaturas.' : null,
            fuenteUrl: pol ? 'https://infoelectoral.interior.gob.es/' : '',
            sourceTable: pol ? `${pol.electionType} ${pol.electionDate}` : '',
            operation: pol ? pol.electionId : '',
            publishedAt: null,
            retrievedAt: '',
            dimensiones: g ? { distrito: g.distrito, mesas: String(g.mesas) } : {},
            ganadora: g,
            etiquetaCategoria: obs ? (c?.acronym || c?.name || '') : undefined,
          });
        }
        if (sinDato > 0) leyenda.push({ etiqueta: 'Sin dato / ND', color: COLOR_SIN_DATO, secciones: sinDato, esSinDato: true });
        if (orden.length === 1) avisosLoc.push('Una sola candidatura gana en todas las secciones con dato: el mapa no necesita una escala.');
        return {
          filas: lista,
          entradasLeyenda: leyenda,
          nConDato: conDato,
          nSinDato: sinDato,
          cortesUsados: null,
          // Un mapa categórico no tiene escala observada: no hay magnitud que
          // repartir. Se declara `null` y el compositor lo dice así.
          escalaObservada: null,
          // Y tampoco método: una lista de candidaturas no se ha cortado.
          modoEfectivoExport: null,
          nSecciones: n,
          titulo: `Candidatura ganadora · ${pol ? pol.electionDate : ''}`,
          subtitulo: `Leyenda categórica: ${orden.length} ${orden.length === 1 ? 'candidatura' : 'candidaturas'} con al menos una sección ganada. Sin cuantiles, sin Jenks y sin intervalos: cada color es una lista, no un rango.`,
          descripcion: `Mapa categórico de la candidatura ganadora por sección censal de ${nombre}. Cada color es una candidatura de la convocatoria, con el color estable que le asigna la fuente. ${conDato} secciones con ganador y ${sinDato} sin dato.`,
          avisos: avisosLoc,
          escalaSimple: orden.length < 2,
        };
      }

      // Mapa CONTINUO: lectura del indicador desde los bloques YA hidratados.
      // El bootstrap llega con `observations: {}` (es lo que garantiza que aquí
      // no hay valores), así que la lectura va del estado local que el atlas
      // ha ido rellenando con `expandirIndicadorCompacto`.
      const anio = pol ? Number.parseInt(pol.electionDate.slice(0, 4), 10) : null;
      const clavePeriodo = pol?.electionDate ?? null;
      const fuente = (ind: SeccionIndicador | null | undefined, key: string): SeccionPorPeriodo[string] | undefined => {
        const obs = observaciones?.[key]?.[ind?.id ?? indicadorEfectivo] ?? {};
        return clavePeriodo ? obs[clavePeriodo] : undefined;
      };
      const valores = features.map((f) => {
        const o = fuente(indBase, f.key);
        return o && o.status === 'observado' && typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : null;
      });
      const cortesManuales = cortes
        .split(/[,;\s]+/)
        .map((s) => Number(s.replace(',', '.')))
        .filter((n) => Number.isFinite(n));
      const modoEfectivo: ModoClasificacion =
        modo === 'cortes_manuales' && cortesManuales.length < 2 ? 'intervalos_iguales' : modo;
      const rampa = divergente ? RAMPA_DIVERGENTE : RAMPA_SECUENCIAL;
      const bruto = clasificar(
        esVariacion ? valores.map((v) => v) : valores,
        {
          modo: modoEfectivo,
          clases: Math.min(CLASES_MAXIMO, Math.max(CLASES_MINIMO, clases)),
          cortesManuales: cortesManuales.length >= 2 ? cortesManuales : null,
          divergente,
          unidad: '',
        },
      );
      const pocos = bruto.valoresDistintos < 3;
      const cortesEfectivos = pocos
        ? [
            {
              min: bruto.min,
              max: bruto.max,
              etiqueta: bruto.min === bruto.max ? `Valor único: ${formatearValor(bruto.min, 'observado', '')}` : `${formatearValor(bruto.min, 'observado', '')} – ${formatearValor(bruto.max, 'observado', '')}`,
              color: rampa[4] ?? rampa[rampa.length - 1]!,
              secciones: bruto.nObservados,
            },
          ]
        : bruto.cortes;
      const leyenda: EntradaLeyendaAtlas[] = cortesEfectivos.map((c, i) => ({
        etiqueta: c.etiqueta,
        color: c.color,
        secciones: c.secciones,
      }));
      void fuente;
      let conDato = 0;
      let sinDato = 0;
      for (const f of features) {
        const o = fuente(indBase, f.key);
        const bruto2 = o && o.status === 'observado' && typeof o.value === 'number' ? o.value : null;
        const esND = bruto2 === null || !Number.isFinite(bruto2) || (o ? !admiteValor(o.status) : true);
        if (esND) sinDato += 1;
        else conDato += 1;
        let clase = -1;
        if (!esND && bruto2 !== null) {
          for (let i = 0; i < cortesEfectivos.length; i++) {
            const ultimo = i === cortesEfectivos.length - 1;
            if (bruto2 < cortesEfectivos[i]!.max || (ultimo && bruto2 <= cortesEfectivos[i]!.max)) {
              clase = i;
              break;
            }
          }
          if (clase === -1) clase = cortesEfectivos.length - 1;
        }
        lista.push({
          key: f.key,
          value: esND ? null : bruto2,
          status: esND ? (o?.status ?? 'sin_cobertura') : 'observado',
          texto: esND ? 'ND' : formatearValor(bruto2, 'observado', indBase?.unidad ?? ''),
          clase,
          color: esND ? COLOR_SIN_DATO : (cortesEfectivos[clase]?.color ?? COLOR_SIN_DATO),
          colorContorno: esND ? COLOR_CONTORNO_SIN_DATO : COLOR_CONTORNO_CLASE,
          esSinDato: esND,
          sinRelleno: false,
          esAgregadoDistrito: false,
          motivoSinDato: esND ? (o?.methodologyNote ?? 'ND — dato no difundido para esta sección') : null,
          centroide: null,
          nota: null,
          methodologyNote: o?.methodologyNote ?? null,
          fuenteUrl: o?.sourceUrl ?? indBase?.url ?? 'https://infoelectoral.interior.gob.es/',
          sourceTable: o?.sourceTable ?? pol?.electionId ?? '',
          operation: o?.operation ?? pol?.electionId ?? '',
          publishedAt: null,
          retrievedAt: o?.retrievedAt ?? '',
          dimensiones: o?.dimensions ?? {},
          ganadora: ganadoras[f.key],
        });
      }
      if (sinDato > 0) leyenda.push({ etiqueta: 'Sin dato / ND', color: COLOR_SIN_DATO, secciones: sinDato, esSinDato: true });
      if (pocos) avisosLoc.push(`Escala simplificada: ${bruto.valoresDistintos} valores distintos entre ${bruto.nObservados} secciones con dato.`);
      if (sinDato > 0) avisosLoc.push(`${sinDato} de ${n} secciones no tienen dato para este indicador y esta convocatoria. No son cero.`);
      if (anio !== null && datos?.anio_delimitacion && datos.anio_delimitacion !== anio) {
        avisosLoc.push(`Desfase temporal: la geometría es de ${datos.anio_delimitacion} y la convocatoria es de ${anio}. Se muestra la correspondencia calculada contra el seccionado del año de la elección.`);
      }
      const unidad = indBase?.unidad ?? '';
      // Escala observada COMPLETA. Antes se conservaba solo `cortesUsados` y se
      // perdían `min`, `max`, `nObservados` y `valoresDistintos`, que el
      // compositor necesita para no afirmar «sin escala» sobre un mapa que sí la
      // tiene. Si la vista simplificó la escala, se declara la escala REAL
      // observada, no la de un solo valor inventado.
      const escalaObservada: EscalaNumericaPng = {
        min: bruto.min,
        max: bruto.max,
        nObservados: bruto.nObservados,
        valoresDistintos: bruto.valoresDistintos,
        reducidoPorValoresDistintos: bruto.reducidoPorValoresDistintos,
      };
      return {
        filas: lista,
        entradasLeyenda: leyenda,
        nConDato: conDato,
        nSinDato: sinDato,
        cortesUsados: cortesEfectivos,
        escalaObservada,
        // El método EFECTIVO, no el pedido: si se pidieron cortes manuales y no
        // había dos, la vista aplicó intervalos iguales, y el PNG debe decir lo
        // que se ha hecho y no lo que se pidió.
        modoEfectivoExport: modoEfectivo,
        nSecciones: n,
        titulo: `${indBase?.etiqueta ?? 'Indicador'}${unidad ? ` (${unidad})` : ''} · ${pol?.electionDate ?? ''}`,
        subtitulo: `${etiquetaModo(modoEfectivo)} · ${cortesEfectivos.length} ${cortesEfectivos.length === 1 ? 'clase' : 'clases'} · ${conDato} de ${n} secciones con dato. Los ND quedan fuera de la escala.`,
        descripcion: `Mapa coroplético de ${indBase?.etiqueta ?? 'el indicador'} por sección censal de ${nombre}, convocatoria ${pol?.electionDate ?? ''}. ${conDato} secciones con dato y ${sinDato} sin dato.`,
        avisos: avisosLoc,
        escalaSimple: pocos,
      };
    }, [
      features,
      esCategorico,
      ganadoras,
      porCandidatura,
      pol,
      indicadorEfectivo,
      datos,
      observaciones,
      indBase,
      modo,
      clases,
      divergente,
      cortes,
      esVariacion,
      nombre,
      datos?.atlas?.provinceName,
    ]);

  const filaSel = useMemo(
    () => (seleccion ? (filas.find((f) => f.key === seleccion) ?? null) : null),
    [filas, seleccion],
  );

  // ── Exportación del mapa electoral ───────────────────────────────────────
  // El estado activo se convierte en un CONTRATO explícito y firmado antes de
  // tocar el navegador. Las comprobaciones se ejecutan dos veces: aquí, para no
  // capturar el mapa si el contrato ya es inválido, y dentro de
  // `componerPngPolitica`, para que ningún camino se salte la validación.
  const exportarMapaPng = useCallback(async () => {
    setExportError(null);
    setExportNotice('Componiendo el mapa electoral…');
    setExportando(true);
    try {
      if (!datos || !pol) {
        throw new Error('No hay resultados electorales cargados: no se puede identificar el dataset del PNG.');
      }

      // 1. Serie por sección y ganadora por sección, derivadas de las filas ya
      //    calculadas: el contrato y el mapa no pueden discrepar.
      const secciones: SeccionSeriePng[] = filas.map((f) => ({
        sectionKey: f.key,
        valor: f.value,
        estado: estadoSeccionPng(f.status),
      }));
      const ganadorasPorSeccion: Record<string, GanadoraSeccionPng> = {};
      for (const f of filas) {
        ganadorasPorSeccion[f.key] = {
          ganadoraId: f.ganadora?.ganadoraId ?? null,
          empate: Boolean(f.ganadora?.empate),
          estado: estadoSeccionPng(f.status),
        };
      }

      // 2. Contrato: dominio literal, identidad del dataset, leyenda explícita.
      const entrada: EntradaContratoPngPolitica = {
        domain: 'political',
        municipalityCode: codigoINE,
        municipalityName: nombre,
        // La provincia vive en el atlas; sin ella el pie del PNG decía
        // "Provincia: no consta" aunque el bootstrap la trajera.
        provinceName: datos?.atlas?.provinceName ?? null,
        electionId: pol.electionId,
        electionType: pol.electionType,
        electionDate: pol.electionDate,
        indicatorId: indicadorEfectivo,
        candidacyId: esCategorico ? null : candidaturaId,
        candidaturas: pol.candidaturas ?? [],
        secciones,
        ganadoras: ganadorasPorSeccion,
        cortes: cortesUsados,
        escala: escalaObservada,
        metodo: esCategorico ? null : modoEfectivoExport,
        divergente,
        geometria: {
          year: pol.geometria?.year ?? datos.anio_delimitacion ?? null,
          collection: null,
          source: datos.fuente || 'Instituto Nacional de Estadística (INE)',
          retrievedAt: null,
        },
        conciliacion: conciliacionDe(pol),
        correspondencia: correspondenciaDe(pol),
        avisos,
        notaLectura: descripcion,
        colorSinDato: COLOR_SIN_DATO,
        colorContornoSinDato: COLOR_CONTORNO_SIN_DATO,
        generadoEn: new Date().toISOString(),
      };
      const contrato = construirContratoPngPolitica(entrada);

      // 3. Validación ANTES de capturar. Si falla, no hay PNG.
      const fallos = validarContratoPngPolitica(contrato);
      if (fallos.length > 0) {
        const detalle = fallos.map((f) => f.mensaje).join(' ');
        setExportNotice(null);
        setExportError(
          `No se ha exportado nada (${fallos.length} ${fallos.length === 1 ? 'comprobación fallida' : 'comprobaciones fallidas'}): ${detalle}`,
        );
        return;
      }

      // 4. El mapa tiene que estar instanciado antes de capturar.
      const limite = Date.now() + MS_ESPERA_MAPA_POLITICA;
      while (Date.now() < limite && !mapaRef.current?.puedeCapturar()) {
        await new Promise<void>((r) => window.setTimeout(r, 120));
      }
      const handle = mapaRef.current;
      if (!handle) {
        throw new Error('El mapa todavía no está listo. Espere a que termine de cargar e inténtelo de nuevo.');
      }

      // 5. Captura y composición. El encuadre es el que el usuario ha dejado:
      //    la exportación no reencuadra, solo respeta lo que se está viendo.
      const captura = await handle.capturarParaPng(escalaPng);
      const lienzo = await componerPngPolitica({
        contrato,
        base: captura.canvas,
        baseOmitida: captura.baseOmitida,
        escala: escalaPng,
      });
      const blob = await blobDeLienzo(lienzo);
      if (!blob) throw new Error('El navegador no ha podido generar el archivo PNG.');
      const archivo = nombreArchivoPngPolitica(codigoINE, indicadorEfectivo, pol.electionDate);
      descargar(blob, archivo);
      setExportNotice(
        `${archivo} descargado · ${contrato.indicatorLabel} · ${contrato.electionLabel} · ` +
          `${contrato.coverage.seccionesRepresentadas} de ${contrato.coverage.seccionesTotales} secciones con dato · ` +
          `firma ${contrato.signature.slice(PREFIJO_FIRMA_POLITICA.length)}.` +
          (captura.baseOmitida
            ? ` Sin cartografía de fondo: ${captura.motivoBaseOmitida ?? 'el navegador no permitió leer las teselas.'}`
            : ''),
      );
    } catch (e) {
      setExportNotice(null);
      setExportError(e instanceof Error ? e.message : 'No se ha podido generar el PNG.');
    } finally {
      setExportando(false);
    }
  }, [
    avisos,
    candidaturaId,
    codigoINE,
    cortesUsados,
    datos,
    descripcion,
    divergente,
    escalaObservada,
    escalaPng,
    esCategorico,
    filas,
    indicadorEfectivo,
    modoEfectivoExport,
    nombre,
    pol,
  ]);

  if (estado === 'idle' || estado === 'cargando') {
    return (
      <div role="status" className="ideas-status flex items-center gap-3" data-state="pending">
        <span aria-hidden="true" className="inline-block h-4 w-4 flex-none animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--moss-ink)] motion-reduce:animate-none" />
        <p className="type-body-sm text-[var(--text-secondary)]">Cargando resultados electorales por sección de {nombre}…</p>
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div className="ideas-status" data-state="error" role="alert">
        <div className="ideas-status__head">
          <p className="ideas-status__title">No se pudieron cargar los resultados electorales</p>
        </div>
        <div className="ideas-status__body">
          <p>{error}</p>
          <button type="button" onClick={() => void cargar(eleccion)} className="mt-4 inline-flex min-h-[44px] items-center rounded-[6px] bg-[var(--action-primary-bg)] px-5 py-2 text-sm font-semibold text-[var(--action-primary-fg)]">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const estadoPolitico = pol?.status ?? 'object_missing';
  // El bloque que esta pestaña está pintando. Mientras carga, el mapa es un
  // plano de contornos; si falla, lo dice con el motivo del servidor. Sin esto,
  // las dos situaciones se leerían igual, y la conclusión «el municipio no tiene
  // resultados» es una afirmación distinta y mucho más fuerte que «todavía no
  // han llegado».
  const bloquePintando = estadoBloqueActivo;
  const bloqueCargando = bloquePintando?.estado === 'cargando' || bloquePintando === undefined;
  const bloqueFallido = bloquePintando?.estado === 'error';
  const bloqueVacio = bloquePintando?.estado === 'vacio';
  const reintentarBloque = () => {
    // `forzar` solo en la serie: es la única que puede haber quedado a medias. El
    // bloque de ganadoras ya está en la caché del atlas si llegó alguna vez, y
    // volver a pedirlo sin forzar no genera tráfico.
    if (peticionSerie) void pedirBloque(peticionSerie, { forzar: true });
    else if (peticionGanadoras) void pedirBloque(peticionGanadoras);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <SeccionesAtlasMap
            ref={mapaRef}
            features={features}
            filas={filas as FilaAtlas[]}
            municipioNombre={nombre}
            tituloLeyenda={titulo}
            subtituloLeyenda={subtitulo}
            entradasLeyenda={entradasLeyenda}
            descripcion={descripcion}
            presentacion={{ opacidad: 0.85, mostrarBordes: true, mostrarEtiquetas: false, basemap: true, divergente, cortesManuales: null, escalaPng: 1 }}
            seleccion={seleccion}
            hovered={hovered}
            onSeleccionar={(key) => escribirUrl({ sec: key })}
            onHover={setHovered}
            sinLeyenda
          />
          {bloqueCargando ? (
            <div role="status" className="mt-3 flex items-center gap-3" data-state="pending">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 flex-none animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--moss-ink)] motion-reduce:animate-none"
              />
              <p className="type-body-sm text-[var(--text-secondary)]">
                Cargando {esCategorico ? 'la ganadora por sección' : `los resultados de «${indBase?.etiqueta ?? indicadorEfectivo}»`} de la
                convocatoria {pol?.electionDate ?? 'ND'}…
              </p>
            </div>
          ) : null}
          {bloqueFallido ? (
            <div className="ideas-status mt-3" data-state="error" role="alert">
              <div className="ideas-status__head">
                <p className="ideas-status__title">No se pudieron cargar los resultados de esta convocatoria</p>
                <span className="ideas-status__badge">
                  {bloquePintando?.status ? `HTTP ${bloquePintando.status}` : 'Sin conexión'}
                </span>
              </div>
              <div className="ideas-status__body">
                <p>{bloquePintando?.error}</p>
                <button
                  type="button"
                  onClick={reintentarBloque}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-[6px] bg-[var(--action-primary-bg)] px-5 py-2 text-sm font-semibold text-[var(--action-primary-fg)]"
                >
                  Reintentar este bloque
                </button>
              </div>
            </div>
          ) : null}
          {bloqueVacio ? (
            <div className="ideas-status mt-3" data-state="pending" role="status">
              <div className="ideas-status__head">
                <p className="ideas-status__title">
                  {esCategorico
                    ? 'Ninguna sección con resultado en esta convocatoria'
                    : `«${indBase?.etiqueta ?? indicadorEfectivo}» no tiene ninguna celda publicada`}
                </p>
                <span className="ideas-status__badge">Sin dato</span>
              </div>
              <div className="ideas-status__body">
                <p>
                  El bloque llegó sin ninguna celda para la convocatoria {pol?.electionDate ?? 'ND'}. No es un
                  cero: no hay valor que repartir, así que el mapa muestra solo los contornos y no se pinta
                  una escala de color. El estado de publicación de la convocatoria está en «Metadatos de la
                  convocatoria», abajo.
                </p>
              </div>
            </div>
          ) : null}
          {avisoConvocatoria ? (
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{avisoConvocatoria}</p>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{subtitulo}</p>
          {avisos.length > 0 ? (
            <div className="mt-3 rounded-[6px] bg-[var(--bg-surface-sunken)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Avisos de lectura</h3>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside aria-label="Controles de Política" className="min-w-0 border-t border-[var(--border-strong)] pt-5 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="type-body-sm mb-3 font-semibold text-[var(--text-primary)]">Convocatoria</h3>
              <SeccionesPoliticaSelector
                electionId={eleccion}
                onConvocatoria={(id) => void cargar(id)}
                catalog={catalog}
                // `ganadoras` viene del bloque hidratado, no del bootstrap: el
                // selector solo lo usa como dato adjunto del estado.
                estado={pol ? { ...pol, candidatura: null, ganadoras } : null}
              />
            </section>

            <section className="border-t border-[var(--border-subtle)] pt-5">
              <h3 className="type-body-sm mb-3 font-semibold text-[var(--text-primary)]">Indicador</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="pol-indicador" className="type-label mb-1.5 block text-[var(--text-secondary)]">
                    Indicador
                  </label>
                  <select
                    id="pol-indicador"
                    className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    value={esCategorico ? ID_GANADORA : candidaturaId ? 'candidatura' : indicadorEfectivo}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === ID_GANADORA) {
                        setIndicador(ID_GANADORA);
                        setCandidaturaId('');
                        escribirUrl({ ind: ID_GANADORA, cand: '' });
                      } else if (v === 'candidatura') {
                        setIndicador(POLITICAL_INDICATOR_IDS.participation);
                        setCandidaturaId(candidaturasVisibles[0]?.c.id ?? '');
                        escribirUrl({ ind: idIndicadorCandidatura(candidaturasVisibles[0]?.c.id ?? ''), cand: candidaturasVisibles[0]?.c.id ?? '' });
                      } else {
                        setIndicador(v);
                        setCandidaturaId('');
                        escribirUrl({ ind: v, cand: '' });
                      }
                    }}
                  >
                    <option value={ID_GANADORA}>Candidatura ganadora (categórico)</option>
                    {CONTINUOS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.etiqueta} (continuo)
                      </option>
                    ))}
                    <option value="candidatura">Voto a una candidatura (continuo)</option>
                  </select>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    {esCategorico
                      ? 'Leyenda categórica con los colores estables de la fuente. No admite cuantiles, Jenks, intervalos ni cortes manuales.'
                      : `Escala continua sobre ${indBaseDenominador(indicadorEfectivo, CONTINUOS)}.`}
                  </p>
                </div>

                {candidaturasVisibles.length > 0 ? (
                  <div>
                    <label htmlFor="pol-candidatura" className="type-label mb-1.5 block text-[var(--text-secondary)]">
                      Candidatura
                    </label>
                    <select
                      id="pol-candidatura"
                      className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      value={candidaturaId}
                      onChange={(e) => {
                        setCandidaturaId(e.target.value);
                        escribirUrl({ ind: idIndicadorCandidatura(e.target.value), cand: e.target.value });
                      }}
                    >
                      <option value="">— Ninguna seleccionada —</option>
                      {candidaturasVisibles.map(({ c, secciones }) => (
                        <option key={c.id} value={c.id}>
                          {c.acronym || c.name} · gana {secciones} {secciones === 1 ? 'sección' : 'secciones'}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                      Lista dinámica del municipio y la convocatoria. No hay partidos fijados en el código.
                    </p>
                  </div>
                ) : null}

                {!esCategorico ? (
                  <>
                    <fieldset>
                      <legend className="type-label mb-1.5 block text-[var(--text-secondary)]">Clasificación</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {(['cuantil', 'intervalos_iguales', 'jenks', 'cortes_manuales'] as ModoClasificacion[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={modo === m}
                            onClick={() => {
                              setModo(m);
                              escribirUrl({ modo: m });
                            }}
                            className={`min-h-[44px] rounded-[6px] border px-3 py-1.5 text-[13px] transition-colors ${
                              modo === m
                                ? 'border-[var(--border-strong)] bg-[var(--musgo)] font-bold text-[var(--hueso)]'
                                : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)]'
                            }`}
                          >
                            {etiquetaModo(m)}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor="pol-clases" className="type-label mb-1.5 block text-[var(--text-secondary)]">
                        Número de clases
                      </label>
                      <select
                        id="pol-clases"
                        className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={clases}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setClases(v);
                          escribirUrl({ clases: v });
                        }}
                      >
                        {Array.from({ length: CLASES_MAXIMO - CLASES_MINIMO + 1 }, (_, i) => CLASES_MINIMO + i).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {modo === 'cortes_manuales' ? (
                      <div>
                        <label htmlFor="pol-cortes" className="type-label mb-1.5 block text-[var(--text-secondary)]">
                          Cortes manuales
                        </label>
                        <input
                          id="pol-cortes"
                          type="text"
                          inputMode="decimal"
                          value={cortes}
                          onChange={(e) => setCortes(e.target.value)}
                          placeholder="0, 10, 20, 30"
                          className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
                      </div>
                    ) : null}
                    <label className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={divergente}
                        onChange={(e) => setDivergente(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Paleta divergente (centro en cero, para variaciones)
                    </label>
                  </>
                ) : null}
              </div>
            </section>

            <DetallePolitica fila={filaSel} pol={pol} />

            {/* El PNG electoral se compone desde un CONTRATO FIRMADO del dataset
                político. El botón nombra el dominio, y el contrato se valida antes
                de capturar: si el dataset no se puede identificar como electoral, no
                se descarga nada y el aviso dice por qué. */}
            <section aria-label={DESCARGAS_TITULO} className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-5">
              <h3 className="type-body-sm font-semibold text-[var(--text-primary)]">{DESCARGAS_TITULO}</h3>
              <fieldset>
                <legend className="type-label mb-1.5 block text-[var(--text-secondary)]">Resolución del PNG</legend>
                <div role="radiogroup" aria-label="Resolución del PNG" className="flex flex-col">
                  {([1, 2] as EscalaPng[]).map((e) => (
                    <label key={e} className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="radio"
                        name="politica-escala-png"
                        checked={escalaPng === e}
                        onChange={() => setEscalaPng(e)}
                        className="h-4 w-4"
                      />
                      {e === 1 ? 'Estándar (1200 px)' : 'Alta (2400 px)'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                type="button"
                onClick={() => void exportarMapaPng()}
                disabled={exportando || nSecciones === 0 || bloqueCargando || bloqueFallido}
                title={
                  nSecciones === 0
                    ? 'No hay secciones que representar en esta convocatoria: la coropleta estaría vacía.'
                    : bloqueCargando
                      ? 'Los resultados de esta convocatoria aún se están cargando. El PNG se compone del estado que se está viendo, y ahora mismo ese estado no tiene valores.'
                      : bloqueFallido
                        ? 'No se pudieron cargar los resultados de esta convocatoria, así que no hay estado que componer.'
                        : undefined
                }
                className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] bg-[var(--action-primary-bg)] px-5 py-2 text-sm font-semibold text-[var(--action-primary-fg)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:opacity-60"
              >
                {exportando ? 'Componiendo el PNG…' : 'Descargar mapa coroplético PNG'}
              </button>
              <p aria-live="polite" className="text-xs leading-relaxed text-[var(--text-muted)] [overflow-wrap:anywhere]">
                {exportError ? (
                  <span className="socideas-error-text">{exportError}</span>
                ) : exportNotice ? (
                  <span>{exportNotice}</span>
                ) : (
                  <span>
                    Compone el estado que está viendo ahora: {titulo}. {nConDato} de {nSecciones} secciones con
                    dato y {nSinDato} sin dato. Los resultados son del Ministerio del Interior (Infoelectoral) y
                    el seccionado del INE. El PNG lleva su propia firma de contenido, distinta de la del atlas
                    económico.
                  </span>
                )}
              </p>
            </section>
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <TablaPolitica filas={filas as FilaAtlas[]} pol={pol} municipioNombre={nombre} />
        </div>
      </div>

      <MetadatosPolitica pol={pol} />
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        Datos de {SECCIONES_ATRIBUCION}. Mesas agregadas por suma de recuentos; los porcentajes se calculan
        después de la suma. Sin datos individuales, sin domicilios y sin inferencias sobre personas.
      </p>
      <span className="sr-only" aria-live="polite">
        {estadoPolitico !== 'available' ? `Estado de la convocatoria: ${ETIQUETA_ESTADO[estadoPolitico] ?? estadoPolitico}` : ''}
      </span>
      <p className="sr-only">{JSON.stringify({ cortesUsados: cortesUsados?.length ?? 0, escalaSimple })}</p>
    </div>
  );
}

function indBaseDenominador(id: string, continuos: typeof CONTINUOS): string {
  if (esIndicadorCandidatura(id)) return 'votos válidos';
  return continuos.find((c) => c.id === id)?.denominador ?? 'la base declarada por la fuente';
}

function etiquetaModo(m: ModoClasificacion): string {
  if (m === 'cuantil') return 'Cuantil';
  if (m === 'intervalos_iguales') return 'Intervalos iguales';
  if (m === 'jenks') return 'Jenks';
  return 'Manuales';
}

/** Conciliación municipal, en la forma del contrato. `null` si no consta. */
function conciliacionDe(pol: PoliticaBloque | null): ConciliacionPng | null {
  const c = pol?.conciliacion;
  if (!c) return null;
  return { status: c.status, reference: c.reference, differences: c.differences, notes: c.notes ?? [] };
}

/**
 * Correspondencia entre secciones de resultado y polígonos. Se declara aparte
 * de la cobertura del MAPA a propósito: `coveragePercentage` mide cuántas
 * secciones de resultado casan con un polígono, no cuántas secciones tienen
 * dato pintado, y confundirlas daría un porcentaje que no corresponde a nada.
 */
function correspondenciaDe(pol: PoliticaBloque | null): CorrespondenciaPng | null {
  const g = pol?.geometria;
  if (!g) return null;
  return {
    status: g.correspondenceStatus,
    resultSections: g.resultSections,
    geometrySections: g.geometrySections,
    matchedSections: g.matchedSections,
    coveragePercentage: g.coveragePercentage,
    notes: g.notes ?? [],
  };
}

function DetallePolitica({
  fila,
  pol,
}: {
  fila: (FilaAtlas & { ganadora?: SeccionGanadoraUI }) | null;
  pol: PoliticaBloque | null;
}) {
  const g = fila?.ganadora ?? null;
  if (!fila) {
    return (
      <section className="border-t border-[var(--border-subtle)] pt-5">
        <h3 className="type-body-sm font-semibold text-[var(--text-primary)]">Sección seleccionada</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          Pulse un polígono o una fila de la tabla. La ficha muestra distrito, mesas agregadas, ganador,
          segunda, margen, participación, blancos, nulos y las advertencias de la fuente.
        </p>
      </section>
    );
  }
  const cand = (id: string | null | undefined) =>
    id ? (pol?.candidaturas ?? []).find((c) => c.id === id) ?? null : null;
  const gana = cand(g?.ganadoraId);
  const seg = cand(g?.segundaId);
  const D = 'text-xs text-[var(--text-muted)]';
  const V = 'mt-0.5 text-sm text-[var(--text-primary)] tnum';
  return (
    <section aria-label={`Detalle político de la sección ${fila.key}`} className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-5">
      <div>
        <h3 className="type-body-sm font-semibold text-[var(--text-primary)]">
          Sección <span className="tnum">{fila.key}</span>
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Distrito {g?.distrito ?? 'ND'} · {g?.mesas ?? 0} {g?.mesas === 1 ? 'mesa agregada' : 'mesas agregadas'} ·
          convocatoria {pol?.electionDate ?? 'ND'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className={D}>Censo</dt>
          <dd className={V}>{g?.censo?.toLocaleString('es-ES') ?? 'ND'}</dd>
        </div>
        <div>
          <dt className={D}>Votantes</dt>
          <dd className={V}>{g?.votantes?.toLocaleString('es-ES') ?? 'ND'}</dd>
        </div>
        <div>
          <dt className={D}>Participación</dt>
          <dd className={V}>{g?.participacion === null || g?.participacion === undefined ? 'ND' : `${g.participacion.toFixed(2)} %`}</dd>
        </div>
        <div>
          <dt className={D}>Abstención</dt>
          <dd className={V}>{g?.abstencion === null || g?.abstencion === undefined ? 'ND' : `${g.abstencion.toFixed(2)} %`}</dd>
        </div>
        <div>
          <dt className={D}>Blancos</dt>
          <dd className={V}>{g?.blancos?.toLocaleString('es-ES') ?? 'ND'}</dd>
        </div>
        <div>
          <dt className={D}>Nulos</dt>
          <dd className={V}>{g?.nulos?.toLocaleString('es-ES') ?? 'ND'}</dd>
        </div>
        <div className="col-span-2">
          <dt className={D}>Ganadora</dt>
          <dd className={V}>
            {gana ? `${gana.acronym || gana.name}` : 'ND'}{' '}
            {g?.ganadoraVotos !== null && g?.ganadoraVotos !== undefined
              ? `· ${g.ganadoraVotos.toLocaleString('es-ES')} votos · ${g.ganadoraPct?.toFixed(2) ?? 'ND'} %`
              : ''}
            {g?.empate ? ' · empate registrado' : ''}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className={D}>Segunda</dt>
          <dd className={V}>
            {seg ? `${seg.acronym || seg.name}` : 'ND'}{' '}
            {g?.segundaVotos !== null && g?.segundaVotos !== undefined
              ? `· ${g.segundaVotos.toLocaleString('es-ES')} votos · ${g.segundaPct?.toFixed(2) ?? 'ND'} %`
              : ''}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className={D}>Margen</dt>
          <dd className={V}>{g?.margen === null || g?.margen === undefined ? 'ND' : `${g.margen.toFixed(2)} p. p.`}</dd>
        </div>
      </dl>
      {g?.mesasIds?.length ? (
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Mesas agregadas: <span className="tnum">{g.mesasIds.join(', ')}</span>
        </p>
      ) : null}
      {pol?.notas?.length ? (
        <div className="rounded-[6px] bg-[var(--bg-surface-sunken)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Advertencias de la fuente</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {pol.notas.slice(0, 5).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function TablaPolitica({
  filas,
  pol,
  municipioNombre,
}: {
  filas: ReadonlyArray<FilaAtlas & { ganadora?: SeccionGanadoraUI }>;
  pol: { electionDate: string; conciliacion: { status: string } | null; publicacion: { publishable: boolean; reason: string | null } | null } | null;
  municipioNombre: string;
}) {
  const [filtro, setFiltro] = useState('');
  const orden = (a: (typeof filas)[number], b: (typeof filas)[number]) => a.key.localeCompare(b.key);
  const filtradas = useMemo(
    () => (filtro.trim() ? filas.filter((f) => f.key.includes(filtro.trim())) : [...filas]).sort(orden),
    [filas, filtro],
  );
  const etiq = (id: string | null | undefined) => {
    const c = (pol as { candidaturas?: Candidacy[] } | null)?.candidaturas?.find((x) => x.id === id);
    return c ? c.acronym || c.name : 'ND';
  };
  const TH = 'px-3 py-1 text-left align-bottom type-label font-semibold text-[var(--text-secondary)]';
  return (
    <section aria-label="Tabla política de secciones censales" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="type-h4 text-[var(--text-primary)]">Tabla de resultados por sección</h2>
          <p className="tnum mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {filtradas.length} de {filas.length} secciones · convocatoria {pol?.electionDate ?? 'ND'} · estado de
            publicación {pol?.publicacion?.publishable ? 'publicable' : 'no publicable'}
            {pol?.conciliacion ? ` · conciliación ${pol.conciliacion.status}` : ''}
          </p>
        </div>
        <div className="sm:w-64">
          <label htmlFor="pol-filtro" className="type-label mb-1.5 block text-[var(--text-secondary)]">
            Filtrar por clave de sección
          </label>
          <input
            id="pol-filtro"
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Por ejemplo 28079"
            className="tnum min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>
      </div>
      <div
        className="max-h-[34rem] w-full min-w-0 max-w-[100vw] overflow-x-auto overflow-y-auto overscroll-x-contain rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] [contain:paint]"
        tabIndex={0}
        role="region"
        aria-label={`Tabla de resultados por sección de ${municipioNombre}`}
      >
        <table className="socideas-table tnum w-full text-left text-[13px]">
          <caption className="border-b border-[var(--border-subtle)] px-3 py-2.5 text-left text-xs leading-relaxed text-[var(--text-muted)]">
            Una fila por sección censal con resultados. Las secciones sin dato aparecen como «ND»: eso no es un
            cero. Sin datos individuales ni domicilios.
          </caption>
          <thead className="sticky top-0 z-10 bg-[var(--bg-surface-sunken)]">
            <tr>
              {['Sección', 'Distrito', 'Mesas', 'Censo', 'Votantes', 'Participación', 'Ganadora', '%', 'Segunda', 'Margen', 'Blancos', 'Nulos'].map((h) => (
                <th key={h} scope="col" className={`${TH} border-b border-[var(--border-default)]`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => {
              const g = f.ganadora ?? null;
              return (
                <tr key={f.key} data-estado={f.esSinDato ? 'sin-dato' : 'observado'} className="border-b border-[var(--border-subtle)]">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className="inline-block h-3 w-3 flex-none border" style={{ background: f.color, borderColor: f.esSinDato ? COLOR_CONTORNO_SIN_DATO : 'var(--border-default)' }} />
                      {f.key}
                    </span>
                  </th>
                  <td className="px-3 py-2">{g?.distrito ?? 'ND'}</td>
                  <td className="px-3 py-2 text-right">{g?.mesas ?? 0}</td>
                  <td className="px-3 py-2 text-right">{g?.censo?.toLocaleString('es-ES') ?? 'ND'}</td>
                  <td className="px-3 py-2 text-right">{g?.votantes?.toLocaleString('es-ES') ?? 'ND'}</td>
                  <td className="px-3 py-2 text-right">{g?.participacion === null || g?.participacion === undefined ? 'ND' : `${g.participacion.toFixed(1)} %`}</td>
                  <td className="px-3 py-2">{f.esSinDato ? 'ND' : etiq(g?.ganadoraId)}</td>
                  <td className="px-3 py-2 text-right">{g?.ganadoraPct === null || g?.ganadoraPct === undefined ? 'ND' : g.ganadoraPct.toFixed(1)}</td>
                  <td className="px-3 py-2">{f.esSinDato ? 'ND' : etiq(g?.segundaId)}</td>
                  <td className="px-3 py-2 text-right">{g?.margen === null || g?.margen === undefined ? 'ND' : g.margen.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{g?.blancos?.toLocaleString('es-ES') ?? 'ND'}</td>
                  <td className="px-3 py-2 text-right">{g?.nulos?.toLocaleString('es-ES') ?? 'ND'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type PoliticaBloque = NonNullable<NonNullable<NonNullable<RespuestaPolitica['data']>['dominios']>['politica']>;

function MetadatosPolitica({ pol }: { pol: PoliticaBloque | null }) {
  if (!pol) return null;
  return (
    <section aria-label="Metadatos de la convocatoria" className="rounded-[6px] bg-[var(--bg-surface-sunken)] px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Metadatos de la convocatoria</h2>
      <dl className="mt-2 grid grid-cols-1 gap-2 text-xs leading-relaxed text-[var(--text-secondary)] sm:grid-cols-2">
        <div>
          <dt className="text-[var(--text-muted)]">Tipo y fecha</dt>
          <dd className="tnum">
            {ELECTION_TYPE_LABEL[pol.electionType] ?? pol.electionType} · {pol.electionDate}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Mesas agregadas</dt>
          <dd className="tnum">{pol.mesas_agregadas.toLocaleString('es-ES')}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Correspondencia con el seccionado</dt>
          <dd>
            {pol.geometria?.year ?? 'ND'} · {pol.geometria?.correspondenceStatus ?? 'ND'} ·{' '}
            {pol.geometria?.coveragePercentage?.toFixed(1) ?? 'ND'} %
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Conciliación municipal</dt>
          <dd>{pol.conciliacion?.status ?? 'no comprobada'}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Publicación</dt>
          <dd>{pol.publicacion?.publishable ? 'publicable' : `no publicable: ${pol.publicacion?.reason ?? 'ND'}`}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Fuente</dt>
          <dd>Ministerio del Interior · Infoelectoral (APLIEXTR, resultados por mesa)</dd>
        </div>
      </dl>
    </section>
  );
}
