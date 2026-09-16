// Adaptador electoral SOCideas — Elecciones municipales, Ministerio del Interior
// (Infoelectoral · Datos Abiertos). Incluye el constructor de filas v2 y el
// constructor de presentación para la ficha (sin I/O, sin R2, sin Supabase).
//
// Fuente oficial verificada en vivo el 2026-09-16 (nada de memoria):
// - Portal: https://infoelectoral.interior.gob.es/es/elecciones-celebradas/datos-abiertos/
// - Fichero MVP (>250 hab, incluye participación + votos + concejales por
//   candidatura, 12 convocatorias 1979-2023):
//   https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-mas-de-250-hab.xlsx
//   (descarga real HTTP 200, 36.505.355 bytes, 866.576 filas; 1 hoja
//   "Municipios de más de 250 hab", cabecera en fila 4)
// - Fichero complementario (<=250 hab, régimen de concejo abierto, voto por
//   candidato + cargo electo S/N, SIN agregados de participación):
//   https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-hasta-250-hab.xlsx
//   (descarga real HTTP 200, 11.352.481 bytes; FUERA del alcance MVP por
//   grano distinto —candidato, no candidatura— y sin participación)
// - Nota metodológica:
//   https://infoelectoral.interior.gob.es/export/sites/default/pdf/elecciones-celebradas/datos-abiertos/Nota-Metodologica.pdf
// - Vía clásica por convocatoria (ficheros fijos 05/06*.DAT en ZIP
//   .../estaticos/docxl/apliextr/04202305_MUNI.zip): NO viable en la práctica
//   (timeout >60 s verificado hoy; el propio paquete R infoelectoral documenta
//   timeouts del mismo host). Se usa Datos Abiertos.
// - Licencia: CC BY 4.0. Periodicidad: por convocatoria (última municipal
//   confirmada: 28 de mayo de 2023; próximas municipales 2027, aún no
//   celebradas). Definitivos JEC publicados en BOE por provincias.
//
// Criterio territorial: cada fila trae Código Provincia (2 dígitos) + Código
// Municipio (3 dígitos) → INE 5 dígitos (p. ej. 28+079=28079 Madrid).
// Nivel municipio verificado; no se usa agregación provincial.
//
// Este módulo es puro (sin imports, apto servidor/cliente): parsea filas del
// XLSX y produce "filas" con la forma exacta que espera `toV2Envelope`
// (src/lib/socideas-r2.ts). La tupla v2 de 9 posiciones NO se toca.

export const ELECTIONS_SOURCE_SLUG = "mir_infoelectoral";
export const ELECTIONS_ORGANISMO = "Ministerio del Interior";
export const ELECTIONS_SOURCE_NOMBRE =
  "Infoelectoral · Datos Abiertos — Elecciones municipales de más de 250 habitantes";

export const ELECTIONS_URL_MAS250 =
  "https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-mas-de-250-hab.xlsx";
export const ELECTIONS_URL_HASTA250 =
  "https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-hasta-250-hab.xlsx";
export const ELECTIONS_URL_DATOS_ABIERTOS =
  "https://infoelectoral.interior.gob.es/es/elecciones-celebradas/datos-abiertos/";
export const ELECTIONS_URL_NOTA_METODOLOGICA =
  "https://infoelectoral.interior.gob.es/export/sites/default/pdf/elecciones-celebradas/datos-abiertos/Nota-Metodologica.pdf";

/** Última convocatoria municipal confirmada (alcance MVP). */
export const ELECTIONS_CONVOCATORIA = {
  /** Serial Excel de la columna Fecha para el 2023-05-28. */
  fechaExcel: 45074,
  anio: 2023,
  fecha: "2023-05-28",
  /** tableId v2 (sin serie: serieId siempre null en este bloque). */
  tableId: "MIR_MUNI_202305",
} as const;

