// Dependencias compartidas de los scripts INCideas (memoria y Supabase).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerDeps } from "../../src/lib/incideas/pipeline/runner";
import { MemoryRegistroStore } from "../../src/lib/incideas/pipeline/memory-store";
import { SupabaseRegistroStore } from "../../src/lib/incideas/pipeline/store-supabase";

export function depsMemoria(): RunnerDeps {
  const store = new MemoryRegistroStore();
  let seq = 0;
  return {
    store,
    iniciarEjecucion: async () => `mem-ej-${++seq}`,
    finalizarEjecucion: async () => {},
  };
}

export function depsSupabase(supabase: SupabaseClient): RunnerDeps {
  const store = new SupabaseRegistroStore(supabase);
  return {
    store,
    iniciarEjecucion: async (input) => {
      const { data, error } = await supabase
        .from("incideas_ejecuciones")
        .insert({
          conector: input.conector,
          version_conector: input.version_conector,
          codigo_ine: input.codigo_ine,
          categoria: input.categoria,
          id_fuente: input.id_fuente ?? null,
          parametros: input.parametros,
          estado: "en_curso",
        })
        .select("id")
        .single();
      if (error) throw new Error(`No se pudo crear la ejecución: ${error.message}`);
      return data.id as string;
    },
    finalizarEjecucion: async (id, patch) => {
      const { error } = await supabase.from("incideas_ejecuciones").update(patch).eq("id", id);
      if (error) throw new Error(`No se pudo cerrar la ejecución: ${error.message}`);
    },
    resolverFuente: async (nombre) => {
      const { data } = await supabase
        .from("incideas_fuentes")
        .select("id")
        .eq("nombre", nombre)
        .maybeSingle();
      return data?.id as string | undefined;
    },
  };
}

export async function cargarBoundaryDeBD(
  supabase: SupabaseClient,
  codigoINE: string
): Promise<GeoJSON.Geometry | null> {
  const { data } = await supabase
    .from("incideas_registros")
    .select("geometria")
    .eq("codigo_ine", codigoINE)
    .eq("subcategoria", "limite_municipal")
    .is("eliminado_en", null)
    .limit(1)
    .maybeSingle();
  if (!data?.geometria) return null;
  const g = data.geometria;
  return typeof g === "string" ? (JSON.parse(g) as GeoJSON.Geometry) : (g as GeoJSON.Geometry);
}
