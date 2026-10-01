// Composición PNG del atlas de secciones censales de SOCideas.
//
// MÓDULO PURO de presentación: no importa React, ni Leaflet, ni hace fetch, ni
// lee variables de entorno. Recibe un mapa YA RENDERIZADO (canvas o imagen) y le
// añade el marco editorial: cabecera, bloque mapa+leyenda y pie de fuentes.
//
// DISPOSICIÓN DEL PNG (distinta y deliberadamente INDEPENDIENTE de la web):
//
//   ┌───────────────────────────────────────────────────────────┐
//   │ cabecera: título, municipio, año, unidad, clasificación   │
//   ├────────────────────────────────┬──────────────────────────┤
//   │                                │ LEYENDA lateral          │
//   │            MAPA                │ 76-80 % │ 20-24 %        │
//   │                                │ misma altura, sin solape │
//   ├────────────────────────────────┴──────────────────────────┤
//   │ FUENTES Y METADATOS estructurados a ancho completo        │
//   └───────────────────────────────────────────────────────────┘
//
// La vista web pone la leyenda DEBAJO del mapa; este documento pone la leyenda
// A LA DERECHA. No comparten función de composición: cada una reserva su espacio
// antes de medir.
//
// Reglas duras que este módulo respeta por construcción:
//  - Fondo SÓLIDO `--hueso`. Nunca un PNG con transparencia inesperada.
//  - Colores DISCRETOS: los de la rampa del contrato o tokens IMA. Cero
//    degradados: cada clase es un color plano con su borde.
//  - La leyenda incluye SIEMPRE una entrada propia de «Sin dato / ND», con
//    trama diagonal, y una nota explícita de que ND ≠ 0.
//  - El pie incluye SIEMPRE fuente, organismo, operación, tabla, año de la
//    geometría, periodo estadístico, fechas de descarga, nº de secciones
//    representadas, cobertura y la atribución real del mapa base.
//  - Nada de iconos ni de binarios: la marca IMA es texto.
//  - NINGÚN texto se recorta: todo se envuelve con `measureText` antes de
//    dibujarse y el bloque crece en altura en lugar de cortar.

import type { ResultadoClasificacion } from "./socideas-secciones";

/** Resolución de salida. 1 = estándar, 2 = alta (el doble de lado). */
export type EscalaPng = 1 | 2;

export interface EntradaLeyendaPng {
  /** Texto listo para leyenda, p. ej. «14,10 % – 18,42 %». */
  etiqueta: string;
  /** Color plano de la clase (hex de la rampa del contrato). */
  color: string;
  /** Nº de secciones en la clase. `null` para la entrada de sin dato. */
  secciones: number | null;
  /** `true` solo para la entrada de sin dato: se dibuja con trama diagonal. */
  esSinDato?: boolean;
  /**
   * Color plano POR IDENTIDAD de la fila de leyenda, resuelto por quien compone
   * el contrato.
   *
   * Sin este campo la muestra se pinta buscando por texto (`etiqueta`), que es
   * frágil en cuanto la leyenda deja de ser una lista de intervalos: dos
   * candidaturas pueden compartir sigla y el rótulo «Sin dato / ND» colisiona
   * con cualquier intervalo. Cuando está presente tiene prioridad y la
   * coincidencia por texto no llega a ejecutarse.
   */
  colorMuestra?: string | null;
}

/**
 * Cómo describe la leyenda su propia escala.
 *
 * El compositor tiene un único comportamiento por defecto (derivado de
 * `clasificacion`): intervalo, unidad y número de clases. Eso describe un mapa
 * NUMÉRICO y no describe uno CATEGÓRICO, donde no hay cortes ni escala: hay una
 * lista. Cuando el documento es categórico el llamante pasa aquí los rótulos
 * que sí son ciertos, y el compositor deja de imprimir «Sin escala: ningún
 * valor observado» sobre un mapa que sí tiene escala.
 */
export type DescriptorEscalaPng =
  | { readonly tipo: 'numerica' }
  | {
      readonly tipo: 'cualitativa';
      /** Sustituye a «Unidad: …» en la leyenda lateral. */
      readonly rotuloUnidad: string;
      /** Sustituye a la línea «Unidad · Clasificación · N clases» de la cabecera. */
      readonly rotuloCabecera: string;
      /** Sustituye a la línea de escala observada de la cabecera. */
      readonly lineaEscala: string;
      /** Sustituye a «<modo> · N clases» en la cabecera de la leyenda. */
      readonly rotuloLeyenda: string;
    };

