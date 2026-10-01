import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodas } from "../paginar";
import type {
  HistorialEntrada,
  NormalizedRecord,
  RegistroExistente,
  RegistroStore,
} from "./types";

function toRow(record: NormalizedRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

export class SupabaseRegistroStore implements RegistroStore {
  constructor(private client: SupabaseClient) {}

  async findByIdOrigen(
    codigoINE: string,
    categoria: string,
    fuente: string,
    idOrigen: string
  ): Promise<RegistroExistente | null> {
    const { data, error } = await this.client
      .from("incideas_registros")
      .select("*")
      .eq("codigo_ine", codigoINE)
      .eq("categoria", categoria)
      .eq("fuente_principal", fuente)
      .eq("id_origen", idOrigen)
      .is("eliminado_en", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as RegistroExistente) ?? null;
  }

  async findByHuella(
    codigoINE: string,
    categoria: string,
    huella: string
  ): Promise<RegistroExistente | null> {
    const { data, error } = await this.client
      .from("incideas_registros")
      .select("*")
      .eq("codigo_ine", codigoINE)
      .eq("categoria", categoria)
      .eq("huella", huella)
      .is("eliminado_en", null)
      .limit(50);
    if (error) throw new Error(error.message);
    // Puede haber homónimos sin coordenadas con distinto id_origen: se prefiere el registro
    // sin identificador (el único que la huella puede emparejar).
    const filas = (data ?? []) as RegistroExistente[];
    return filas.find((r) => !r.id_origen) ?? filas[0] ?? null;
  }

  async insert(record: NormalizedRecord): Promise<RegistroExistente> {
    const { data, error } = await this.client
      .from("incideas_registros")
      .insert(toRow(record))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as RegistroExistente;
  }

  async update(
    id: string,
    changes: Record<string, unknown>,
    expectedVersion: number
  ): Promise<RegistroExistente> {
    const { data, error } = await this.client
      .from("incideas_registros")
      .update(changes)
      .eq("id", id)
      .eq("version_registro", expectedVersion)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as RegistroExistente;
  }

  async registrarHistorial(entrada: HistorialEntrada): Promise<void> {
    const { error } = await this.client.from("incideas_historial").insert({
      registro_id: entrada.registro_id,
      accion: entrada.accion,
      campo: entrada.campo ?? null,
      valor_anterior: entrada.valor_anterior ?? null,
      valor_nuevo: entrada.valor_nuevo ?? null,
      usuario: entrada.usuario ?? null,
      unidad_validadora: entrada.unidad_validadora ?? null,
      observaciones: entrada.observaciones ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async listarClavesFuente(
    codigoINE: string,
    categoria: string,
    fuente: string,
    subcategorias?: string[]
  ): Promise<{ clave: string; id: string }[]> {
    // Paginado: con más de 1000 registros por fuente y categoría, una lectura simple se
    // truncaría y las bajas quedarían sin detectar.
    const { data, error } = await leerTodas<{ id: string; id_origen: string | null; huella: string | null }>(
      (desde, hasta) => {
        let query = this.client
          .from("incideas_registros")
          .select("id,id_origen,huella")
          .eq("codigo_ine", codigoINE)
          .eq("categoria", categoria)
          .eq("fuente_principal", fuente)
          .is("eliminado_en", null);
        if (subcategorias?.length) query = query.in("subcategoria", subcategorias);
        return query.order("id", { ascending: true }).range(desde, hasta);
      }
    );
    if (error) throw new Error(error);
    return data.map((r) => ({
      clave: (r.id_origen as string) ?? (r.huella as string),
      id: r.id as string,
    }));
  }

  async marcarPosibleBaja(
    id: string,
    motivo: string,
    desactualizadoDesde: string
  ): Promise<void> {
    const { error } = await this.client
      .from("incideas_registros")
      .update({ desactualizado_desde: desactualizadoDesde, motivo_baja: motivo })
      .eq("id", id)
      // Conserva la fecha de la primera ausencia: no se reescribe en pasadas posteriores.
      .is("desactualizado_desde", null);
    if (error) throw new Error(error.message);
  }
}
