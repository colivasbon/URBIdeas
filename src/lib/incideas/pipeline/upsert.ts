import type {
  EjecucionContext,
  NormalizedRecord,
  RegistroExistente,
  RegistroStore,
  UpsertCounts,
} from "./types";

/** Campos que una carga automática puede escribir en un registro existente. */
export const CAMPOS_ACTUALIZABLES: (keyof NormalizedRecord)[] = [
  "nombre_oficial",
  "nombre_normalizado",
  "nombre_origen",
  "subcategoria",
  "direccion",
  "direccion_normalizada",
  "telefono_publico",
  "telefono_normalizado",
  "web",
  "codigo_postal",
  "nucleo",
  "distrito",
  "barrio",
  "descripcion",
  "titularidad",
  "gestor",
  "horario",
  "capacidad",
  "unidad_capacidad",
  "aforo",
  "personal_publicado",
  "coordenadas",
  "geometria",
  "tipo_geometria",
  "url_fuente",
  "fecha_dato",
  "estado_espacial",
  "atributos",
];

/** Estados que una carga automática NUNCA debe sobrescribir. */
export const ESTADOS_PROTEGIDOS = new Set<string>([
  "validado_tecnicamente",
  "validado_ayuntamiento",
  "restringido",
  "personal_protegida",
]);

function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function claveDe(record: NormalizedRecord): string {
  return record.id_origen ?? record.huella;
}

export interface ProcessLoteOpciones {
  /** Si false, no se marcan posibles bajas (respuesta parcial de la fuente). */
  permitirBajas?: boolean;
  usuario?: string;
}

/**
 * Procesa un lote normalizado de forma idempotente:
 * - inserta lo nuevo,
 * - actualiza lo cambiado sin duplicar,
 * - nunca sobrescribe un registro validado,
 * - conserva historial por campo cambiado,
 * - marca posibles bajas sin borrar nada.
 *
 * La lógica es pura respecto al store, por lo que se prueba en memoria.
 */
export async function procesarLote(
  store: RegistroStore,
  ctx: EjecucionContext,
  records: NormalizedRecord[],
  opciones: ProcessLoteOpciones = {}
): Promise<UpsertCounts> {
  const permitirBajas = opciones.permitirBajas ?? true;
  const counts: UpsertCounts = {
    insertados: 0,
    actualizados: 0,
    sin_cambios: 0,
    posibles_bajas: 0,
    rechazados: 0,
    errores: [],
    claves_vistas: [],
  };
  const vistas = new Set<string>();
  const ahora = new Date().toISOString();

  for (const record of records) {
    const clave = claveDe(record);
    try {
      let existing: RegistroExistente | null = null;
      if (record.id_origen) {
        existing = await store.findByIdOrigen(
          ctx.codigo_ine,
          record.categoria,
          record.fuente_principal,
          record.id_origen
        );
      }
      if (!existing) {
        existing = await store.findByHuella(ctx.codigo_ine, record.categoria, record.huella);
      }

      if (!existing) {
        const inserted = await store.insert(record);
        await store.registrarHistorial({
          registro_id: inserted.id,
          accion: "creado",
          usuario: opciones.usuario,
          observaciones: `Creado por ${ctx.conector} v${ctx.version_conector}`,
        });
        counts.insertados++;
        vistas.add(clave);
        counts.claves_vistas.push(clave);
        continue;
      }

      vistas.add(clave);
      counts.claves_vistas.push(clave);

      if (ESTADOS_PROTEGIDOS.has(existing.estado_validacion)) {
        await store.registrarHistorial({
          registro_id: existing.id,
          accion: "observar",
          usuario: opciones.usuario,
          observaciones:
            "Carga automática ignorada: el registro tiene validación de mayor confianza. Se conserva el valor validado.",
        });
        counts.sin_cambios++;
        continue;
      }

      const changes: Record<string, unknown> = {};
      const procedenciaExistente =
        (existing.procedencia_atributos as Record<string, unknown> | undefined) ?? {};
      const procedenciaNueva: Record<string, unknown> = { ...procedenciaExistente };

      for (const campo of CAMPOS_ACTUALIZABLES) {
        const nuevo = record[campo];
        const viejo = existing[campo as string];
        if (!igual(nuevo, viejo)) {
          changes[campo as string] = nuevo;
          if (record.procedencia_atributos[campo as string]) {
            procedenciaNueva[campo as string] = record.procedencia_atributos[campo as string];
          }
          await store.registrarHistorial({
            registro_id: existing.id,
            accion: "actualizado",
            campo: campo as string,
            valor_anterior: viejo === undefined || viejo === null ? null : JSON.stringify(viejo),
            valor_nuevo: nuevo === undefined || nuevo === null ? null : JSON.stringify(nuevo),
            usuario: opciones.usuario,
            observaciones: `Actualizado por ${ctx.conector} v${ctx.version_conector}`,
          });
        }
      }

      // Completar id_origen si apareció y antes no estaba.
      if (record.id_origen && !existing.id_origen) {
        changes.id_origen = record.id_origen;
      }

      if (Object.keys(changes).length === 0) {
        // Sin cambios de valor: refrescar metadatos de vigencia.
        await store.update(
          existing.id,
          { fecha_consulta: ahora, desactualizado_desde: null },
          existing.version_registro
        );
        counts.sin_cambios++;
      } else {
        changes.procedencia_atributos = procedenciaNueva;
        changes.version_registro = existing.version_registro + 1;
        changes.desactualizado_desde = null;
        changes.fecha_consulta = ahora;
        await store.update(existing.id, changes, existing.version_registro);
        counts.actualizados++;
      }
    } catch (err) {
      counts.rechazados++;
      counts.errores.push(
        `${record.nombre_oficial}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (permitirBajas) {
    const existentes = await store.listarClavesFuente(
      ctx.codigo_ine,
      ctx.categoria,
      ctx.fuente.nombre
    );
    for (const e of existentes) {
      if (!vistas.has(e.clave)) {
        await store.marcarPosibleBaja(e.id, `No aparece en la ejecución ${ctx.id}`, ahora);
        counts.posibles_bajas++;
      }
    }
  }

  return counts;
}
