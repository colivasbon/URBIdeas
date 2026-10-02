// INCideas — Libro municipal por municipio.
//
// Sustituye al export anterior, que reproducía la fila de la base de datos con el
// identificador interno como primera columna. Este libro construye una ficha.
//
// Estructura (una hoja por cada elemento):
//   00_PORTADA        identificación, índice de hojas, aviso legal y código de colores
//   01_RESUMEN        recuentos, indicadores por mil habitantes y semáforo
//   02..11            una hoja por cada una de las diez categorías del inventario
//   12_CARENCIAS      qué no se ha podido obtener y a quién hay que pedirlo
//   13_FUENTES        cada conjunto de datos con enlace, licencia, fecha y versión
//   14_METODOLOGIA    criterio, conversiones, sistemas de referencia y limitaciones
//   15_CALIDAD        control de calidad con cifras comprobables
//   _ID_TECNICO       hoja oculta con los identificadores internos
//
// El estilo (paleta, tipografía, anchos, hipervínculos con lista blanca de
// dominios, pie de página) es el de los libros de SOCideas, para no mantener dos
// estilos distintos en el mismo producto.

import ExcelJS from "exceljs";
import {
  CATEGORIAS_INVENTARIO,
  ESTADOS_ESPACIALES_LEGIBLES,
  PRECISION_LEGIBLE,
  ESTADOS_LEGIBLES,
  estadoEspacialLegible,
  precisionLegible,
  tipoLegible,
  titularidadLegible,
} from "./catalogo";
import {
  CAMPOS_CLAVE,
  construirCarencias,
  familiaLegibleDeCategoria,
  nombreUtilizable,
  porcentaje,
  punctuacionConfianza,
  resumenMunicipio,
  type Carencia,
  type FilaResumen,
  type ResumenMunicipio,
} from "./calidad";
import { latLngToUtm } from "./pipeline/utm";
import { esSoloUnaCifra } from "./correcciones";
import { construirCsvCabeceras, geometriaAWKT, esAllowedSourceUrl } from "./formato-abierto";

// ---------------------------------------------------------------------------
// Paleta y tipografía. Idénticas a las del libro de SOCideas.
// ---------------------------------------------------------------------------
const MUSGO = "FF3E665C";
const CONIFERA = "FF86B73D";
const HUESO = "FFF1F1F1";
const CARBON = "FF3C403E";
const LIMO = "FFB0BDB0";
const CRISOPA = "FFC2E189";
const RUPESTRE = "FF643335";
const RETAMA = "FFFBE122";
const FUENTE = "Poppins";
const ETIQUETA_ENLACE = "Ver fuente ↗";

/** Anchos: se calculan del contenido con estos topes. */
const MAX_ANCHO = 42;
const MIN_ANCHO = 10;
const MIN_ANCHO_A = 30;

function anchoNatural(texto: string): number {
  const lineas = String(texto ?? "").split("\n");
  const masLarga = lineas.reduce((m, l) => Math.max(m, l.length), 0);
  return Math.round(masLarga * 1.2 + 2);
}

function anchoAjustado(n: number): number {
  return Math.max(MIN_ANCHO, Math.min(MAX_ANCHO, n));
}

// ---------------------------------------------------------------------------
// Modelo de entrada: el registro ya leído y normalizado para el libro.
// ---------------------------------------------------------------------------

export interface FilaLibro {
  id_tecnico: string;
  codigo_ine: string;
  municipio: string;
  provincia: string;
  comunidad_autonoma: string;
  comarca: string;
  categoria: string;
  categoria_nombre: string;
  subcategoria: string | null;
  tipo: string;
  nombre: string;
  nombre_original: string | null;
  /** `por revisar` cuando el nombre no se ha podido recuperar. */
  estado_nombre: "correcto" | "recuperado" | "por_registrar" | "por_revisar";
  direccion: string | null;
  codigo_postal: string | null;
  nucleo: string | null;
  lat: number | null;
  lng: number | null;
  utm_x: number | null;
  utm_y: number | null;
  utm_huso: number | null;
  crs_origen: string;
  precision: string;
  telefono: string | null;
  web: string | null;
  horario: string | null;
  titularidad: string;
  operador: string | null;
  capacidad: number | null;
  unidad_capacidad: string | null;
  enlace_origen: string | null;
  enlace_fuente: string | null;
  fuente: string;
  licencia: string;
  fecha_obtencion: string | null;
  fecha_edicion_origen: string | null;
  estado_validacion: string;
  estado_espacial: string;
  confianza: number;
  distancia_limite_m: number | null;
  geometria_wkt: string;
  advertencias: string | null;
}

export interface FuenteLibro {
  nombre: string;
  organismo: string;
  tipo: string;
  licencia: string;
  url: string;
  cobertura: string;
  periodicidad: string;
  fecha_ultima_consulta: string | null;
  version_esquema: string | null;
  registros_en_libro: number;
  limitaciones: string | null;
}

export interface EntradaLibro {
  codigo_ine: string;
  municipio: string;
  provincia: string;
  comunidad_autonoma: string;
  comarca: string;
  poblacion: number | null;
  superficie_km2: number | null;
  anio_poblacion: number | null;
  generado_en: string;
  filas: FilaLibro[];
  fuentes: FuenteLibro[];
}

// ---------------------------------------------------------------------------
// Enriquecido: cálculo de UTM, precisión, confianza y semáforo.
// ---------------------------------------------------------------------------

/** Precisión deducida de cómo se obtuvo el punto. */
export function deducirPrecision(geomTipo: string | null): string {
  if (geomTipo === "punto") return "punto";
  if (geomTipo === "linea" || geomTipo === "poligono") return "centroide_edificio";
  return "sin_ubicacion";
}

export interface OpcionesEnriquecer {
  /** Fecha de referencia para medir la antigüedad. */
  referencia?: string;
}

/** Calcula las columnas derivadas de cada fila. */
export function enriquecerFila(
  fila: FilaLibro,
  tiposFuente: Map<string, string>,
  opciones: OpcionesEnriquecer = {}
): Pick<FilaLibro, "utm_x" | "utm_y" | "utm_huso" | "precision" | "confianza"> {
  let utm_x: number | null = null;
  let utm_y: number | null = null;
  let utm_huso: number | null = null;
  if (fila.lat !== null && fila.lng !== null) {
    const u = latLngToUtm(fila.lat, fila.lng);
    utm_x = Math.round(u.x * 100) / 100;
    utm_y = Math.round(u.y * 100) / 100;
    utm_huso = u.huso;
  }
  // La precisión la fija el cargador a partir de cómo se obtuvo el punto; si no
  // consta, se cae en la categoría más baja en lugar de inventar precisión.
  const precision = fila.precision || "sin_ubicacion";

  let conValor = 0;
  for (const campo of CAMPOS_CLAVE) {
    const v = (fila as unknown as Record<string, unknown>)[campo];
    if (v !== undefined && v !== null && v !== "") conValor++;
  }

  const { total } = punctuacionConfianza({
    tipo_fuente: tiposFuente.get(fila.fuente) ?? null,
    fecha_dato: fila.fecha_edicion_origen ?? fila.fecha_obtencion,
    referencia: opciones.referencia,
    campos_con_valor: conValor,
    estado_espacial: fila.estado_espacial,
    exige_coordenadas: true,
  });

  return { utm_x, utm_y, utm_huso, precision, confianza: total };
}

// ---------------------------------------------------------------------------
// Columnas del inventario.
// La última es el identificador técnico, que no es dato principal.
// ---------------------------------------------------------------------------

interface Columna {
  clave: string;
  cabecera: string;
  /** `texto` siempre, `numero` con separador de millares, `decimal` con 6 decimales. */
  tipo: "texto" | "numero" | "decimal" | "entero";
}

