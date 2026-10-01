// Exportador PNG del mapa POLÍTICO de secciones censales.
//
// POR QUÉ EXISTE ESTE MÓDULO
// El exportador genérico (`componerPngMapa`) no lleva ninguna identidad del
// dataset: recibe un contrato purely presentacional y compone lo que le dan.
// Eso permite —y ya pasó— exportar un PNG «político» que era una copia byte a
// byte del económico, porque el error no dejaba rastro en ninguna parte del
// documento. Aquí el dataset viaja EXPLÍCITO y FIRMADO: el contrato declara su
// dominio, su convocatoria, su indicador y su leyenda, y una firma de contenido
// cubre todos esos campos. Si alguien compone un contrato con datos económicos,
// o cambia un campo después de firmar, la validación falla y NO se exporta.
//
// REGLAS DURAS
//  - `domain` es el literal `'political'`. No es un parámetro: no hay forma de
//    construir un contrato electoral que se declare de otro dominio.
//  - La leyenda es una UNIÓN discriminada: `categoricalLegend` y
//    `continuousLegend` son excluyentes y `valueType` dice cuál vale. En la
//    variante categórica `metodo`, `clases` y `unidad` son `null` POR TIPOS: es
//    imposible declarar un método de corte numérico en una leyenda que es una
//    lista de candidaturas.
//  - El color de una clase viaja por IDENTIDAD (`colorMuestra`), nunca se
//    resuelve por coincidencia de texto.
//  - La firma se RECALCULA en la validación y se compara. Es una huella de
//    contenido, no un constante: dos datasets distintos dan firmas distintas.
//  - Nada se exporta si algo falla: `componerPngPolitica` lanza y quien llama
//    enseña la causa.
//
// MÓDULO PURO: no importa React ni Leaflet. La única impureza está en
// `componerPngPolitica` (necesita un lienzo del navegador) y en las utilidades
// de descarga.

import {
  componerPngMapa,
  type DescriptorEscalaPng,
  type EntradaLeyendaPng,
  type EscalaPng,
  type OpcionesComponerPngMapa,
} from "./socideas-secciones-png";
import type { CorteClase, ModoClasificacion, SeccionValorStatus } from "./socideas-secciones";
import { ELECTION_TYPE_LABEL, type Candidacy, type ElectionType } from "./socideas-secciones-political";
import { POLITICAL_INDICATOR_IDS, PREFIJO_CANDIDATURA } from "./socideas-secciones-extension";

/** Dominio del contrato. Literal, no parámetro. */
export const DOMINIO_PNG_POLITICA = "political";

/** Autoridad estadística de los datos electorales. */
export const ORGANISMO_ESTADISTICA_POLITICA = "Ministerio del Interior · Infoelectoral (APLIEXTR, resultados por mesa)";

/** Origen del dataset en el pie del PNG. */
export const FUENTE_DATOS_POLITICA = "Ministerio del Interior · Infoelectoral";

/** Tabla/operación declarada en el pie. */
export const OPERACION_POLITICA = "Infoelectoral (APLIEXTR), resultados por mesa agregados por sección censal";

/** Licencia declarada por el registro de fuentes políticas. */
export const LICENCIA_POLITICA = "Uso público según condiciones de publicación de Infoelectoral";

/** Prefijo de la firma. Un dataset económico no puede producirlo. */
export const PREFIJO_FIRMA_POLITICA = "socideas/politica/v1/";

export type ValueTypePolitica = "categorical" | "continuous" | "diverging";

export type IndicadorTipoPolitica =
  | "winner"
  | "participation"
  | "abstention"
  | "margin"
  | "blank_votes"
  | "null_votes"
  | "candidacy_percentage";

export type EstadoSeccionPng = "observado" | "no_difundido" | "sin_cobertura";

/**
 * Reduce el vocabulario de estados del atlas (seis) al de tres que usa el
 * contrato. Total, no una conversión: un estado que el atlas admite pero el
 * contrato no conoce NO se cuenta como observado.
 */
export function estadoSeccionPng(status: SeccionValorStatus): EstadoSeccionPng {
  if (status === "observado" || status === "derivado_verificable") return "observado";
  if (status === "sin_cobertura") return "sin_cobertura";
  return "no_difundido";
}

// ─────────────────────────────────────────────────────────────────────────────
// Leyendas
// ─────────────────────────────────────────────────────────────────────────────

/** Una candidatura en la leyenda categórica, identificada por su `candidaturaId`. */
export interface CandidaturaLeyendaPng {
  /** Identidad estable de la candidatura. Es la clave: no el rótulo. */
  readonly candidaturaId: string;
  /** Siglas tal como las publica la fuente. */
  readonly sigla: string;
  /** Denominación oficial. */
  readonly nombre: string;
  /** Color plano que la fuente asigna a la candidatura. */
  readonly color: string;
  /** Secciones en las que gana. */
  readonly seccionesGanadas: number;
  /** De esas secciones, las que la fuente marca como empate. */
  readonly empates: number;
}

/** Entrada propia de sin dato. Siempre presente si hay ND, y con trama. */
export interface SinDatoLeyendaPng {
  readonly etiqueta: string;
  readonly secciones: number;
  readonly color: string;
  readonly colorContorno: string;
}

/** Un intervalo del mapa continuo. */
export interface IntervaloLeyendaPng {
  /** Límite inferior inclusivo. */
  readonly min: number;
  /** Límite superior (exclusivo salvo en el último intervalo). */
  readonly max: number;
  /** Intervalo listo para leyenda. */
  readonly etiqueta: string;
  readonly color: string;
  readonly secciones: number;
}

/** Escala observada del mapa continuo. */
export interface EscalaNumericaPng {
  readonly min: number;
  readonly max: number;
  readonly nObservados: number;
  readonly valoresDistintos: number;
  readonly reducidoPorValoresDistintos: boolean;
}

/**
 * Leyenda categórica. `metodo`, `clases` y `unidad` son `null` POR TIPOS: una
 * lista de candidaturas no tiene cortes, ni clases, ni unidad. No hay forma de
 * que este objeto declare un método numérico.
 */