export interface OpcionesComponerPngMapa {
  /** Mapa ya renderizado. Nunca `null`: si el mapa base falló, el llamante
   *  entrega un lienzo en `--hueso` con coropleta y contornos, y marca
   *  `baseOmitida: true`. */
  base: HTMLCanvasElement | HTMLImageElement;
  /** Indicador tal y como se publica (etiqueta del catálogo). */
  indicador: string;
  municipio: string;
  provincia?: string | null;
  /** Periodo estadístico. `null` cuando no hay ninguna observación. */
  anio: number | null;
  unidad: string;
  /** Texto del modo de clasificación, ya en español. */
  modoClasificacion: string;
  /** Resultado de `clasificar()`. `null` si no hay nada que clasificar. */
  clasificacion: ResultadoClasificacion | null;
  entradasLeyenda: EntradaLeyendaPng[];
  colorSinDato: string;
  colorContornoSinDato: string;
  fuente: string;
  /** Tabla u operación, tal y como la declara el catálogo del indicador. */
  tabla: string;
  /** URL de la tabla/operación en INEbase. Se abrevia a dominio en el pie. */
  urlTabla?: string | null;
  /** Año de la COLECCIÓN de seccionado (geometría). Distinto de `anio`. */
  anioGeometria: number | null;
  coleccionGeometria?: string | null;
  periodo: number | null;
  fechaGeometria?: string | null;
  fechaEstadistica?: string | null;
  /** Secciones con dato efectivamente pintadas. */
  seccionesRepresentadas: number;
  /** Secciones del municipio publicadas en la geometría. */
  seccionesTotales: number;
  seccionesSinDato: number;
  coberturaPct: number;
  /** `true` si el PNG se compone SIN el mapa base (lectura del lienzo no
   *  disponible). El pie lo declara; el marco y la leyenda siguen completos. */
  baseOmitida?: boolean;
  escala?: EscalaPng;
  /** Avisos metodológicos que NO se pueden ocultar ni en pantalla ni aquí. */
  avisos?: string[];
  /** Descripción de lectura del mapa. Se coloca al pie de la leyenda lateral
   *  para que la columna carry información real en lugar de espacio vacío. */
  notaLectura?: string | null;
  /**
   * Título del documento. Si se omite se compone como
   * «indicador · municipio · año». Un documento electoral necesita además tipo
   * de proceso y fecha de convocatoria, así que lo compone el llamante.
   */
  titulo?: string | null;
  /** Antetítulo de la cabecera. Por defecto «SOCideas, secciones censales». */
  encabezado?: string | null;
  /**
   * Autoridad estadística de los DATOS. Por defecto el INE, que es lo cierto
   * para un indicador económico y FALSO para unos resultados electorales, cuya
   * autoridad es el Ministerio del Interior.
   */
  organismo?: string | null;
  /** Organismo que aporta la GEOMETRÍA. Por defecto, `fuente`. */
  organismoGeometria?: string | null;
  /** Identidad de la convocatoria. Se añade al bloque «Fuente y estadística». */
  convocatoria?: string | null;
  /** Cómo se describe la escala. Por defecto, la numérica de `clasificacion`. */
  escalaLeyenda?: DescriptorEscalaPng;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens IMA. Se leen del documento cuando existe; el hex es solo el valor por
// defecto para que el módulo también funcione en un contexto sin DOM.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_TOKENS: Record<string, string> = {
  "--hueso": "#F1F1F1",
  "--carbon-600": "#3C403E",
  "--carbon-700": "#2E312F",
  "--carbon-400": "#747876",
  "--musgo-500": "#3E665C",
  "--musgo-700": "#21463D",
  "--musgo-100": "#D5EDE6",
  "--limo-300": "#D4DFD4",
  "--limo-500": "#B0BDB0",
  "--limo-600": "#8F9B8F",
  "--limo-800": "#505A50",
};

const cacheTokens = new Map<string, string>();

/** Resuelve un token IMA a un color utilizable en un lienzo. Se exporta para
 *  que el mapa y el PNG pinten exactamente el mismo color. */
export function tokenIma(nombre: string): string {
  const cacheado = cacheTokens.get(nombre);
  if (cacheado) return cacheado;
  let valor = FALLBACK_TOKENS[nombre] ?? "#000000";
  if (typeof document !== "undefined" && typeof window !== "undefined" && window.getComputedStyle) {
    try {
      const leido = window.getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
      if (leido) valor = leido;
    } catch {
      // Sin DOM completo: se mantiene el valor por defecto.
    }
  }
  cacheTokens.set(nombre, valor);
  return valor;
}

const token = tokenIma;

const FAMILIA = '"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto (métricas reales: `measureText`, no estimación de caracteres)
// ─────────────────────────────────────────────────────────────────────────────