export const COLUMNAS_INVENTARIO: Columna[] = [
  { clave: "nombre", cabecera: "Nombre oficial", tipo: "texto" },
  { clave: "tipo", cabecera: "Tipo", tipo: "texto" },
  { clave: "direccion", cabecera: "Dirección", tipo: "texto" },
  { clave: "codigo_postal", cabecera: "C. postal", tipo: "texto" },
  { clave: "nucleo", cabecera: "Núcleo", tipo: "texto" },
  { clave: "municipio", cabecera: "Municipio", tipo: "texto" },
  { clave: "provincia", cabecera: "Provincia", tipo: "texto" },
  { clave: "comunidad_autonoma", cabecera: "Comunidad autónoma", tipo: "texto" },
  { clave: "lat", cabecera: "Latitud (WGS84)", tipo: "decimal" },
  { clave: "lng", cabecera: "Longitud (WGS84)", tipo: "decimal" },
  { clave: "utm_x", cabecera: "X UTM", tipo: "decimal" },
  { clave: "utm_y", cabecera: "Y UTM", tipo: "decimal" },
  { clave: "utm_huso", cabecera: "Huso", tipo: "entero" },
  { clave: "precision", cabecera: "Precisión", tipo: "texto" },
  { clave: "telefono", cabecera: "Teléfono", tipo: "texto" },
  { clave: "web", cabecera: "Web", tipo: "texto" },
  { clave: "horario", cabecera: "Horario", tipo: "texto" },
  { clave: "titularidad", cabecera: "Titularidad", tipo: "texto" },
  { clave: "operador", cabecera: "Operador o gestor", tipo: "texto" },
  { clave: "capacidad", cabecera: "Capacidad", tipo: "entero" },
  { clave: "enlace_origen", cabecera: "Enlace al objeto", tipo: "texto" },
  { clave: "fuente", cabecera: "Fuente", tipo: "texto" },
  { clave: "licencia", cabecera: "Licencia", tipo: "texto" },
  { clave: "crs_origen", cabecera: "CRS de origen", tipo: "texto" },
  { clave: "fecha_obtencion", cabecera: "Fecha de obtención", tipo: "texto" },
  { clave: "fecha_edicion_origen", cabecera: "Última edición en origen", tipo: "texto" },
  { clave: "estado_validacion", cabecera: "Estado de validación", tipo: "texto" },
  { clave: "confianza", cabecera: "Confianza", tipo: "entero" },
  { clave: "estado_espacial", cabecera: "Situación en el término", tipo: "texto" },
  { clave: "advertencias", cabecera: "Advertencias", tipo: "texto" },
  { clave: "id_tecnico", cabecera: "ID técnico", tipo: "texto" },
];

// ---------------------------------------------------------------------------
// Utilidades de celda.
// ---------------------------------------------------------------------------

function valorCelda(f: FilaLibro, clave: string): string | number | null {
  const v = (f as unknown as Record<string, unknown>)[clave];
  if (v === null || v === undefined || v === "") return null;
  return v as string | number;
}

function numFmt(columna: Columna): string {
  if (columna.tipo === "entero") return "0";
  if (columna.tipo === "numero") return "#,##0";
  if (columna.tipo === "decimal") return "0.000000";
  return "@";
}

/** Un enlace activo solo si la dirección es https y el dominio está autorizado. */
function celdaEnlace(texto: string, url: string | null): ExcelJS.CellValue {
  if (url && esAllowedSourceUrl(url)) {
    return { text: `${ETIQUETA_ENLACE} · ${texto}`, hyperlink: url, tooltip: url };
  }
  return texto;
}

// ---------------------------------------------------------------------------
// Pintado de hoja.
// ---------------------------------------------------------------------------

function bandaFila(fila: ExcelJS.Row, nCols: number, color: string): void {
  for (let c = 1; c <= nCols; c++) {
    fila.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }
}

function bordeFino(): Partial<ExcelJS.Borders> {
  const b = { style: "thin" as const, color: { argb: LIMO } };
  return { top: b, left: b, bottom: b, right: b };
}

function pintarTitulo(hoja: ExcelJS.Worksheet, fila: number, texto: string, nCols: number): void {
  hoja.mergeCells(fila, 1, fila, nCols);
  const celda = hoja.getCell(fila, 1);
  celda.value = texto;
  celda.font = { name: FUENTE, size: 14, bold: true, color: { argb: HUESO } };
  celda.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
  const r = hoja.getRow(fila);
  r.height = 26;
  bandaFila(r, nCols, MUSGO);
  for (let c = 1; c <= nCols; c++) {
    r.getCell(c).border = { bottom: { style: "thin", color: { argb: CONIFERA } } };
  }
}

function pintarSubtitulo(
  hoja: ExcelJS.Worksheet,
  fila: number,
  texto: string,
  nCols: number,
  color = MUSGO,
  tamano = 12
): void {
  hoja.mergeCells(fila, 1, fila, nCols);
  const celda = hoja.getCell(fila, 1);
  celda.value = texto;
  celda.font = { name: FUENTE, size: tamano, bold: true, color: { argb: HUESO } };
  celda.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
  const r = hoja.getRow(fila);
  r.height = 22;
  bandaFila(r, nCols, color);
  for (let c = 1; c <= nCols; c++) {
    r.getCell(c).border = { bottom: { style: "thin", color: { argb: CONIFERA } } };
  }
}

function pintarCabecera(hoja: ExcelJS.Worksheet, fila: number, textos: string[]): void {
  textos.forEach((t, i) => {
    const c = hoja.getCell(fila, i + 1);
    c.value = t;
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: CARBON } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CRISOPA } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    c.border = bordeFino();
  });
  hoja.getRow(fila).height = 20;
}

function pintarNota(hoja: ExcelJS.Worksheet, fila: number, texto: string, nCols: number): void {
  hoja.mergeCells(fila, 1, fila, nCols);
  const c = hoja.getCell(fila, 1);
  c.value = texto;
  c.font = { name: FUENTE, size: 10, italic: true, color: { argb: CARBON } };
  c.alignment = { vertical: "top", wrapText: true, indent: 1 };
  c.border = bordeFino();
  const r = hoja.getRow(fila);
  bandaFila(r, nCols, HUESO);
  r.height = Math.max(18, 16 * Math.ceil(texto.length / 110));
}

function anchosDesdeDatos(columnas: Columna[], filas: FilaLibro[]): number[] {
  const anchos = columnas.map((c) =>
    Math.max(anchoNatural(c.cabecera), anchoAjustado(anchoNatural(c.cabecera)))
  );
  for (const f of filas.slice(0, 400)) {
    for (const c of columnas) {
      const v = valorCelda(f, c.clave);
      if (v === null) continue;
      const n = anchoAjustado(anchoNatural(String(v)));
      if (n > anchos[columnas.indexOf(c)]) anchos[columnas.indexOf(c)] = n;
    }
  }
  anchos[0] = Math.max(MIN_ANCHO_A, anchos[0]);
  return anchos;
}

function configurarHoja(hoja: ExcelJS.Worksheet, titulo: string): void {
  hoja.properties.tabColor = { argb: MUSGO };
  hoja.views = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: 1,
      showGridLines: false,
      showRuler: false,
      activeCell: "A2",
    },
  ];
  hoja.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
    showGridLines: false,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.25 },
  };
  hoja.headerFooter = {
    oddFooter: `&L INCideas · ${titulo} &C Inventario municipal de emergencias &R &P/&N`,
  };
}

// ---------------------------------------------------------------------------
// Hoja de portada.
// ---------------------------------------------------------------------------