export interface LeyendaCategoricaPng {
  readonly kind: "categorical";
  readonly entradas: readonly CandidaturaLeyendaPng[];
  readonly sinDato: SinDatoLeyendaPng | null;
  readonly metodo: null;
  readonly clases: null;
  readonly escalaNumerica: null;
  readonly unidad: null;
}

/** Leyenda de intervalos, con el método que los produjo declarado. */
export interface LeyendaContinuaPng {
  readonly kind: "continuous" | "diverging";
  readonly entradas: readonly IntervaloLeyendaPng[];
  readonly sinDato: SinDatoLeyendaPng | null;
  /** Etiqueta del método (`Cuantil`, `Jenks`, …). `null` solo si no hubo cortes. */
  readonly metodo: string | null;
  readonly clases: EscalaNumericaPng | null;
  readonly unidad: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadatos del dataset
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccionValorPng {
  readonly sectionKey: string;
  /** Identidad de la candidatura observada. Solo en mapas por candidatura. */
  readonly candidaturaId: string | null;
  /** Valor observado. Siempre `null` en un mapa categórico: no hay magnitud. */
  readonly valor: number | null;
  readonly estado: EstadoSeccionPng;
  /** Empate registrado por la fuente. Solo en mapas por candidatura ganadora. */
  readonly empate: boolean;
}

export interface ReferenciaGeometriaPng {
  /** Año del COLECCIÓN de seccionado. Distinto del año electoral. */
  readonly year: number | null;
  readonly collection: string | null;
  /** Organismo que aporta la geometría. Para política: el INE. */
  readonly source: string;
  readonly retrievedAt: string | null;
}

export interface CoberturaPng {
  readonly seccionesRepresentadas: number;
  readonly seccionesTotales: number;
  readonly seccionesSinDato: number;
  /**
   * `representadas / totales` de ESTE mapa. No es
   * `geometria.coveragePercentage`, que mide otra cosa: correspondencia entre
   * secciones de resultado y polígonos.
   */
  readonly coberturaPct: number;
}

export interface FuentePng {
  /** Autoridad estadística de los DATOS. Nunca el INE en un mapa electoral. */
  readonly authority: string;
  readonly dataset: string;
  readonly url: string | null;
  readonly licence: string | null;
}

export interface ConciliacionPng {
  readonly status: string;
  readonly reference: string | null;
  readonly differences: Readonly<Record<string, number>>;
  readonly notes: readonly string[];
}

export interface CorrespondenciaPng {
  readonly status: string;
  readonly resultSections: number;
  readonly geometrySections: number;
  readonly matchedSections: number;
  readonly coveragePercentage: number;
  readonly notes: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// El contrato
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrato TIPADO del PNG político. Todo lo que el documento afirma sobre qué
 * datos representa está aquí, y nada de eso se deduce del rótulo.
 */
export interface ContratoPngPolitica {
  readonly domain: typeof DOMINIO_PNG_POLITICA;
  readonly municipalityCode: string;
  readonly municipalityName: string;
  readonly electionId: string | null;
  readonly electionType: ElectionType | null;
  /** Fecha ISO de la convocatoria. `YYYY-MM-DD`. */
  readonly electionDate: string;
  /** Tipo de proceso y fecha, tal como se muestran. */
  readonly electionLabel: string;
  readonly indicatorType: IndicadorTipoPolitica;
  readonly indicatorId: string;
  readonly indicatorLabel: string;
  /** Candidatura observada, cuando el mapa es el voto a una candidatura. */
  readonly candidacyId: string | null;
  readonly candidacyName: string | null;
  readonly valueType: ValueTypePolitica;
  /** Etiqueta del método de corte. `null` SIEMPRE en un mapa categórico. */
  readonly classificationMethod: string | null;
  /** Nº de intervalos representados. `0` en un mapa categórico. */
  readonly classes: number;
  readonly sectionValues: readonly SeccionValorPng[];
  readonly categoricalLegend: LeyendaCategoricaPng | null;
  readonly continuousLegend: LeyendaContinuaPng | null;
  readonly geometryReference: ReferenciaGeometriaPng;
  readonly coverage: CoberturaPng;
  readonly source: FuentePng;
  readonly reconciliation: ConciliacionPng | null;
  readonly correspondence: CorrespondenciaPng | null;
  /** Avisos metodológicos que el documento no puede omitir. */
  readonly notices: readonly string[];
  /** Nota de lectura del mapa. */
  readonly note: string | null;
  /** ISO de generación. Entra en la firma. */
  readonly generatedAt: string;
  /** Firma de contenido. La recalcula la validación. */
  readonly signature: string;
}

export type ContratoPngPoliticaSinFirma = Omit<ContratoPngPolitica, "signature">;

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de indicadores políticos
// ─────────────────────────────────────────────────────────────────────────────

interface DescriptorIndicadorPolitica {
  readonly type: IndicadorTipoPolitica;
  readonly label: string;
  readonly unit: string;
  readonly denominator: string | null;
}

/** Indicadores políticos con rótulo y unidad. Fuente única, no una constante
 *  repartida por los componentes. */
const INDICADORES: Readonly<Record<string, DescriptorIndicadorPolitica>> = {
  [POLITICAL_INDICATOR_IDS.winner]: { type: "winner", label: "Candidatura ganadora", unit: "", denominator: null },
  [POLITICAL_INDICATOR_IDS.participation]: { type: "participation", label: "Participación", unit: "%", denominator: "Censo electoral" },
  [POLITICAL_INDICATOR_IDS.abstention]: { type: "abstention", label: "Abstención", unit: "%", denominator: "Censo electoral" },
  [POLITICAL_INDICATOR_IDS.margin]: { type: "margin", label: "Margen ganador − segundo", unit: "p. p.", denominator: "Votos válidos" },
  [POLITICAL_INDICATOR_IDS.blank]: { type: "blank_votes", label: "Votos en blanco", unit: "%", denominator: "Votos válidos" },
  [POLITICAL_INDICATOR_IDS.null]: { type: "null_votes", label: "Votos nulos", unit: "%", denominator: "Votantes" },
};

/** Rótulo corto del método de corte. El compositor imprime
 *  «Clasificación: <esto>», así que aquí no se repite la palabra. */
const ETIQUETA_METODO: Readonly<Record<ModoClasificacion, string>> = {
  cuantil: "Cuantil",
  intervalos_iguales: "Intervalos iguales",
  jenks: "Jenks",
  cortes_manuales: "Cortes manuales",
};

const COLOR_POR_DEFECTO_CANDIDATURA = "#6B7280";

/** `true` si el identificador pertenece al espacio político de indicadores. */
export function esIndicadorPolitico(indicatorId: string): boolean {
  if (indicatorId === POLITICAL_INDICATOR_IDS.winner) return true;
  if (indicatorId.startsWith(PREFIJO_CANDIDATURA) && indicatorId.length > PREFIJO_CANDIDATURA.length) return true;
  return Object.prototype.hasOwnProperty.call(INDICADORES, indicatorId);
}

/** `true` si el identificador es un voto a una candidatura concreta. */
export function esIndicadorCandidaturaPolitica(indicatorId: string): boolean {
  return indicatorId.startsWith(PREFIJO_CANDIDATURA) && indicatorId.length > PREFIJO_CANDIDATURA.length;
}

/** Identidad de la candidatura a la que apunta un indicador de candidatura. */
export function candidaturaIdDeIndicador(indicatorId: string): string | null {
  return esIndicadorCandidaturaPolitica(indicatorId) ? indicatorId.slice(PREFIJO_CANDIDATURA.length) : null;
}

/** Rótulo y unidad de un indicador político. Falla si no es político. */
export function descriptorIndicadorPolitica(
  indicatorId: string,
  candidacyName: string | null,
): DescriptorIndicadorPolitica {
  if (esIndicadorCandidaturaPolitica(indicatorId)) {
    return {
      type: "candidacy_percentage",
      label: candidacyName ? `Voto a ${candidacyName}` : "Voto a una candidatura",
      unit: "%",
      denominator: "Votos válidos",
    };
  }
  const d = INDICADORES[indicatorId];
  if (!d) throw new Error(`Indicador fuera del catálogo político: ${indicatorId}`);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Términos económicos: el guardián del defecto D3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vocabulario del dataset económico. Aparece en rótulos, unidades y fuentes,
 * nunca en un mapa electoral: si aparece, el contrato está mal construido.
 */
const TERMINOS_ECONOMICOS: readonly RegExp[] = [
  /\brenta\b/i,
  /\brentas\b/i,
  /\beuros?\b/i,
  /€/,
  /\badrh\b/i,
  /\bgini\b/i,
  /\bp80\b/i,
  /\bp90\b/i,
  /\bper\s+c[aá]pita\b/i,
  /\bparados?\b/i,
  /\bcontratados?\b/i,
  /\bunidad\s+de\s+consumo\b/i,
  /\bindice\s+de\s+distribuci[oó]n\b/i,
];

/** Identificadores del dataset económico, para rechazos inequívocos. */
const INDICADORES_ECONOMICOS: readonly string[] = [
  "renta_neta_media_persona",
  "renta_neta_media_hogar",
  "renta_bruta_media_persona",
  "renta_bruta_media_hogar",
  "renta_media_unidad_consumo",
  "renta_mediana_unidad_consumo",
  "indice_gini",
  "p80_p20",
];

/**
 * Normaliza para poder comparar: los identificadores del catálogo llegan con
 * guiones bajos (`indice_gini`, `renta_neta_media_hogar`) y los rótulos con
 * acentos. Sin esto, `\bgini\b` no encontraría «gini» dentro de `indice_gini`
 * porque el guion bajo es carácter de palabra.
 */
function normalizaParaBuscar(texto: string): string {
  return texto.replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

/** Devuelve los términos económicos encontrados en `texto`. Vacío = limpio. */
export function detectarTerminosEconomicos(texto: string): string[] {
  const normalizado = normalizaParaBuscar(texto);
  return TERMINOS_ECONOMICOS.filter((re) => re.test(normalizado)).map((re) => re.source);
}

/** `true` si `indicatorId` es un identificador económico conocido. */
export function esIndicadorEconomico(indicatorId: string): boolean {
  return INDICADORES_ECONOMICOS.includes(indicatorId);
}

/**
 * Texto del dataset (rótulos, unidades, fuente, notas) sobre el que se busca
 * vocabulario económico. Deliberadamente NO incluye la geometría: el seccionado
 * SÍ es del INE, también en un mapa electoral, y nombrarlo no convierte el
 * documento en económico.
 */
function textoDelDataset(c: ContratoPngPoliticaSinFirma): string {
  const partes: string[] = [
    c.indicatorId,
    c.indicatorLabel,
    c.electionLabel,
    c.candidacyName ?? "",
    c.classificationMethod ?? "",
    c.source.authority,
    c.source.dataset,
    ...c.notices,
    c.note ?? "",
  ];
  for (const e of c.categoricalLegend?.entradas ?? []) partes.push(e.sigla, e.nombre);
  for (const e of c.continuousLegend?.entradas ?? []) partes.push(e.etiqueta);
  if (c.categoricalLegend?.sinDato) partes.push(c.categoricalLegend.sinDato.etiqueta);
  if (c.continuousLegend?.sinDato) partes.push(c.continuousLegend.sinDato.etiqueta);
  return partes.filter(Boolean).join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Firma de contenido
// ─────────────────────────────────────────────────────────────────────────────

/** Serialización canónica: claves ordenadas, `null` explícito, sin `undefined`. */
function canonico(valor: unknown): string {
  if (valor === null || valor === undefined) return "∅";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "num:no-finito";
    return `num:${Object.is(valor, -0) ? 0 : valor}`;
  }
  if (typeof valor === "boolean") return `bool:${valor}`;
  if (typeof valor === "string") return `str:${valor}`;
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${k}=${canonico(o[k])}`)
      .join(",")}}`;
  }
  return `otro:${String(valor)}`;
}

/** FNV-1a de 32 bits, con semilla distinta para la segunda pasada. Huella, no
 *  criptografía: sirve para detectar que el contenido es otro. */
function fnv1a(texto: string, semilla = 0x811c9dc5): string {
  let h = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Copia del contrato sin la firma, para firmarlo. */
function cuerpoSinFirma(contrato: ContratoPngPoliticaSinFirma | ContratoPngPolitica): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...contrato };
  delete copia.signature;
  return copia;
}

/** Qué parte del contrato se firma, en forma canónica. */
export function cuerpoFirmable(contrato: ContratoPngPoliticaSinFirma | ContratoPngPolitica): string {
  return canonico(cuerpoSinFirma(contrato));
}

/**
 * Firma del contrato: huella del contenido con el dominio fuera, para que un
 * dataset económico —que no tiene ni contrato ni firma— no pueda colisionar.
 */
export function firmarContratoPolitica(contrato: ContratoPngPoliticaSinFirma | ContratoPngPolitica): string {
  const cuerpo = cuerpoFirmable(contrato);
  return `${PREFIJO_FIRMA_POLITICA}${fnv1a(cuerpo)}-${fnv1a(cuerpo, 0x9e3779b1)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción de leyendas (pura)
// ─────────────────────────────────────────────────────────────────────────────

/** Ganadora de una sección, en la forma que necesita el contrato. */
export interface GanadoraSeccionPng {
  readonly ganadoraId: string | null;
  readonly empate: boolean;
  readonly estado: EstadoSeccionPng;
}

export interface EntradaLeyendaCategoricaPolitica {
  readonly secciones: readonly SeccionSeriePng[];
  readonly ganadoras: Readonly<Record<string, GanadoraSeccionPng>>;
  readonly candidaturas: readonly Candidacy[];
  readonly colorSinDato: string;
  readonly colorContornoSinDato: string;
}

/** Una sección del mapa, tal como la ve el contrato. */
export interface SeccionSeriePng {
  readonly sectionKey: string;
  /** Valor observado, o `null` si no lo hay. */
  readonly valor: number | null;
  readonly estado: EstadoSeccionPng;
}

/**
 * Leyenda categórica por IDENTIDAD: cuenta secciones ganadas por
 * `candidaturaId`, empates incluidos, y ordena por secciones ganadas. Devuelve
 * `metodo: null` y `clases: null` — no hay cortes porque no hay magnitud.
 */
export function construirLeyendaCategoricaPolitica(entrada: EntradaLeyendaCategoricaPolitica): LeyendaCategoricaPng {
  const ganadas = new Map<string, { secciones: number; empates: number }>();
  let sinDato = 0;
  for (const s of entrada.secciones) {
    const g = s.estado === "observado" ? (entrada.ganadoras[s.sectionKey] ?? null) : null;
    const id = g?.ganadoraId ?? null;
    if (!id) {
      sinDato += 1;
      continue;
    }
    const previo = ganadas.get(id) ?? { secciones: 0, empates: 0 };
    previo.secciones += 1;
    if (g?.empate) previo.empates += 1;
    ganadas.set(id, previo);
  }

  const colorDe = (id: string): string => {
    const c = entrada.candidaturas.find((x) => x.id === id);
    const color = c?.color?.trim();
    return color && color.length > 0 ? color : COLOR_POR_DEFECTO_CANDIDATURA;
  };

  const entradas: CandidaturaLeyendaPng[] = [...ganadas.entries()]
    .map(([candidaturaId, n]) => {
      const c = entrada.candidaturas.find((x) => x.id === candidaturaId);
      return {
        candidaturaId,
        sigla: c?.acronym?.trim() || c?.name?.trim() || candidaturaId,
        nombre: c?.name?.trim() || c?.acronym?.trim() || candidaturaId,
        color: colorDe(candidaturaId),
        seccionesGanadas: n.secciones,
        empates: n.empates,
      };
    })
    .sort(
      (a, b) =>
        b.seccionesGanadas - a.seccionesGanadas ||
        a.sigla.localeCompare(b.sigla, "es") ||
        a.candidaturaId.localeCompare(b.candidaturaId, "es"),
    );

  return {
    kind: "categorical",
    entradas,
    sinDato:
      sinDato > 0
        ? { etiqueta: "Sin dato / ND", secciones: sinDato, color: entrada.colorSinDato, colorContorno: entrada.colorContornoSinDato }
        : null,
    metodo: null,
    clases: null,
    escalaNumerica: null,
    unidad: null,
  };
}

export interface EntradaLeyendaContinuaPolitica {
  readonly cortes: readonly CorteClase[];
  readonly escala: EscalaNumericaPng;
  readonly metodo: ModoClasificacion | null;
  readonly unidad: string;
  readonly divergente: boolean;
  readonly colorSinDato: string;
  readonly colorContornoSinDato: string;
  readonly seccionesSinDato: number;
}

/** Leyenda de intervalos. Declara el método, los recuentos y la escala. */
export function construirLeyendaContinuaPolitica(entrada: EntradaLeyendaContinuaPolitica): LeyendaContinuaPng {
  return {
    kind: entrada.divergente ? "diverging" : "continuous",
    entradas: entrada.cortes.map((c) => ({
      min: c.min,
      max: c.max,
      etiqueta: c.etiqueta,
      color: c.color,
      secciones: c.secciones,
    })),
    sinDato:
      entrada.seccionesSinDato > 0
        ? {
            etiqueta: "Sin dato / ND",
            secciones: entrada.seccionesSinDato,
            color: entrada.colorSinDato,
            colorContorno: entrada.colorContornoSinDato,
          }
        : null,
    metodo: entrada.metodo ? ETIQUETA_METODO[entrada.metodo] : null,
    clases: entrada.escala,
    unidad: entrada.unidad,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cobertura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cobertura DEL MAPA: secciones con dato sobre secciones del municipio. A
 * propósito NO usa `geometria.coveragePercentage`, que mide la correspondencia
 * entre secciones de resultado y polígonos y es otra magnitud.
 */
export function calcularCoberturaPolitica(secciones: readonly SeccionSeriePng[]): CoberturaPng {
  const total = secciones.length;
  const sinDato = secciones.reduce((n, s) => n + (s.estado === "observado" ? 0 : 1), 0);
  const representadas = total - sinDato;
  return {
    seccionesRepresentadas: representadas,
    seccionesTotales: total,
    seccionesSinDato: sinDato,
    coberturaPct: total > 0 ? (representadas / total) * 100 : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción del contrato
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaContratoPngPolitica {
  readonly domain: typeof DOMINIO_PNG_POLITICA;
  readonly municipalityCode: string;
  readonly municipalityName: string;
  readonly electionId: string | null;
  readonly electionType: ElectionType | null;
  readonly electionDate: string;
  readonly indicatorId: string;
  readonly candidacyId: string | null;
  readonly candidaturas: readonly Candidacy[];
  readonly secciones: readonly SeccionSeriePng[];
  readonly ganadoras: Readonly<Record<string, GanadoraSeccionPng>>;
  /** Cortes del mapa continuo. `[]` o `null` en un mapa categórico. */
  readonly cortes: readonly CorteClase[] | null;
  /** Metadatos de la escala observada. `null` en un mapa categórico. */
  readonly escala: EscalaNumericaPng | null;
  /** Método de corte declarado por la vista. `null` en un mapa categórico. */
  readonly metodo: ModoClasificacion | null;
  readonly divergente: boolean;
  readonly geometria: ReferenciaGeometriaPng;
  readonly conciliacion: ConciliacionPng | null;
  readonly correspondencia: CorrespondenciaPng | null;
  readonly avisos: readonly string[];
  readonly notaLectura: string | null;
  readonly colorSinDato: string;
  readonly colorContornoSinDato: string;
  /** ISO de generación. */
  readonly generadoEn: string;
}

/** Rótulo de la convocatoria tal como se muestra: tipo de proceso y fecha. */
export function etiquetaConvocatoria(electionType: ElectionType | null, electionDate: string): string {
  const tipo = electionType ? (ELECTION_TYPE_LABEL[electionType] ?? electionType) : null;
  return tipo ? `${tipo} ${electionDate}` : electionDate;
}

/**
 * Compone el contrato electoral completo y lo firma. Es la única puerta de
 * entrada: lo que sale de aquí está tipado y no puede declararse económico.
 */
export function construirContratoPngPolitica(entrada: EntradaContratoPngPolitica): ContratoPngPolitica {
  const indicador = descriptorIndicadorPolitica(entrada.indicatorId, null);
  const esCategorico = entrada.indicatorId === POLITICAL_INDICATOR_IDS.winner;
  const candidaturaId = esCategorico ? null : (entrada.candidacyId ?? candidaturaIdDeIndicador(entrada.indicatorId));
  const candidatura = candidaturaId
    ? (entrada.candidaturas.find((c) => c.id === candidaturaId) ?? null)
    : null;
  const desc = esCategorico ? indicador : descriptorIndicadorPolitica(entrada.indicatorId, candidatura?.acronym || candidatura?.name || null);
  const cobertura = calcularCoberturaPolitica(entrada.secciones);

  const categoricalLegend = esCategorico
    ? construirLeyendaCategoricaPolitica({
        secciones: entrada.secciones,
        ganadoras: entrada.ganadoras,
        candidaturas: entrada.candidaturas,
        colorSinDato: entrada.colorSinDato,
        colorContornoSinDato: entrada.colorContornoSinDato,
      })
    : null;

  const continuousLegend = esCategorico
    ? null
    : construirLeyendaContinuaPolitica({
        cortes: entrada.cortes ?? [],
        escala: entrada.escala ?? { min: 0, max: 0, nObservados: 0, valoresDistintos: 0, reducidoPorValoresDistintos: false },
        metodo: entrada.metodo,
        unidad: desc.unit,
        divergente: entrada.divergente,
        colorSinDato: entrada.colorSinDato,
        colorContornoSinDato: entrada.colorContornoSinDato,
        seccionesSinDato: cobertura.seccionesSinDato,
      });

  const sectionValues: SeccionValorPng[] = entrada.secciones.map((s) => {
    const g = entrada.ganadoras[s.sectionKey] ?? null;
    return {
      sectionKey: s.sectionKey,
      candidaturaId: esCategorico ? (g?.ganadoraId ?? null) : candidaturaId,
      valor: esCategorico ? null : s.valor,
      estado: s.estado,
      empate: esCategorico ? Boolean(g?.empate) : false,
    };
  });

  const sinFirma: ContratoPngPoliticaSinFirma = {
    domain: DOMINIO_PNG_POLITICA,
    municipalityCode: entrada.municipalityCode,
    municipalityName: entrada.municipalityName,
    electionId: entrada.electionId,
    electionType: entrada.electionType,
    electionDate: entrada.electionDate,
    electionLabel: etiquetaConvocatoria(entrada.electionType, entrada.electionDate),
    indicatorType: desc.type,
    indicatorId: entrada.indicatorId,
    indicatorLabel: desc.label,
    candidacyId: candidaturaId,
    candidacyName: candidatura ? candidatura.acronym || candidatura.name : null,
    valueType: esCategorico ? "categorical" : entrada.divergente ? "diverging" : "continuous",
    classificationMethod: esCategorico ? null : continuousLegend?.metodo ?? null,
    classes: esCategorico ? 0 : (entrada.cortes?.length ?? 0),
    sectionValues,
    categoricalLegend,
    continuousLegend,
    geometryReference: entrada.geometria,
    coverage: cobertura,
    source: {
      authority: ORGANISMO_ESTADISTICA_POLITICA,
      dataset: FUENTE_DATOS_POLITICA,
      url: "https://infoelectoral.interior.gob.es/",
      licence: LICENCIA_POLITICA,
    },
    reconciliation: entrada.conciliacion,
    correspondence: entrada.correspondencia,
    notices: [...entrada.avisos],
    note: entrada.notaLectura,
    generatedAt: entrada.generadoEn,
  };

  return { ...sinFirma, signature: firmarContratoPolitica(sinFirma) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

export type CodigoFalloPngPolitica =
  | "dominio"
  | "electionDate"
  | "dataset"
  | "fuente"
  | "leyenda"
  | "metodo"
  | "titulo"
  | "firma"
  | "terminos-economicos"
  | "cobertura";

export interface FalloPngPolitica {
  readonly codigo: CodigoFalloPngPolitica;
  readonly mensaje: string;
}

const ISO_CORTO = /^\d{4}-\d{2}-\d{2}$/;

/** Título del documento. Contiene tipo de proceso y fecha de convocatoria. */
export function tituloDeContratoPolitica(c: ContratoPngPoliticaSinFirma): string {
  const partes = [
    c.indicatorLabel,
    c.candidacyName ? `— ${c.candidacyName}` : null,
    c.municipalityName,
    c.electionLabel,
  ].filter((p): p is string => Boolean(p));
  return partes.join(" · ");
}

/**
 * Comprobaciones que se ejecutan ANTES de exportar. Si hay un solo fallo no se
 * compone nada y la causa se enseña tal cual.
 */
export function validarContratoPngPolitica(contrato: ContratoPngPolitica): FalloPngPolitica[] {
  const fallos: FalloPngPolitica[] = [];
  const anota = (codigo: CodigoFalloPngPolitica, mensaje: string) => fallos.push({ codigo, mensaje });

  // 1. Dominio.
  if (contrato.domain !== DOMINIO_PNG_POLITICA) {
    anota("dominio", `El dominio declarado es «${String(contrato.domain)}» y el exportador político solo compone dominio «${DOMINIO_PNG_POLITICA}».`);
  }

  // 2. Convocatoria.
  if (!ISO_CORTO.test(contrato.electionDate)) {
    anota("electionDate", `La fecha de convocatoria no es una fecha ISO «YYYY-MM-DD»: «${contrato.electionDate || "vacía"}». Sin ella el PNG no identifica qué elección representa.`);
  }

  // 3. Dataset político.
  if (!contrato.indicatorId.trim()) {
    anota("dataset", "El contrato no declara identificador de indicador.");
  } else if (esIndicadorEconomico(contrato.indicatorId)) {
    anota("dataset", `«${contrato.indicatorId}» es un indicador económico. No se puede exportar con el exportador político.`);
  } else if (!esIndicadorPolitico(contrato.indicatorId)) {
    anota("dataset", `«${contrato.indicatorId}» no pertenece al catálogo de indicadores políticos.`);
  }
  if (contrato.indicatorType === "winner" && contrato.valueType !== "categorical") {
    anota("dataset", `La candidatura ganadora es un mapa categórico y «${contrato.valueType}» no lo describe.`);
  }
  if (contrato.valueType !== "categorical" && contrato.indicatorType === "winner") {
    anota("dataset", "La candidatura ganadora declara un tipo de valor numérico.");
  }

  // 4. Fuente política.
  const autoridad = contrato.source.authority.trim();
  if (!autoridad) {
    anota("fuente", "El contrato no declara autoridad estadística de los datos.");
  } else if (/instituto\s+nacional\s+de\s+estad/i.test(autoridad)) {
    anota("fuente", `La autoridad de los datos es «${autoridad}». Para unos resultados electorales es falsa: la autoridad es el Ministerio del Interior (Infoelectoral).`);
  }
  if (!contrato.source.dataset.trim()) {
    anota("fuente", "El contrato no declara el dataset de origen.");
  }

  // 5. Leyenda coherente con el tipo de valor.
  if (contrato.valueType === "categorical") {
    if (!contrato.categoricalLegend) {
      anota("leyenda", "Mapa categórico sin leyenda categórica.");
    } else {
      if (contrato.continuousLegend) {
        anota("leyenda", "Un mapa categórico no puede llevar además leyenda continua: se están declarando dos datasets.");
      }
      if (contrato.categoricalLegend.entradas.length === 0) {
        anota("leyenda", "La leyenda categórica está vacía: no hay ninguna candidatura con sección ganada.");
      }
      if (contrato.categoricalLegend.metodo !== null) {
        anota("metodo", "Una leyenda categórica declara un método de corte numérico.");
      }
      if (contrato.categoricalLegend.clases !== null) {
        anota("metodo", "Una leyenda categórica declara clases.");
      }
      const sinDato = contrato.coverage.seccionesSinDato;
      if (contrato.categoricalLegend.sinDato && contrato.categoricalLegend.sinDato.secciones !== sinDato) {
        anota("leyenda", `La entrada de sin dato declara ${contrato.categoricalLegend.sinDato.secciones} secciones y la cobertura ${sinDato}.`);
      }
      const suma = contrato.categoricalLegend.entradas.reduce((s, e) => s + e.seccionesGanadas, 0) + (contrato.categoricalLegend.sinDato?.secciones ?? 0);
      if (suma !== contrato.coverage.seccionesTotales) {
        anota("leyenda", `La leyenda suma ${suma} secciones y el mapa tiene ${contrato.coverage.seccionesTotales}.`);
      }
      for (const e of contrato.categoricalLegend.entradas) {
        if (!e.candidaturaId.trim()) {
          anota("leyenda", "Hay una entrada de leyenda sin identidad de candidatura: el color no se podría asignar por id.");
        }
        if (!/^#[0-9a-f]{3,8}$/i.test(e.color)) {
          anota("leyenda", `La candidatura «${e.sigla}» no trae un color plano utilizable: «${e.color}».`);
        }
      }
    }
    if (contrato.classes !== 0) {
      anota("metodo", `Un mapa categórico declara ${contrato.classes} clases. No tiene cortes.`);
    }
    if (contrato.classificationMethod !== null) {
      anota("metodo", `Un mapa categórico declara el método «${contrato.classificationMethod}». No tiene método de corte.`);
    }
  } else {
    if (contrato.categoricalLegend) {
      anota("leyenda", "Un mapa continuo no puede llevar leyenda categórica: se están declarando dos datasets.");
    }
    if (!contrato.continuousLegend) {
      anota("leyenda", `Mapa ${contrato.valueType} sin leyenda continua.`);
    } else {
      if (contrato.continuousLegend.entradas.length === 0) {
        anota("leyenda", "La leyenda continua está vacía: no hay intervalos.");
      }
      if (!contrato.continuousLegend.unidad.trim()) {
        anota("leyenda", "Un mapa continuo sin unidad no dice qué magnitud se ha repartido en el color.");
      }
      if (!contrato.continuousLegend.metodo) {
        anota("metodo", "Un mapa continuo sin método de clasificación declarado no explica cómo se han repartido los valores.");
      }
      if (contrato.valueType === "diverging" && contrato.continuousLegend.kind !== "diverging") {
        anota("leyenda", "El tipo de valor declara divergente y la leyenda no.");
      }
      if (contrato.valueType === "continuous" && contrato.continuousLegend.kind !== "continuous") {
        anota("leyenda", "El tipo de valor declara continuo y la leyenda no.");
      }
      const suma = contrato.continuousLegend.entradas.reduce((s, e) => s + e.secciones, 0) + (contrato.continuousLegend.sinDato?.secciones ?? 0);
      if (suma !== contrato.coverage.seccionesTotales) {
        anota("leyenda", `La leyenda suma ${suma} secciones y el mapa tiene ${contrato.coverage.seccionesTotales}.`);
      }
    }
    if (contrato.classes !== (contrato.continuousLegend?.entradas.length ?? -1)) {
      anota("metodo", `El contrato declara ${contrato.classes} clases y la leyenda contiene ${contrato.continuousLegend?.entradas.length ?? 0} intervalos.`);
    }
  }

  // 6. Cobertura coherente con su propia definición.
  const cov = contrato.coverage;
  const esperadaPct = cov.seccionesTotales > 0 ? (cov.seccionesRepresentadas / cov.seccionesTotales) * 100 : 0;
  if (Math.abs(cov.coberturaPct - esperadaPct) > 0.05) {
    anota("cobertura", `La cobertura declarada (${cov.coberturaPct} %) no coincide con secciones representadas sobre totales (${esperadaPct} %).`);
  }
  if (cov.seccionesRepresentadas + cov.seccionesSinDato !== cov.seccionesTotales) {
    anota("cobertura", `Representadas (${cov.seccionesRepresentadas}) + sin dato (${cov.seccionesSinDato}) no suman las ${cov.seccionesTotales} secciones del mapa.`);
  }
  if (contrato.sectionValues.length !== cov.seccionesTotales) {
    anota("cobertura", `Hay ${contrato.sectionValues.length} valores de sección y ${cov.seccionesTotales} secciones.`);
  }

  // 7. Título: tipo de proceso y convocatoria.
  const titulo = tituloDeContratoPolitica(contrato);
  if (!titulo.includes(contrato.electionDate)) {
    anota("titulo", `El título no lleva la fecha de convocatoria «${contrato.electionDate}»: «${titulo}».`);
  }
  if (contrato.electionType) {
    const etiqueta = ELECTION_TYPE_LABEL[contrato.electionType];
    if (etiqueta && !titulo.includes(etiqueta)) {
      anota("titulo", `El título no lleva el tipo de proceso «${etiqueta}»: «${titulo}».`);
    }
  }
  if (!titulo.includes(contrato.indicatorLabel)) {
    anota("titulo", `El título no lleva el indicador «${contrato.indicatorLabel}»: «${titulo}».`);
  }

  // 8. Firma: recalculada sobre el contenido, con el dominio fuera.
  if (!contrato.signature.startsWith(PREFIJO_FIRMA_POLITICA)) {
    anota("firma", `La firma «${contrato.signature || "vacía"}» no lleva el prefijo de dominio «${PREFIJO_FIRMA_POLITICA}».`);
  }
  if (contrato.signature !== firmarContratoPolitica({ ...contrato })) {
    anota("firma", "La firma no corresponde al contenido del contrato: algún campo se ha cambiado después de firmarlo.");
  }

  // 9. Vocabulario económico.
  const pureza = detectarTerminosEconomicos(textoDelDataset(contrato));
  if (pureza.length > 0) {
    anota("terminos-economicos", `El documento electoral contiene vocabulario económico (${pureza.join(", ")}).`);
  }

  return fallos;
}

/** `true` si el contrato se puede exportar. */
export function contratoExportable(contrato: ContratoPngPolitica): boolean {
  return validarContratoPngPolitica(contrato).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo al compositor genérico
// ─────────────────────────────────────────────────────────────────────────────

/** Rótulo legible de una entrada de leyenda categórica. */
function etiquetaCandidatura(e: CandidaturaLeyendaPng): string {
  return e.nombre && e.sigla && e.nombre !== e.sigla ? `${e.sigla} — ${e.nombre}` : e.sigla;
}

/**
 * Descriptor de escala para el compositor genérico. En un mapa categérico se
 * sustituyen los cuatro rótulos que hablarían de cortes y clases por otros que
 * sí son ciertos, de modo que el PNG no afirme «sin escala» ni «0 clases».
 */
export function descriptorEscalaPolitica(c: ContratoPngPoliticaSinFirma): DescriptorEscalaPng {
  if (c.valueType !== "categorical" || !c.categoricalLegend) return { tipo: "numerica" };
  const n = c.categoricalLegend.entradas.length;
  const nd = c.categoricalLegend.sinDato?.secciones ?? 0;
  const empates = c.categoricalLegend.entradas.reduce((s, e) => s + e.empates, 0);
  const plazo = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;
  return {
    tipo: "cualitativa",
    rotuloUnidad: "Unidad: no aplica (leyenda categórica)",
    rotuloCabecera: `Leyenda categórica: ${plazo(n, "candidatura", "candidaturas")} con al menos una sección ganada${
      nd > 0 ? ` · ${plazo(nd, "sección", "secciones")} sin dato` : ""
    }`,
    lineaEscala:
      `Mapa categórico: cada color identifica una candidatura de la convocatoria, no un intervalo de valores.` +
      (empates > 0
        ? ` ${plazo(empates, "sección registra", "secciones registran")} empate según la fuente.`
        : ""),
    rotuloLeyenda: `Candidaturas con sección ganada · ${n}`,
  };
}

/** Año electoral como número. Nunca la fecha completa: `periodo` es un número. */
export function anioElectoral(electionDate: string): number | null {
  const m = /^\s*(\d{4})/.exec(electionDate);
  if (!m) return null;
  const anio = Number.parseInt(m[1], 10);
  return Number.isFinite(anio) ? anio : null;
}

/** Entradas de leyenda para el compositor, con color por IDENTIDAD. */
export function entradasLeyendaDesdeContrato(c: ContratoPngPoliticaSinFirma): EntradaLeyendaPng[] {
  const out: EntradaLeyendaPng[] = [];
  if (c.categoricalLegend) {
    for (const e of c.categoricalLegend.entradas) {
      out.push({
        etiqueta: etiquetaCandidatura(e),
        color: e.color,
        secciones: e.seccionesGanadas,
        colorMuestra: e.color,
      });
    }
    const nd = c.categoricalLegend.sinDato;
    if (nd) {
      out.push({ etiqueta: nd.etiqueta, color: nd.color, secciones: nd.secciones, esSinDato: true, colorMuestra: nd.color });
    }
  }
  if (c.continuousLegend) {
    for (const e of c.continuousLegend.entradas) {
      out.push({ etiqueta: e.etiqueta, color: e.color, secciones: e.secciones, colorMuestra: e.color });
    }
    const nd = c.continuousLegend.sinDato;
    if (nd) {
      out.push({ etiqueta: nd.etiqueta, color: nd.color, secciones: nd.secciones, esSinDato: true, colorMuestra: nd.color });
    }
  }
  return out;
}

/** Lo único que el compositor necesita del navegador. */
export interface EntradaOpcionesPngPolitica {
  /** Lienzo ya renderizado del mapa. */
  readonly base: HTMLCanvasElement;
  readonly baseOmitida: boolean;
  readonly escala: EscalaPng;
}

/**
 * Traduce el contrato a las opciones del compositor genérico. PURE y exportada
 * para poder comprobarla sin navegador.
 */
export function opcionesComponerDesdeContrato(
  c: ContratoPngPoliticaSinFirma,
  base: EntradaOpcionesPngPolitica,
): OpcionesComponerPngMapa {
  const unidad = c.continuousLegend?.unidad ?? "";
  const cortes = c.continuousLegend?.entradas ?? [];
  const escala = c.continuousLegend?.clases ?? null;
  return {
    base: base.base,
    indicador: c.indicatorLabel,
    municipio: c.municipalityName,
    provincia: null,
    // El título lo compone el contrato: necesita tipo de proceso y convocatoria.
    anio: anioElectoral(c.electionDate),
    titulo: tituloDeContratoPolitica(c),
    encabezado: `SOCideas · Resultados electorales por sección${c.electionType ? ` · ${ELECTION_TYPE_LABEL[c.electionType] ?? c.electionType}` : ""}`,
    unidad,
    modoClasificacion: c.classificationMethod ?? "Sin método de clasificación",
    clasificacion:
      c.valueType === "categorical" || !escala
        ? null
        : {
            cortes: cortes.map((e) => ({ min: e.min, max: e.max, etiqueta: e.etiqueta, color: e.color, secciones: e.secciones })),
            reducidoPorValoresDistintos: escala.reducidoPorValoresDistintos,
            valoresDistintos: escala.valoresDistintos,
            nObservados: escala.nObservados,
            nNoDifundidos: c.coverage.seccionesSinDato,
            min: escala.min,
            max: escala.max,
          },
    entradasLeyenda: entradasLeyendaDesdeContrato(c),
    colorSinDato: c.continuousLegend?.sinDato?.color ?? c.categoricalLegend?.sinDato?.color ?? "#E9E9E4",
    colorContornoSinDato: c.continuousLegend?.sinDato?.colorContorno ?? c.categoricalLegend?.sinDato?.colorContorno ?? "#9A9A93",
    fuente: c.source.dataset,
    organismo: c.source.authority,
    organismoGeometria: c.geometryReference.source,
    tabla: OPERACION_POLITICA,
    urlTabla: c.source.url,
    convocatoria: c.electionId ? `${c.electionLabel} · ${c.electionId}` : c.electionLabel,
    anioGeometria: c.geometryReference.year,
    coleccionGeometria: c.geometryReference.collection,
    // `periodo` es un número: la fecha completa va en `convocatoria`.
    periodo: anioElectoral(c.electionDate),
    fechaGeometria: c.geometryReference.retrievedAt,
    fechaEstadistica: c.generatedAt,
    seccionesRepresentadas: c.coverage.seccionesRepresentadas,
    seccionesTotales: c.coverage.seccionesTotales,
    seccionesSinDato: c.coverage.seccionesSinDato,
    coberturaPct: c.coverage.coberturaPct,
    escala: base.escala,
    baseOmitida: base.baseOmitida,
    avisos: [...c.notices],
    notaLectura: c.note,
    escalaLeyenda: descriptorEscalaPolitica(c),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composición
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesComponerPngPolitica extends EntradaOpcionesPngPolitica {
  readonly contrato: ContratoPngPolitica;
}

/**
 * Compone el PNG político. VALIDA ANTES de dibujar: con un solo fallo no se
 * compone nada y el error dice cuál fue.
 */
export async function componerPngPolitica(opciones: OpcionesComponerPngPolitica): Promise<HTMLCanvasElement> {
  const fallos = validarContratoPngPolitica(opciones.contrato);
  if (fallos.length > 0) {
    throw new Error(
      `No se ha exportado el PNG: el contrato político no supera la validación (${fallos.length} ${fallos.length === 1 ? "fallo" : "fallos"}). ${fallos
        .map((f) => `[${f.codigo}] ${f.mensaje}`)
        .join(" ")}`,
    );
  }
  const c = opciones.contrato;
  return componerPngMapa(
    opcionesComponerDesdeContrato(c, {
      base: opciones.base,
      baseOmitida: opciones.baseOmitida,
      escala: opciones.escala,
    }),
  );
}

/**
 * Nombre de archivo del PNG político. Lleva el dominio en el nombre para que un
 * electoral y un económico no puedan confundirse ni en la carpeta de descargas.
 */
export function nombreArchivoPngPolitica(ine5: string, indicatorId: string, electionDate: string): string {
  const limpio = (v: string) => {
    const s = String(v ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "desconocido";
  };
  const anio = anioElectoral(electionDate);
  return `SOCideas_Politica_${limpio(ine5)}_${limpio(indicatorId)}_${anio ?? "sindato"}.png`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga
// ─────────────────────────────────────────────────────────────────────────────

/** Lienzo → blob PNG. Genérico: no sabe nada de dominios. */
export function blobDeLienzo(lienzo: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    lienzo.toBlob((b) => resolve(b), "image/png");
  });
}

/** Descarga un blob con nombre. Genérico: no sabe nada de dominios. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}