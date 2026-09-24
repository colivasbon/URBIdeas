// QA fixtures — serie histórica de elecciones municipales por municipio.
//
// SOLO lectura local del XLSX oficial de Infoelectoral y SOLO escritura en
// tmp/audit/. Sin red, sin R2, sin Supabase, sin Git. No toca producción.
//
// Fuente: tmp/elections-probe/mas250.xlsx
//   hoja "Municipios de más de 250 hab" (cabecera en fila 4; ~866.576 filas;
//   12 convocatorias municipales 1979-2023). Columnas:
//   Fecha | Código Elección | Tipo Elección | Descripción | Código Municipio |
//   Municipio | Código Provincia | Provincia | Resultados | Concejales
//
// Uso:
//   npx tsx scripts/qa-fixtures-elecciones-serie.ts 45090 16211 28079
//   npx tsx scripts/qa-fixtures-elecciones-serie.ts        (45090 y 16211)
//
// Salida: tmp/audit/elecciones-serie-<INE>.json (uno por municipio, ordenado
// por año ascendente) + resumen JSON por stdout (progreso y avisos por stderr).
//
// Reglas de honestidad (misma línea que src/lib/socideas-elections.ts):
// - Nunca inventar: agregado ausente → null; convocatoria sin votos de
//   candidaturas → candidaturas vacías y estado "parcial".
// - Un INE sin filas en la fuente NO genera fixture: se reporta "sin_filas".
// - Convocatorias duplicadas por año (seriales distintos): se conserva la del
//   serial con más filas de candidatura y se avisa.

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  ELECTIONS_CONVOCATORIAS,
  ELECTIONS_URL_MAS250,
  excelSerialToYear,
  ine5FromParts,
  parseCandidatura,
  type ElectionsRawRow,
} from "../src/lib/socideas-elections";

const require = createRequire(join(process.cwd(), "package.json"));
const XLSX = require("xlsx") as typeof import("xlsx");

const XLSX_PATH = join(process.cwd(), "tmp", "elections-probe", "mas250.xlsx");
const XLSX_PATH_RELATIVA = "tmp/elections-probe/mas250.xlsx";
const OUT_DIR = join(process.cwd(), "tmp", "audit");
const DEFAULT_INES = ["45090", "16211"];
const FUENTE = "Infoelectoral · municipales (fichero local mas250)";
/** Fila 4 del Excel = índice 3 (0-based); los datos empiezan en la 5.ª fila. */
const FILA_CABECERA = 3;
const CABECERA_ESPERADA = [
  "Fecha",
  "Código Elección",
  "Tipo Elección",
  "Descripción",
  "Código Municipio",
  "Municipio",
  "Código Provincia",
  "Provincia",
  "Resultados",
  "Concejales",
];

type ConvocatoriaCatalogo = (typeof ELECTIONS_CONVOCATORIAS)[number];
type EstadoConvocatoria = "completo" | "parcial";
type Agregado = "censo" | "votantes" | "validos" | "nulos" | "blancos";

/** Fila cruda de la fuente ya filtrada por municipio de interés. */
interface SourceRow extends ElectionsRawRow {
  fechaExcel: number;
  municipio: string;
  provincia: string;
}

interface CandidaturaFixture {
  candidatura: string;
  siglas: string;
  votos: number | null;
  concejales: number | null;
}

interface ConvocatoriaFixture {
  convocatoria: {
    fechaExcel: number;
    anio: number;
    fecha: string;
    tableIdSugerido: string;
  };
  censo: number | null;
  votantes: number | null;
  validos: number | null;
  nulos: number | null;
  blancos: number | null;
  candidaturas: CandidaturaFixture[];
  totalConcejales: number;
  estado: EstadoConvocatoria;
}

interface FixtureMunicipio {
  ine: string;
  municipio: string;
  provincia: string;
  fuente: string;
  convenios: {
    ficheroOriginal: string;
    hojas: number;
    extraidoEn: string;
  };
  convocatorias: ConvocatoriaFixture[];
}

interface ResumenAnio {
  anio: number;
  candidaturas: number;
  concejales: number;
  censo: number | null;
  votantes: number | null;
  participacion: number | null;
  estado: EstadoConvocatoria;
  problemas: string[];
}

