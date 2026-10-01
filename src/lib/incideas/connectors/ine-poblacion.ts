import type { Connector, ConnectorResult } from "./types";
import { fetchConReintentos } from "./http";
import type { RawFeature } from "../pipeline/types";

/**
 * Población del padrón municipal desde el INE.
 * Tabla 29005 "Cifras oficiales del padrón por municipio" (jaxiT3, CSV, ISO-8859-1).
 * Cobertura nacional. Endpoint verificado (Benidorm 03031 presente). No aporta geometría.
 */
const TABLA = "29005";
const URL_CSV = `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/${TABLA}.csv`;

const FUENTE = {
  nombre: "INE - Padrón municipal (tabla 29005)",
  organismo: "Instituto Nacional de Estadística",
  licencia: "Reutilización libre (Ley 37/2007) citando la fuente",
  url: "https://www.ine.es/jaxiT3/Tabla.htm?t=29005",
};

function parseNumero(raw: string): number | undefined {
  if (!raw) return undefined;
  const limpio = raw.replace(/\./g, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
}

interface Fila {
  municipio: string;
  sexo: string;
  periodo: string;
  total?: number;
}

function parseCSV(texto: string): Fila[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/);
  const filas: Fila[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea.trim()) continue;
    const cols = linea.split(";");
    if (cols.length < 4) continue;
    filas.push({
      municipio: cols[0].trim(),
      sexo: cols[1].trim(),
      periodo: cols[2].trim(),
      total: parseNumero(cols[3].trim()),
    });
  }
  return filas;
}

export const inePoblacionConnector: Connector = {
  id: "ine-poblacion",
  version: "1.0.1",
  nombre: "Población del padrón (INE 29005)",
  descripcion: "Población empadronada por sexo y año, serie oficial del padrón municipal.",
  categoria: "poblacion",
  nivelAutomatizacion: "alta",
  visibilidad: "publica",
  fuente: FUENTE,

  async ejecutar({ codigoINE }): Promise<ConnectorResult> {
    try {
      const res = await fetchConReintentos(URL_CSV, { timeoutMs: 60000, reintentos: 3 });
      const buffer = Buffer.from(await res.arrayBuffer());
      const texto = buffer.toString("latin1");
      const filas = parseCSV(texto);

      const propias = filas.filter((f) => f.municipio.startsWith(codigoINE));
      if (propias.length === 0) {
        return {
          features: [],
          parcial: false,
          errores: [`Sin filas para el código INE ${codigoINE} en la tabla ${TABLA}`],
        };
      }

      const nombreMunicipio = propias[0].municipio.slice(codigoINE.length).trim();
      const features: RawFeature[] = propias
        .filter((f) => f.sexo === "Total" && f.total !== undefined)
        .map((f) => ({
          id_origen: `${TABLA}|${codigoINE}|${f.sexo}|${f.periodo}`,
          nombre: `Población empadronada ${f.periodo}`,
          categoria: "poblacion",
          subcategoria: "padron",
          fuente: FUENTE,
          metodo_obtencion: "descarga",
          descripcion: `${nombreMunicipio} (${codigoINE}), ${f.sexo}, ${f.periodo}`,
          fecha_dato: `${f.periodo}-01-01`,
          atributos: {
            tabla: TABLA,
            municipio: nombreMunicipio,
            sexo: f.sexo,
            periodo: f.periodo,
            total: f.total,
            poblacion: f.total,
          },
        }));

      return { features, parcial: false, errores: [] };
    } catch (err) {
      return {
        features: [],
        parcial: true,
        errores: [err instanceof Error ? err.message : String(err)],
      };
    }
  },
};
