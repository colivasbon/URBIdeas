import { createSupabaseServer } from "@/lib/supabase-server";
import { leerTodas } from "./paginar";
import type { RegistroINCideas, CategoriaINCideas } from "./types";

/** Visibilidades que nunca se muestran en páginas públicas. */
const OCULTAS = "(restringida,personal_protegida)";

export async function getRegistrosCategoria(
  codigoINE: string,
  categoria: CategoriaINCideas
): Promise<RegistroINCideas[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await leerTodas<RegistroINCideas>((desde, hasta) =>
    supabase
      .from("incideas_registros")
      .select("*")
      .eq("codigo_ine", codigoINE)
      .eq("categoria", categoria)
      .is("eliminado_en", null)
      .not("visibilidad", "in", OCULTAS)
      .order("nombre_oficial", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );

  return error ? [] : data;
}

export async function getRegistroById(id: string): Promise<RegistroINCideas | null> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("incideas_registros")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return data as RegistroINCideas;
}

export async function getRegistrosPorEstado(
  codigoINE: string,
  estado: string
): Promise<RegistroINCideas[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await leerTodas<RegistroINCideas>((desde, hasta) =>
    supabase
      .from("incideas_registros")
      .select("*")
      .eq("codigo_ine", codigoINE)
      .eq("estado_validacion", estado)
      .is("eliminado_en", null)
      .not("visibilidad", "in", OCULTAS)
      .order("categoria", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );

  return error ? [] : data;
}

export async function getDuplicados(codigoINE: string): Promise<RegistroINCideas[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await leerTodas<RegistroINCideas>((desde, hasta) =>
    supabase
      .from("incideas_registros")
      .select("*")
      .eq("codigo_ine", codigoINE)
      .eq("posible_duplicado", true)
      .is("eliminado_en", null)
      .not("visibilidad", "in", OCULTAS)
      .order("nombre_oficial", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );

  return error ? [] : data;
}