interface ResumenMunicipio {
  ine: string;
  estado: "ok" | "sin_filas";
  municipio: string | null;
  provincia: string | null;
  convocatorias: number;
  anios: ResumenAnio[];
  warnings: string[];
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Clasifica los agregados de participación por literal normalizado (sin acentos). */
function clasificarAgregado(descripcion: string): Agregado | null {
  const norm = descripcion
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  switch (norm) {
    case "electores":
    case "censo":
      return "censo";
    case "votantes":
      return "votantes";
    case "votos validos":
      return "validos";
    case "votos nulos":
      return "nulos";
    case "votos en blanco":
      return "blancos";
    default:
      return null;
  }
}

/** ISO (YYYY-MM-DD) desde serial Excel; misma fórmula que excelSerialToYear. */
function fechaIsoFromSerial(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
}

/** tableId v2 sugerido, con el mismo patrón que ELECTIONS_CONVOCATORIA.tableId. */
function tableIdSugerido(fecha: string): string {
  return `MIR_MUNI_${fecha.slice(0, 7).replace("-", "")}`;
}

/** Participación derivada votantes/censo (1 decimal), como buildFilasMunicipio. */
function participacionPct(censo: number | null, votantes: number | null): number | null {
  return censo !== null && censo > 0 && votantes !== null
    ? Math.round((votantes / censo) * 1000) / 10
    : null;
}

function parseArgs(argv: string[]): string[] {
  const raw = argv.length > 0 ? argv : DEFAULT_INES;
  const vistos = new Set<string>();
  const codes: string[] = [];
  for (const a of raw) {
    if (!/^\d{5}$/.test(a)) {
      console.error(`Código INE inválido: "${a}" (se esperan 5 dígitos, p. ej. 45090)`);
      process.exit(1);
    }
    if (!vistos.has(a)) {
      vistos.add(a);
      codes.push(a);
    }
  }
  return codes;
}

/** Lee el XLSX completo en una pasada y conserva solo las filas de interés. */
function leerFilasDeInteres(codes: string[]): {
  byIne: Map<string, SourceRow[]>;
  hojas: number;
  filasDeInteres: number;
} {
  if (!existsSync(XLSX_PATH) || statSync(XLSX_PATH).size === 0) {
    console.error(`Fichero no encontrado o vacío: ${XLSX_PATH}`);
    console.error(`Descarga oficial (>250 hab): ${ELECTIONS_URL_MAS250}`);
    process.exit(1);
  }
  console.error(`Leyendo ${XLSX_PATH_RELATIVA} (~866k filas; puede tardar)...`);
  const wb = XLSX.readFile(XLSX_PATH, { sheetRows: 0 });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName !== undefined ? wb.Sheets[sheetName] : undefined;
  if (!ws) {
    console.error("El XLSX no tiene hojas legibles.");
    process.exit(1);
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const cabecera = (rows[FILA_CABECERA] ?? []).map((c) => String(c ?? "").trim());
  const cabeceraOk = CABECERA_ESPERADA.every((h, i) => cabecera[i] === h);
  if (!cabeceraOk) {
    console.error("Cabecera inesperada en la fila 4. Se esperaba:");
    console.error(`  ${CABECERA_ESPERADA.join(" | ")}`);
    console.error(`Encontrada: ${cabecera.join(" | ")}`);
    process.exit(1);
  }
  const data = rows.slice(FILA_CABECERA + 1) as (string | number | null)[][];
  const wanted = new Set(codes);
  const byIne = new Map<string, SourceRow[]>();
  let filasDeInteres = 0;
  for (const r of data) {
    const prov = r[6];
    const muni = r[4];
    if (typeof prov !== "number" || typeof muni !== "number") continue;
    const ine = ine5FromParts(prov, muni);
    if (!wanted.has(ine)) continue;
    const fechaExcel = numOrNull(r[0]);
    if (fechaExcel === null) continue;
    filasDeInteres += 1;
    const lista = byIne.get(ine) ?? [];
    lista.push({
      fechaExcel,
      descripcion: String(r[3] ?? ""),
      resultados: numOrNull(r[8]),
      concejales: numOrNull(r[9]),
      municipio: String(r[5] ?? ""),
      provincia: String(r[7] ?? ""),
    });
    byIne.set(ine, lista);
  }
  return { byIne, hojas: wb.SheetNames.length, filasDeInteres };
}

function construirFixtureMunicipio(
  ine: string,
  rows: SourceRow[],
  hojas: number,
  extraidoEn: string,
): { fixture: FixtureMunicipio; anios: ResumenAnio[]; warnings: string[] } {
  const warnings: string[] = [];
  // El nombre del municipio/provincia se toma de la convocatoria más reciente
  // (nombre oficial actual); si la fuente alterna grafías se avisa.
  const masReciente = rows.reduce((a, b) => (b.fechaExcel > a.fechaExcel ? b : a), rows[0]);
  const municipio = masReciente.municipio;
  const provincia = masReciente.provincia;
  const nombresMunicipio = [...new Set(rows.map((r) => r.municipio))];
  const nombresProvincia = [...new Set(rows.map((r) => r.provincia))];
  if (nombresMunicipio.length > 1) {
    warnings.push(
      `${ine}: ${nombresMunicipio.length} grafías de municipio en la fuente (${nombresMunicipio
        .map((n) => `"${n}"`)
        .join(", ")}); se usa la más reciente: "${municipio}"`,
    );
  }
  if (nombresProvincia.length > 1) {
    warnings.push(
      `${ine}: ${nombresProvincia.length} grafías de provincia en la fuente (${nombresProvincia
        .map((n) => `"${n}"`)
        .join(", ")}); se usa la más reciente: "${provincia}"`,
    );
  }

  // Agrupa por serial de fecha y deduplica por año: si un año tiene varios
  // seriales (convocatorias distintas), se conserva el de más filas de
  // candidatura (empate → más filas totales; empate → serial menor).
  const porSerial = new Map<number, SourceRow[]>();
  for (const r of rows) {
    const lista = porSerial.get(r.fechaExcel) ?? [];
    lista.push(r);
    porSerial.set(r.fechaExcel, lista);
  }
  const candidaturasDe = (lista: SourceRow[]): number =>
    lista.filter((r) => parseCandidatura(r.descripcion) !== null).length;
  const porAnio = new Map<number, { fechaExcel: number; rows: SourceRow[] }[]>();
  for (const [fechaExcel, lista] of porSerial) {
    const anio = excelSerialToYear(fechaExcel);
    const candidatos = porAnio.get(anio) ?? [];
    candidatos.push({ fechaExcel, rows: lista });
    porAnio.set(anio, candidatos);
  }
  const grupos = [...porAnio.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([anio, candidatos]) => {
      if (candidatos.length === 1) return { anio, ...candidatos[0] };
      const orden = [...candidatos].sort(
        (a, b) =>
          candidaturasDe(b.rows) - candidaturasDe(a.rows) ||
          b.rows.length - a.rows.length ||
          a.fechaExcel - b.fechaExcel,
      );
      const elegido = orden[0];
      warnings.push(
        `${ine} ${anio}: ${candidatos.length} convocatorias en el año (seriales ${candidatos
          .map((c) => c.fechaExcel)
          .join(", ")}); se usa el serial ${elegido.fechaExcel}`,
      );
      return { anio, ...elegido };
    });

  const convocatorias: ConvocatoriaFixture[] = [];
  const aniosResumen: ResumenAnio[] = [];
  for (const g of grupos) {
    const catalogo: ConvocatoriaCatalogo | undefined = ELECTIONS_CONVOCATORIAS.find(
      (c) => c.fechaExcel === g.fechaExcel,
    );
    const fecha = catalogo?.fecha ?? fechaIsoFromSerial(g.fechaExcel);
    const anio = g.anio;

    const agregados = new Map<Agregado, number | null>();
    for (const r of g.rows) {
      const tipo = clasificarAgregado(r.descripcion);
      if (tipo !== null && !agregados.has(tipo)) agregados.set(tipo, numOrNull(r.resultados));
    }
    const censo = agregados.get("censo") ?? null;
    const votantes = agregados.get("votantes") ?? null;
    const validos = agregados.get("validos") ?? null;
    const nulos = agregados.get("nulos") ?? null;
    const blancos = agregados.get("blancos") ?? null;

    const candidaturas: CandidaturaFixture[] = [];
    const vistas = new Set<string>();
    for (const r of g.rows) {
      const cand = parseCandidatura(r.descripcion);
      if (cand === null) continue;
      const clave = `${cand.candidatura}\u0000${cand.siglas}`;
      if (vistas.has(clave)) {
        warnings.push(
          `${ine} ${anio}: candidatura duplicada "${cand.candidatura}" (${cand.siglas}); se conserva la primera fila`,
        );
        continue;
      }
      vistas.add(clave);
      candidaturas.push({
        candidatura: cand.candidatura,
        siglas: cand.siglas,
        votos: numOrNull(r.resultados),
        concejales: numOrNull(r.concejales),
      });
    }

    let totalConcejales = 0;
    for (const c of candidaturas) {
      if (c.concejales !== null) totalConcejales += c.concejales;
    }
    const tieneVotos = candidaturas.some((c) => c.votos !== null);
    const estado: EstadoConvocatoria = tieneVotos ? "completo" : "parcial";

    convocatorias.push({
      convocatoria: {
        fechaExcel: g.fechaExcel,
        anio,
        fecha,
        tableIdSugerido: tableIdSugerido(fecha),
      },
      censo,
      votantes,
      validos,
      nulos,
      blancos,
      candidaturas,
      totalConcejales,
      estado,
    });

    const problemas: string[] = [];
    if (censo === null || censo <= 0) problemas.push("censo_ausente_o_cero");
    if (votantes !== null && censo !== null && censo > 0 && votantes > censo) {
      problemas.push("votantes_mayor_que_censo");
    }
    if (
      votantes !== null &&
      validos !== null &&
      nulos !== null &&
      Math.abs(votantes - (validos + nulos)) > 1
    ) {
      problemas.push(`votantes_no_cuadra_con_validos_mas_nulos (${votantes} vs ${validos}+${nulos})`);
    }
    if (candidaturas.length === 0) problemas.push("sin_candidaturas");
    aniosResumen.push({
      anio,
      candidaturas: candidaturas.length,
      concejales: totalConcejales,
      censo,
      votantes,
      participacion: participacionPct(censo, votantes),
      estado,
      problemas,
    });
  }

  const fixture: FixtureMunicipio = {
    ine,
    municipio,
    provincia,
    fuente: FUENTE,
    convenios: {
      ficheroOriginal: XLSX_PATH_RELATIVA,
      hojas,
      extraidoEn,
    },
    convocatorias,
  };
  return { fixture, anios: aniosResumen, warnings };
}

function main(): void {
  const codes = parseArgs(process.argv.slice(2));
  const { byIne, hojas, filasDeInteres } = leerFilasDeInteres(codes);
  const extraidoEn = new Date().toISOString();
  console.error(`Filas de interés (${codes.join(", ")}): ${filasDeInteres}`);

  mkdirSync(OUT_DIR, { recursive: true });

  const municipios: ResumenMunicipio[] = [];
  const ficheros: string[] = [];
  for (const ine of codes) {
    const rows = byIne.get(ine);
    if (!rows || rows.length === 0) {
      console.error(`AVISO ${ine}: sin filas en la fuente (no se escribe fixture)`);
      municipios.push({
        ine,
        estado: "sin_filas",
        municipio: null,
        provincia: null,
        convocatorias: 0,
        anios: [],
        warnings: [`${ine}: sin filas en la fuente (>250 hab o código inexistente)`],
      });
      continue;
    }
    const { fixture, anios, warnings } = construirFixtureMunicipio(ine, rows, hojas, extraidoEn);
    const outPath = join(OUT_DIR, `elecciones-serie-${ine}.json`);
    writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
    ficheros.push(`tmp/audit/elecciones-serie-${ine}.json`);
    for (const w of warnings) console.error(`AVISO ${w}`);
    municipios.push({
      ine,
      estado: "ok",
      municipio: fixture.municipio,
      provincia: fixture.provincia,
      convocatorias: fixture.convocatorias.length,
      anios,
      warnings,
    });
  }

  console.log(
    JSON.stringify(
      {
        ficheroOriginal: XLSX_PATH_RELATIVA,
        extraidoEn,
        directorioSalida: "tmp/audit",
        municipios,
        ficheros,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (e) {
  console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
