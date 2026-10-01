import { createSupabaseServerSafe } from "@/lib/supabase-server";
import { getIndicadoresSocideas, type IndicadoresSocideas } from "./fuentes-socideas";
import { leerTodas } from "./paginar";
import type { RegistroINCideas } from "./types";

export {
  pieFuentes,
  rangoTipoFuente,
  seleccionarPorFuente,
  type SeleccionFuentes,
} from "./seleccion-fuentes";

export interface MunicipioMemoria {
  codigo_ine: string;
  nombre: string;
  provincia: string;
  comunidad_autonoma: string;
  poblacion: number | null;
  lat: number | null;
  lng: number | null;
}

export interface MemoriaMunicipal {
  municipio: MunicipioMemoria;
  indicadores: IndicadoresSocideas;
  porCategoria: Record<string, RegistroINCideas[]>;
  porSubcategoria: Record<string, RegistroINCideas[]>;
  boundary: GeoJSON.Geometry | null;
  totalRegistros: number;
  /** Posibles bajas pendientes de revisión: no se presentan como inventario vigente. */
  posiblesBajas: number;
  /** Tipo de cada fuente según el catálogo incideas_fuentes (nombre → tipo). */
  tiposFuente: Map<string, string>;
}

/** Ensambla todo lo necesario para la memoria documental de un municipio,
 *  reutilizando SOCideas (indicadores) y los registros de INCideas. */
export async function getMemoriaMunicipal(codigoINE: string): Promise<MemoriaMunicipal | null> {
  const supabase = createSupabaseServerSafe();
  if (!supabase) return null;

  const { data: munRaw } = await supabase
    .from("municipios")
    .select(
      "codigo_ine,nombre,poblacion,geom,provincia:provincias!inner(nombre,comunidad_autonoma:comunidades_autonomas!inner(nombre))"
    )
    .eq("codigo_ine", codigoINE)
    .maybeSingle();
  if (!munRaw) return null;
  const mun = munRaw as unknown as {
    codigo_ine: string;
    nombre: string;
    poblacion: number | null;
    geom: { type?: string; coordinates?: [number, number] } | string | null;
    provincia: { nombre: string; comunidad_autonoma: { nombre: string } } | null;
  };
  let lat: number | null = null;
  let lng: number | null = null;
  if (mun.geom) {
    try {
      const g = typeof mun.geom === "string" ? JSON.parse(mun.geom) : mun.geom;
      if (g?.coordinates) {
        lng = g.coordinates[0];
        lat = g.coordinates[1];
      }
    } catch {
      /* geometría no parseable */
    }
  }

  const { data: todos } = await leerTodas<RegistroINCideas>((desde, hasta) =>
    supabase
      .from("incideas_registros")
      .select("*")
      .eq("codigo_ine", codigoINE)
      .is("eliminado_en", null)
      .not("visibilidad", "in", "(restringida,personal_protegida)")
      .order("nombre_oficial", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );
  const posiblesBajas = todos.filter((r) => r.desactualizado_desde).length;
  const registros = todos.filter((r) => !r.desactualizado_desde);
  const porCategoria: Record<string, RegistroINCideas[]> = {};
  const porSubcategoria: Record<string, RegistroINCideas[]> = {};
  let boundary: GeoJSON.Geometry | null = null;

  for (const r of registros) {
    (porCategoria[r.categoria] ??= []).push(r);
    const key = `${r.categoria}/${r.subcategoria ?? "otros"}`;
    (porSubcategoria[key] ??= []).push(r);
    if (r.subcategoria === "limite_municipal" && r.geometria) {
      boundary = (typeof r.geometria === "string"
        ? JSON.parse(r.geometria)
        : r.geometria) as GeoJSON.Geometry;
    }
  }

  const indicadores = await getIndicadoresSocideas(codigoINE);

  const { data: fuentes } = await supabase.from("incideas_fuentes").select("nombre,tipo");
  const tiposFuente = new Map<string, string>(
    ((fuentes ?? []) as { nombre: string; tipo: string }[]).map((f) => [f.nombre, f.tipo])
  );

  return {
    municipio: {
      codigo_ine: mun.codigo_ine,
      nombre: mun.nombre,
      provincia: mun.provincia?.nombre ?? "",
      comunidad_autonoma: mun.provincia?.comunidad_autonoma?.nombre ?? "",
      poblacion: mun.poblacion,
      lat,
      lng,
    },
    indicadores,
    porCategoria,
    porSubcategoria,
    boundary,
    totalRegistros: registros.length,
    posiblesBajas,
    tiposFuente,
  };
}

export function ind(
  m: MemoriaMunicipal,
  slug: string
): { valor: number | null; anio: number | null } {
  const i = m.indicadores.get(slug);
  return { valor: i?.ultimoValor ?? null, anio: i?.ultimoAnio ?? null };
}

export function serie(m: MemoriaMunicipal, slug: string) {
  return m.indicadores.get(slug)?.serie ?? [];
}

export function fmtNumero(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(v);
}
