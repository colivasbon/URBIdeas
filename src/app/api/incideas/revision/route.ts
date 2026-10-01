import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseServerSafe } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const REVIEW_TOKEN_HEADER = "x-review-token";

const ACCIONES_VALIDAS = new Set([
  "validar",
  "validar_ayuntamiento",
  "marcar_conflictivo",
  "marcar_pendiente",
  "marcar_obsoleto",
  "aceptar_valor",
  "rechazar_valor",
  "corregir_categoria",
  "corregir_geometria",
  "observar",
  "confirmar_baja",
]);

/** Campos que un revisor puede editar directamente. */
const CAMPOS_EDITABLES = new Set([
  "nombre_oficial",
  "subcategoria",
  "direccion",
  "telefono_publico",
  "web",
  "horario",
  "capacidad",
  "aforo",
  "titularidad",
  "gestor",
  "coordenadas",
  "geometria",
  "observaciones",
]);

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface RevisionBody {
  registro_id: string;
  accion: string;
  campo?: string;
  valor_nuevo?: unknown;
  unidad_validadora?: string;
  observaciones?: string;
  usuario?: string;
}

function parseBody(body: unknown): RevisionBody | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Body inválido" };
  const b = body as Record<string, unknown>;
  if (typeof b.registro_id !== "string") return { error: "registro_id requerido" };
  if (typeof b.accion !== "string" || !ACCIONES_VALIDAS.has(b.accion)) {
    return { error: "accion no válida" };
  }
  return {
    registro_id: b.registro_id,
    accion: b.accion,
    campo: typeof b.campo === "string" ? b.campo : undefined,
    valor_nuevo: b.valor_nuevo,
    unidad_validadora: typeof b.unidad_validadora === "string" ? b.unidad_validadora : undefined,
    observaciones: typeof b.observaciones === "string" ? b.observaciones : undefined,
    usuario: typeof b.usuario === "string" ? b.usuario : undefined,
  };
}