/** Convocatorias municipales presentes en el XLSX (serial Excel → ISO). */
export const ELECTIONS_CONVOCATORIAS: { fechaExcel: number; fecha: string; anio: number }[] = [
  { fechaExcel: 28948, fecha: "1979-04-03", anio: 1979 },
  { fechaExcel: 30444, fecha: "1983-05-08", anio: 1983 },
  { fechaExcel: 31938, fecha: "1987-06-10", anio: 1987 },
  { fechaExcel: 33384, fecha: "1991-05-26", anio: 1991 },
  { fechaExcel: 34847, fecha: "1995-05-28", anio: 1995 },
  { fechaExcel: 36324, fecha: "1999-06-13", anio: 1999 },
  { fechaExcel: 37766, fecha: "2003-05-25", anio: 2003 },
  { fechaExcel: 39229, fecha: "2007-05-27", anio: 2007 },
  { fechaExcel: 40685, fecha: "2011-05-22", anio: 2011 },
  { fechaExcel: 42148, fecha: "2015-05-24", anio: 2015 },
  { fechaExcel: 43611, fecha: "2019-05-26", anio: 2019 },
  { fechaExcel: 45074, fecha: "2023-05-28", anio: 2023 },
];

/** Slugs v2 del bloque electoral (nuevos; no colisionan con demografía/economía). */
export const ELECTIONS_INDICATORS = [
  { slug: "elec_censo", nombre: "Censo electoral", unidad: "personas" },
  { slug: "elec_votantes", nombre: "Votantes", unidad: "votos" },
  { slug: "elec_participacion", nombre: "Participación electoral", unidad: "%" },
  { slug: "elec_votos_validos", nombre: "Votos válidos", unidad: "votos" },
  { slug: "elec_votos_candidaturas", nombre: "Votos a candidaturas", unidad: "votos" },
  { slug: "elec_votos_blanco", nombre: "Votos en blanco", unidad: "votos" },
  { slug: "elec_votos_nulos", nombre: "Votos nulos", unidad: "votos" },
  { slug: "elec_votos_candidatura", nombre: "Votos por candidatura", unidad: "votos" },
  { slug: "elec_concejales", nombre: "Concejales por candidatura", unidad: "concejales" },
] as const;

export type ElectionsIndicatorSlug = (typeof ELECTIONS_INDICATORS)[number]["slug"];

/** Descripciones fijas del XLSX (>250 hab) para agregados de participación. */
const DESCRIPCION_FIJA: Record<string, ElectionsIndicatorSlug> = {
  Electores: "elec_censo",
  Votantes: "elec_votantes",
  "Votos Válidos": "elec_votos_validos",
  "Votos a candidaturas": "elec_votos_candidaturas",
  "Votos en blanco": "elec_votos_blanco",
  "Votos nulos": "elec_votos_nulos",
};

/** Fila cruda del XLSX (>250 hab) ya filtrada por convocatoria y municipio. */
export interface ElectionsRawRow {
  descripcion: string;
  resultados: number | null;
  concejales: number | null;
}

/** Fila lista para `toV2Envelope` (misma forma que el resto de bloques). */
export interface ElectionsFila {
  indicator: { slug: string; nombre: string; unidad: string | null };
  source: { slug: string; organismo: string; nombre: string };
  anio_referencia: number | null;
  valor_numerico: number | null;
  unidad: string | null;
  dimensiones: Record<string, string>;
  source_url: string | null;
  source_table_id: string | null;
  source_series_id?: string | null;
  estado_validacion: string;
}

/** Serial de fecha Excel (días desde 1899-12-30) → año. */
export function excelSerialToYear(serial: number): number {
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).getUTCFullYear();
}

/** Código INE de 5 dígitos desde Código Provincia (n) + Código Municipio (n). */
export function ine5FromParts(codigoProvincia: number, codigoMunicipio: number): string {
  return String(codigoProvincia).padStart(2, "0") + String(codigoMunicipio).padStart(3, "0");
}

