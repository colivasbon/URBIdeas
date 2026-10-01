import type {
  HistorialEntrada,
  NormalizedRecord,
  RegistroExistente,
  RegistroStore,
} from "./types";

/**
 * Store en memoria para pruebas del motor idempotente sin base de datos.
 * Reproduce la semántica de store-supabase.ts (claves, protección de validados, bajas).
 */
export class MemoryRegistroStore implements RegistroStore {
  private rows = new Map<string, Record<string, unknown>>();
  private seq = 0;
  public historial: HistorialEntrada[] = [];

  private clone(r: Record<string, unknown>): RegistroExistente {
    return { ...r } as RegistroExistente;
  }

  async findByIdOrigen(
    codigoINE: string,
    categoria: string,
    fuente: string,
    idOrigen: string
  ): Promise<RegistroExistente | null> {
    for (const r of this.rows.values()) {
      if (
        r.codigo_ine === codigoINE &&
        r.categoria === categoria &&
        r.fuente_principal === fuente &&
        r.id_origen === idOrigen &&
        !r.eliminado_en
      ) {
        return this.clone(r);
      }
    }
    return null;
  }

  async findByHuella(
    codigoINE: string,
    categoria: string,
    huella: string
  ): Promise<RegistroExistente | null> {
    for (const r of this.rows.values()) {
      if (
        r.codigo_ine === codigoINE &&
        r.categoria === categoria &&
        r.huella === huella &&
        !r.eliminado_en
      ) {
        return this.clone(r);
      }
    }
    return null;
  }

  async insert(record: NormalizedRecord): Promise<RegistroExistente> {
    const id = `mem-${++this.seq}`;
    const row: Record<string, unknown> = {
      ...record,
      id,
      version_registro: 1,
      desactualizado_desde: null,
      eliminado_en: null,
    };
    this.rows.set(id, row);
    return this.clone(row);
  }

  async update(
    id: string,
    changes: Record<string, unknown>,
    expectedVersion: number
  ): Promise<RegistroExistente> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Registro ${id} no encontrado`);
    if (row.version_registro !== expectedVersion) {
      throw new Error(`Conflicto de versión en ${id}`);
    }
    Object.assign(row, changes);
    return this.clone(row);
  }

  async registrarHistorial(entrada: HistorialEntrada): Promise<void> {
    this.historial.push(entrada);
  }

  async listarClavesFuente(
    codigoINE: string,
    categoria: string,
    fuente: string
  ): Promise<{ clave: string; id: string }[]> {
    const out: { clave: string; id: string }[] = [];
    for (const r of this.rows.values()) {
      if (
        r.codigo_ine === codigoINE &&
        r.categoria === categoria &&
        r.fuente_principal === fuente &&
        !r.eliminado_en
      ) {
        const clave = (r.id_origen as string) ?? (r.huella as string);
        out.push({ clave, id: r.id as string });
      }
    }
    return out;
  }

  async marcarPosibleBaja(
    id: string,
    motivo: string,
    desactualizadoDesde: string
  ): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.desactualizado_desde = desactualizadoDesde;
    row.motivo_baja = motivo;
  }
}
