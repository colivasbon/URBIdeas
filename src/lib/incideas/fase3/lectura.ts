// Fase 3 — Lectura web de bloques (cliente servidor anónimo; RLS de lectura).
//
// La web lee control (Supabase) + objetos (R2 público). Nunca escribe.

import { createSupabaseServer } from "@/lib/supabase-server";

export interface FilaCobertura {
  municipio: string;
  bloque: string;
  bloque_nombre: string;
  fase: number;
  fuente: string;
  fuente_organismo: string;
  edicion: string;
  estado: string;
  objetos_publicados: number;
  fin: string | null;
  version_conector: string;
}

export async function getCoberturaMunicipio(codigoINE: string): Promise<FilaCobertura[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("incideas_cobertura")
    .select("municipio,bloque,fuente,edicion,estado,objetos_publicados,fin,version_conector,incideas_bloques!inner(nombre,fase),incideas_fuentes_nac!inner(organismo)")
    .eq("municipio", codigoINE)
    .order("bloque", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as Array<Record<string, unknown>>).map((r) => {
    const b = (r["incideas_bloques"] ?? {}) as Record<string, unknown>;
    const f = (r["incideas_fuentes_nac"] ?? {}) as Record<string, unknown>;
    return {
      municipio: String(r["municipio"] ?? ""),
      bloque: String(r["bloque"] ?? ""),
      bloque_nombre: String(b["nombre"] ?? r["bloque"] ?? ""),
      fase: Number(b["fase"] ?? 0),
      fuente: String(r["fuente"] ?? ""),
      fuente_organismo: String(f["organismo"] ?? ""),
      edicion: String(r["edicion"] ?? ""),
      estado: String(r["estado"] ?? ""),
      objetos_publicados: Number(r["objetos_publicados"] ?? 0),
      fin: typeof r["fin"] === "string" ? (r["fin"] as string) : null,
      version_conector: String(r["version_conector"] ?? ""),
    };
  });
}

export interface ResumenBloque {
  bloque: string;
  bloque_nombre: string;
  fase: number;
  cargado: number;
  parcial: number;
  sin: number;
  municipios: number;
}

export async function getResumenCobertura(): Promise<ResumenBloque[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("incideas_cobertura")
    .select("municipio,bloque,estado,incideas_bloques!inner(nombre,fase)");
  if (error || !data) return [];
  const agg = new Map<string, ResumenBloque & { muns: Set<string> }>();
  for (const r of data as unknown as Array<Record<string, unknown>>) {
    const b = String(r["bloque"] ?? "");
    const bl = (r["incideas_bloques"] ?? {}) as Record<string, unknown>;
    let e = agg.get(b);
    if (!e) {
      e = { bloque: b, bloque_nombre: String(bl["nombre"] ?? b), fase: Number(bl["fase"] ?? 0), cargado: 0, parcial: 0, sin: 0, municipios: 0, muns: new Set<string>() };
      agg.set(b, e);
    }
    const est = String(r["estado"] ?? "");
    if (est === "cargado") e.cargado++;
    else if (est === "cargado_parcial") e.parcial++;
    else e.sin++;
    e.muns.add(String(r["municipio"] ?? ""));
  }
  return [...agg.values()]
    .map((e) => ({ bloque: e.bloque, bloque_nombre: e.bloque_nombre, fase: e.fase, cargado: e.cargado, parcial: e.parcial, sin: e.sin, municipios: e.muns.size }))
    .sort((a, b) => a.fase - b.fase || (a.bloque < b.bloque ? -1 : 1));
}

export async function getUltimaSnapshot(): Promise<{ id: string; estado: string; creado_en: string } | null> {
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("incideas_snapshots").select("id,estado,creado_en").order("creado_en", { ascending: false }).limit(1);
  const r = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!r) return null;
  return { id: String(r["id"] ?? ""), estado: String(r["estado"] ?? ""), creado_en: String(r["creado_en"] ?? "") };
}
