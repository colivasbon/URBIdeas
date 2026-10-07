// Fase 3 — Tabla de control (incideas_cobertura) y snapshots.
//
// Solo servidor/scripts (service_role). Los estados son los del contrato;
// un fallo nunca borra la última versión válida (upsert por clave).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Versión de los conectores que producen los datos (entra en el id de snapshot). */
export const CONECTOR_VERSION = "fase3-h2-v1";

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
  } else if (r.estado !== "fuente_caida") {
    // Resultado definitivo no exitoso (cero/sin cobertura/no aplicable):
    // retira marcadores de fallo anteriores del mismo triple; la versión
    // válida anterior, si existe, se conserva.
    const { error: e2 } = await c
      .from("incideas_cobertura")
      .delete()
      .eq("municipio", r.municipio)
      .eq("bloque", r.bloque)
      .eq("fuente", r.fuente)
      .eq("estado", "fuente_caida");
    if (e2) throw new Error(`cobertura limpieza de fallos: ${e2.message}`);
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

// --- Sello de snapshot desde la tabla de control -------------------------
//
// Aprobar una oleada re-ejecutando el cargador es inviable a escala nacional
// (re-descarga 8.132 municipios). El sello deriva el mismo estado lógico
// (pares cargado/cargado_parcial con objetos publicados) directamente de
// incideas_cobertura, en un orden canónico estable: mismo control -> mismo id.

/** Orden canónico de bloques (pasos 1..10 del cargador). */
export const ORDEN_BLOQUES_FASE3 = [
  "limites",
  "poblacion",
  "combustible",
  "sanidad",
  "farmacias",
  "recarga",
  "depuradoras",
  "educacion",
  "hidrografia",
  "inundabilidad",
] as const;

/** Fuentes base por orden de carga; las autonómicas (desconocidas) van tras su base. */
const ORDEN_FUENTES_FASE3 = [
  "ign-au",
  "ine-dpop",
  "minetur-carburantes",
  "regcess",
  "regcess-e",
  "nap-recarga",
  "prtr",
  "rcd",
  "ign-hidro",
  "snczi-inspire",
  "patricova",
];

function rangoFuente(fuente: string): number {
  const i = ORDEN_FUENTES_FASE3.indexOf(fuente);
  return i >= 0 ? i : 1000;
}

export interface ItemSnapshot {
  bloque: string;
  fuente: string;
  edicion: string;
  n: number;
}

export interface FilaControlSnapshot {
  municipio: string;
  bloque: string;
  fuente: string;
  edicion: string;
  estado: EstadoBloque;
  objetos_publicados: number;
}

export function compararItemsSnapshot(a: ItemSnapshot, b: ItemSnapshot): number {
  const ia = a.bloque.slice(0, a.bloque.indexOf(":"));
  const ib = b.bloque.slice(0, b.bloque.indexOf(":"));
  if (ia !== ib) return ia < ib ? -1 : 1;
  const ba = a.bloque.slice(a.bloque.indexOf(":") + 1);
  const bb = b.bloque.slice(b.bloque.indexOf(":") + 1);
  const oa = ORDEN_BLOQUES_FASE3.indexOf(ba as (typeof ORDEN_BLOQUES_FASE3)[number]);
  const ob = ORDEN_BLOQUES_FASE3.indexOf(bb as (typeof ORDEN_BLOQUES_FASE3)[number]);
  if (oa !== ob) return oa - ob;
  const ra = rangoFuente(a.fuente);
  const rb = rangoFuente(b.fuente);
  if (ra !== rb) return ra - rb;
  if (a.fuente !== b.fuente) return a.fuente < b.fuente ? -1 : 1;
  if (a.edicion !== b.edicion) return a.edicion < b.edicion ? -1 : 1;
  return a.n - b.n;
}

/**
 * Lista canónica de pares para el snapshot a partir del control.
 * Mismo filtro que el cargador (`plan.filter(n > 0)`) para estados limpios:
 * solo cargado/cargado_parcial con objetos publicados > 0.
 */
export function itemsDesdeControl(filas: FilaControlSnapshot[]): ItemSnapshot[] {
  return filas
    .filter((f) => (f.estado === "cargado" || f.estado === "cargado_parcial") && f.objetos_publicados > 0)
    .map((f) => ({ bloque: `${f.municipio}:${f.bloque}`, fuente: f.fuente, edicion: f.edicion, n: f.objetos_publicados }))
    .sort(compararItemsSnapshot);
}