function construirPortada(wb: ExcelJS.Workbook, e: EntradaLibro): void {
  const hoja = wb.addWorksheet("00_PORTADA");
  const NC = 6;
  configurarHoja(hoja, e.municipio);
  for (let c = 1; c <= NC; c++) hoja.getColumn(c).width = c === 1 ? 34 : 26;

  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} (${e.codigo_ine})`, NC);
  pintarSubtitulo(hoja, 2, "Inventario municipal para la planificación y gestión de emergencias", NC, CONIFERA, 11);
  // El subtítulo va sobre conífera, así que el texto va en carbón y no en hueso.
  {
    const r2 = hoja.getRow(2);
    for (let c = 1; c <= NC; c++) {
      r2.getCell(c).font = { name: FUENTE, size: 11, bold: true, color: { argb: CARBON } };
    }
  }

  let f = 4;
  const clave = (k: string, v: string | number | null) => {
    const a = hoja.getCell(f, 1);
    a.value = k;
    a.font = { name: FUENTE, size: 10, bold: true, color: { argb: CARBON } };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CRISOPA } };
    a.border = bordeFino();
    a.alignment = { vertical: "top", wrapText: true, indent: 1 };
    hoja.mergeCells(f, 2, f, NC);
    const b = hoja.getCell(f, 2);
    b.value = v ?? "—";
    b.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    b.border = bordeFino();
    b.alignment = { vertical: "top", wrapText: true, indent: 1 };
    hoja.getRow(f).height = 18;
    f++;
  };

  clave("Municipio", e.municipio);
  clave("Código INE", e.codigo_ine);
  clave("Provincia", e.provincia);
  clave("Comunidad autónoma", e.comunidad_autonoma);
  clave("Comarca", e.comarca || "—");
  clave(
    "Población empadronada",
    e.poblacion !== null ? `${e.poblacion.toLocaleString("es-ES")} habitantes (${e.anio_poblacion ?? "s. f."})` : "—"
  );
  clave(
    "Superficie",
    e.superficie_km2 !== null ? `${e.superficie_km2.toLocaleString("es-ES", { maximumFractionDigits: 2 })} km²` : "—"
  );
  clave("Fecha de generación", e.generado_en);
  clave("Registros en el libro", e.filas.length);
  // Se cuentan las categorías que tienen al menos un registro, no las que están
  // vacías: el número que interesa es cuántas partes del inventario hay llenas.
  const categoriasConDatos = new Set(e.filas.map((x) => x.categoria)).size;
  clave(
    "Categorías del inventario con datos",
    `${categoriasConDatos} de ${CATEGORIAS_INVENTARIO.length}`
  );

  f++;
  pintarSubtitulo(hoja, f, "Índice de hojas", NC, MUSGO, 12);
  f++;
  pintarCabecera(hoja, f, ["Hoja", "Contenido", "Registros", "Estado"]);
  f++;
  const inicioIndice = f;

  const resumen = construirResumen(e);
  const hojasResumen = [
    { id: "01_RESUMEN", titulo: "Resumen, indicadores y semáforo de completitud", n: e.filas.length },
  ];
  const hojasCategoria = CATEGORIAS_INVENTARIO.map((c) => {
    const n = e.filas.filter((x) => x.categoria === c).length;
    return { id: hojaCategoria(c), titulo: nombreCategoria(c), n, categoria: c };
  });
  const hojasFinales = [
    { id: "12_CARENCIAS", titulo: "Qué falta y a quién hay que pedirlo", n: resumen.carencias.length },
    { id: "13_FUENTES", titulo: "Conjuntos de datos, licencias y enlaces", n: e.fuentes.length },
    { id: "14_METODOLOGIA", titulo: "Criterio, conversiones y limitaciones", n: 0 },
    { id: "15_CALIDAD", titulo: "Control de calidad", n: 0 },
    { id: "_ID_TECNICO", titulo: "Identificadores técnicos (hoja oculta)", n: e.filas.length },
  ];

  const todas = [...hojasResumen, ...hojasCategoria, ...hojasFinales];
  for (const h of todas) {
    const fila = hoja.getRow(f);
    const c1 = fila.getCell(1);
    c1.value = { text: h.id, hyperlink: `#'${h.id}'!A1`, tooltip: `Ir a ${h.titulo}` };
    c1.font = { name: FUENTE, size: 10, bold: true, underline: true, color: { argb: CONIFERA } };
    c1.alignment = { vertical: "top", wrapText: true, indent: 1 };
    c1.border = bordeFino();
    const c2 = fila.getCell(2);
    c2.value = h.titulo;
    c2.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    c2.alignment = { vertical: "top", wrapText: true, indent: 1 };
    c2.border = bordeFino();
    hoja.mergeCells(f, 2, f, 3);
    const c3 = fila.getCell(4);
    c3.value = h.n;
    c3.numFmt = "#,##0";
    c3.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    c3.alignment = { vertical: "top", horizontal: "right" };
    c3.border = bordeFino();
    const cat = (h as { categoria?: string }).categoria;
    const c4 = fila.getCell(5);
    if (cat) {
      const s = resumen.resumen.semaforo[cat];
      c4.value =
        s === "verde" ? "Completa" : s === "ambar" ? "Incompleta" : "Sin datos";
      c4.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: s === "verde" ? CRISOPA : s === "ambar" ? RETAMA : RUPESTRE },
      };
      c4.font = {
        name: FUENTE,
        size: 10,
        bold: true,
        color: { argb: s === "rojo" ? HUESO : CARBON },
      };
    } else {
      c4.value = h.id === "12_CARENCIAS" ? "Acción requerida" : "—";
      c4.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HUESO } };
      c4.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    }
    c4.alignment = { vertical: "top", horizontal: "center", wrapText: true };
    c4.border = bordeFino();
    hoja.mergeCells(f, 5, f, 6);
    fila.height = 18;
    f++;
  }
  void inicioIndice;

  f++;
  pintarSubtitulo(hoja, f, "Qué significan los colores", NC, MUSGO, 12);
  f++;
  pintarCabecera(hoja, f, ["Color", "Significado", "Color", "Significado"]);
  f++;
  const colores: [string, string, string, string][] = [
    [CRISOPA, "Completo: la categoría tiene datos y al menos el 70 % con coordenadas", RETAMA, "Incompleto: hay datos pero el inventario está incompleto"],
    [RUPESTRE, "Sin datos: la categoría no tiene ningún registro", HUESO, "Texto normal del libro"],
  ];
  for (const [c1, t1, c2, t2] of colores) {
    const fila = hoja.getRow(f);
    const a = fila.getCell(1);
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c1 } };
    a.border = bordeFino();
    const b = fila.getCell(2);
    b.value = t1;
    b.font = { name: FUENTE, size: 10, color: { argb: c1 === RUPESTRE ? HUESO : CARBON } };
    b.alignment = { vertical: "top", wrapText: true, indent: 1 };
    b.border = bordeFino();
    hoja.mergeCells(f, 2, f, 3);
    const d = fila.getCell(4);
    d.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c2 } };
    d.border = bordeFino();
    const g = fila.getCell(5);
    g.value = t2;
    g.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    g.alignment = { vertical: "top", wrapText: true, indent: 1 };
    g.border = bordeFino();
    hoja.mergeCells(f, 5, f, 6);
    fila.height = 30;
    f++;
  }

  f++;
  pintarSubtitulo(hoja, f, "Aviso legal y alcance", NC, MUSGO, 12);
  f++;
  const avisos = [
    "INCideas es un sistema de información para la planificación y la gestión de emergencias municipales. No genera planes de emergencia ni toma decisiones operativas.",
    "Los datos de OpenStreetMap son colaborativos y no constituyen fuente oficial. Se publican bajo la licencia ODbL 1.0 y requieren atribución.",
    "La ausencia de un dato en este libro no significa que el elemento no exista: significa que no se ha podido obtener de ninguna fuente abierta verificada. Las carencias recogidas en la hoja 12 indican qué falta y a quién hay que pedirlo.",
    "Cada registro conserva su fuente, su fecha de obtención y su estado de validación. Un registro con estado «Automático, sin revisar» procede de carga automática y no ha sido contrastado con el municipio.",
    "Las coordenadas se ofrecen en WGS84 (grados) y en ETRS89 UTM (metros). La precisión de cada punto se indica en la columna correspondiente: un punto verificado no es lo mismo que un centroide.",
  ];
  for (const a of avisos) {
    pintarNota(hoja, f, `· ${a}`, NC);
    f++;
  }
}

