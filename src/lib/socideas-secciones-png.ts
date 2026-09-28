// Composición PNG del atlas de secciones censales de SOCideas.
//
// MÓDULO PURO de presentación: no importa React, ni Leaflet, ni hace fetch, ni
// lee variables de entorno. Recibe un mapa YA RENDERIZADO (canvas o imagen) y le
// añade el marco editorial: cabecera, leyenda completa, pie con fuente,
// atribuciones obligatorias y marca IMA.
//
// Por qué NO aquí el dibujo del mapa: la proyección, la espera de teselas y el
// volcado del lienzo de Leaflet viven en `SeccionesAtlasMap.tsx`, que es quien
// tiene la instancia del mapa. Este módulo solo compone.
//
// Reglas duras que este módulo respeta por construcción:
//  - Fondo SÓLIDO `--hueso`. Nunca un PNG con transparencia inesperada.
//  - Colores DISCRETOS: los de la rampa del contrato o tokens IMA. Cero
//    degradados: cada clase es un color plano con su borde.
//  - La leyenda incluye SIEMPRE una entrada propia de «Sin dato / ND», con
//    trama diagonal, y una nota explícita de que ND ≠ 0.
//  - El pie incluye SIEMPRE fuente, tabla/operación, año de la geometría,
//    periodo estadístico, fechas de descarga, nº de secciones representadas,
//    cobertura, la atribución del INE y la del mapa base realmente usado.
//  - Nada de iconos ni de binarios: la marca IMA es texto.

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
}

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

