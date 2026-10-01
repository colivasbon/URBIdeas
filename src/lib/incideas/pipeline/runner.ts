import type { Connector } from "../connectors/types";
import { normalizeFeature } from "./normalize";
import { validarEspacial } from "./geo";
import { procesarLote } from "./upsert";
import { detectarDuplicados, type CandidatoDedup } from "./dedup";
import type { EjecucionContext, RegistroStore, UpsertCounts } from "./types";

export interface IniciarEjecucionInput {
  conector: string;
  version_conector: string;
  codigo_ine: string;
  categoria: string;
  id_fuente?: string;
  parametros: Record<string, unknown>;
}

export interface FinalizarEjecucionInput {
  estado: "completada" | "parcial" | "fallida";
  fecha_fin: string;
  registros_leidos: number;
  registros_insertados: number;
  registros_actualizados: number;
  registros_sin_cambios: number;
  posibles_bajas: number;
  registros_rechazados: number;
  errores: string[];
  resumen_calidad: Record<string, unknown>;
}

export interface RunnerDeps {
  store: RegistroStore;
  iniciarEjecucion(input: IniciarEjecucionInput): Promise<string>;
  finalizarEjecucion(id: string, patch: FinalizarEjecucionInput): Promise<void>;
  /** Resuelve o crea la fila de incideas_fuentes; devuelve su id si existe. */
  resolverFuente?(fuenteNombre: string): Promise<string | undefined>;
}

export interface RunnerResultado {
  ejecucion_id: string;
  conector: string;
  estado: "completada" | "parcial" | "fallida";
  leidos: number;
  counts: UpsertCounts;
  duplicados: ReturnType<typeof detectarDuplicados>;
  boundary?: GeoJSON.Geometry | null;
  errores: string[];
}

export async function ejecutarConector(
  connector: Connector,
  deps: RunnerDeps,
  args: {
    codigoINE: string;
    boundary?: GeoJSON.Geometry | null;
    parametros?: Record<string, unknown>;
    usuario?: string;
  }
): Promise<RunnerResultado> {
  const fechaInicio = new Date().toISOString();
  const idFuente = deps.resolverFuente
    ? await deps.resolverFuente(connector.fuente.nombre)
    : undefined;

  const ejecucionId = await deps.iniciarEjecucion({
    conector: connector.id,
    version_conector: connector.version,
    codigo_ine: args.codigoINE,
    categoria: connector.categoria,
    id_fuente: idFuente,
    parametros: args.parametros ?? {},
  });

  let boundary = args.boundary ?? null;
  let errores: string[] = [];
  let leidos = 0;
  const counts: UpsertCounts = {
    insertados: 0,
    actualizados: 0,
    sin_cambios: 0,
    posibles_bajas: 0,
    rechazados: 0,
    errores: [],
    claves_vistas: [],
  };
  let duplicados: ReturnType<typeof detectarDuplicados> = [];

  try {
    const res = await connector.ejecutar({
      codigoINE: args.codigoINE,
      boundary,
      parametros: args.parametros,
    });
    errores = [...res.errores];
    leidos = res.features.length;
    if (res.boundary) boundary = res.boundary;

    const ctx: EjecucionContext = {
      id: ejecucionId,
      conector: connector.id,
      version_conector: connector.version,
      codigo_ine: args.codigoINE,
      categoria: connector.categoria,
      fuente: connector.fuente,
      parametros: args.parametros ?? {},
    };

    const normalized = res.features.map((raw) => {
      const rec = normalizeFeature(raw, {
        codigoINE: args.codigoINE,
        estadoValidacion: "automatico_sin_revisar",
        nivelAutomatizacion: connector.nivelAutomatizacion,
        visibilidad: connector.visibilidad,
      });
      const val = validarEspacial(rec.coordenadas, boundary);
      rec.estado_espacial = val.estado;
      if (val.estado !== "valido" && val.motivo) {
        rec.observaciones = val.motivo;
      }
      return rec;
    });

    const upsert = await procesarLote(deps.store, ctx, normalized, {
      permitirBajas: !res.parcial,
      usuario: args.usuario ?? `conector:${connector.id}`,
    });
    Object.assign(counts, upsert);

    const candidatos: CandidatoDedup[] = normalized.map((r, i) => ({
      id: upsert.claves_vistas[i] ?? r.huella,
      nombre_normalizado: r.nombre_normalizado,
      categoria: r.categoria,
      fuente: r.fuente_principal,
      id_origen: r.id_origen ?? null,
      telefono_normalizado: r.telefono_normalizado ?? null,
      coordenadas: r.coordenadas ?? null,
    }));
    duplicados = detectarDuplicados(candidatos);

    const estado: RunnerResultado["estado"] = res.parcial ? "parcial" : "completada";
    await deps.finalizarEjecucion(ejecucionId, {
      estado,
      fecha_fin: new Date().toISOString(),
      registros_leidos: leidos,
      registros_insertados: counts.insertados,
      registros_actualizados: counts.actualizados,
      registros_sin_cambios: counts.sin_cambios,
      posibles_bajas: counts.posibles_bajas,
      registros_rechazados: counts.rechazados,
      errores,
      resumen_calidad: {
        duplicados_detectados: duplicados.length,
        estados_espaciales: resumirEstadosEspaciales(normalized),
        fecha_inicio: fechaInicio,
      },
    });

    return {
      ejecucion_id: ejecucionId,
      conector: connector.id,
      estado,
      leidos,
      counts,
      duplicados,
      boundary,
      errores,
    };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    errores.push(mensaje);
    await deps.finalizarEjecucion(ejecucionId, {
      estado: "fallida",
      fecha_fin: new Date().toISOString(),
      registros_leidos: leidos,
      registros_insertados: counts.insertados,
      registros_actualizados: counts.actualizados,
      registros_sin_cambios: counts.sin_cambios,
      posibles_bajas: counts.posibles_bajas,
      registros_rechazados: counts.rechazados,
      errores,
      resumen_calidad: { fecha_inicio: fechaInicio },
    });
    return {
      ejecucion_id: ejecucionId,
      conector: connector.id,
      estado: "fallida",
      leidos,
      counts,
      duplicados,
      boundary,
      errores,
    };
  }
}

function resumirEstadosEspaciales(
  records: { estado_espacial?: string }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    const k = r.estado_espacial ?? "desconocido";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
