import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerSafe } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/incideas/registros — consulta de registros de un municipio.
 *
 * Lectura pública: NUNCA devuelve registros con visibilidad restringida o
 * personal_protegida. Filtros: categoria, estado, fuente, estado_espacial,
 * q, vista y paginación.
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerSafe();
  if (!supabase) {
    return NextResponse.json({ data: null, error: "Servicio no configurado" }, { status: 503 });
  }

  const sp = request.nextUrl.searchParams;
  const codigoINE = sp.get("codigo_ine");
  if (!codigoINE || !/^\d{5}$/.test(codigoINE)) {
    return NextResponse.json({ data: null, error: "codigo_ine de 5 dígitos requerido" }, { status: 400 });
  }

  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  let query = supabase
    .from("incideas_registros")
    .select("*", { count: "exact" })
    .eq("codigo_ine", codigoINE)
    .is("eliminado_en", null)
    .not("visibilidad", "in", "(restringida,personal_protegida)");

  const categoria = sp.get("categoria");
  if (categoria) query = query.eq("categoria", categoria);

  const estado = sp.get("estado");
  if (estado) query = query.eq("estado_validacion", estado);

  const fuente = sp.get("fuente");
  if (fuente) query = query.eq("fuente_principal", fuente);

  const estadoEspacial = sp.get("estado_espacial");
  if (estadoEspacial) query = query.eq("estado_espacial", estadoEspacial);

  const q = sp.get("q");
  if (q) query = query.ilike("nombre_normalizado", `%${q.toLowerCase()}%`);

  switch (sp.get("vista")) {
    case "sin_coords":
      query = query.is("coordenadas", null);
      break;
    case "fuera":
      query = query.eq("estado_espacial", "fuera_municipio");
      break;
    case "proximo":
      query = query.eq("estado_espacial", "proximo_limite");
      break;
    case "duplicados":
      query = query.eq("posible_duplicado", true);
      break;
    case "desactualizados":
      query = query.not("desactualizado_desde", "is", null);
      break;
    case "conflictivos":
      query = query.eq("estado_validacion", "conflictivo");
      break;
    case "sin_revisar":
      query = query.eq("estado_validacion", "automatico_sin_revisar");
      break;
    case "restringidos":
      return NextResponse.json(
        { data: null, error: "Los registros restringidos requieren acceso técnico" },
        { status: 403 }
      );
  }

  query = query.order("nombre_oficial", { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, limit, offset });
}
