// Tablas exportables SOCideas: solo datos reales del envelope ya presente en la ficha.
// Sin consultas externas, sin nueva lectura R2, sin secretos, sin escrituras.
// CSV: UTF-8 con BOM, separador `;` (Excel español), pie de fuente+periodo.

import type { IndicatorValue, PerfilDemografico, PerfilEconomico } from "./socideas";
import { isPublishableValue, isRealValue } from "./socideas-availability";

export interface ExportCell { text: string; numeric: number | null }
export interface ExportTable {
  id: string;
  titulo: string;
  hoja: string;
  columnas: string[];
  filas: ExportCell[][];
  fuente: string;
  periodo: string;
  cobertura: string;
  estado: string;
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
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "Municipio";
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

export function buildDemografiaTables(perfil: PerfilDemografico): ExportTable[] {
  const tablas: ExportTable[] = [];
  const refAnio = perfil.total?.anio_referencia ?? null;
  const total = perfil.total?.valor_numerico ?? null;
  const hombres = perfil.hombres?.valor_numerico ?? null;
  const mujeres = perfil.mujeres?.valor_numerico ?? null;
  if (isRealValue(total)) {
    tablas.push({
      id: "poblacion-actual", titulo: "Población por sexo (año de referencia)", hoja: "Poblacion_actual",
      columnas: ["Concepto", "Personas", "% sobre total"],
      filas: [
        [cell("Total"), cell(fmtES(total), total), cell("—")],
        [cell("Hombres"), cell(fmtES(hombres), hombres), cell(isRealValue(hombres) ? `${fmtES(Math.round((hombres / total) * 1000) / 10, 1)} %` : "ND")],
        [cell("Mujeres"), cell(fmtES(mujeres), mujeres), cell(isRealValue(mujeres) ? `${fmtES(Math.round((mujeres / total) * 1000) / 10, 1)} %` : "ND")],
      ],
      fuente: fuenteDe(perfil.total) || "INE",
      periodo: refAnio ? String(refAnio) : "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado",
    });
  }
  if (perfil.evolucion.some((v) => isRealValue(v.valor_numerico))) {
    const anios = [...new Set(perfil.evolucion.map((v) => v.anio_referencia ?? 0).filter((a) => a > 0))].sort((a, b) => a - b);
    tablas.push({
      id: "evolucion", titulo: "Evolución anual de la población", hoja: "Evolucion",
      columnas: ["Año", "Municipio"],
      filas: anios.map((a) => {
        const v = perfil.evolucion.find((x) => x.anio_referencia === a)?.valor_numerico ?? null;
        return [cell(String(a), a), cell(fmtES(v), v)];
      }),
      fuente: fuenteDe(perfil.evolucion[0]) || "INE",
      periodo: anios.length > 0 ? `${anios[0]}–${anios[anios.length - 1]}` : "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado",
    });
    for (const [amb, lista] of [["Provincia", perfil.comparativas.provincia], ["CCAA", perfil.comparativas.ccaa], ["España", perfil.comparativas.espana]] as const) {
      if (lista.some((v) => isRealValue(v.valor_numerico))) {
        const ys = [...new Set(lista.map((v) => v.anio_referencia ?? 0).filter((a) => a > 0))].sort((a, b) => a - b);
        tablas.push({
          id: `comparativa-${amb.toLowerCase()}`, titulo: `Serie comparativa (${amb})`, hoja: `Comparativa_${amb}`,
          columnas: ["Año", amb],
          filas: ys.map((a) => {
            const v = lista.find((x) => x.anio_referencia === a)?.valor_numerico ?? null;
            return [cell(String(a), a), cell(fmtES(v), v)];
          }),
          fuente: fuenteDe(lista[0]) || "INE",
          periodo: ys.length > 0 ? `${ys[0]}–${ys[ys.length - 1]}` : "—",
          cobertura: amb,
          estado: "Consolidado (atención al rezago: CCAA/España pueden terminar en 2021)",
        });
      }
    }
  }
  if (perfil.piramide.grupos.length > 0 && perfil.piramide.anio !== null) {
    const suma = perfil.piramide.grupos.reduce((a, g) => a + g.hombres + g.mujeres, 0);
    tablas.push({
      id: "piramide", titulo: `Estructura por edad y sexo (${perfil.piramide.anio})`, hoja: "Piramide",
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
    });
  }
  const d = perfil.derivados;
  const derivados: ExportCell[][] = [];
  if (isRealValue(d.cambio_5y)) derivados.push([cell("Variación 5 años (%)"), cell(fmtES(d.cambio_5y, 1), d.cambio_5y)]);
  if (isRealValue(d.cambio_10y)) derivados.push([cell("Variación 10 años (%)"), cell(fmtES(d.cambio_10y, 1), d.cambio_10y)]);
  if (isRealValue(d.indice_envejecimiento)) derivados.push([cell("Índice de envejecimiento (65+/0-14×100)"), cell(fmtES(d.indice_envejecimiento, 1), d.indice_envejecimiento)]);
  if (isRealValue(d.indice_dependencia)) derivados.push([cell("Índice de dependencia ((0-14+65+)/15-64×100)"), cell(fmtES(d.indice_dependencia, 1), d.indice_dependencia)]);
  if (derivados.length > 0) {
    tablas.push({
      id: "derivados", titulo: "Indicadores derivados (cálculo propio sobre serie oficial)", hoja: "Derivados",
      columnas: ["Indicador", "Valor (%)"], filas: derivados,
      fuente: "Cálculo propio sobre serie oficial INE",
      periodo: refAnio ? String(refAnio) : "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Derivado con definición explícita",
    });
  }
  return tablas;
}

// ---------- Economía ----------

export function buildEconomiaTables(perfil: PerfilEconomico): ExportTable[] {
  const tablas: ExportTable[] = [];
  const { valores } = perfil;

  const rentaSlugs = ["irpf_declaraciones", "irpf_renta_bruta_media", "irpf_renta_disponible_media", "renta_neta_media_persona", "renta_neta_media_hogar", "renta_bruta_media_hogar"] as const;
  const rentaAnios = [...new Set(rentaSlugs.flatMap((s) => serie(valores, s).map((p) => p.anio)))].sort((a, b) => a - b);
  const rentaVal = (slug: string, anio: number): number | null => {
    const v = valores.find((x) => slugOf(x) === slug && x.anio_referencia === anio && isRealValue(x.valor_numerico) && (x.dimensiones?.ambito ?? "municipio") === "municipio");
    return v?.valor_numerico ?? null;
  };
  const rentaCols = [
    { slug: "irpf_declaraciones", label: "Declaraciones" },
    { slug: "irpf_renta_bruta_media", label: "Bruta media/decl. (€)" },
    { slug: "irpf_renta_disponible_media", label: "Disponible media/decl. (€)" },
    { slug: "renta_neta_media_persona", label: "Neta/hab. (€)" },
    { slug: "renta_neta_media_hogar", label: "Neta/hogar (€)" },
    { slug: "renta_bruta_media_hogar", label: "Bruta/hogar (€)" },
  ].filter((c) => rentaAnios.some((a) => rentaVal(c.slug, a) !== null));
  if (rentaAnios.length > 0 && rentaCols.length > 0) {
    const primero = valores.find((x) => slugOf(x) === rentaCols[0].slug);
    tablas.push({
      id: "renta", titulo: "Renta anual (AEAT por declaración y ADRH por persona/hogar, sin mezclar)", hoja: "Renta",
      columnas: ["Año", ...rentaCols.map((c) => c.label)],
      filas: rentaAnios.map((a) => [cell(String(a), a), ...rentaCols.map((c) => { const v = rentaVal(c.slug, a); return cell(fmtES(v), v); })]),
      fuente: [fuenteDe(primero), "AEAT EDM + INE ADRH"].filter(Boolean).join(" · ") || "AEAT · INE ADRH",
      periodo: `${rentaAnios[0]}–${rentaAnios[rentaAnios.length - 1]}`,
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado (AEAT = por declaración; ADRH = por persona/hogar)",
    });
  }
  for (const [slug, titulo] of [["gini", "Índice de Gini (0–100)"], ["p80_p20", "Ratio P80/P20"]] as const) {
    const s = serie(valores, slug);
    if (s.length > 0) {
      tablas.push({
        id: slug, titulo, hoja: slug === "gini" ? "Gini" : "P80_P20",
        columnas: ["Año", "Valor"],
        filas: s.map((p) => [cell(String(p.anio), p.anio), cell(fmtES(p.valor, 1), p.valor)]),
        fuente: fuenteDe(ultimo(valores, slug)) || "INE · ADRH",
        periodo: `${s[0].anio}–${s[s.length - 1].anio}`,
        cobertura: `Municipio ${perfil.municipio.nombre} (desigualdad: ≥100 residentes)`,
        estado: "Consolidado",
      });
    }
  }
  const empTotal = ultimo(valores, "empresas_total");
  if (isRealValue(empTotal?.valor_numerico)) {
    const f = (slug: string) => ultimo(valores, slug)?.valor_numerico ?? null;
    const rows: ExportCell[][] = [[cell("Total de empresas"), cell(fmtES(f("empresas_total")), f("empresas_total"))]];
    const det: [string, string][] = [["Industria", "empresas_industria"], ["Construcción", "empresas_construccion"], ["Comercio, transporte y hostelería", "empresas_comercio_hosteleria"], ["Servicios", "empresas_servicios"]];
    for (const [label, slug] of det) {
      const v = f(slug);
      if (v !== null) rows.push([cell(label), cell(fmtES(v), v)]);
    }
    tablas.push({
      id: "empresas", titulo: "Tejido empresarial (DIRCE, sede en el municipio)", hoja: "Empresas",
      columnas: ["Concepto", "Empresas"], filas: rows,
      fuente: fuenteDe(empTotal) || "INE · DIRCE",
      periodo: empTotal?.anio_referencia ? String(empTotal.anio_referencia) : "—",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado (empresas ≠ ocupados)",
    });
  }
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
      id: "agrario", titulo: "Estructura agraria (Censo Agrario 2020, estructural)", hoja: "Agrario",
      columnas: ["Concepto", "Valor"], filas: rows,
      fuente: fuenteDe(agrSau ?? agrExp) || "INE · Censo Agrario 2020",
      periodo: "2020 (estructural, no anual)",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado estructural",
    });
  }
  const especies: [string, string, string][] = [["Bovino", "gan_bovino_exp", "gan_bovino_cab"], ["Ovino y caprino", "gan_ovino_caprino_exp", "gan_ovino_caprino_cab"], ["Porcino", "gan_porcino_exp", "gan_porcino_cab"], ["Aves de corral", "gan_aves_exp", "gan_aves_cab"]];
  const ganRows = especies
    .map(([nombre, eSlug, cSlug]) => {
      const e = ultimo(valores, eSlug)?.valor_numerico ?? null;
      const c = ultimo(valores, cSlug)?.valor_numerico ?? null;
      return (e !== null || c !== null) ? [cell(nombre), cell(e === null ? "ND" : fmtES(e), e), cell(c === null ? "ND" : fmtES(c), c)] : null;
    })
    .filter((r): r is ExportCell[][][number] => r !== null);
  const ug = ultimo(valores, "gan_ug_total");
  if (ganRows.length > 0 || isRealValue(ug?.valor_numerico)) {
    const filas: ExportCell[][] = [];
    if (isRealValue(ug?.valor_numerico)) filas.push([cell("Unidades ganaderas totales"), cell(fmtES(ug?.valor_numerico ?? null), ug?.valor_numerico ?? null), cell("")]);
    filas.push(...ganRows);
    tablas.push({
      id: "ganaderia", titulo: "Ganadería (Censo Agrario 2020; ND = secreto, nunca 0)", hoja: "Ganaderia",
      columnas: ["Especie", "Explotaciones", "Cabezas"], filas,
      fuente: fuenteDe(ug) || "INE · Censo Agrario 2020",
      periodo: "2020 (estructural, no anual)",
      cobertura: `Municipio ${perfil.municipio.nombre}`,
      estado: "Consolidado estructural con secreto estadístico",
    });
  }
  return tablas;
}

export interface TraceabilitySheet {
  municipio: string; codigoINE: string; bloque: string;
  fechaGeneracion: string; tablas: ExportTable[]; excluidas: { titulo: string; motivo: string }[];
}

export interface Exclusion { titulo: string; motivo: string }

/** Exclusiones documentadas de Demografía (fuente única para página y libro XLSX). */
export function demografiaExcluidas(): Exclusion[] {
  return [
    { titulo: "Densidad de población", motivo: "Pendiente de integración de fuente de superficie." },
    { titulo: "Población extranjera y saldo migratorio", motivo: "Sin cobertura municipal verificada en Tempus3." },
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