/**
 * Parsea "Votos (NOMBRE - SIGLAS)" → { candidatura, siglas }.
 * Las siglas son el ÚLTIMO segmento tras " - " (pueden contener guiones,
 * p. ej. "PODEMOS-IU-AV"); el resto es el nombre de la candidatura.
 * Devuelve null si no es fila de candidatura.
 */
export function parseCandidatura(descripcion: string): { candidatura: string; siglas: string } | null {
  const m = /^Votos \((.+)\)$/.exec(descripcion.trim());
  if (!m) return null;
  const inner = m[1];
  const parts = inner.split(" - ");
  if (parts.length < 2) return { candidatura: inner.trim(), siglas: "" };
  const siglas = (parts.pop() ?? "").trim();
  return { candidatura: parts.join(" - ").trim(), siglas };
}

export interface ElectionsBuildResult {
  filas: ElectionsFila[];
  /** Advertencias de coherencia (no bloquean; si hay error grave se omite el derivado). */
  warnings: string[];
  resumen: {
    ine: string;
    municipio: string;
    anio: number;
    censo: number | null;
    votantes: number | null;
    participacion: number | null;
    nCandidaturas: number;
    totalConcejales: number;
  };
}

/**
 * Construye las filas v2 del bloque electoral MVP (convocatoria 2023) para un
 * municipio. Reglas: nunca inventar (null ante la duda), participación
 * derivada votantes/censo redondeada a 1 decimal, `estado_validacion`
 * siempre "validado", serieId siempre null.
 */
