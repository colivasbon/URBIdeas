import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codigoINE = searchParams.get("codigo_ine");
  const categoria = searchParams.get("categoria");
  const formato = searchParams.get("formato") ?? "json";

  if (!codigoINE) {
    return NextResponse.json({ error: "codigo_ine es requerido" }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  let query = supabase
    .from("incideas_registros")
    .select("*")
    .eq("codigo_ine", codigoINE);

  if (categoria) {
    query = query.eq("categoria", categoria);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Error al obtener registros" }, { status: 500 });
  }

  if (formato === "csv") {
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No hay registros para exportar" }, { status: 404 });
    }

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((r) =>
      Object.values(r)
        .map((v) => `"${v ?? ""}"`)
        .join(",")
    );
    const csv = [headers, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="incideas_${codigoINE}_${categoria ?? "todos"}.csv"`,
      },
    });
  }

  return NextResponse.json({
    codigo_ine: codigoINE,
    categoria: categoria ?? "todos",
    total: data?.length ?? 0,
    registros: data ?? [],
  });
}