/** Parte `texto` en líneas que caben en `anchoMax`, sin cortar palabras. */
function envolver(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number, maxLineas = 0): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of limpio.split(" ")) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width <= anchoMax || !actual) {
      // Palabra suelta más ancha que la caja: se parte por caracteres.
      if (!actual && ctx.measureText(prueba).width > anchoMax) {
        let trozo = "";
        for (const ch of palabra) {
          if (ctx.measureText(trozo + ch).width > anchoMax && trozo) {
            lineas.push(trozo);
            trozo = ch;
          } else {
            trozo += ch;
          }
        }
        actual = trozo;
        continue;
      }
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  if (maxLineas > 0 && lineas.length > maxLineas) {
    const recorte = lineas.slice(0, maxLineas);
    const ult = recorte[maxLineas - 1];
    recorte[maxLineas - 1] = `${ult.replace(/[\s,;.]+$/, "")}…`;
    return recorte;
  }
  return lineas;
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "no consta";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

/** Dominio legible de una URL, para el pie sin url completa. */
function dominio(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function anchoBase(base: HTMLCanvasElement | HTMLImageElement): { w: number; h: number } {
  if (base instanceof HTMLCanvasElement) {
    return { w: base.width || 1, h: base.height || 1 };
  }
  return { w: base.naturalWidth || base.width || 1, h: base.naturalHeight || base.height || 1 };
}

/** Crea el patrón de trama diagonal de «sin dato». Es el MISMO patrón que usa
 *  el mapa en pantalla, para que leyenda, mapa y PNG sean la misma cosa. */
export function patronTramaSinDato(
  ctx: CanvasRenderingContext2D,
  colorBase: string,
  colorLinea: string,
  tamanoPx = 8,
): string | CanvasPattern {
  const t = Math.max(4, Math.round(tamanoPx));
  if (typeof document === "undefined") return colorBase;
  try {
    const off = document.createElement("canvas");
    off.width = t;
    off.height = t;
    const octx = off.getContext("2d");
    if (!octx) return colorBase;
    octx.fillStyle = colorBase;
    octx.fillRect(0, 0, t, t);
    octx.strokeStyle = colorLinea;
    octx.lineWidth = Math.max(1, t / 4);
    octx.beginPath();
    octx.moveTo(-t, t);
    octx.lineTo(t, -t);
    octx.moveTo(0, t * 2);
    octx.lineTo(t * 2, 0);
    octx.stroke();
    const patron = ctx.createPattern(off, "repeat");
    return patron ?? colorBase;
  } catch {
    return colorBase;
  }
}

async function esperarFuente(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts || !document.fonts.load) return;
  try {
    await document.fonts.load(`600 22px ${FAMILIA}`);
    await document.fonts.load(`700 22px ${FAMILIA}`);
    await document.fonts.ready;
  } catch {
    // Sin API de fuentes: se dibuja con la pila del sistema. El PNG sigue siendo válido.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloques de texto medidos
// ─────────────────────────────────────────────────────────────────────────────

/** Una línea de un bloque medido: sabe su altura y su peso tipográfico. */
interface LineaMedida {
  t: string;
  h: number;
  fuerte?: boolean;
  titulo?: boolean;
}

/** Envuelve un texto a `ancho` y devuelve sus líneas con altura `altoLinea`. */
function medirLineas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  ancho: number,
  opts: { font: string; alto: number; fuerte?: boolean; titulo?: boolean; maxLineas?: number },
): LineaMedida[] {
  ctx.font = opts.font;
  return envolver(ctx, texto, ancho, opts.maxLineas ?? 0).map((t) => ({
    t,
    h: opts.alto,
    fuerte: opts.fuerte,
    titulo: opts.titulo,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Composición
// ─────────────────────────────────────────────────────────────────────────────

/** Compone el PNG del atlas sobre un lienzo nuevo y lo devuelve.
 *
 *  El lienzo devuelto es opaco (`alpha: false`) y con
 *  `preserveDrawingBuffer: true`, de modo que el llamante puede volver a
 *  leerlo o convertirlo a blob sin perder nada. */
export async function componerPngMapa(opts: OpcionesComponerPngMapa): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") {
    throw new Error("componerPngMapa solo puede ejecutarse en el navegador");
  }
  const escala: EscalaPng = opts.escala === 2 ? 2 : 1;

  await esperarFuente();

  // ── Geometría del documento ──────────────────────────────────────────────
  // El ancho de la leyenda se RESERVA ANTES de medir el mapa: de ahí sale el
  // rectángulo real del mapa. Desplazar la leyenda después no cabría.
  const W = 1200; // ancho lógico de salida (el lado mayor declarado en los ajustes)
  const M = 24; // margen exterior
  const ANCHO_UTIL = W - M * 2;
  const GAP = 18; // separación entre mapa y leyenda
  const ANCHO_LEYENDA = Math.round(ANCHO_UTIL * 0.225); // 22,5 % del ancho útil
  const ANCHO_MAPA = ANCHO_UTIL - GAP - ANCHO_LEYENDA; // ≈76 % del ancho útil

  const t = {
    hueso: token("--hueso"),
    texto: token("--carbon-600"),
    textoFuerte: token("--carbon-700"),
    musgo: token("--musgo-500"),
    musgoOscuro: token("--musgo-700"),
    limoClaro: token("--limo-300"),
    limo: token("--limo-500"),
    limoMedio: token("--limo-600"),
  };

  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d", { alpha: false, willReadFrequently: false });
  if (!ctx) throw new Error("No hay contexto 2D disponible para componer el PNG");

  // ── Pasada 1: medición ───────────────────────────────────────────────────
  // 1. Cabecera
  const tituloCompuesto = `${opts.indicador} · ${opts.municipio}${opts.anio !== null ? ` · ${opts.anio}` : ""}`;
  const titulo = opts.titulo ?? tituloCompuesto;
  const lineasTitulo = medirLineas(ctx, titulo, ANCHO_UTIL - 110, { font: `700 23px ${FAMILIA}`, alto: 28 });
  const nClases = opts.clasificacion?.cortes.length ?? 0;
  const escalaCualitativa =
    opts.escalaLeyenda?.tipo === "cualitativa" ? opts.escalaLeyenda : null;
  // El recuento de clases solo tiene sentido con cortes. Una leyenda
  // categórica dice cuántas candidaturas hay en su propio rótulo, y no «0
  // clases»: eso sería afirmar que el mapa no tiene escala cuando lo que
  // tiene es una lista.
  const contadorClases = escalaCualitativa
    ? ""
    : nClases
      ? ` · ${nClases} ${nClases === 1 ? "clase" : "clases"}`
      : "";
  const cabeceras: string[] = [
    escalaCualitativa
      ? escalaCualitativa.rotuloCabecera
      : `Unidad: ${opts.unidad || "sin unidad declarada"} · Clasificación: ${opts.modoClasificacion}${contadorClases}`,
    escalaCualitativa
      ? escalaCualitativa.lineaEscala
      : opts.clasificacion && opts.clasificacion.nObservados > 0
        ? `Escala observada: ${opts.clasificacion.min.toLocaleString("es-ES")} – ${opts.clasificacion.max.toLocaleString("es-ES")} ${opts.unidad} · ${opts.clasificacion.nObservados} secciones observadas`
        : "Sin escala: ningún valor observado para el indicador y el periodo seleccionados.",
    `Provincia: ${opts.provincia ?? "no consta"} · Seccionado (geometría): ${opts.anioGeometria ?? "no consta"}${opts.coleccionGeometria ? ` (${opts.coleccionGeometria})` : ""} · Periodo estadístico: ${opts.periodo ?? "no consta"}`,
  ];
  if (opts.clasificacion?.reducidoPorValoresDistintos && !escalaCualitativa) {
    cabeceras.push(
      `Clasificación reducida: solo ${opts.clasificacion.valoresDistintos} ${opts.clasificacion.valoresDistintos === 1 ? "valor distinto" : "valores distintos"} entre las secciones observadas; no se repite color ni se inventa una escala.`,
    );
  }
  const lineasSubtitulo = cabeceras.flatMap((s) =>
    medirLineas(ctx, s, ANCHO_UTIL, { font: `400 12.5px ${FAMILIA}`, alto: 17 }),
  );
  const ALTO_CABECERA = 20 + lineasTitulo.length * 28 + lineasSubtitulo.length * 17 + 26;

  // 2. Leyenda lateral. Se mide EN ANCHO DE LEYENDA y se ajusta al rectángulo
  //    que luego tendrá, de modo que ninguna etiqueta se corte.
  const ANCHO_TEXTO_LEYENDA = ANCHO_LEYENDA - 32; // muestra de 20 px + 6 px de aire + aire final
  const totalRepresentadas = opts.entradasLeyenda.reduce((s, e) => s + (e.secciones ?? 0), 0);
  // «Clasificación por cuantiles» se acorta en la leyenda: el rótulo ya dice
  // «Clasificación», repetirlo dos veces en la misma línea no informa.
  const modoCorto = opts.modoClasificacion
    .replace(/^Clasificaci[oó]n por /i, "")
    .replace(/^Clasificaci[oó]n /i, "")
    .trim();
  const lineasLeyenda: LineaMedida[] = [];
  lineasLeyenda.push(
    ...medirLineas(ctx, "Leyenda", ANCHO_LEYENDA, {
      font: `700 11px ${FAMILIA}`,
      alto: 17,
      fuerte: true,
      titulo: true,
    }),
  );
  lineasLeyenda.push(
    ...medirLineas(ctx, opts.indicador, ANCHO_LEYENDA, {
      font: `600 10.5px ${FAMILIA}`,
      alto: 14,
      fuerte: true,
      maxLineas: 3,
    }),
  );
  lineasLeyenda.push(
    ...medirLineas(ctx, escalaCualitativa ? escalaCualitativa.rotuloUnidad : `Unidad: ${opts.unidad || "no declarada"}`, ANCHO_LEYENDA, {
      font: `400 9.5px ${FAMILIA}`,
      alto: 12.5,
    }),
  );
  lineasLeyenda.push(
    ...medirLineas(ctx, opts.convocatoria ? `Convocatoria: ${opts.convocatoria}` : `Periodo: ${opts.periodo ?? "no consta"}`, ANCHO_LEYENDA, {
      font: `400 9.5px ${FAMILIA}`,
      alto: 12.5,
    }),
  );
  lineasLeyenda.push(
    ...medirLineas(
      ctx,
      escalaCualitativa
        ? escalaCualitativa.rotuloLeyenda
        : `${modoCorto} · ${nClases} ${nClases === 1 ? "clase" : "clases"}`,
      ANCHO_LEYENDA,
      { font: `600 9.5px ${FAMILIA}`, alto: 13, fuerte: true },
    ),
  );
  lineasLeyenda.push({ t: "", h: 4 });

  // Una fila por clase: muestra + intervalo ENVUELTO (nunca cortado) + n.
  interface FilaLeyenda {
    etiqueta: string;
    lineas: string[];
    n: number | null;
    esSinDato: boolean;
    /** Color resuelto por quien compone el contrato. `null` = buscar por texto. */
    colorMuestra: string | null;
  }
  const filasLeyenda: FilaLeyenda[] = [];
  ctx.font = `400 9.5px ${FAMILIA}`;
  for (const e of opts.entradasLeyenda) {
    const n = e.secciones === null ? "" : ` (${e.secciones})`;
    const lineas = envolver(ctx, `${e.etiqueta}${n}`, ANCHO_TEXTO_LEYENDA);
    filasLeyenda.push({
      etiqueta: e.etiqueta,
      lineas,
      n: e.secciones,
      esSinDato: Boolean(e.esSinDato),
      colorMuestra: e.colorMuestra ?? null,
    });
  }
  const ALTO_CABECERA_LEYENDA = lineasLeyenda.reduce((s, l) => s + l.h, 0) + 10;
  const ALTO_FILAS_LEYENDA = filasLeyenda.reduce((s, f) => s + Math.max(14, f.lineas.length * 13) + 5, 0);

  // Nota de ND: solo si hay ND, y siempre diciendo que no es cero.
  const lineasNotaND: LineaMedida[] = [];
  if (opts.seccionesSinDato > 0) {
    lineasNotaND.push(
      ...medirLineas(
        ctx,
        "ND — Sin dato oficial: la fuente no difunde valor para esas secciones. No equivale a cero y quedan fuera de la escala de color.",
        ANCHO_LEYENDA,
        { font: `400 9px ${FAMILIA}`, alto: 12 },
      ),
    );
  }
  const lineasTotal: LineaMedida[] = medirLineas(
    ctx,
    `${totalRepresentadas} secciones representadas${opts.seccionesSinDato > 0 ? ` · ${opts.seccionesSinDato} ND` : ""}`,
    ANCHO_LEYENDA,
    { font: `600 9.5px ${FAMILIA}`, alto: 13, fuerte: true },
  );

  // Nota de lectura al pie de la leyenda: contenido real sobre cómo interpretar
  // el mapa, que además evita que la columna lateral quede vacía cuando el
  // bloque del mapa es alto.
  const lineasLectura: LineaMedida[] = opts.notaLectura
    ? [
        { t: "", h: 10 },
        ...medirLineas(ctx, "Cómo leer este mapa", ANCHO_LEYENDA, {
          font: `700 9px ${FAMILIA}`,
          alto: 12,
          titulo: true,
        }),
        ...medirLineas(ctx, opts.notaLectura, ANCHO_LEYENDA, {
          font: `400 9px ${FAMILIA}`,
          alto: 12,
        }),
      ]
    : [];

  const ALTO_LEYENDA =
    12 +
    ALTO_CABECERA_LEYENDA +
    ALTO_FILAS_LEYENDA +
    (lineasNotaND.length ? lineasNotaND.reduce((s, l) => s + l.h, 0) + 8 : 0) +
    lineasTotal.reduce((s, l) => s + l.h, 0) +
    lineasLectura.reduce((s, l) => s + l.h, 0) +
    12;

  // 3. Alto del mapa: sale de SU ASPECTO con el ancho ya reservado. El tope
  // solo evita bloques desproporcionados en municipios con ventana panorámica;
  // no deforma la geometría ni recorta secciones.
  const base = anchoBase(opts.base);
  const relacion = base.h / Math.max(1, base.w);
  const ALTO_MAPA_NATURAL = Math.round(Math.max(420, Math.min(760, relacion * ANCHO_MAPA)));

  // Mapa y leyenda: EXACTAMENTE la misma altura, sin solape. Si la leyenda
  // necesita más, crece el bloque y el mapa se centra dentro.
  const ALTO_BLOQUE = Math.max(ALTO_MAPA_NATURAL, ALTO_LEYENDA);

  // 4. Pie de fuentes: ancho completo, en columnas, todo envuelto.
  const GAP_COL = 22;
  const ANCHO_COL = Math.floor((ANCHO_UTIL - GAP_COL * 2) / 3);
  const hDesfase = opts.avisos ?? [];
  const domin = dominio(opts.urlTabla);
  const columnas: Array<{ titulo: string; lineas: LineaMedida[] }> = [
    {
      titulo: "Fuente y estadística",
      lineas: [
        ...medirLineas(ctx, `Fuente: ${opts.fuente || "no consta"}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(
          ctx,
          `Organismo: ${opts.organismo ?? "Instituto Nacional de Estadística (INE)"}`,
          ANCHO_COL,
          { font: `400 9px ${FAMILIA}`, alto: 12 },
        ),
        ...(opts.convocatoria
          ? medirLineas(ctx, `Convocatoria: ${opts.convocatoria}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 })
          : []),
        ...medirLineas(ctx, `Tabla / operación: ${opts.tabla || "no consta"}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(ctx, `Periodo estadístico: ${opts.periodo ?? "no consta"}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(ctx, `Estadística descargada el ${fechaCorta(opts.fechaEstadistica)}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...(domin ? medirLineas(ctx, `Fuente en INEbase: ${domin}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }) : []),
      ],
    },
    {
      titulo: "Geometría",
      lineas: [
        ...medirLineas(ctx, `Seccionado: ${opts.anioGeometria ?? "no consta"}${opts.coleccionGeometria ? ` · ${opts.coleccionGeometria}` : ""}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(ctx, `Organismo: ${opts.organismoGeometria ?? opts.fuente ?? "no consta"}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(ctx, `Geometría consultada el ${fechaCorta(opts.fechaGeometria)}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
      ],
    },
    {
      titulo: "Cobertura y cartografía",
      lineas: [
        ...medirLineas(ctx, `Secciones representadas: ${opts.seccionesRepresentadas} de ${opts.seccionesTotales}`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(ctx, `Sin dato (ND): ${opts.seccionesSinDato} · cobertura ${opts.coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`, ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
        ...medirLineas(ctx, "Cartografía base: © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)", ANCHO_COL, { font: `400 9px ${FAMILIA}`, alto: 12 }),
      ],
    },
  ];

  const avisosPie = hDesfase.flatMap((a) =>
    medirLineas(ctx, `Aviso: ${a}`, ANCHO_UTIL, { font: `600 9px ${FAMILIA}`, alto: 12, fuerte: true }),
  );
  const avisoBase = medirLineas(
    ctx,
    opts.baseOmitida
      ? "Aviso: mapa base NO incluido. El navegador no permitió leer el lienzo; se conservan seccionado, límites, escala, leyenda y fuentes."
      : "Seccionado cedido por el Instituto Nacional de Estadística. Cartografía base: © OpenStreetMap contributors, ODbL 1.0.",
    ANCHO_UTIL,
    { font: `600 9px ${FAMILIA}`, alto: 12, fuerte: true },
  );
  const ALTO_PIE =
    14 +
    Math.max(
      ...columnas.map(
        (c) => 18 + c.lineas.reduce((s, l) => s + l.h, 0),
      ),
    ) +
    avisosPie.reduce((s, l) => s + l.h, 0) +
    avisoBase.reduce((s, l) => s + l.h, 0) +
    22;

  const H = M + ALTO_CABECERA + ALTO_BLOQUE + ALTO_PIE;

  // ── Pasada 2: dibujo ─────────────────────────────────────────────────────
  lienzo.width = Math.round(W * escala);
  lienzo.height = Math.round(H * escala);
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Fondo sólido: nunca transparente.
  ctx.fillStyle = t.hueso;
  ctx.fillRect(0, 0, W, H);

  let y = M;

  // ── Cabecera ────────────────────────────────────────────────────────────
  ctx.fillStyle = t.musgoOscuro;
  ctx.font = `600 12px ${FAMILIA}`;
  ctx.fillText(opts.encabezado ?? "SOCideas, secciones censales", M, y + 11);
  y += 20;

  ctx.fillStyle = t.textoFuerte;
  for (const l of lineasTitulo) {
    ctx.font = `700 23px ${FAMILIA}`;
    ctx.fillText(l.t, M, y + 23);
    y += l.h;
  }
  ctx.fillStyle = t.texto;
  for (const l of lineasSubtitulo) {
    ctx.font = `400 12.5px ${FAMILIA}`;
    ctx.fillText(l.t, M, y + 12);
    y += l.h;
  }

  // Marca IMA discreta, solo texto, esquina superior derecha.
  ctx.textAlign = "right";
  ctx.fillStyle = t.musgo;
  ctx.font = `700 18px ${FAMILIA}`;
  ctx.fillText("IMA", W - M, M + 16);
  ctx.fillStyle = t.limoMedio;
  ctx.font = `400 9.5px ${FAMILIA}`;
  ctx.fillText("Sistema de información territorial", W - M, M + 30);
  ctx.textAlign = "left";

  y = M + ALTO_CABECERA - 26;
  ctx.strokeStyle = t.limoClaro;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y + 0.5);
  ctx.lineTo(W - M, y + 0.5);
  ctx.stroke();

  // ── Mapa (izquierda) y leyenda (derecha), MISMA altura ───────────────────
  const mapY = y + 24;
  const mapX = M;
  const leyX = M + ANCHO_MAPA + GAP;

  ctx.fillStyle = t.hueso;
  ctx.fillRect(mapX, mapY, ANCHO_MAPA, ALTO_BLOQUE);

  // El mapa se dibuja SIEMPRE a lo ancho de su columna: no hay bandas blancas
  // laterales. Su relación de aspecto es la del viewport capturado, así que
  // `ALTO_BLOQUE >= alto natural` garantiza que nunca sobra alto.
  const escalaAjuste = Math.min(ANCHO_MAPA / base.w, ALTO_BLOQUE / base.h);
  const anchoDibujo = base.w * escalaAjuste;
  const altoDibujo = base.h * escalaAjuste;
  try {
    ctx.drawImage(
      opts.base,
      mapX + (ANCHO_MAPA - anchoDibujo) / 2,
      mapY + (ALTO_BLOQUE - altoDibujo) / 2,
      anchoDibujo,
      altoDibujo,
    );
  } catch {
    // Si el mapa base fuera ilegible, el marco queda en hueso.
  }
  ctx.strokeStyle = t.limoClaro;
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX + 0.5, mapY + 0.5, ANCHO_MAPA - 1, ALTO_BLOQUE - 1);

  // ── Leyenda lateral ─────────────────────────────────────────────────────
  let leyY = mapY + 12;
  for (const l of lineasLeyenda) {
    if (l.t) {
      ctx.fillStyle = l.titulo ? t.musgoOscuro : l.fuerte ? t.textoFuerte : t.texto;
      ctx.font = l.titulo
        ? `700 11px ${FAMILIA}`
        : l.fuerte
          ? `600 10.5px ${FAMILIA}`
          : `400 9.5px ${FAMILIA}`;
      ctx.fillText(l.t, leyX, leyY + 10);
    }
    leyY += l.h;
  }
  leyY += 2;

  // Muestra del ND: 20x16 con trama de 5 px, para que la diagonal se lea sin
  // ambigüedad a tamaño de leyenda. El patrón es el MISMO (misma función) que
  // el del mapa; solo cambia la escala del tile para que quepan varias líneas
  // de trama en una muestra tan pequeña.
  const tramaND = patronTramaSinDato(ctx, opts.colorSinDato, opts.colorContornoSinDato, 5);
  for (const f of filasLeyenda) {
    const altoFila = Math.max(14, f.lineas.length * 13);
    const ALTO_MUESTRA = 16;
    const yMuestra = leyY + (altoFila - ALTO_MUESTRA) / 2;
    // El color sale de la FILA, no de un `find` por texto: en una leyenda
    // categórica dos candidaturas pueden compartir rótulo y «Sin dato / ND»
    // colisiona con cualquier intervalo. La búsqueda por texto queda solo como
    // compatibilidad para contratos que no traigan `colorMuestra`.
    ctx.fillStyle = f.esSinDato
      ? tramaND
      : (f.colorMuestra ?? opts.entradasLeyenda.find((e) => e.etiqueta === f.etiqueta)?.color ?? t.limo);
    ctx.fillRect(leyX, yMuestra, 20, ALTO_MUESTRA);
    ctx.strokeStyle = f.esSinDato ? opts.colorContornoSinDato : t.texto;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(leyX + 0.5, yMuestra + 0.5, 19, ALTO_MUESTRA - 1);
    // Intervalo envuelto: nunca se sale de la columna ni se corta.
    ctx.fillStyle = t.texto;
    ctx.font = `400 9.5px ${FAMILIA}`;
    f.lineas.forEach((linea, i) => ctx.fillText(linea, leyX + 26, leyY + 10 + i * 13));
    leyY += altoFila + 5;
  }

  if (lineasNotaND.length) {
    leyY += 4;
    ctx.fillStyle = t.texto;
    for (const l of lineasNotaND) {
      ctx.font = `400 9px ${FAMILIA}`;
      ctx.fillText(l.t, leyX, leyY + 9);
      leyY += l.h;
    }
  }

  for (const l of lineasTotal) {
    ctx.fillStyle = t.textoFuerte;
    ctx.font = `600 9.5px ${FAMILIA}`;
    ctx.fillText(l.t, leyX, leyY + 10);
    leyY += l.h;
  }

  // Nota de lectura: cierra la columna lateral con información real.
  if (lineasLectura.length) {
    const ySeparador = leyY - 1;
    ctx.strokeStyle = t.limo;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(leyX, ySeparador);
    ctx.lineTo(leyX + ANCHO_LEYENDA, ySeparador);
    ctx.stroke();
    leyY += 9;
    for (const l of lineasLectura) {
      if (l.t) {
        ctx.fillStyle = l.titulo ? t.musgoOscuro : t.texto;
        ctx.font = l.titulo ? `700 9px ${FAMILIA}` : `400 9px ${FAMILIA}`;
        ctx.fillText(l.t, leyX, leyY + 8);
      }
      leyY += l.h;
    }
  }

  y = mapY + ALTO_BLOQUE + 14;

  // ── Pie: fuentes estructuradas a ancho completo ─────────────────────────
  ctx.strokeStyle = t.limoClaro;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y - 4.5);
  ctx.lineTo(W - M, y - 4.5);
  ctx.stroke();

  const altoCol = Math.max(...columnas.map((c) => 18 + c.lineas.reduce((s, l) => s + l.h, 0)));
  columnas.forEach((c, i) => {
    const cx = M + i * (ANCHO_COL + GAP_COL);
    let cy = y + 10;
    ctx.fillStyle = t.musgoOscuro;
    ctx.font = `700 9.5px ${FAMILIA}`;
    ctx.fillText(c.titulo.toUpperCase(), cx, cy + 8);
    cy += 12;
    ctx.strokeStyle = t.limo;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 0.5);
    ctx.lineTo(cx + ANCHO_COL, cy + 0.5);
    ctx.stroke();
    cy += 6;
    for (const l of c.lineas) {
      ctx.fillStyle = l.fuerte ? t.textoFuerte : t.texto;
      ctx.font = `400 9px ${FAMILIA}`;
      ctx.fillText(l.t, cx, cy + 8);
      cy += l.h;
    }
  });
  y += 10 + altoCol + 6;

  for (const l of [...avisosPie, ...avisoBase]) {
    ctx.fillStyle = t.textoFuerte;
    ctx.font = `600 9px ${FAMILIA}`;
    ctx.fillText(l.t, M, y + 8);
    y += l.h;
  }

  ctx.textAlign = "right";
  ctx.fillStyle = t.limoMedio;
  ctx.font = `400 9px ${FAMILIA}`;
  ctx.fillText("IMA · SOCideas", W - M, H - 8);
  ctx.textAlign = "left";

  return lienzo;
}

/** Nombre de archivo estable: `SOCideas_Secciones_{ine5}_{indicatorId}_{anio}.png` */
export function nombreArchivoPngSecciones(ine5: string, indicatorId: string, anio: number | null): string {
  const limpio = (v: string) => {
    const s = String(v ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "desconocido";
  };
  return `SOCideas_Secciones_${limpio(ine5)}_${limpio(indicatorId)}_${anio ?? "sindato"}.png`;
}
