import type { Connector, ConnectorResult } from "./types";
import { fetchConReintentos } from "./http";
import { pointInPolygon } from "../pipeline/geo";
import { normalizeName } from "../pipeline/normalize";
import type { FuenteRef, RawFeature } from "../pipeline/types";

const BASE =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";

export const FUENTE_MINETUR: FuenteRef = {
  nombre: "Geoportal de Gasolineras (MITECO, API REST)",
  organismo: "Ministerio para la Transición Ecológica y el Reto Demográfico",
  licencia: "Reutilización de información del sector público (Ley 37/2007), citando la fuente",
  url: `${BASE}/`,
};

export interface MunicipioMinetur {
  IDMunicipio: string;
  IDProvincia: string;
  Municipio: string;
}

export interface EstacionMinetur {
  IDEESS: string;
  IDMunicipio: string;
  "Rótulo"?: string;
  "Dirección"?: string;
  "C.P."?: string;
  Horario?: string;
  Latitud?: string;
  "Longitud (WGS84)"?: string;
  Localidad?: string;
  Margen?: string;
  "Tipo Venta"?: string;
  "Remisión"?: string;
}

/** Variantes comparables de un nombre: «Vila Joiosa, la/Villajoyosa» → [«la vila joiosa», «villajoyosa», …]. */
export function variantesNombre(nombre: string): string[] {
  const out = new Set<string>();
  for (const parte of nombre.split("/")) {
    const n = normalizeName(parte);
    if (!n) continue;
    out.add(n);
    const art = n.match(/^(.*) (el|la|los|las|l|els|les|o|a|os|as)$/);
    if (art) {
      out.add(`${art[2]} ${art[1]}`);
      out.add(art[1]);
    }
  }
  return [...out];
}

/** IDMunicipio interno de MINETUR cuyo nombre coincide con el del municipio. */
export function resolverIdMunicipio(
  municipios: MunicipioMinetur[],
  nombre: string
): string | null {
  const buscadas = new Set(variantesNombre(nombre));
  const hits = municipios.filter((m) => variantesNombre(m.Municipio).some((v) => buscadas.has(v)));
  return hits.length === 1 ? hits[0].IDMunicipio : null;
}

const num = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** «01/10/2026 12:02:41» → «2026-10-01». */
export function fechaMinetur(fecha: string | undefined): string | undefined {
  const m = fecha?.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/**
 * Estaciones → RawFeature. Los precios se descartan a propósito: cambian a diario y
 * generarían una actualización por estación en cada ejecución sin valor para la planificación.
 */
export function mapearEstaciones(lista: EstacionMinetur[], fechaDato?: string): RawFeature[] {
  return lista.map((e) => {
    const rotulo = (e["Rótulo"] ?? "").trim();
    const direccion = (e["Dirección"] ?? "").trim();
    return {
      id_origen: `IDEESS/${e.IDEESS}`,
      nombre: rotulo ? `${rotulo} · ${direccion}` : direccion || `Estación ${e.IDEESS}`,
      categoria: "servicios_basicos",
      subcategoria: "estacion_servicio",
      lat: num(e.Latitud),
      lon: num(e["Longitud (WGS84)"]),
      direccion: direccion || undefined,
      codigo_postal: e["C.P."] || undefined,
      horario: e.Horario || undefined,
      gestor: rotulo || undefined,
      fuente: FUENTE_MINETUR,
      fecha_dato: fechaDato,
      metodo_obtencion: "api",
      atributos: {
        ideess: e.IDEESS,
        id_municipio_minetur: e.IDMunicipio,
        localidad: e.Localidad,
        margen: e.Margen,
        tipo_venta: e["Tipo Venta"],
        remision: e["Remisión"],
      },
    };
  });
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchConReintentos(`${BASE}/${path}`, {
    headers: { Accept: "application/json" },
    timeoutMs: 60000,
    reintentos: 3,
  });
  return (await res.json()) as T;
}

interface RespuestaEstaciones {
  Fecha?: string;
  ListaEESSPrecio?: EstacionMinetur[];
  ResultadoConsulta?: string;
}

/**
 * Estaciones de servicio terrestres del Geoportal de Gasolineras (fuente oficial, nacional).
 * El municipio se resuelve por nombre en el listado provincial de MINETUR; si no hay
 * coincidencia única, se filtran las estaciones de la provincia por el límite municipal.
 */
export const mineturCarburantesConnector: Connector = {
  id: "minetur-carburantes",
  version: "1.0.0",
  nombre: "Estaciones de servicio (Geoportal de Gasolineras)",
  descripcion: "Estaciones de servicio terrestres con dirección, horario y coordenadas.",
  categoria: "servicios_basicos",
  nivelAutomatizacion: "alta",
  visibilidad: "publica",
  fuente: FUENTE_MINETUR,
  ambito: [{ categoria: "servicios_basicos", subcategorias: ["estacion_servicio"] }],

  async ejecutar({ codigoINE, boundary, parametros }): Promise<ConnectorResult> {
    const provincia = codigoINE.slice(0, 2);
    const nombre = typeof parametros?.nombre_municipio === "string" ? parametros.nombre_municipio : "";
    try {
      let idMunicipio: string | null = null;
      if (nombre) {
        const municipios = await getJson<MunicipioMinetur[]>(
          `Listados/MunicipiosPorProvincia/${provincia}`
        );
        idMunicipio = resolverIdMunicipio(municipios, nombre);
      }

      if (idMunicipio) {
        const r = await getJson<RespuestaEstaciones>(
          `EstacionesTerrestres/FiltroMunicipio/${idMunicipio}`
        );
        if (r.ResultadoConsulta !== "OK") {
          return { features: [], parcial: true, errores: [`MINETUR: ${r.ResultadoConsulta}`] };
        }
        return {
          features: mapearEstaciones(r.ListaEESSPrecio ?? [], fechaMinetur(r.Fecha)),
          parcial: false,
          errores: [],
        };
      }

      if (!boundary) {
        return {
          features: [],
          parcial: true,
          errores: ["Municipio no resuelto por nombre en MINETUR y sin límite para filtrar"],
        };
      }
      const r = await getJson<RespuestaEstaciones>(
        `EstacionesTerrestres/FiltroProvincia/${provincia}`
      );
      if (r.ResultadoConsulta !== "OK") {
        return { features: [], parcial: true, errores: [`MINETUR: ${r.ResultadoConsulta}`] };
      }
      const dentro = (r.ListaEESSPrecio ?? []).filter((e) => {
        const lat = num(e.Latitud);
        const lng = num(e["Longitud (WGS84)"]);
        return lat !== undefined && lng !== undefined && pointInPolygon({ lat, lng }, boundary);
      });
      return {
        features: mapearEstaciones(dentro, fechaMinetur(r.Fecha)),
        parcial: false,
        errores: ["Municipio resuelto por límite geográfico, no por nombre"],
      };
    } catch (err) {
      return {
        features: [],
        parcial: true,
        errores: [err instanceof Error ? err.message : String(err)],
      };
    }
  },
};