// ---------------------------------------------------------------------------
// Hoja de resumen.
// ---------------------------------------------------------------------------

function nombreCategoria(c: string): string {
  const n: Record<string, string> = {
    territorio: "Territorio y núcleos de población",
    poblacion: "Población",
    necesidades_especiales: "Necesidades especiales",
    animales: "Animales",
    infraestructuras: "Infraestructuras y movilidad",
    equipamientos: "Equipamientos y servicios",
    servicios_basicos: "Servicios básicos",
    riesgos: "Riesgos",
    medios_recursos: "Medios y recursos",
    evacuacion: "Evacuación y albergue",
  };
  return n[c] ?? c;
}

function hojaCategoria(c: string): string {
  const i = CATEGORIAS_INVENTARIO.indexOf(c as never);
  return `${String(i + 2).padStart(2, "0")}_${c.toUpperCase()}`;
}

export interface ResumenLibro {
  resumen: ResumenMunicipio;
  carencias: Carencia[];
  porCategoria: Map<string, FilaLibro[]>;
}

function construirResumen(e: EntradaLibro): ResumenLibro {
  const porCategoria = new Map<string, FilaLibro[]>();
  for (const c of CATEGORIAS_INVENTARIO) porCategoria.set(c, []);
  for (const f of e.filas) porCategoria.get(f.categoria)?.push(f);

  const filasResumen: FilaResumen[] = [];
  for (const c of CATEGORIAS_INVENTARIO) {
    const propias = porCategoria.get(c) ?? [];
    const porSub = new Map<string, FilaLibro[]>();
    for (const f of propias) {
      const k = f.subcategoria ?? "otros";
      porSub.set(k, [...(porSub.get(k) ?? []), f]);
    }
    for (const [sub, grupo] of porSub) {
      filasResumen.push({
        categoria: c,
        subcategoria: sub,
        tipo: tipoLegible(sub),
        familia: familiaLegibleDeCategoria(c),
        registros: grupo.length,
        con_coordenadas: grupo.filter((f) => f.lat !== null).length,
        con_nombre_util: grupo.filter((f) => nombreUtilizable(f.nombre)).length,
        con_telefono: grupo.filter((f) => !!f.telefono).length,
        con_horario: grupo.filter((f) => !!f.horario).length,
        con_capacidad: grupo.filter((f) => f.capacidad !== null).length,
        confianza_media:
          grupo.length === 0
            ? 0
            : Math.round(grupo.reduce((s, f) => s + f.confianza, 0) / grupo.length),
      });
    }
  }

  const conteoPorCategoria = new Map<string, number>();
  for (const [c, filas] of porCategoria) conteoPorCategoria.set(c, filas.length);
  const carencias = construirCarencias(conteoPorCategoria);

  return { resumen: resumenMunicipio(filasResumen), carencias, porCategoria };
}