function envolver(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [""];
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
  return lineas;
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "no consta";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : iso;
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

  const W = 1200; // ancho lógico fijo: el PNG es un documento, no una captura.
  const M = 30;
  const ANCHO_UTIL = W - M * 2;
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

  // ── Pasada 1: medición del alto total ─────────────────────────────────────
  const titulo = `${opts.indicador} · ${opts.municipio}${opts.anio !== null ? ` · ${opts.anio}` : ""}`;
  ctx.font = `700 23px ${FAMILIA}`;
  const lineasTitulo = envolver(ctx, titulo, ANCHO_UTIL - 110);
  ctx.font = `400 12.5px ${FAMILIA}`;
  const subtitulos: string[] = [
    `Unidad: ${opts.unidad || "sin unidad declarada"} · Clasificación: ${opts.modoClasificacion}` +
      (opts.clasificacion && opts.clasificacion.cortes.length
        ? ` · ${opts.clasificacion.cortes.length} ${opts.clasificacion.cortes.length === 1 ? "clase" : "clases"}`
        : ""),
    opts.clasificacion && opts.clasificacion.nObservados > 0
      ? `Escala observada: ${opts.clasificacion.min.toLocaleString("es-ES")} – ${opts.clasificacion.max.toLocaleString("es-ES")} ${opts.unidad} · ${opts.clasificacion.nObservados} secciones observadas`
      : "Sin escala: ningún valor observado para el indicador y el periodo seleccionados.",
    `Provincia: ${opts.provincia ?? "no consta"} · Seccionado (geometría): ${opts.anioGeometria ?? "no consta"}${opts.coleccionGeometria ? ` (${opts.coleccionGeometria})` : ""} · Periodo estadístico: ${opts.periodo ?? "no consta"}`,
  ];
  if (opts.clasificacion?.reducidoPorValoresDistintos) {
    subtitulos.push(
      `Clasificación reducida: solo ${opts.clasificacion.valoresDistintos} ${opts.clasificacion.valoresDistintos === 1 ? "valor distinto" : "valores distintos"} entre las secciones observadas; no se repite color ni se inventa una escala.`,
    );
  }
  const lineasSubtitulo = subtitulos.flatMap((s) => envolver(ctx, s, ANCHO_UTIL));

  // Filas de leyenda: se miden con la misma fuente con la que se dibujan, para
  // que el reparto en filas no se descuadre.
  ctx.font = `400 11.5px ${FAMILIA}`;
  const itemsLeyenda = opts.entradasLeyenda.map((e) => {
    const n = e.secciones === null ? "" : ` (${e.secciones})`;
    return { entrada: e, texto: `${e.etiqueta}${n}`, ancho: 28 + 7 + ctx.measureText(`${e.etiqueta}${n}`).width + 18 };
  });
  const filas: (typeof itemsLeyenda)[] = [];
  let actual: typeof itemsLeyenda = [];
  let anchoFila = 0;
  for (const item of itemsLeyenda) {
    if (actual.length && anchoFila + item.ancho > ANCHO_UTIL) {
      filas.push(actual);
      actual = [];
      anchoFila = 0;
    }
    actual.push(item);
    anchoFila += item.ancho;
  }
  if (actual.length) filas.push(actual);

  ctx.font = `400 10.5px ${FAMILIA}`;
  const notaLeyenda = envolver(
    ctx,
    "La trama diagonal marca las secciones sin dato (ND). El ND no equivale a cero y nunca forma parte de las clases de la escala.",
    ANCHO_UTIL,
  );

  // El pie se envuelve algo más estrecho para dejar el hueco de la marca IMA.
  const lineasPie = construirPie(opts, ANCHO_UTIL - 70, (texto, ancho) => envolver(ctx, texto, ancho));

  // Alto del mapa: proporción del mapa base acotada para que el documento respire.
  const base = anchoBase(opts.base);
  const relacion = base.h / Math.max(1, base.w);
  const altoMapa = Math.round(Math.max(430, Math.min(780, relacion * W)));

  const altoCabecera = 20 + lineasTitulo.length * 28 + lineasSubtitulo.length * 17 + 30;
  const altoLeyenda = 18 + notaLeyenda.length * 14 + filas.length * 22 + 16;
  const altoPie = 20 + lineasPie.length * 14 + 18;
  const H = M + altoCabecera + altoMapa + altoLeyenda + altoPie + M;

  // ── Pasada 2: dibujo ─────────────────────────────────────────────────────
  lienzo.width = Math.round(W * escala);
  lienzo.height = Math.round(H * escala);
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.textBaseline = "alphabetic";

  // Fondo sólido: nunca transparente.
  ctx.fillStyle = t.hueso;
  ctx.fillRect(0, 0, W, H);

  let y = M;

  // Cabecera -------------------------------------------------------------
  ctx.fillStyle = t.musgoOscuro;
  ctx.font = `600 12px ${FAMILIA}`;
  ctx.fillText("SOCideas, secciones censales", M, y + 11);
  y += 20;

  ctx.fillStyle = t.textoFuerte;
  ctx.font = `700 23px ${FAMILIA}`;
  for (const linea of lineasTitulo) {
    ctx.fillText(linea, M, y + 23);
    y += 28;
  }

  ctx.fillStyle = t.texto;
  ctx.font = `400 12.5px ${FAMILIA}`;
  for (const linea of lineasSubtitulo) {
    ctx.fillText(linea, M, y + 12);
    y += 17;
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

  y = M + altoCabecera - 30;
  ctx.strokeStyle = t.limoClaro;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y + 0.5);
  ctx.lineTo(W - M, y + 0.5);
  ctx.stroke();

  // Mapa ----------------------------------------------------------------
  const marcoX = M;
  const marcoY = y + 22;
  ctx.fillStyle = t.hueso;
  ctx.fillRect(marcoX, marcoY, ANCHO_UTIL, altoMapa);

  const escalaAjuste = Math.min(ANCHO_UTIL / base.w, altoMapa / base.h);
  const anchoDibujo = base.w * escalaAjuste;
  const altoDibujo = base.h * escalaAjuste;
  try {
    ctx.drawImage(
      opts.base,
      marcoX + (ANCHO_UTIL - anchoDibujo) / 2,
      marcoY + (altoMapa - altoDibujo) / 2,
      anchoDibujo,
      altoDibujo,
    );
  } catch {
    // Si el mapa base fuera ilegible, el marco queda en hueso: nunca un hueco
    // negro ni un error silencioso. El pie lo declara.
  }
  ctx.strokeStyle = t.limoClaro;
  ctx.lineWidth = 1;
  ctx.strokeRect(marcoX + 0.5, marcoY + 0.5, ANCHO_UTIL - 1, altoMapa - 1);

  y = marcoY + altoMapa;

  // Leyenda -------------------------------------------------------------
  y += 18;
  ctx.fillStyle = t.textoFuerte;
  ctx.font = `600 11.5px ${FAMILIA}`;
  ctx.fillText(
    `Leyenda · ${opts.indicador}${opts.unidad ? ` (${opts.unidad})` : ""}${opts.anio !== null ? ` · ${opts.anio}` : ""}`,
    M,
    y + 12,
  );
  y += 18;

  ctx.fillStyle = t.texto;
  ctx.font = `400 10.5px ${FAMILIA}`;
  for (const linea of notaLeyenda) {
    ctx.fillText(linea, M, y + 10);
    y += 14;
  }

  const tramaND = patronTramaSinDato(ctx, opts.colorSinDato, opts.colorContornoSinDato, 8);
  for (const fila of filas) {
    y += 22;
    let x = M;
    for (const item of fila) {
      const e = item.entrada;
      ctx.fillStyle = e.esSinDato ? tramaND : e.color;
      ctx.fillRect(x, y, 28, 14);
      ctx.strokeStyle = t.texto;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 27, 13);
      ctx.fillStyle = t.texto;
      ctx.font = `400 11.5px ${FAMILIA}`;
      ctx.fillText(item.texto, x + 35, y + 11);
      x += item.ancho;
    }
  }
  y += 16;

  // Pie -----------------------------------------------------------------
  y += 20;
  ctx.strokeStyle = t.limoClaro;
  ctx.beginPath();
  ctx.moveTo(M, y + 0.5);
  ctx.lineTo(W - M, y + 0.5);
  ctx.stroke();
  y += 20;

  ctx.fillStyle = t.texto;
  ctx.font = `400 10.5px ${FAMILIA}`;
  for (const linea of lineasPie) {
    ctx.fillText(linea, M, y + 10);
    y += 14;
  }

  ctx.textAlign = "right";
  ctx.fillStyle = t.limoMedio;
  ctx.font = `400 9.5px ${FAMILIA}`;
  ctx.fillText("IMA", W - M, y + 10);
  ctx.textAlign = "left";

  return lienzo;
}

