import type { Connector, ConnectorResult } from "./types";
import {
  capaICVPorMunicipio,
  esComunitatValenciana,
  puntoICV,
  texto,
  type FeatureICV,
} from "./gva-icv";
import type { FuenteRef, RawFeature } from "../pipeline/types";

export const FUENTE_GVA_DOCENTES: FuenteRef = {
  nombre: "GVA - Centros docentes de la Comunitat Valenciana (ICV WFS)",
  organismo: "Generalitat Valenciana (Conselleria de Educación / Institut Cartogràfic Valencià)",
  licencia: "CC BY 4.0",
  url: "https://dadesobertes.gva.es/dataset/centros-docentes-de-la-comunitat-valenciana4",
};

/** Tipo genérico del registro de centros → subcategoría INCideas. */
export function subcategoriaDocente(tipo: string | null | undefined): string {
  const t = (tipo ?? "").toUpperCase();
  if (/EDUCACI[ÓO]N ESPECIAL/.test(t)) return "educacion_especial";
  if (/COLEGIO|PRIMARIA/.test(t)) return "colegio";
  if (/SECUNDARIA|INSTITUTO|BACHILLER/.test(t)) return "instituto";
  if (/INFANTIL/.test(t)) return "escuela_infantil";
  return "centro_formacion";
}

export function mapearCentrosDocentes(features: FeatureICV[]): RawFeature[] {
  return features
    .filter((f) => texto(f.properties.codcen))
    .map((f): RawFeature => {
      const p = f.properties;
      return {
        id_origen: `codcen/${p.codcen}`,
        nombre: texto(p.dlibre) ?? texto(p.despecifica) ?? `Centro ${p.codcen}`,
        categoria: "equipamientos",
        subcategoria: subcategoriaDocente(p.dgenerica_cas),
        ...puntoICV(f),
        direccion: texto(p.direccion),
        codigo_postal: texto(p.codpos),
        telefono: texto(p.telef),
        web: texto(p.web),
        nucleo: texto(p.localidad_oficial),
        titularidad: texto(p.regimen),
        gestor: texto(p.titular),
        fuente: FUENTE_GVA_DOCENTES,
        metodo_obtencion: "api",
        atributos: {
          codcen: p.codcen,
          tipo: texto(p.dgenerica_cas),
          regimen: texto(p.regimen),
          estado: texto(p.desc_estado),
          email_centro: texto(p.mail),
        },
      };
    });
}

/**
 * Registro oficial de centros docentes no universitarios de la Comunitat Valenciana
 * (públicos, concertados y privados), con código de centro estable.
 */
export const gvaCentrosDocentesConnector: Connector = {
  id: "gva-centros-docentes",
  version: "1.0.0",
  nombre: "Centros docentes (GVA)",
  descripcion: "Centros docentes no universitarios con código de centro, régimen y titular.",
  categoria: "equipamientos",
  nivelAutomatizacion: "alta",
  visibilidad: "publica",
  fuente: FUENTE_GVA_DOCENTES,
  ambito: [
    {
      categoria: "equipamientos",
      subcategorias: [
        "colegio",
        "instituto",
        "escuela_infantil",
        "educacion_especial",
        "centro_formacion",
      ],
    },
  ],
  aplica: esComunitatValenciana,

  async ejecutar({ codigoINE }): Promise<ConnectorResult> {
    try {
      const features = await capaICVPorMunicipio(
        "12_Centros_wfs",
        "CentrosDocentesRegimen",
        codigoINE
      );
      return { features: mapearCentrosDocentes(features), parcial: false, errores: [] };
    } catch (err) {
      return {
        features: [],
        parcial: true,
        errores: [err instanceof Error ? err.message : String(err)],
      };
    }
  },
};