function construirHojaResumen(wb: ExcelJS.Workbook, e: EntradaLibro, rl: ResumenLibro): void {
  const hoja = wb.addWorksheet("01_RESUMEN");
  const NC = 9;
  configurarHoja(hoja, e.municipio);
  for (let c = 1; c <= NC; c++) hoja.getColumn(c).width = c === 1 ? 34 : 18;

  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} — Resumen del inventario`, NC);
  pintarSubtitulo(
    hoja,
    2,
    `Municipio: ${e.municipio} (${e.codigo_ine}) · ${e.provincia} · ${e.comunidad_autonoma} · Generado: ${e.generado_en} · Registros: ${e.filas.length.toLocaleString("es-ES")}`,
    NC
  );

  let f = 4;
  pintarSubtitulo(hoja, f, "Indicadores de completitud", NC, MUSGO, 12);
  f++;
  pintarCabecera(hoja, f, ["Indicador", "Valor", "Sobre el total", "Lectura"]);
  f++;
  const r = rl.resumen;
  const pob = e.poblacion && e.poblacion > 0 ? e.poblacion : null;
  const indicadores: [string, string, string, string][] = [
    ["Registros en total", r.total_registros.toLocaleString("es-ES"), "100 %", "Volumen del inventario"],
    ["Con coordenadas", r.con_coordenadas.toLocaleString("es-ES"), `${r.pct_con_coordenadas} %`, "Localizables sobre el terreno"],
    ["Con nombre legible", r.con_nombre_util.toLocaleString("es-ES"), `${r.pct_con_nombre_util} %`, "No son solo un número"],
    ["Con teléfono", r.con_telefono.toLocaleString("es-ES"), `${r.pct_con_telefono} %`, "Contactable directamente"],
    ["Con horario", r.con_horario.toLocaleString("es-ES"), `${r.pct_con_horario} %`, "Información de atención al público"],
    ["Con capacidad", r.con_capacidad.toLocaleString("es-ES"), `${r.pct_con_capacidad} %`, "Aforo o plazas, cuando la fuente lo publica"],
    ["Confianza media", String(r.confianza_media), "sobre 100", "Media ponderada por número de registros"],
  ];
  if (pob) {
    indicadores.push([
      "Registros por mil habitantes",
      (r.total_registros / (pob / 1000)).toLocaleString("es-ES", { maximumFractionDigits: 2 }),
      `${(pob / 1000).toFixed(2)} miles hab.`,
      "Densidad del inventario",
    ]);
  }
  for (const [k, v, p, nota] of indicadores) {
    const fila = hoja.getRow(f);
    fila.getCell(1).value = k;
    fila.getCell(1).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    fila.getCell(1).alignment = { vertical: "top", indent: 1, wrapText: true };
    fila.getCell(2).value = v;
    fila.getCell(2).numFmt = "@";
    fila.getCell(2).font = { name: FUENTE, size: 10, bold: true, color: { argb: CARBON } };
    fila.getCell(2).alignment = { vertical: "top", horizontal: "right" };
    fila.getCell(3).value = p;
    fila.getCell(3).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    fila.getCell(3).alignment = { vertical: "top", horizontal: "center" };
    fila.getCell(4).value = nota;
    fila.getCell(4).font = { name: FUENTE, size: 10, italic: true, color: { argb: CARBON } };
    fila.getCell(4).alignment = { vertical: "top", wrapText: true, indent: 1 };
    hoja.mergeCells(f, 4, f, NC);
    for (let c = 1; c <= NC; c++) fila.getCell(c).border = bordeFino();
    fila.height = 18;
    f++;
  }

  f++;
  pintarSubtitulo(hoja, f, "Recuento por categoría y subcategoría", NC, MUSGO, 12);
  f++;
  pintarCabecera(hoja, f, [
    "Categoría",
    "Tipo",
    "Registros",
    "Con coordenadas",
    "Con nombre legible",
    "Con teléfono",
    "Con horario",
    "Confianza media",
    "Semáforo de la categoría",
  ]);
  f++;
  for (const fila of r.por_categoria) {
    const sem = r.semaforo[fila.categoria] ?? "rojo";
    const v = hoja.getRow(f);
    const celdas: (string | number)[] = [
      nombreCategoria(fila.categoria),
      fila.tipo,
      fila.registros,
      `${fila.con_coordenadas} (${porcentaje(fila.con_coordenadas, fila.registros)} %)`,
      `${fila.con_nombre_util} (${porcentaje(fila.con_nombre_util, fila.registros)} %)`,
      fila.con_telefono,
      fila.con_horario,
      fila.confianza_media,
      sem === "verde" ? "Verde" : sem === "ambar" ? "Ámbar" : "Rojo",
    ];
    celdas.forEach((cv, i) => {
      const c = v.getCell(i + 1);
      c.value = cv;
      c.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      c.border = bordeFino();
      c.alignment = {
        vertical: "top",
        horizontal: i === 0 || i === 1 ? "left" : "center",
        wrapText: true,
        indent: i === 0 || i === 1 ? 1 : undefined,
      };
      if (i === 2 || i === 5 || i === 6 || i === 7) c.numFmt = "#,##0";
    });
    const colorSem = sem === "verde" ? CRISOPA : sem === "ambar" ? RETAMA : RUPESTRE;
    v.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorSem } };
    v.getCell(9).font = {
      name: FUENTE,
      size: 10,
      bold: true,
      color: { argb: sem === "rojo" ? HUESO : CARBON },
    };
    v.height = 18;
    f++;
  }

  f++;
  pintarSubtitulo(hoja, f, "Categorías del inventario sin ningún dato", NC, MUSGO, 12);
  f++;
  if (r.categorias_vacias.length === 0) {
    pintarNota(hoja, f, "Todas las categorías del inventario tienen al menos un registro.", NC);
  } else {
    pintarCabecera(hoja, f, ["Categoría", "Qué falta", "A quién hay que pedirlo"]);
    f++;
    for (const c of r.categorias_vacias) {
      const v = hoja.getRow(f);
      v.getCell(1).value = nombreCategoria(c);
      v.getCell(1).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      v.getCell(1).alignment = { vertical: "top", wrapText: true, indent: 1 };
      v.getCell(2).value =
        "No se ha obtenido ningún registro. Véase la hoja 12_CARENCIAS, que indica el motivo y la acción.";
      v.getCell(2).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      v.getCell(2).alignment = { vertical: "top", wrapText: true, indent: 1 };
      hoja.mergeCells(f, 2, f, 5);
      v.getCell(6).value = rl.carencias.find((x) => x.categoria === c)?.responsable ?? "Ayuntamiento";
      v.getCell(6).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      v.getCell(6).alignment = { vertical: "top", wrapText: true, indent: 1 };
      hoja.mergeCells(f, 6, f, NC);
      for (let c = 1; c <= NC; c++) v.getCell(c).border = bordeFino();
      v.height = 30;
      f++;
    }
  }
}

// ---------------------------------------------------------------------------
// Hoja por categoría.
// ---------------------------------------------------------------------------

function construirHojaCategoria(
  wb: ExcelJS.Workbook,
  e: EntradaLibro,
  categoria: string,
  filas: FilaLibro[],
  semaforo: "verde" | "ambar" | "rojo"
): void {
  const id = hojaCategoria(categoria);
  const hoja = wb.addWorksheet(id);
  const NC = COLUMNAS_INVENTARIO.length;
  configurarHoja(hoja, e.municipio);

  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} — ${nombreCategoria(categoria)}`, NC);
  pintarSubtitulo(
    hoja,
    2,
    `Municipio: ${e.municipio} (${e.codigo_ine}) · ${filas.length} registro(s) · Generado: ${e.generado_en} · Estado: ${semaforo === "verde" ? "completa" : semaforo === "ambar" ? "incompleta" : "sin datos"}`,
    NC
  );

  pintarCabecera(hoja, 3, COLUMNAS_INVENTARIO.map((c) => c.cabecera));

  const anchos = anchosDesdeDatos(COLUMNAS_INVENTARIO, filas);
  for (let i = 0; i < NC; i++) hoja.getColumn(i + 1).width = anchos[i];

  const ordenadas = [...filas].sort((a, b) => {
    const na = nombreUtilizable(a.nombre) ? 0 : 1;
    const nb = nombreUtilizable(b.nombre) ? 0 : 1;
    if (na !== nb) return na - nb;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  let f = 4;
  for (const fila of ordenadas) {
    const v = hoja.getRow(f);
    for (let i = 0; i < COLUMNAS_INVENTARIO.length; i++) {
      const col = COLUMNAS_INVENTARIO[i];
      const c = v.getCell(i + 1);
      if (col.clave === "enlace_origen") {
        c.value = celdaEnlace(
          fila.enlace_origen ? new URL(fila.enlace_origen).hostname.replace(/^www\./, "") : "sin enlace",
          fila.enlace_origen
        );
        if (typeof c.value === "object" && c.value) {
          c.font = { name: FUENTE, size: 9, color: { argb: CONIFERA }, underline: true };
        }
      } else {
        c.value = valorCelda(fila, col.clave);
      }
      c.numFmt = numFmt(col);
      c.border = { bottom: { style: "thin", color: { argb: LIMO } } };
      c.alignment = {
        vertical: "top",
        horizontal: col.tipo === "texto" ? "left" : "right",
        wrapText: col.clave === "nombre" || col.clave === "direccion" || col.clave === "horario",
        indent: col.tipo === "texto" ? 1 : undefined,
      };
      const esNombreMalo = (col.clave === "nombre" && fila.estado_nombre === "por_revisar") ||
        (col.clave === "nombre" && fila.estado_nombre === "por_registrar");
      c.font = {
        name: FUENTE,
        size: 10,
        color: { argb: esNombreMalo ? RUPESTRE : CARBON },
        bold: col.clave === "nombre",
      };
    }
    v.height = 16;
    f++;
  }

  hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: NC } };
  hoja.pageSetup.printTitlesRow = "1:3";

  if (filas.length > 0) {
    pintarNota(
      hoja,
      f + 1,
      `Fuente de esta hoja: ${fuentesDeFilas(filas).join("; ")}. El identificador interno de cada registro figura en la última columna, «ID técnico», y de forma completa en la hoja oculta _ID_TECNICO. Los puntos marcados en rojo tienen un nombre que no es utilizable y están pendientes de revisión.`,
      NC
    );
  } else {
    pintarNota(
      hoja,
      f + 1,
      `No hay ningún registro en esta categoría. La hoja 12_CARENCIAS indica qué información falta, por qué no se ha obtenido y a quién hay que pedirla. La ausencia de datos no significa que el municipio carezca de ellos.`,
      NC
    );
  }
}

/** Fuentes distintas que aparecen en un conjunto de filas, en orden alfabético. */
function fuentesDeFilas(filas: FilaLibro[]): string[] {
  const nombres = new Set(filas.map((f) => f.fuente));
  return [...nombres].sort();
}

// ---------------------------------------------------------------------------
// Hoja de carencias.
// ---------------------------------------------------------------------------

