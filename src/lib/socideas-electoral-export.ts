// Adaptador de SOLO LECTURA para volcar el bloque electoral a la hoja
// 02_CONTEXTO_POLÍTICO del libro XLSX. Solo datos reales del envelope ya
// presente en la ficha (sin consultas externas, sin R2, sin escrituras).
// Sin cobertura → [] y la hoja cae al bloque pendiente de integración.
// La ausencia de dato se pinta como ND, nunca como 0 (un 0 de concejales
// observado es dato real y se conserva como 0).
import type { IndicatorValue } from "./socideas";
import {
  ELECTIONS_CONVOCATORIA,
  buildElectoralPresentation,
} from "./socideas-elections";
import { fmtES, type ExportCell, type ExportTable } from "./socideas-export";
import { registrySource } from "./socideas-source-registry";

function cell(text: string, numeric: number | null = null): ExportCell {
  return { text, numeric };
}

function pctCell(pct: number | null): ExportCell {
  return cell(pct === null ? "ND" : `${fmtES(pct, 1)} %`, pct);
}

const PERIODO = "2023 (28-05-2023)";

/**
 * Construye las tablas electorales desde los valores ya cargados en la ficha.
 * Devuelve [] si no hay cobertura electoral (ausencias se omiten).
 */
export function buildElectoralTables(
  valores: IndicatorValue[],
  municipioNombre: string,
): ExportTable[] {
  const data = buildElectoralPresentation(valores, municipioNombre);
  if (data.status !== "observed") return [];
  const { anio } = ELECTIONS_CONVOCATORIA;
  const fuente =
    "Ministerio del Interior · Infoelectoral · Datos Abiertos · Elecciones municipales de más de 250 habitantes";
  const cobertura = `Municipio ${municipioNombre}`;
  const source = registrySource("mir_muni_mas250_2023");

  const participacion: ExportCell[][] = [
    [cell("Censo electoral"), cell(fmtES(data.censo), data.censo)],
    [cell("Votantes"), cell(fmtES(data.votantes), data.votantes)],
    [cell("Participación (derivada: votantes / censo)"), pctCell(data.participacion)],
    [cell("Votos válidos"), cell(fmtES(data.validos), data.validos)],
    [cell("Votos en blanco"), cell(fmtES(data.blancos), data.blancos)],
    [cell("Votos nulos"), cell(fmtES(data.nulos), data.nulos)],
    [cell("Concejales"), cell(fmtES(data.totalConcejales), data.totalConcejales)],
  ];

  const candidaturas: ExportCell[][] = data.candidaturas.map((c) => {
    const esGanadora =
      data.ganadora !== null && c.nombre === data.ganadora.nombre && c.siglas === data.ganadora.siglas;
    return [
      cell(esGanadora ? `${c.nombre} (candidatura más votada)` : c.nombre),
      cell(c.siglas || "—"),
      cell(fmtES(c.votos), c.votos),
      pctCell(c.pctValidos),
      cell(fmtES(c.concejales), c.concejales),
    ];
  });

  return [
    {
      id: "elecciones-participacion",
      titulo: `Participación · Elecciones municipales ${anio}`,
      hoja: "02_CONTEXTO_POLÍTICO",
      columnas: ["Concepto", "Valor", "%"],
      filas: participacion,
      fuente,
      periodo: PERIODO,
      cobertura,
      estado: "Consolidado (resultados definitivos)",
      source,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "Participación derivada (votantes/censo). La ausencia de dato es ND, nunca 0.",
    },
    {
      id: "elecciones-candidaturas",
      titulo: `Reparto por candidatura · Elecciones municipales ${anio}`,
      hoja: "02_CONTEXTO_POLÍTICO",
      columnas: ["Candidatura", "Siglas", "Votos", "% sobre válidos", "Concejales"],
      filas: candidaturas,
      fuente,
      periodo: PERIODO,
      cobertura,
      estado: "Consolidado (resultados definitivos)",
      source,
      comparisonMode: "municipal_only",
      availability: "available",
      note: "5 candidaturas más votadas + «Otras candidaturas». Un 0 de concejales observado es dato real. Los municipios en concejo abierto (generalmente <100 hab.) no publican resultados por candidatura; los pequeños con listas se muestran con normalidad.",
    },
  ];
}