/**
 * GET /api/incideas/revision?codigo_ine=03031 — conteos por bandeja de revisión.
 * Lectura pública agregada (no expone datos restringidos, solo recuentos).
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerSafe();
  if (!supabase) {
    return NextResponse.json({ data: null, error: "Servicio no configurado" }, { status: 503 });
  }
  const codigoINE = request.nextUrl.searchParams.get("codigo_ine");
  if (!codigoINE || !/^\d{5}$/.test(codigoINE)) {
    return NextResponse.json({ data: null, error: "codigo_ine de 5 dígitos requerido" }, { status: 400 });
  }

  const base = () =>
    supabase
      .from("incideas_registros")
      .select("*", { count: "exact", head: true })
      .eq("codigo_ine", codigoINE)
      .is("eliminado_en", null)
      .not("visibilidad", "in", "(restringida,personal_protegida)");

  const [total, sinRevisar, sinCoords, fuera, proximo, duplicados, conflictivos, desactualizados, incompletos] =
    await Promise.all([
      base(),
      base().eq("estado_validacion", "automatico_sin_revisar"),
      base().is("coordenadas", null),
      base().eq("estado_espacial", "fuera_municipio"),
      base().eq("estado_espacial", "proximo_limite"),
      base().eq("posible_duplicado", true),
      base().eq("estado_validacion", "conflictivo"),
      base().not("desactualizado_desde", "is", null),
      base().eq("estado_validacion", "incompleto"),
    ]);

  const valor = (r: { count: number | null }) => r.count ?? 0;
  return NextResponse.json({
    data: {
      total: valor(total),
      sin_revisar: valor(sinRevisar),
      sin_coords: valor(sinCoords),
      fuera: valor(fuera),
      proximo: valor(proximo),
      duplicados: valor(duplicados),
      conflictivos: valor(conflictivos),
      desactualizados: valor(desactualizados),
      incompletos: valor(incompletos),
    },
    error: null,
  });
}

/**
 * POST /api/incideas/revision — acción de revisión humana con trazabilidad.
 * Protegido con INCIDEAS_REVIEW_TOKEN (cabecera x-review-token).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.INCIDEAS_REVIEW_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { data: null, error: "Revisión no configurada en este entorno" },
      { status: 503 }
    );
  }
  if (!tokenMatches(request.headers.get(REVIEW_TOKEN_HEADER), expected)) {
    return NextResponse.json({ data: null, error: "No autorizado" }, { status: 401 });
  }

  const supabase = createSupabaseServerSafe();
  if (!supabase) {
    return NextResponse.json({ data: null, error: "Servicio no configurado" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: null, error: "JSON inválido" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ data: null, error: parsed.error }, { status: 400 });
  }

  const { data: actual, error: errLectura } = await supabase
    .from("incideas_registros")
    .select("*")
    .eq("id", parsed.registro_id)
    .maybeSingle();
  if (errLectura) return NextResponse.json({ data: null, error: errLectura.message }, { status: 500 });
  if (!actual) return NextResponse.json({ data: null, error: "Registro no encontrado" }, { status: 404 });

  const ahora = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let campoHistorial: string | undefined;
  let valorAnterior: string | null = null;
  let valorNuevo: string | null = null;

  switch (parsed.accion) {
    case "validar":
      patch.estado_validacion = "validado_tecnicamente";
      patch.fecha_validacion = ahora;
      patch.unidad_validadora = parsed.unidad_validadora ?? actual.unidad_validadora ?? null;
      break;
    case "validar_ayuntamiento":
      patch.estado_validacion = "validado_ayuntamiento";
      patch.fecha_validacion = ahora;
      patch.unidad_validadora = parsed.unidad_validadora ?? actual.unidad_validadora ?? null;
      break;
    case "marcar_conflictivo":
      patch.estado_validacion = "conflictivo";
      break;
    case "marcar_pendiente":
      patch.estado_validacion = "pendiente_municipal";
      break;
    case "marcar_obsoleto":
      patch.estado_validacion = "potencialmente_obsoleto";
      break;
    case "confirmar_baja":
      patch.eliminado_en = ahora;
      patch.motivo_baja = parsed.observaciones ?? "Baja confirmada por revisor";
      break;
    case "observar":
      patch.observaciones = parsed.observaciones ?? actual.observaciones ?? null;
      campoHistorial = "observaciones";
      valorAnterior = actual.observaciones ?? null;
      valorNuevo = parsed.observaciones ?? null;
      break;
    case "aceptar_valor":
    case "corregir_categoria":
    case "corregir_geometria": {
      const campo =
        parsed.accion === "corregir_categoria" ? "categoria" : parsed.campo;
      if (!campo) {
        return NextResponse.json({ data: null, error: "campo requerido" }, { status: 400 });
      }
      const permitido = campo === "categoria" || CAMPOS_EDITABLES.has(campo);
      if (!permitido) {
        return NextResponse.json({ data: null, error: `campo no editable: ${campo}` }, { status: 400 });
      }
      let valor = parsed.valor_nuevo;
      if ((campo === "coordenadas" || campo === "geometria") && typeof valor === "string") {
        try {
          valor = JSON.parse(valor);
        } catch {
          return NextResponse.json(
            { data: null, error: "valor_nuevo no es JSON válido para geometría/coordenadas" },
            { status: 400 }
          );
        }
      }
      patch[campo] = valor;
      campoHistorial = campo;
      valorAnterior = actual[campo] === undefined || actual[campo] === null ? null : JSON.stringify(actual[campo]);
      valorNuevo = valor === undefined || valor === null ? null : JSON.stringify(valor);
      break;
    }
    case "rechazar_valor":
      campoHistorial = parsed.campo;
      valorAnterior = parsed.campo ? JSON.stringify(actual[parsed.campo] ?? null) : null;
      valorNuevo = parsed.valor_nuevo !== undefined ? JSON.stringify(parsed.valor_nuevo) : null;
      break;
  }

  patch.actualizado_en = ahora;
  patch.actualizado_por = parsed.usuario ?? "revision";

  const { data: actualizado, error: errUpdate } = await supabase
    .from("incideas_registros")
    .update(patch)
    .eq("id", parsed.registro_id)
    .select("*")
    .single();
  if (errUpdate) return NextResponse.json({ data: null, error: errUpdate.message }, { status: 500 });

  await supabase.from("incideas_revisiones").insert({
    registro_id: parsed.registro_id,
    accion: parsed.accion,
    campo: campoHistorial ?? null,
    valor_anterior: valorAnterior,
    valor_nuevo: valorNuevo,
    unidad_validadora: parsed.unidad_validadora ?? null,
    usuario: parsed.usuario ?? "revision",
    observaciones: parsed.observaciones ?? null,
  });

  await supabase.from("incideas_historial").insert({
    registro_id: parsed.registro_id,
    accion: parsed.accion,
    campo: campoHistorial ?? null,
    valor_anterior: valorAnterior,
    valor_nuevo: valorNuevo,
    usuario: parsed.usuario ?? "revision",
    unidad_validadora: parsed.unidad_validadora ?? null,
    observaciones: parsed.observaciones ?? null,
  });

  return NextResponse.json({ data: actualizado, error: null });
}