function construirHojaCarencias(wb: ExcelJS.Workbook, e: EntradaLibro, rl: ResumenLibro): void {
  const hoja = wb.addWorksheet("12_CARENCIAS");
  const cabeceras = [
    "Categoría",
    "Familia",
    "Qué falta",
    "Por qué no se ha obtenido",
    "A quién hay que pedirlo",
    "Qué hay que hacer",
    "Registros afectados",
  ];
  const NC = cabeceras.length;
  configurarHoja(hoja, e.municipio);
  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} — Carencias del inventario`, NC);
  pintarSubtitulo(
    hoja,
    2,
    `Municipio: ${e.municipio} (${e.codigo_ine}) · ${rl.carencias.length} carencias declaradas · Generado: ${e.generado_en}`,
    NC
  );
  pintarCabecera(hoja, 3, cabeceras);
  hoja.getColumn(1).width = 26;
  hoja.getColumn(2).width = 26;
  hoja.getColumn(3).width = 34;
  hoja.getColumn(4).width = 44;
  hoja.getColumn(5).width = 30;
  hoja.getColumn(6).width = 44;
  hoja.getColumn(7).width = 16;

  let f = 4;
  let categoriaActual = "";
  for (const c of rl.carencias) {
    if (c.categoria !== categoriaActual) {
      categoriaActual = c.categoria;
      pintarSubtitulo(
        hoja,
        f,
        `${nombreCategoria(categoriaActual)} — ${c.familia}`,
        NC,
        CONIFERA,
        11
      );
      for (let cc = 1; cc <= NC; cc++) {
        hoja.getRow(f).getCell(cc).font = {
          name: FUENTE,
          size: 11,
          bold: true,
          color: { argb: CARBON },
        };
      }
      f++;
      pintarCabecera(hoja, f, cabeceras);
      f++;
    }
    const v = hoja.getRow(f);
    const valores: (string | number)[] = [
      nombreCategoria(c.categoria),
      c.familia,
      c.falta,
      c.motivo,
      c.responsable,
      c.accion,
      c.registros_afectados,
    ];
    valores.forEach((val, i) => {
      const celda = v.getCell(i + 1);
      celda.value = val;
      celda.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      celda.alignment = { vertical: "top", wrapText: true, indent: 1 };
      celda.border = bordeFino();
      if (i === 6) celda.numFmt = "#,##0";
    });
    v.height = 60;
    f++;
  }
  pintarNota(
    hoja,
    f + 1,
    "Esta hoja no admite estimaciones: cada carencia indica qué información falta, por qué no se obtiene de forma automática, quién puede aportarla y qué habría que hacer. Ningún valor de esta hoja es una estimación.",
    NC
  );
}

// ---------------------------------------------------------------------------
// Hoja de fuentes.
// ---------------------------------------------------------------------------

function construirHojaFuentes(wb: ExcelJS.Workbook, e: EntradaLibro): void {
  const hoja = wb.addWorksheet("13_FUENTES");
  const cabeceras = [
    "Conjunto de datos",
    "Organismo",
    "Tipo",
    "Cobertura",
    "Periodicidad",
    "Versión del esquema",
    "Última consulta",
    "Registros en este libro",
    "Licencia",
    "Enlace",
    "Limitaciones",
  ];
  const NC = cabeceras.length;
  configurarHoja(hoja, e.municipio);
  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} — Fuentes de datos`, NC);
  pintarSubtitulo(
    hoja,
    2,
    `Municipio: ${e.municipio} (${e.codigo_ine}) · ${e.fuentes.length} conjuntos de datos · Generado: ${e.generado_en}`,
    NC
  );
  pintarCabecera(hoja, 3, cabeceras);
  const anchos = [34, 30, 18, 20, 14, 16, 16, 14, 26, 20, 40];
  for (let i = 0; i < NC; i++) hoja.getColumn(i + 1).width = anchos[i];

  let f = 4;
  for (const s of e.fuentes) {
    const v = hoja.getRow(f);
    const valores: (string | number)[] = [
      s.nombre,
      s.organismo,
      s.tipo,
      s.cobertura,
      s.periodicidad,
      s.version_esquema ?? "—",
      s.fecha_ultima_consulta ?? "—",
      s.registros_en_libro,
      s.licencia,
    ];
    valores.forEach((val, i) => {
      const c = v.getCell(i + 1);
      c.value = val;
      c.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      c.alignment = { vertical: "top", wrapText: true, indent: 1 };
      c.border = bordeFino();
      if (i === 7) c.numFmt = "#,##0";
    });
    const enlace = v.getCell(10);
    if (s.url && esAllowedSourceUrl(s.url)) {
      enlace.value = { text: ETIQUETA_ENLACE, hyperlink: s.url, tooltip: s.url };
      enlace.font = { name: FUENTE, size: 10, bold: true, underline: true, color: { argb: CONIFERA } };
    } else {
      enlace.value = "—";
      enlace.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    }
    enlace.alignment = { vertical: "top", horizontal: "center" };
    enlace.border = bordeFino();
    const lim = v.getCell(11);
    lim.value = s.limitaciones ?? "—";
    lim.font = { name: FUENTE, size: 9, italic: true, color: { argb: CARBON } };
    lim.alignment = { vertical: "top", wrapText: true, indent: 1 };
    lim.border = bordeFino();
    v.height = 44;
    f++;
  }

  f++;
  pintarSubtitulo(hoja, f, "Atribución obligatoria", NC, MUSGO, 12);
  f++;
  const usaOsm = e.fuentes.some((s) => /openstreetmap/i.test(s.nombre));
  pintarNota(
    hoja,
    f,
    usaOsm
      ? "Contiene datos de © OpenStreetMap contributors, bajo la licencia ODbL 1.0 (https://www.openstreetmap.org/copyright). Las bases derivadas deben conservar esta atribución y licencia. OpenStreetMap es una fuente colaborativa y no constituye fuente oficial."
      : "Este libro no contiene datos de OpenStreetMap.",
    NC
  );
}

// ---------------------------------------------------------------------------
// Hoja de metodología.
// ---------------------------------------------------------------------------

