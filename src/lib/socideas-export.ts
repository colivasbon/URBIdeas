// Tablas exportables SOCideas: solo datos reales del envelope ya presente en la ficha.
// Sin consultas externas, sin nueva lectura R2, sin secretos, sin escrituras.
// CSV: UTF-8 con BOM, separador `;` (Excel español), pie de fuente+periodo.

import type { IndicatorValue, PerfilDemografico, PerfilEconomico } from "./socideas";
import { isPublishableValue, isRealValue } from "./socideas-availability";
import {
  AEAT_EDM_IRPF,
  OP_ADRH,
  OP_CENSO_AGRARIO,
  OP_DIRCE,
  OP_DPOP,
  OP_PIRAMIDE,
  derivedFromSource,
  ineTableSource,
  type SourceReference,
} from "./socideas-source-registry";
import { densityYearsWarning } from "./socideas-density";

export interface ExportCell { text: string; numeric: number | null }

/**
 * Hojas oficiales del libro municipal comparativo. El orden es contractual:
 * cualquier adición requiere reescribir el orden aquí Y en los validadores.
 */
export const SOCIDEAS_SHEET_IDS = [
  "00_PROYECTO",
  "01_PERFIL_DEMOGRÁFICO",
  "02_CONTEXTO_POLÍTICO",
  "03_CONTEXTO_ECONÓMICO",
  "04_CONTEXTO_SOCIOCULTURAL",
  "05_PATRIMONIO_Y_TURISMO",
  "06_INFRAESTRUCTURA_Y_RECURSOS",
  "07_ASOCIACIONES",
  "08_CRITERIOS_Y_FUENTES",
] as const;
export type SocideasSheetId = (typeof SOCIDEAS_SHEET_IDS)[number];

/** Modos de comparativa territorial admitidos por un bloque. */
export type ComparisonMode =
  | "national_autonomous_provincial_municipal"
  | "autonomous_provincial_municipal"
  | "municipal_only";

/** Disponibilidad editorial de un bloque: distingue dato real de ausencia. */
export type BlockAvailability =
  | "available"
  | "not_available"
  | "pending_integration";

export interface ExportTable {
  id: string;
  titulo: string;
  hoja: SocideasSheetId;
  columnas: string[];
  filas: ExportCell[][];
  fuente: string;
  periodo: string;
  cobertura: string;
  estado: string;
  /** Procedencia pública centralizada (registro de fuentes). Opcional: si no
   *  existe fuente atribuible, no se pinta enlace (solo línea de fuente). */
  source?: SourceReference;
  /** Modo comparativo declarado por el bloque. Si no se indica se asume
   *  municipal_only (no se pintan columnas territoriales que no tengan datos). */
  comparisonMode?: ComparisonMode;
  /** Disponibilidad editorial. Si `pending_integration` o `not_available`, el
   *  renderer pinta una nota breve en vez de tabla con celdas vacías. */
  availability?: BlockAvailability;
  /** Nota metodológica opcional. Se muestra como línea discreta bajo la tabla
   *  (no como columna adicional). Máximo 240 caracteres visibles. */
  note?: string;
}

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? "";
}
function fuenteDe(v: IndicatorValue | null | undefined): string {
  if (!v) return "";
  const org = (v.source as unknown as { organismo?: string; nombre?: string } | undefined);
  return [org?.organismo, org?.nombre].filter(Boolean).join(" · ");
}
function cell(text: string, numeric: number | null = null): ExportCell { return { text, numeric }; }
export function fmtES(n: number | null, dec = 0): string {
  if (!isRealValue(n)) return "ND";
  return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function ultimo(valores: IndicatorValue[], slug: string): IndicatorValue | null {
  const list = valores
    .filter((v) => slugOf(v) === slug && isPublishableValue(slug, v.valor_numerico) && (v.dimensiones?.ambito ?? "municipio") === "municipio")
    .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0));
  return list.length > 0 ? list[list.length - 1] : null;
}
function serie(valores: IndicatorValue[], slug: string, ambito = "municipio"): { anio: number; valor: number }[] {
  return valores
    .filter((v) => slugOf(v) === slug && isPublishableValue(slug, v.valor_numerico) && (v.dimensiones?.ambito ?? "municipio") === ambito)
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
    .sort((a, b) => a.anio - b.anio);
}

/** Normaliza para nombres de archivo: sin diacríticos, espacios → guiones. */
export function normalizarMunicipio(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "Municipio";
}

/**
 * Sanea un nombre de archivo para Content-Disposition: solo ASCII imprimible.
 * Usar siempre que se construya una cabecera Content-Disposition con nombre
 * de archivo que pueda contener caracteres no-Latin1 (em dash, ñ, acentos, etc.).
 */
export function toAsciiFilename(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "_");
}