export function buildFilasMunicipio(
  ine: string,
  municipioNombre: string,
  rows: ElectionsRawRow[],
): ElectionsBuildResult {
  const { anio, tableId } = ELECTIONS_CONVOCATORIA;
  const warnings: string[] = [];
  const filas: ElectionsFila[] = [];
  const lookup = new Map<string, ElectionsRawRow>();
  for (const r of rows) {
    if (DESCRIPCION_FIJA[r.descripcion] && !lookup.has(r.descripcion)) lookup.set(r.descripcion, r);
  }
  const num = (d: string): number | null => {
    const v = lookup.get(d)?.resultados ?? null;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const source = {
    slug: ELECTIONS_SOURCE_SLUG,
    organismo: ELECTIONS_ORGANISMO,
    nombre: ELECTIONS_SOURCE_NOMBRE,
  };
  const dimBase = { ambito: "municipio" };
  const push = (
    slug: ElectionsIndicatorSlug,
    valor: number | null,
    dimensiones: Record<string, string>,
  ): void => {
    const meta = ELECTIONS_INDICATORS.find((i) => i.slug === slug) ?? {
      slug,
      nombre: slug,
      unidad: null,
    };
    filas.push({
      indicator: { slug: meta.slug, nombre: meta.nombre, unidad: meta.unidad },
      source,
      anio_referencia: anio,
      valor_numerico: valor,
      unidad: meta.unidad,
      dimensiones,
      source_url: ELECTIONS_URL_MAS250,
      source_table_id: tableId,
      source_series_id: null,
      estado_validacion: "validado",
    });
  };

  const censo = num("Electores");
  const votantes = num("Votantes");
  const validos = num("Votos Válidos");
  const aCandidaturas = num("Votos a candidaturas");
  const blanco = num("Votos en blanco");
  const nulos = num("Votos nulos");

  // Chequeos de coherencia oficiales: válidos = candidaturas + blanco;
  // votantes = válidos + nulos. Ante descuadre se avisa (no se corrige).
  if (validos !== null && aCandidaturas !== null && blanco !== null && validos !== aCandidaturas + blanco) {
    warnings.push(`${ine} ${municipioNombre}: válidos (${validos}) ≠ candidaturas (${aCandidaturas}) + blanco (${blanco})`);
  }
  if (votantes !== null && validos !== null && nulos !== null && votantes !== validos + nulos) {
    warnings.push(`${ine} ${municipioNombre}: votantes (${votantes}) ≠ válidos (${validos}) + nulos (${nulos})`);
  }

  push("elec_censo", censo, dimBase);
  push("elec_votantes", votantes, dimBase);
  const participacion =
    censo !== null && censo > 0 && votantes !== null
      ? Math.round((votantes / censo) * 1000) / 10
      : null;
  if (participacion === null) warnings.push(`${ine} ${municipioNombre}: participación no derivable (censo/votantes nulos)`);
  push("elec_participacion", participacion, dimBase);
  push("elec_votos_validos", validos, dimBase);
  push("elec_votos_candidaturas", aCandidaturas, dimBase);
  push("elec_votos_blanco", blanco, dimBase);
  push("elec_votos_nulos", nulos, dimBase);

  let totalConcejales = 0;
  let nCandidaturas = 0;
  for (const r of rows) {
    const cand = parseCandidatura(r.descripcion);
    if (!cand) continue;
    nCandidaturas += 1;
    const votos = typeof r.resultados === "number" && Number.isFinite(r.resultados) ? r.resultados : null;
    const concej =
      typeof r.concejales === "number" && Number.isFinite(r.concejales) ? r.concejales : null;
    if (concej !== null) totalConcejales += concej;
    const dim = { ambito: "municipio", candidatura: cand.candidatura, siglas: cand.siglas };
    push("elec_votos_candidatura", votos, dim);
    push("elec_concejales", concej, dim);
  }
  if (nCandidaturas === 0) warnings.push(`${ine} ${municipioNombre}: sin filas de candidatura en la fuente`);

  return {
    filas,
    warnings,
    resumen: {
      ine,
      municipio: municipioNombre,
      anio,
      censo,
      votantes,
      participacion,
      nCandidaturas,
      totalConcejales,
    },
  };
}

// ============================================================================
// Presentación para la ficha (puro, sin I/O): agrupa y etiqueta sin inventar.
// ============================================================================

/**
 * Máximo de candidaturas mostradas antes de agrupar el resto en
 * "Otras candidaturas". Criterio análogo al ranking de Lugar de nacimiento
 * (top 5 categorías publicadas).
 */
export const ELECTIONS_MAX_CANDIDATURAS = 5;

export interface ElectoralCandidaturaVista {
  nombre: string;
  siglas: string;
  votos: number | null;
  pctValidos: number | null;
  concejales: number | null;
}

export interface ElectoralPresentacion {
  municipio: string;
  anio: number;
  censo: number | null;
  votantes: number | null;
  /** Derivada votantes/censo (1 decimal); null si no derivable. Siempre etiquetada como cálculo en la UI. */
  participacion: number | null;
  validos: number | null;
  blancos: number | null;
  nulos: number | null;
  totalConcejales: number;
  /** Top 5 por votos + "Otras candidaturas" agregada cuando hay resto. */
  candidaturas: ElectoralCandidaturaVista[];
  /** Candidatura más votada (null si no determinable). */
  ganadora: { nombre: string; siglas: string; votos: number | null; concejales: number | null } | null;
  /** "observed" | "missing" (municipio ≤250 hab o sin cobertura en la fuente). */
  status: "observed" | "missing";
}

/** Fila mínima compatible con IndicatorValue y con filas v2 expandidas. */
export interface ElectoralValorEntrada {
  indicator?: { slug?: string } | null;
  anio_referencia: number | null;
  valor_numerico: number | null;
  dimensiones?: Record<string, string> | null;
}

/** Tanto por ciento con 1 decimal desde un cociente (misma convención que buildFilasMunicipio). */
function pct1FromRatio(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

/**
 * Construye la presentación electoral desde los valores del envelope ya
 * presente en la ficha. Nunca inventa: ante ausencia devuelve status
 * "missing" (la UI muestra ND, nunca 0).
 */
export function buildElectoralPresentation(
  valores: ElectoralValorEntrada[],
  municipioNombre: string,
): ElectoralPresentacion {
  const { anio } = ELECTIONS_CONVOCATORIA;
  const rows = (valores ?? []).filter(
    (v) => v.anio_referencia === anio && (v.dimensiones?.ambito ?? "municipio") === "municipio",
  );
  const slugOf = (v: ElectoralValorEntrada): string => v.indicator?.slug ?? "";
  const single = (slug: string): number | null => {
    const v = rows.find((r) => slugOf(r) === slug);
    return typeof v?.valor_numerico === "number" && Number.isFinite(v.valor_numerico) ? v.valor_numerico : null;
  };

  const censo = single("elec_censo");
  const votantes = single("elec_votantes");
  const validos = single("elec_votos_validos");
  const blancos = single("elec_votos_blanco");
  const nulos = single("elec_votos_nulos");
  const participacion =
    censo !== null && censo > 0 && votantes !== null ? pct1FromRatio(votantes / censo) : null;

  const votosRows = rows.filter((r) => slugOf(r) === "elec_votos_candidatura");
  const concejByCand = new Map<string, number | null>();
  for (const r of rows.filter((r) => slugOf(r) === "elec_concejales")) {
    const key = `${r.dimensiones?.candidatura ?? ""}__${r.dimensiones?.siglas ?? ""}`;
    if (!concejByCand.has(key)) {
      const v = r.valor_numerico;
      concejByCand.set(key, typeof v === "number" && Number.isFinite(v) ? v : null);
    }
  }
  const todas: ElectoralCandidaturaVista[] = votosRows.map((r) => {
    const nombre = r.dimensiones?.candidatura ?? "";
    const siglas = r.dimensiones?.siglas ?? "";
    const votos =
      typeof r.valor_numerico === "number" && Number.isFinite(r.valor_numerico) ? r.valor_numerico : null;
    const concejales = concejByCand.get(`${nombre}__${siglas}`) ?? null;
    return {
      nombre,
      siglas,
      votos,
      pctValidos: votos !== null && validos !== null && validos > 0 ? pct1FromRatio(votos / validos) : null,
      concejales,
    };
  });
  // Más votadas primero; sin votos al final (nunca se inventa un orden).
  todas.sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1));

  const ganadora =
    todas.length > 0 && todas[0].votos !== null
      ? { nombre: todas[0].nombre, siglas: todas[0].siglas, votos: todas[0].votos, concejales: todas[0].concejales }
      : null;

  const top = todas.slice(0, ELECTIONS_MAX_CANDIDATURAS);
  const resto = todas.slice(ELECTIONS_MAX_CANDIDATURAS);
  const candidaturas: ElectoralCandidaturaVista[] = [...top];
  if (resto.length > 0) {
    const votosResto = resto.map((c) => c.votos).filter((v): v is number => v !== null);
    const concejResto = resto.map((c) => c.concejales).filter((v): v is number => v !== null);
    const votosOtras = votosResto.length > 0 ? votosResto.reduce((a, b) => a + b, 0) : null;
    candidaturas.push({
      nombre: "Otras candidaturas",
      siglas: "",
      votos: votosOtras,
      pctValidos:
        votosOtras !== null && validos !== null && validos > 0 ? pct1FromRatio(votosOtras / validos) : null,
      concejales: concejResto.length > 0 ? concejResto.reduce((a, b) => a + b, 0) : null,
    });
  }

  const concejTodos = todas.map((c) => c.concejales).filter((v): v is number => v !== null);
  const status =
    censo !== null || votantes !== null || todas.length > 0 ? "observed" : "missing";

  return {
    municipio: municipioNombre,
    anio,
    censo,
    votantes,
    participacion,
    validos,
    blancos,
    nulos,
    totalConcejales: concejTodos.reduce((a, b) => a + b, 0),
    candidaturas,
    ganadora,
    status,
  };
}