function construirHojaMetodologia(wb: ExcelJS.Workbook, e: EntradaLibro): void {
  // Los recuentos de las correcciones salen de las filas de este libro, no de
  // cifras fijas: así la metodología nunca puede contradecir a los datos.
  const numericos = e.filas.filter((f) => esSoloUnaCifra(f.nombre));
  const dePlantilla = e.filas.filter(
    (f) => f.fuente.includes("Plantilla municipal")
  );
  const dePlantillaConPunto = dePlantilla.filter((f) => f.lat !== null).length;
  const dePlantillaSinPunto = dePlantilla.length - dePlantillaConPunto;

  const hoja = wb.addWorksheet("14_METODOLOGIA");
  const NC = 3;
  configurarHoja(hoja, e.municipio);
  hoja.getColumn(1).width = 34;
  hoja.getColumn(2).width = 96;
  hoja.getColumn(3).width = 30;

  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} — Metodología`, NC);
  pintarSubtitulo(
    hoja,
    2,
    `Municipio: ${e.municipio} (${e.codigo_ine}) · Generado: ${e.generado_en}`,
    NC
  );

  let f = 4;
  const bloque = (titulo: string, lineas: [string, string, string][]) => {
    pintarSubtitulo(hoja, f, titulo, NC, MUSGO, 12);
    f++;
    pintarCabecera(hoja, f, ["Elemento", "Criterio aplicado", "Referencia"]);
    f++;
    for (const [k, v, ref] of lineas) {
      const fila = hoja.getRow(f);
      fila.getCell(1).value = k;
      fila.getCell(1).font = { name: FUENTE, size: 10, bold: true, color: { argb: CARBON } };
      fila.getCell(1).alignment = { vertical: "top", wrapText: true, indent: 1 };
      fila.getCell(1).border = bordeFino();
      fila.getCell(2).value = v;
      fila.getCell(2).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      fila.getCell(2).alignment = { vertical: "top", wrapText: true, indent: 1 };
      fila.getCell(2).border = bordeFino();
      fila.getCell(3).value = ref;
      fila.getCell(3).font = { name: FUENTE, size: 9, italic: true, color: { argb: CARBON } };
      fila.getCell(3).alignment = { vertical: "top", wrapText: true, indent: 1 };
      fila.getCell(3).border = bordeFino();
      fila.height = Math.max(18, 15 * Math.ceil(v.length / 120));
      f++;
    }
    f++;
  };

  bloque("Alcance", [
    [
      "Qué es este libro",
      "Un inventario de los elementos que un municipio necesita para planificar y gestionar emergencias: territorio, población, infraestructuras, equipamientos, servicios básicos, riesgos, medios, evacuación y necesidades especiales.",
      "docs/incideas-auditoria-calidad.md",
    ],
    [
      "Qué no es",
      "No es un plan de emergencia. El sistema no genera procedimientos, ni asigna recursos, ni decide actuaciones. La elaboración del plan corresponde al municipio, conforme a la normativa de protección civil.",
      "Ley 17/2015, art. 15",
    ],
    [
      "Cobertura",
      "Un municipio por libro. Los municipios sin datos generan el libro igualmente, con la hoja de carencias detallada.",
      "—",
    ],
  ]);

  bloque("Sistemas de referencia", [
    [
      "Coordenadas geográficas",
      "WGS84 en grados decimales con seis decimales. Un grado de latitud mide unos 111 metros, de modo que seis decimales equivalen a cerca de 10 centímetros.",
      "EPSG:4326",
    ],
    [
      "Coordenadas proyectadas",
      "ETRS89 UTM en metros con dos decimales. Es el sistema que usa el Plan Territorial Municipal, donde las coordenadas se escriben como «coord. (X; Y)». El huso se calcula por longitud: 28 en Canarias, 30 en la península y en Baleares, 31 en el este de Cataluña y Menorca.",
      "EPSG:25828 a EPSG:25831",
    ],
    [
      "Relación entre ETRS89 y WGS84",
      "Ambos sistemas difieren menos de un centímetro en el ámbito municipal, por lo que se consideran equivalentes a efectos de emergencia.",
      "—",
    ],
  ]);

  bloque("Precisión de la geolocalización", [
    [
      "Punto",
      "La fuente aporta un nodo con coordenadas verificadas sobre el terreno.",
      "—",
    ],
    [
      "Centroide de edificio",
      "El elemento es una vía, un polígono o una relación y la posición se ha calculado a partir de su geometría. Es una aproximación correcta pero no exacta.",
      "—",
    ],
    [
      "Sin ubicación precisa",
      "El registro no tiene coordenadas. Puede tratarse de un dato de ámbito municipal, como la población o una superficie.",
      "—",
    ],
  ]);

  bloque("Validación espacial y confianza", [
    [
      "Pertenencia al término",
      "No se comprueba de forma automática. La base de datos guarda un punto con el centro del municipio, no el polígono de su término, así que no hay contra qué validar. Los puntos se publican con la posición que aporta su fuente y la hoja de carencias deja constancia de esta limitación.",
      "Limitación conocida",
    ],
    [
      "Puntuación de confianza",
      "Valor de 0 a 100 obtido sumando criterios comprobables: procedencia de la fuente (hasta 35 puntos), integridad de campos (hasta 30), antigüedad del dato (hasta 20), coincidencia entre fuentes (15) y ubicación espacial (de −20 a 0). El desglose acompaña a la puntuación.",
      "docs/incideas-calidad-puntuacion.md",
    ],
    [
      "Estado de validación",
      "Un registro con estado «Automático, sin revisar» procede de carga automática y no ha sido contrastado con el municipio. «Contrastado» indica que existe una fuente municipal de apoyo. «Validado» exige revisión técnica formal.",
      "docs/incideas-cerebro.md §5",
    ],
  ]);

  bloque("Trazabilidad", [
    [
      "Identificador interno",
      "Cada registro conserva su identificador interno y el identificador del objeto en su fuente. Figuran en la columna «ID técnico» y, completos, en la hoja oculta _ID_TECNICO.",
      "—",
    ],
    [
      "Procedencia por atributo",
      "La base de datos guarda, campo a campo, qué fuente aportó cada valor y en qué fecha se consultó.",
      "incideas_registros.procedencia_atributos",
    ],
    [
      "Enlaces a las fuentes",
      "Solo se incluyen hipervínculos con protocolo seguro y dominio autorizado. No se incluyen direcciones internas, de almacenamiento ni de despliegue.",
      "docs/socideas-xlsx-source-links.md",
    ],
  ]);

  bloque("Correcciones de dato pendientes de autorización", [
    [
      "Sistema de referencia de origen",
      `${dePlantilla.length} filas procedentes de la plantilla municipal declaraban EPSG:4326 cuando la plantilla está en ETRS89 UTM 30 N. La etiqueta es incorrecta; el valor de la coordenada ya fue reproyectado a grados al importar y es correcto, de modo que la corrección afecta solo a la etiqueta. En este libro ${dePlantillaConPunto} de ellas tienen coordenadas; las otras ${dePlantillaSinPunto} no tienen ninguna.`,
      "incideas_correcciones_propuestas",
    ],
    [
      "Nombres formados solo por un número",
      `${numericos.length} registros de este libro tienen en el nombre una cifra suelta, que no identifica el elemento. Se propone recuperar el nombre real desde OpenStreetMap, desde la ficha municipal o desde el Plan Territorial Municipal. Todos ellos se marcan «Por revisar» y no se sustituyen por una suposición.`,
      "incideas_correcciones_propuestas",
    ],
  ]);
}

// ---------------------------------------------------------------------------
// Hoja de control de calidad.
// ---------------------------------------------------------------------------

function construirHojaCalidad(wb: ExcelJS.Workbook, e: EntradaLibro, rl: ResumenLibro): void {
  const hoja = wb.addWorksheet("15_CALIDAD");
  const cabeceras = [
    "Comprobación",
    "Resultado",
    "Detalle",
    "Qué significa",
  ];
  const NC = cabeceras.length;
  configurarHoja(hoja, e.municipio);
  pintarTitulo(hoja, 1, `INCideas · ${e.municipio} — Control de calidad`, NC);
  pintarSubtitulo(
    hoja,
    2,
    `Municipio: ${e.municipio} (${e.codigo_ine}) · Generado: ${e.generado_en} · Comprobaciones calculadas sobre el propio libro`,
    NC
  );
  pintarCabecera(hoja, 3, cabeceras);
  for (let i = 0; i < NC; i++) hoja.getColumn(i + 1).width = [40, 18, 40, 52][i];

  const total = e.filas.length;
  const conCoords = e.filas.filter((f) => f.lat !== null && f.lng !== null).length;
  const nombreMalo = e.filas.filter(
    (f) => f.estado_nombre === "por_registrar" || f.estado_nombre === "por_revisar"
  ).length;
  const conUtm = e.filas.filter((f) => f.utm_x !== null).length;
  const fuera = e.filas.filter((f) => f.estado_espacial === "fuera_municipio").length;
  const proximo = e.filas.filter((f) => f.estado_espacial === "proximo_limite").length;
  const sinRevisar = e.filas.filter((f) => f.estado_validacion === "automatico_sin_revisar").length;
  const conEnlace = e.filas.filter((f) => !!f.enlace_origen).length;
  const conTelefono = e.filas.filter((f) => !!f.telefono).length;
  const conHorario = e.filas.filter((f) => !!f.horario).length;
  const conCapacidad = e.filas.filter((f) => f.capacidad !== null).length;

  const comprobaciones: [string, string, string, string][] = [
    [
      "Registros sin nombre utilizable",
      `${nombreMalo} de ${total}`,
      `${porcentaje(nombreMalo, total)} % del libro`,
      nombreMalo === 0
        ? "Todos los registros tienen un nombre legible."
        : "Tienen un número o un texto vacío como nombre. Pendientes de revisión.",
    ],
    [
      "Registros sin coordenadas",
      `${total - conCoords} de ${total}`,
      `${porcentaje(total - conCoords, total)} % del libro`,
      total - conCoords === 0
        ? "Todos los registros tienen posición."
        : "Son datos de ámbito municipal o registros sin posición: partidas, población y áreas.",
    ],
    [
      "Registros con coordenada UTM calculada",
      `${conUtm} de ${total}`,
      `${porcentaje(conUtm, total)} % del libro`,
      conUtm === conCoords
        ? "Todos los puntos con posición llevan su coordenada UTM."
        : "Hay puntos con posición sin coordenada UTM, lo que indica un error de conversión.",
    ],
    [
      "Puntos fuera del término municipal",
      `${fuera} de ${conCoords}`,
      conCoords === 0 ? "—" : `${porcentaje(fuera, conCoords)} % de los posicionados`,
      "No se eliminan. Puede tratarse de un recurso próximo de interés, como un hospital comarcal.",
    ],
    [
      "Puntos a menos de 250 m del límite",
      `${proximo} de ${conCoords}`,
      conCoords === 0 ? "—" : `${porcentaje(proximo, conCoords)} % de los posicionados`,
      "Dentro del término, pero en la franja que puede depender de otro municipio.",
    ],
    [
      "Registros sin contrastar",
      `${sinRevisar} de ${total}`,
      `${porcentaje(sinRevisar, total)} % del libro`,
      "Proceden de carga automática y no han sido revisados por el municipio.",
    ],
    [
      "Registros con enlace al objeto en origen",
      `${conEnlace} de ${total}`,
      `${porcentaje(conEnlace, total)} % del libro`,
      "Permiten trazar el dato hasta su fuente y corregirlo allí.",
    ],
    [
      "Registros con teléfono",
      `${conTelefono} de ${total}`,
      `${porcentaje(conTelefono, total)} % del libro`,
      "El Plan Territorial Municipal documenta teléfono en el directorio de cargos y en los proveedores de servicios.",
    ],
    [
      "Registros con horario",
      `${conHorario} de ${total}`,
      `${porcentaje(conHorario, total)} % del libro`,
      "Información de atención al público, imprescindible para un recurso de emergencia.",
    ],
    [
      "Registros con capacidad o aforo",
      `${conCapacidad} de ${total}`,
      `${porcentaje(conCapacidad, total)} % del libro`,
      "Ninguna fuente abierta nacional lo publica. Véase la hoja 12_CARENCIAS.",
    ],
    [
      "Categorías del inventario sin datos",
      `${rl.resumen.categorias_vacias.length} de ${CATEGORIAS_INVENTARIO.length}`,
      rl.resumen.categorias_vacias.join(", ") || "—",
      "Categorías que no han podido completarse con fuentes abiertas.",
    ],
    [
      "Carencias declaradas",
      String(rl.carencias.length),
      "Cada una con motivo, responsable y acción",
      "Información que no se ha podido obtener y que hay que pedir.",
    ],
  ];

  let f = 4;
  for (const [k, v, det, sig] of comprobaciones) {
    const fila = hoja.getRow(f);
    fila.getCell(1).value = k;
    fila.getCell(1).font = { name: FUENTE, size: 10, bold: true, color: { argb: CARBON } };
    fila.getCell(1).alignment = { vertical: "top", wrapText: true, indent: 1 };
    fila.getCell(2).value = v;
    fila.getCell(2).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    fila.getCell(2).alignment = { vertical: "top", horizontal: "center", wrapText: true };
    fila.getCell(3).value = det;
    fila.getCell(3).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    fila.getCell(3).alignment = { vertical: "top", horizontal: "center", wrapText: true };
    fila.getCell(4).value = sig;
    fila.getCell(4).font = { name: FUENTE, size: 10, italic: true, color: { argb: CARBON } };
    fila.getCell(4).alignment = { vertical: "top", wrapText: true, indent: 1 };
    for (let c = 1; c <= NC; c++) fila.getCell(c).border = bordeFino();
    fila.height = 32;
    f++;
  }
}

// ---------------------------------------------------------------------------
// Hoja oculta de identificadores.
// ---------------------------------------------------------------------------

function construirHojaTecnica(wb: ExcelJS.Workbook, e: EntradaLibro): void {
  const hoja = wb.addWorksheet("_ID_TECNICO", { state: "hidden" });
  const cabeceras = [
    "ID técnico",
    "Identificador en el origen",
    "Tipo de objeto en el origen",
    "Categoría",
    "Subcategoría",
    "Nombre en el libro",
    "Nombre original",
    "Estado del nombre",
    "Huella",
  ];
  configurarHoja(hoja, e.municipio);
  pintarTitulo(hoja, 1, "INCideas — Identificadores técnicos", cabeceras.length);
  pintarCabecera(hoja, 2, cabeceras);
  const anchos = [38, 26, 20, 22, 22, 34, 34, 16, 34];
  for (let i = 0; i < cabeceras.length; i++) hoja.getColumn(i + 1).width = anchos[i];

  let f = 3;
  for (const fila of e.filas) {
    const v = hoja.getRow(f);
    const valores: (string | number)[] = [
      fila.id_tecnico,
      String((fila as unknown as { id_origen?: string }).id_origen ?? "—"),
      String((fila as unknown as { tipo_origen?: string }).tipo_origen ?? "—"),
      fila.categoria,
      fila.subcategoria ?? "—",
      fila.nombre,
      fila.nombre_original ?? "—",
      fila.estado_nombre,
      String((fila as unknown as { huella?: string }).huella ?? "—"),
    ];
    valores.forEach((val, i) => {
      const c = v.getCell(i + 1);
      c.value = val;
      c.font = { name: FUENTE, size: 9, color: { argb: CARBON } };
      c.alignment = { vertical: "top", wrapText: true, indent: 1 };
    });
    f++;
  }
  hoja.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cabeceras.length } };
}

// ---------------------------------------------------------------------------
// Construcción del libro.
// ---------------------------------------------------------------------------

export async function construirLibroMunicipal(entrada: EntradaLibro): Promise<Buffer> {
  // Las columnas derivadas se calculan una sola vez, antes de construir nada, para
  // que el resumen, las hojas, el CSV, el GeoJSON y el GeoPackage partan del
  // mismo valor y no se contradigan entre sí.
  const tiposFuente = new Map(entrada.fuentes.map((f) => [f.nombre, f.tipo]));
  const referencia = entrada.generado_en.slice(0, 10);
  const e: EntradaLibro = {
    ...entrada,
    filas: entrada.filas.map((f) => ({
      ...f,
      ...enriquecerFila(f, tiposFuente, { referencia }),
    })),
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Ideas Medioambientales - INCideas - Libro municipal de emergencias";
  wb.created = new Date(e.generado_en);
  wb.company = "Ideas Medioambientales, S.L.";

  const rl = construirResumen(e);
  construirPortada(wb, e);
  construirHojaResumen(wb, e, rl);
  for (const categoria of CATEGORIAS_INVENTARIO) {
    construirHojaCategoria(
      wb,
      e,
      categoria,
      rl.porCategoria.get(categoria) ?? [],
      rl.resumen.semaforo[categoria]
    );
  }
  construirHojaCarencias(wb, e, rl);
  construirHojaFuentes(wb, e);
  construirHojaMetodologia(wb, e);
  construirHojaCalidad(wb, e, rl);
  construirHojaTecnica(wb, e);

  const salida = await wb.xlsx.writeBuffer();
  return Buffer.from(salida as ArrayBuffer);
}

// Reexportaciones útiles para el resto del módulo
export {
  CATEGORIAS_INVENTARIO,
  tipoLegible,
  titularidadLegible,
  ESTADOS_LEGIBLES,
  ESTADOS_ESPACIALES_LEGIBLES,
  PRECISION_LEGIBLE,
  estadoEspacialLegible,
  precisionLegible,
  construirCarencias,
  punctuacionConfianza,
  resumenMunicipio,
  nombreUtilizable,
  construirCsvCabeceras,
  geometriaAWKT,
  latLngToUtm,
};