import { createSupabaseServer } from "@/lib/supabase-server";
import type { RegistroINCideas, CategoriaINCideas } from "./types";

export async function getRegistrosCategoria(
  codigoINE: string,
  categoria: CategoriaINCideas
): Promise<RegistroINCideas[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("incideas_registros")
    .select("*")
    .eq("codigo_ine", codigoINE)
    .eq("categoria", categoria)
    .order("nombre_oficial", { ascending: true });

  if (error || !data) return [];

  return data as RegistroINCideas[];
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

  const { data, error } = await supabase
    .from("incideas_registros")
    .select("*")
    .eq("codigo_ine", codigoINE)
    .eq("estado_validacion", estado)
    .order("categoria", { ascending: true });

  if (error || !data) return [];

  return data as RegistroINCideas[];
}

export async function getDuplicados(codigoINE: string): Promise<RegistroINCideas[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("incideas_registros")
    .select("*")
    .eq("codigo_ine", codigoINE)
    .eq("posible_duplicado", true)
    .order("nombre_oficial", { ascending: true });

  if (error || !data) return [];

  return data as RegistroINCideas[];
}
