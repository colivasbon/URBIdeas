import type { Connector, ConnectorResult } from "./types";
import {
  capaICVPorMunicipio,
  esComunitatValenciana,
  puntoICV,
  texto,
  type FeatureICV,
} from "./gva-icv";
import type { FuenteRef, RawFeature } from "../pipeline/types";

export const FUENTE_GVA_SANITARIOS: FuenteRef = {
  nombre: "GVA - Sistema Valenciano de Salud, centros sanitarios (ICV WFS)",
  organismo: "Generalitat Valenciana (Conselleria de Sanidad / Institut Cartogràfic Valencià)",
  licencia: "CC BY 4.0",
  url: "https://dadesobertes.gva.es/dataset/sistema-valenciano-de-salud-centros-sanitarios-centros-de-salud",
};

/** Capas del servicio 15_SistemaValencianoSalud y su subcategoría INCideas. */
export const CAPAS_SANITARIAS: { typename: string; subcategoria: string }[] = [
  { typename: "CentrosSanitarios.Hospitales", subcategoria: "hospital" },
  { typename: "CentrosSanitarios.CentrosSalud", subcategoria: "centro_salud" },
  { typename: "CentrosSanitarios.CentrosEspecialidades", subcategoria: "centro_especialidades" },
];

export function mapearCentrosSanitarios(
  features: FeatureICV[],
  subcategoria: string
): RawFeature[] {
  return features
    .filter((f) => texto(f.properties.cen_cod))
    .map((f): RawFeature => {
      const p = f.properties;
      const via = [texto(p.cen_nombcall), texto(p.cen_numcall)].filter(Boolean).join(", ");
      return {
        id_origen: `cen_cod/${p.cen_cod}`,
        nombre: texto(p.cen_desclar) ?? `Centro ${p.cen_cod}`,
        categoria: "equipamientos",
        subcategoria,
        ...puntoICV(f),
        direccion: via || undefined,
        codigo_postal: texto(p.cen_codpos),
        gestor: "Sistema Valenciano de Salud",
        fuente: FUENTE_GVA_SANITARIOS,
        metodo_obtencion: "api",
        atributos: {
          cen_cod: p.cen_cod,
          tipo: texto(p.tipo),
          departamento_salud: texto(p.nombre_departamento),
          codigo_departamento: texto(p.codigo_departamento),
          zona_basica: texto(p.nombre_zona),
          codigo_zona: texto(p.codigo_zona),
        },
      };
    });
}

/**
 * Hospitales, centros de salud y centros de especialidades de la red pública valenciana,
 * con departamento y zona básica de salud. No aporta camas ni cartera de servicios.
 */
export const gvaCentrosSanitariosConnector: Connector = {
  id: "gva-centros-sanitarios",
  version: "1.0.0",
  nombre: "Centros sanitarios públicos (GVA)",
  descripcion: "Hospitales, centros de salud y de especialidades con departamento y zona básica.",
  categoria: "equipamientos",
  nivelAutomatizacion: "alta",
  visibilidad: "publica",
  fuente: FUENTE_GVA_SANITARIOS,
  ambito: [
    { categoria: "equipamientos", subcategorias: CAPAS_SANITARIAS.map((c) => c.subcategoria) },
  ],
  aplica: esComunitatValenciana,

  async ejecutar({ codigoINE }): Promise<ConnectorResult> {
    const features: RawFeature[] = [];
    for (const capa of CAPAS_SANITARIAS) {
      try {
        const f = await capaICVPorMunicipio("15_SistemaValencianoSalud", capa.typename, codigoINE);
        features.push(...mapearCentrosSanitarios(f, capa.subcategoria));
      } catch (err) {
        // Una capa fallida invalida la ejecución entera a efectos de bajas.
        return {
          features: [],
          parcial: true,
          errores: [`${capa.typename}: ${err instanceof Error ? err.message : String(err)}`],
        };
      }
    }
    return { features, parcial: false, errores: [] };
  },
};