/** Filas del pie, ya envueltas al ancho útil. */
function construirPie(
  opts: OpcionesComponerPngMapa,
  anchoUtil: number,
  envolver: (texto: string, ancho: number) => string[],
): string[] {
  const partes: string[] = [
    `Fuente de la estadística: ${opts.fuente || "no consta"}`,
    `Tabla / operación: ${opts.tabla || "no consta"}`,
    `Geometría: seccionado ${opts.anioGeometria ?? "no consta"}${opts.coleccionGeometria ? ` · colección ${opts.coleccionGeometria}` : ""} · geometría consultada el ${fechaCorta(opts.fechaGeometria)}`,
    `Periodo estadístico: ${opts.periodo ?? "no consta"} · estadística descargada el ${fechaCorta(opts.fechaEstadistica)}`,
    `Secciones representadas: ${opts.seccionesRepresentadas} de ${opts.seccionesTotales} · cobertura ${opts.coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} % · sin dato ${opts.seccionesSinDato}`,
  ];
  if (opts.seccionesSinDato > 0) {
    partes.push(
      `Aviso: ${opts.seccionesSinDato} ${opts.seccionesSinDato === 1 ? "sección queda" : "secciones quedan"} fuera de la escala por falta de dato en la fuente (ND). No son cero.`,
    );
  }
  for (const aviso of opts.avisos ?? []) partes.push(`Aviso: ${aviso}`);
  partes.push(
    "Seccionado cedido por el Instituto Nacional de Estadística.",
    opts.baseOmitida
      ? "Mapa base NO incluido en esta exportación: el lienzo del navegador no permitió leerlo. El seccionado, los límites, la escala y la leyenda sí están; la cartografía de fondo se omite de forma deliberada."
      : "Cartografía base: © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).",
  );
  return partes.flatMap((p) => envolver(p, anchoUtil));
}

/** Nombre de archivo estable: `SOCideas_Secciones_{ine5}_{indicatorId}_{anio}.png` */
export function nombreArchivoPngSecciones(ine5: string, indicatorId: string, anio: number | null): string {
  const limpio = (v: string) => {
    const s = String(v ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "desconocido";
  };
  return `SOCideas_Secciones_${limpio(ine5)}_${limpio(indicatorId)}_${anio ?? "sindato"}.png`;
}