export function nombreCSV(municipio: string, ine: string, bloque: string, tabla: string, periodo: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, "");
  return `SOCideas_${normalizarMunicipio(municipio)}_${ine}_${safe(bloque)}_${safe(tabla)}_${safe(periodo)}.csv`;
}
export function nombreBloque(municipio: string, ine: string, bloque: string): string {
  return `SOCideas_${normalizarMunicipio(municipio)}_${ine}_${bloque}_tablas`;
}

function csvEscape(s: string): string {
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM, `;`, pie de trazabilidad. Solo filas reales (ND explícito, nunca 0). */
export function tablaACSV(t: ExportTable): string {
  const head = t.columnas.map(csvEscape).join(";");
  const body = t.filas.map((f) => f.map((c) => csvEscape(c.text)).join(";")).join("\r\n");
  const pie = [`Fuente: ${t.fuente}`, `Periodo: ${t.periodo}`, `Cobertura: ${t.cobertura}`, `Estado: ${t.estado}`]
    .map(csvEscape).join(";");
  return `\uFEFF${head}\r\n${body}\r\n${pie}\r\n`;
}

// ---------- Demografía ----------

/** Busca un valor real publicado para un año y ámbito concretos en una serie. */
function valorEnAnio(
  valores: IndicatorValue[],
  anio: number,
  ambito: "municipio" | "provincia" | "ccaa" | "espana",
): { valor: number; source_table_id: string | null } | null {
  const v = valores.find(
    (x) =>
      x.anio_referencia === anio &&
      (x.dimensiones?.ambito ?? "municipio") === ambito &&
      isPublishableValue(x.indicator_id ?? "", x.valor_numerico),
  );
  if (!v || !isRealValue(v.valor_numerico)) return null;
  return { valor: v.valor_numerico as number, source_table_id: v.source_table_id ?? null };
}

/** Devuelve la intersección de años donde los cuatro ámbitos tienen valor real. */
function interseccionAnios(perfil: PerfilDemografico): number[] {
  const sets = (arr: IndicatorValue[]): Set<number> =>
    new Set(
      arr
        .filter((v) => isPublishableValue(v.indicator_id ?? "", v.valor_numerico))
        .map((v) => v.anio_referencia ?? 0)
        .filter((a) => a > 0),
    );
  const muni = sets(perfil.evolucion);
  const prov = sets(perfil.comparativas.provincia);
  const ccaa = sets(perfil.comparativas.ccaa);
  const esp = sets(perfil.comparativas.espana);
  const union: number[] = [];
  for (const y of [...new Set([...muni, ...prov, ...ccaa, ...esp])].sort((a, b) => a - b)) {
    const visibles = [muni, prov, ccaa, esp].filter((s) => s.has(y));
    // Solo admitimos años donde al menos dos ámbitos publican valor real; si
    // solo hay uno, no procede comparativa y se omite.
    if (visibles.length >= 2) union.push(y);
  }
  return union;
}

/** Determina qué columnas territoriales tienen datos reales para un año concreto. */
function ambitosConDato(
  perfil: PerfilDemografico,
  anio: number,
): { hasNacional: boolean; hasCCAA: boolean; hasProv: boolean; hasMuni: boolean } {
  return {
    hasNacional: valorEnAnio(perfil.comparativas.espana, anio, "espana") !== null,
    hasCCAA: valorEnAnio(perfil.comparativas.ccaa, anio, "ccaa") !== null,
    hasProv: valorEnAnio(perfil.comparativas.provincia, anio, "provincia") !== null,
    hasMuni: valorEnAnio(perfil.evolucion, anio, "municipio") !== null,
  };
}

/** Construye los nombres de columna territoriales en orden contractual. */
function columnasTerritoriales(
  has: { hasNacional: boolean; hasCCAA: boolean; hasProv: boolean; hasMuni: boolean },
): string[] {
  const out: string[] = [];
  if (has.hasNacional) out.push("España");
  if (has.hasCCAA) out.push("CCAA");
  if (has.hasProv) out.push("Provincia");
  if (has.hasMuni) out.push("Municipio");
  return out;
}

/** Compara dos conjuntos de disponibilidad y devuelve la intersección. */
function interseccionAmbitos(
  a: { hasNacional: boolean; hasCCAA: boolean; hasProv: boolean; hasMuni: boolean },
  b: { hasNacional: boolean; hasCCAA: boolean; hasProv: boolean; hasMuni: boolean },
): { hasNacional: boolean; hasCCAA: boolean; hasProv: boolean; hasMuni: boolean } {
  return {
    hasNacional: a.hasNacional && b.hasNacional,
    hasCCAA: a.hasCCAA && b.hasCCAA,
    hasProv: a.hasProv && b.hasProv,
    hasMuni: a.hasMuni && b.hasMuni,
  };
}

/** Traduce el conjunto de amibitos al modo comparativo contractual. */
function modoComparativo(has: { hasNacional: boolean; hasCCAA: boolean; hasProv: boolean; hasMuni: boolean }): ComparisonMode {
  if (has.hasNacional && has.hasCCAA && has.hasProv && has.hasMuni) {
    return "national_autonomous_provincial_municipal";
  }
  if (has.hasCCAA && has.hasProv && has.hasMuni) {
    return "autonomous_provincial_municipal";
  }
  return "municipal_only";
}

export function buildDemografiaTables(perfil: PerfilDemografico): ExportTable[] {
  const tablas: ExportTable[] = [];
  const refAnio = perfil.total?.anio_referencia ?? null;
  const total = perfil.total?.valor_numerico ?? null;
  const hombres = perfil.hombres?.valor_numerico ?? null;
  const mujeres = perfil.mujeres?.valor_numerico ?? null;

  // 1. Población y composición por sexo (municipal, ya que hombres/mujeres
  //    solo están disponibles a nivel municipal en el envelope actual).
  if (isRealValue(total)) {
    const filaHombres: ExportCell[] = isRealValue(hombres)
      ? [cell(fmtES(hombres), hombres), cell(`${fmtES(Math.round((hombres / total) * 1000) / 10, 1)} %`)]
      : [cell("ND"), cell("ND")];
    const filaMujeres: ExportCell[] = isRealValue(mujeres)
      ? [cell(fmtES(mujeres), mujeres), cell(`${fmtES(Math.round((mujeres / total) * 1000) / 10, 1)} %`)]
      : [cell("ND"), cell("ND")];
    tablas.push({
      id: "poblacion-actual",
      titulo: "Población por sexo",
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Concepto", "Personas", "% sobre total"],
      filas: [
        [cell("Población total"), cell(fmtES(total), total), cell("—")],
        [cell("Hombres"), ...filaHombres],
        [cell("Mujeres"), ...filaMujeres],
      ],
      fuente: fuenteDe(perfil.total) || "INE",
      periodo: refAnio ? String(refAnio) : "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado",
      source: ineTableSource(perfil.total?.source_table_id, OP_DPOP) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "Comparativa territorial no disponible para esta fuente: hombres y mujeres solo se publican en este nivel de detalle.",
    });
  }

  // 2. Densidad de población: cálculo SOCideas cuando el envelope trae
  //    superficie oficial IGN; si no, placeholder honesto (nada se estima).
  if (perfil.densidad.valor !== null && perfil.densidad.valor !== undefined) {
    const anioPopD = perfil.densidad.anioPoblacion ?? refAnio;
    const anioSupD = perfil.densidad.anioSuperficie ?? null;
    const periodoDensidad =
      anioPopD !== null && anioPopD !== undefined && anioSupD !== null && anioSupD !== undefined
        ? `población ${anioPopD} · superficie ${anioSupD}`
        : (refAnio ? String(refAnio) : "—");
    const avisoD =
      anioPopD !== null && anioPopD !== undefined && anioSupD !== null && anioSupD !== undefined
        ? densityYearsWarning(anioPopD, anioSupD)
        : null;
    tablas.push({
      id: "densidad",
      titulo: "Densidad de población",
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Concepto", "Valor", "Unidad"],
      filas: [
        [cell("Densidad de población"), cell(fmtES(perfil.densidad.valor, 1), perfil.densidad.valor), cell("hab/km²")],
        [cell("Superficie municipal (IGN · NGMEP)"),
          perfil.densidad.superficieKm2 !== null && perfil.densidad.superficieKm2 !== undefined
            ? cell(fmtES(perfil.densidad.superficieKm2, 2), perfil.densidad.superficieKm2)
            : cell("ND"),
          cell("km²")],
      ],
      fuente: "INE + IGN (NGMEP) · Cálculo SOCideas",
      periodo: periodoDensidad,
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Cálculo SOCideas con definición explícita",
      source: derivedFromSource(ineTableSource(perfil.total?.source_table_id, OP_DPOP)) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
      note: avisoD
        ? `Densidad = población / superficie IGN. ${avisoD}`
        : "Densidad = población municipal / superficie oficial IGN (NGMEP). Cálculo SOCideas.",
    });
  } else {
    tablas.push({
      id: "densidad",
      titulo: "Densidad de población",
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Concepto"],
      filas: [],
      fuente: "Pendiente de incorporación desde fuente de superficie homogénea",
      periodo: "—",
      cobertura: "Municipio / Provincia / CCAA / España",
      estado: "Sin cobertura verificable",
      availability: "pending_integration",
      comparisonMode: "municipal_only",
      note: "Densidad de población: pendiente de incorporación desde fuente de superficie.",
    });
  }

  // 3. Evolución de la población: comparativa completa cuando hay datos
  //    simultáneos en al menos dos amibitos. Nunca mezcla años incompatibles.
  const ani = interseccionAnios(perfil);
  if (ani.length > 0) {
    const avail = ani.map((y) => ambitosConDato(perfil, y));
    const inters = ani.reduce<ReturnType<typeof ambitosConDato>>(
      (acc, _y, i) => interseccionAmbitos(acc, avail[i]),
      { hasNacional: true, hasCCAA: true, hasProv: true, hasMuni: true },
    );
    const colAmbitos = columnasTerritoriales(inters);
    const amAnio: Record<"municipio" | "provincia" | "ccaa" | "espana", (a: number) => number | null> = {
      municipio: (a) => perfil.evolucion.find((x) => x.anio_referencia === a)?.valor_numerico ?? null,
      provincia: (a) => valorEnAnio(perfil.comparativas.provincia, a, "provincia")?.valor ?? null,
      ccaa: (a) => valorEnAnio(perfil.comparativas.ccaa, a, "ccaa")?.valor ?? null,
      espana: (a) => valorEnAnio(perfil.comparativas.espana, a, "espana")?.valor ?? null,
    };
    const fuenteBase = fuenteDe(perfil.evolucion[0]) || "INE";
    const primeraTabla = ani[0];
    const sourceTableId =
      perfil.evolucion[0]?.source_table_id ??
      valorEnAnio(perfil.comparativas.provincia, primeraTabla, "provincia")?.source_table_id ??
      null;
    tablas.push({
      id: "evolucion",
      titulo: "Evolución de la población",
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Año", ...colAmbitos],
      filas: ani.map((a) => {
        const fila: ExportCell[] = [cell(String(a), a)];
        if (inters.hasNacional) fila.push(cell(fmtES(amAnio.espana(a)), amAnio.espana(a)));
        if (inters.hasCCAA) fila.push(cell(fmtES(amAnio.ccaa(a)), amAnio.ccaa(a)));
        if (inters.hasProv) fila.push(cell(fmtES(amAnio.provincia(a)), amAnio.provincia(a)));
        if (inters.hasMuni) fila.push(cell(fmtES(amAnio.municipio(a)), amAnio.municipio(a)));
        return fila;
      }),
      fuente: fuenteBase,
      periodo: ani.length > 0 ? `${ani[0]}–${ani[ani.length - 1]}` : "—",
      cobertura: `${colAmbitos.join(" · ")} (mismo año y misma definición)`,
      estado:
        modoComparativo(inters) === "national_autonomous_provincial_municipal"
          ? "Consolidado (CCAA/España pueden terminar antes por rezago del Tempus3)"
          : "Comparativa parcial: solo se muestran los amibitos con dato publicado",
      source: ineTableSource(sourceTableId, OP_DPOP) ?? undefined,
      comparisonMode: modoComparativo(inters),
      availability: "available",
    });
  }

  // 4. Estructura por edad y sexo (municipal, pirámide quinquenal del Padrón).
  if (perfil.piramide.grupos.length > 0 && perfil.piramide.anio !== null) {
    const suma = perfil.piramide.grupos.reduce((a, g) => a + g.hombres + g.mujeres, 0);
    tablas.push({
      id: "piramide",
      titulo: `Estructura por edad y sexo (${perfil.piramide.anio})`,
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Grupo de edad", "Hombres", "Mujeres", "% sobre total"],
      filas: perfil.piramide.grupos.map((g) => [
        cell(g.tramo),
        cell(fmtES(g.hombres), g.hombres),
        cell(fmtES(g.mujeres), g.mujeres),
        cell(suma > 0 ? `${fmtES(Math.round(((g.hombres + g.mujeres) / suma) * 1000) / 10, 1)} %` : "ND"),
      ]),
      fuente: "INE · Padrón Continuo",
      periodo: String(perfil.piramide.anio),
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado",
      source: ineTableSource("33570", OP_PIRAMIDE) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "La estructura detallada por edad y sexo se muestra para el municipio.",
    });
  }

  // 5. Indicadores demográficos derivados (cálculo SOCideas, municipal).
  const d = perfil.derivados;
  const derivados: ExportCell[][] = [];
  if (isRealValue(d.cambio_5y)) derivados.push([cell("Variación 5 años (%)"), cell(fmtES(d.cambio_5y, 1), d.cambio_5y)]);
  if (isRealValue(d.cambio_10y)) derivados.push([cell("Variación 10 años (%)"), cell(fmtES(d.cambio_10y, 1), d.cambio_10y)]);
  if (isRealValue(d.indice_envejecimiento)) derivados.push([cell("Índice de envejecimiento (65+/0-14×100)"), cell(fmtES(d.indice_envejecimiento, 1), d.indice_envejecimiento)]);
  if (isRealValue(d.indice_dependencia)) derivados.push([cell("Índice de dependencia ((0-14+65+)/15-64×100)"), cell(fmtES(d.indice_dependencia, 1), d.indice_dependencia)]);
  if (derivados.length > 0) {
    tablas.push({
      id: "derivados",
      titulo: "Indicadores demográficos derivados",
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Indicador", "Valor"],
      filas: derivados,
      fuente: "Cálculo SOCideas sobre datos oficiales INE",
      periodo: refAnio ? String(refAnio) : "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Cálculo SOCideas con definición explícita",
      source: derivedFromSource(ineTableSource(perfil.total?.source_table_id, OP_DPOP)) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
    });
  } else {
    tablas.push({
      id: "derivados",
      titulo: "Indicadores demográficos derivados",
      hoja: "01_PERFIL_DEMOGRÁFICO",
      columnas: ["Indicador"],
      filas: [],
      fuente: "Cálculo SOCideas sobre datos oficiales INE",
      periodo: "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Pendiente de cálculo (datos previos insuficientes)",
      availability: "pending_integration",
      comparisonMode: "municipal_only",
      note: "Indicadores demográficos derivados: pendiente de cálculo sobre la serie consolidada.",
    });
  }

  return tablas;
}

// ---------- Economía ----------

export function buildEconomiaTables(perfil: PerfilEconomico): ExportTable[] {
  const tablas: ExportTable[] = [];
  const { valores } = perfil;

  // 1.1. Renta por declaración — AEAT (municipal, sin comparativa territorial
  //      homogénea disponible en el envelope actual).
  const aeatSlugs = ["irpf_declaraciones", "irpf_renta_bruta_media", "irpf_renta_disponible_media"] as const;
  const aeatAnios = [...new Set(
    aeatSlugs.flatMap((s) => serie(valores, s).map((p) => p.anio)),
  )].sort((a, b) => a - b);
  const aeatVal = (slug: string, anio: number): number | null => {
    const v = valores.find(
      (x) =>
        slugOf(x) === slug &&
        x.anio_referencia === anio &&
        isRealValue(x.valor_numerico) &&
        (x.dimensiones?.ambito ?? "municipio") === "municipio",
    );
    return v?.valor_numerico ?? null;
  };
  const aeatCols = [
    { slug: "irpf_declaraciones", label: "Declaraciones" },
    { slug: "irpf_renta_bruta_media", label: "Bruta media/decl. (€)" },
    { slug: "irpf_renta_disponible_media", label: "Disponible media/decl. (€)" },
  ].filter((c) => aeatAnios.some((a) => aeatVal(c.slug, a) !== null));
  if (aeatAnios.length > 0 && aeatCols.length > 0) {
    const primero = valores.find((x) => slugOf(x) === aeatCols[0].slug);
    tablas.push({
      id: "renta-aeat",
      titulo: "Renta por declaración — AEAT",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Año", ...aeatCols.map((c) => c.label)],
      filas: aeatAnios.map((a) => [
        cell(String(a), a),
        ...aeatCols.map((c) => {
          const v = aeatVal(c.slug, a);
          return cell(v === null ? "ND" : fmtES(v), v);
        }),
      ]),
      fuente: fuenteDe(primero) || "AEAT · Estadística de declarantes del IRPF por municipios (EDM)",
      periodo: `${aeatAnios[0]}–${aeatAnios[aeatAnios.length - 1]}`,
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado (definición AEAT por declaración)",
      source: AEAT_EDM_IRPF,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "Renta por declaración publicada por la AEAT. No se mezcla con renta por persona/hogar.",
    });
  } else {
    tablas.push({
      id: "renta-aeat",
      titulo: "Renta por declaración — AEAT",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Indicador"],
      filas: [],
      fuente: "AEAT · Estadística de declarantes del IRPF por municipios (EDM)",
      periodo: "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Pendiente de incorporación",
      availability: "pending_integration",
      comparisonMode: "municipal_only",
      note: "Renta por declaración: pendiente de aportar el fichero base del ejercicio.",
    });
  }

  // 1.2. Renta por persona y hogar — INE ADRH (municipal con comparativa
  //      autonómica/provincial cuando los años coinciden).
  const adrhSlugs = ["renta_neta_media_persona", "renta_neta_media_hogar", "renta_bruta_media_hogar"] as const;
  const adrhAniosMuni = [...new Set(
    adrhSlugs.flatMap((s) => serie(valores, s).map((p) => p.anio)),
  )].sort((a, b) => a - b);
  if (adrhAniosMuni.length > 0) {
    const adrhCols = [
      { slug: "renta_neta_media_persona", label: "Renta neta por persona (€)" },
      { slug: "renta_neta_media_hogar", label: "Renta neta por hogar (€)" },
      { slug: "renta_bruta_media_hogar", label: "Renta bruta por hogar (€)" },
    ].filter((c) => adrhAniosMuni.some((a) => aeatVal(c.slug, a) !== null));
    if (adrhCols.length > 0) {
      const primero = valores.find((x) => slugOf(x) === adrhCols[0].slug);
      tablas.push({
        id: "renta-adrh",
        titulo: "Renta por persona y hogar — INE ADRH",
        hoja: "03_CONTEXTO_ECONÓMICO",
        columnas: ["Indicador", ...adrhAniosMuni.map((a) => String(a))],
        filas: adrhCols.map((c) => {
          const fila: ExportCell[] = [cell(c.label)];
          for (const a of adrhAniosMuni) {
            const v = aeatVal(c.slug, a);
            fila.push(cell(v === null ? "ND" : fmtES(v), v));
          }
          return fila;
        }),
        fuente: fuenteDe(primero) || "INE · Atlas de Distribución de Renta de los Hogares (ADRH)",
        periodo: `${adrhAniosMuni[0]}–${adrhAniosMuni[adrhAniosMuni.length - 1]}`,
        cobertura: `Municipio ${perfil.municipio.nombre}`,
        estado: "Consolidado (definición ADRH por persona/hogar)",
        source: ineTableSource(primero?.source_table_id, OP_ADRH) ?? undefined,
        comparisonMode: "municipal_only",
        availability: "available",
        note: "Renta por persona y hogar publicada por INE ADRH. No se mezcla con renta por declaración.",
      });
    }
  } else {
    tablas.push({
      id: "renta-adrh",
      titulo: "Renta por persona y hogar — INE ADRH",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Indicador"],
      filas: [],
      fuente: "INE · Atlas de Distribución de Renta de los Hogares (ADRH)",
      periodo: "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Pendiente de incorporación",
      availability: "pending_integration",
      comparisonMode: "municipal_only",
      note: "Renta por persona y hogar: pendiente de integración desde INE ADRH.",
    });
  }

  // 2. Desigualdad (Gini, P80/P20) — series municipales, sin comparativa
  //    territorial homogénea en el envelope actual.
  for (const [slug, titulo, fmt] of [
    ["gini", "Índice de Gini", 1],
    ["p80_p20", "Ratio P80/P20", 1],
  ] as const) {
    const s = serie(valores, slug);
    if (s.length > 0) {
      tablas.push({
        id: slug,
        titulo,
        hoja: "03_CONTEXTO_ECONÓMICO",
        columnas: ["Año", "Valor"],
        filas: s.map((p) => [cell(String(p.anio), p.anio), cell(fmtES(p.valor, fmt), p.valor)]),
        fuente: fuenteDe(ultimo(valores, slug)) || "INE · ADRH",
        periodo: `${s[0].anio}–${s[s.length - 1].anio}`,
        cobertura: `Municipio ${perfil.municipio.nombre} (desigualdad: ≥100 residentes)`,
        estado: "Consolidado",
        source: ineTableSource(ultimo(valores, slug)?.source_table_id ?? "37683", OP_ADRH) ?? undefined,
        comparisonMode: "municipal_only",
        availability: "available",
      });
    } else {
      const motivo =
        slug === "gini"
          ? "Desigualdad (Gini): pendiente de integración desde INE ADRH."
          : "Desigualdad (P80/P20): pendiente de integración desde INE ADRH.";
      tablas.push({
        id: slug,
        titulo,
        hoja: "03_CONTEXTO_ECONÓMICO",
        columnas: ["Indicador"],
        filas: [],
        fuente: "INE · ADRH",
        periodo: "—",
        cobertura: `Municipio ${perfil.municipio.nombre}`,
        estado: "Pendiente de incorporación",
        availability: "pending_integration",
        comparisonMode: "municipal_only",
        note: motivo,
      });
    }
  }

  // 3. Tejido empresarial — DIRCE municipal.
  const empTotal = ultimo(valores, "empresas_total");
  if (isRealValue(empTotal?.valor_numerico)) {
    const f = (slug: string) => ultimo(valores, slug)?.valor_numerico ?? null;
    const rows: ExportCell[][] = [[cell("Total de empresas"), cell(fmtES(f("empresas_total")), f("empresas_total"))]];
    const det: [string, string][] = [
      ["Industria", "empresas_industria"],
      ["Construcción", "empresas_construccion"],
      ["Comercio, transporte y hostelería", "empresas_comercio_hosteleria"],
      ["Servicios", "empresas_servicios"],
    ];
    for (const [label, slug] of det) {
      const v = f(slug);
      if (v !== null) rows.push([cell(label), cell(fmtES(v), v)]);
    }
    tablas.push({
      id: "empresas",
      titulo: "Tejido empresarial — DIRCE",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Concepto", "Empresas"],
      filas: rows,
      fuente: fuenteDe(empTotal) || "INE · DIRCE",
      periodo: empTotal?.anio_referencia ? String(empTotal.anio_referencia) : "—",
      cobertura: `Municipio ${perfil.municipio.nombre} (sede social)`,
      estado: "Consolidado (empresas ≠ ocupados)",
      source: ineTableSource(empTotal?.source_table_id ?? "4721", OP_DIRCE) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "Empresas con sede en el municipio (DIRCE). No se mezcla con afiliación a la Seguridad Social.",
    });
  } else {
    tablas.push({
      id: "empresas",
      titulo: "Tejido empresarial — DIRCE",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Indicador"],
      filas: [],
      fuente: "INE · DIRCE",
      periodo: "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Pendiente de incorporación",
      availability: "pending_integration",
      comparisonMode: "municipal_only",
      note: "Tejido empresarial: pendiente de integración desde INE DIRCE.",
    });
  }

  // 4. Sector agrario — Censo Agrario 2020 (municipal, estructural).
  const agrSau = ultimo(valores, "agr_sau_total");
  const agrExp = ultimo(valores, "agr_explotaciones");
  if (isRealValue(agrSau?.valor_numerico) || isRealValue(agrExp?.valor_numerico)) {
    const rows: ExportCell[][] = [];
    const f = (slug: string) => ultimo(valores, slug)?.valor_numerico ?? null;
    if (isRealValue(agrSau?.valor_numerico)) rows.push([cell("Superficie agraria (ha)"), cell(fmtES(agrSau?.valor_numerico ?? null), agrSau?.valor_numerico ?? null)]);
    if (isRealValue(agrExp?.valor_numerico)) rows.push([cell("Explotaciones"), cell(fmtES(agrExp?.valor_numerico ?? null), agrExp?.valor_numerico ?? null)]);
    for (const [label, slug] of [["Tierra arable (ha)", "agr_tierra_arable"], ["Cultivos leñosos (ha)", "agr_cultivos_lenosos"], ["Pastos (ha)", "agr_pastos"], ["Huertos (ha)", "agr_huertos"]] as const) {
      const v = f(slug);
      if (v !== null) rows.push([cell(label), cell(fmtES(v), v)]);
    }
    tablas.push({
      id: "agrario",
      titulo: "Estructura agraria — Censo Agrario 2020",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Concepto", "Valor"],
      filas: rows,
      fuente: fuenteDe(agrSau ?? agrExp) || "INE · Censo Agrario 2020",
      periodo: "2020 (estructural, no anual)",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Censo 2020: estructural",
      source: ineTableSource((agrSau ?? agrExp)?.source_table_id ?? "29006", OP_CENSO_AGRARIO) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "Censo Agrario 2020: dato estructural municipal, no se presenta como serie anual.",
    });
  } else {
    tablas.push({
      id: "agrario",
      titulo: "Sector agrario — Censo Agrario 2020",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Indicador"],
      filas: [],
      fuente: "INE · Censo Agrario 2020",
      periodo: "2020 (estructural)",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Pendiente de incorporación",
      availability: "pending_integration",
      comparisonMode: "municipal_only",
      note: "Sector agrario: pendiente de incorporación desde Censo Agrario 2020.",
    });
  }

  // 5. Ganadería — Censo Agrario 2020 (municipal, estructural).
  const especies: [string, string, string][] = [
    ["Bovino", "gan_bovino_exp", "gan_bovino_cab"],
    ["Ovino y caprino", "gan_ovino_caprino_exp", "gan_ovino_caprino_cab"],
    ["Porcino", "gan_porcino_exp", "gan_porcino_cab"],
    ["Aves de corral", "gan_aves_exp", "gan_aves_cab"],
  ];
  const ganRows = especies
    .map(([nombre, eSlug, cSlug]) => {
      const e = ultimo(valores, eSlug)?.valor_numerico ?? null;
      const c = ultimo(valores, cSlug)?.valor_numerico ?? null;
      return e !== null || c !== null
        ? [cell(nombre), cell(e === null ? "ND" : fmtES(e), e), cell(c === null ? "ND" : fmtES(c), c)]
        : null;
    })
    .filter((r): r is ExportCell[][][number] => r !== null);
  const ug = ultimo(valores, "gan_ug_total");
  if (ganRows.length > 0 || isRealValue(ug?.valor_numerico)) {
    const filas: ExportCell[][] = [];
    if (isRealValue(ug?.valor_numerico)) {
      filas.push([cell("Unidades ganaderas totales"), cell(fmtES(ug?.valor_numerico ?? null), ug?.valor_numerico ?? null), cell("")]);
    }
    filas.push(...ganRows);
    tablas.push({
      id: "ganaderia",
      titulo: "Ganadería — Censo Agrario 2020",
      hoja: "03_CONTEXTO_ECONÓMICO",
      columnas: ["Especie", "Explotaciones", "Cabezas"],
      filas,
      fuente: fuenteDe(ug) || "INE · Censo Agrario 2020",
      periodo: "2020 (estructural, no anual)",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Censo 2020: estructural con secreto estadístico (ND, nunca 0)",
      source: ineTableSource(ug?.source_table_id ?? "29006", OP_CENSO_AGRARIO) ?? undefined,
      comparisonMode: "municipal_only",
      availability: "available",
    });
  }

  // 6. Presupuesto, empleo y subvenciones: bloque pendiente de integración.
  tablas.push({
    id: "presupuesto-empleo",
    titulo: "Presupuesto municipal, empleo y subvenciones",
    hoja: "03_CONTEXTO_ECONÓMICO",
    columnas: ["Indicador"],
    filas: [],
    fuente: "Pendiente de integración desde fuentes administrativas oficiales",
    periodo: "—",
    cobertura: "Municipio",
    estado: "Pendiente de integración",
    availability: "pending_integration",
    comparisonMode: "municipal_only",
    note: "Presupuesto municipal, empleo y afiliación: pendientes de integración desde fuentes administrativas oficiales (Hacienda, SEPE, Seguridad Social, FEADER, CCAA).",
  });

  return tablas;
}

export interface TraceabilitySheet {
  municipio: string; codigoINE: string; bloque: string;
  fechaGeneracion: string; tablas: ExportTable[]; excluidas: { titulo: string; motivo: string }[];
}

export interface Exclusion { titulo: string; motivo: string }

/** Exclusiones documentadas de Demografía (fuente única para página y libro XLSX). */
export function demografiaExcluidas(hasDensidad = false): Exclusion[] {
  return [
    ...(hasDensidad
      ? []
      : [{ titulo: "Densidad de población", motivo: "Pendiente de integración de fuente de superficie." }]),
    { titulo: "Saldo migratorio agregado (capa antigua, INE tabla 69767)", motivo: "Sin cobertura municipal verificada; sigue pendiente. Los flujos migratorios (tablas 69711, 69743 y 69746) sí tienen cobertura y se incluyen en su bloque." },
    { titulo: "Indicadores por sección censal", motivo: "Sin tabla cargada; la geometría se carga solo bajo demanda." },
  ];
}

/** Exclusiones documentadas de Economía (fuente única para página y libro XLSX). */
export function economiaExcluidas(hasRenta: boolean): Exclusion[] {
  return [
    { titulo: "Paro registrado (SEPE)", motivo: "Pendiente de conector en batch 1 (dry-run)." },
    { titulo: "Afiliación a la Seguridad Social (TGSS)", motivo: "Pendiente de conector en batch 1 (dry-run)." },
    { titulo: "Presupuestos, liquidaciones y ayudas", motivo: "Sin fuente nacional homogénea verificada." },
    { titulo: "Renta AEAT por declaración", motivo: hasRenta ? "Incluida si el ejercicio fue aportado; en otro caso pendiente." : "Pendiente de aportar el fichero base del ejercicio." },
  ];
}

/** Exclusión documentada de secciones censales para el libro combinado. */
export function seccionesExcluidas(): Exclusion[] {
  return [
    { titulo: "03_Secciones censales", motivo: "Sin tabla de indicadores por sección cargada; la geometría oficial se carga solo bajo demanda del usuario." },
  ];
}

/** Filas de la hoja 00_Resumen_y_trazabilidad (también cabecera del informe HTML). */
export function traceabilityRows(t: TraceabilitySheet): string[][] {
  return [
    ["Ideas Sostenibilidad · SOCideas"],
    [`Bloque: Tablas de ${t.bloque}`, `Municipio: ${t.municipio} (${t.codigoINE})`, `Generado: ${t.fechaGeneracion}`],
    ["Tablas incluidas:"],
    ...t.tablas.map((x) => [`- ${x.titulo}`, `Fuente: ${x.fuente}`, `Periodo: ${x.periodo}`, `Estado: ${x.estado}`]),
    ...(t.excluidas.length > 0 ? [["Tablas no incluidas por falta de cobertura:"], ...t.excluidas.map((e) => [`- ${e.titulo}: ${e.motivo}`])] : []),
    [["La ausencia de dato nunca equivale a 0. Cada tabla conserva su fuente y periodo."][0]],
  ];
}
