// Fase 3 — Tabla de control (incideas_cobertura) y snapshots.
//
// Solo servidor/scripts (service_role). Los estados son los del contrato;
// un fallo nunca borra la última versión válida (upsert por clave).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type EstadoBloque =
  | "cargado"
  | "cargado_parcial"
  | "sin_cobertura"
  | "no_aplicable"
  | "fuente_caida"
  | "cero_resultados"
  | "pendiente_aportacion";

export interface RegistroCobertura {
  municipio: string;
  bloque: string;
  fuente: string;
  edicion: string;
  estado: EstadoBloque;
  objetos_leidos: number;
  objetos_publicados: number;
  errores: number;
  reintentos: number;
  version_conector: string;
  snapshot: string | null;
}

let cliente: SupabaseClient | null = null;

export function controlClient(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  cliente = createClient(url, key);
  return cliente;
}

export async function registrarCobertura(r: RegistroCobertura): Promise<void> {
  const c = controlClient();
  const ahora = new Date().toISOString();
  const { error } = await c.from("incideas_cobertura").upsert(
    {
      municipio: r.municipio,
      bloque: r.bloque,
      fuente: r.fuente,
      edicion: r.edicion,
      estado: r.estado,
      fin: ahora,
      objetos_leidos: r.objetos_leidos,
      objetos_publicados: r.objetos_publicados,
      errores: r.errores,
      reintentos: r.reintentos,
      version_conector: r.version_conector,
      snapshot: r.snapshot,
    },
    { onConflict: "municipio,bloque,fuente,edicion" }
  );
  if (error) throw new Error(`cobertura upsert: ${error.message}`);
  // Último ÉXITO vale: solo una fila cargada/parcial elimina ediciones
  // anteriores del mismo triple. Un fallo nunca borra lo último válido
  // (antes un fallo reciente eliminaba la fila cargada: corregido).
  if (r.estado === "cargado" || r.estado === "cargado_parcial") {
    const { error: e2 } = await c
      .from("incideas_cobertura")
      .delete()
      .eq("municipio", r.municipio)
      .eq("bloque", r.bloque)
      .eq("fuente", r.fuente)
      .neq("edicion", r.edicion);
    if (e2) throw new Error(`cobertura limpieza: ${e2.message}`);
  }
}

/** Snapshot derivada de ediciones + recuentos + versión de algoritmo. */
export function calcularSnapshot(items: Array<{ bloque: string; fuente: string; edicion: string; n: number }>, algoritmo: string): string {
  const base = JSON.stringify({ items, algoritmo });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < base.length; i++) {
    h1 = Math.imul(h1 ^ base.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + base.charCodeAt(i), 31);
  }
  return `incideas:snap:${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

export async function registrarSnapshot(id: string, notas: string, algoritmo: string, estado: "borrador" | "aprobada" | "retirada" = "borrador"): Promise<void> {
  const c = controlClient();
  const { error } = await c.from("incideas_snapshots").upsert(
    { id, fuentes_hash: id, algoritmo_version: algoritmo, estado, notas },
    { onConflict: "id" }
  );
  if (error) throw new Error(`snapshot upsert: ${error.message}`);
}
